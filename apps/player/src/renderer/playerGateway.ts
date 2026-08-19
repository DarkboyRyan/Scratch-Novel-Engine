import type { ProjectDocument } from '@vnengine/runtime';
import type { MediaUrlResolver } from '@vnengine/player-ui';
import type { PlayerMode } from '../shared/playerProtocol';

export type PlayerAssetView = {
  id: string;
  type: 'image' | 'audio' | 'video';
  displayName: string;
};

export type PlayerGameView = {
  project: ProjectDocument;
  assets: readonly PlayerAssetView[];
};

export type PlayerLoadViewResult =
  | { status: 'loaded'; mode: PlayerMode; game: PlayerGameView }
  | { status: 'empty'; mode: PlayerMode }
  | { status: 'error'; mode: PlayerMode; error: string };

export type PlayerOpenViewResult =
  | { status: 'opened'; game: PlayerGameView }
  | { status: 'canceled' }
  | { status: 'rejected'; error: string };

// Renderer owns this narrow port, while preload owns the concrete transport.
// Tests and future web players can provide the same shape without Electron.
export type PlayerGateway = {
  loadGame(): Promise<PlayerLoadViewResult>;
  openGame(): Promise<PlayerOpenViewResult>;
  resolveMediaUrl: MediaUrlResolver;
  close(): void;
};

export const preloadPlayerGateway: PlayerGateway = {
  loadGame: () => window.vnPlayer.loadGame(),
  openGame: () => window.vnPlayer.openGame(),
  resolveMediaUrl: (assetId) => window.vnPlayer.getMediaUrl(assetId),
  close: () => window.close(),
};
