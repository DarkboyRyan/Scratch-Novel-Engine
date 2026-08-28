// 主要作用：将运行包嵌入平台 Player 模板并发布可分发的独立应用。
// 关键实现：复制稳定快照、校验模板签名、平台收尾、归档与原子发布。
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import * as nodeFileSystem from "node:fs";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { StandaloneApplicationMetadata } from "../../shared/exportProtocol";
import type {
  AssetDocument,
  ProjectDocument,
} from "../../shared/projectTypes";
import {
  exportRuntimeBundle,
  type RuntimeBundleExportFaultPoint,
} from "./RuntimeBundleExporter";
import {
  loadStandalonePlayerTemplate,
  type LoadedStandalonePlayerTemplate,
} from "./StandalonePlayerTemplate";
import { acquireExportFileLock } from "./ExportFileLock";

function resolveUnpatchedFileSystem(): typeof nodeFileSystem {
  if (process.versions.electron === undefined) {
    return nodeFileSystem;
  }
  const originalFileSystem = process.getBuiltinModule("original-fs");
  if (originalFileSystem === undefined) {
    throw new Error("Electron 原生文件系统模块不可用");
  }
  return originalFileSystem as typeof nodeFileSystem;
}

// Electron's regular fs API treats every valid *.asar file as a virtual
// directory. Standalone export must copy and verify the physical application
// tree instead, otherwise the Player's app.asar is expanded and its signature
// is destroyed. Plain Node tests deliberately keep using the normal fs module.
const unpatchedFileSystem = resolveUnpatchedFileSystem();
const { constants } = unpatchedFileSystem;
const {
  chmod,
  lstat,
  link,
  mkdtemp,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  symlink,
  unlink,
} = unpatchedFileSystem.promises;

const execFileAsync = promisify(execFile);
const COPY_BUFFER_BYTES = 256 * 1024;
const MAX_TEMPLATE_ENTRIES = 100_000;
const MAX_TEMPLATE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TEMPLATE_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILE_BYTES = 12 * 1024 * 1024 * 1024;
const MAX_CTIME_ONLY_RETRY_ATTEMPTS = 3;
const FILE_PROVIDER_SETTLE_DELAY_MS = 500;
const CLEANUP_RETRY_ATTEMPTS = 3;
const CLEANUP_RETRY_DELAY_MS = 50;
const CODE_SIGN_INCOMPATIBLE_XATTRS = [
  "com.apple.FinderInfo",
  "com.apple.ResourceFork",
] as const;

export const STANDALONE_APPLICATION_FORMAT = "vn-engine-standalone-application";
export const STANDALONE_APPLICATION_CONFIG_VERSION = 1;
export const STANDALONE_DEFAULT_ICON = "template-default";

export class UnstableStandaloneApplicationMetadataError extends Error {
  readonly code = "UNSTABLE_STANDALONE_APPLICATION_METADATA";

  constructor(cause: unknown) {
    super(
      "当前导出位置会持续修改 macOS 应用元数据，无法保持签名有效；请选择“下载”或其他本地非同步目录",
      { cause },
    );
    this.name = "UnstableStandaloneApplicationMetadataError";
  }
}

export type StandaloneApplicationDocument = {
  format: typeof STANDALONE_APPLICATION_FORMAT;
  configVersion: typeof STANDALONE_APPLICATION_CONFIG_VERSION;
  productName: string;
  version: string;
  appBundleId: string;
  icon: typeof STANDALONE_DEFAULT_ICON;
  runtimeBuildId: string;
  playerVersion: string;
};

export type StandaloneApplicationExportFaultPoint =
  | "after-runtime-bundle"
  | "after-template-copy"
  | "after-content-injection"
  | "after-platform-finalize"
  | "before-commit";

export type StandaloneApplicationExportOptions = {
  sourceProjectRootPath: string;
  targetArtifactPath: string;
  templateRootPath: string;
  sourceRevision: number;
  expectedManifestSha256: string;
  expectedProject: ProjectDocument;
  expectedAssets: AssetDocument[];
  application: StandaloneApplicationMetadata;
  buildId?: string;
  createdAt?: string;
  assertSourceStillCurrent?: () => void | Promise<void>;
  injectRuntimeBundleFault?: (
    point: RuntimeBundleExportFaultPoint,
  ) => void | Promise<void>;
  injectFault?: (
    point: StandaloneApplicationExportFaultPoint,
  ) => void | Promise<void>;
  verifyTemplateArtifact?: (stagingArtifactPath: string) => Promise<void>;
  finalizeApplication?: StandaloneApplicationFinalizer;
  archiveApplication?: (
    applicationPath: string,
    archivePath: string,
  ) => Promise<void>;
  extractApplicationArchive?: (
    archivePath: string,
    extractionRootPath: string,
  ) => Promise<void>;
  verifyExtractedApplication?: (applicationPath: string) => Promise<void>;
  preparePublishedArtifact?: (publishedArtifactPath: string) => Promise<void>;
};

export type StandaloneApplicationExportResult = {
  artifactName: string;
  buildId: string;
  sourceRevision: number;
  assetCount: number;
  platform: NodeJS.Platform;
  arch: string;
};

export type StandaloneApplicationFinalizer = (
  stagingArtifactPath: string,
  template: LoadedStandalonePlayerTemplate,
  application: StandaloneApplicationMetadata,
) => Promise<void>;

export type PlatformCommandRunner = (
  executablePath: string,
  arguments_: readonly string[],
  environment?: NodeJS.ProcessEnv,
) => Promise<void>;

type CopyBudget = {
  entries: number;
  bytes: number;
};

type TreeSnapshotRecord = {
  path: string;
  bytes: number;
  sha256: string;
};

const WINDOWS_ARCHIVE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$source = $env:VN_PLAYER_WINDOWS_ARCHIVE_SOURCE",
  "$destination = $env:VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION",
  'if ([string]::IsNullOrWhiteSpace($source) -or [string]::IsNullOrWhiteSpace($destination)) { throw "Missing archive path" }',
  'if (Test-Path -LiteralPath $destination) { throw "Archive destination already exists" }',
  'Compress-Archive -LiteralPath $source -DestinationPath $destination -CompressionLevel Optimal',
].join("; ");

const WINDOWS_EXTRACT_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$source = $env:VN_EDITOR_WINDOWS_ARCHIVE_SOURCE",
  "$destination = $env:VN_EDITOR_WINDOWS_ARCHIVE_DESTINATION",
  'if ([string]::IsNullOrWhiteSpace($source) -or [string]::IsNullOrWhiteSpace($destination)) { throw "Missing extraction path" }',
  'if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Archive source is missing" }',
  'if (-not (Test-Path -LiteralPath $destination -PathType Container)) { throw "Extraction destination is missing" }',
  'if ((Get-ChildItem -LiteralPath $destination -Force | Measure-Object).Count -ne 0) { throw "Extraction destination is not empty" }',
  'Expand-Archive -LiteralPath $source -DestinationPath $destination',
].join("; ");

type FileIdentity = {
  dev: number;
  ino: number;
};

export type WindowsStandalonePowerShellInvocation = Readonly<{
  command: "powershell.exe";
  arguments: readonly string[];
  environment: NodeJS.ProcessEnv;
}>;

function assertWindowsAbsoluteCommandPath(
  value: string,
  context: string,
): void {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    !path.win32.isAbsolute(value)
  ) {
    throw new Error(`${context}必须是 Windows 绝对路径`);
  }
}

export function windowsStandaloneArchiveInvocation(
  sourcePath: string,
  archivePath: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): WindowsStandalonePowerShellInvocation {
  assertWindowsAbsoluteCommandPath(sourcePath, "Windows 独立应用目录");
  assertWindowsAbsoluteCommandPath(archivePath, "Windows 独立应用 ZIP");
  return {
    command: "powershell.exe",
    arguments: windowsPowerShellArguments(WINDOWS_ARCHIVE_SCRIPT),
    environment: {
      ...parentEnvironment,
      VN_PLAYER_WINDOWS_ARCHIVE_SOURCE: sourcePath,
      VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION: archivePath,
    },
  };
}

export function windowsStandaloneExtractionInvocation(
  archivePath: string,
  extractionRootPath: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): WindowsStandalonePowerShellInvocation {
  assertWindowsAbsoluteCommandPath(archivePath, "Windows 独立应用 ZIP");
  assertWindowsAbsoluteCommandPath(
    extractionRootPath,
    "Windows ZIP 解压复验目录",
  );
  return {
    command: "powershell.exe",
    arguments: windowsPowerShellArguments(WINDOWS_EXTRACT_SCRIPT),
    environment: {
      ...parentEnvironment,
      VN_EDITOR_WINDOWS_ARCHIVE_SOURCE: archivePath,
      VN_EDITOR_WINDOWS_ARCHIVE_DESTINATION: extractionRootPath,
    },
  };
}

type CompletedStableFileOperation<T> = {
  value: T;
  snapshot: Stats;
  sha256: string;
  ctimeOnlyChange: boolean;
};

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
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

function sameFileSnapshotExceptCtime(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.nlink === right.nlink
  );
}

function fileSnapshotChange(
  left: Stats,
  right: Stats,
): "none" | "ctime-only" | "unsafe" {
  if (sameFileSnapshot(left, right)) {
    return "none";
  }
  if (
    left.ctimeMs !== right.ctimeMs &&
    sameFileSnapshotExceptCtime(left, right)
  ) {
    return "ctime-only";
  }
  return "unsafe";
}

async function retryCompletedStableFileOperation<T>(
  operation: () => Promise<CompletedStableFileOperation<T>>,
  changedMessage: string,
): Promise<T> {
  let referenceSnapshot: Stats | null = null;
  let referenceSha256: string | null = null;
  for (let attempt = 0; attempt < MAX_CTIME_ONLY_RETRY_ATTEMPTS; attempt += 1) {
    const completed = await operation();
    if (
      referenceSnapshot !== null &&
      (!sameFileSnapshotExceptCtime(referenceSnapshot, completed.snapshot) ||
        referenceSha256 !== completed.sha256)
    ) {
      throw new Error(changedMessage);
    }
    if (!completed.ctimeOnlyChange) {
      return completed.value;
    }
    referenceSnapshot ??= completed.snapshot;
    referenceSha256 ??= completed.sha256;
  }
  throw new Error(changedMessage);
}

function isInsideOrEqual(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function sameFileIdentity(
  status: Pick<Stats, "dev" | "ino">,
  identity: FileIdentity,
): boolean {
  return status.dev === identity.dev && status.ino === identity.ino;
}

async function captureOwnedDirectoryIdentity(
  directoryPath: string,
  context: string,
): Promise<FileIdentity> {
  const status = await lstat(directoryPath);
  if (
    status.isSymbolicLink() ||
    !status.isDirectory() ||
    (await realpath(directoryPath)) !== directoryPath
  ) {
    throw new Error(`${context}不是安全的目录`);
  }
  return { dev: status.dev, ino: status.ino };
}

async function removeOwnedDirectory(
  directoryPath: string,
  identity: FileIdentity,
): Promise<void> {
  for (let attempt = 0; attempt < CLEANUP_RETRY_ATTEMPTS; attempt += 1) {
    const status = await lstat(directoryPath).catch((error: unknown) => {
      if (errnoCode(error) === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (
      status === null ||
      status.isSymbolicLink() ||
      !status.isDirectory() ||
      !sameFileIdentity(status, identity)
    ) {
      return;
    }
    try {
      await removeOwnedDirectoryTree(directoryPath, identity);
      return;
    } catch (error) {
      if (
        attempt === CLEANUP_RETRY_ATTEMPTS - 1 ||
        !["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(
          errnoCode(error) ?? "",
        )
      ) {
        throw error;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, CLEANUP_RETRY_DELAY_MS);
      });
    }
  }
}

async function removeOwnedDirectoryTree(
  directoryPath: string,
  expectedIdentity: FileIdentity,
): Promise<void> {
  const before = await lstat(directoryPath).catch((error: unknown) => {
    if (errnoCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (before === null) {
    return;
  }
  if (
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    !sameFileIdentity(before, expectedIdentity)
  ) {
    return;
  }

  // Pin the physical directory with O_NOFOLLOW before restoring owner access.
  // Template modes are restored after copying, so an injected failure can
  // otherwise leave 0555 directories that a recursive rm cannot clean up.
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const directoryOnly = constants.O_DIRECTORY ?? 0;
  const directory = await open(
    directoryPath,
    constants.O_RDONLY | noFollow | directoryOnly,
  );
  try {
    const opened = await directory.stat();
    if (
      !opened.isDirectory() ||
      !sameFileIdentity(opened, expectedIdentity)
    ) {
      throw new Error("独立应用私有工作区在清理时发生了变化");
    }
    await directory.chmod((opened.mode & 0o777) | 0o700);
  } finally {
    await directory.close();
  }

  const writable = await lstat(directoryPath);
  if (
    writable.isSymbolicLink() ||
    !writable.isDirectory() ||
    !sameFileIdentity(writable, expectedIdentity)
  ) {
    throw new Error("独立应用私有工作区在清理时发生了变化");
  }
  const entries = await readdir(directoryPath);
  entries.sort((left, right) => left.localeCompare(right, "en"));
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry);
    const entryStatus = await lstat(entryPath).catch((error: unknown) => {
      if (errnoCode(error) === "ENOENT") {
        return null;
      }
      throw error;
    });
    if (entryStatus === null) {
      continue;
    }
    if (!entryStatus.isSymbolicLink() && entryStatus.isDirectory()) {
      await removeOwnedDirectoryTree(entryPath, {
        dev: entryStatus.dev,
        ino: entryStatus.ino,
      });
      continue;
    }
    await unlink(entryPath).catch((error: unknown) => {
      if (errnoCode(error) !== "ENOENT") {
        throw error;
      }
    });
  }

  const emptied = await lstat(directoryPath);
  if (
    emptied.isSymbolicLink() ||
    !emptied.isDirectory() ||
    !sameFileIdentity(emptied, expectedIdentity)
  ) {
    throw new Error("独立应用私有工作区在清理时发生了变化");
  }
  await rmdir(directoryPath);
}

async function captureOwnedRegularFileIdentity(
  filePath: string,
  context: string,
): Promise<FileIdentity> {
  const status = await lstat(filePath);
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) {
    throw new Error(`${context}不是安全的常规文件`);
  }
  return { dev: status.dev, ino: status.ino };
}

async function removeOwnedRegularFile(
  filePath: string,
  identity: FileIdentity,
): Promise<void> {
  const status = await lstat(filePath).catch((error: unknown) => {
    if (errnoCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (
    status === null ||
    status.isSymbolicLink() ||
    !status.isFile() ||
    !sameFileIdentity(status, identity)
  ) {
    return;
  }
  await unlink(filePath);
}

async function removeOwnedEmptyDirectory(
  directoryPath: string,
  identity: FileIdentity,
): Promise<void> {
  const status = await lstat(directoryPath).catch((error: unknown) => {
    if (errnoCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  });
  if (
    status === null ||
    status.isSymbolicLink() ||
    !status.isDirectory() ||
    !sameFileIdentity(status, identity)
  ) {
    return;
  }
  // rmdir never follows a replacement symlink and refuses to remove a
  // directory containing an entry we did not create. Publication cleanup is
  // intentionally non-recursive so a racing process cannot make us delete an
  // unknown file from the user-selected destination.
  await rmdir(directoryPath);
}

async function canonicalizeDirectory(
  directoryPath: string,
  context: string,
): Promise<string> {
  const absolutePath = path.resolve(directoryPath);
  const status = await lstat(absolutePath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(`${context}不是可安全使用的目录`);
  }
  return realpath(absolutePath);
}

async function assertMissing(
  targetPath: string,
  message: string,
): Promise<void> {
  await lstat(targetPath).then(
    () => {
      throw new Error(message);
    },
    (error: unknown) => {
      if (errnoCode(error) !== "ENOENT") {
        throw error;
      }
    },
  );
}

function validateTargetName(
  targetPath: string,
  template: LoadedStandalonePlayerTemplate,
): string {
  const artifactName = path.basename(targetPath);
  if (
    artifactName.length === 0 ||
    artifactName.length > 160 ||
    Buffer.byteLength(artifactName, "utf8") > 240 ||
    Buffer.from(artifactName, "utf8").toString("utf8") !== artifactName ||
    artifactName.includes("\0") ||
    [...artifactName].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    }) ||
    /[. ]$/u.test(artifactName)
  ) {
    throw new Error("独立应用产物名称无效");
  }
  if (
    template.manifest.platform === "darwin" &&
    !artifactName.endsWith("-macOS.zip")
  ) {
    throw new Error("macOS 独立应用归档名称必须以 -macOS.zip 结尾");
  }
  if (
    template.manifest.platform === "win32" &&
    !artifactName.endsWith("-Windows.zip")
  ) {
    throw new Error("Windows 独立应用归档名称必须以 -Windows.zip 结尾");
  }
  return artifactName;
}

function applicationArtifactName(
  application: StandaloneApplicationMetadata,
  template: LoadedStandalonePlayerTemplate,
): string {
  const name = template.manifest.platform === "darwin"
    ? `${application.name}.app`
    : `${application.name}-Windows`;
  if (
    application.name.length === 0 ||
    application.name !== application.name.normalize("NFC") ||
    application.name !== application.name.trim() ||
    Array.from(application.name).length > 80 ||
    Buffer.byteLength(name, "utf8") > 255 ||
    Buffer.from(name, "utf8").toString("utf8") !== name ||
    path.basename(name) !== name ||
    application.name.includes("\0") ||
    [...application.name].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    }) ||
    /[<>:"/\\|?*]/u.test(application.name) ||
    /[. ]$/u.test(application.name)
  ) {
    throw new Error("独立应用目录名称无效");
  }
  return name;
}

function accountForEntry(budget: CopyBudget, bytes = 0): void {
  budget.entries += 1;
  budget.bytes += bytes;
  if (
    budget.entries > MAX_TEMPLATE_ENTRIES ||
    budget.bytes > MAX_TEMPLATE_TOTAL_BYTES
  ) {
    throw new Error("独立应用模板超过安全复制上限");
  }
}

async function copyStableRegularFile(
  sourcePath: string,
  destinationPath: string,
  before: Stats,
): Promise<void> {
  if (before.size < 0 || before.size > MAX_TEMPLATE_FILE_BYTES) {
    throw new Error("独立应用模板包含过大文件");
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const source = await open(sourcePath, constants.O_RDONLY | noFollow);
  let destination: FileHandle | null = null;
  try {
    const opened = await source.stat();
    if (!opened.isFile() || !sameFileSnapshot(before, opened)) {
      throw new Error("独立应用模板文件在打开前发生了变化");
    }
    destination = await open(
      destinationPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      before.mode & 0o777,
    );
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < opened.size) {
      const length = Math.min(buffer.length, opened.size - position);
      const { bytesRead } = await source.read(buffer, 0, length, position);
      if (bytesRead !== length) {
        throw new Error("独立应用模板文件未能完整读取");
      }
      const { bytesWritten } = await destination.write(
        buffer,
        0,
        bytesRead,
        position,
      );
      if (bytesWritten !== bytesRead) {
        throw new Error("独立应用模板文件未能完整写入");
      }
      position += bytesRead;
    }
    if (!sameFileSnapshot(opened, await source.stat())) {
      throw new Error("独立应用模板文件在复制时发生了变化");
    }
    await destination.sync();
  } finally {
    await destination?.close().catch(() => undefined);
    await source.close().catch(() => undefined);
  }
}

async function copyTemplateEntry(
  sourceRootPath: string,
  sourcePath: string,
  destinationPath: string,
  budget: CopyBudget,
): Promise<void> {
  const status = await lstat(sourcePath);
  if (status.isDirectory()) {
    accountForEntry(budget);
    const sourceMode = status.mode & 0o777;
    const assemblyMode = sourceMode | 0o700;
    // A signed template may legitimately contain read-only directories. The
    // destination still has to remain writable and traversable while its
    // children are assembled; restore the template's exact mode afterwards.
    await mkdir(destinationPath, { mode: assemblyMode });
    await chmod(destinationPath, assemblyMode);
    const entries = await readdir(sourcePath);
    entries.sort((left, right) => left.localeCompare(right, "en"));
    for (const entry of entries) {
      if (
        entry.length === 0 ||
        entry === "." ||
        entry === ".." ||
        entry.includes("\0")
      ) {
        throw new Error("独立应用模板包含无效目录项");
      }
      await copyTemplateEntry(
        sourceRootPath,
        path.join(sourcePath, entry),
        path.join(destinationPath, entry),
        budget,
      );
    }
    const after = await lstat(sourcePath);
    if (
      !after.isDirectory() ||
      after.dev !== status.dev ||
      after.ino !== status.ino ||
      after.mtimeMs !== status.mtimeMs ||
      after.ctimeMs !== status.ctimeMs
    ) {
      throw new Error("独立应用模板目录在复制时发生了变化");
    }
    await chmod(destinationPath, sourceMode);
    return;
  }
  if (status.isFile()) {
    if (status.nlink !== 1) {
      throw new Error("独立应用模板不能包含硬链接文件");
    }
    accountForEntry(budget, status.size);
    await copyStableRegularFile(sourcePath, destinationPath, status);
    return;
  }
  if (status.isSymbolicLink()) {
    accountForEntry(budget);
    const linkTarget = await readlink(sourcePath);
    if (
      linkTarget.length === 0 ||
      linkTarget.includes("\0") ||
      path.isAbsolute(linkTarget)
    ) {
      throw new Error("独立应用模板包含不安全链接");
    }
    const resolvedTarget = await realpath(sourcePath);
    if (!isInsideOrEqual(sourceRootPath, resolvedTarget)) {
      throw new Error("独立应用模板链接逃逸了 payload");
    }
    await symlink(linkTarget, destinationPath);
    if ((await readlink(sourcePath)) !== linkTarget) {
      throw new Error("独立应用模板链接在复制时发生了变化");
    }
    return;
  }
  throw new Error("独立应用模板包含非常规文件");
}

async function copyTemplateArtifact(
  sourceRootPath: string,
  destinationRootPath: string,
): Promise<void> {
  // The template has no publisher-owned content digest. Keep source ctime
  // strict here; a self-observed retry hash cannot distinguish an early rewrite.
  const entries = await readdir(sourceRootPath);
  entries.sort((left, right) => left.localeCompare(right, "en"));
  const budget: CopyBudget = { entries: 1, bytes: 0 };
  for (const entry of entries) {
    await copyTemplateEntry(
      sourceRootPath,
      path.join(sourceRootPath, entry),
      path.join(destinationRootPath, entry),
      budget,
    );
  }
}

async function assertSafeExistingParent(
  rootPath: string,
  destinationPath: string,
): Promise<void> {
  const parentPath = path.dirname(destinationPath);
  const relative = path.relative(rootPath, parentPath);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("独立应用模板注入路径无效");
  }
  let currentPath = rootPath;
  for (const component of relative.split(path.sep)) {
    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error("独立应用模板注入目录不安全");
    }
  }
  if (!isInsideOrEqual(rootPath, await realpath(parentPath))) {
    throw new Error("独立应用模板注入目录逃逸");
  }
}

async function writeExclusiveJson(
  filePath: string,
  value: unknown,
): Promise<string> {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
    0o600,
  );
  try {
    await file.writeFile(contents, { encoding: "utf8" });
    await file.sync();
  } finally {
    await file.close();
  }
  return contents;
}

async function readStableUtf8WithinRoot(
  rootPath: string,
  filePath: string,
  expectedContents: string,
): Promise<string> {
  const changedMessage = "独立应用元数据在复验时发生了变化";
  const expectedSha256 = createHash("sha256")
    .update(expectedContents, "utf8")
    .digest("hex");
  return retryCompletedStableFileOperation(async () => {
    await assertSafeExistingParent(rootPath, filePath);
    const before = await lstat(filePath);
    if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
      throw new Error("独立应用元数据不是安全的常规文件");
    }
    if (!isInsideOrEqual(rootPath, await realpath(filePath))) {
      throw new Error("独立应用元数据逃逸了 staging");
    }
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const file = await open(filePath, constants.O_RDONLY | noFollow);
    try {
      const opened = await file.stat();
      const openedChange = fileSnapshotChange(before, opened);
      if (!opened.isFile() || opened.nlink !== 1 || openedChange === "unsafe") {
        throw new Error("独立应用元数据在复验前发生了变化");
      }
      const contents = await file.readFile();
      const afterChange = fileSnapshotChange(opened, await file.stat());
      if (afterChange === "unsafe") {
        throw new Error(changedMessage);
      }
      const sha256 = createHash("sha256").update(contents).digest("hex");
      if (sha256 !== expectedSha256) {
        throw new Error(changedMessage);
      }
      return {
        value: contents.toString("utf8"),
        snapshot: opened,
        sha256,
        ctimeOnlyChange:
          openedChange === "ctime-only" || afterChange === "ctime-only",
      };
    } finally {
      await file.close();
    }
  }, changedMessage);
}

async function hashRegularFile(
  filePath: string,
  expected: Stats,
  expectedSha256?: string,
): Promise<string> {
  const changedMessage = "内嵌游戏文件在复验时发生了变化";
  const operation = async (): Promise<CompletedStableFileOperation<string>> => {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const file = await open(filePath, constants.O_RDONLY | noFollow);
    try {
      const opened = await file.stat();
      const openedChange = fileSnapshotChange(expected, opened);
      if (!opened.isFile() || opened.nlink !== 1 || openedChange === "unsafe") {
        throw new Error("内嵌游戏文件在复验前发生了变化");
      }
      const hash = createHash("sha256");
      const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
      let position = 0;
      while (position < opened.size) {
        const length = Math.min(buffer.length, opened.size - position);
        const { bytesRead } = await file.read(buffer, 0, length, position);
        if (bytesRead !== length) {
          throw new Error("内嵌游戏文件未能完整复验");
        }
        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      const afterChange = fileSnapshotChange(opened, await file.stat());
      if (afterChange === "unsafe") {
        throw new Error(changedMessage);
      }
      const sha256 = hash.digest("hex");
      if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
        throw new Error(changedMessage);
      }
      return {
        value: sha256,
        snapshot: opened,
        sha256,
        ctimeOnlyChange:
          openedChange === "ctime-only" || afterChange === "ctime-only",
      };
    } finally {
      await file.close();
    }
  };
  if (expectedSha256 !== undefined) {
    return retryCompletedStableFileOperation(operation, changedMessage);
  }
  const completed = await operation();
  if (completed.ctimeOnlyChange) {
    throw new Error(changedMessage);
  }
  return completed.value;
}

async function hashStableArchiveFile(
  filePath: string,
  expectedSha256?: string,
): Promise<string> {
  const before = await lstat(filePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size <= 0 ||
    before.size > MAX_ARCHIVE_FILE_BYTES
  ) {
    throw new Error("独立应用 ZIP 不是大小有效的安全文件");
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(filePath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      fileSnapshotChange(before, opened) === "unsafe"
    ) {
      throw new Error("独立应用 ZIP 在复验前发生了变化");
    }
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < opened.size) {
      const length = Math.min(buffer.length, opened.size - position);
      const { bytesRead } = await file.read(buffer, 0, length, position);
      if (bytesRead !== length) {
        throw new Error("独立应用 ZIP 未能完整复验");
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await file.stat();
    if (fileSnapshotChange(opened, after) === "unsafe") {
      throw new Error("独立应用 ZIP 在复验时发生了变化");
    }
    const sha256 = hash.digest("hex");
    if (expectedSha256 !== undefined && sha256 !== expectedSha256) {
      throw new Error("独立应用 ZIP 的 SHA-256 与预期不一致");
    }
    return sha256;
  } finally {
    await file.close();
  }
}

async function copyStableArchiveFile(
  sourcePath: string,
  destinationPath: string,
  expectedSha256: string,
): Promise<FileIdentity> {
  const before = await lstat(sourcePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size <= 0 ||
    before.size > MAX_ARCHIVE_FILE_BYTES
  ) {
    throw new Error("独立应用 ZIP 在发布前无效");
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const source = await open(sourcePath, constants.O_RDONLY | noFollow);
  let destination: FileHandle | null = null;
  let destinationIdentity: FileIdentity | null = null;
  try {
    try {
      const opened = await source.stat();
      if (!opened.isFile() || !sameFileSnapshot(before, opened)) {
        throw new Error("独立应用 ZIP 在发布前发生了变化");
      }
      destination = await open(
        destinationPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
        0o600,
      );
      const created = await destination.stat();
      if (!created.isFile() || created.nlink !== 1 || created.size !== 0) {
        throw new Error("独立应用 ZIP 发布暂存文件无效");
      }
      destinationIdentity = { dev: created.dev, ino: created.ino };
      const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
      let readPosition = 0;
      while (readPosition < opened.size) {
        const length = Math.min(buffer.length, opened.size - readPosition);
        const { bytesRead } = await source.read(
          buffer,
          0,
          length,
          readPosition,
        );
        if (bytesRead !== length) {
          throw new Error("独立应用 ZIP 未能完整读取");
        }
        let writeOffset = 0;
        while (writeOffset < bytesRead) {
          const { bytesWritten } = await destination.write(
            buffer,
            writeOffset,
            bytesRead - writeOffset,
            readPosition + writeOffset,
          );
          if (bytesWritten <= 0) {
            throw new Error("独立应用 ZIP 未能完整写入");
          }
          writeOffset += bytesWritten;
        }
        readPosition += bytesRead;
      }
      if (!sameFileSnapshot(opened, await source.stat())) {
        throw new Error("独立应用 ZIP 在发布时发生了变化");
      }
      await destination.sync();
    } finally {
      await destination?.close().catch(() => undefined);
      await source.close().catch(() => undefined);
    }
    await hashStableArchiveFile(sourcePath, expectedSha256);
    await hashStableArchiveFile(destinationPath, expectedSha256);
    if (destinationIdentity === null) {
      throw new Error("独立应用 ZIP 发布暂存文件身份缺失");
    }
    return destinationIdentity;
  } catch (error) {
    if (destinationIdentity !== null) {
      await removeOwnedRegularFile(
        destinationPath,
        destinationIdentity,
      ).catch(() => undefined);
    }
    throw error;
  }
}

async function snapshotRegularTree(
  rootPath: string,
  currentPath = rootPath,
  expectedRecords?: ReadonlyMap<string, TreeSnapshotRecord>,
): Promise<TreeSnapshotRecord[]> {
  const records: TreeSnapshotRecord[] = [];
  const entries = await readdir(currentPath);
  entries.sort((left, right) => left.localeCompare(right, "en"));
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry);
    const status = await lstat(entryPath);
    if (
      status.isSymbolicLink() ||
      (!status.isDirectory() && !status.isFile())
    ) {
      throw new Error("内嵌游戏包不能包含链接或非常规文件");
    }
    if (status.isDirectory()) {
      records.push(
        ...(await snapshotRegularTree(rootPath, entryPath, expectedRecords)),
      );
    } else {
      const relativePath = path
        .relative(rootPath, entryPath)
        .split(path.sep)
        .join("/");
      records.push({
        path: relativePath,
        bytes: status.size,
        sha256: await hashRegularFile(
          entryPath,
          status,
          expectedRecords?.get(relativePath)?.sha256,
        ),
      });
    }
  }
  return records;
}

async function syncApplicationTree(
  rootPath: string,
  currentPath = rootPath,
): Promise<void> {
  const entries = await readdir(currentPath);
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry);
    const status = await lstat(entryPath);
    if (status.isSymbolicLink()) {
      const resolved = await realpath(entryPath);
      if (!isInsideOrEqual(rootPath, resolved)) {
        throw new Error("独立应用 staging 链接逃逸");
      }
      continue;
    }
    if (status.isDirectory()) {
      await syncApplicationTree(rootPath, entryPath);
      continue;
    }
    if (!status.isFile()) {
      throw new Error("独立应用 staging 包含非常规文件");
    }
    // Windows FlushFileBuffers rejects read-only handles with EPERM. These are
    // private staging files created by this export, so request write access
    // there while keeping the narrower read-only handle on POSIX systems.
    const file = await open(
      entryPath,
      (process.platform === "win32" ? constants.O_RDWR : constants.O_RDONLY) |
        (constants.O_NOFOLLOW ?? 0),
    );
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }
  if (process.platform !== "win32") {
    const directory = await open(currentPath, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}

async function assertSafeApplicationTreeEntry(
  rootPath: string,
  entryPath: string,
): Promise<void> {
  const before = await lstat(entryPath);
  if (before.isSymbolicLink()) {
    const linkTarget = await readlink(entryPath);
    if (
      linkTarget.length === 0 ||
      linkTarget.includes("\0") ||
      path.isAbsolute(linkTarget) ||
      !isInsideOrEqual(rootPath, await realpath(entryPath))
    ) {
      throw new Error("独立应用包含不安全链接");
    }
    if ((await readlink(entryPath)) !== linkTarget) {
      throw new Error("独立应用链接在复验时发生了变化");
    }
    return;
  }
  if (before.isFile()) {
    if (before.nlink !== 1) {
      throw new Error("独立应用不能包含硬链接文件");
    }
    return;
  }
  if (!before.isDirectory()) {
    throw new Error("独立应用包含非常规文件");
  }
  const entries = await readdir(entryPath);
  entries.sort((left, right) => left.localeCompare(right, "en"));
  for (const entry of entries) {
    if (
      entry.length === 0 ||
      entry === "." ||
      entry === ".." ||
      entry.includes("\0")
    ) {
      throw new Error("独立应用包含无效目录项");
    }
    await assertSafeApplicationTreeEntry(
      rootPath,
      path.join(entryPath, entry),
    );
  }
  const after = await lstat(entryPath);
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    after.dev !== before.dev ||
    after.ino !== before.ino
  ) {
    throw new Error("独立应用目录在复验时发生了变化");
  }
}

async function assertSafeApplicationTree(rootPath: string): Promise<void> {
  const rootIdentity = await captureOwnedDirectoryIdentity(
    rootPath,
    "独立应用",
  );
  await assertSafeApplicationTreeEntry(rootPath, rootPath);
  const after = await lstat(rootPath);
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    !sameFileIdentity(after, rootIdentity)
  ) {
    throw new Error("独立应用根目录在复验时发生了变化");
  }
}

const runPlatformCommand: PlatformCommandRunner = async (
  executablePath,
  arguments_,
  environment,
) => {
  await execFileAsync(executablePath, [...arguments_], {
    ...(environment === undefined ? {} : { env: environment }),
  });
};

function windowsPowerShellArguments(script: string): readonly string[] {
  return [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    script,
  ];
}

async function requireWindowsPlayerFile(
  filePath: string,
  context: string,
): Promise<Stats> {
  const status = await lstat(filePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.nlink !== 1 ||
    status.size <= 0 ||
    status.size > MAX_TEMPLATE_FILE_BYTES
  ) {
    throw new Error(`${context}必须是安全的常规文件`);
  }
  return status;
}

async function verifyWindowsX64Executable(executablePath: string): Promise<void> {
  const before = await requireWindowsPlayerFile(
    executablePath,
    "Windows Player 主程序",
  );
  const executable = await open(
    executablePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await executable.stat();
    if (!sameFileSnapshot(before, opened)) {
      throw new Error("Windows Player 主程序在打开前发生了变化");
    }
    const dosHeader = Buffer.alloc(64);
    const dosRead = await executable.read(dosHeader, 0, dosHeader.length, 0);
    if (
      dosRead.bytesRead !== dosHeader.length ||
      dosHeader.subarray(0, 2).toString("ascii") !== "MZ"
    ) {
      throw new Error("Windows Player 主程序不是有效 PE 文件");
    }
    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < 64 || peOffset > opened.size - 6) {
      throw new Error("Windows Player 主程序 PE 头偏移无效");
    }
    const peHeader = Buffer.alloc(6);
    const peRead = await executable.read(peHeader, 0, peHeader.length, peOffset);
    if (
      peRead.bytesRead !== peHeader.length ||
      peHeader.subarray(0, 4).toString("binary") !== "PE\0\0" ||
      peHeader.readUInt16LE(4) !== 0x8664
    ) {
      throw new Error("Windows Player 主程序不是 x64 PE 文件");
    }
    if (!sameFileSnapshot(opened, await executable.stat())) {
      throw new Error("Windows Player 主程序在复验时发生了变化");
    }
  } finally {
    await executable.close();
  }
}

async function verifyWindowsPlayerApplicationTree(
  artifactPath: string,
): Promise<void> {
  await assertSafeApplicationTree(artifactPath);
  await verifyWindowsX64Executable(
    path.join(artifactPath, "VN Engine Player.exe"),
  );
  await requireWindowsPlayerFile(
    path.join(artifactPath, "resources", "app.asar"),
    "Windows Player app.asar",
  );
}

async function removeCodeSignIncompatibleExtendedAttributes(
  artifactPath: string,
  commandRunner: PlatformCommandRunner,
): Promise<void> {
  for (const attributeName of CODE_SIGN_INCOMPATIBLE_XATTRS) {
    await commandRunner("/usr/bin/xattr", [
      "-d",
      "-r",
      "-s",
      attributeName,
      artifactPath,
    ]).catch(() => undefined);
  }
}

export async function sanitizeAndVerifyStandaloneApplication(
  artifactPath: string,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  if (process.platform === "win32") {
    await verifyWindowsPlayerApplicationTree(artifactPath);
    await syncApplicationTree(artifactPath);
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("独立应用发布复验只支持 macOS 和 Windows");
  }
  await assertSafeApplicationTree(artifactPath);
  // FileProvider can attach Finder metadata while a tree is traversed or
  // synced. Finish all reads/fsyncs first, then remove only codesign-forbidden
  // attributes immediately before verification.
  await syncApplicationTree(artifactPath);
  await removeCodeSignIncompatibleExtendedAttributes(
    artifactPath,
    commandRunner,
  );
  await commandRunner("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    artifactPath,
  ]);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, FILE_PROVIDER_SETTLE_DELAY_MS);
  });
  try {
    // Do not clean again here. A second untouched verification proves that
    // the destination did not immediately rehydrate forbidden FinderInfo.
    await commandRunner("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      artifactPath,
    ]);
  } catch (error) {
    throw new UnstableStandaloneApplicationMetadataError(error);
  }
}

export async function verifyStandalonePlayerTemplateSignature(
  stagingArtifactPath: string,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  if (process.platform === "win32") {
    await verifyWindowsPlayerApplicationTree(stagingArtifactPath);
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("Player 模板复验只支持 macOS 和 Windows");
  }
  await commandRunner("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    stagingArtifactPath,
  ]);
}

export async function archiveStandaloneApplication(
  applicationPath: string,
  archivePath: string,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  await assertSafeApplicationTree(applicationPath);
  await assertMissing(archivePath, "独立应用 ZIP 已存在");
  if (process.platform === "darwin") {
    await commandRunner("/usr/bin/ditto", [
      "-c",
      "-k",
      "--keepParent",
      "--norsrc",
      "--noextattr",
      "--noacl",
      "--noqtn",
      applicationPath,
      archivePath,
    ]);
  } else if (process.platform === "win32") {
    // Match the fixed, environment-only invocation used by the Player release
    // archiver. No author-controlled path is interpolated into PowerShell.
    const invocation = windowsStandaloneArchiveInvocation(
      applicationPath,
      archivePath,
    );
    await commandRunner(
      invocation.command,
      invocation.arguments,
      invocation.environment,
    );
  } else {
    throw new Error("独立应用归档只支持 macOS 和 Windows");
  }
  const archive = await open(
    archivePath,
    (process.platform === "win32" ? constants.O_RDWR : constants.O_RDONLY) |
      (constants.O_NOFOLLOW ?? 0),
  );
  try {
    await archive.sync();
  } finally {
    await archive.close();
  }
  await hashStableArchiveFile(archivePath);
}

export async function extractStandaloneApplicationArchive(
  archivePath: string,
  extractionRootPath: string,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  const rootIdentity = await captureOwnedDirectoryIdentity(
    extractionRootPath,
    "ZIP 解压复验目录",
  );
  if ((await readdir(extractionRootPath)).length !== 0) {
    throw new Error("ZIP 解压复验目录必须为空");
  }
  await hashStableArchiveFile(archivePath);
  if (process.platform === "darwin") {
    await commandRunner("/usr/bin/ditto", [
      "-x",
      "-k",
      "--norsrc",
      "--noextattr",
      "--noacl",
      "--noqtn",
      archivePath,
      extractionRootPath,
    ]);
  } else if (process.platform === "win32") {
    const invocation = windowsStandaloneExtractionInvocation(
      archivePath,
      extractionRootPath,
    );
    await commandRunner(
      invocation.command,
      invocation.arguments,
      invocation.environment,
    );
  } else {
    throw new Error("独立应用 ZIP 复验只支持 macOS 和 Windows");
  }
  const after = await lstat(extractionRootPath);
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    !sameFileIdentity(after, rootIdentity)
  ) {
    throw new Error("ZIP 解压复验目录在解压时发生了变化");
  }
}

export async function verifyExtractedStandaloneApplication(
  applicationPath: string,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  if (process.platform === "win32") {
    await verifyWindowsPlayerApplicationTree(applicationPath);
    return;
  }
  if (process.platform !== "darwin") {
    throw new Error("独立应用复验只支持 macOS 和 Windows");
  }
  // Verification deliberately performs no cleanup or re-signing. It proves
  // that the exact bytes restored from the ZIP already carry a valid signature.
  await assertSafeApplicationTree(applicationPath);
  await commandRunner("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    applicationPath,
  ]);
}

export async function finalizeStandaloneApplication(
  stagingArtifactPath: string,
  template: LoadedStandalonePlayerTemplate,
  application: StandaloneApplicationMetadata,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  if (template.manifest.platform === "win32") {
    if (template.manifest.arch !== "x64") {
      throw new Error("Windows 本地独立应用只支持 x64 Player 模板");
    }
    await verifyWindowsPlayerApplicationTree(stagingArtifactPath);
    return;
  }
  if (template.manifest.platform !== "darwin") {
    throw new Error("Linux 独立应用必须由对应平台 CI 重新构建");
  }
  const plistRelativePath = template.manifest.macosInfoPlistFile;
  if (plistRelativePath === null) {
    throw new Error("macOS 模板缺少 Info.plist 配置");
  }
  const plistPath = path.join(
    stagingArtifactPath,
    ...plistRelativePath.split("/"),
  );
  await assertSafeExistingParent(stagingArtifactPath, plistPath);
  const plistStatus = await lstat(plistPath);
  if (
    plistStatus.isSymbolicLink() ||
    !plistStatus.isFile() ||
    plistStatus.nlink !== 1 ||
    !isInsideOrEqual(stagingArtifactPath, await realpath(plistPath))
  ) {
    throw new Error("macOS 模板 Info.plist 无效");
  }
  for (const [key, value] of [
    // Keep CFBundleName/CFBundleExecutable aligned with the prebuilt Electron
    // helper application names. Renaming only the outer .app and display name
    // preserves Electron's helper lookup while presenting the game title in
    // Finder. A native Forge rebuild may rename the whole helper set.
    ["CFBundleDisplayName", application.name],
    ["CFBundleShortVersionString", application.version],
    ["CFBundleVersion", application.version],
    ["CFBundleIdentifier", application.applicationId],
  ] as const) {
    await commandRunner("/usr/bin/plutil", [
      "-replace",
      key,
      "-string",
      value,
      plistPath,
    ]);
  }
  await assertSafeApplicationTree(stagingArtifactPath);
  await syncApplicationTree(stagingArtifactPath);
  await removeCodeSignIncompatibleExtendedAttributes(
    stagingArtifactPath,
    commandRunner,
  );
  // Internal/test builds receive a fresh ad-hoc signature after content
  // injection. Developer ID, notarization and custom icons remain CI work.
  await commandRunner("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    stagingArtifactPath,
  ]);
  await commandRunner("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    stagingArtifactPath,
  ]);
}

async function verifyEmbeddedApplicationContents(
  applicationPath: string,
  template: LoadedStandalonePlayerTemplate,
  expectedMetadataContents: string,
  expectedEmbeddedRecords: readonly TreeSnapshotRecord[],
): Promise<void> {
  const metadataPath = path.join(
    applicationPath,
    ...template.manifest.applicationMetadataFile.split("/"),
  );
  const gamePath = path.join(
    applicationPath,
    ...template.manifest.gameResourceDirectory.split("/"),
  );
  if (
    (await readStableUtf8WithinRoot(
      applicationPath,
      metadataPath,
      expectedMetadataContents,
    )) !== expectedMetadataContents
  ) {
    throw new Error("独立应用元数据在 ZIP 复验时发生了变化");
  }
  const actualRecords = await snapshotRegularTree(
    gamePath,
    gamePath,
    new Map(expectedEmbeddedRecords.map((record) => [record.path, record])),
  );
  if (JSON.stringify(actualRecords) !== JSON.stringify(expectedEmbeddedRecords)) {
    throw new Error("内嵌游戏内容在 ZIP 复验时发生了变化");
  }
}

async function verifyStandaloneApplicationArchive(
  archivePath: string,
  extractionRootPath: string,
  applicationName: string,
  template: LoadedStandalonePlayerTemplate,
  expectedMetadataContents: string,
  expectedEmbeddedRecords: readonly TreeSnapshotRecord[],
  expectedApplicationRecords: readonly TreeSnapshotRecord[] | null,
  expectedArchiveSha256: string,
  extractArchive: (
    archivePath: string,
    extractionRootPath: string,
  ) => Promise<void>,
  verifyExtractedApplication: (applicationPath: string) => Promise<void>,
): Promise<void> {
  await hashStableArchiveFile(archivePath, expectedArchiveSha256);
  await mkdir(extractionRootPath, { mode: 0o700 });
  await extractArchive(archivePath, extractionRootPath);
  const rootEntries = await readdir(extractionRootPath);
  if (rootEntries.length !== 1 || rootEntries[0] !== applicationName) {
    throw new Error(
      `独立应用 ZIP 根目录必须精确包含 ${applicationName}`,
    );
  }
  const extractedApplicationPath = path.join(
    extractionRootPath,
    applicationName,
  );
  const extractedStatus = await lstat(extractedApplicationPath);
  if (
    extractedStatus.isSymbolicLink() ||
    !extractedStatus.isDirectory() ||
    (await realpath(extractedApplicationPath)) !== extractedApplicationPath
  ) {
    throw new Error("独立应用 ZIP 内的应用目录无效");
  }
  await assertSafeApplicationTree(extractedApplicationPath);
  await verifyEmbeddedApplicationContents(
    extractedApplicationPath,
    template,
    expectedMetadataContents,
    expectedEmbeddedRecords,
  );
  if (expectedApplicationRecords !== null) {
    const extractedRecords = await snapshotRegularTree(
      extractedApplicationPath,
      extractedApplicationPath,
      new Map(expectedApplicationRecords.map((record) => [record.path, record])),
    );
    if (
      JSON.stringify(extractedRecords) !==
      JSON.stringify(expectedApplicationRecords)
    ) {
      throw new Error("Windows 独立应用 ZIP 文件树与组装结果不一致");
    }
  }
  await verifyExtractedApplication(extractedApplicationPath);
  await hashStableArchiveFile(archivePath, expectedArchiveSha256);
}

export async function exportStandaloneApplication(
  options: StandaloneApplicationExportOptions,
): Promise<StandaloneApplicationExportResult> {
  const template = await loadStandalonePlayerTemplate(options.templateRootPath);
  if (
    template.manifest.platform !== "darwin" &&
    template.manifest.platform !== "win32"
  ) {
    throw new Error("当前 Editor 只支持在 macOS 或 Windows 本地组装独立应用");
  }
  const sourceRootPath = await canonicalizeDirectory(
    options.sourceProjectRootPath,
    "项目根目录",
  );
  const requestedTargetPath = path.resolve(options.targetArtifactPath);
  const targetParentPath = await canonicalizeDirectory(
    path.dirname(requestedTargetPath),
    "导出位置",
  );
  const artifactName = validateTargetName(requestedTargetPath, template);
  const packagedApplicationName = applicationArtifactName(
    options.application,
    template,
  );
  const targetPath = path.join(targetParentPath, artifactName);
  if (isInsideOrEqual(sourceRootPath, targetPath)) {
    throw new Error("独立应用不能导出到源项目内部");
  }
  await assertMissing(targetPath, "导出位置已存在同名独立应用");

  const transactionId = randomUUID();
  const lockPath = path.join(targetParentPath, `.${artifactName}.export.lock`);
  const publishingDirectoryPath = path.join(
    targetParentPath,
    `.vn-engine-${transactionId}.publishing`,
  );
  const publishingArchivePath = path.join(
    publishingDirectoryPath,
    "archive.zip",
  );
  const lock = await acquireExportFileLock(
    lockPath,
    "另一个导出任务正在写入同名独立应用",
  );
  let transactionRootPath: string | null = null;
  let transactionRootIdentity: FileIdentity | null = null;
  let publishingDirectoryIdentity: FileIdentity | null = null;
  let publishingArchiveIdentity: FileIdentity | null = null;
  let targetIdentity: FileIdentity | null = null;
  let committed = false;

  try {
    await assertMissing(targetPath, "导出位置已存在同名独立应用");
    const temporaryBasePath = await canonicalizeDirectory(
      tmpdir(),
      "系统临时目录",
    );
    transactionRootPath = await mkdtemp(
      path.join(temporaryBasePath, "vn-engine-standalone-export-"),
    );
    transactionRootPath = await realpath(transactionRootPath);
    await chmod(transactionRootPath, 0o700);
    transactionRootIdentity = await captureOwnedDirectoryIdentity(
      transactionRootPath,
      "独立应用私有工作区",
    );
    const stagingPath = path.join(
      transactionRootPath,
      packagedApplicationName,
    );
    const temporaryBundlePath = path.join(
      transactionRootPath,
      "runtime.vngame",
    );

    const runtime = await exportRuntimeBundle({
      sourceProjectRootPath: sourceRootPath,
      targetBundlePath: temporaryBundlePath,
      sourceRevision: options.sourceRevision,
      expectedManifestSha256: options.expectedManifestSha256,
      expectedProject: options.expectedProject,
      expectedAssets: options.expectedAssets,
      buildId: options.buildId,
      createdAt: options.createdAt,
      assertSourceStillCurrent: options.assertSourceStillCurrent,
      injectFault: options.injectRuntimeBundleFault,
    });
    await options.injectFault?.("after-runtime-bundle");

    await mkdir(stagingPath, { mode: 0o700 });
    await copyTemplateArtifact(template.artifactRootPath, stagingPath);
    await options.verifyTemplateArtifact?.(stagingPath);
    await options.injectFault?.("after-template-copy");

    const gameDirectoryPath = path.join(
      stagingPath,
      ...template.manifest.gameResourceDirectory.split("/"),
    );
    const applicationMetadataPath = path.join(
      stagingPath,
      ...template.manifest.applicationMetadataFile.split("/"),
    );
    await assertSafeExistingParent(stagingPath, gameDirectoryPath);
    await assertSafeExistingParent(stagingPath, applicationMetadataPath);
    await Promise.all([
      assertMissing(gameDirectoryPath, "独立 Player 模板已包含游戏内容"),
      assertMissing(
        applicationMetadataPath,
        "独立 Player 模板已包含应用元数据",
      ),
    ]);
    await rename(temporaryBundlePath, gameDirectoryPath);

    const applicationDocument: StandaloneApplicationDocument = {
      format: STANDALONE_APPLICATION_FORMAT,
      configVersion: STANDALONE_APPLICATION_CONFIG_VERSION,
      productName: options.application.name,
      version: options.application.version,
      appBundleId: options.application.applicationId,
      icon: STANDALONE_DEFAULT_ICON,
      runtimeBuildId: runtime.buildId,
      playerVersion: template.manifest.playerVersion,
    };
    const expectedMetadataContents = await writeExclusiveJson(
      applicationMetadataPath,
      applicationDocument,
    );
    const embeddedBeforeFinalize = await snapshotRegularTree(gameDirectoryPath);
    await options.injectFault?.("after-content-injection");

    await (options.finalizeApplication ?? finalizeStandaloneApplication)(
      stagingPath,
      template,
      options.application,
    );
    await options.injectFault?.("after-platform-finalize");

    if (
      (await readStableUtf8WithinRoot(
        stagingPath,
        applicationMetadataPath,
        expectedMetadataContents,
      )) !== expectedMetadataContents
    ) {
      throw new Error("独立应用元数据在组装时发生了变化");
    }
    const embeddedAfterFinalize = await snapshotRegularTree(
      gameDirectoryPath,
      gameDirectoryPath,
      new Map(embeddedBeforeFinalize.map((record) => [record.path, record])),
    );
    if (
      JSON.stringify(embeddedAfterFinalize) !==
      JSON.stringify(embeddedBeforeFinalize)
    ) {
      throw new Error("内嵌游戏内容在平台处理时发生了变化");
    }

    const stagingStatus = await lstat(stagingPath);
    if (
      stagingStatus.isSymbolicLink() ||
      !stagingStatus.isDirectory() ||
      (await realpath(stagingPath)) !== stagingPath
    ) {
      throw new Error("独立应用 staging 在提交前发生了变化");
    }
    await (options.preparePublishedArtifact ??
      sanitizeAndVerifyStandaloneApplication)(stagingPath);
    await verifyEmbeddedApplicationContents(
      stagingPath,
      template,
      expectedMetadataContents,
      embeddedBeforeFinalize,
    );
    await syncApplicationTree(stagingPath);
    // Windows templates are unsigned for local/internal export, so a complete
    // path/size/SHA-256 snapshot replaces macOS codesign as the post-archive
    // exactness proof. Electron's physical app.asar is hashed as one file.
    const expectedApplicationRecords =
      template.manifest.platform === "win32"
        ? await snapshotRegularTree(stagingPath)
        : null;

    const privateArchivePath = path.join(
      transactionRootPath,
      "standalone-application.zip",
    );
    await (options.archiveApplication ?? archiveStandaloneApplication)(
      stagingPath,
      privateArchivePath,
    );
    const expectedArchiveSha256 = await hashStableArchiveFile(
      privateArchivePath,
    );
    const extractArchive =
      options.extractApplicationArchive ??
      extractStandaloneApplicationArchive;
    const verifyExtracted =
      options.verifyExtractedApplication ??
      options.preparePublishedArtifact ??
      verifyExtractedStandaloneApplication;
    await verifyStandaloneApplicationArchive(
      privateArchivePath,
      path.join(transactionRootPath, "private-archive-verification"),
      packagedApplicationName,
      template,
      expectedMetadataContents,
      embeddedBeforeFinalize,
      expectedApplicationRecords,
      expectedArchiveSha256,
      extractArchive,
      verifyExtracted,
    );

    await lock.assertOwned();
    await assertMissing(
      publishingDirectoryPath,
      "独立应用 ZIP 发布暂存目录已存在",
    );
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error("导出位置在发布前发生了变化");
    }
    await mkdir(publishingDirectoryPath, { mode: 0o700 });
    publishingDirectoryIdentity = await captureOwnedDirectoryIdentity(
      publishingDirectoryPath,
      "独立应用 ZIP 发布暂存目录",
    );
    const publishingDirectory = await open(
      publishingDirectoryPath,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_DIRECTORY ?? 0),
    );
    try {
      const openedPublishingDirectory = await publishingDirectory.stat();
      if (
        !openedPublishingDirectory.isDirectory() ||
        !sameFileIdentity(
          openedPublishingDirectory,
          publishingDirectoryIdentity,
        )
      ) {
        throw new Error("独立应用 ZIP 发布暂存目录在创建时发生了变化");
      }
      await publishingDirectory.chmod(0o700);
    } finally {
      await publishingDirectory.close();
    }
    const publishingDirectoryAfterCreation =
      await captureOwnedDirectoryIdentity(
        publishingDirectoryPath,
        "独立应用 ZIP 发布暂存目录",
      );
    if (
      !sameFileIdentity(
        publishingDirectoryAfterCreation,
        publishingDirectoryIdentity,
      )
    ) {
      throw new Error("独立应用 ZIP 发布暂存目录在创建时发生了变化");
    }
    await assertMissing(
      publishingArchivePath,
      "独立应用 ZIP 发布暂存文件已存在",
    );
    publishingArchiveIdentity = await copyStableArchiveFile(
      privateArchivePath,
      publishingArchivePath,
      expectedArchiveSha256,
    );
    const publishingDirectoryAfterCopy =
      await captureOwnedDirectoryIdentity(
        publishingDirectoryPath,
        "独立应用 ZIP 发布暂存目录",
      );
    if (
      !sameFileIdentity(
        publishingDirectoryAfterCopy,
        publishingDirectoryIdentity,
      )
    ) {
      throw new Error("独立应用 ZIP 发布暂存目录在复制后发生了变化");
    }
    const publishingAfterCopy = await captureOwnedRegularFileIdentity(
      publishingArchivePath,
      "独立应用 ZIP 发布暂存文件",
    );
    if (
      !sameFileIdentity(publishingAfterCopy, publishingArchiveIdentity)
    ) {
      throw new Error("独立应用 ZIP 发布暂存文件在复制后发生了变化");
    }
    await verifyStandaloneApplicationArchive(
      publishingArchivePath,
      path.join(transactionRootPath, "published-archive-verification"),
      packagedApplicationName,
      template,
      expectedMetadataContents,
      embeddedBeforeFinalize,
      expectedApplicationRecords,
      expectedArchiveSha256,
      extractArchive,
      verifyExtracted,
    );

    await options.assertSourceStillCurrent?.();
    await options.injectFault?.("before-commit");
    await lock.assertOwned();
    await assertMissing(targetPath, "导出位置在提交前发生了变化");
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error("导出位置在提交前发生了变化");
    }
    const publishingDirectoryBeforeCommit =
      await captureOwnedDirectoryIdentity(
        publishingDirectoryPath,
        "独立应用 ZIP 发布暂存目录",
      );
    if (
      !sameFileIdentity(
        publishingDirectoryBeforeCommit,
        publishingDirectoryIdentity,
      )
    ) {
      throw new Error("独立应用 ZIP 发布暂存目录在提交前发生了变化");
    }
    const publishingBeforeCommit = await captureOwnedRegularFileIdentity(
      publishingArchivePath,
      "独立应用 ZIP 发布暂存文件",
    );
    if (
      !sameFileIdentity(publishingBeforeCommit, publishingArchiveIdentity)
    ) {
      throw new Error("独立应用 ZIP 发布暂存文件在提交前发生了变化");
    }
    await hashStableArchiveFile(
      publishingArchivePath,
      expectedArchiveSha256,
    );
    try {
      // A same-filesystem hard link gives us an atomic, no-clobber commit. The
      // final name never refers to partial bytes, and a racing creator wins
      // rather than being overwritten by rename(2).
      await link(publishingArchivePath, targetPath);
    } catch (error) {
      if (errnoCode(error) === "EEXIST") {
        throw new Error("导出位置在提交前发生了变化");
      }
      throw error;
    }
    targetIdentity = publishingArchiveIdentity;
    const [publishingAfterLink, targetAfterLink] = await Promise.all([
      lstat(publishingArchivePath),
      lstat(targetPath),
    ]);
    if (
      publishingAfterLink.isSymbolicLink() ||
      targetAfterLink.isSymbolicLink() ||
      !publishingAfterLink.isFile() ||
      !targetAfterLink.isFile() ||
      !sameFileIdentity(publishingAfterLink, publishingArchiveIdentity) ||
      !sameFileIdentity(targetAfterLink, publishingArchiveIdentity) ||
      publishingAfterLink.nlink !== 2 ||
      targetAfterLink.nlink !== 2
    ) {
      throw new Error("独立应用 ZIP 导出产物的原子链接无效");
    }
    await removeOwnedRegularFile(
      publishingArchivePath,
      publishingArchiveIdentity,
    );
    await assertMissing(
      publishingArchivePath,
      "独立应用 ZIP 发布暂存文件清理失败",
    );
    publishingArchiveIdentity = null;
    await removeOwnedEmptyDirectory(
      publishingDirectoryPath,
      publishingDirectoryIdentity,
    );
    await assertMissing(
      publishingDirectoryPath,
      "独立应用 ZIP 发布暂存目录清理失败",
    );
    publishingDirectoryIdentity = null;
    const targetAfterCommit = await captureOwnedRegularFileIdentity(
      targetPath,
      "独立应用 ZIP 导出产物",
    );
    if (!sameFileIdentity(targetAfterCommit, targetIdentity)) {
      throw new Error("独立应用导出产物在提交时发生了变化");
    }
    await hashStableArchiveFile(targetPath, expectedArchiveSha256);
    committed = true;
    if (process.platform !== "win32") {
      await (async () => {
        const parent = await open(targetParentPath, constants.O_RDONLY);
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
      })().catch(() => undefined);
    }

    return {
      artifactName,
      buildId: runtime.buildId,
      sourceRevision: runtime.sourceRevision,
      assetCount: runtime.assetCount,
      platform: template.manifest.platform,
      arch: template.manifest.arch,
    };
  } finally {
    if (!committed && targetIdentity !== null) {
      await removeOwnedRegularFile(targetPath, targetIdentity).catch(
        () => undefined,
      );
    }
    if (publishingArchiveIdentity !== null) {
      await removeOwnedRegularFile(
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
      await removeOwnedDirectory(
        transactionRootPath,
        transactionRootIdentity,
      ).catch(() => undefined);
    }
    await lock.release();
  }
}
