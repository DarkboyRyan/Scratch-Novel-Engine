/**
 * 主要作用：为 Editor 双平台 ZIP 提供定位、结构校验、归档与发布集校验。
 * 关键函数与实现：verifyPackagedEditor、verifyEditorArchive、collectEditorArtifacts、verifyEditorReleaseSet；严格回读原生后端、Web/桌面 Player 模板、架构、签名和 ZIP 内容。
 */
import { extractFile as extractAsarFile } from '@electron/asar';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream, existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yauzl from 'yauzl';

import {
  GENERIC_PLAYER_BUNDLE_ID,
  GENERIC_PLAYER_NAME,
  verifyGenericMacosPlayerTemplate,
} from '../../../player/scripts/lib/macosPlayerTemplate.mjs';
import {
  windowsArchiveInvocation,
  windowsMetadataVerificationInvocation,
  windowsSignatureVerificationInvocation,
} from '../../../player/scripts/lib/windowsPowerShellPolicy.mjs';

export const EDITOR_RECEIPT_SCHEMA_VERSION = 1;
export const EDITOR_ARTIFACT_MANIFEST_SCHEMA_VERSION = 1;
export const EDITOR_RELEASE_SET_SCHEMA_VERSION = 1;
export const EDITOR_PRODUCT_NAME = 'VN Engine Editor';
export const EDITOR_APP_BUNDLE_ID = 'com.vnengine.editor';

const RELEASE_TARGETS = [
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' },
];
const EXACT_TEMPLATE_KEYS = [
  'format',
  'templateVersion',
  'platform',
  'arch',
  'playerVersion',
  'runtimeCompatibility',
  'payloadRoot',
  'artifactEntry',
  'gameResourceDirectory',
  'applicationMetadataFile',
  'macosInfoPlistFile',
];
const EXACT_WEB_KEYS = [
  'format',
  'templateVersion',
  'payloadRoot',
  'entry',
  'runtimeCompatibility',
  'playerVersion',
  'files',
];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactFields(value, fields, context) {
  if (!isObject(value)) {
    throw new Error(`${context} 必须是对象`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${context} 字段不符合 exact 契约`);
  }
}

export function validateVersion(value, context = '版本') {
  if (
    typeof value !== 'string' ||
    value.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value)
  ) {
    throw new Error(`${context} 必须是 x.y.z 数字版本`);
  }
  return value;
}

export function validateCommit(value, classification) {
  if (
    !/^[a-f0-9]{40}$/u.test(value) &&
    !(classification === 'internal' && value === 'local')
  ) {
    throw new Error('提交必须是 40 位小写 Git SHA；internal 可使用 local');
  }
  return value;
}

function safeRelativePath(value, context) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1024 ||
    value.includes('\0') ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((segment) =>
      segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`${context} 不是安全的相对路径`);
  }
  return value;
}

function runChecked(command, args, environment = process.env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: environment });
  if (result.error !== undefined || result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim();
    throw new Error(`${command} 执行失败${detail === '' ? '' : `：${detail}`}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function regularFile(filePath, context, allowHardlink = false) {
  const status = await lstat(filePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.size <= 0 ||
    (!allowHardlink && status.nlink !== 1)
  ) {
    throw new Error(`${context} 必须是非链接普通文件`);
  }
  return status;
}

async function canonicalDirectory(directory, context) {
  if (!path.isAbsolute(directory) || directory.includes('\0')) {
    throw new Error(`${context} 必须是安全的绝对路径`);
  }
  const status = await lstat(directory);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${context} 必须是非链接目录`);
  }
  return realpath(directory);
}

async function prepareEmptyOutputDirectory(directory, context) {
  const requested = path.resolve(directory);
  await mkdir(requested, { recursive: true });
  const root = await canonicalDirectory(requested, context);
  if ((await readdir(root)).length !== 0) {
    throw new Error(`${context} 必须为空`);
  }
  return root;
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function fileRecord(root, relativePath) {
  const safePath = safeRelativePath(relativePath, '关键文件路径');
  const filePath = path.join(root, ...safePath.split('/'));
  const status = await regularFile(filePath, safePath);
  return { path: safePath, bytes: status.size, sha256: await hashFile(filePath) };
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function snapshotApplicationTree(root, platform, relative = '') {
  const directory = relative === '' ? root : path.join(root, ...relative.split('/'));
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  const records = [];
  for (const entry of entries) {
    const relativePath = relative === '' ? entry.name : `${relative}/${entry.name}`;
    safeRelativePath(relativePath, 'Editor 应用树路径');
    const entryPath = path.join(root, ...relativePath.split('/'));
    const status = await lstat(entryPath);
    const mode = platform === 'darwin' ? status.mode & 0o777 : 0;
    if (status.isSymbolicLink()) {
      if (platform !== 'darwin') {
        throw new Error(`Windows Editor 应用树不得包含符号链接：${relativePath}`);
      }
      const target = await readlink(entryPath);
      if (
        target.length === 0 ||
        target.length > 1024 ||
        target.includes('\0') ||
        path.isAbsolute(target)
      ) {
        throw new Error(`Editor 应用树符号链接目标不安全：${relativePath}`);
      }
      let resolvedTarget;
      try {
        resolvedTarget = await realpath(entryPath);
      } catch {
        throw new Error(`Editor 应用树包含悬空符号链接：${relativePath}`);
      }
      if (!isContained(root, resolvedTarget)) {
        throw new Error(`Editor 应用树符号链接逃逸应用目录：${relativePath}`);
      }
      const bytes = Buffer.from(target, 'utf8');
      records.push({
        path: relativePath,
        type: 'symlink',
        bytes: bytes.length,
        sha256: sha256Bytes(bytes),
        mode,
        linkTarget: target,
      });
    } else if (status.isDirectory()) {
      records.push({
        path: relativePath,
        type: 'directory',
        bytes: 0,
        sha256: null,
        mode,
        linkTarget: null,
      });
      records.push(...await snapshotApplicationTree(root, platform, relativePath));
    } else if (status.isFile()) {
      records.push({
        path: relativePath,
        type: 'file',
        bytes: status.size,
        sha256: await hashFile(entryPath),
        mode,
        linkTarget: null,
      });
    } else {
      throw new Error(`Editor 应用树包含不支持的文件类型：${relativePath}`);
    }
  }
  return records;
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function immediateDirectories(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) =>
      entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== 'make')
    .map((entry) => path.join(root, entry.name));
}

export async function locatePackagedEditor(outDirectory, platform) {
  if (!['darwin', 'win32'].includes(platform)) {
    throw new Error('Editor 平台必须是 darwin 或 win32');
  }
  const outRoot = await canonicalDirectory(path.resolve(outDirectory), 'Editor 输出目录');
  const candidates = [];
  for (const packageDirectory of await immediateDirectories(outRoot)) {
    if (platform === 'darwin') {
      for (const child of await readdir(packageDirectory, { withFileTypes: true })) {
        if (
          child.isDirectory() &&
          !child.isSymbolicLink() &&
          child.name.endsWith('.app')
        ) {
          candidates.push(path.join(packageDirectory, child.name));
        }
      }
    } else if (existsSync(path.join(packageDirectory, 'resources'))) {
      candidates.push(packageDirectory);
    }
  }
  if (candidates.length !== 1) {
    throw new Error(
      `必须且只能找到一个 ${platform} Editor 包，实际为 ${candidates.length} 个`,
    );
  }
  return realpath(candidates[0]);
}

function expectedPackageDirectory(productName, platform, arch) {
  return `${productName}-${platform}-${arch}`;
}

export function expectedEditorArtifactName(platform, arch, version) {
  return `VN-Engine-Editor-${platform}-${arch}-${version}.zip`;
}

export function verifyEditorAsarMetadata(
  appAsar,
  { productName, version, appBundleId },
) {
  let bytes;
  try {
    bytes = extractAsarFile(appAsar, 'package.json');
  } catch {
    throw new Error('Editor app.asar 缺少 package.json');
  }
  if (bytes.length === 0 || bytes.length > 1024 * 1024) {
    throw new Error('Editor app.asar package.json 大小不合法');
  }
  let metadata;
  try {
    metadata = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Editor app.asar package.json 不是有效 JSON');
  }
  exactFields(
    metadata.vnEngineEditorBuild,
    ['schemaVersion', 'appBundleId'],
    'vnEngineEditorBuild',
  );
  if (
    metadata.name !== 'editor' ||
    metadata.productName !== productName ||
    metadata.version !== version ||
    metadata.vnEngineEditorBuild.schemaVersion !== 1 ||
    metadata.vnEngineEditorBuild.appBundleId !== appBundleId
  ) {
    throw new Error('Editor app.asar 构建元数据与预期不一致');
  }
}

async function readProbe(filePath, maximum = 1024 * 1024) {
  const status = await regularFile(filePath, path.basename(filePath));
  const handle = await open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(maximum, status.size));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function assertPeArchitecture(bytes, arch, context = 'Windows 可执行文件') {
  if (bytes.length < 64 || bytes.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error(`${context} 不是有效 PE 文件`);
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (
    peOffset + 6 > bytes.length ||
    bytes.subarray(peOffset, peOffset + 4).toString('binary') !== 'PE\0\0'
  ) {
    throw new Error(`${context} PE 头无效`);
  }
  const expected = arch === 'x64' ? 0x8664 : 0xaa64;
  if (bytes.readUInt16LE(peOffset + 4) !== expected) {
    throw new Error(`${context} 架构与 ${arch} 不一致`);
  }
}

async function verifyExecutableArchitecture(executable, platform, arch, context) {
  if (platform === 'darwin') {
    const expected = arch === 'arm64' ? 'arm64' : 'x86_64';
    const actual = runChecked('lipo', ['-archs', executable]).trim().split(/\s+/u);
    if (actual.length !== 1 || actual[0] !== expected) {
      throw new Error(`${context} 架构必须为 ${expected}`);
    }
    return;
  }
  assertPeArchitecture(await readProbe(executable), arch, context);
}

async function walkRegularFiles(root, relative = '') {
  const directory = relative === '' ? root : path.join(root, ...relative.split('/'));
  const status = await lstat(directory);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('模板目录树包含不安全目录');
  }
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
    safeRelativePath(child, '模板文件路径');
    if (entry.isSymbolicLink()) {
      throw new Error(`模板目录树包含符号链接：${child}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walkRegularFiles(root, child));
    } else if (entry.isFile()) {
      await regularFile(path.join(root, ...child.split('/')), child);
      files.push(child);
    } else {
      throw new Error(`模板目录树包含不支持的文件类型：${child}`);
    }
  }
  return files;
}

async function readJsonFile(filePath, context, maximum = 64 * 1024) {
  const status = await regularFile(filePath, context);
  if (status.size > maximum) {
    throw new Error(`${context} 过大`);
  }
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new Error(`${context} 不是有效 JSON`);
  }
}

async function verifyWebTemplate(root, expectedPlayerVersion) {
  const manifestPath = path.join(root, 'web-player-template.json');
  const manifest = await readJsonFile(manifestPath, 'web-player-template.json');
  exactFields(manifest, EXACT_WEB_KEYS, 'web-player-template.json');
  validateVersion(manifest.playerVersion, 'Web Player 版本');
  if (
    manifest.format !== 'vn-engine-web-player-template' ||
    manifest.templateVersion !== 1 ||
    manifest.payloadRoot !== 'payload' ||
    manifest.entry !== 'index.html' ||
    manifest.runtimeCompatibility !== '>=1 <11' ||
    manifest.playerVersion !== expectedPlayerVersion ||
    !Array.isArray(manifest.files) ||
    manifest.files.length < 2
  ) {
    throw new Error('Web Player 模板清单不符合 exact 契约');
  }
  const declared = [];
  for (const record of manifest.files) {
    exactFields(record, ['path', 'bytes', 'sha256'], 'Web Player 文件记录');
    const relativePath = safeRelativePath(record.path, 'Web Player 文件路径');
    if (
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0 ||
      typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(record.sha256)
    ) {
      throw new Error('Web Player 文件记录无效');
    }
    declared.push(relativePath);
    const payloadFile = path.join(root, 'payload', ...relativePath.split('/'));
    const status = await regularFile(payloadFile, relativePath);
    if (status.size !== record.bytes || await hashFile(payloadFile) !== record.sha256) {
      throw new Error(`Web Player 模板文件与清单不一致：${relativePath}`);
    }
  }
  if (
    declared[0] !== 'index.html' ||
    !declared.some((file) => /^player-assets\/player-[^/]+\.js$/u.test(file)) ||
    declared.some((file, index) => index > 0 && declared[index - 1] >= file)
  ) {
    throw new Error('Web Player 模板文件顺序或入口无效');
  }
  const actual = await walkRegularFiles(path.join(root, 'payload'));
  if (actual.length !== declared.length || actual.some((file, index) => file !== declared[index])) {
    throw new Error('Web Player 模板存在未声明、缺失或顺序异常的文件');
  }
  const manifestStatus = await regularFile(manifestPath, 'web-player-template.json');
  return {
    playerVersion: manifest.playerVersion,
    fileCount: declared.length,
    bytes: manifestStatus.size,
    sha256: await hashFile(manifestPath),
  };
}

function expectedTemplatePaths(platform) {
  return platform === 'darwin'
    ? {
        artifactEntry: 'VN Engine Player.app',
        gameResourceDirectory: 'Contents/Resources/game',
        applicationMetadataFile: 'Contents/Resources/vn-game-application.json',
        macosInfoPlistFile: 'Contents/Info.plist',
      }
    : {
        artifactEntry: 'VN Engine Player-win32-x64',
        gameResourceDirectory: 'resources/game',
        applicationMetadataFile: 'resources/vn-game-application.json',
        macosInfoPlistFile: null,
      };
}

async function verifyWindowsPlayerTemplate(artifactRoot, arch, version) {
  if (path.basename(artifactRoot) !== 'VN Engine Player-win32-x64') {
    throw new Error('Windows Player 模板目录名无效');
  }
  const executable = path.join(artifactRoot, `${GENERIC_PLAYER_NAME}.exe`);
  await regularFile(executable, 'Windows Player 模板主程序');
  await verifyExecutableArchitecture(executable, 'win32', arch, 'Windows Player 模板主程序');
  const resources = path.join(artifactRoot, 'resources');
  await canonicalDirectory(resources, 'Windows Player 模板 resources');
  if (
    existsSync(path.join(resources, 'game')) ||
    existsSync(path.join(resources, 'vn-game-application.json'))
  ) {
    throw new Error('Windows Player 模板不得预先包含游戏内容或应用元数据');
  }
  const appAsar = path.join(resources, 'app.asar');
  await regularFile(appAsar, 'Windows Player 模板 app.asar');
  const { verifyPackagedAsarMetadata } = await import(
    '../../../player/scripts/lib/releaseTools.mjs'
  );
  verifyPackagedAsarMetadata(appAsar, {
    productName: GENERIC_PLAYER_NAME,
    version,
    appBundleId: GENERIC_PLAYER_BUNDLE_ID,
  });
  const invocation = windowsMetadataVerificationInvocation(
    artifactRoot,
    GENERIC_PLAYER_NAME,
    version,
  );
  runChecked(invocation.command, invocation.args, invocation.environment);
}

async function verifyPlayerTemplate(root, platform, arch, expectedPlayerVersion) {
  const targetName = `${platform}-${arch}`;
  const entries = await readdir(root, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0].isDirectory() ||
    entries[0].isSymbolicLink() ||
    entries[0].name !== targetName
  ) {
    throw new Error(`Editor 必须只包含同平台 Player 模板 ${targetName}`);
  }
  const templateRoot = path.join(root, targetName);
  const manifestPath = path.join(templateRoot, 'player-template.json');
  const manifest = await readJsonFile(manifestPath, 'player-template.json');
  exactFields(manifest, EXACT_TEMPLATE_KEYS, 'player-template.json');
  const expectedPaths = expectedTemplatePaths(platform);
  if (
    manifest.format !== 'vn-engine-player-template' ||
    manifest.templateVersion !== 1 ||
    manifest.platform !== platform ||
    manifest.arch !== arch ||
    manifest.playerVersion !== expectedPlayerVersion ||
    manifest.runtimeCompatibility !== '>=1 <11' ||
    manifest.payloadRoot !== 'payload' ||
    Object.entries(expectedPaths).some(([key, value]) => manifest[key] !== value)
  ) {
    throw new Error('Player 模板清单不符合目标平台 exact 契约');
  }
  const artifactRoot = path.join(
    templateRoot,
    'payload',
    ...manifest.artifactEntry.split('/'),
  );
  const artifactStatus = await lstat(artifactRoot);
  if (artifactStatus.isSymbolicLink() || !artifactStatus.isDirectory()) {
    throw new Error('Player 模板 payload 入口必须是非链接目录');
  }
  if (platform === 'darwin') {
    await verifyGenericMacosPlayerTemplate({
      appPath: artifactRoot,
      arch,
      version: expectedPlayerVersion,
      rejectHardlinks: true,
    });
  } else {
    await verifyWindowsPlayerTemplate(artifactRoot, arch, expectedPlayerVersion);
  }
  const manifestStatus = await regularFile(manifestPath, 'player-template.json');
  return {
    playerVersion: manifest.playerVersion,
    artifactEntry: manifest.artifactEntry,
    bytes: manifestStatus.size,
    sha256: await hashFile(manifestPath),
  };
}

function plistValue(infoPlist, key) {
  return runChecked('plutil', ['-extract', key, 'raw', '-o', '-', infoPlist]).trimEnd();
}

async function verifyPlatformMetadata({
  appRoot,
  resourcesRoot,
  platform,
  arch,
  productName,
  version,
  appBundleId,
}) {
  const packageDirectory = platform === 'darwin' ? path.dirname(appRoot) : appRoot;
  if (path.basename(packageDirectory) !== expectedPackageDirectory(productName, platform, arch)) {
    throw new Error('Editor 输出目录名与 product/platform/arch 不一致');
  }
  if (platform === 'darwin') {
    if (path.basename(appRoot) !== `${productName}.app`) {
      throw new Error('macOS Editor 应用包名称无效');
    }
    const plist = path.join(appRoot, 'Contents', 'Info.plist');
    await regularFile(plist, 'Editor Info.plist');
    const expected = {
      CFBundleIdentifier: appBundleId,
      CFBundleName: productName,
      CFBundleDisplayName: productName,
      CFBundleExecutable: productName,
      CFBundleShortVersionString: version,
      CFBundleVersion: version,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (plistValue(plist, key) !== value) {
        throw new Error(`Editor Info.plist ${key} 与预期不一致`);
      }
    }
    const executable = path.join(appRoot, 'Contents', 'MacOS', productName);
    const executableStatus = await regularFile(executable, 'macOS Editor 主程序');
    if ((executableStatus.mode & 0o111) === 0) {
      throw new Error('macOS Editor 主程序缺少执行权限');
    }
    await verifyExecutableArchitecture(executable, platform, arch, 'macOS Editor 主程序');
    return executable;
  }
  const executable = path.join(appRoot, `${productName}.exe`);
  await regularFile(executable, 'Windows Editor 主程序');
  await verifyExecutableArchitecture(executable, platform, arch, 'Windows Editor 主程序');
  const invocation = windowsMetadataVerificationInvocation(appRoot, productName, version);
  runChecked(invocation.command, invocation.args, invocation.environment);
  return executable;
}

async function verifySignature(appRoot, platform, classification) {
  if (platform === 'darwin') {
    runChecked('codesign', ['--verify', '--deep', '--strict', appRoot]);
    const details = runChecked('codesign', ['--display', '--verbose=4', appRoot]);
    if (classification === 'internal') {
      if (!/Signature=adhoc/u.test(details)) {
        throw new Error('internal macOS Editor 必须是明确的 ad-hoc 签名');
      }
      return 'adhoc';
    }
    if (
      !/TeamIdentifier=(?!not set\b)\S+/u.test(details) ||
      !/Authority=Developer ID Application:/u.test(details) ||
      !details.includes('(runtime)') ||
      /Signature=adhoc/u.test(details)
    ) {
      throw new Error('正式 macOS Editor 缺少 Developer ID 或 Hardened Runtime');
    }
    runChecked('xcrun', ['stapler', 'validate', appRoot]);
    runChecked('spctl', ['--assess', '--type', 'execute', '--verbose=4', appRoot]);
    return 'developer-id-notarized';
  }
  if (classification === 'internal') {
    return 'unsigned-or-unverified';
  }
  const invocation = windowsSignatureVerificationInvocation(appRoot);
  runChecked(invocation.command, invocation.args, invocation.environment);
  return 'authenticode';
}

function relativeResourcePath(platform, ...parts) {
  return platform === 'darwin'
    ? ['Contents', 'Resources', ...parts].join('/')
    : ['resources', ...parts].join('/');
}

export async function verifyPackagedEditor({
  outDirectory,
  platform,
  arch,
  classification,
  productName,
  version,
  appBundleId,
  playerVersion,
  gitCommit,
}) {
  if (process.platform !== platform) {
    throw new Error(`必须在 ${platform} runner 上验证 ${platform} Editor`);
  }
  if (!['darwin', 'win32'].includes(platform)) {
    throw new Error('Editor 发布只支持 darwin 和 win32');
  }
  if (!['arm64', 'x64'].includes(arch)) {
    throw new Error('Editor 架构只支持 arm64 和 x64');
  }
  if (
    (platform === 'darwin' && arch !== 'arm64') ||
    (platform === 'win32' && arch !== 'x64')
  ) {
    throw new Error('Editor 发布目标必须是 darwin-arm64 或 win32-x64');
  }
  if (!['internal', 'release'].includes(classification)) {
    throw new Error('classification 必须是 internal 或 release');
  }
  validateVersion(version, 'Editor 版本');
  validateVersion(playerVersion, 'Player 版本');
  validateCommit(gitCommit, classification);
  if (productName !== EDITOR_PRODUCT_NAME || appBundleId !== EDITOR_APP_BUNDLE_ID) {
    throw new Error('Editor 产品名或 bundle ID 与发布约定不一致');
  }

  const appRoot = await locatePackagedEditor(outDirectory, platform);
  const resourcesRoot = platform === 'darwin'
    ? path.join(appRoot, 'Contents', 'Resources')
    : path.join(appRoot, 'resources');
  await canonicalDirectory(resourcesRoot, 'Editor Resources');
  const appAsar = path.join(resourcesRoot, 'app.asar');
  await regularFile(appAsar, 'Editor app.asar');
  verifyEditorAsarMetadata(appAsar, { productName, version, appBundleId });
  const mainExecutable = await verifyPlatformMetadata({
    appRoot,
    resourcesRoot,
    platform,
    arch,
    productName,
    version,
    appBundleId,
  });

  const backendName = platform === 'win32' ? 'vn_engine_backend.exe' : 'vn_engine_backend';
  const backend = path.join(resourcesRoot, 'backend', backendName);
  const backendStatus = await regularFile(backend, 'Editor C++ backend');
  if (platform === 'darwin' && (backendStatus.mode & 0o111) === 0) {
    throw new Error('Editor C++ backend 缺少执行权限');
  }
  await verifyExecutableArchitecture(backend, platform, arch, 'Editor C++ backend');

  const webTemplate = await verifyWebTemplate(
    path.join(resourcesRoot, 'web-player-template'),
    playerVersion,
  );
  const playerTemplate = await verifyPlayerTemplate(
    path.join(resourcesRoot, 'player-templates'),
    platform,
    arch,
    playerVersion,
  );
  const signature = await verifySignature(appRoot, platform, classification);

  const executableRelative = platform === 'darwin'
    ? `Contents/MacOS/${productName}`
    : `${productName}.exe`;
  const criticalFiles = await Promise.all([
    fileRecord(appRoot, executableRelative),
    fileRecord(appRoot, relativeResourcePath(platform, 'app.asar')),
    fileRecord(appRoot, relativeResourcePath(platform, 'backend', backendName)),
    fileRecord(appRoot, relativeResourcePath(
      platform,
      'web-player-template',
      'web-player-template.json',
    )),
    fileRecord(appRoot, relativeResourcePath(
      platform,
      'player-templates',
      `${platform}-${arch}`,
      'player-template.json',
    )),
  ]);
  criticalFiles.sort((left, right) => comparePaths(left.path, right.path));
  const applicationEntries = await snapshotApplicationTree(appRoot, platform);

  return {
    schemaVersion: EDITOR_RECEIPT_SCHEMA_VERSION,
    classification,
    platform,
    arch,
    productName,
    version,
    appBundleId,
    playerVersion,
    gitCommit,
    signature,
    applicationRootName: path.basename(appRoot),
    content: {
      backend: {
        bytes: backendStatus.size,
        sha256: await hashFile(backend),
      },
      webTemplate,
      playerTemplate,
    },
    criticalFiles,
    applicationEntries,
    createdAt: new Date().toISOString(),
  };
}

function openZip(archivePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      archivePath,
      {
        autoClose: false,
        lazyEntries: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, zip) => error === null ? resolve(zip) : reject(error),
    );
  });
}

function hashZipEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error !== null) {
        reject(error);
        return;
      }
      const hash = createHash('sha256');
      let bytes = 0;
      stream.on('data', (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve({ bytes, sha256: hash.digest('hex') }));
    });
  });
}

function containedPosixPath(candidate) {
  return candidate !== '..' &&
    !candidate.startsWith('../') &&
    !path.posix.isAbsolute(candidate);
}

function resolveDeclaredApplicationPath(initialPath, applicationByPath) {
  let candidate = path.posix.normalize(initialPath);
  const visitedLinks = new Set();
  const maximumSteps = applicationByPath.size + 1;
  for (let step = 0; step < maximumSteps; step += 1) {
    if (!containedPosixPath(candidate)) {
      throw new Error('Editor receipt 符号链接解析逃逸应用目录');
    }
    const components = candidate.split('/');
    let substituted = false;
    for (let index = 1; index <= components.length; index += 1) {
      const prefix = components.slice(0, index).join('/');
      const entry = applicationByPath.get(prefix);
      if (entry?.type !== 'symlink') {
        continue;
      }
      if (visitedLinks.has(prefix)) {
        throw new Error('Editor receipt 符号链接包含循环');
      }
      visitedLinks.add(prefix);
      const resolvedPrefix = path.posix.normalize(path.posix.join(
        path.posix.dirname(prefix),
        entry.linkTarget,
      ));
      candidate = path.posix.normalize(path.posix.join(
        resolvedPrefix,
        ...components.slice(index),
      ));
      substituted = true;
      break;
    }
    if (!substituted) {
      if (!applicationByPath.has(candidate)) {
        throw new Error('Editor receipt 符号链接目标未被完整应用树声明');
      }
      return candidate;
    }
  }
  throw new Error('Editor receipt 符号链接解析超过安全深度');
}

export function validateEditorReceipt(receipt) {
  exactFields(receipt, [
    'schemaVersion',
    'classification',
    'platform',
    'arch',
    'productName',
    'version',
    'appBundleId',
    'playerVersion',
    'gitCommit',
    'signature',
    'applicationRootName',
    'content',
    'criticalFiles',
    'applicationEntries',
    'createdAt',
  ], 'Editor build receipt');
  if (
    receipt.schemaVersion !== EDITOR_RECEIPT_SCHEMA_VERSION ||
    !['internal', 'release'].includes(receipt.classification) ||
    receipt.productName !== EDITOR_PRODUCT_NAME ||
    receipt.appBundleId !== EDITOR_APP_BUNDLE_ID ||
    !RELEASE_TARGETS.some((target) =>
      target.platform === receipt.platform && target.arch === receipt.arch) ||
    !Array.isArray(receipt.criticalFiles) ||
    receipt.criticalFiles.length !== 5 ||
    !Array.isArray(receipt.applicationEntries) ||
    receipt.applicationEntries.length < receipt.criticalFiles.length ||
    typeof receipt.createdAt !== 'string' ||
    Number.isNaN(Date.parse(receipt.createdAt)) ||
    new Date(receipt.createdAt).toISOString() !== receipt.createdAt
  ) {
    throw new Error('Editor build receipt 基本字段无效');
  }
  validateVersion(receipt.version, 'Editor receipt 版本');
  validateVersion(receipt.playerVersion, 'Player receipt 版本');
  validateCommit(receipt.gitCommit, receipt.classification);
  const expectedRootName = receipt.platform === 'darwin'
    ? `${EDITOR_PRODUCT_NAME}.app`
    : expectedPackageDirectory(EDITOR_PRODUCT_NAME, receipt.platform, receipt.arch);
  if (receipt.applicationRootName !== expectedRootName) {
    throw new Error('Editor receipt 应用根目录名无效');
  }
  exactFields(receipt.content, [
    'backend', 'webTemplate', 'playerTemplate',
  ], 'Editor receipt content');
  exactFields(receipt.content.backend, ['bytes', 'sha256'], 'Editor receipt backend');
  exactFields(
    receipt.content.webTemplate,
    ['playerVersion', 'fileCount', 'bytes', 'sha256'],
    'Editor receipt Web template',
  );
  exactFields(
    receipt.content.playerTemplate,
    ['playerVersion', 'artifactEntry', 'bytes', 'sha256'],
    'Editor receipt Player template',
  );
  for (const record of [
    receipt.content.backend,
    receipt.content.webTemplate,
    receipt.content.playerTemplate,
  ]) {
    if (
      !Number.isSafeInteger(record.bytes) ||
      record.bytes <= 0 ||
      typeof record.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(record.sha256)
    ) {
      throw new Error('Editor receipt content 哈希记录无效');
    }
  }
  if (
    receipt.content.webTemplate.playerVersion !== receipt.playerVersion ||
    !Number.isSafeInteger(receipt.content.webTemplate.fileCount) ||
    receipt.content.webTemplate.fileCount < 2 ||
    receipt.content.playerTemplate.playerVersion !== receipt.playerVersion ||
    receipt.content.playerTemplate.artifactEntry !==
      expectedTemplatePaths(receipt.platform).artifactEntry
  ) {
    throw new Error('Editor receipt 模板版本或平台入口无效');
  }
  const seenCriticalPaths = new Set();
  for (const file of receipt.criticalFiles) {
    exactFields(file, ['path', 'bytes', 'sha256'], 'Editor receipt 关键文件');
    safeRelativePath(file.path, 'Editor receipt 关键文件路径');
    if (
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(file.sha256)
    ) {
      throw new Error('Editor receipt 关键文件记录无效');
    }
    if (seenCriticalPaths.has(file.path)) {
      throw new Error('Editor receipt 关键文件路径重复');
    }
    seenCriticalPaths.add(file.path);
  }
  const seenApplicationPaths = new Set();
  for (const entry of receipt.applicationEntries) {
    exactFields(
      entry,
      ['path', 'type', 'bytes', 'sha256', 'mode', 'linkTarget'],
      'Editor receipt 应用树记录',
    );
    safeRelativePath(entry.path, 'Editor receipt 应用树路径');
    if (
      !['file', 'directory', 'symlink'].includes(entry.type) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !Number.isSafeInteger(entry.mode) ||
      entry.mode < 0 ||
      entry.mode > 0o777 ||
      seenApplicationPaths.has(entry.path)
    ) {
      throw new Error('Editor receipt 应用树记录无效或重复');
    }
    if (receipt.platform === 'win32' && (entry.mode !== 0 || entry.type === 'symlink')) {
      throw new Error('Windows Editor receipt 不得声明 POSIX mode 或 symlink');
    }
    if (entry.type === 'directory') {
      if (entry.bytes !== 0 || entry.sha256 !== null || entry.linkTarget !== null) {
        throw new Error('Editor receipt 目录记录无效');
      }
    } else if (
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256)
    ) {
      throw new Error('Editor receipt 文件或链接哈希记录无效');
    }
    if (entry.type === 'file' && entry.linkTarget !== null) {
      throw new Error('Editor receipt 普通文件不得声明 linkTarget');
    }
    if (
      entry.type === 'symlink' &&
      (
        typeof entry.linkTarget !== 'string' ||
        entry.bytes <= 0 ||
        entry.linkTarget.length === 0 ||
        entry.linkTarget.length > 1024 ||
        entry.linkTarget.includes('\0') ||
        path.posix.isAbsolute(entry.linkTarget) ||
        entry.bytes !== Buffer.byteLength(entry.linkTarget, 'utf8') ||
        entry.sha256 !== sha256Bytes(Buffer.from(entry.linkTarget, 'utf8')) ||
        (() => {
          const normalizedTarget = path.posix.normalize(path.posix.join(
            path.posix.dirname(entry.path),
            entry.linkTarget,
          ));
          return !containedPosixPath(normalizedTarget);
        })()
      )
    ) {
      throw new Error('Editor receipt 符号链接目标无效或逃逸应用目录');
    }
    seenApplicationPaths.add(entry.path);
  }
  const sortedApplicationPaths = [...seenApplicationPaths].sort(comparePaths);
  if (sortedApplicationPaths.some((entryPath, index) =>
    receipt.applicationEntries[index]?.path !== entryPath)) {
    throw new Error('Editor receipt 应用树记录必须按路径严格排序');
  }
  const backendName = receipt.platform === 'win32'
    ? 'vn_engine_backend.exe'
    : 'vn_engine_backend';
  const expectedCriticalPaths = [
    receipt.platform === 'darwin'
      ? `Contents/MacOS/${EDITOR_PRODUCT_NAME}`
      : `${EDITOR_PRODUCT_NAME}.exe`,
    relativeResourcePath(receipt.platform, 'app.asar'),
    relativeResourcePath(receipt.platform, 'backend', backendName),
    relativeResourcePath(
      receipt.platform,
      'web-player-template',
      'web-player-template.json',
    ),
    relativeResourcePath(
      receipt.platform,
      'player-templates',
      `${receipt.platform}-${receipt.arch}`,
      'player-template.json',
    ),
  ].sort();
  if (
    expectedCriticalPaths.some((filePath, index) =>
      receipt.criticalFiles[index]?.path !== filePath)
  ) {
    throw new Error('Editor receipt 关键文件集合无效');
  }
  const criticalByPath = new Map(
    receipt.criticalFiles.map((file) => [file.path, file]),
  );
  const backendRecord = criticalByPath.get(
    relativeResourcePath(receipt.platform, 'backend', backendName),
  );
  const webRecord = criticalByPath.get(relativeResourcePath(
    receipt.platform,
    'web-player-template',
    'web-player-template.json',
  ));
  const playerRecord = criticalByPath.get(relativeResourcePath(
    receipt.platform,
    'player-templates',
    `${receipt.platform}-${receipt.arch}`,
    'player-template.json',
  ));
  if (
    backendRecord.bytes !== receipt.content.backend.bytes ||
    backendRecord.sha256 !== receipt.content.backend.sha256 ||
    webRecord.bytes !== receipt.content.webTemplate.bytes ||
    webRecord.sha256 !== receipt.content.webTemplate.sha256 ||
    playerRecord.bytes !== receipt.content.playerTemplate.bytes ||
    playerRecord.sha256 !== receipt.content.playerTemplate.sha256
  ) {
    throw new Error('Editor receipt content 与关键文件记录不一致');
  }
  const applicationByPath = new Map(
    receipt.applicationEntries.map((entry) => [entry.path, entry]),
  );
  for (const entry of receipt.applicationEntries) {
    if (entry.type !== 'symlink') {
      continue;
    }
    const normalizedTarget = path.posix.normalize(path.posix.join(
      path.posix.dirname(entry.path),
      entry.linkTarget,
    ));
    resolveDeclaredApplicationPath(normalizedTarget, applicationByPath);
  }
  for (const critical of receipt.criticalFiles) {
    const applicationEntry = applicationByPath.get(critical.path);
    if (
      applicationEntry?.type !== 'file' ||
      applicationEntry.bytes !== critical.bytes ||
      applicationEntry.sha256 !== critical.sha256
    ) {
      throw new Error('Editor receipt 关键文件未被完整应用树覆盖');
    }
  }
  const expectedSignature = receipt.classification === 'release'
    ? receipt.platform === 'darwin' ? 'developer-id-notarized' : 'authenticode'
    : receipt.platform === 'darwin' ? 'adhoc' : 'unsigned-or-unverified';
  if (receipt.signature !== expectedSignature) {
    throw new Error('Editor receipt 签名分类无效');
  }
  return receipt;
}

export async function verifyEditorArchive(archivePath, receiptInput) {
  const receipt = validateEditorReceipt(receiptInput);
  const archiveStatus = await regularFile(archivePath, 'Editor ZIP');
  const expectedName = expectedEditorArtifactName(
    receipt.platform,
    receipt.arch,
    receipt.version,
  );
  if (path.basename(archivePath) !== expectedName) {
    throw new Error(`Editor ZIP 必须命名为 ${expectedName}`);
  }
  const expectedEntries = new Map(
    receipt.applicationEntries.map((entry) => [
      `${receipt.applicationRootName}/${entry.path}`,
      entry,
    ]),
  );
  const seen = new Set();
  const seenCaseFolded = new Set();
  let entryCount = 0;
  let totalBytes = 0;
  const zip = await openZip(archivePath);
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        void (async () => {
          entryCount += 1;
          totalBytes += entry.uncompressedSize;
          if (entryCount > 200_000 || totalBytes > 8 * 1024 * 1024 * 1024) {
            throw new Error('Editor ZIP 文件数或展开大小超过安全上限');
          }
          const name = entry.fileName;
          const normalizedName = name.endsWith('/')
            ? name.slice(0, -1)
            : name;
          if (
            name.includes('\0') ||
            name.includes('\\') ||
            name.startsWith('/') ||
            name.split('/').some((segment) => segment === '..') ||
            !(name === `${receipt.applicationRootName}/` ||
              name.startsWith(`${receipt.applicationRootName}/`))
          ) {
            throw new Error(`Editor ZIP 包含不安全或意外路径：${name}`);
          }
          const folded = name.toLocaleLowerCase('en-US');
          if (seenCaseFolded.has(folded)) {
            throw new Error(`Editor ZIP 包含重复路径：${name}`);
          }
          seenCaseFolded.add(folded);
          if (name === `${receipt.applicationRootName}/`) {
            return;
          }
          const expected = expectedEntries.get(normalizedName);
          if (expected === undefined) {
            throw new Error(`Editor ZIP 包含回执未声明的条目：${name}`);
          }
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
          const unixType = unixMode & 0o170000;
          const archiveType = name.endsWith('/') || unixType === 0o040000
            ? 'directory'
            : unixType === 0o120000
              ? 'symlink'
              : 'file';
          if (archiveType !== expected.type) {
            throw new Error(`Editor ZIP 条目类型与回执不一致：${name}`);
          }
          if (
            receipt.platform === 'darwin' &&
            (unixMode & 0o777) !== expected.mode
          ) {
            throw new Error(`Editor ZIP 条目权限与回执不一致：${name}`);
          }
          if (archiveType !== 'directory') {
            const actual = await hashZipEntry(zip, entry);
            if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
              throw new Error(`Editor ZIP 文件与完整树回执不一致：${name}`);
            }
            seen.add(name);
          }
        })().then(() => zip.readEntry(), reject);
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  const expectedMaterialEntries = receipt.applicationEntries.filter(
    (entry) => entry.type !== 'directory',
  ).length;
  if (entryCount === 0 || seen.size !== expectedMaterialEntries) {
    throw new Error('Editor ZIP 缺少完整应用树中的文件或符号链接');
  }
  return {
    name: expectedName,
    bytes: archiveStatus.size,
    sha256: await hashFile(archivePath),
    entryCount,
  };
}

function windowsExtractionInvocation(archive, destination) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$archive = $env:VN_EDITOR_WINDOWS_ARCHIVE_INPUT',
    '$destination = $env:VN_EDITOR_WINDOWS_EXTRACT_DESTINATION',
    'if ([string]::IsNullOrWhiteSpace($archive) -or [string]::IsNullOrWhiteSpace($destination)) { throw "Missing extraction path" }',
    'if (Test-Path -LiteralPath $destination) { throw "Extraction destination already exists" }',
    'Expand-Archive -LiteralPath $archive -DestinationPath $destination',
  ].join('; ');
  return {
    command: 'powershell.exe',
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    environment: {
      ...process.env,
      VN_EDITOR_WINDOWS_ARCHIVE_INPUT: archive,
      VN_EDITOR_WINDOWS_EXTRACT_DESTINATION: destination,
    },
  };
}

async function verifyExtractedArchive(archive, receipt) {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'vn-editor-archive-verify-'),
  );
  const extracted = path.join(temporaryRoot, 'expanded');
  try {
    if (receipt.platform === 'darwin') {
      await mkdir(extracted);
      runChecked('ditto', [
        '-x',
        '-k',
        '--norsrc',
        '--noextattr',
        '--noacl',
        '--noqtn',
        archive,
        extracted,
      ]);
    } else {
      const invocation = windowsExtractionInvocation(archive, extracted);
      runChecked(invocation.command, invocation.args, invocation.environment);
    }
    const topLevel = await readdir(extracted, { withFileTypes: true });
    if (
      topLevel.length !== 1 ||
      !topLevel[0].isDirectory() ||
      topLevel[0].isSymbolicLink() ||
      topLevel[0].name !== receipt.applicationRootName
    ) {
      throw new Error('Editor ZIP 解压后没有唯一且正确的应用根目录');
    }
    const appRoot = await canonicalDirectory(
      path.join(extracted, receipt.applicationRootName),
      '解压后的 Editor 应用目录',
    );
    const extractedEntries = await snapshotApplicationTree(
      appRoot,
      receipt.platform,
    );
    if (JSON.stringify(extractedEntries) !== JSON.stringify(receipt.applicationEntries)) {
      throw new Error('Editor ZIP 解压后的完整应用树与验证回执不一致');
    }
    const signature = await verifySignature(
      appRoot,
      receipt.platform,
      receipt.classification,
    );
    if (signature !== receipt.signature) {
      throw new Error('Editor ZIP 解压后的签名分类与回执不一致');
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function archiveEditorApplication({
  platform,
  sourceDirectory,
  outputPath,
  receipt,
}) {
  if (process.platform !== platform) {
    throw new Error(`必须在 ${platform} runner 上归档 ${platform} Editor`);
  }
  const source = await canonicalDirectory(path.resolve(sourceDirectory), 'Editor 应用目录');
  const output = path.resolve(outputPath);
  if (path.extname(output).toLowerCase() !== '.zip' || existsSync(output)) {
    throw new Error('--output 必须是尚不存在的绝对 .zip 路径');
  }
  const validatedReceipt = validateEditorReceipt(receipt);
  if (
    validatedReceipt.platform !== platform ||
    validatedReceipt.applicationRootName !== path.basename(source)
  ) {
    throw new Error('Editor 应用目录与验证回执不一致');
  }
  await mkdir(path.dirname(output), { recursive: true });
  if (platform === 'darwin') {
    runChecked('ditto', [
      '-c',
      '-k',
      '--keepParent',
      '--norsrc',
      '--noextattr',
      '--noacl',
      '--noqtn',
      source,
      output,
    ]);
  } else {
    const invocation = windowsArchiveInvocation(source, output);
    runChecked(invocation.command, invocation.args, invocation.environment);
  }
  if ((await stat(output)).size <= 0) {
    throw new Error('Editor ZIP 是空文件');
  }
  const artifact = await verifyEditorArchive(output, validatedReceipt);
  await verifyExtractedArchive(output, validatedReceipt);
  return artifact;
}

async function readReceipt(receiptPath) {
  return validateEditorReceipt(await readJsonFile(
    receiptPath,
    'Editor build receipt',
    16 * 1024 * 1024,
  ));
}

export async function collectEditorArtifacts({
  inputDirectory,
  outputDirectory,
  receiptPath,
  classification,
  platform,
  arch,
  version,
  gitCommit,
}) {
  const input = await canonicalDirectory(path.resolve(inputDirectory), 'Editor 产物输入目录');
  const receipt = await readReceipt(path.resolve(receiptPath));
  if (
    receipt.classification !== classification ||
    receipt.platform !== platform ||
    receipt.arch !== arch ||
    receipt.version !== version ||
    receipt.gitCommit !== gitCommit
  ) {
    throw new Error('Editor receipt 与收集参数不一致');
  }
  const expectedName = expectedEditorArtifactName(platform, arch, version);
  const entries = await readdir(input, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink() ||
    entries[0].name !== expectedName
  ) {
    throw new Error(`Editor 产物输入必须只包含 ${expectedName}`);
  }
  const archivePath = path.join(input, expectedName);
  const artifact = await verifyEditorArchive(archivePath, receipt);
  const requestedOutput = path.resolve(outputDirectory);
  if (isContained(input, requestedOutput)) {
    throw new Error('Editor 候选输出目录不得位于产物输入目录内');
  }
  const output = await prepareEmptyOutputDirectory(
    requestedOutput,
    'Editor 候选输出目录',
  );
  await copyFile(archivePath, path.join(output, expectedName), fsConstants.COPYFILE_EXCL);
  const receiptName = `build-receipt-${platform}-${arch}.json`;
  await copyFile(receiptPath, path.join(output, receiptName), fsConstants.COPYFILE_EXCL);
  const manifest = {
    schemaVersion: EDITOR_ARTIFACT_MANIFEST_SCHEMA_VERSION,
    classification,
    platform,
    arch,
    version,
    gitCommit,
    receipt: receiptName,
    files: [{ name: artifact.name, bytes: artifact.bytes, sha256: artifact.sha256 }],
  };
  await writeFile(
    path.join(output, `artifact-manifest-${platform}-${arch}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return manifest;
}

function expectedSignature(classification, platform) {
  return classification === 'release'
    ? platform === 'darwin' ? 'developer-id-notarized' : 'authenticode'
    : platform === 'darwin' ? 'adhoc' : 'unsigned-or-unverified';
}

export async function verifyEditorReleaseSet({
  inputDirectory,
  outputDirectory,
  classification,
  version,
  gitCommit,
}) {
  const input = await canonicalDirectory(path.resolve(inputDirectory), 'Editor release 输入目录');
  if (!['internal', 'release'].includes(classification)) {
    throw new Error('classification 必须是 internal 或 release');
  }
  validateVersion(version, 'Editor release 版本');
  validateCommit(gitCommit, classification);
  const entries = await readdir(input, { withFileTypes: true });
  const allowedNames = new Set();
  const artifacts = [];
  const receipts = [];
  for (const target of RELEASE_TARGETS) {
    const suffix = `${target.platform}-${target.arch}`;
    const manifestName = `artifact-manifest-${suffix}.json`;
    const receiptName = `build-receipt-${suffix}.json`;
    const artifactName = expectedEditorArtifactName(target.platform, target.arch, version);
    allowedNames.add(manifestName);
    allowedNames.add(receiptName);
    allowedNames.add(artifactName);
    const manifest = await readJsonFile(path.join(input, manifestName), manifestName, 1024 * 1024);
    exactFields(manifest, [
      'schemaVersion', 'classification', 'platform', 'arch', 'version',
      'gitCommit', 'receipt', 'files',
    ], manifestName);
    if (
      manifest.schemaVersion !== EDITOR_ARTIFACT_MANIFEST_SCHEMA_VERSION ||
      manifest.classification !== classification ||
      manifest.platform !== target.platform ||
      manifest.arch !== target.arch ||
      manifest.version !== version ||
      manifest.gitCommit !== gitCommit ||
      manifest.receipt !== receiptName ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== 1
    ) {
      throw new Error(`${manifestName} 与发布目标不一致`);
    }
    const receipt = await readReceipt(path.join(input, receiptName));
    if (
      receipt.classification !== classification ||
      receipt.platform !== target.platform ||
      receipt.arch !== target.arch ||
      receipt.version !== version ||
      receipt.gitCommit !== gitCommit ||
      receipt.signature !== expectedSignature(classification, target.platform)
    ) {
      throw new Error(`${receiptName} 未通过签名、平台或版本门禁`);
    }
    const file = manifest.files[0];
    exactFields(file, ['name', 'bytes', 'sha256'], `${manifestName}.files[0]`);
    if (
      file.name !== artifactName ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(file.sha256)
    ) {
      throw new Error(`${manifestName} 产物记录无效`);
    }
    const artifactPath = path.join(input, artifactName);
    const status = await regularFile(artifactPath, artifactName);
    if (status.size !== file.bytes || await hashFile(artifactPath) !== file.sha256) {
      throw new Error(`${artifactName} 与平台清单不一致`);
    }
    await verifyEditorArchive(artifactPath, receipt);
    artifacts.push({ ...file, platform: target.platform, arch: target.arch });
    receipts.push(receiptName);
  }
  const unexpected = entries.filter((entry) => !allowedNames.has(entry.name));
  if (unexpected.length !== 0 || entries.length !== allowedNames.size) {
    throw new Error('Editor release 输入目录包含缺失、重复或意外文件');
  }
  artifacts.sort((left, right) => comparePaths(left.name, right.name));
  const requestedOutput = path.resolve(outputDirectory);
  if (isContained(input, requestedOutput)) {
    throw new Error('Editor 最终输出目录不得位于 release 输入目录内');
  }
  const output = await prepareEmptyOutputDirectory(
    requestedOutput,
    'Editor 最终输出目录',
  );
  for (const artifact of artifacts) {
    await copyFile(
      path.join(input, artifact.name),
      path.join(output, artifact.name),
      fsConstants.COPYFILE_EXCL,
    );
  }
  const releaseSet = {
    schemaVersion: EDITOR_RELEASE_SET_SCHEMA_VERSION,
    classification,
    version,
    gitCommit,
    targets: RELEASE_TARGETS.map((target) => ({
      ...target,
      signature: expectedSignature(classification, target.platform),
    })),
    files: artifacts,
    receipts,
    createdAt: new Date().toISOString(),
  };
  const releaseSetPath = path.join(output, 'release-set.json');
  await writeFile(releaseSetPath, `${JSON.stringify(releaseSet, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  const checksums = [
    ...artifacts,
    { name: 'release-set.json', sha256: await hashFile(releaseSetPath) },
  ];
  await writeFile(
    path.join(output, 'SHA256SUMS'),
    `${checksums.map((file) => `${file.sha256}  ${file.name}`).join('\n')}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return releaseSet;
}
