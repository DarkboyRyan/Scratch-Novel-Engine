import { createHash, randomUUID } from 'node:crypto';
import {
  close as closeDescriptor,
  constants,
  createWriteStream,
  fstat as statDescriptor,
  open as openDescriptor,
  read as readDescriptor,
  type Stats,
} from 'node:fs';
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import {
  fromFdPromise as openZipFileDescriptor,
  type Entry,
  type ZipFile as ReadZipFile,
} from 'yauzl';
import { ZipFile } from 'yazl';

import type {
  AssetDocument,
  ProjectDocument,
} from '../../shared/projectTypes';
import { RUNTIME_VERSION } from './AuthorProjectCompiler';
import { acquireExportFileLock } from './ExportFileLock';
import {
  exportRuntimeBundle,
  PLAYER_COMPATIBILITY,
  RUNTIME_MANIFEST_FORMAT,
  type RuntimeBundleExportFaultPoint,
} from './RuntimeBundleExporter';
import {
  loadWebPlayerTemplate,
  type LoadedWebPlayerTemplate,
  type WebPlayerTemplateFile,
} from './WebPlayerTemplate';

export const WEB_EXPORT_FORMAT = 'vn-engine-web-export';
export const WEB_EXPORT_VERSION = 1;

export const WEB_EXPORT_README = `VN Engine Web 游戏

此 ZIP 必须解压后部署到 HTTP/HTTPS 静态网站，不能保证通过 file:// 直接双击 index.html 运行。

服务器要求：
1. 保持 ZIP 内目录结构和文件名大小写。
2. 为 HTML、JavaScript、CSS、JSON、图片、音频和视频返回正确的 Content-Type。
3. 媒体文件应支持 HTTP Range 请求，并对有效范围返回 206 Partial Content。
4. 缺失文件应返回真实的 404，不能统一改写为 index.html。
`;

export type WebExportDocument = {
  format: typeof WEB_EXPORT_FORMAT;
  webExportVersion: typeof WEB_EXPORT_VERSION;
  runtimeVersion: typeof RUNTIME_VERSION;
  playerCompatibility: typeof PLAYER_COMPATIBILITY;
  gameRoot: string;
};

export type WebPlayerExportFaultPoint =
  | 'after-runtime-bundle'
  | 'after-template-copy'
  | 'after-metadata'
  | 'after-private-archive'
  | 'after-published-verification'
  | 'before-commit';

export type WebPlayerExportOptions = {
  sourceProjectRootPath: string;
  targetArtifactPath: string;
  templateRootPath: string;
  sourceRevision: number;
  expectedManifestSha256: string;
  expectedProject: ProjectDocument;
  expectedAssets: AssetDocument[];
  buildId?: string;
  createdAt?: string;
  assertSourceStillCurrent?: () => void | Promise<void>;
  injectFault?: (point: WebPlayerExportFaultPoint) => void | Promise<void>;
  injectRuntimeBundleFault?: (
    point: RuntimeBundleExportFaultPoint,
  ) => void | Promise<void>;
  archiveTree?: typeof archiveWebPlayerTree;
  verifyArchive?: typeof verifyWebPlayerArchive;
};

export type WebPlayerExportResult = {
  artifactName: string;
  buildId: string;
  sourceRevision: number;
  assetCount: number;
};

export type WebArchiveFileRecord = {
  path: string;
  bytes: number;
  sha256: string;
};

type FileIdentity = Pick<Stats, 'dev' | 'ino'>;

const COPY_BUFFER_BYTES = 256 * 1024;
const FIXED_ZIP_MTIME = new Date(Date.UTC(1980, 0, 1));
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UTF8_FILE_NAME_FLAG = 0x0800;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP32_MAXIMUM = 0xffffffff;
const ZIP64_EXTRA_FIELD = 0x0001;
const UNICODE_PATH_EXTRA_FIELD = 0x7075;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1
        ? (value >>> 1) ^ 0xedb88320
        : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function openRawDescriptor(filePath: string, flags: number): Promise<number> {
  return new Promise((resolve, reject) => {
    openDescriptor(filePath, flags, (error, descriptor) => {
      if (error) {
        reject(error);
      } else {
        resolve(descriptor);
      }
    });
  });
}

function statRawDescriptor(descriptor: number): Promise<Stats> {
  return new Promise((resolve, reject) => {
    statDescriptor(descriptor, (error, status) => {
      if (error) {
        reject(error);
      } else {
        resolve(status);
      }
    });
  });
}

function closeRawDescriptor(descriptor: number): Promise<void> {
  return new Promise((resolve, reject) => {
    closeDescriptor(descriptor, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function updateCrc32(current: number, buffer: Buffer): number {
  let value = current;
  for (const byte of buffer) {
    value = (value >>> 8) ^ CRC32_TABLE[(value ^ byte) & 0xff]!;
  }
  return value >>> 0;
}

async function readExactAt(
  descriptor: number,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(length);
  let offset = 0;
  while (offset < length) {
    const bytesRead = await new Promise<number>((resolve, reject) => {
      readDescriptor(
        descriptor,
        buffer,
        offset,
        length - offset,
        position + offset,
        (error, count) => {
          if (error) {
            reject(error);
          } else {
            resolve(count);
          }
        },
      );
    });
    if (bytesRead <= 0) {
      throw new Error('Web 游戏 ZIP 数据描述符读取不完整');
    }
    offset += bytesRead;
  }
  return buffer;
}

async function verifyDataDescriptor(
  archiveDescriptor: number,
  entry: Entry,
  fileDataStart: number,
): Promise<void> {
  const descriptorPosition = fileDataStart + entry.compressedSize;
  const usesZip64 =
    entry.compressedSize >= ZIP32_MAXIMUM ||
    entry.uncompressedSize >= ZIP32_MAXIMUM ||
    entry.extraFields.some((field) => field.id === 0x0001);
  const descriptorBytes = await readExactAt(
    archiveDescriptor,
    descriptorPosition,
    usesZip64 ? 24 : 16,
  );
  const hasSignature =
    descriptorBytes.readUInt32LE(0) === DATA_DESCRIPTOR_SIGNATURE;
  const crcOffset = hasSignature ? 4 : 0;
  const requiredBytes = crcOffset + (usesZip64 ? 20 : 12);
  const bytes = descriptorBytes.subarray(0, requiredBytes);
  const descriptorCrc32 = bytes.readUInt32LE(crcOffset);
  const compressedSize = usesZip64
    ? Number(bytes.readBigUInt64LE(crcOffset + 4))
    : bytes.readUInt32LE(crcOffset + 4);
  const uncompressedSize = usesZip64
    ? Number(bytes.readBigUInt64LE(crcOffset + 12))
    : bytes.readUInt32LE(crcOffset + 8);
  if (
    !Number.isSafeInteger(compressedSize) ||
    !Number.isSafeInteger(uncompressedSize) ||
    descriptorCrc32 !== (entry.crc32 >>> 0) ||
    compressedSize !== entry.compressedSize ||
    uncompressedSize !== entry.uncompressedSize
  ) {
    throw new Error('Web 游戏 ZIP 数据描述符与中央目录不一致');
  }
}

function parseAllowedExtraFields(
  raw: Buffer,
  label: string,
): ReadonlyMap<number, Buffer> {
  const fields = new Map<number, Buffer>();
  let offset = 0;
  while (offset < raw.length) {
    if (raw.length - offset < 4) {
      throw new Error(`${label} extra field TLV 被截断`);
    }
    const id = raw.readUInt16LE(offset);
    const size = raw.readUInt16LE(offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + size;
    if (dataEnd > raw.length) {
      throw new Error(`${label} extra field TLV 长度越界`);
    }
    if (fields.has(id)) {
      throw new Error(`${label} 包含重复的 extra field`);
    }
    if (id === UNICODE_PATH_EXTRA_FIELD) {
      throw new Error(`${label} 不允许 Unicode Path extra field`);
    }
    if (id !== ZIP64_EXTRA_FIELD) {
      throw new Error(`${label} 包含未约定的 extra field`);
    }
    fields.set(id, raw.subarray(dataStart, dataEnd));
    offset = dataEnd;
  }
  return fields;
}

function closeReadZip(zip: ReadZipFile): Promise<void> {
  if (!zip.isOpen) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const handleClose = () => {
      zip.removeListener('error', handleError);
      resolve();
    };
    const handleError = (error: Error) => {
      zip.removeListener('close', handleClose);
      reject(error);
    };
    zip.once('close', handleClose);
    zip.once('error', handleError);
    zip.close();
  });
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileSnapshot(left: Stats, right: Stats): boolean {
  return (
    sameIdentity(left, right) &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.nlink === right.nlink
  );
}

function isInsideOrEqual(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isSafeArchivePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.endsWith('/') ||
    path.posix.isAbsolute(value)
  ) {
    return false;
  }
  return value.split('/').every(
    (component) => component.length > 0 && component !== '.' && component !== '..',
  );
}

function shouldStoreWithoutCompression(filePath: string): boolean {
  return /^game\/[^/]+\/assets\/.+\.(?:jpe?g|png|webp|mp3|ogg|wav|mp4|webm)$/iu.test(
    filePath,
  );
}

async function canonicalizeDirectory(
  requestedPath: string,
  label: string,
): Promise<string> {
  const absolutePath = path.resolve(requestedPath);
  const status = await lstat(absolutePath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label}不是安全的目录`);
  }
  return realpath(absolutePath);
}

async function assertMissing(targetPath: string, message: string): Promise<void> {
  await lstat(targetPath).then(
    () => {
      throw new Error(message);
    },
    (error: unknown) => {
      if (errnoCode(error) !== 'ENOENT') {
        throw error;
      }
    },
  );
}

function validateTargetName(requestedTargetPath: string): string {
  const artifactName = path.basename(requestedTargetPath);
  if (
    !artifactName.endsWith('-Web.zip') ||
    artifactName === '-Web.zip' ||
    artifactName.includes('\0') ||
    Buffer.byteLength(artifactName, 'utf8') > 240 ||
    /[<>:"/\\|?*]/u.test(artifactName) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(artifactName)
  ) {
    throw new Error('Web 游戏 ZIP 名称必须使用安全的 -Web.zip 后缀');
  }
  return artifactName;
}

function validateBuildId(buildId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(buildId)) {
    throw new Error('Web 游戏 build ID 不能安全地用作目录名');
  }
}

async function writeDurableExclusiveFile(
  filePath: string,
  contents: string,
): Promise<void> {
  const bytes = Buffer.from(contents, 'utf8');
  const file = await open(
    filePath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    let position = 0;
    while (position < bytes.length) {
      const { bytesWritten } = await file.write(
        bytes,
        position,
        bytes.length - position,
        position,
      );
      if (bytesWritten <= 0) {
        throw new Error('Web 导出元数据未能完整写入');
      }
      position += bytesWritten;
    }
    await file.sync();
  } finally {
    await file.close();
  }
}

async function hashStableFile(
  rootPath: string,
  relativePath: string,
): Promise<WebArchiveFileRecord> {
  const absolutePath = path.join(rootPath, ...relativePath.split('/'));
  const before = await lstat(absolutePath);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new Error('Web 导出树包含不安全的文件');
  }
  const file = await open(
    absolutePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await file.stat();
    if (!sameFileSnapshot(before, opened)) {
      throw new Error('Web 导出文件在读取前发生了变化');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < opened.size) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, opened.size - position),
        position,
      );
      if (bytesRead <= 0) {
        throw new Error('Web 导出文件读取不完整');
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await file.stat();
    if (!sameFileSnapshot(opened, after)) {
      throw new Error('Web 导出文件在读取时发生了变化');
    }
    return {
      path: relativePath,
      bytes: opened.size,
      sha256: hash.digest('hex'),
    };
  } finally {
    await file.close();
  }
}

async function snapshotRegularTree(
  rootPath: string,
  relativeDirectory = '',
): Promise<WebArchiveFileRecord[]> {
  const directoryPath = relativeDirectory.length === 0
    ? rootPath
    : path.join(rootPath, ...relativeDirectory.split('/'));
  const status = await lstat(directoryPath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('Web 导出树包含不安全的目录');
  }
  const entries = await readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  const records: WebArchiveFileRecord[] = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`;
    if (!isSafeArchivePath(relativePath)) {
      throw new Error('Web 导出树包含不安全的路径');
    }
    const entryPath = path.join(directoryPath, entry.name);
    const entryStatus = await lstat(entryPath);
    if (entryStatus.isSymbolicLink()) {
      throw new Error('Web 导出树不允许符号链接');
    }
    if (entryStatus.isDirectory()) {
      records.push(...await snapshotRegularTree(rootPath, relativePath));
    } else if (entryStatus.isFile()) {
      records.push(await hashStableFile(rootPath, relativePath));
    } else {
      throw new Error('Web 导出树只允许常规文件和目录');
    }
  }
  return records;
}

async function copyStableTemplateFile(
  template: LoadedWebPlayerTemplate,
  destinationRootPath: string,
  expected: WebPlayerTemplateFile,
): Promise<void> {
  const sourcePath = path.join(
    template.payloadRootPath,
    ...expected.path.split('/'),
  );
  const destinationPath = path.join(
    destinationRootPath,
    ...expected.path.split('/'),
  );
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const before = await lstat(sourcePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size !== expected.bytes
  ) {
    throw new Error('Web Player 模板文件在复制前发生了变化');
  }
  const source = await open(
    sourcePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  const destination = await open(
    destinationPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    const opened = await source.stat();
    if (!sameFileSnapshot(before, opened)) {
      throw new Error('Web Player 模板文件在复制前发生了变化');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < opened.size) {
      const { bytesRead } = await source.read(
        buffer,
        0,
        Math.min(buffer.length, opened.size - position),
        position,
      );
      if (bytesRead <= 0) {
        throw new Error('Web Player 模板文件读取不完整');
      }
      hash.update(buffer.subarray(0, bytesRead));
      let written = 0;
      while (written < bytesRead) {
        const result = await destination.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        );
        if (result.bytesWritten <= 0) {
          throw new Error('Web Player 模板文件复制不完整');
        }
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    await destination.sync();
    if (hash.digest('hex') !== expected.sha256) {
      throw new Error('Web Player 模板文件摘要不匹配');
    }
    const after = await source.stat();
    if (!sameFileSnapshot(opened, after)) {
      throw new Error('Web Player 模板文件在复制时发生了变化');
    }
  } finally {
    await Promise.all([
      source.close().catch(() => undefined),
      destination.close().catch(() => undefined),
    ]);
  }
}

async function copyTemplatePayload(
  template: LoadedWebPlayerTemplate,
  destinationRootPath: string,
): Promise<void> {
  for (const file of template.manifest.files) {
    await copyStableTemplateFile(template, destinationRootPath, file);
  }
  const copied = await snapshotRegularTree(destinationRootPath);
  if (JSON.stringify(copied) !== JSON.stringify(template.manifest.files)) {
    throw new Error('Web Player 模板副本与签名清单不一致');
  }
}

function jsonContents(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function assertRuntimeBundleContract(
  gameRootPath: string,
  buildId: string,
): Promise<void> {
  const manifestPath = path.join(gameRootPath, 'manifest.json');
  const status = await lstat(manifestPath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.nlink !== 1 ||
    status.size <= 0 ||
    status.size > 16 * 1024 * 1024
  ) {
    throw new Error('Web 导出的 runtime manifest 无效');
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  } catch {
    throw new Error('Web 导出的 runtime manifest 不是有效 JSON');
  }
  if (
    !isObject(manifest) ||
    manifest.format !== RUNTIME_MANIFEST_FORMAT ||
    manifest.buildId !== buildId ||
    manifest.runtimeVersion !== RUNTIME_VERSION ||
    manifest.playerCompatibility !== PLAYER_COMPATIBILITY
  ) {
    throw new Error('Web 导出的 runtime manifest 与目录或 Player 不兼容');
  }
}

export async function archiveWebPlayerTree(
  stagingRootPath: string,
  archivePath: string,
  expectedFiles: readonly WebArchiveFileRecord[],
): Promise<void> {
  await assertMissing(archivePath, 'Web 游戏私有 ZIP 已存在');
  const zip = new ZipFile();
  for (const file of expectedFiles) {
    const compress = !shouldStoreWithoutCompression(file.path);
    zip.addFile(
      path.join(stagingRootPath, ...file.path.split('/')),
      file.path,
      {
        mtime: FIXED_ZIP_MTIME,
        mode: 0o100644,
        compress,
        ...(compress ? { compressionLevel: 9 } : {}),
        forceDosTimestamp: true,
      },
    );
  }
  const output = createWriteStream(archivePath, {
    flags: 'wx',
    mode: 0o600,
  });
  const completed = pipeline(zip.outputStream as Readable, output);
  zip.end({ forceZip64Format: false, comment: '' });
  await completed;
  const archive = await open(archivePath, constants.O_RDONLY);
  try {
    await archive.sync();
  } finally {
    await archive.close();
  }
}

export async function verifyWebPlayerArchive(
  archivePath: string,
  expectedFiles: readonly WebArchiveFileRecord[],
): Promise<void> {
  const before = await lstat(archivePath);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink < 1) {
    throw new Error('Web 游戏 ZIP 不是安全的常规文件');
  }
  const archiveDescriptor = await openRawDescriptor(
    archivePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  const opened = await statRawDescriptor(archiveDescriptor);
  if (!sameFileSnapshot(before, opened)) {
    await closeRawDescriptor(archiveDescriptor);
    throw new Error('Web 游戏 ZIP 在打开前发生了变化');
  }
  const zip = await openZipFileDescriptor(archiveDescriptor, {
    autoClose: false,
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
  }).catch(async (error: unknown) => {
    await closeRawDescriptor(archiveDescriptor);
    throw error;
  });
  const seen = new Set<string>();
  let index = 0;
  try {
    if (zip.comment.length !== 0 || zip.entryCount !== expectedFiles.length) {
      throw new Error('Web 游戏 ZIP 条目集合不符合 exact 契约');
    }
    for await (const entry of zip.eachEntry()) {
      const expected = expectedFiles[index];
      parseAllowedExtraFields(entry.extraFieldRaw, 'Web 游戏 ZIP 中央目录');
      if (
        expected === undefined ||
        !isSafeArchivePath(entry.fileName) ||
        (entry.generalPurposeBitFlag & UTF8_FILE_NAME_FLAG) === 0 ||
        !entry.fileNameRaw.equals(Buffer.from(entry.fileName, 'utf8')) ||
        seen.has(entry.fileName) ||
        entry.fileName !== expected.path ||
        entry.fileCommentLength !== 0 ||
        entry.isEncrypted() ||
        !entry.canDecodeFileData() ||
        (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
        entry.uncompressedSize !== expected.bytes
      ) {
        throw new Error('Web 游戏 ZIP 包含重复、额外或不安全的条目');
      }
      const creatorSystem = entry.versionMadeBy >>> 8;
      const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
      if (
        creatorSystem === 3 &&
        unixMode !== 0 &&
        (unixMode & 0o170000) !== 0o100000
      ) {
        throw new Error('Web 游戏 ZIP 不允许符号链接或特殊文件');
      }
      const local = await zip.readLocalFileHeaderPromise(entry);
      parseAllowedExtraFields(local.extraField, 'Web 游戏 ZIP 本地条目');
      if (
        !local.fileName.equals(entry.fileNameRaw) ||
        !local.fileName.equals(Buffer.from(entry.fileName, 'utf8')) ||
        local.compressionMethod !== entry.compressionMethod ||
        local.generalPurposeBitFlag !== entry.generalPurposeBitFlag
      ) {
        throw new Error('Web 游戏 ZIP 本地条目与中央目录不一致');
      }
      if ((entry.generalPurposeBitFlag & DATA_DESCRIPTOR_FLAG) === 0) {
        if (
          local.crc32 !== (entry.crc32 >>> 0) ||
          local.compressedSize !== entry.compressedSize ||
          local.uncompressedSize !== entry.uncompressedSize
        ) {
          throw new Error('Web 游戏 ZIP 本地条目校验信息与中央目录不一致');
        }
      } else {
        if (
          (local.crc32 !== 0 && local.crc32 !== (entry.crc32 >>> 0)) ||
          (local.compressedSize !== 0 &&
            local.compressedSize !== ZIP32_MAXIMUM &&
            local.compressedSize !== entry.compressedSize) ||
          (local.uncompressedSize !== 0 &&
            local.uncompressedSize !== ZIP32_MAXIMUM &&
            local.uncompressedSize !== entry.uncompressedSize)
        ) {
          throw new Error('Web 游戏 ZIP 本地 data-descriptor 占位值无效');
        }
        await verifyDataDescriptor(
          archiveDescriptor,
          entry,
          local.fileDataStart,
        );
      }
      seen.add(entry.fileName);
      const stream = await zip.openReadStreamPromise(entry);
      const hash = createHash('sha256');
      let bytes = 0;
      let crc32 = 0xffffffff;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > expected.bytes) {
          stream.destroy();
          throw new Error('Web 游戏 ZIP 解压后的文件大小不符');
        }
        hash.update(buffer);
        crc32 = updateCrc32(crc32, buffer);
      }
      const decodedCrc32 = (crc32 ^ 0xffffffff) >>> 0;
      if (
        bytes !== expected.bytes ||
        hash.digest('hex') !== expected.sha256 ||
        decodedCrc32 !== (entry.crc32 >>> 0)
      ) {
        throw new Error('Web 游戏 ZIP 解压后的文件内容不符');
      }
      index += 1;
    }
    if (index !== expectedFiles.length) {
      throw new Error('Web 游戏 ZIP 缺少必需条目');
    }
  } finally {
    await closeReadZip(zip);
  }
  const after = await lstat(archivePath);
  if (!sameFileSnapshot(before, after)) {
    throw new Error('Web 游戏 ZIP 在复验时发生了变化');
  }
}

async function captureDirectoryIdentity(
  directoryPath: string,
  label: string,
): Promise<FileIdentity> {
  const status = await lstat(directoryPath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${label}无效`);
  }
  return status;
}

async function captureFileIdentity(
  filePath: string,
  label: string,
): Promise<FileIdentity> {
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile()) {
    throw new Error(`${label}无效`);
  }
  return status;
}

async function removeOwnedFile(
  filePath: string,
  identity: FileIdentity,
): Promise<void> {
  const status = await lstat(filePath).catch(() => null);
  if (
    status !== null &&
    !status.isSymbolicLink() &&
    status.isFile() &&
    sameIdentity(status, identity)
  ) {
    await unlink(filePath);
  }
}

async function removeOwnedEmptyDirectory(
  directoryPath: string,
  identity: FileIdentity,
): Promise<void> {
  const status = await lstat(directoryPath).catch(() => null);
  if (
    status !== null &&
    !status.isSymbolicLink() &&
    status.isDirectory() &&
    sameIdentity(status, identity)
  ) {
    await rmdir(directoryPath);
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  const directory = await open(directoryPath, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function exportWebPlayer(
  options: WebPlayerExportOptions,
): Promise<WebPlayerExportResult> {
  const buildId = options.buildId ?? randomUUID();
  validateBuildId(buildId);
  const template = await loadWebPlayerTemplate(options.templateRootPath);
  const sourceRootPath = await canonicalizeDirectory(
    options.sourceProjectRootPath,
    '项目根目录',
  );
  const requestedTargetPath = path.resolve(options.targetArtifactPath);
  const targetParentPath = await canonicalizeDirectory(
    path.dirname(requestedTargetPath),
    '导出位置',
  );
  const artifactName = validateTargetName(requestedTargetPath);
  const targetPath = path.join(targetParentPath, artifactName);
  if (isInsideOrEqual(sourceRootPath, targetPath)) {
    throw new Error('Web 游戏 ZIP 不能导出到源项目内部');
  }
  await assertMissing(targetPath, '导出位置已存在同名 Web 游戏 ZIP');

  const transactionId = randomUUID();
  const lockPath = path.join(targetParentPath, `.${artifactName}.export.lock`);
  const publishingDirectoryPath = path.join(
    targetParentPath,
    `.vn-engine-web-${transactionId}.publishing`,
  );
  const publishingArchivePath = path.join(publishingDirectoryPath, 'archive.zip');
  const lock = await acquireExportFileLock(
    lockPath,
    '另一个导出任务正在写入同名 Web 游戏 ZIP',
  );
  let transactionRootPath: string | null = null;
  let transactionRootIdentity: FileIdentity | null = null;
  let publishingDirectoryIdentity: FileIdentity | null = null;
  let publishingArchiveIdentity: FileIdentity | null = null;
  let targetIdentity: FileIdentity | null = null;
  let committed = false;

  try {
    await assertMissing(targetPath, '导出位置已存在同名 Web 游戏 ZIP');
    const temporaryBasePath = await canonicalizeDirectory(
      tmpdir(),
      '系统临时目录',
    );
    transactionRootPath = await mkdtemp(
      path.join(temporaryBasePath, 'vn-engine-web-export-'),
    );
    transactionRootPath = await realpath(transactionRootPath);
    await chmod(transactionRootPath, 0o700);
    transactionRootIdentity = await captureDirectoryIdentity(
      transactionRootPath,
      'Web 导出私有工作区',
    );
    const stagingRootPath = path.join(transactionRootPath, 'web-root');
    const temporaryBundlePath = path.join(transactionRootPath, 'runtime.vngame');
    const privateArchivePath = path.join(transactionRootPath, 'web-player.zip');
    await mkdir(stagingRootPath, { mode: 0o700 });

    const runtime = await exportRuntimeBundle({
      sourceProjectRootPath: sourceRootPath,
      targetBundlePath: temporaryBundlePath,
      sourceRevision: options.sourceRevision,
      expectedManifestSha256: options.expectedManifestSha256,
      expectedProject: options.expectedProject,
      expectedAssets: options.expectedAssets,
      buildId,
      createdAt: options.createdAt,
      assertSourceStillCurrent: options.assertSourceStillCurrent,
      injectFault: options.injectRuntimeBundleFault,
    });
    await options.injectFault?.('after-runtime-bundle');

    await copyTemplatePayload(template, stagingRootPath);
    await options.injectFault?.('after-template-copy');

    const gameParentPath = path.join(stagingRootPath, 'game');
    const gameRootPath = path.join(gameParentPath, buildId);
    await mkdir(gameParentPath, { mode: 0o700 });
    await rename(temporaryBundlePath, gameRootPath);
    await assertRuntimeBundleContract(gameRootPath, buildId);

    const webExport: WebExportDocument = {
      format: WEB_EXPORT_FORMAT,
      webExportVersion: WEB_EXPORT_VERSION,
      runtimeVersion: RUNTIME_VERSION,
      playerCompatibility: PLAYER_COMPATIBILITY,
      gameRoot: `game/${buildId}`,
    };
    await Promise.all([
      writeDurableExclusiveFile(
        path.join(stagingRootPath, 'web-export.json'),
        jsonContents(webExport),
      ),
      writeDurableExclusiveFile(
        path.join(stagingRootPath, 'README.txt'),
        WEB_EXPORT_README,
      ),
    ]);
    await options.injectFault?.('after-metadata');

    const rootEntries = (await readdir(stagingRootPath)).sort(comparePaths);
    if (
      JSON.stringify(rootEntries) !==
      JSON.stringify([
        'README.txt',
        'game',
        'index.html',
        'player-assets',
        'web-export.json',
      ])
    ) {
      throw new Error('Web 导出根目录不符合 exact 契约');
    }
    const expectedFiles = await snapshotRegularTree(stagingRootPath);
    const archiveTree = options.archiveTree ?? archiveWebPlayerTree;
    const verifyArchive = options.verifyArchive ?? verifyWebPlayerArchive;
    await archiveTree(stagingRootPath, privateArchivePath, expectedFiles);
    if (
      JSON.stringify(await snapshotRegularTree(stagingRootPath)) !==
      JSON.stringify(expectedFiles)
    ) {
      throw new Error('Web 导出树在 ZIP 创建时发生了变化');
    }
    await verifyArchive(privateArchivePath, expectedFiles);
    await options.injectFault?.('after-private-archive');

    await lock.assertOwned();
    await assertMissing(
      publishingDirectoryPath,
      'Web 游戏 ZIP 发布暂存目录已存在',
    );
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error('导出位置在发布前发生了变化');
    }
    await mkdir(publishingDirectoryPath, { mode: 0o700 });
    publishingDirectoryIdentity = await captureDirectoryIdentity(
      publishingDirectoryPath,
      'Web 游戏 ZIP 发布暂存目录',
    );
    await copyFile(
      privateArchivePath,
      publishingArchivePath,
      constants.COPYFILE_EXCL,
    );
    await chmod(publishingArchivePath, 0o600);
    const publishingArchive = await open(
      publishingArchivePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      await publishingArchive.sync();
    } finally {
      await publishingArchive.close();
    }
    publishingArchiveIdentity = await captureFileIdentity(
      publishingArchivePath,
      'Web 游戏 ZIP 发布暂存文件',
    );
    await verifyArchive(publishingArchivePath, expectedFiles);
    await options.injectFault?.('after-published-verification');

    await options.assertSourceStillCurrent?.();
    await options.injectFault?.('before-commit');
    await lock.assertOwned();
    await assertMissing(targetPath, '导出位置在提交前发生了变化');
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error('导出位置在提交前发生了变化');
    }
    const directoryBeforeCommit = await captureDirectoryIdentity(
      publishingDirectoryPath,
      'Web 游戏 ZIP 发布暂存目录',
    );
    const archiveBeforeCommit = await captureFileIdentity(
      publishingArchivePath,
      'Web 游戏 ZIP 发布暂存文件',
    );
    if (
      !sameIdentity(directoryBeforeCommit, publishingDirectoryIdentity) ||
      !sameIdentity(archiveBeforeCommit, publishingArchiveIdentity)
    ) {
      throw new Error('Web 游戏 ZIP 发布暂存内容在提交前发生了变化');
    }
    try {
      await link(publishingArchivePath, targetPath);
    } catch (error) {
      if (errnoCode(error) === 'EEXIST') {
        throw new Error('导出位置在提交前发生了变化');
      }
      throw error;
    }
    targetIdentity = publishingArchiveIdentity;
    const targetAfterLink = await captureFileIdentity(
      targetPath,
      'Web 游戏 ZIP 导出产物',
    );
    if (!sameIdentity(targetAfterLink, targetIdentity)) {
      throw new Error('Web 游戏 ZIP 原子发布失败');
    }
    await removeOwnedFile(publishingArchivePath, publishingArchiveIdentity);
    publishingArchiveIdentity = null;
    await removeOwnedEmptyDirectory(
      publishingDirectoryPath,
      publishingDirectoryIdentity,
    );
    publishingDirectoryIdentity = null;
    await verifyArchive(targetPath, expectedFiles);
    committed = true;
    await syncDirectory(targetParentPath).catch(() => undefined);

    return {
      artifactName,
      buildId: runtime.buildId,
      sourceRevision: runtime.sourceRevision,
      assetCount: runtime.assetCount,
    };
  } finally {
    if (!committed && targetIdentity !== null) {
      await removeOwnedFile(targetPath, targetIdentity).catch(() => undefined);
    }
    if (publishingArchiveIdentity !== null) {
      await removeOwnedFile(
        publishingArchivePath,
        publishingArchiveIdentity,
      ).catch(() => undefined);
    }
    if (publishingDirectoryIdentity !== null) {
      await removeOwnedEmptyDirectory(
        publishingDirectoryPath,
        publishingDirectoryIdentity,
      ).catch(() => undefined);
    }
    if (transactionRootPath !== null && transactionRootIdentity !== null) {
      const current = await lstat(transactionRootPath).catch(() => null);
      if (
        current !== null &&
        !current.isSymbolicLink() &&
        current.isDirectory() &&
        sameIdentity(current, transactionRootIdentity)
      ) {
        await rm(transactionRootPath, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
    await lock.release();
  }
}
