import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const WEB_PLAYER_TEMPLATE_FORMAT = 'vn-engine-web-player-template';
export const WEB_PLAYER_TEMPLATE_VERSION = 1;
export const WEB_PLAYER_TEMPLATE_ROOT_ENV = 'VN_WEB_PLAYER_TEMPLATE_ROOT';

const MAX_TEMPLATE_MANIFEST_BYTES = 64 * 1024;

export type WebPlayerTemplateManifest = {
  format: typeof WEB_PLAYER_TEMPLATE_FORMAT;
  templateVersion: typeof WEB_PLAYER_TEMPLATE_VERSION;
  payloadRoot: 'payload';
  entry: 'index.html';
  runtimeCompatibility: '>=1 <7';
  playerVersion: string;
  files: WebPlayerTemplateFile[];
};

export type WebPlayerTemplateFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type LoadedWebPlayerTemplate = {
  rootPath: string;
  payloadRootPath: string;
  manifest: WebPlayerTemplateManifest;
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

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function isSafePayloadPath(value: unknown): value is string {
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
  return value.split('/').every(
    (component) => component.length > 0 && component !== '.' && component !== '..',
  );
}

function isTemplateFile(value: unknown): value is WebPlayerTemplateFile {
  return (
    isObject(value) &&
    hasExactKeys(value, ['path', 'bytes', 'sha256']) &&
    isSafePayloadPath(value.path) &&
    Number.isSafeInteger(value.bytes) &&
    (value.bytes as number) >= 0 &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.sha256)
  );
}

function parseTemplateManifest(source: string): WebPlayerTemplateManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error('Web Player 模板清单不是有效 JSON');
  }
  if (
    !isObject(parsed) ||
    !hasExactKeys(parsed, [
      'format',
      'templateVersion',
      'payloadRoot',
      'entry',
      'runtimeCompatibility',
      'playerVersion',
      'files',
    ]) ||
    parsed.format !== WEB_PLAYER_TEMPLATE_FORMAT ||
    parsed.templateVersion !== WEB_PLAYER_TEMPLATE_VERSION ||
    parsed.payloadRoot !== 'payload' ||
    parsed.entry !== 'index.html' ||
    parsed.runtimeCompatibility !== '>=1 <7' ||
    typeof parsed.playerVersion !== 'string' ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
      parsed.playerVersion,
    ) ||
    !Array.isArray(parsed.files) ||
    parsed.files.length < 2 ||
    !parsed.files.every(isTemplateFile)
  ) {
    throw new Error('Web Player 模板清单不符合 v1 exact 契约');
  }
  const paths = parsed.files.map((file) => file.path);
  if (
    paths[0] !== 'index.html' ||
    !paths.some((filePath) => filePath.startsWith('player-assets/')) ||
    paths.some((filePath, index) => index > 0 && paths[index - 1]! >= filePath)
  ) {
    throw new Error('Web Player 模板文件清单不符合 v1 exact 契约');
  }
  return parsed as WebPlayerTemplateManifest;
}

function sameFileSnapshot(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.nlink === right.nlink
  );
}

async function hashStablePayloadFile(
  payloadRootPath: string,
  filePath: string,
): Promise<WebPlayerTemplateFile> {
  const absolutePath = path.join(payloadRootPath, ...filePath.split('/'));
  const before = await lstat(absolutePath);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    throw new Error('Web Player 模板包含不安全的文件');
  }
  const file = await open(
    absolutePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await file.stat();
    if (!sameFileSnapshot(before, opened)) {
      throw new Error('Web Player 模板文件在读取前发生了变化');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let position = 0;
    while (position < opened.size) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(buffer.length, opened.size - position),
        position,
      );
      if (bytesRead <= 0) {
        throw new Error('Web Player 模板文件读取不完整');
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await file.stat();
    if (!sameFileSnapshot(opened, after)) {
      throw new Error('Web Player 模板文件在读取时发生了变化');
    }
    return { path: filePath, bytes: opened.size, sha256: hash.digest('hex') };
  } finally {
    await file.close();
  }
}

async function snapshotPayloadFiles(
  payloadRootPath: string,
  relativeDirectory = '',
): Promise<WebPlayerTemplateFile[]> {
  const directoryPath = relativeDirectory.length === 0
    ? payloadRootPath
    : path.join(payloadRootPath, ...relativeDirectory.split('/'));
  const directoryStatus = await lstat(directoryPath);
  if (directoryStatus.isSymbolicLink() || !directoryStatus.isDirectory()) {
    throw new Error('Web Player 模板包含不安全的目录');
  }
  const records: WebPlayerTemplateFile[] = [];
  const entries = await readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const relativePath = relativeDirectory.length === 0
      ? entry.name
      : `${relativeDirectory}/${entry.name}`;
    if (!isSafePayloadPath(relativePath)) {
      throw new Error('Web Player 模板包含不安全的路径');
    }
    const entryPath = path.join(directoryPath, entry.name);
    const status = await lstat(entryPath);
    if (status.isSymbolicLink()) {
      throw new Error('Web Player 模板不允许符号链接');
    }
    if (status.isDirectory()) {
      records.push(...await snapshotPayloadFiles(payloadRootPath, relativePath));
    } else if (status.isFile()) {
      records.push(await hashStablePayloadFile(payloadRootPath, relativePath));
    } else {
      throw new Error('Web Player 模板只允许常规文件和目录');
    }
  }
  return records;
}

async function readStableManifest(templateRootPath: string): Promise<string> {
  const manifestPath = path.join(templateRootPath, 'web-player-template.json');
  const before = await lstat(manifestPath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size <= 0 ||
    before.size > MAX_TEMPLATE_MANIFEST_BYTES
  ) {
    throw new Error('Web Player 模板清单不是安全的常规文件');
  }
  const file = await open(
    manifestPath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs
    ) {
      throw new Error('Web Player 模板清单在读取前发生了变化');
    }
    const contents = await file.readFile({ encoding: 'utf8' });
    const after = await file.stat();
    if (
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    ) {
      throw new Error('Web Player 模板清单在读取时发生了变化');
    }
    return contents;
  } finally {
    await file.close();
  }
}

export function resolveWebPlayerTemplateRoot(
  resourcesPath: string,
  environment: NodeJS.ProcessEnv = process.env,
  applicationRuntime: Readonly<{
    isPackaged: boolean;
    appPath: string;
  }> = { isPackaged: true, appPath: '' },
): string {
  const override = environment[WEB_PLAYER_TEMPLATE_ROOT_ENV];
  if (override !== undefined) {
    if (applicationRuntime.isPackaged) {
      throw new Error('封装后的 Editor 不允许覆盖 Web Player 模板路径');
    }
    if (override.length === 0 || override.includes('\0')) {
      throw new Error('Web Player 模板配置无效');
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
      'web-player-template',
    );
  }
  return path.join(resourcesPath, 'web-player-template');
}

export async function loadWebPlayerTemplate(
  requestedRootPath: string,
): Promise<LoadedWebPlayerTemplate> {
  const absoluteRootPath = path.resolve(requestedRootPath);
  const rootStatus = await lstat(absoluteRootPath);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
    throw new Error('Web Player 模板根目录无效');
  }
  const rootPath = await realpath(absoluteRootPath);
  const manifest = parseTemplateManifest(await readStableManifest(rootPath));
  const payloadRootPath = path.join(rootPath, manifest.payloadRoot);
  const entryPath = path.join(payloadRootPath, manifest.entry);
  const assetsPath = path.join(payloadRootPath, 'player-assets');
  const [payloadStatus, entryStatus, assetsStatus] = await Promise.all([
    lstat(payloadRootPath),
    lstat(entryPath),
    lstat(assetsPath),
  ]);
  if (
    payloadStatus.isSymbolicLink() ||
    !payloadStatus.isDirectory() ||
    entryStatus.isSymbolicLink() ||
    !entryStatus.isFile() ||
    entryStatus.nlink !== 1 ||
    assetsStatus.isSymbolicLink() ||
    !assetsStatus.isDirectory()
  ) {
    throw new Error('Web Player 模板 payload 无效');
  }
  const canonicalPayloadPath = await realpath(payloadRootPath);
  if (
    !isContainedOrEqual(rootPath, canonicalPayloadPath) ||
    !isContainedOrEqual(canonicalPayloadPath, await realpath(entryPath)) ||
    !isContainedOrEqual(canonicalPayloadPath, await realpath(assetsPath))
  ) {
    throw new Error('Web Player 模板 payload 逃逸了模板根目录');
  }
  const payloadEntries = (await readdir(canonicalPayloadPath)).sort();
  if (
    payloadEntries.length !== 2 ||
    payloadEntries[0] !== 'index.html' ||
    payloadEntries[1] !== 'player-assets'
  ) {
    throw new Error('Web Player 模板 payload 根目录不符合 exact 契约');
  }
  const actualFiles = await snapshotPayloadFiles(canonicalPayloadPath);
  actualFiles.sort((left, right) => comparePaths(left.path, right.path));
  if (JSON.stringify(actualFiles) !== JSON.stringify(manifest.files)) {
    throw new Error('Web Player 模板文件与签名清单不一致');
  }
  return { rootPath, payloadRootPath: canonicalPayloadPath, manifest };
}
