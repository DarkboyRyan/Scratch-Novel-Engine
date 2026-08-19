import { extractFile as extractAsarFile } from '@electron/asar';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants as fsConstants,
  createReadStream,
  existsSync,
} from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  windowsMetadataVerificationInvocation,
  windowsSignatureVerificationInvocation,
} from './windowsPowerShellPolicy.mjs';

const MANIFEST_FIELDS = [
  'format',
  'manifestVersion',
  'buildId',
  'projectId',
  'sourceRevision',
  'runtimeVersion',
  'playerCompatibility',
  'createdAt',
  'files',
];
const MANIFEST_FILE_FIELDS = [
  'assetId',
  'type',
  'displayName',
  'path',
  'mime',
  'bytes',
  'sha256',
];
const GAME_FIELDS = ['format', 'runtimeVersion', 'game', 'scenes'];
const GAME_METADATA_FIELDS = ['id', 'title', 'entrySceneId'];
const ASSET_DIRECTORY = {
  image: 'images',
  audio: 'audio',
  video: 'videos',
};
const MIME_BY_EXTENSION = {
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
const TYPE_BY_MIME = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
};
const MAX_BYTES_BY_TYPE = {
  image: 128 * 1024 * 1024,
  audio: 512 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
};
const require = createRequire(import.meta.url);
const VITE_NODE_ENTRY = path.join(
  path.dirname(require.resolve('vite-node/package.json')),
  'vite-node.mjs',
);
const STRICT_RUNTIME_VERIFIER = fileURLToPath(
  new URL('../strictVerifyRuntimeBundle.ts', import.meta.url),
);
const DISTRIBUTABLE_EXTENSIONS = [
  '.zip',
  '.dmg',
  '.exe',
  '.msi',
  '.deb',
  '.rpm',
  '.appimage',
  '.tar.gz',
];
const RELEASE_TARGETS = [
  { platform: 'darwin', arch: 'arm64', signature: 'developer-id-notarized' },
  { platform: 'win32', arch: 'x64', signature: 'authenticode' },
  { platform: 'linux', arch: 'x64', signature: 'not-applicable' },
];

export const RECEIPT_SCHEMA_VERSION = 1;
export const ARTIFACT_MANIFEST_SCHEMA_VERSION = 1;
export const RELEASE_SET_SCHEMA_VERSION = 1;

export function commandOptions(definitions) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: definitions,
    allowPositionals: false,
    strict: true,
  });
  if (positionals.length !== 0) {
    throw new Error('不接受位置参数');
  }
  return values;
}

export function requiredOption(values, name) {
  const value = values[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`缺少 --${name}`);
  }
  return value;
}

export function enumOption(values, name, allowed) {
  const value = requiredOption(values, name);
  if (!allowed.includes(value)) {
    throw new Error(`--${name} 必须是 ${allowed.join('、')}`);
  }
  return value;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectValue(value, context) {
  if (!isObject(value)) {
    throw new Error(`${context} 必须是对象`);
  }
  return value;
}

function exactFields(value, fields, context) {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${context} 字段不符合约定`);
  }
}

function boundedString(value, context, maximum = 4096, allowEmpty = false) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximum ||
    value.includes('\0')
  ) {
    throw new Error(`${context} 不是有效字符串`);
  }
  return value;
}

function safeSegmentedRelativePath(relativePath, context) {
  boundedString(relativePath, context);
  const components = relativePath.split('/');
  if (
    relativePath.includes('\\') ||
    path.posix.isAbsolute(relativePath) ||
    components.some(
      (component) => component === '' || component === '.' || component === '..',
    )
  ) {
    throw new Error(`${context} 不是安全的 POSIX 相对路径`);
  }
  return components;
}

function canonicalIsoDate(value, context) {
  boundedString(value, context, 64);
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${context} 必须是规范 UTC 时间`);
  }
  return value;
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function canonicalDirectory(directory, context) {
  if (!path.isAbsolute(directory)) {
    throw new Error(`${context} 必须是绝对路径`);
  }
  const status = await lstat(directory);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${context} 必须是非链接目录`);
  }
  return realpath(directory);
}

async function safeRegularFile(root, relativePath, context) {
  const components = safeSegmentedRelativePath(relativePath, context);
  let current = root;
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index]);
    const status = await lstat(current);
    if (status.isSymbolicLink()) {
      throw new Error(`${context} 不能经过符号链接`);
    }
    if (index < components.length - 1 && !status.isDirectory()) {
      throw new Error(`${context} 的父级必须是目录`);
    }
    if (
      index === components.length - 1 &&
      (!status.isFile() || status.nlink !== 1)
    ) {
      throw new Error(`${context} 必须是非链接、非硬链接普通文件`);
    }
  }
  return current;
}

async function parseJsonFile(root, relativePath, maximumBytes) {
  const filePath = await safeRegularFile(root, relativePath, relativePath);
  const status = await stat(filePath);
  if (status.size <= 0 || status.size > maximumBytes) {
    throw new Error(`${relativePath} 大小不合法`);
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error(`${relativePath} 不是有效 JSON`);
  }
  return parsed;
}

function mediaMagicMatches(mime, bytes) {
  const ascii = (value, offset) =>
    offset + value.length <= bytes.length &&
    bytes.toString('ascii', offset, offset + value.length) === value;
  switch (mime) {
    case 'image/png':
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      );
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/webp':
      return ascii('RIFF', 0) && ascii('WEBP', 8);
    case 'audio/mpeg':
      return ascii('ID3', 0) || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/ogg':
      return ascii('OggS', 0);
    case 'audio/wav':
      return ascii('RIFF', 0) && ascii('WAVE', 8);
    case 'video/mp4':
      return ascii('ftyp', 4);
    case 'video/webm':
      return bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3;
    default:
      return false;
  }
}

async function verifyMediaFile(root, entry) {
  const filePath = await safeRegularFile(root, entry.path, `manifest ${entry.path}`);
  const status = await stat(filePath);
  if (status.size !== entry.bytes) {
    throw new Error(`${entry.path} 大小与 manifest 不一致`);
  }
  const handle = await open(filePath, 'r');
  try {
    const probe = Buffer.alloc(Math.min(4096, status.size));
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
    if (!mediaMagicMatches(entry.mime, probe.subarray(0, bytesRead))) {
      throw new Error(`${entry.path} 文件头与 MIME 不一致`);
    }
  } finally {
    await handle.close();
  }
  if ((await sha256File(filePath)) !== entry.sha256) {
    throw new Error(`${entry.path} SHA-256 与 manifest 不一致`);
  }
}

async function walkFiles(root, relative = '') {
  const directory = relative === '' ? root : path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = relative === ''
      ? entry.name
      : `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`发现符号链接：${childRelative}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, childRelative));
    } else if (entry.isFile()) {
      const status = await lstat(path.join(root, ...childRelative.split('/')));
      if (status.nlink !== 1) {
        throw new Error(`发现硬链接：${childRelative}`);
      }
      files.push(childRelative);
    } else {
      throw new Error(`发现非普通文件：${childRelative}`);
    }
  }
  return files;
}

function validateManifestDocument(input, projectId) {
  const root = objectValue(input, 'manifest.json');
  exactFields(root, MANIFEST_FIELDS, 'manifest.json');
  if (
    root.format !== 'vn-engine-runtime-manifest' ||
    root.manifestVersion !== 1 ||
    root.runtimeVersion !== 1 ||
    root.playerCompatibility !== '>=1 <2'
  ) {
    throw new Error('manifest.json 的格式或版本不受支持');
  }
  boundedString(root.buildId, 'manifest.json.buildId', 256);
  if (boundedString(root.projectId, 'manifest.json.projectId', 256) !== projectId) {
    throw new Error('game.json 与 manifest.json 的 Project ID 不一致');
  }
  if (!Number.isSafeInteger(root.sourceRevision) || root.sourceRevision < 0) {
    throw new Error('manifest.json.sourceRevision 必须是非负整数');
  }
  canonicalIsoDate(root.createdAt, 'manifest.json.createdAt');
  if (!Array.isArray(root.files)) {
    throw new Error('manifest.json.files 必须是数组');
  }

  const ids = new Set();
  const paths = new Set();
  return root.files.map((inputFile, index) => {
    const context = `manifest.json.files[${index}]`;
    const file = objectValue(inputFile, context);
    exactFields(file, MANIFEST_FILE_FIELDS, context);
    const assetId = boundedString(file.assetId, `${context}.assetId`, 256);
    const displayName = boundedString(file.displayName, `${context}.displayName`, 4096);
    if (!Object.hasOwn(ASSET_DIRECTORY, file.type)) {
      throw new Error(`${context}.type 无效`);
    }
    const components = safeSegmentedRelativePath(file.path, `${context}.path`);
    if (
      components.length < 3 ||
      components[0] !== 'assets' ||
      components[1] !== ASSET_DIRECTORY[file.type]
    ) {
      throw new Error(`${context}.path 与资源类型目录不一致`);
    }
    const expectedMime = MIME_BY_EXTENSION[path.posix.extname(file.path).toLowerCase()];
    if (expectedMime !== file.mime || TYPE_BY_MIME[file.mime] !== file.type) {
      throw new Error(`${context} 的 type、MIME 与扩展名不一致`);
    }
    if (
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      file.bytes > MAX_BYTES_BY_TYPE[file.type]
    ) {
      throw new Error(`${context}.bytes 不合法`);
    }
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) {
      throw new Error(`${context}.sha256 不合法`);
    }
    if (ids.has(assetId) || paths.has(file.path)) {
      throw new Error('manifest.json 包含重复资源 ID 或路径');
    }
    ids.add(assetId);
    paths.add(file.path);
    return {
      assetId,
      type: file.type,
      displayName,
      path: file.path,
      mime: file.mime,
      bytes: file.bytes,
      sha256: file.sha256,
    };
  });
}

function validateGameDocument(input) {
  const root = objectValue(input, 'game.json');
  exactFields(root, GAME_FIELDS, 'game.json');
  if (root.format !== 'vn-engine-runtime' || root.runtimeVersion !== 1) {
    throw new Error('game.json 的格式或版本不受支持');
  }
  const metadata = objectValue(root.game, 'game.json.game');
  exactFields(metadata, GAME_METADATA_FIELDS, 'game.json.game');
  const projectId = boundedString(metadata.id, 'game.json.game.id', 256);
  boundedString(metadata.title, 'game.json.game.title');
  const entrySceneId = boundedString(metadata.entrySceneId, 'game.json.game.entrySceneId', 256);
  if (!Array.isArray(root.scenes) || root.scenes.length === 0) {
    throw new Error('game.json 至少需要一个场景');
  }
  const sceneIds = new Set();
  for (const [index, sceneInput] of root.scenes.entries()) {
    const scene = objectValue(sceneInput, `game.json.scenes[${index}]`);
    const id = boundedString(scene.id, `game.json.scenes[${index}].id`, 256);
    if (sceneIds.has(id)) {
      throw new Error('game.json 包含重复场景 ID');
    }
    sceneIds.add(id);
  }
  if (!sceneIds.has(entrySceneId)) {
    throw new Error('game.json 的入口场景不存在');
  }
  return projectId;
}

export async function verifyRuntimeBundle(bundleRoot) {
  const root = await canonicalDirectory(bundleRoot, '内容包目录');
  const strictResult = spawnSync(
    process.execPath,
    [VITE_NODE_ENTRY, STRICT_RUNTIME_VERIFIER, '--bundle', root],
    { encoding: 'utf8' },
  );
  if (strictResult.error !== undefined || strictResult.status !== 0) {
    const detail = `${strictResult.stderr ?? ''}${strictResult.stdout ?? ''}`.trim();
    throw new Error(`Player 严格内容包校验失败${detail === '' ? '' : `：${detail}`}`);
  }
  let strictMetadata;
  try {
    strictMetadata = JSON.parse(strictResult.stdout);
  } catch {
    throw new Error('Player 严格内容包校验未返回有效结果');
  }
  const game = await parseJsonFile(root, 'game.json', 16 * 1024 * 1024);
  const manifest = await parseJsonFile(root, 'manifest.json', 16 * 1024 * 1024);
  const projectId = validateGameDocument(game);
  const files = validateManifestDocument(manifest, projectId);
  for (const file of files) {
    await verifyMediaFile(root, file);
  }

  const actualFiles = (await walkFiles(root)).sort();
  const expectedFiles = ['game.json', 'manifest.json', ...files.map((file) => file.path)].sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((file, index) => file !== expectedFiles[index])
  ) {
    throw new Error('内容包含有未列入 manifest 的文件或缺少声明文件');
  }
  if (
    !isObject(strictMetadata) ||
    strictMetadata.projectId !== projectId ||
    strictMetadata.assetCount !== files.length
  ) {
    throw new Error('Player 严格内容包校验结果与最终文件清单不一致');
  }
  return { root, projectId, assetCount: files.length };
}

export async function copyVerifiedDirectory(sourceDirectory, targetDirectory) {
  const source = await canonicalDirectory(sourceDirectory, '源目录');
  if (!path.isAbsolute(targetDirectory) || path.basename(targetDirectory) !== 'game') {
    throw new Error('目标目录必须是绝对路径且目录名为 game');
  }
  if (existsSync(targetDirectory)) {
    throw new Error('目标 game 目录必须不存在');
  }
  await verifyRuntimeBundle(source);
  const files = await walkFiles(source);
  await mkdir(targetDirectory, { recursive: false });
  try {
    for (const relativePath of files) {
      const sourcePath = path.join(source, ...relativePath.split('/'));
      const targetPath = path.join(targetDirectory, ...relativePath.split('/'));
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
    }
    await verifyRuntimeBundle(targetDirectory);
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
  return targetDirectory;
}

async function immediateDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== 'make')
    .map((entry) => path.join(root, entry.name));
}

export async function locatePackagedApplication(outDirectory, platform) {
  const outRoot = await canonicalDirectory(outDirectory, 'Player 输出目录');
  const packageDirectories = await immediateDirectories(outRoot);
  const candidates = [];
  if (platform === 'darwin') {
    for (const packageDirectory of packageDirectories) {
      const children = await readdir(packageDirectory, { withFileTypes: true });
      for (const child of children) {
        if (child.isDirectory() && !child.isSymbolicLink() && child.name.endsWith('.app')) {
          candidates.push(path.join(packageDirectory, child.name));
        }
      }
    }
  } else {
    for (const packageDirectory of packageDirectories) {
      const resources = path.join(packageDirectory, 'resources');
      if (existsSync(resources)) {
        candidates.push(packageDirectory);
      }
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`必须且只能找到一个 ${platform} Player 包，实际为 ${candidates.length} 个`);
  }
  return realpath(candidates[0]);
}

export function expectedPackageDirectoryName(productName, platform, arch) {
  return `${productName}-${platform}-${arch}`;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: options.environment,
  });
  if (result.error !== undefined || result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
    throw new Error(`${command} 验证失败${detail === '' ? '' : `：${detail}`}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function regularNonLinkFile(filePath, context) {
  const status = await lstat(filePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.nlink !== 1 ||
    status.size <= 0
  ) {
    throw new Error(`${context} 必须是非链接普通文件`);
  }
  return status;
}

export function verifyPackagedAsarMetadata(
  appAsar,
  { productName, version, appBundleId },
) {
  let packageBytes;
  try {
    packageBytes = extractAsarFile(appAsar, 'package.json');
  } catch {
    throw new Error('Player app.asar 缺少 package.json');
  }
  if (packageBytes.length === 0 || packageBytes.length > 1024 * 1024) {
    throw new Error('Player app.asar package.json 大小不合法');
  }
  let packageJson;
  try {
    packageJson = JSON.parse(packageBytes.toString('utf8'));
  } catch {
    throw new Error('Player app.asar package.json 不是有效 JSON');
  }
  const metadata = objectValue(packageJson, 'Player app.asar package.json');
  const build = objectValue(
    metadata.vnEnginePlayerBuild,
    'Player app.asar vnEnginePlayerBuild',
  );
  exactFields(
    build,
    ['schemaVersion', 'appBundleId'],
    'Player app.asar vnEnginePlayerBuild',
  );
  if (
    metadata.productName !== productName ||
    metadata.version !== version ||
    build.schemaVersion !== 1 ||
    build.appBundleId !== appBundleId
  ) {
    throw new Error('Player app.asar 构建元数据与预期不一致');
  }
}

function macPlistValue(infoPlist, key) {
  return runChecked(
    'plutil',
    ['-extract', key, 'raw', '-o', '-', infoPlist],
  ).trimEnd();
}

async function readProbe(filePath, maximum = 4096) {
  const status = await regularNonLinkFile(filePath, path.basename(filePath));
  const handle = await open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(maximum, status.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function verifyNativeExecutableArchitecture(executable, platform, arch) {
  if (platform === 'darwin') {
    const expected = arch === 'x64' ? 'x86_64' : 'arm64';
    const actual = runChecked('lipo', ['-archs', executable]).trim().split(/\s+/u);
    if (actual.length !== 1 || actual[0] !== expected) {
      throw new Error(`macOS 主程序架构不是 ${expected}`);
    }
    return;
  }
  const bytes = await readProbe(executable);
  if (platform === 'linux') {
    if (
      bytes.length < 20 ||
      bytes[0] !== 0x7f ||
      bytes.subarray(1, 4).toString('ascii') !== 'ELF' ||
      bytes[5] !== 1
    ) {
      throw new Error('Linux 主程序不是受支持的小端 ELF');
    }
    const expectedMachine = arch === 'x64' ? 62 : 183;
    if (bytes.readUInt16LE(18) !== expectedMachine) {
      throw new Error('Linux 主程序架构与构建架构不一致');
    }
    return;
  }
  if (bytes.length < 64 || bytes.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error('Windows 主程序不是有效 PE 文件');
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (
    peOffset + 6 > bytes.length ||
    bytes.subarray(peOffset, peOffset + 4).toString('binary') !== 'PE\0\0'
  ) {
    throw new Error('Windows 主程序 PE 头无效');
  }
  const expectedMachine = arch === 'x64' ? 0x8664 : 0xaa64;
  if (bytes.readUInt16LE(peOffset + 4) !== expectedMachine) {
    throw new Error('Windows 主程序架构与构建架构不一致');
  }
}

async function verifyBrandIconSource(iconPath, platform) {
  if (iconPath === null || iconPath === undefined) {
    throw new Error('正式发布缺少待验证的品牌图标');
  }
  const source = await realpath(path.resolve(iconPath));
  const status = await regularNonLinkFile(source, '品牌图标');
  const expectedExtension = platform === 'darwin'
    ? '.icns'
    : platform === 'win32'
      ? '.ico'
      : '.png';
  if (path.extname(source).toLowerCase() !== expectedExtension) {
    throw new Error(`品牌图标必须是 ${expectedExtension}`);
  }
  const bytes = await readProbe(source, 16);
  const validMagic = platform === 'darwin'
    ? bytes.subarray(0, 4).toString('ascii') === 'icns'
    : platform === 'win32'
      ? bytes.length >= 4 && bytes.readUInt32LE(0) === 0x00010000
      : bytes.length >= 8 && bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
  if (!validMagic) {
    throw new Error('品牌图标文件头与平台格式不一致');
  }
  return {
    source,
    bytes: status.size,
    sha256: await sha256File(source),
  };
}

async function verifyPackagedPlatformMetadata({
  appRoot,
  resourcesRoot,
  platform,
  arch,
  productName,
  version,
  appBundleId,
  icon,
}) {
  const packageDirectory = platform === 'darwin' ? path.dirname(appRoot) : appRoot;
  if (
    path.basename(packageDirectory) !==
    expectedPackageDirectoryName(productName, platform, arch)
  ) {
    throw new Error('Player 输出目录名与 product/platform/arch 不一致');
  }

  if (platform === 'darwin') {
    if (path.basename(appRoot) !== `${productName}.app`) {
      throw new Error('macOS 应用包名称与 productName 不一致');
    }
    const infoPlist = path.join(appRoot, 'Contents', 'Info.plist');
    await regularNonLinkFile(infoPlist, 'macOS Info.plist');
    const expectedValues = {
      CFBundleIdentifier: appBundleId,
      CFBundleName: productName,
      CFBundleDisplayName: productName,
      CFBundleExecutable: productName,
      CFBundleShortVersionString: version,
      CFBundleVersion: version,
    };
    for (const [key, expected] of Object.entries(expectedValues)) {
      if (macPlistValue(infoPlist, key) !== expected) {
        throw new Error(`macOS Info.plist ${key} 与预期不一致`);
      }
    }
    const executable = path.join(appRoot, 'Contents', 'MacOS', productName);
    const executableStatus = await regularNonLinkFile(executable, 'macOS 主程序');
    if ((executableStatus.mode & 0o111) === 0) {
      throw new Error('macOS 主程序缺少执行权限');
    }
    await verifyNativeExecutableArchitecture(executable, platform, arch);
    if (icon !== null) {
      const iconName = macPlistValue(infoPlist, 'CFBundleIconFile');
      if (path.basename(iconName) !== iconName || iconName.includes('\0')) {
        throw new Error('macOS Info.plist 图标路径不安全');
      }
      const packagedIcon = path.join(resourcesRoot, iconName);
      const packagedStatus = await regularNonLinkFile(packagedIcon, 'macOS 包内图标');
      if (
        packagedStatus.size !== icon.bytes ||
        await sha256File(packagedIcon) !== icon.sha256
      ) {
        throw new Error('macOS 包内图标与已验证品牌图标不一致');
      }
    }
    return;
  }

  const executable = path.join(
    appRoot,
    platform === 'win32' ? `${productName}.exe` : productName,
  );
  const executableStatus = await regularNonLinkFile(
    executable,
    platform === 'win32' ? 'Windows 主程序' : 'Linux 主程序',
  );
  if (platform === 'linux' && (executableStatus.mode & 0o111) === 0) {
    throw new Error('Linux 主程序缺少执行权限');
  }
  await verifyNativeExecutableArchitecture(executable, platform, arch);
  if (platform === 'win32') {
    const invocation = windowsMetadataVerificationInvocation(
      appRoot,
      productName,
      version,
    );
    runChecked(invocation.command, invocation.args, {
      environment: invocation.environment,
    });
  } else if (icon !== null) {
    const packagedIcon = path.join(resourcesRoot, 'vn-player-icon.png');
    const packagedStatus = await regularNonLinkFile(packagedIcon, 'Linux 包内图标');
    if (
      packagedStatus.size !== icon.bytes ||
      await sha256File(packagedIcon) !== icon.sha256
    ) {
      throw new Error('Linux 包内窗口图标与已验证品牌图标不一致');
    }
  }
}

async function verifyMacSignature(appRoot, classification) {
  runChecked('codesign', ['--verify', '--deep', '--strict', appRoot]);
  const details = runChecked('codesign', ['--display', '--verbose=4', appRoot]);
  const hasTeam = /TeamIdentifier=(?!not set\b)\S+/u.test(details);
  const hasDeveloperId = /Authority=Developer ID Application:/u.test(details);
  const hasHardenedRuntime = details.includes('(runtime)');
  if (classification === 'release') {
    if (
      !hasTeam ||
      !hasDeveloperId ||
      !hasHardenedRuntime ||
      /Signature=adhoc/u.test(details)
    ) {
      throw new Error('macOS 正式制品缺少 Developer ID 或 Hardened Runtime');
    }
    runChecked('xcrun', ['stapler', 'validate', appRoot]);
    runChecked('spctl', ['--assess', '--type', 'execute', '--verbose=4', appRoot]);
    return 'developer-id-notarized';
  }
  return hasTeam && hasDeveloperId ? 'developer-id-unpublished' : 'adhoc';
}

async function verifyWindowsSignature(appRoot, classification) {
  if (classification !== 'release') {
    return 'unsigned-or-unverified';
  }
  const invocation = windowsSignatureVerificationInvocation(appRoot);
  runChecked(invocation.command, invocation.args, {
    environment: invocation.environment,
  });
  return 'authenticode';
}

export async function verifyPackagedPlayer({
  outDirectory,
  platform,
  arch,
  mode,
  classification,
  productName,
  version,
  appBundleId,
  iconPath = null,
  gitCommit,
}) {
  if (process.platform !== platform) {
    throw new Error(`必须在 ${platform} runner 上验证 ${platform} 包`);
  }
  const appRoot = await locatePackagedApplication(outDirectory, platform);
  const resourcesRoot = platform === 'darwin'
    ? path.join(appRoot, 'Contents', 'Resources')
    : path.join(appRoot, 'resources');
  const resourcesStatus = await lstat(resourcesRoot);
  if (resourcesStatus.isSymbolicLink() || !resourcesStatus.isDirectory()) {
    throw new Error('Player Resources 目录不合法');
  }
  const appAsar = path.join(resourcesRoot, 'app.asar');
  const asarStatus = await lstat(appAsar);
  if (asarStatus.isSymbolicLink() || !asarStatus.isFile() || asarStatus.size <= 0) {
    throw new Error('Player 缺少有效 app.asar');
  }
  verifyPackagedAsarMetadata(appAsar, {
    productName,
    version,
    appBundleId,
  });
  if (classification === 'release' && iconPath === null) {
    throw new Error('正式发布缺少待验证的品牌图标');
  }
  const icon = iconPath === null
    ? null
    : await verifyBrandIconSource(iconPath, platform);
  await verifyPackagedPlatformMetadata({
    appRoot,
    resourcesRoot,
    platform,
    arch,
    productName,
    version,
    appBundleId,
    icon,
  });
  const gameRoot = path.join(resourcesRoot, 'game');
  let content;
  if (mode === 'generic') {
    if (existsSync(gameRoot)) {
      throw new Error('通用 Player 不得包含 Resources/game');
    }
    content = { mode: 'generic', assetCount: 0, projectId: null };
  } else {
    if (!existsSync(gameRoot)) {
      throw new Error('单游戏 Player 缺少 Resources/game');
    }
    const bundle = await verifyRuntimeBundle(gameRoot);
    content = { mode: 'embedded', assetCount: bundle.assetCount, projectId: bundle.projectId };
  }

  const signature = platform === 'darwin'
    ? await verifyMacSignature(appRoot, classification)
    : platform === 'win32'
      ? await verifyWindowsSignature(appRoot, classification)
      : 'not-applicable';
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    classification,
    platform,
    arch,
    mode,
    productName,
    version,
    appBundleId,
    gitCommit,
    signature,
    content,
    createdAt: new Date().toISOString(),
  };
}

function isDistributable(fileName) {
  const lower = fileName.toLowerCase();
  return DISTRIBUTABLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

async function findDistributables(root, relative = '') {
  const directory = relative === '' ? root : path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    const childRelative = relative === '' ? entry.name : path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`产物目录包含符号链接：${childRelative}`);
    }
    if (entry.isDirectory()) {
      matches.push(...await findDistributables(root, childRelative));
    } else if (entry.isFile() && isDistributable(entry.name)) {
      matches.push(path.join(root, childRelative));
    }
  }
  return matches;
}

export async function collectArtifacts({
  inputDirectory,
  outputDirectory,
  receiptPath,
  classification,
  platform,
  arch,
  version,
  gitCommit,
}) {
  const inputRoot = await canonicalDirectory(inputDirectory, '产物输入目录');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  if (
    !isObject(receipt) ||
    receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
    receipt.classification !== classification ||
    receipt.platform !== platform ||
    receipt.arch !== arch ||
    receipt.version !== version ||
    receipt.gitCommit !== gitCommit
  ) {
    throw new Error('构建回执与待收集产物不一致');
  }
  const artifacts = (await findDistributables(inputRoot)).sort();
  if (artifacts.length === 0) {
    throw new Error('没有找到可分发产物');
  }
  await mkdir(outputDirectory, { recursive: true });
  const names = new Set();
  const files = [];
  for (const artifact of artifacts) {
    const name = path.basename(artifact);
    if (names.has(name)) {
      throw new Error(`不同产物使用了相同文件名：${name}`);
    }
    names.add(name);
    const target = path.join(outputDirectory, name);
    await copyFile(artifact, target, fsConstants.COPYFILE_EXCL);
    const targetStatus = await stat(target);
    files.push({
      name,
      bytes: targetStatus.size,
      sha256: await sha256File(target),
    });
  }
  const receiptName = `build-receipt-${platform}-${arch}.json`;
  await copyFile(receiptPath, path.join(outputDirectory, receiptName), fsConstants.COPYFILE_EXCL);
  const manifest = {
    schemaVersion: ARTIFACT_MANIFEST_SCHEMA_VERSION,
    classification,
    platform,
    arch,
    version,
    gitCommit,
    receipt: receiptName,
    files,
  };
  const manifestName = `artifact-manifest-${platform}-${arch}.json`;
  const checksumName = `SHA256SUMS-${platform}-${arch}.txt`;
  await writeFile(
    path.join(outputDirectory, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  await writeFile(
    path.join(outputDirectory, checksumName),
    `${files.map((file) => `${file.sha256}  ${file.name}`).join('\n')}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return manifest;
}

async function readExactJson(filePath, context) {
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) {
    throw new Error(`${context} 必须是非链接普通文件`);
  }
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error(`${context} 不是有效 JSON`);
  }
}

export async function verifyReleaseSet({
  inputDirectory,
  outputDirectory,
  version,
  gitCommit,
}) {
  const inputRoot = await canonicalDirectory(inputDirectory, 'release 输入目录');
  const entries = await readdir(inputRoot, { withFileTypes: true });
  const manifestNames = entries
    .filter((entry) => entry.isFile() && /^artifact-manifest-(darwin-arm64|win32-x64|linux-x64)\.json$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (manifestNames.length !== RELEASE_TARGETS.length) {
    throw new Error('正式发布必须恰好包含 macOS、Windows、Linux 三个平台清单');
  }

  const combinedFiles = [];
  const receipts = [];
  const seenNames = new Set();
  for (const target of RELEASE_TARGETS) {
    const manifestName = `artifact-manifest-${target.platform}-${target.arch}.json`;
    if (!manifestNames.includes(manifestName)) {
      throw new Error(`缺少正式发布清单：${manifestName}`);
    }
    const manifest = objectValue(
      await readExactJson(path.join(inputRoot, manifestName), manifestName),
      manifestName,
    );
    exactFields(
      manifest,
      ['schemaVersion', 'classification', 'platform', 'arch', 'version', 'gitCommit', 'receipt', 'files'],
      manifestName,
    );
    if (
      manifest.schemaVersion !== ARTIFACT_MANIFEST_SCHEMA_VERSION ||
      manifest.classification !== 'release' ||
      manifest.platform !== target.platform ||
      manifest.arch !== target.arch ||
      manifest.version !== version ||
      manifest.gitCommit !== gitCommit ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== 1 ||
      !manifest.files[0].name.toLowerCase().endsWith('.zip')
    ) {
      throw new Error(`${manifestName} 不满足完整正式发布约定`);
    }
    const receiptName = boundedString(manifest.receipt, `${manifestName}.receipt`, 256);
    if (receiptName !== `build-receipt-${target.platform}-${target.arch}.json`) {
      throw new Error(`${manifestName} 的回执名称无效`);
    }
    const receipt = objectValue(
      await readExactJson(path.join(inputRoot, receiptName), receiptName),
      receiptName,
    );
    if (
      receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION ||
      receipt.classification !== 'release' ||
      receipt.platform !== target.platform ||
      receipt.arch !== target.arch ||
      receipt.version !== version ||
      receipt.gitCommit !== gitCommit ||
      receipt.signature !== target.signature ||
      receipt.mode !== 'generic' ||
      receipt.productName !== 'VN Engine Player' ||
      receipt.appBundleId !== 'com.vnengine.player'
    ) {
      throw new Error(`${receiptName} 的平台、版本、提交或签名门槛无效`);
    }
    exactFields(
      receipt,
      [
        'schemaVersion',
        'classification',
        'platform',
        'arch',
        'mode',
        'productName',
        'version',
        'appBundleId',
        'gitCommit',
        'signature',
        'content',
        'createdAt',
      ],
      receiptName,
    );
    const content = objectValue(receipt.content, `${receiptName}.content`);
    exactFields(content, ['mode', 'assetCount', 'projectId'], `${receiptName}.content`);
    if (
      content.mode !== 'generic' ||
      content.assetCount !== 0 ||
      content.projectId !== null
    ) {
      throw new Error(`${receiptName} 不是通用空壳 Player 回执`);
    }
    canonicalIsoDate(receipt.createdAt, `${receiptName}.createdAt`);
    receipts.push(receiptName);

    const file = objectValue(manifest.files[0], `${manifestName}.files[0]`);
    exactFields(file, ['name', 'bytes', 'sha256'], `${manifestName}.files[0]`);
    const name = boundedString(file.name, `${manifestName}.files[0].name`, 256);
    const expectedArtifactName =
      `VN-Engine-Player-${target.platform}-${target.arch}-${version}.zip`;
    if (
      path.basename(name) !== name ||
      name !== expectedArtifactName ||
      seenNames.has(name)
    ) {
      throw new Error('正式发布产物文件名不安全或重复');
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/u.test(file.sha256)) {
      throw new Error(`${manifestName} 的产物大小或 SHA-256 无效`);
    }
    const artifactPath = path.join(inputRoot, name);
    const artifactStatus = await lstat(artifactPath);
    if (
      artifactStatus.isSymbolicLink() ||
      !artifactStatus.isFile() ||
      artifactStatus.nlink !== 1 ||
      artifactStatus.size !== file.bytes ||
      await sha256File(artifactPath) !== file.sha256
    ) {
      throw new Error(`${name} 与正式发布清单不一致`);
    }
    seenNames.add(name);
    combinedFiles.push({ ...file, platform: target.platform, arch: target.arch });
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const file of combinedFiles) {
    await copyFile(
      path.join(inputRoot, file.name),
      path.join(outputDirectory, file.name),
      fsConstants.COPYFILE_EXCL,
    );
  }
  const sortedFiles = [...combinedFiles].sort((left, right) => left.name.localeCompare(right.name));
  const releaseSet = {
    schemaVersion: RELEASE_SET_SCHEMA_VERSION,
    classification: 'release',
    version,
    gitCommit,
    targets: RELEASE_TARGETS.map(({ platform, arch, signature }) => ({ platform, arch, signature })),
    files: sortedFiles,
    receipts,
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(outputDirectory, 'release-set.json'),
    `${JSON.stringify(releaseSet, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  const checksummedFiles = [
    ...sortedFiles,
    {
      name: 'release-set.json',
      sha256: await sha256File(path.join(outputDirectory, 'release-set.json')),
    },
  ];
  await writeFile(
    path.join(outputDirectory, 'SHA256SUMS'),
    `${checksummedFiles.map((file) => `${file.sha256}  ${file.name}`).join('\n')}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return releaseSet;
}

export async function assertReadableFile(filePath, context) {
  await access(filePath, fsConstants.R_OK);
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) {
    throw new Error(`${context} 必须是非链接普通文件`);
  }
}
