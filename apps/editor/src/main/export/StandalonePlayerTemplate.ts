// 主要作用：发现并严格验证当前平台的独立 Player 模板。
// 关键实现：resolveStandalonePlayerTemplateRoot 解析路径，load 校验清单和入口。
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

export const PLAYER_TEMPLATE_FORMAT = 'vn-engine-player-template';
export const PLAYER_TEMPLATE_VERSION = 1;
export const PLAYER_TEMPLATE_ROOT_ENV = 'VN_PLAYER_TEMPLATE_ROOT';

const MAX_TEMPLATE_MANIFEST_BYTES = 64 * 1024;
const SUPPORTED_PLATFORMS = ['darwin', 'win32', 'linux'] as const;
const SUPPORTED_ARCHITECTURES = ['arm64', 'x64'] as const;

type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
type SupportedArchitecture = (typeof SUPPORTED_ARCHITECTURES)[number];

export type StandalonePlayerTemplateManifest = {
  format: typeof PLAYER_TEMPLATE_FORMAT;
  templateVersion: typeof PLAYER_TEMPLATE_VERSION;
  platform: SupportedPlatform;
  arch: SupportedArchitecture;
  playerVersion: string;
  runtimeCompatibility: '>=1 <11';
  payloadRoot: string;
  artifactEntry: string;
  gameResourceDirectory: string;
  applicationMetadataFile: string;
  macosInfoPlistFile: string | null;
};

export type LoadedStandalonePlayerTemplate = {
  rootPath: string;
  artifactRootPath: string;
  manifest: StandalonePlayerTemplateManifest;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isSafeRelativePath(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes('\0') ||
    value.includes('\\') ||
    path.posix.isAbsolute(value)
  ) {
    return false;
  }
  const components = value.split('/');
  return components.every(
    (component) => component.length > 0 && component !== '.' && component !== '..',
  );
}

function isContainedOrEqual(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function parseTemplateManifest(
  source: string,
  expectedPlatform: NodeJS.Platform,
  expectedArchitecture: string,
): StandalonePlayerTemplateManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error('独立应用模板清单不是有效 JSON');
  }
  if (
    !isObject(parsed) ||
    !hasExactKeys(parsed, [
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
    ]) ||
    parsed.format !== PLAYER_TEMPLATE_FORMAT ||
    parsed.templateVersion !== PLAYER_TEMPLATE_VERSION ||
    !SUPPORTED_PLATFORMS.includes(parsed.platform as SupportedPlatform) ||
    !SUPPORTED_ARCHITECTURES.includes(parsed.arch as SupportedArchitecture) ||
    typeof parsed.playerVersion !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
      parsed.playerVersion,
    ) ||
    parsed.runtimeCompatibility !== '>=1 <11' ||
    !isSafeRelativePath(parsed.payloadRoot) ||
    !isSafeRelativePath(parsed.artifactEntry) ||
    !isSafeRelativePath(parsed.gameResourceDirectory) ||
    path.posix.basename(parsed.gameResourceDirectory) !== 'game' ||
    !isSafeRelativePath(parsed.applicationMetadataFile) ||
    path.posix.basename(parsed.applicationMetadataFile) !==
      'vn-game-application.json' ||
    !(
      parsed.macosInfoPlistFile === null ||
      isSafeRelativePath(parsed.macosInfoPlistFile)
    )
  ) {
    throw new Error('独立应用模板清单格式或路径无效');
  }
  if (
    parsed.platform !== expectedPlatform ||
    parsed.arch !== expectedArchitecture
  ) {
    throw new Error('独立应用模板与当前平台或架构不匹配');
  }
  if (
    parsed.platform === 'darwin' &&
    (parsed.payloadRoot !== 'payload' ||
      parsed.artifactEntry !== 'VN Engine Player.app' ||
      parsed.gameResourceDirectory !== 'Contents/Resources/game' ||
      parsed.applicationMetadataFile !==
        'Contents/Resources/vn-game-application.json' ||
      parsed.macosInfoPlistFile !== 'Contents/Info.plist')
  ) {
    throw new Error('macOS 独立应用模板路径不符合 v1 exact 契约');
  }
  if (
    (parsed.platform === 'darwin') !==
      (typeof parsed.macosInfoPlistFile === 'string') ||
    (parsed.platform === 'darwin' && !parsed.artifactEntry.endsWith('.app'))
  ) {
    throw new Error('独立应用模板缺少必需的平台元数据');
  }
  return parsed as StandalonePlayerTemplateManifest;
}

async function readStableManifest(templateRootPath: string): Promise<string> {
  const manifestPath = path.join(templateRootPath, 'player-template.json');
  const before = await lstat(manifestPath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size <= 0 ||
    before.size > MAX_TEMPLATE_MANIFEST_BYTES
  ) {
    throw new Error('独立应用模板清单不是安全的常规文件');
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(manifestPath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs
    ) {
      throw new Error('独立应用模板清单在读取前发生了变化');
    }
    const contents = await file.readFile({ encoding: 'utf8' });
    const after = await file.stat();
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    ) {
      throw new Error('独立应用模板清单在读取时发生了变化');
    }
    return contents;
  } finally {
    await file.close();
  }
}

export function resolveStandalonePlayerTemplateRoot(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
  environment: NodeJS.ProcessEnv = process.env,
  applicationRuntime: Readonly<{
    isPackaged: boolean;
    appPath: string;
  }> = { isPackaged: true, appPath: '' },
): string {
  const override = environment[PLAYER_TEMPLATE_ROOT_ENV];
  if (override !== undefined) {
    if (applicationRuntime.isPackaged) {
      throw new Error('封装后的 Editor 不允许覆盖独立 Player 模板路径');
    }
    if (override.length === 0 || override.includes('\0')) {
      throw new Error('独立应用模板配置无效');
    }
    return path.resolve(override);
  }
  if (!applicationRuntime.isPackaged) {
    if (
      !path.isAbsolute(applicationRuntime.appPath) ||
      applicationRuntime.appPath.includes('\0')
    ) {
      throw new Error('开发态应用路径无效');
    }
    return path.resolve(
      applicationRuntime.appPath,
      '..',
      '..',
      'engine',
      'stage',
      'player-templates',
      `${platform}-${architecture}`,
    );
  }
  return path.join(resourcesPath, 'player-templates', `${platform}-${architecture}`);
}

export async function loadStandalonePlayerTemplate(
  requestedRootPath: string,
  expectedPlatform: NodeJS.Platform = process.platform,
  expectedArchitecture: string = process.arch,
): Promise<LoadedStandalonePlayerTemplate> {
  const absoluteRootPath = path.resolve(requestedRootPath);
  const rootStatus = await lstat(absoluteRootPath);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new Error('独立应用模板根目录无效');
  }
  const rootPath = await realpath(absoluteRootPath);
  const manifest = parseTemplateManifest(
    await readStableManifest(rootPath),
    expectedPlatform,
    expectedArchitecture,
  );
  const payloadRootPath = path.join(rootPath, ...manifest.payloadRoot.split('/'));
  const artifactRootPath = path.join(
    payloadRootPath,
    ...manifest.artifactEntry.split('/'),
  );
  const [payloadStatus, artifactStatus] = await Promise.all([
    lstat(payloadRootPath),
    lstat(artifactRootPath),
  ]);
  if (
    payloadStatus.isSymbolicLink() ||
    !payloadStatus.isDirectory() ||
    artifactStatus.isSymbolicLink() ||
    !artifactStatus.isDirectory()
  ) {
    throw new Error('独立应用模板 payload 无效');
  }
  const canonicalArtifactPath = await realpath(artifactRootPath);
  if (
    !isContainedOrEqual(rootPath, await realpath(payloadRootPath)) ||
    !isContainedOrEqual(payloadRootPath, canonicalArtifactPath)
  ) {
    throw new Error('独立应用模板 payload 逃逸了模板根目录');
  }
  for (const relativePath of [
    manifest.gameResourceDirectory,
    manifest.applicationMetadataFile,
    ...(manifest.macosInfoPlistFile ? [manifest.macosInfoPlistFile] : []),
  ]) {
    const resolved = path.resolve(
      canonicalArtifactPath,
      ...relativePath.split('/'),
    );
    if (!isContainedOrEqual(canonicalArtifactPath, resolved)) {
      throw new Error('独立应用模板注入路径逃逸');
    }
  }
  return { rootPath, artifactRootPath: canonicalArtifactPath, manifest };
}
