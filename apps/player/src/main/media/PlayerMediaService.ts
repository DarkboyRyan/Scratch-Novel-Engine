import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { Readable } from 'node:stream';

import type { Protocol } from 'electron';

import type {
  LoadedPlayerAsset,
  LoadedRuntimeBundle,
} from '../content/PlayerBundleLoader';
import {
  openSafeBundleFile,
  sameFileSnapshot,
} from '../content/safeFiles';
import {
  maximumPlayerMediaBytes,
  playerMediaMagicMatches,
} from './mediaPolicy';
import { parsePlayerByteRange } from './mediaRange';

export const PLAYER_MEDIA_SCHEME = 'vn-game-asset';

type ProtocolRegistrar = Pick<Protocol, 'handle' | 'unhandle'>;

type ActiveBundle = {
  bundle: LoadedRuntimeBundle;
  generationToken: string;
  tokensByAssetId: Map<string, string>;
  assetIdsByToken: Map<string, string>;
};

function freshToken(): string {
  return randomUUID().replaceAll('-', '');
}

function unavailableResponse(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function invalidRangeResponse(fileSize: number): Response {
  return new Response(null, {
    status: 416,
    headers: {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${fileSize}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export class PlayerMediaService {
  private active: ActiveBundle | null = null;
  private readonly activeStreams = new Set<ReadStream>();
  private disposed = false;

  constructor(private readonly protocol: ProtocolRegistrar) {
    this.protocol.handle(PLAYER_MEDIA_SCHEME, (request) =>
      this.handleRequest(request),
    );
  }

  activateBundle(bundle: LoadedRuntimeBundle): void {
    if (this.disposed) {
      throw new Error('Player 媒体服务已经关闭');
    }
    this.invalidateActiveResponses();
    this.active = {
      bundle,
      generationToken: freshToken(),
      tokensByAssetId: new Map(),
      assetIdsByToken: new Map(),
    };
  }

  clearBundle(): void {
    this.invalidateActiveResponses();
    this.active = null;
  }

  getMediaUrl(assetId: string): string | null {
    const active = this.active;
    const asset = active?.bundle.assets.get(assetId);
    if (active === null || asset === undefined) {
      return null;
    }

    let assetToken = active.tokensByAssetId.get(assetId);
    if (assetToken === undefined) {
      assetToken = freshToken();
      active.tokensByAssetId.set(assetId, assetToken);
      active.assetIdsByToken.set(assetToken, assetId);
    }
    return `${PLAYER_MEDIA_SCHEME}://${asset.type}/${active.generationToken}/${assetToken}`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.invalidateActiveResponses();
    this.active = null;
    this.protocol.unhandle(PLAYER_MEDIA_SCHEME);
  }

  private invalidateActiveResponses(): void {
    for (const stream of this.activeStreams) {
      stream.destroy();
    }
    this.activeStreams.clear();
  }

  private async openCurrentAsset(
    active: ActiveBundle,
    asset: LoadedPlayerAsset,
  ) {
    const opened = await openSafeBundleFile(
      active.bundle.rootPath,
      asset.path,
      asset.snapshot,
    );
    if (
      opened.snapshot.size !== asset.bytes ||
      opened.snapshot.size > maximumPlayerMediaBytes(asset.type) ||
      !(await playerMediaMagicMatches(
        opened.file,
        asset.mime,
        opened.snapshot.size,
      ))
    ) {
      await opened.file.close();
      throw new Error('游戏资源已经失效');
    }

    const afterProbe = await opened.file.stat();
    const pathStatus = await lstat(opened.filePath);
    const currentRealPath = await realpath(opened.filePath);
    if (
      !sameFileSnapshot(opened.snapshot, afterProbe) ||
      !sameFileSnapshot(afterProbe, pathStatus) ||
      currentRealPath !== opened.filePath ||
      this.active !== active
    ) {
      await opened.file.close();
      throw new Error('游戏资源在响应前发生了变化');
    }
    return opened;
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (
      this.disposed ||
      (request.method !== 'GET' && request.method !== 'HEAD')
    ) {
      return unavailableResponse(request.method === 'GET' ? 404 : 405);
    }
    const active = this.active;
    if (active === null) {
      return unavailableResponse();
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(request.url);
    } catch {
      return unavailableResponse();
    }
    const match = requestUrl.pathname.match(
      /^\/([a-f0-9]{32})\/([a-f0-9]{32})$/,
    );
    if (
      requestUrl.protocol !== `${PLAYER_MEDIA_SCHEME}:` ||
      (requestUrl.hostname !== 'image' &&
        requestUrl.hostname !== 'audio' &&
        requestUrl.hostname !== 'video') ||
      requestUrl.username !== '' ||
      requestUrl.password !== '' ||
      requestUrl.port !== '' ||
      requestUrl.search !== '' ||
      requestUrl.hash !== '' ||
      match === null ||
      match[1] !== active.generationToken
    ) {
      return unavailableResponse();
    }

    const assetId = active.assetIdsByToken.get(match[2]);
    const asset = assetId === undefined
      ? undefined
      : active.bundle.assets.get(assetId);
    if (asset === undefined || requestUrl.hostname !== asset.type) {
      return unavailableResponse();
    }

    try {
      const opened = await this.openCurrentAsset(active, asset);
      try {
        const supportsRange = asset.type === 'audio' || asset.type === 'video';
        const rangeHeader = supportsRange
          ? request.headers.get('Range')
          : null;
        const range = rangeHeader === null
          ? null
          : parsePlayerByteRange(rangeHeader, opened.snapshot.size);
        if (rangeHeader !== null && range === null) {
          await opened.file.close();
          return invalidRangeResponse(opened.snapshot.size);
        }

        const start = range?.start ?? 0;
        const end = range?.end ?? opened.snapshot.size - 1;
        const contentLength = end - start + 1;
        const headers: Record<string, string> = {
          'Cache-Control': 'no-store',
          'Content-Length': String(contentLength),
          'Content-Type': asset.mime,
          'X-Content-Type-Options': 'nosniff',
        };
        if (supportsRange) {
          headers['Accept-Ranges'] = 'bytes';
        }
        if (range !== null) {
          headers['Content-Range'] = `bytes ${start}-${end}/${opened.snapshot.size}`;
        }
        const status = range === null ? 200 : 206;
        if (request.method === 'HEAD') {
          await opened.file.close();
          return new Response(null, { status, headers });
        }

        const stream = opened.file.createReadStream({
          autoClose: true,
          start,
          end,
        });
        this.activeStreams.add(stream);
        stream.once('close', () => {
          this.activeStreams.delete(stream);
        });
        const body = Readable.toWeb(stream) as unknown as BodyInit;
        return new Response(body, { status, headers });
      } catch (error) {
        await opened.file.close().catch(() => undefined);
        throw error;
      }
    } catch {
      return unavailableResponse();
    }
  }
}
