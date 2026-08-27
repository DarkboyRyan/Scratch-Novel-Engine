/**
 * 主要作用：定义每个 Player 窗口绑定的会话、存档和设置上下文。
 * 关键函数与实现：`PlayerWindowContext`、`PlayerWindowContexts`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
import type { PlayerBundleSession } from '../content/PlayerBundleSession';
import type { PlayerSaveStore } from '../save/PlayerSaveStore';
import type { PlayerSettingsController } from '../settings/PlayerSettingsManager';

export type PlayerWindowContext = {
  bundleSession: PlayerBundleSession;
  saveStore: PlayerSaveStore;
  settingsController: PlayerSettingsController;
};

export type PlayerWindowContexts = ReadonlyMap<number, PlayerWindowContext>;
