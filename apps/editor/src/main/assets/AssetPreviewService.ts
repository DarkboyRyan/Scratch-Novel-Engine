import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import {
  lstat,
  open,
  realpath,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Protocol } from 'electron';

import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { AssetDocument } from '../../shared/projectTypes';

export const ASSET_PREVIEW_SCHEME = 'vn-asset';

const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PREVIEW_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_PREVIEW_AUDIO_BYTES = 512 * 1024 * 1024;
const MAX_PROJECT_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const MAGIC_BYTE_COUNT = 12;
// Keep media probing aligned with the C++ importer so every accepted MP4/WebM
// can also be validated again before it is exposed through vn-asset://.
const MEDIA_MAGIC_BYTE_COUNT = 4096;

type PrivateAssetRecord = AssetDocument & {
  relativePath: string;
};

export type PreparedAssetPreviewProject = {
  projectFilePath: string;
  projectRootPath: string;
  projectId: string;
  assets: Map<string, PrivateAssetRecord>;
  // Main passes these exact, already-stabilized bytes to C++. This prevents
  // the preview manifest and authoritative Project from coming from two
  // different reads of a file that changed between operations.
  manifestContents: string;
};

type ActiveAssetPreviewProject = PreparedAssetPreviewProject & {
  generationToken: string;
  previewTokensByAssetId: Map<string, string>;
  assetIdsByPreviewToken: Map<string, string>;
};

type ProtocolRegistrar = Pick<Protocol, 'handle' | 'unhandle'>;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
type AudioMime = 'audio/mpeg' | 'audio/ogg' | 'audio/wav';
type VideoMime = 'video/mp4' | 'video/webm';
type PreviewMime = ImageMime | AudioMime | VideoMime;

type ByteRange = {
  start: number;
  end: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPublicAssetType(
  value: unknown,
): value is AssetDocument['type'] {
  return value === 'image' || value === 'video' || value === 'audio';
}

function isOpaqueAssetId(value: string): boolean {
  // Core's persisted invariant is only "non-empty". The ID remains a Map key
  // and is never interpolated into a path or URL, so preserving arbitrary
  // valid legacy IDs is both compatible and safe.
  return value.length > 0;
}

function isSafeImportedAssetId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function expectedAssetDirectory(type: AssetDocument['type']): string {
  switch (type) {
    case 'image':
      return 'images';
    case 'video':
      return 'videos';
    case 'audio':
      return 'audio';
  }
}

function validateRelativeAssetPath(
  type: AssetDocument['type'],
  relativePath: string,
): void {
  const prefix = `assets/${expectedAssetDirectory(type)}/`;
  const components = relativePath.split('/');

  if (
    !relativePath.startsWith(prefix) ||
    relativePath.length <= prefix.length ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    components.some(
      (component) =>
        component.length === 0 ||
        component === '.' ||
        component === '..',
    )
  ) {
    throw new Error('项目资源清单包含不安全的相对路径');
  }
}

function parsePrivateManifest(
  contents: string,
  projectFilePath: string,
  projectRootPath: string,
): PreparedAssetPreviewProject {
  const document = JSON.parse(contents) as unknown;

  if (
    !isObject(document) ||
    document.format !== 'vn-engine-project' ||
    !isObject(document.project) ||
    typeof document.project.id !== 'string' ||
    !Array.isArray(document.assets)
  ) {
    throw new Error('项目文件不包含有效的资源清单');
  }

  const assets = new Map<string, PrivateAssetRecord>();
  for (const value of document.assets) {
    if (
      !isObject(value) ||
      typeof value.id !== 'string' ||
      !isOpaqueAssetId(value.id) ||
      !isPublicAssetType(value.type) ||
      typeof value.displayName !== 'string' ||
      typeof value.relativePath !== 'string'
    ) {
      throw new Error('项目文件包含无效的资源记录');
    }
    if (assets.has(value.id)) {
      throw new Error('项目文件包含重复的资源 ID');
    }

    validateRelativeAssetPath(value.type, value.relativePath);
    assets.set(value.id, {
      id: value.id,
      type: value.type,
      displayName: value.displayName,
      relativePath: value.relativePath,
    });
  }

  return {
    projectFilePath,
    projectRootPath,
    projectId: document.project.id,
    assets,
    manifestContents: contents,
  };
}

function sameFileSnapshot(
  left: Stats,
  right: Stats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.mode === right.mode &&
    left.nlink === right.nlink
  );
}

async function readStableProjectFile(filePath: string): Promise<string> {
  const before = await lstat(filePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size > MAX_PROJECT_FILE_BYTES
  ) {
    throw new Error('项目文件不是可安全读取的常规文件');
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.nlink !== 1 ||
        !sameFileSnapshot(before, opened)) {
      throw new Error('项目文件在读取前发生了变化');
    }

    const contents = await file.readFile({ encoding: 'utf8' });
    const after = await file.stat();
    if (!sameFileSnapshot(opened, after)) {
      throw new Error('项目文件在读取时发生了变化');
    }
    return contents;
  } finally {
    await file.close();
  }
}

function manifestMatchesResult(
  prepared: PreparedAssetPreviewProject,
  result: EngineMutationResult,
): boolean {
  if (
    prepared.projectId !== result.project.id ||
    prepared.assets.size !== result.assets.length
  ) {
    return false;
  }

  return result.assets.every((asset) => {
    const privateAsset = prepared.assets.get(asset.id);
    return (
      privateAsset?.type === asset.type &&
      privateAsset.displayName === asset.displayName
    );
  });
}

function canonicalAssetExtension(
  type: AssetDocument['type'],
  sourceFilePath: string,
): string | null {
  const extension = path.extname(sourceFilePath).toLowerCase();
  if (type === 'image') {
    switch (extension) {
      case '.png':
        return '.png';
      case '.jpg':
      case '.jpeg':
        return '.jpg';
      case '.webp':
        return '.webp';
      default:
        return null;
    }
  }

  if (type === 'video' && (extension === '.mp4' || extension === '.webm')) {
    return extension;
  }

  if (
    type === 'audio' &&
    (extension === '.mp3' || extension === '.wav' || extension === '.ogg')
  ) {
    return extension;
  }

  return null;
}

function imageMimeForPath(relativePath: string): ImageMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return null;
  }
}

function audioMimeForPath(relativePath: string): AudioMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    default:
      return null;
  }
}

function videoMimeForPath(relativePath: string): VideoMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return null;
  }
}

function magicMatches(mime: ImageMime, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'image/png':
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case 'image/jpeg':
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
      );
  }
}

async function readBytes(
  file: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await file.read(bytes, 0, length, position);
  return bytes.subarray(0, bytesRead);
}

function syncSafeInteger(bytes: Buffer, offset: number): number | null {
  if (offset + 4 > bytes.length) {
    return null;
  }
  let value = 0;
  for (let index = offset; index < offset + 4; index += 1) {
    if ((bytes[index] & 0x80) !== 0) {
      return null;
    }
    value = value * 128 + bytes[index];
  }
  return value;
}

const MPEG1_LAYER1_BITRATES = [
  0, 32, 64, 96, 128, 160, 192, 224,
  256, 288, 320, 352, 384, 416, 448,
];
const MPEG1_LAYER2_BITRATES = [
  0, 32, 48, 56, 64, 80, 96, 112,
  128, 160, 192, 224, 256, 320, 384,
];
const MPEG1_LAYER3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96,
  112, 128, 160, 192, 224, 256, 320,
];
const MPEG2_LAYER1_BITRATES = [
  0, 32, 48, 56, 64, 80, 96, 112,
  128, 144, 160, 176, 192, 224, 256,
];
const MPEG2_LAYER23_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56,
  64, 80, 96, 112, 128, 144, 160,
];

function mpegFrameLength(header: Buffer): number | null {
  if (
    header.length < 4 ||
    header[0] !== 0xff ||
    (header[1] & 0xe0) !== 0xe0
  ) {
    return null;
  }

  const versionBits = (header[1] >> 3) & 0x03;
  const layerBits = (header[1] >> 1) & 0x03;
  const bitrateIndex = (header[2] >> 4) & 0x0f;
  const sampleRateIndex = (header[2] >> 2) & 0x03;
  if (
    versionBits === 1 ||
    layerBits === 0 ||
    bitrateIndex === 0 ||
    bitrateIndex === 15 ||
    sampleRateIndex === 3
  ) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  let bitrateTable: number[];
  if (isMpeg1) {
    bitrateTable = layerBits === 3
      ? MPEG1_LAYER1_BITRATES
      : layerBits === 2
        ? MPEG1_LAYER2_BITRATES
        : MPEG1_LAYER3_BITRATES;
  } else {
    bitrateTable = layerBits === 3
      ? MPEG2_LAYER1_BITRATES
      : MPEG2_LAYER23_BITRATES;
  }
  const bitrate = bitrateTable[bitrateIndex] * 1000;
  const baseSampleRates = [44_100, 48_000, 32_000];
  const versionDivisor = versionBits === 3
    ? 1
    : versionBits === 2
      ? 2
      : 4;
  const sampleRate = baseSampleRates[sampleRateIndex] / versionDivisor;
  const padding = (header[2] >> 1) & 0x01;

  if (layerBits === 3) {
    return Math.floor((12 * bitrate) / sampleRate + padding) * 4;
  }
  const coefficient = layerBits === 1 && !isMpeg1 ? 72 : 144;
  return Math.floor((coefficient * bitrate) / sampleRate) + padding;
}

async function mp3MagicMatches(
  file: FileHandle,
  fileSize: number,
): Promise<boolean> {
  const beginning = await readBytes(file, 0, 10);
  let audioOffset = 0;
  if (beginning.length >= 10 && beginning.toString('ascii', 0, 3) === 'ID3') {
    const majorVersion = beginning[3];
    const flags = beginning[5];
    const tagSize = syncSafeInteger(beginning, 6);
    const reservedFlagMask = majorVersion === 2
      ? 0x3f
      : majorVersion === 3
        ? 0x1f
        : 0x0f;
    if (
      tagSize === null ||
      majorVersion < 2 ||
      majorVersion > 4 ||
      beginning[4] === 0xff ||
      (flags & reservedFlagMask) !== 0
    ) {
      return false;
    }
    const footerBytes = majorVersion === 4 && (flags & 0x10) !== 0
      ? 10
      : 0;
    audioOffset = 10 + tagSize + footerBytes;
  }
  if (audioOffset + 4 > fileSize) {
    return false;
  }

  const scanLength = Math.min(64 * 1024, fileSize - audioOffset);
  const bytes = await readBytes(file, audioOffset, scanLength);
  let frameOffset = 0;
  while (frameOffset < bytes.length && bytes[frameOffset] === 0) {
    frameOffset += 1;
  }
  const frameLength = mpegFrameLength(
    bytes.subarray(frameOffset, frameOffset + 4),
  );
  return (
    frameLength !== null &&
    frameLength >= 24 &&
    audioOffset + frameOffset + frameLength <= fileSize
  );
}

async function wavMagicMatches(
  file: FileHandle,
  fileSize: number,
): Promise<boolean> {
  const header = await readBytes(file, 0, 12);
  const riffEnd = header.length === 12
    ? header.readUInt32LE(4) + 8
    : 0;
  if (
    header.length !== 12 ||
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WAVE' ||
    riffEnd < 36 ||
    riffEnd > fileSize
  ) {
    return false;
  }

  let offset = 12;
  let foundFormat = false;
  let foundData = false;
  for (let chunkCount = 0; chunkCount < 1024; chunkCount += 1) {
    if (offset + 8 > riffEnd) {
      break;
    }
    const chunkHeader = await readBytes(file, offset, 8);
    if (chunkHeader.length !== 8) {
      return false;
    }
    const chunkId = chunkHeader.toString('ascii', 0, 4);
    const chunkSize = chunkHeader.readUInt32LE(4);
    const dataOffset = offset + 8;
    if (chunkSize > riffEnd - dataOffset) {
      return false;
    }

    if (chunkId === 'fmt ') {
      if (foundFormat || chunkSize < 16 || chunkSize > 1024) {
        return false;
      }
      const format = await readBytes(file, dataOffset, 16);
      const formatTag = format.length === 16
        ? format.readUInt16LE(0)
        : 0;
      if (
        format.length !== 16 ||
        ![1, 3, 6, 7, 0xfffe].includes(formatTag) ||
        format.readUInt16LE(2) === 0 ||
        format.readUInt32LE(4) === 0 ||
        format.readUInt32LE(8) === 0 ||
        format.readUInt16LE(12) === 0 ||
        format.readUInt16LE(14) === 0
      ) {
        return false;
      }
      foundFormat = true;
    } else if (chunkId === 'data') {
      if (chunkSize === 0) {
        return false;
      }
      foundData = true;
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
    if (offset > riffEnd) {
      return false;
    }
    if (foundFormat && foundData) {
      return true;
    }
  }
  return false;
}

async function oggMagicMatches(
  file: FileHandle,
  fileSize: number,
): Promise<boolean> {
  const pageHeader = await readBytes(file, 0, 27);
  if (
    pageHeader.length !== 27 ||
    pageHeader.toString('ascii', 0, 4) !== 'OggS' ||
    pageHeader[4] !== 0 ||
    (pageHeader[5] & 0x02) === 0 ||
    pageHeader.readUInt32LE(18) !== 0
  ) {
    return false;
  }
  const segmentCount = pageHeader[26];
  if (segmentCount === 0 || 27 + segmentCount > fileSize) {
    return false;
  }
  const lacing = await readBytes(file, 27, segmentCount);
  let packetLength = 0;
  let packetComplete = false;
  for (const segmentLength of lacing) {
    packetLength += segmentLength;
    if (segmentLength < 255) {
      packetComplete = true;
      break;
    }
  }
  const packetOffset = 27 + segmentCount;
  if (
    !packetComplete ||
    packetLength === 0 ||
    packetOffset + packetLength > fileSize
  ) {
    return false;
  }
  const packet = await readBytes(file, packetOffset, packetLength);
  if (
    packet.length >= 19 &&
    packet.toString('ascii', 0, 8) === 'OpusHead'
  ) {
    return (
      packet[8] > 0 &&
      (packet[8] & 0xf0) === 0 &&
      packet[9] > 0
    );
  }
  return (
    packet.length >= 30 &&
    packet[0] === 0x01 &&
    packet.toString('ascii', 1, 7) === 'vorbis' &&
    packet.readUInt32LE(7) === 0 &&
    packet[11] > 0 &&
    packet.readUInt32LE(12) > 0 &&
    (packet[29] & 0x01) === 1
  );
}

async function audioMagicMatches(
  file: FileHandle,
  mime: AudioMime,
  fileSize: number,
): Promise<boolean> {
  switch (mime) {
    case 'audio/mpeg':
      return mp3MagicMatches(file, fileSize);
    case 'audio/wav':
      return wavMagicMatches(file, fileSize);
    case 'audio/ogg':
      return oggMagicMatches(file, fileSize);
  }
}

const MP4_VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'avc2',
  'dash',
  'M4V ',
  'MSNV',
  '3gp4',
]);

function mp4MagicMatches(bytes: Buffer, fileSize: number): boolean {
  if (bytes.length < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp') {
    return false;
  }
  const shortBoxSize = bytes.readUInt32BE(0);
  let boxSize = shortBoxSize;
  let brandOffset = 8;
  if (shortBoxSize === 1) {
    if (bytes.length < 24) {
      return false;
    }
    const extended = bytes.readBigUInt64BE(8);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) {
      return false;
    }
    boxSize = Number(extended);
    brandOffset = 16;
  }
  if (boxSize < brandOffset + 8 || boxSize > fileSize) {
    return false;
  }
  const compatibleBytes = boxSize - (brandOffset + 8);
  if (compatibleBytes % 4 !== 0) {
    return false;
  }
  let foundVideoBrand = MP4_VIDEO_BRANDS.has(
    bytes.toString('ascii', brandOffset, brandOffset + 4),
  );
  const end = Math.min(boxSize, bytes.length);
  for (let offset = brandOffset + 8; offset + 4 <= end; offset += 4) {
    if (
      MP4_VIDEO_BRANDS.has(
        bytes.toString('ascii', offset, offset + 4),
      )
    ) {
      foundVideoBrand = true;
    }
  }
  return foundVideoBrand;
}

function readEbmlVint(
  bytes: Buffer,
  offset: number,
  limit: number,
  keepMarker: boolean,
): { value: number; length: number } | null {
  if (offset >= limit || bytes[offset] === 0) {
    return null;
  }
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (bytes[offset] & marker) === 0) {
    marker >>= 1;
    length += 1;
  }
  if (length > 6 || offset + length > limit) {
    // Project headers never need integers wider than JS's exact range.
    return null;
  }
  let value = keepMarker ? bytes[offset] : bytes[offset] & (marker - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index];
  }
  const unknown = 2 ** (7 * length) - 1;
  return !keepMarker && value === unknown ? null : { value, length };
}

function webmMagicMatches(bytes: Buffer, fileSize: number): boolean {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x1a || bytes[1] !== 0x45 ||
    bytes[2] !== 0xdf || bytes[3] !== 0xa3
  ) {
    return false;
  }
  const headerLength = readEbmlVint(bytes, 4, bytes.length, false);
  if (!headerLength) {
    return false;
  }
  const payloadBegin = 4 + headerLength.length;
  const headerEnd = payloadBegin + headerLength.value;
  if (headerEnd > bytes.length || headerEnd > fileSize) {
    return false;
  }
  let offset = payloadBegin;
  let foundWebmDocType = false;
  while (offset < headerEnd) {
    const id = readEbmlVint(bytes, offset, headerEnd, true);
    if (!id) {
      return false;
    }
    offset += id.length;
    const elementSize = readEbmlVint(bytes, offset, headerEnd, false);
    if (!elementSize) {
      return false;
    }
    offset += elementSize.length;
    if (elementSize.value > headerEnd - offset) {
      return false;
    }
    if (id.value === 0x4282) {
      if (
        foundWebmDocType ||
        elementSize.value !== 4 ||
        bytes.toString('ascii', offset, offset + 4) !== 'webm'
      ) {
        return false;
      }
      foundWebmDocType = true;
    }
    offset += elementSize.value;
  }
  return foundWebmDocType && offset === headerEnd;
}

async function validatePreparedAssetFile(
  projectRootPath: string,
  asset: PrivateAssetRecord,
): Promise<void> {
  const safeAsset = await assertSafeAssetFile(
    projectRootPath,
    asset.relativePath,
  );
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(safeAsset.filePath, constants.O_RDONLY | noFollow);
  try {
    const status = await file.stat();
    const maximumBytes = asset.type === 'video'
      ? MAX_PROJECT_VIDEO_BYTES
      : asset.type === 'audio'
        ? MAX_PREVIEW_AUDIO_BYTES
        : MAX_PREVIEW_IMAGE_BYTES;
    if (
      !sameFileSnapshot(safeAsset.snapshot, status) ||
      !status.isFile() || status.nlink !== 1 ||
      status.size <= 0 || status.size > maximumBytes
    ) {
      throw new Error('项目资源不是有效的常规文件');
    }
    const header = Buffer.alloc(MEDIA_MAGIC_BYTE_COUNT);
    const { bytesRead } = await file.read(
      header, 0, MEDIA_MAGIC_BYTE_COUNT, 0,
    );
    const bytes = header.subarray(0, bytesRead);
    const extension = path.posix.extname(asset.relativePath).toLowerCase();
    let valid = false;
    if (asset.type === 'image') {
      const mime = imageMimeForPath(asset.relativePath);
      valid = mime !== null && magicMatches(mime, bytes);
    } else if (asset.type === 'video') {
      valid = extension === '.mp4'
        ? mp4MagicMatches(bytes, status.size)
        : extension === '.webm' && webmMagicMatches(bytes, status.size);
    } else {
      const mime = audioMimeForPath(asset.relativePath);
      valid = mime !== null && await audioMagicMatches(
        file,
        mime,
        status.size,
      );
    }
    if (!valid || !sameFileSnapshot(status, await file.stat())) {
      throw new Error('项目资源类型与文件内容不一致');
    }
  } finally {
    await file.close();
  }
}

function unavailableResponse(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function rangeNotSatisfiableResponse(fileSize: number): Response {
  return new Response(null, {
    status: 416,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${fileSize}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function parseDecimal(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseSingleByteRange(
  header: string,
  fileSize: number,
): ByteRange | null {
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (match === null || (match[1] === '' && match[2] === '')) {
    return null;
  }

  if (match[1] === '') {
    const suffixLength = parseDecimal(match[2]);
    if (suffixLength === null || suffixLength === 0) {
      return null;
    }
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    };
  }

  const start = parseDecimal(match[1]);
  const requestedEnd = match[2] === ''
    ? fileSize - 1
    : parseDecimal(match[2]);
  if (
    start === null ||
    requestedEnd === null ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

function previewMimeForAsset(
  asset: PrivateAssetRecord,
): PreviewMime | null {
  if (asset.type === 'image') {
    return imageMimeForPath(asset.relativePath);
  }
  if (asset.type === 'audio') {
    return audioMimeForPath(asset.relativePath);
  }
  return videoMimeForPath(asset.relativePath);
}

function previewHostnameForAsset(
  asset: PrivateAssetRecord,
): AssetDocument['type'] {
  return asset.type;
}

function maximumPreviewBytes(asset: PrivateAssetRecord): number {
  return asset.type === 'video'
    ? MAX_PROJECT_VIDEO_BYTES
    : asset.type === 'audio'
      ? MAX_PREVIEW_AUDIO_BYTES
      : MAX_PREVIEW_IMAGE_BYTES;
}

async function previewMagicMatches(
  file: FileHandle,
  mime: PreviewMime,
  fileSize: number,
): Promise<boolean> {
  if (
    mime === 'image/jpeg' ||
    mime === 'image/png' ||
    mime === 'image/webp'
  ) {
    const header = await readBytes(file, 0, MAGIC_BYTE_COUNT);
    return magicMatches(mime, header);
  }
  if (mime === 'video/mp4' || mime === 'video/webm') {
    const header = await readBytes(file, 0, MEDIA_MAGIC_BYTE_COUNT);
    return mime === 'video/mp4'
      ? mp4MagicMatches(header, fileSize)
      : webmMagicMatches(header, fileSize);
  }
  return audioMagicMatches(file, mime, fileSize);
}

async function assertSafeAssetFile(
  projectRootPath: string,
  relativePath: string,
): Promise<{ filePath: string; snapshot: Stats }> {
  const components = relativePath.split('/');
  let currentPath = projectRootPath;

  for (const [index, component] of components.entries()) {
    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    const isFinalComponent = index === components.length - 1;
    if (
      status.isSymbolicLink() ||
      (isFinalComponent ? !status.isFile() : !status.isDirectory())
    ) {
      throw new Error('资源路径不能包含符号链接');
    }
  }

  const resolvedRoot = await realpath(projectRootPath);
  const resolvedAsset = await realpath(currentPath);
  const containment = path.relative(resolvedRoot, resolvedAsset);
  if (
    containment === '' ||
    containment === '..' ||
    containment.startsWith(`..${path.sep}`) ||
    path.isAbsolute(containment)
  ) {
    throw new Error('资源路径逃逸了项目目录');
  }

  const snapshot = await lstat(resolvedAsset);
  if (
    snapshot.isSymbolicLink() ||
    !snapshot.isFile() ||
    snapshot.nlink !== 1
  ) {
    throw new Error('资源必须是项目内的独立常规文件');
  }

  return { filePath: resolvedAsset, snapshot };
}

function freshGenerationToken(): string {
  return randomUUID().replaceAll('-', '');
}

export class AssetPreviewService {
  private activeProject: ActiveAssetPreviewProject | null = null;
  private disposed = false;

  constructor(private readonly protocol: ProtocolRegistrar) {
    this.protocol.handle(ASSET_PREVIEW_SCHEME, (request) =>
      this.handleRequest(request),
    );
  }

  async prepareProjectFile(
    projectFilePath: string,
  ): Promise<PreparedAssetPreviewProject> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    const projectRootPath = await realpath(
      path.dirname(absoluteProjectFilePath),
    );
    const contents = await readStableProjectFile(absoluteProjectFilePath);
    const prepared = parsePrivateManifest(
      contents,
      absoluteProjectFilePath,
      projectRootPath,
    );
    // Validate sequentially so a large manifest cannot exhaust the process's
    // file descriptor limit by opening every Asset at once.
    for (const asset of prepared.assets.values()) {
      await validatePreparedAssetFile(projectRootPath, asset);
    }
    return prepared;
  }

  async validateProjectSnapshotAtRoot(
    manifestContents: string,
    projectRootPath: string,
  ): Promise<void> {
    const canonicalRootPath = await realpath(projectRootPath);
    const prepared = parsePrivateManifest(
      manifestContents,
      path.join(canonicalRootPath, 'project.vn.json'),
      canonicalRootPath,
    );
    for (const asset of prepared.assets.values()) {
      await validatePreparedAssetFile(canonicalRootPath, asset);
    }
  }

  async activateProjectFile(
    projectFilePath: string,
    result: EngineMutationResult,
    prepared?: PreparedAssetPreviewProject | null,
    rotateGeneration = false,
  ): Promise<boolean> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    let candidate = prepared ?? null;

    if (
      candidate === null ||
      candidate.projectFilePath !== absoluteProjectFilePath
    ) {
      try {
        candidate = await this.prepareProjectFile(
          absoluteProjectFilePath,
        );
      } catch {
        candidate = null;
      }
    }

    if (candidate === null || !manifestMatchesResult(candidate, result)) {
      this.activeProject = null;
      return false;
    }

    const previous = this.activeProject;
    const canReuseGeneration =
      !rotateGeneration &&
      previous?.projectFilePath === candidate.projectFilePath &&
      previous.projectId === candidate.projectId;
    const generationToken = canReuseGeneration
      ? previous.generationToken
      : freshGenerationToken();
    const previewTokensByAssetId = new Map<string, string>();
    const assetIdsByPreviewToken = new Map<string, string>();

    if (canReuseGeneration) {
      for (const asset of candidate.assets.values()) {
        const previewToken = previous.previewTokensByAssetId.get(
          asset.id,
        );
        if (
          previewToken &&
          (asset.type === 'image' ||
            asset.type === 'audio' ||
            asset.type === 'video')
        ) {
          previewTokensByAssetId.set(asset.id, previewToken);
          assetIdsByPreviewToken.set(previewToken, asset.id);
        }
      }
    }

    this.activeProject = {
      ...candidate,
      generationToken,
      previewTokensByAssetId,
      assetIdsByPreviewToken,
    };
    return true;
  }

  async activateTemporaryProject(
    projectFilePath: string,
    result: EngineMutationResult,
  ): Promise<boolean> {
    const absoluteProjectFilePath = path.resolve(projectFilePath);
    const active = this.activeProject;
    if (
      active?.projectFilePath === absoluteProjectFilePath &&
      active.projectId === result.project.id
    ) {
      const matches = result.assets.length === active.assets.size &&
        result.assets.every((asset) => {
        const privateAsset = active.assets.get(asset.id);
        return (
          privateAsset?.type === asset.type &&
          privateAsset.displayName === asset.displayName
        );
      });
      if (!matches) {
        // A stale private map must not keep old capability URLs alive after
        // the authoritative C++ Asset set has changed.
        this.activeProject = null;
      }
      return matches;
    }

    // An unsaved project can only acquire Assets through this window's import
    // flow. If public Assets already exist but Main has no matching private
    // map, fail closed rather than inventing a disk path.
    if (result.assets.length !== 0) {
      return false;
    }

    const projectRootPath = await realpath(
      path.dirname(absoluteProjectFilePath),
    );
    this.activeProject = {
      projectFilePath: absoluteProjectFilePath,
      projectRootPath,
      projectId: result.project.id,
      assets: new Map(),
      manifestContents: '',
      generationToken: freshGenerationToken(),
      previewTokensByAssetId: new Map(),
      assetIdsByPreviewToken: new Map(),
    };
    return true;
  }

  registerImportedAsset(
    projectFilePath: string,
    sourceFilePath: string,
    result: EngineMutationResult,
  ): boolean {
    const assetId = result.assetId;
    const active = this.activeProject;
    const publicAsset = result.assets.find(
      (asset) => asset.id === assetId,
    );
    const extension = publicAsset
      ? canonicalAssetExtension(publicAsset.type, sourceFilePath)
      : null;

    if (
      active === null ||
      path.resolve(projectFilePath) !== active.projectFilePath ||
      typeof assetId !== 'string' ||
      !isSafeImportedAssetId(assetId) ||
      extension === null ||
      publicAsset === undefined
    ) {
      return false;
    }

    active.assets.set(assetId, {
      ...publicAsset,
      relativePath: `assets/${expectedAssetDirectory(
        publicAsset.type,
      )}/${assetId}${extension}`,
    });
    return true;
  }

  getPreviewUrl(assetId: string): string | null {
    const active = this.activeProject;
    if (
      active === null ||
      !isOpaqueAssetId(assetId) ||
      active.assets.get(assetId)?.type !== 'image'
    ) {
      return null;
    }

    return this.issueMediaUrl(active, assetId, 'image');
  }

  getMediaUrl(assetId: string): string | null {
    const active = this.activeProject;
    if (active === null || !isOpaqueAssetId(assetId)) {
      return null;
    }
    const asset = active.assets.get(assetId);
    const hostname = asset ? previewHostnameForAsset(asset) : null;
    if (hostname === null) {
      return null;
    }
    return this.issueMediaUrl(active, assetId, hostname);
  }

  private issueMediaUrl(
    active: ActiveAssetPreviewProject,
    assetId: string,
    hostname: AssetDocument['type'],
  ): string {
    let previewToken = active.previewTokensByAssetId.get(assetId);
    if (!previewToken) {
      previewToken = freshGenerationToken();
      active.previewTokensByAssetId.set(assetId, previewToken);
      active.assetIdsByPreviewToken.set(previewToken, assetId);
    }

    return `${ASSET_PREVIEW_SCHEME}://${hostname}/${active.generationToken}/${previewToken}`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activeProject = null;
    this.protocol.unhandle(ASSET_PREVIEW_SCHEME);
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (this.disposed) {
      return unavailableResponse();
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return unavailableResponse(405);
    }

    const active = this.activeProject;
    if (active === null) {
      return unavailableResponse();
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url);
    } catch {
      return unavailableResponse();
    }

    const pathMatch = requestUrl.pathname.match(
      /^\/([a-f0-9]{32})\/([a-f0-9]{32})$/,
    );
    if (
      requestUrl.protocol !== `${ASSET_PREVIEW_SCHEME}:` ||
      (requestUrl.hostname !== 'image' &&
        requestUrl.hostname !== 'audio' &&
        requestUrl.hostname !== 'video') ||
      requestUrl.username !== '' ||
      requestUrl.password !== '' ||
      requestUrl.port !== '' ||
      requestUrl.search !== '' ||
      requestUrl.hash !== '' ||
      pathMatch === null ||
      pathMatch[1] !== active.generationToken
    ) {
      return unavailableResponse();
    }

    const assetId = active.assetIdsByPreviewToken.get(pathMatch[2]);
    if (assetId === undefined) {
      return unavailableResponse();
    }

    const asset = active.assets.get(assetId);
    const mime = asset ? previewMimeForAsset(asset) : null;
    const expectedHostname = asset
      ? previewHostnameForAsset(asset)
      : null;
    if (
      !isOpaqueAssetId(assetId) ||
      asset === undefined ||
      expectedHostname === null ||
      requestUrl.hostname !== expectedHostname ||
      mime === null
    ) {
      return unavailableResponse();
    }

    try {
      const safeAsset = await assertSafeAssetFile(
        active.projectRootPath,
        asset.relativePath,
      );
      const noFollow = constants.O_NOFOLLOW ?? 0;
      const file = await open(
        safeAsset.filePath,
        constants.O_RDONLY | noFollow,
      );

      try {
        const status = await file.stat();
        if (
          !sameFileSnapshot(safeAsset.snapshot, status) ||
          !status.isFile() ||
          status.nlink !== 1 ||
          status.size <= 0 ||
          status.size > maximumPreviewBytes(asset)
        ) {
          await file.close();
          return unavailableResponse();
        }

        if (!(await previewMagicMatches(file, mime, status.size))) {
          await file.close();
          return unavailableResponse();
        }

        const afterOpen = await lstat(safeAsset.filePath);
        const afterOpenRealPath = await realpath(safeAsset.filePath);
        if (
          !sameFileSnapshot(status, afterOpen) ||
          afterOpenRealPath !== safeAsset.filePath ||
          this.activeProject !== active
        ) {
          await file.close();
          return unavailableResponse();
        }

        const supportsRanges =
          asset.type === 'audio' || asset.type === 'video';
        const rangeHeader = supportsRanges
          ? request.headers.get('Range')
          : null;
        const range = rangeHeader === null
          ? null
          : parseSingleByteRange(rangeHeader, status.size);
        if (rangeHeader !== null && range === null) {
          await file.close();
          return rangeNotSatisfiableResponse(status.size);
        }
        const responseStart = range?.start ?? 0;
        const responseEnd = range?.end ?? status.size - 1;
        const contentLength = responseEnd - responseStart + 1;
        const headers: Record<string, string> = {
          'Cache-Control': 'no-store',
          'Content-Length': String(contentLength),
          'Content-Type': mime,
          'X-Content-Type-Options': 'nosniff',
        };
        if (supportsRanges) {
          headers['Accept-Ranges'] = 'bytes';
        }
        if (range !== null) {
          headers['Content-Range'] =
            `bytes ${responseStart}-${responseEnd}/${status.size}`;
        }
        const responseStatus = range === null ? 200 : 206;
        if (request.method === 'HEAD') {
          await file.close();
          return new Response(null, { status: responseStatus, headers });
        }

        // Bound the response to the exact byte range that was validated.
        // If another process grows the same inode after stat(), the stream
        // must not read past the declared Content-Length or media size cap.
        const stream = file.createReadStream({
          autoClose: true,
          start: responseStart,
          end: responseEnd,
        });
        const body = Readable.toWeb(stream) as unknown as BodyInit;
        return new Response(body, {
          status: responseStatus,
          headers,
        });
      } catch (error) {
        await file.close().catch(() => undefined);
        throw error;
      }
    } catch {
      return unavailableResponse();
    }
  }
}
