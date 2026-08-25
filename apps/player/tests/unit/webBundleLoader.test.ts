import { createHash, webcrypto } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  loadWebBundle,
  type WebFetch,
} from '../../src/web/WebBundleLoader';

const BUILD_ID = 'build-1';
const game = {
  format: 'vn-engine-runtime',
  runtimeVersion: 6,
  game: {
    id: 'web-project',
    title: 'Web game',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Web title',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  },
  scenes: [{
    schemaVersion: 1,
    id: 'scene-1',
    name: 'Scene',
    backgroundAssetId: null,
    nodes: [],
  }],
};

function manifest(buildId = BUILD_ID, files: unknown[] = []) {
  return {
    format: 'vn-engine-runtime-manifest',
    manifestVersion: 1,
    buildId,
    projectId: 'web-project',
    sourceRevision: 1,
    runtimeVersion: 6,
    playerCompatibility: '>=6 <7',
    createdAt: '2026-08-25T00:00:00.000Z',
    files,
  };
}

function descriptor(gameRoot = `game/${BUILD_ID}`) {
  return {
    format: 'vn-engine-web-export',
    webExportVersion: 1,
    runtimeVersion: 6,
    playerCompatibility: '>=6 <7',
    gameRoot,
  };
}

function fetchDocuments(
  overrides: Partial<Record<string, string>> = {},
): WebFetch {
  const documents: Record<string, string> = {
    '/exports/story/web-export.json': JSON.stringify(descriptor()),
    [`/exports/story/game/${BUILD_ID}/game.json`]: JSON.stringify(game),
    [`/exports/story/game/${BUILD_ID}/manifest.json`]: JSON.stringify(manifest()),
    ...overrides,
  };
  return vi.fn(async (input) => {
    const url = new URL(String(input));
    const contents = documents[url.pathname];
    return contents === undefined
      ? new Response('', { status: 404 })
      : new Response(contents, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
  });
}

describe('Web runtime bundle loader', () => {
  it('loads the descriptor first and creates same-origin asset URLs', async () => {
    const image = {
      assetId: 'background',
      type: 'image',
      displayName: 'Background',
      path: 'assets/images/background.png',
      mime: 'image/png',
      bytes: 12,
      sha256: '0'.repeat(64),
    };
    const gameWithImage = {
      ...game,
      game: {
        ...game.game,
        startScreen: { ...game.game.startScreen, backgroundAssetId: 'background' },
      },
    };
    const gameContents = JSON.stringify(gameWithImage);
    const fetch = fetchDocuments({
      [`/exports/story/game/${BUILD_ID}/game.json`]: gameContents,
      [`/exports/story/game/${BUILD_ID}/manifest.json`]: JSON.stringify(
        manifest(BUILD_ID, [image]),
      ),
    });
    const loaded = await loadWebBundle({
      baseUrl: 'https://example.test/exports/story/index.html',
      fetch,
      crypto: webcrypto as unknown as Crypto,
    });

    expect(loaded.game.project.startScreen.backgroundAssetId).toBe('background');
    expect(loaded.assetUrls.get('background')).toBe(
      `https://example.test/exports/story/game/${BUILD_ID}/assets/images/background.png`,
    );
    expect(loaded.identity).toEqual({
      projectId: 'web-project',
      runtimeVersion: 6,
      contentFingerprint: createHash('sha256')
        .update(gameContents, 'utf8')
        .digest('hex'),
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      new URL('https://example.test/exports/story/web-export.json'),
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }),
    );
  });

  it('requires HTTP(S) and binds gameRoot to manifest.buildId', async () => {
    await expect(loadWebBundle({
      baseUrl: 'file:///private/story/index.html',
      fetch: fetchDocuments(),
      crypto: webcrypto as unknown as Crypto,
    })).rejects.toThrow('必须通过 HTTP 或 HTTPS');

    await expect(loadWebBundle({
      baseUrl: 'https://example.test/exports/story/index.html',
      fetch: fetchDocuments({
        [`/exports/story/game/${BUILD_ID}/manifest.json`]: JSON.stringify(
          manifest('another-build'),
        ),
      }),
      crypto: webcrypto as unknown as Crypto,
    })).rejects.toThrow('描述与游戏 runtime 内容不一致');
  });

  it('segment-encodes legacy URL-special asset names without changing paths', async () => {
    const path = 'assets/images/back?#%\u0001ground.png';
    const image = {
      assetId: 'background',
      type: 'image',
      displayName: 'Background',
      path,
      mime: 'image/png',
      bytes: 12,
      sha256: '0'.repeat(64),
    };
    const gameWithImage = {
      ...game,
      game: {
        ...game.game,
        startScreen: {
          ...game.game.startScreen,
          backgroundAssetId: 'background',
        },
      },
    };
    const loaded = await loadWebBundle({
      baseUrl: 'https://example.test/exports/story/index.html',
      fetch: fetchDocuments({
        [`/exports/story/game/${BUILD_ID}/game.json`]: JSON.stringify(gameWithImage),
        [`/exports/story/game/${BUILD_ID}/manifest.json`]: JSON.stringify(
          manifest(BUILD_ID, [image]),
        ),
      }),
      crypto: webcrypto as unknown as Crypto,
    });
    expect(loaded.assetUrls.get('background')).toBe(
      `https://example.test/exports/story/game/${BUILD_ID}/assets/images/back%3F%23%25%01ground.png`,
    );
  });

  it('stops streamed JSON once the byte limit is exceeded', async () => {
    const chunk = new Uint8Array(8 * 1024 * 1024);
    const fetch: WebFetch = async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array([0]));
        controller.close();
      },
    }));
    await expect(loadWebBundle({
      baseUrl: 'https://example.test/story/index.html',
      fetch,
      crypto: webcrypto as unknown as Crypto,
    })).rejects.toThrow('超过大小限制');
  });
});
