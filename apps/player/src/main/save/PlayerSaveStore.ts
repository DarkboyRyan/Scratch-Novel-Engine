/**
 * 主要作用：安全持久化、列举和恢复手动及快速存档快照。
 * 关键函数与实现：`PlayerSaveStore`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import {
  areGameRuntimeSnapshotsEqual,
  createGameRuntimeSnapshot,
  restoreGameRuntimeSnapshot,
  type GameRuntime,
  type GameRuntimeSnapshot,
} from '@vnengine/runtime';

import {
  createPlayerSaveSummaryContent,
  type PlayerErrorCode,
  type PlayerGameData,
  type PlayerSaveListResult,
  type PlayerSaveLoadResult,
  type PlayerSaveSlotId,
  type PlayerSaveSummary,
  type PlayerSaveWriteResult,
} from '../../shared/playerProtocol';
import type { PlayerActiveGameContext } from '../content/PlayerBundleSession';
import type { PlayerBundleIdentity } from '../content/PlayerBundleLoader';

const SAVE_FORMAT = 'vn-engine-player-save';
const SAVE_VERSION = 1;
const MAX_SAVE_BYTES = 256 * 1024;
const SAVE_SLOTS: readonly PlayerSaveSlotId[] = [1, 2, 3, 'quick'];
const SAFE_STORAGE_ERROR: PlayerErrorCode = 'save-storage-unavailable';
const INVALID_RUNTIME_ERROR: PlayerErrorCode = 'runtime-not-saveable';
const INVALID_SAVE_ERROR: PlayerErrorCode = 'save-incompatible';
const STALE_GAME_ERROR: PlayerErrorCode = 'game-session-stale';

type SaveErrorReporter = (
  operation: 'list' | 'read' | 'write',
  slotId: PlayerSaveSlotId | null,
  error: unknown,
) => void;

type SaveDocument = {
  format: typeof SAVE_FORMAT;
  saveVersion: typeof SAVE_VERSION;
  game: {
    projectId: string;
    runtimeVersion: number;
    contentFingerprint: string;
  };
  slotId: PlayerSaveSlotId;
  savedAt: string;
  snapshot: GameRuntimeSnapshot;
};

type ReadSlotResult =
  | { status: 'empty' }
  | { status: 'loaded'; document: SaveDocument; runtime: GameRuntime };

class InvalidSaveError extends Error {}
class IncompatibleSaveError extends Error {}
class StaleGameError extends Error {}
class UnsafeStorageError extends Error {}

function errnoCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((field, index) => field === sortedExpected[index]);
}

function canonicalIsoDate(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function slotFileName(slotId: PlayerSaveSlotId): string {
  return slotId === 'quick' ? 'quick.json' : `slot-${slotId}.json`;
}

function validateRootPath(rootPath: string): string {
  if (
    !path.isAbsolute(rootPath) ||
    rootPath.includes('\0') ||
    path.normalize(rootPath) !== rootPath
  ) {
    throw new Error('Player save root must be a normalized absolute path');
  }
  return rootPath;
}

function gameDirectoryName(identity: PlayerBundleIdentity): string {
  return createHash('sha256')
    .update('vn-engine-player-save-namespace-v1\0', 'utf8')
    .update(identity.projectId, 'utf8')
    .update('\0', 'utf8')
    .update(String(identity.runtimeVersion), 'utf8')
    .update('\0', 'utf8')
    .update(identity.contentFingerprint, 'utf8')
    .digest('hex');
}

async function ensureSafeDirectory(directoryPath: string): Promise<void> {
  try {
    await mkdir(directoryPath, { mode: 0o700 });
    return;
  } catch (error) {
    if (errnoCode(error) !== 'EEXIST') {
      throw error;
    }
  }
  const status = await lstat(directoryPath);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error('Player save directory is not safe');
  }
}

async function inspectSafeDirectory(directoryPath: string): Promise<boolean> {
  let status;
  try {
    status = await lstat(directoryPath);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new UnsafeStorageError('Player save directory is not safe');
  }
  return true;
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

function sameSnapshot(left: GameRuntimeSnapshot, right: unknown): boolean {
  return isObject(right) && (
    right.snapshotVersion === 1 ||
    right.snapshotVersion === 2 ||
    right.snapshotVersion === 3 ||
    areGameRuntimeSnapshotsEqual(left, right)
  );
}

function parseSaveDocument(
  input: unknown,
  expectedSlot: PlayerSaveSlotId,
  active: PlayerActiveGameContext,
): { document: SaveDocument; runtime: GameRuntime } {
  if (!isObject(input) || !hasExactFields(input, [
    'format',
    'saveVersion',
    'game',
    'slotId',
    'savedAt',
    'snapshot',
  ])) {
    throw new InvalidSaveError('save fields are invalid');
  }
  if (
    input.format !== SAVE_FORMAT ||
    input.saveVersion !== SAVE_VERSION ||
    input.slotId !== expectedSlot ||
    !canonicalIsoDate(input.savedAt) ||
    !isObject(input.game) ||
    !hasExactFields(input.game, [
      'projectId',
      'runtimeVersion',
      'contentFingerprint',
    ]) ||
    typeof input.game.projectId !== 'string' ||
    !Number.isSafeInteger(input.game.runtimeVersion) ||
    typeof input.game.contentFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.game.contentFingerprint)
  ) {
    throw new InvalidSaveError('save metadata is invalid');
  }
  if (
    input.game.projectId !== active.identity.projectId ||
    input.game.runtimeVersion !== active.identity.runtimeVersion ||
    input.game.contentFingerprint !== active.identity.contentFingerprint
  ) {
    throw new IncompatibleSaveError('save identity does not match');
  }
  const runtime = restoreGameRuntimeSnapshot(active.game.project, input.snapshot);
  if (runtime === null) {
    throw new InvalidSaveError('runtime snapshot is invalid');
  }
  const canonicalSnapshot = createGameRuntimeSnapshot(active.game.project, runtime);
  if (canonicalSnapshot === null || !sameSnapshot(canonicalSnapshot, input.snapshot)) {
    throw new InvalidSaveError('runtime snapshot is not canonical');
  }
  validateRuntimeAssets(active.game, runtime);
  return {
    document: input as unknown as SaveDocument,
    runtime,
  };
}

function validateRuntimeAssets(game: PlayerGameData, runtime: GameRuntime): void {
  const assets = new Map(game.assets.map((asset) => [asset.id, asset.type]));
  const requireType = (
    assetId: string | null,
    type: 'image' | 'audio' | 'video',
  ): void => {
    if (assetId !== null && assets.get(assetId) !== type) {
      throw new InvalidSaveError('runtime references an invalid Asset');
    }
  };
  requireType(runtime.backgroundAssetId, 'image');
  requireType(runtime.bgmAssetId, 'audio');
  requireType(runtime.videoAssetId, 'video');
  requireType(runtime.cgAssetId, 'image');
  requireType(runtime.dialogue?.voiceAssetId ?? null, 'audio');
  for (const character of runtime.characters) {
    requireType(character.assetId, 'image');
  }
}

function summarize(
  slotId: PlayerSaveSlotId,
  savedAt: string,
  game: PlayerGameData,
  runtime: GameRuntime,
): PlayerSaveSummary {
  const sceneName = game.project.scenes.find(
    (scene) => scene.id === runtime.sceneId,
  )?.name ?? runtime.sceneId;
  return {
    slotId,
    savedAt,
    sceneName,
    summary: createPlayerSaveSummaryContent(runtime),
  };
}

export class PlayerSaveStore {
  private readonly rootPath: string;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    rootPath: string,
    private readonly reportError: SaveErrorReporter = () => {},
    private readonly now: () => Date = () => new Date(),
  ) {
    this.rootPath = validateRootPath(rootPath);
  }

  list(
    active: PlayerActiveGameContext,
    isCurrent: () => boolean,
  ): Promise<PlayerSaveListResult> {
    return this.runExclusive(async () => {
      try {
        if (!await this.inspectGameDirectory(active)) {
          this.requireCurrent(isCurrent);
          return { status: 'ready', slots: [] };
        }
        const slots: PlayerSaveSummary[] = [];
        for (const slotId of SAVE_SLOTS) {
          try {
            const result = await this.readSlot(active, slotId);
            if (result.status === 'loaded') {
              slots.push(summarize(
                slotId,
                result.document.savedAt,
                active.game,
                result.runtime,
              ));
            }
          } catch (error) {
            this.reportError('read', slotId, error);
          }
        }
        this.requireCurrent(isCurrent);
        return { status: 'ready', slots };
      } catch (error) {
        this.reportError('list', null, error);
        return this.rejected(error);
      }
    });
  }

  write(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
    snapshot: GameRuntimeSnapshot,
    isCurrent: () => boolean,
  ): Promise<PlayerSaveWriteResult> {
    return this.runExclusive(async () => {
      try {
        this.requireCurrent(isCurrent);
        const runtime = restoreGameRuntimeSnapshot(active.game.project, snapshot);
        if (runtime === null) {
          return { status: 'rejected', error: INVALID_RUNTIME_ERROR };
        }
        const canonicalSnapshot = createGameRuntimeSnapshot(
          active.game.project,
          runtime,
        );
        if (
          canonicalSnapshot === null ||
          !sameSnapshot(canonicalSnapshot, snapshot)
        ) {
          return { status: 'rejected', error: INVALID_RUNTIME_ERROR };
        }
        validateRuntimeAssets(active.game, runtime);
        const savedAt = this.now().toISOString();
        const document: SaveDocument = {
          format: SAVE_FORMAT,
          saveVersion: SAVE_VERSION,
          game: {
            projectId: active.identity.projectId,
            runtimeVersion: active.identity.runtimeVersion,
            contentFingerprint: active.identity.contentFingerprint,
          },
          slotId,
          savedAt,
          snapshot: canonicalSnapshot,
        };
        await this.writeDocument(active, slotId, document, isCurrent);
        return {
          status: 'saved',
          slot: summarize(slotId, savedAt, active.game, runtime),
        };
      } catch (error) {
        this.reportError('write', slotId, error);
        return this.rejected(error);
      }
    });
  }

  load(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
    isCurrent: () => boolean,
  ): Promise<PlayerSaveLoadResult> {
    return this.runExclusive(async () => {
      try {
        const result = await this.readSlot(active, slotId);
        this.requireCurrent(isCurrent);
        return result.status === 'empty'
          ? result
          : { status: 'loaded', runtime: result.runtime };
      } catch (error) {
        this.reportError('read', slotId, error);
        return this.rejected(error);
      }
    });
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private gameDirectory(active: PlayerActiveGameContext): string {
    return path.join(this.rootPath, gameDirectoryName(active.identity));
  }

  private slotPath(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
  ): string {
    return path.join(this.gameDirectory(active), slotFileName(slotId));
  }

  private backupPath(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
  ): string {
    return `${this.slotPath(active, slotId)}.bak`;
  }

  private async ensureGameDirectory(active: PlayerActiveGameContext): Promise<string> {
    await ensureSafeDirectory(this.rootPath);
    const gameDirectory = this.gameDirectory(active);
    await ensureSafeDirectory(gameDirectory);
    return gameDirectory;
  }

  private async inspectGameDirectory(
    active: PlayerActiveGameContext,
  ): Promise<boolean> {
    if (!await inspectSafeDirectory(this.rootPath)) {
      return false;
    }
    return inspectSafeDirectory(this.gameDirectory(active));
  }

  private async readSlot(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
  ): Promise<ReadSlotResult> {
    if (!await this.inspectGameDirectory(active)) {
      return { status: 'empty' };
    }
    let filePath = this.slotPath(active, slotId);
    let status;
    try {
      status = await lstat(filePath);
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') {
        throw error;
      }
      filePath = this.backupPath(active, slotId);
      try {
        status = await lstat(filePath);
      } catch (backupError) {
        if (errnoCode(backupError) === 'ENOENT') {
          return { status: 'empty' };
        }
        throw backupError;
      }
    }
    if (
      status.isSymbolicLink() ||
      !status.isFile() ||
      status.nlink !== 1 ||
      status.size <= 0 ||
      status.size > MAX_SAVE_BYTES
    ) {
      throw new InvalidSaveError('save file is not safe');
    }

    const noFollow = constants.O_NOFOLLOW ?? 0;
    const file = await open(filePath, constants.O_RDONLY | noFollow);
    try {
      const before = await file.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size !== status.size) {
        throw new InvalidSaveError('save file changed before read');
      }
      const contents = await file.readFile({ encoding: 'utf8' });
      const after = await file.stat();
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      ) {
        throw new InvalidSaveError('save file changed while reading');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents) as unknown;
      } catch {
        throw new InvalidSaveError('save file is not JSON');
      }
      const validated = parseSaveDocument(parsed, slotId, active);
      return { status: 'loaded', ...validated };
    } finally {
      await file.close();
    }
  }

  private async writeDocument(
    active: PlayerActiveGameContext,
    slotId: PlayerSaveSlotId,
    document: SaveDocument,
    isCurrent: () => boolean,
  ): Promise<void> {
    const gameDirectory = await this.ensureGameDirectory(active);
    const destinationPath = this.slotPath(active, slotId);
    const backupPath = this.backupPath(active, slotId);
    const temporaryPath = path.join(
      gameDirectory,
      `.${slotFileName(slotId)}.${randomUUID()}.tmp`,
    );
    const contents = `${JSON.stringify(document)}\n`;
    if (Buffer.byteLength(contents, 'utf8') > MAX_SAVE_BYTES) {
      throw new InvalidSaveError('save file is too large');
    }
    const noFollow = constants.O_NOFOLLOW ?? 0;
    let temporaryFile: Awaited<ReturnType<typeof open>> | null = null;
    let movedExistingDestination = false;
    let published = false;
    try {
      temporaryFile = await open(
        temporaryPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          noFollow,
        0o600,
      );
      await temporaryFile.writeFile(contents, { encoding: 'utf8' });
      await temporaryFile.sync();
      await temporaryFile.close();
      temporaryFile = null;

      let destinationExists = false;
      try {
        const destination = await lstat(destinationPath);
        if (
          destination.isSymbolicLink() ||
          !destination.isFile() ||
          destination.nlink !== 1
        ) {
          throw new InvalidSaveError('save destination is not safe');
        }
        destinationExists = true;
      } catch (error) {
        if (errnoCode(error) !== 'ENOENT') {
          throw error;
        }
      }
      this.requireCurrent(isCurrent);
      if (destinationExists) {
        try {
          const backup = await lstat(backupPath);
          if (backup.isSymbolicLink() || !backup.isFile() || backup.nlink !== 1) {
            throw new InvalidSaveError('save backup is not safe');
          }
          await unlink(backupPath);
        } catch (error) {
          if (errnoCode(error) !== 'ENOENT') {
            throw error;
          }
        }
        await rename(destinationPath, backupPath);
        movedExistingDestination = true;
      }
      await rename(temporaryPath, destinationPath);
      published = true;
      await syncDirectory(gameDirectory).catch(() => undefined);
      this.requireCurrent(isCurrent);
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      if (movedExistingDestination && !published) {
        await rename(backupPath, destinationPath).catch(() => undefined);
      }
      throw error;
    }
  }

  private requireCurrent(isCurrent: () => boolean): void {
    if (!isCurrent()) {
      throw new StaleGameError('active game changed');
    }
  }

  private rejected(
    error: unknown,
  ): { status: 'rejected'; error: PlayerErrorCode } {
    if (error instanceof StaleGameError) {
      return { status: 'rejected', error: STALE_GAME_ERROR };
    }
    if (error instanceof InvalidSaveError || error instanceof IncompatibleSaveError) {
      return { status: 'rejected', error: INVALID_SAVE_ERROR };
    }
    return { status: 'rejected', error: SAFE_STORAGE_ERROR };
  }
}
