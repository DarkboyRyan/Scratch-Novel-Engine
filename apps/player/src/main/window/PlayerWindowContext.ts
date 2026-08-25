import type { PlayerBundleSession } from '../content/PlayerBundleSession';
import type { PlayerSaveStore } from '../save/PlayerSaveStore';
import type { PlayerSettingsController } from '../settings/PlayerSettingsManager';

export type PlayerWindowContext = {
  bundleSession: PlayerBundleSession;
  saveStore: PlayerSaveStore;
  settingsController: PlayerSettingsController;
};

export type PlayerWindowContexts = ReadonlyMap<number, PlayerWindowContext>;
