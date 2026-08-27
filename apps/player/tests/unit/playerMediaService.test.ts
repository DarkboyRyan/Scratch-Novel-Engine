/**
 * 主要作用：验证媒体令牌、Range 响应、MIME 与会话失效。
 * 关键函数与实现：测试套件“Player media capability service”、`temporaryDirectories`、`makeBundle`、`makeService`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadRuntimeBundle } from '../../src/main/content/PlayerBundleLoader';
import {
  PLAYER_MEDIA_SCHEME,
  PlayerMediaService,
} from '../../src/main/media/PlayerMediaService';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);
const MP3 = Buffer.alloc(417);
MP3.set([0xff, 0xfb, 0x90, 0x64]);

const temporaryDirectories: string[] = [];

async function makeBundle() {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-player-media-'));
  temporaryDirectories.push(root);
  const imagePath = path.join(root, 'assets/images/image.png');
  const audioPath = path.join(root, 'assets/audio/audio.mp3');
  await mkdir(path.dirname(imagePath), { recursive: true });
  await mkdir(path.dirname(audioPath), { recursive: true });
  await writeFile(imagePath, PNG);
  await writeFile(audioPath, MP3);
  await writeFile(
    path.join(root, 'game.json'),
    JSON.stringify({
      format: 'vn-engine-runtime',
      runtimeVersion: 1,
      game: { id: 'project', title: 'Game', entrySceneId: 'scene' },
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene',
          name: 'Scene',
          backgroundAssetId: 'image',
          nodes: [
            {
              id: 'bgm',
              type: 'bgm',
              assetId: 'audio',
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    path.join(root, 'manifest.json'),
    JSON.stringify({
      format: 'vn-engine-runtime-manifest',
      manifestVersion: 1,
      buildId: 'build',
      projectId: 'project',
      sourceRevision: 1,
      runtimeVersion: 1,
      playerCompatibility: '>=1 <2',
      createdAt: '2026-08-18T00:00:00.000Z',
      files: [
        {
          assetId: 'image',
          type: 'image',
          displayName: 'Image',
          path: 'assets/images/image.png',
          mime: 'image/png',
          bytes: PNG.length,
          sha256: createHash('sha256').update(PNG).digest('hex'),
        },
        {
          assetId: 'audio',
          type: 'audio',
          displayName: 'Audio',
          path: 'assets/audio/audio.mp3',
          mime: 'audio/mpeg',
          bytes: MP3.length,
          sha256: createHash('sha256').update(MP3).digest('hex'),
        },
      ],
    }),
  );
  return {
    bundle: await loadRuntimeBundle(root),
    imagePath,
  };
}

function makeService() {
  let handler: ((request: Request) => Promise<Response>) | null = null;
  const protocol = {
    handle: vi.fn(
      (
        _scheme: string,
        callback: (request: Request) => Promise<Response>,
      ) => {
        handler = callback;
      },
    ),
    unhandle: vi.fn(),
  };
  const service = new PlayerMediaService(
    protocol as unknown as Electron.Protocol,
  );
  return {
    service,
    protocol,
    request: (url: string, method = 'GET', headers?: HeadersInit) => {
      if (handler === null) {
        throw new Error('Player protocol handler was not registered');
      }
      return handler(new Request(url, { method, headers }));
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player media capability service', () => {
  it('serves images as 200 and audio as GET/HEAD single ranges', async () => {
    const { bundle } = await makeBundle();
    const { service, request } = makeService();
    service.activateBundle(bundle);
    const imageUrl = service.getMediaUrl('image');
    const audioUrl = service.getMediaUrl('audio');
    expect(imageUrl).toMatch(/^vn-game-asset:\/\/image\/[a-f0-9]{32}\/[a-f0-9]{32}$/);
    expect(audioUrl).toMatch(/^vn-game-asset:\/\/audio\/[a-f0-9]{32}\/[a-f0-9]{32}$/);

    const image = await request(imageUrl!, 'GET', { Range: 'bytes=0-3' });
    expect(image.status).toBe(200);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
    expect(image.headers.get('Accept-Ranges')).toBeNull();

    const audio = await request(audioUrl!, 'GET', { Range: 'bytes=0-3' });
    expect(audio.status).toBe(206);
    expect(audio.headers.get('Content-Range')).toBe(`bytes 0-3/${MP3.length}`);
    expect(Buffer.from(await audio.arrayBuffer())).toEqual(MP3.subarray(0, 4));

    const head = await request(audioUrl!, 'HEAD', { Range: 'bytes=4-7' });
    expect(head.status).toBe(206);
    expect(head.headers.get('Content-Length')).toBe('4');
    expect(await head.text()).toBe('');

    const multipleRanges = await request(audioUrl!, 'GET', {
      Range: 'bytes=0-1,4-5',
    });
    expect(multipleRanges.status).toBe(416);
    expect(multipleRanges.headers.get('Content-Range')).toBe(
      `bytes */${MP3.length}`,
    );
  });

  it('invalidates old capabilities on bundle rotation and disposal', async () => {
    const { bundle } = await makeBundle();
    const { service, protocol, request } = makeService();
    service.activateBundle(bundle);
    const oldUrl = service.getMediaUrl('image')!;

    service.activateBundle(bundle);
    const newUrl = service.getMediaUrl('image')!;
    expect(newUrl).not.toBe(oldUrl);
    expect((await request(oldUrl)).status).toBe(404);
    expect((await request(newUrl)).status).toBe(200);

    service.dispose();
    expect(service.getMediaUrl('image')).toBeNull();
    expect(protocol.unhandle).toHaveBeenCalledWith(PLAYER_MEDIA_SCHEME);
    expect((await request(newUrl)).status).toBe(404);
  });

  it('fails closed if a validated resource changes on disk', async () => {
    const { bundle, imagePath } = await makeBundle();
    const { service, request } = makeService();
    service.activateBundle(bundle);
    const url = service.getMediaUrl('image')!;
    await writeFile(imagePath, Buffer.concat([PNG, Buffer.from([1])]));

    expect((await request(url)).status).toBe(404);
  });

  it('does not issue a capability for an unknown Asset ID', async () => {
    const { bundle } = await makeBundle();
    const { service } = makeService();
    service.activateBundle(bundle);
    expect(service.getMediaUrl('missing')).toBeNull();
  });
});
