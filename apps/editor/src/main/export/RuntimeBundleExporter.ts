import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import type {
  AssetDocument,
  ProjectDocument,
} from "../../shared/projectTypes";
import { mediaMagicMatches } from "../media/MediaContentValidator";
import { maximumPreviewBytes } from "../media/MediaFormat";
import {
  compileAuthorProjectV13,
  RUNTIME_VERSION,
  type AuthorAssetRecord,
} from "./AuthorProjectCompiler";
import { acquireExportFileLock } from "./ExportFileLock";

const MAX_AUTHOR_PROJECT_BYTES = 64 * 1024 * 1024;
const MAX_RUNTIME_JSON_BYTES = 16 * 1024 * 1024;
const COPY_BUFFER_BYTES = 256 * 1024;
const MAX_CTIME_ONLY_RETRY_ATTEMPTS = 3;

export const RUNTIME_MANIFEST_FORMAT = "vn-engine-runtime-manifest";
export const RUNTIME_MANIFEST_VERSION = 1;
export const PLAYER_COMPATIBILITY = ">=4 <5";

export type RuntimeManifestAssetV1 = {
  assetId: string;
  type: AuthorAssetRecord["type"];
  displayName: string;
  path: string;
  mime: AuthorAssetRecord["mime"];
  bytes: number;
  sha256: string;
};

export type RuntimeManifestDocumentV1 = {
  format: typeof RUNTIME_MANIFEST_FORMAT;
  manifestVersion: typeof RUNTIME_MANIFEST_VERSION;
  buildId: string;
  projectId: string;
  sourceRevision: number;
  runtimeVersion: typeof RUNTIME_VERSION;
  playerCompatibility: typeof PLAYER_COMPATIBILITY;
  createdAt: string;
  files: RuntimeManifestAssetV1[];
};

export type RuntimeBundleExportResult = {
  bundleName: string;
  buildId: string;
  sourceRevision: number;
  assetCount: number;
};

export type RuntimeBundleExportFaultPoint =
  "after-game" | "after-assets" | "after-manifest" | "before-commit";

export type RuntimeBundleExportOptions = {
  sourceProjectRootPath: string;
  targetBundlePath: string;
  sourceRevision: number;
  expectedManifestSha256: string;
  expectedProject: ProjectDocument;
  expectedAssets: AssetDocument[];
  buildId?: string;
  createdAt?: string;
  assertSourceStillCurrent?: () => void | Promise<void>;
  injectFault?: (point: RuntimeBundleExportFaultPoint) => void | Promise<void>;
};

type OpenedStableFile = {
  file: FileHandle;
  snapshot: Stats;
  ctimeOnlyChange: boolean;
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
  // A ctime-only retry is safe only when the operation also checks its bytes
  // against a caller-owned digest. The retry still pins every other stat field
  // and requires a complete, byte-identical second read.
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

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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

async function openStableFile(
  canonicalRootPath: string,
  relativePath: string,
  maximumBytes: number,
): Promise<OpenedStableFile> {
  const components = relativePath.split("/");
  let currentPath = canonicalRootPath;
  for (const [index, component] of components.entries()) {
    if (
      component.length === 0 ||
      component === "." ||
      component === ".." ||
      component.includes("\\") ||
      component.includes("\0")
    ) {
      throw new Error("资源清单包含不安全路径");
    }
    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    const isFinal = index === components.length - 1;
    if (
      status.isSymbolicLink() ||
      (isFinal ? !status.isFile() : !status.isDirectory())
    ) {
      throw new Error("资源路径不能包含符号链接或非常规文件");
    }
  }

  const resolvedPath = await realpath(currentPath);
  if (!isContainedPath(canonicalRootPath, resolvedPath)) {
    throw new Error("资源路径逃逸了项目目录");
  }
  const beforeOpen = await lstat(resolvedPath);
  if (
    beforeOpen.isSymbolicLink() ||
    !beforeOpen.isFile() ||
    beforeOpen.nlink !== 1 ||
    beforeOpen.size <= 0 ||
    beforeOpen.size > maximumBytes
  ) {
    throw new Error("资源不是大小有效的独立常规文件");
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const file = await open(resolvedPath, constants.O_RDONLY | noFollow);
  try {
    const opened = await file.stat();
    const snapshotChange = fileSnapshotChange(beforeOpen, opened);
    if (!opened.isFile() || opened.nlink !== 1 || snapshotChange === "unsafe") {
      throw new Error("资源在打开前发生了变化");
    }
    return {
      file,
      snapshot: opened,
      ctimeOnlyChange: snapshotChange === "ctime-only",
    };
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}

async function readStableProjectManifest(
  canonicalProjectRootPath: string,
  expectedSha256: string,
): Promise<string> {
  return retryCompletedStableFileOperation(async () => {
    const opened = await openStableFile(
      canonicalProjectRootPath,
      "project.vn.json",
      MAX_AUTHOR_PROJECT_BYTES,
    );
    try {
      const contents = await opened.file.readFile();
      const after = await opened.file.stat();
      const snapshotChange = fileSnapshotChange(opened.snapshot, after);
      if (snapshotChange === "unsafe") {
        throw new Error("project.vn.json 在读取时发生了变化");
      }
      const sha256 = createHash("sha256").update(contents).digest("hex");
      if (sha256 !== expectedSha256) {
        throw new Error("project.vn.json 与已保存版本不一致");
      }
      return {
        value: contents.toString("utf8"),
        snapshot: opened.snapshot,
        sha256,
        ctimeOnlyChange:
          opened.ctimeOnlyChange || snapshotChange === "ctime-only",
      };
    } finally {
      await opened.file.close();
    }
  }, "project.vn.json 在读取时发生了变化");
}

async function readStableUtf8File(
  canonicalRootPath: string,
  relativePath: string,
  expectedContents: string,
): Promise<string> {
  const changedMessage = `${relativePath} 在复验时发生了变化`;
  const expectedSha256 = createHash("sha256")
    .update(expectedContents, "utf8")
    .digest("hex");
  return retryCompletedStableFileOperation(async () => {
    const opened = await openStableFile(
      canonicalRootPath,
      relativePath,
      MAX_RUNTIME_JSON_BYTES,
    );
    try {
      const contents = await opened.file.readFile();
      const after = await opened.file.stat();
      const snapshotChange = fileSnapshotChange(opened.snapshot, after);
      if (snapshotChange === "unsafe") {
        throw new Error(changedMessage);
      }
      const sha256 = createHash("sha256").update(contents).digest("hex");
      if (sha256 !== expectedSha256) {
        throw new Error(changedMessage);
      }
      return {
        value: contents.toString("utf8"),
        snapshot: opened.snapshot,
        sha256,
        ctimeOnlyChange:
          opened.ctimeOnlyChange || snapshotChange === "ctime-only",
      };
    } finally {
      await opened.file.close();
    }
  }, changedMessage);
}

function jsonContents(value: unknown, fileName: string): string {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(contents, "utf8") > MAX_RUNTIME_JSON_BYTES) {
    throw new Error(`${fileName} 超过 Player 的大小限制`);
  }
  return contents;
}

async function writeDurableExclusiveFile(
  filePath: string,
  contents: string | Buffer,
): Promise<void> {
  const bytes =
    typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const destination = await open(
    filePath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
    0o600,
  );
  try {
    let position = 0;
    while (position < bytes.length) {
      const length = Math.min(COPY_BUFFER_BYTES, bytes.length - position);
      const { bytesWritten } = await destination.write(
        bytes,
        position,
        length,
        position,
      );
      if (bytesWritten !== length) {
        throw new Error("导出文件未能完整写入");
      }
      position += length;
    }
    await destination.sync();
  } finally {
    await destination.close();
  }
}

async function ensureOutputParent(
  outputFilePath: string,
  stagingRoot: string,
): Promise<void> {
  const relative = path.relative(stagingRoot, outputFilePath);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("导出资源路径逃逸了 staging 目录");
  }
  const parentPath = path.dirname(outputFilePath);
  await mkdir(parentPath, { recursive: true, mode: 0o700 });
  const parentRelative = path.relative(stagingRoot, parentPath);
  let currentPath = stagingRoot;
  for (const component of parentRelative.split(path.sep)) {
    currentPath = path.join(currentPath, component);
    const status = await lstat(currentPath);
    if (status.isSymbolicLink() || !status.isDirectory()) {
      throw new Error("导出资源目录不能包含符号链接");
    }
  }
  const resolvedParent = await realpath(parentPath);
  if (!isContainedPath(stagingRoot, resolvedParent)) {
    throw new Error("导出资源目录逃逸了 staging 目录");
  }
}

async function unlinkIfPresent(filePath: string): Promise<void> {
  await unlink(filePath).catch((error: unknown) => {
    if (errnoCode(error) !== "ENOENT") {
      throw error;
    }
  });
}

async function copyAssetAndHashAttempt(
  sourceRootPath: string,
  stagingRootPath: string,
  asset: AuthorAssetRecord,
): Promise<CompletedStableFileOperation<RuntimeManifestAssetV1>> {
  const source = await openStableFile(
    sourceRootPath,
    asset.relativePath,
    maximumPreviewBytes(asset.type),
  );
  const destinationPath = path.join(
    stagingRootPath,
    ...asset.relativePath.split("/"),
  );
  await ensureOutputParent(destinationPath, stagingRootPath);

  const noFollow = constants.O_NOFOLLOW ?? 0;
  let destination: FileHandle | null = null;
  try {
    if (source.ctimeOnlyChange) {
      throw new Error(`资源“${asset.displayName}”在打开前发生了变化`);
    }
    if (
      !(await mediaMagicMatches(source.file, asset.mime, source.snapshot.size))
    ) {
      throw new Error(`资源“${asset.displayName}”的内容与声明类型不一致`);
    }
    const afterMagic = fileSnapshotChange(
      source.snapshot,
      await source.file.stat(),
    );
    if (afterMagic !== "none") {
      throw new Error(`资源“${asset.displayName}”在校验时发生了变化`);
    }

    destination = await open(
      destinationPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      0o600,
    );
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
    let position = 0;
    while (position < source.snapshot.size) {
      const length = Math.min(buffer.length, source.snapshot.size - position);
      const { bytesRead } = await source.file.read(buffer, 0, length, position);
      if (bytesRead !== length) {
        throw new Error(`资源“${asset.displayName}”未能完整读取`);
      }
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      const { bytesWritten } = await destination.write(
        chunk,
        0,
        chunk.length,
        position,
      );
      if (bytesWritten !== chunk.length) {
        throw new Error(`资源“${asset.displayName}”未能完整写入`);
      }
      position += bytesRead;
    }
    const afterCopy = fileSnapshotChange(
      source.snapshot,
      await source.file.stat(),
    );
    if (afterCopy !== "none") {
      throw new Error(`资源“${asset.displayName}”在导出时发生了变化`);
    }
    await destination.sync();
    await destination.close();
    destination = null;
    const sha256 = hash.digest("hex");

    return {
      value: {
        assetId: asset.id,
        type: asset.type,
        displayName: asset.displayName,
        path: asset.relativePath,
        mime: asset.mime,
        bytes: source.snapshot.size,
        sha256,
      },
      snapshot: source.snapshot,
      sha256,
      ctimeOnlyChange: false,
    };
  } catch (error) {
    await destination?.close().catch(() => undefined);
    await unlinkIfPresent(destinationPath);
    throw error;
  } finally {
    await source.file.close();
  }
}

async function copyAssetAndHash(
  sourceRootPath: string,
  stagingRootPath: string,
  asset: AuthorAssetRecord,
): Promise<RuntimeManifestAssetV1> {
  // Author assets have no trusted digest in the saved v13 document. Treat even
  // ctime-only drift as a source change instead of learning a new hash here.
  return (await copyAssetAndHashAttempt(sourceRootPath, stagingRootPath, asset))
    .value;
}

async function sha256File(file: FileHandle, size: number): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let position = 0;
  while (position < size) {
    const length = Math.min(buffer.length, size - position);
    const { bytesRead } = await file.read(buffer, 0, length, position);
    if (bytesRead !== length) {
      throw new Error("导出资源复验时读取不完整");
    }
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  return hash.digest("hex");
}

async function verifyStagingAsset(
  stagingRootPath: string,
  record: RuntimeManifestAssetV1,
): Promise<void> {
  const changedMessage = `导出资源“${record.displayName}”复验失败`;
  await retryCompletedStableFileOperation(async () => {
    const opened = await openStableFile(
      stagingRootPath,
      record.path,
      maximumPreviewBytes(record.type),
    );
    try {
      if (
        opened.snapshot.size !== record.bytes ||
        !(await mediaMagicMatches(
          opened.file,
          record.mime,
          opened.snapshot.size,
        ))
      ) {
        throw new Error(changedMessage);
      }
      const sha256 = await sha256File(opened.file, opened.snapshot.size);
      if (sha256 !== record.sha256) {
        throw new Error(changedMessage);
      }
      const after = await opened.file.stat();
      const snapshotChange = fileSnapshotChange(opened.snapshot, after);
      if (snapshotChange === "unsafe") {
        throw new Error(changedMessage);
      }
      return {
        value: undefined,
        snapshot: opened.snapshot,
        sha256,
        ctimeOnlyChange:
          opened.ctimeOnlyChange || snapshotChange === "ctime-only",
      };
    } finally {
      await opened.file.close();
    }
  }, changedMessage);
}

async function verifyStagingBundle(
  stagingRootPath: string,
  gameContents: string,
  manifestContents: string,
  files: RuntimeManifestAssetV1[],
): Promise<void> {
  const [gameOnDisk, manifestOnDisk] = await Promise.all([
    readStableUtf8File(stagingRootPath, "game.json", gameContents),
    readStableUtf8File(stagingRootPath, "manifest.json", manifestContents),
  ]);
  if (gameOnDisk !== gameContents || manifestOnDisk !== manifestContents) {
    throw new Error("导出 JSON 在 staging 复验时发生了变化");
  }

  for (const record of files) {
    await verifyStagingAsset(stagingRootPath, record);
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  const directory = await open(directoryPath, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function syncDirectoryTree(directoryPath: string): Promise<void> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = path.join(directoryPath, entry.name);
    const status = await lstat(childPath);
    if (
      status.isSymbolicLink() ||
      (!status.isDirectory() && !status.isFile())
    ) {
      throw new Error("staging 目录在提交前发生了变化");
    }
    if (status.isDirectory()) {
      await syncDirectoryTree(childPath);
    }
  }
  await syncDirectory(directoryPath);
}

function validateBuildMetadata(
  sourceRevision: number,
  buildId: string,
  createdAt: string,
  expectedManifestSha256: string,
): void {
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
    throw new Error("导出 revision 无效");
  }
  if (buildId.length === 0 || buildId.length > 256 || buildId.includes("\0")) {
    throw new Error("导出 build ID 无效");
  }
  if (
    Number.isNaN(Date.parse(createdAt)) ||
    new Date(createdAt).toISOString() !== createdAt
  ) {
    throw new Error("导出时间必须是规范 UTC 时间");
  }
  if (!/^[a-f0-9]{64}$/u.test(expectedManifestSha256)) {
    throw new Error("已保存项目摘要无效");
  }
}

function assertTargetDoesNotExist(targetPath: string): Promise<void> {
  return lstat(targetPath).then(
    () => {
      throw new Error("导出位置已存在同名内容包，请选择一个新名称");
    },
    (error: unknown) => {
      if (errnoCode(error) !== "ENOENT") {
        throw error;
      }
    },
  );
}

export async function exportRuntimeBundle(
  options: RuntimeBundleExportOptions,
): Promise<RuntimeBundleExportResult> {
  const buildId = options.buildId ?? randomUUID();
  const createdAt = options.createdAt ?? new Date().toISOString();
  validateBuildMetadata(
    options.sourceRevision,
    buildId,
    createdAt,
    options.expectedManifestSha256,
  );

  const sourceRootPath = await canonicalizeDirectory(
    options.sourceProjectRootPath,
    "项目根目录",
  );
  const requestedTargetPath = path.resolve(options.targetBundlePath);
  if (!requestedTargetPath.endsWith(".vngame")) {
    throw new Error("导出内容包名称必须以 .vngame 结尾");
  }
  const bundleName = path.basename(requestedTargetPath);
  if (
    bundleName === ".vngame" ||
    bundleName.includes("\0") ||
    bundleName.length > 255
  ) {
    throw new Error("导出内容包名称无效");
  }

  const targetParentPath = await canonicalizeDirectory(
    path.dirname(requestedTargetPath),
    "导出位置",
  );
  const targetPath = path.join(targetParentPath, bundleName);
  if (isInsideOrEqual(sourceRootPath, targetPath)) {
    throw new Error("游戏内容包不能导出到源项目内部");
  }
  await assertTargetDoesNotExist(targetPath);

  const lockPath = path.join(targetParentPath, `.${bundleName}.export.lock`);
  const stagingPath = path.join(
    targetParentPath,
    `.${bundleName}.${randomUUID()}.staging`,
  );
  const lock = await acquireExportFileLock(
    lockPath,
    "另一个导出任务正在写入同名内容包",
  );
  let stagingCreated = false;
  let committed = false;

  try {
    await assertTargetDoesNotExist(targetPath);
    await mkdir(stagingPath, { mode: 0o700 });
    stagingCreated = true;
    for (const directoryName of ["images", "audio", "videos"]) {
      await mkdir(path.join(stagingPath, "assets", directoryName), {
        recursive: true,
        mode: 0o700,
      });
    }

    const sourceManifestContents = await readStableProjectManifest(
      sourceRootPath,
      options.expectedManifestSha256,
    );
    const compiled = compileAuthorProjectV13(sourceManifestContents);
    if (!isDeepStrictEqual(compiled.sourceProject, options.expectedProject)) {
      throw new Error("磁盘项目与当前编辑器项目不一致");
    }
    if (!isDeepStrictEqual(compiled.publicAssets, options.expectedAssets)) {
      throw new Error("磁盘资源清单与当前编辑器项目不一致");
    }
    const gameContents = jsonContents(compiled.game, "game.json");
    await writeDurableExclusiveFile(
      path.join(stagingPath, "game.json"),
      gameContents,
    );
    await options.injectFault?.("after-game");

    const manifestFiles: RuntimeManifestAssetV1[] = [];
    for (const asset of compiled.referencedAssets) {
      manifestFiles.push(
        await copyAssetAndHash(sourceRootPath, stagingPath, asset),
      );
    }
    await options.injectFault?.("after-assets");

    const manifest: RuntimeManifestDocumentV1 = {
      format: RUNTIME_MANIFEST_FORMAT,
      manifestVersion: RUNTIME_MANIFEST_VERSION,
      buildId,
      projectId: compiled.project.id,
      sourceRevision: options.sourceRevision,
      runtimeVersion: RUNTIME_VERSION,
      playerCompatibility: PLAYER_COMPATIBILITY,
      createdAt,
      files: manifestFiles,
    };
    const manifestContents = jsonContents(manifest, "manifest.json");
    await writeDurableExclusiveFile(
      path.join(stagingPath, "manifest.json"),
      manifestContents,
    );
    await options.injectFault?.("after-manifest");

    await verifyStagingBundle(
      stagingPath,
      gameContents,
      manifestContents,
      manifestFiles,
    );
    if (
      (await readStableProjectManifest(
        sourceRootPath,
        options.expectedManifestSha256,
      )) !== sourceManifestContents
    ) {
      throw new Error("源项目在导出期间发生了变化");
    }
    await options.assertSourceStillCurrent?.();
    await options.injectFault?.("before-commit");
    await lock.assertOwned();

    const stagingStatus = await lstat(stagingPath);
    if (
      stagingStatus.isSymbolicLink() ||
      !stagingStatus.isDirectory() ||
      (await realpath(stagingPath)) !== stagingPath
    ) {
      throw new Error("staging 目录在提交前发生了变化");
    }
    await syncDirectoryTree(stagingPath);
    await lock.assertOwned();
    await assertTargetDoesNotExist(targetPath);
    if ((await realpath(targetParentPath)) !== targetParentPath) {
      throw new Error("导出位置在提交前发生了变化");
    }
    await rename(stagingPath, targetPath);
    committed = true;
    stagingCreated = false;
    await syncDirectory(targetParentPath).catch(() => undefined);

    return {
      bundleName,
      buildId,
      sourceRevision: options.sourceRevision,
      assetCount: manifestFiles.length,
    };
  } finally {
    if (stagingCreated && !committed) {
      await rm(stagingPath, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    await lock.release();
  }
}
