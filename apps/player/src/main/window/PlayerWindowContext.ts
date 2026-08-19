import type { PlayerBundleSession } from '../content/PlayerBundleSession';

export type PlayerWindowContext = {
  bundleSession: PlayerBundleSession;
};

export type PlayerWindowContexts = ReadonlyMap<number, PlayerWindowContext>;
