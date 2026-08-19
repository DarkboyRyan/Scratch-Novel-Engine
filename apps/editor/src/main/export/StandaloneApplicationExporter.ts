import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  type FileHandle,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { ProjectDocument } from "@vnengine/runtime";

import type { StandaloneApplicationMetadata } from "../../shared/exportProtocol";
import type { AssetDocument } from "../../shared/projectTypes";
import {
  exportRuntimeBundle,
  type RuntimeBundleExportFaultPoint,
} from "./RuntimeBundleExporter";
import {
  loadStandalonePlayerTemplate,
  type LoadedStandalonePlayerTemplate,
} from "./StandalonePlayerTemplate";
import { acquireExportFileLock } from "./ExportFileLock";

const execFileAsync = promisify(execFile);
const COPY_BUFFER_BYTES = 256 * 1024;
const MAX_TEMPLATE_ENTRIES = 100_000;
const MAX_TEMPLATE_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TEMPLATE_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;
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

type FileIdentity = {
  dev: number;
  ino: number;
};

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
      await rm(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        attempt === CLEANUP_RETRY_ATTEMPTS - 1 ||
        !["EBUSY", "ENOTEMPTY"].includes(errnoCode(error) ?? "")
      ) {
        throw error;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, CLEANUP_RETRY_DELAY_MS);
      });
    }
  }
}

async function moveOwnedDirectoryAside(
  directoryPath: string,
  rollbackPath: string,
  identity: FileIdentity,
): Promise<FileIdentity | null> {
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
    return null;
  }
  await assertMissing(rollbackPath, "独立应用回滚暂存位置已存在");
  await rename(directoryPath, rollbackPath);
  const moved = await lstat(rollbackPath);
  if (
    moved.isSymbolicLink() ||
    !moved.isDirectory() ||
    !sameFileIdentity(moved, identity)
  ) {
    return null;
  }
  return identity;
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
    artifactName.includes("\0") ||
    /[. ]$/u.test(artifactName)
  ) {
    throw new Error("独立应用产物名称无效");
  }
  if (
    template.manifest.platform === "darwin" &&
    !artifactName.endsWith(".app")
  ) {
    throw new Error("macOS 独立应用名称必须以 .app 结尾");
  }
  return artifactName;
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
    await mkdir(destinationPath, { mode: status.mode & 0o777 });
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
    await chmod(destinationPath, status.mode & 0o777);
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
    const file = await open(entryPath, constants.O_RDONLY);
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
) => {
  await execFileAsync(executablePath, [...arguments_]);
};

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
  if (process.platform !== "darwin") {
    throw new Error("独立应用发布复验只支持 macOS");
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
  if (process.platform !== "darwin") {
    throw new Error("Player 模板签名复验只支持 macOS");
  }
  await commandRunner("/usr/bin/codesign", [
    "--verify",
    "--deep",
    "--strict",
    stagingArtifactPath,
  ]);
}

export async function finalizeStandaloneApplication(
  stagingArtifactPath: string,
  template: LoadedStandalonePlayerTemplate,
  application: StandaloneApplicationMetadata,
  commandRunner: PlatformCommandRunner = runPlatformCommand,
): Promise<void> {
  if (template.manifest.platform !== "darwin") {
    throw new Error("Windows/Linux 独立应用必须由对应平台 CI 重新构建");
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

export async function exportStandaloneApplication(
  options: StandaloneApplicationExportOptions,
): Promise<StandaloneApplicationExportResult> {
  const template = await loadStandalonePlayerTemplate(options.templateRootPath);
  if (template.manifest.platform !== "darwin") {
    throw new Error("当前 Editor 只支持在 macOS 本地组装独立应用");
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
  const targetPath = path.join(targetParentPath, artifactName);
  if (isInsideOrEqual(sourceRootPath, targetPath)) {
    throw new Error("独立应用不能导出到源项目内部");
  }
  await assertMissing(targetPath, "导出位置已存在同名独立应用");

  const transactionId = randomUUID();
  const lockPath = path.join(targetParentPath, `.${artifactName}.export.lock`);
  const publishingPath = path.join(
    targetParentPath,
    `VNEnginePublishing-${transactionId}`,
  );
  const rollbackPath = path.join(
    targetParentPath,
    `VNEngineRollback-${transactionId}`,
  );
  const lock = await acquireExportFileLock(
    lockPath,
    "另一个导出任务正在写入同名独立应用",
  );
  let transactionRootPath: string | null = null;
  let transactionRootIdentity: FileIdentity | null = null;
  let publishingIdentity: FileIdentity | null = null;
  let targetIdentity: FileIdentity | null = null;
  let rollbackIdentity: FileIdentity | null = null;
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
    const stagingPath = path.join(transactionRootPath, artifactName);
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

    await options.injectFault?.("before-commit");
    await lock.assertOwned();
    const stagingStatus = await lstat(stagingPath);
    if (
      stagingStatus.isSymbolicLink() ||
      !stagingStatus.isDirectory() ||
      (await realpath(stagingPath)) !== stagingPath
    ) {
      throw new Error("独立应用 staging 在提交前发生了变化");
    }
    await syncApplicationTree(stagingPath);

    await assertMissing(publishingPath, "独立应用发布暂存位置已存在");
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error("导出位置在发布前发生了变化");
    }
    const stagingIdentity = await captureOwnedDirectoryIdentity(
      stagingPath,
      "独立应用 staging",
    );
    let movedToPublishing = false;
    try {
      await rename(stagingPath, publishingPath);
      movedToPublishing = true;
    } catch (error) {
      if (errnoCode(error) !== "EXDEV") {
        throw error;
      }
    }
    if (movedToPublishing) {
      publishingIdentity = stagingIdentity;
      const movedIdentity = await captureOwnedDirectoryIdentity(
        publishingPath,
        "独立应用发布暂存目录",
      );
      if (!sameFileIdentity(movedIdentity, publishingIdentity)) {
        throw new Error("独立应用发布暂存目录在移动时发生了变化");
      }
    } else {
      // External-volume exports cannot rename from the private workspace.
      // Keep the final name absent while a complete sibling is copied and
      // verified on the destination volume.
      await mkdir(publishingPath, { mode: 0o700 });
      publishingIdentity = await captureOwnedDirectoryIdentity(
        publishingPath,
        "独立应用发布暂存目录",
      );
      await copyTemplateArtifact(stagingPath, publishingPath);
    }
    await (options.preparePublishedArtifact ??
      sanitizeAndVerifyStandaloneApplication)(publishingPath);
    await syncApplicationTree(publishingPath);

    await options.assertSourceStillCurrent?.();
    await lock.assertOwned();
    await assertMissing(targetPath, "导出位置在提交前发生了变化");
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error("导出位置在提交前发生了变化");
    }
    const publishingBeforeRename = await captureOwnedDirectoryIdentity(
      publishingPath,
      "独立应用发布暂存目录",
    );
    if (!sameFileIdentity(publishingBeforeRename, publishingIdentity)) {
      throw new Error("独立应用发布暂存目录在提交前发生了变化");
    }
    await rename(publishingPath, targetPath);
    targetIdentity = publishingIdentity;
    publishingIdentity = null;
    const targetAfterRename = await captureOwnedDirectoryIdentity(
      targetPath,
      "独立应用导出产物",
    );
    if (!sameFileIdentity(targetAfterRename, targetIdentity)) {
      throw new Error("独立应用导出产物在提交时发生了变化");
    }
    await (options.preparePublishedArtifact ??
      sanitizeAndVerifyStandaloneApplication)(targetPath);
    const targetAfterVerification = await captureOwnedDirectoryIdentity(
      targetPath,
      "独立应用导出产物",
    );
    if (!sameFileIdentity(targetAfterVerification, targetIdentity)) {
      throw new Error("独立应用导出产物在最终复验时发生了变化");
    }
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
      const privateRollbackPath =
        transactionRootPath === null
          ? null
          : path.join(transactionRootPath, "failed-target");
      const evacuatedIdentity =
        privateRollbackPath === null
          ? null
          : await moveOwnedDirectoryAside(
              targetPath,
              privateRollbackPath,
              targetIdentity,
            ).catch(() => null);
      if (evacuatedIdentity !== null) {
        targetIdentity = null;
      }
    }
    if (!committed && targetIdentity !== null) {
      rollbackIdentity = await moveOwnedDirectoryAside(
        targetPath,
        rollbackPath,
        targetIdentity,
      ).catch(() => null);
      if (rollbackIdentity !== null) {
        targetIdentity = null;
      } else {
        await removeOwnedDirectory(targetPath, targetIdentity).catch(
          () => undefined,
        );
      }
    }
    if (rollbackIdentity !== null) {
      await removeOwnedDirectory(rollbackPath, rollbackIdentity).catch(
        () => undefined,
      );
    }
    if (publishingIdentity !== null) {
      const privatePublishingCleanupPath =
        transactionRootPath === null
          ? null
          : path.join(transactionRootPath, "failed-publishing");
      const evacuatedIdentity =
        privatePublishingCleanupPath === null
          ? null
          : await moveOwnedDirectoryAside(
              publishingPath,
              privatePublishingCleanupPath,
              publishingIdentity,
            ).catch(() => null);
      if (evacuatedIdentity !== null) {
        publishingIdentity = null;
      } else {
        await removeOwnedDirectory(publishingPath, publishingIdentity).catch(
          () => undefined,
        );
      }
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
