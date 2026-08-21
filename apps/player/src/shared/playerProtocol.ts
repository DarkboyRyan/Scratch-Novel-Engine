import type { ProjectDocument } from '@vnengine/runtime';

export const PLAYER_IPC_CHANNEL = 'vn-player:request';

export type PlayerAssetType = 'image' | 'audio' | 'video';

// Generic Player can open external bundles. An embedded Player is a read-only
// single-game application and must never expose a replacement-bundle picker.
export type PlayerMode = 'generic' | 'embedded';

// This is the only Asset shape that may cross into Renderer. Storage paths,
// hashes, file sizes and capability tokens remain private to Electron Main.
export type PlayerAsset = {
  id: string;
  type: PlayerAssetType;
  displayName: string;
};

export type PlayerGameData = {
  project: ProjectDocument;
  assets: PlayerAsset[];
};

export type PlayerLoadResult =
  | {
      status: 'loaded';
      mode: PlayerMode;
      game: PlayerGameData;
    }
  | {
      status: 'empty';
      mode: PlayerMode;
    }
  | {
      status: 'error';
      mode: PlayerMode;
      error: string;
    };

export type PlayerOpenResult =
  | {
      status: 'opened';
      game: PlayerGameData;
    }
  | {
      status: 'canceled';
    }
  | {
      status: 'rejected';
      error: string;
    };

export type PlayerInvocation =
  | {
      action: 'load-game';
      params: Record<string, never>;
    }
  | {
      action: 'open-game';
      params: Record<string, never>;
    }
  | {
      action: 'quit-game';
      params: Record<string, never>;
    }
  | {
      action: 'get-media-url';
      params: {
        assetId: string;
      };
    };

export type VnPlayerApi = {
  loadGame(): Promise<PlayerLoadResult>;
  openGame(): Promise<PlayerOpenResult>;
  getMediaUrl(assetId: string): Promise<string | null>;
  quitGame(): Promise<void>;
};
