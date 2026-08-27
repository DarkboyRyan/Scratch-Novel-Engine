/**
 * 主要作用：管理当前游戏包会话、用户选包与嵌入游戏打开流程。
 * 关键函数与实现：`PLAYER_BUNDLE_SUFFIX`、`PLAYER_BUNDLE_LOAD_ERROR`、`PLAYER_BUNDLE_SELECTION_ERROR`、`PLAYER_EMBEDDED_OPEN_ERROR`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
import path from 'node:path';

import type {
  PlayerErrorCode,
  PlayerGameData,
  PlayerLoadResult,
  PlayerMode,
  PlayerOpenResult,
} from '../../shared/playerProtocol';
import type { PlayerMediaService } from '../media/PlayerMediaService';
import {
  loadRuntimeBundle,
  type LoadedRuntimeBundle,
  type PlayerBundleIdentity,
} from './PlayerBundleLoader';

export const PLAYER_BUNDLE_SUFFIX = '.vngame';
export const PLAYER_BUNDLE_LOAD_ERROR: PlayerErrorCode = 'bundle-load-failed';
export const PLAYER_BUNDLE_SELECTION_ERROR: PlayerErrorCode =
  'bundle-selection-failed';
export const PLAYER_EMBEDDED_OPEN_ERROR: PlayerErrorCode =
  'embedded-open-disabled';

export type PlayerActiveGameContext = {
  game: PlayerGameData;
  identity: PlayerBundleIdentity;
  generation: number;
};

type BundleLoader = (bundleRoot: string) => Promise<LoadedRuntimeBundle>;
type BundleSelector = () => Promise<string | null>;
type ErrorReporter = (
  operation: 'development-fixture' | 'select-bundle' | 'validate-bundle',
  error: unknown,
) => void;

function isVnGameBundleDirectory(candidatePath: string): boolean {
  const name = path.basename(path.normalize(candidatePath));
  return (
    name.length > PLAYER_BUNDLE_SUFFIX.length &&
    name.endsWith(PLAYER_BUNDLE_SUFFIX)
  );
}

/**
 * Owns one Player window's active immutable bundle.
 *
 * A candidate is fully validated before activateBundle() commits it. Failed
 * or canceled selections therefore preserve the previous loaded, empty or
 * startup-error state. A successful commit rotates the media generation
 * token and invalidates every URL issued for the previous bundle.
 */
export class PlayerBundleSession {
  private game: PlayerGameData | null = null;
  private loadError: PlayerErrorCode | null = null;
  private pendingOpen: Promise<PlayerOpenResult> | null = null;
  private disposed = false;
  private identity: PlayerBundleIdentity | null = null;
  private generation = 0;

  constructor(
    private readonly mediaService: PlayerMediaService,
    private readonly selectBundle: BundleSelector,
    private readonly loadBundle: BundleLoader = loadRuntimeBundle,
    private readonly reportError: ErrorReporter = () => {},
    private readonly mode: PlayerMode = 'generic',
  ) {}

  async loadDevelopmentFixture(bundleRoot: string): Promise<void> {
    try {
      const bundle = await this.loadBundle(bundleRoot);
      if (this.disposed) {
        return;
      }
      this.commit(bundle);
    } catch (error) {
      this.reportError('development-fixture', error);
      if (!this.disposed) {
        this.mediaService.clearBundle();
        this.game = null;
        this.loadError = PLAYER_BUNDLE_LOAD_ERROR;
      }
    }
  }

  /**
   * Loads the immutable Resources/game bundle used by a packaged single-game
   * application. Validation completes before commit, exactly like an external
   * candidate, but failure becomes the application's terminal load state.
   */
  async loadEmbeddedGame(bundleRoot: string): Promise<void> {
    if (this.mode !== 'embedded') {
      throw new Error('Embedded game loading requires embedded Player mode');
    }
    try {
      const bundle = await this.loadBundle(bundleRoot);
      if (this.disposed) {
        return;
      }
      this.commit(bundle);
    } catch (error) {
      this.reportError('validate-bundle', error);
      if (!this.disposed) {
        this.mediaService.clearBundle();
        this.game = null;
        this.loadError = PLAYER_BUNDLE_LOAD_ERROR;
      }
    }
  }

  loadGame(): PlayerLoadResult {
    if (this.game !== null) {
      return { status: 'loaded', mode: this.mode, game: this.game };
    }
    if (this.loadError !== null) {
      return { status: 'error', mode: this.mode, error: this.loadError };
    }
    return { status: 'empty', mode: this.mode };
  }

  openGame(): Promise<PlayerOpenResult> {
    if (this.mode === 'embedded') {
      return Promise.resolve({
        status: 'rejected',
        error: PLAYER_EMBEDDED_OPEN_ERROR,
      });
    }
    if (this.disposed) {
      return Promise.resolve({
        status: 'rejected',
        error: PLAYER_BUNDLE_SELECTION_ERROR,
      });
    }
    if (this.pendingOpen !== null) {
      return this.pendingOpen;
    }

    const operation = this.performOpen().finally(() => {
      if (this.pendingOpen === operation) {
        this.pendingOpen = null;
      }
    });
    this.pendingOpen = operation;
    return operation;
  }

  getMediaUrl(assetId: string): string | null {
    return this.mediaService.getMediaUrl(assetId);
  }

  getActiveGameContext(): PlayerActiveGameContext | null {
    if (this.game === null || this.identity === null || this.disposed) {
      return null;
    }
    return {
      game: this.game,
      identity: this.identity,
      generation: this.generation,
    };
  }

  isActiveGameContext(context: PlayerActiveGameContext): boolean {
    return !this.disposed &&
      this.game === context.game &&
      this.identity === context.identity &&
      this.generation === context.generation;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.mediaService.dispose();
    this.game = null;
    this.identity = null;
    this.generation += 1;
    this.loadError = null;
  }

  private async performOpen(): Promise<PlayerOpenResult> {
    let selectedPath: string | null;
    try {
      selectedPath = await this.selectBundle();
    } catch (error) {
      this.reportError('select-bundle', error);
      return this.reject(PLAYER_BUNDLE_SELECTION_ERROR);
    }

    if (this.disposed) {
      return {
        status: 'rejected',
        error: PLAYER_BUNDLE_SELECTION_ERROR,
      };
    }
    if (selectedPath === null) {
      return { status: 'canceled' };
    }
    if (!isVnGameBundleDirectory(selectedPath)) {
      return this.reject(PLAYER_BUNDLE_LOAD_ERROR);
    }

    let bundle: LoadedRuntimeBundle;
    try {
      bundle = await this.loadBundle(selectedPath);
    } catch (error) {
      this.reportError('validate-bundle', error);
      return this.reject(PLAYER_BUNDLE_LOAD_ERROR);
    }

    if (this.disposed) {
      return {
        status: 'rejected',
        error: PLAYER_BUNDLE_SELECTION_ERROR,
      };
    }
    this.commit(bundle);
    return { status: 'opened', game: bundle.game };
  }

  private commit(bundle: LoadedRuntimeBundle): void {
    this.mediaService.activateBundle(bundle);
    this.game = bundle.game;
    this.identity = bundle.identity;
    this.generation += 1;
    this.loadError = null;
  }

  private reject(error: PlayerErrorCode): PlayerOpenResult {
    return { status: 'rejected', error };
  }
}
