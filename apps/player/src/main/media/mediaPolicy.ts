import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';

import type { PlayerAssetType } from '../../shared/playerProtocol';

export type PlayerMediaMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'audio/wav'
  | 'video/mp4'
  | 'video/webm';

const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const MAGIC_BYTE_COUNT = 12;
// Keep Player probing aligned with the Editor and C++ importer. A single,
// already validated file handle is used for every read so the checked bytes
// cannot be swapped by resolving the path again between probes.
const MEDIA_MAGIC_BYTE_COUNT = 4096;

const MIME_BY_EXTENSION: Readonly<Record<string, PlayerMediaMime>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const MIME_TYPE: Readonly<Record<PlayerMediaMime, PlayerAssetType>> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
};

export function maximumPlayerMediaBytes(type: PlayerAssetType): number {
  if (type === 'image') {
    return MAX_IMAGE_BYTES;
  }
  return type === 'audio' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
}

export function expectedAssetDirectory(type: PlayerAssetType): string {
  if (type === 'image') {
    return 'images';
  }
  return type === 'audio' ? 'audio' : 'videos';
}

export function mimeForPlayerAsset(
  type: PlayerAssetType,
  relativePath: string,
): PlayerMediaMime | null {
  const mime = MIME_BY_EXTENSION[path.posix.extname(relativePath).toLowerCase()];
  return mime !== undefined && MIME_TYPE[mime] === type ? mime : null;
}

export function mimeMatchesAssetType(
  type: PlayerAssetType,
  mime: string,
): mime is PlayerMediaMime {
  return mime in MIME_TYPE && MIME_TYPE[mime as PlayerMediaMime] === type;
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

function hasAscii(bytes: Buffer, value: string, offset: number): boolean {
  return (
    offset + value.length <= bytes.length &&
    bytes.toString('ascii', offset, offset + value.length) === value
  );
}

function imageMagicMatches(mime: PlayerMediaMime, bytes: Buffer): boolean {
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  if (mime === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  return (
    mime === 'image/webp' &&
    bytes.length >= 12 &&
    hasAscii(bytes, 'RIFF', 0) &&
    hasAscii(bytes, 'WEBP', 8)
  );
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
  if (beginning.length >= 10 && hasAscii(beginning, 'ID3', 0)) {
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
    !hasAscii(header, 'RIFF', 0) ||
    !hasAscii(header, 'WAVE', 8) ||
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
    !hasAscii(pageHeader, 'OggS', 0) ||
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
  if (packet.length >= 19 && hasAscii(packet, 'OpusHead', 0)) {
    return packet[8] > 0 && (packet[8] & 0xf0) === 0 && packet[9] > 0;
  }
  return (
    packet.length >= 30 &&
    packet[0] === 0x01 &&
    hasAscii(packet, 'vorbis', 1) &&
    packet.readUInt32LE(7) === 0 &&
    packet[11] > 0 &&
    packet.readUInt32LE(12) > 0 &&
    (packet[29] & 0x01) === 1
  );
}

async function audioMagicMatches(
  file: FileHandle,
  mime: PlayerMediaMime,
  fileSize: number,
): Promise<boolean> {
  if (mime === 'audio/mpeg') {
    return mp3MagicMatches(file, fileSize);
  }
  if (mime === 'audio/wav') {
    return wavMagicMatches(file, fileSize);
  }
  return mime === 'audio/ogg'
    ? oggMagicMatches(file, fileSize)
    : false;
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
  if (bytes.length < 16 || !hasAscii(bytes, 'ftyp', 4)) {
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
    if (MP4_VIDEO_BRANDS.has(bytes.toString('ascii', offset, offset + 4))) {
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
    bytes[0] !== 0x1a ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0xdf ||
    bytes[3] !== 0xa3
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
        !hasAscii(bytes, 'webm', offset)
      ) {
        return false;
      }
      foundWebmDocType = true;
    }
    offset += elementSize.value;
  }
  return foundWebmDocType && offset === headerEnd;
}

export async function playerMediaMagicMatches(
  file: FileHandle,
  mime: PlayerMediaMime,
  fileSize: number,
): Promise<boolean> {
  if (mime.startsWith('image/')) {
    const bytes = await readBytes(file, 0, MAGIC_BYTE_COUNT);
    return imageMagicMatches(mime, bytes);
  }
  if (mime.startsWith('audio/')) {
    return audioMagicMatches(file, mime, fileSize);
  }
  const bytes = await readBytes(file, 0, MEDIA_MAGIC_BYTE_COUNT);
  return mime === 'video/mp4'
    ? mp4MagicMatches(bytes, fileSize)
    : webmMagicMatches(bytes, fileSize);
}
