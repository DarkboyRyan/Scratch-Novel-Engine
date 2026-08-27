/**
 * 主要作用：从静态站点受限拉取、校验和装配 Web 运行包。
 * 关键函数与实现：`WebBundleIdentity`、`LoadedWebBundle`、`WebFetch`、`WebBundleLoaderOptions`；基于浏览器 Fetch、IndexedDB、Fullscreen 与 React 边界实现。
 */
import type { PlayerGameView } from '../renderer/playerGateway';
import {
  parseRuntimeBundleDocuments,
  type RuntimeManifestAsset,
} from '../shared/runtimeBundleSchema';
import { parseWebExportDescriptor } from '../shared/webExportProtocol';

const MAX_JSON_BYTES = 16 * 1024 * 1024;

export type WebBundleIdentity = {
  projectId: string;
  runtimeVersion: number;
  contentFingerprint: string;
};

export type LoadedWebBundle = {
  game: PlayerGameView;
  identity: WebBundleIdentity;
  gameRoot: string;
  assetUrls: ReadonlyMap<string, string>;
};

export type WebFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type WebBundleLoaderOptions = {
  baseUrl?: string;
  fetch?: WebFetch;
  crypto?: Pick<Crypto, 'subtle'>;
};

function rootUrl(baseUrl: string): URL {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new Error('Web 游戏必须通过 HTTP 或 HTTPS 静态服务器运行');
  }
  return new URL('./', base);
}

function utf8Bytes(contents: string): Uint8Array {
  return new TextEncoder().encode(contents);
}

async function limitedResponseText(
  response: Response,
  label: string,
): Promise<string> {
  if (response.body === null) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_JSON_BYTES) {
      throw new Error(`${label} 超过大小限制`);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`${label} 不是有效 UTF-8`);
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const fragments: string[] = [];
  let totalBytes = 0;
  let reading = true;
  try {
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error(`${label} 超过大小限制`);
      }
      fragments.push(decoder.decode(value, { stream: true }));
    }
    fragments.push(decoder.decode());
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`${label} 不是有效 UTF-8`);
    }
    throw error;
  }
  return fragments.join('');
}

async function readWebDocument(
  fetchDocument: WebFetch,
  url: URL,
  label: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchDocument(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
    });
  } catch {
    throw new Error(`${label} 无法读取`);
  }
  if (!response.ok) {
    throw new Error(`${label} 无法读取（HTTP ${response.status}）`);
  }
  if (response.url.length > 0) {
    let responseUrl: URL;
    try {
      responseUrl = new URL(response.url);
    } catch {
      throw new Error(`${label} 返回了无效地址`);
    }
    if (responseUrl.origin !== url.origin) {
      throw new Error(`${label} 不允许跨站重定向`);
    }
  }
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES)
  ) {
    throw new Error(`${label} 超过大小限制`);
  }
  return limitedResponseText(response, label);
}

function hexadecimal(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(
  contents: string,
  cryptoApi: Pick<Crypto, 'subtle'>,
): Promise<string> {
  const bytes = Uint8Array.from(utf8Bytes(contents));
  return hexadecimal(await cryptoApi.subtle.digest('SHA-256', bytes.buffer));
}

function assetUrlMap(
  gameBaseUrl: URL,
  files: readonly RuntimeManifestAsset[],
): ReadonlyMap<string, string> {
  const urls = new Map<string, string>();
  for (const file of files) {
    let encodedPath: string;
    try {
      encodedPath = file.path.split('/').map((segment) =>
        encodeURIComponent(segment)).join('/');
    } catch {
      throw new Error('manifest.json 包含无法编码的资源路径');
    }
    const url = new URL(encodedPath, gameBaseUrl);
    if (
      url.origin !== gameBaseUrl.origin ||
      !url.href.startsWith(gameBaseUrl.href)
    ) {
      throw new Error('manifest.json 包含逃逸游戏目录的资源路径');
    }
    urls.set(file.id, url.href);
  }
  return urls;
}

export async function loadWebBundle(
  options: WebBundleLoaderOptions = {},
): Promise<LoadedWebBundle> {
  const baseUrl = options.baseUrl ?? document.baseURI;
  const fetchDocument = options.fetch ?? globalThis.fetch.bind(globalThis);
  const cryptoApi = options.crypto ?? globalThis.crypto;
  if (cryptoApi?.subtle === undefined) {
    throw new Error('当前浏览器不支持安全的 Web 游戏内容校验');
  }
  const root = rootUrl(baseUrl);
  const descriptorContents = await readWebDocument(
    fetchDocument,
    new URL('web-export.json', root),
    'web-export.json',
  );
  const descriptor = parseWebExportDescriptor(descriptorContents);
  const gameBaseUrl = new URL(`${descriptor.gameRoot}/`, root);
  const [gameContents, manifestContents] = await Promise.all([
    readWebDocument(
      fetchDocument,
      new URL('game.json', gameBaseUrl),
      'game.json',
    ),
    readWebDocument(
      fetchDocument,
      new URL('manifest.json', gameBaseUrl),
      'manifest.json',
    ),
  ]);
  const parsed = parseRuntimeBundleDocuments(gameContents, manifestContents);
  if (
    parsed.runtimeVersion !== descriptor.runtimeVersion ||
    parsed.buildId !== descriptor.gameRoot.slice('game/'.length)
  ) {
    throw new Error('Web 导出描述与游戏 runtime 内容不一致');
  }
  return {
    game: parsed.game,
    gameRoot: descriptor.gameRoot,
    assetUrls: assetUrlMap(gameBaseUrl, parsed.files),
    identity: {
      projectId: parsed.game.project.id,
      runtimeVersion: parsed.runtimeVersion,
      contentFingerprint: await sha256(gameContents, cryptoApi),
    },
  };
}
