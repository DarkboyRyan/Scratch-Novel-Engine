import type { Stats } from 'node:fs';
import { createHash } from 'node:crypto';

import type { PlayerGameData } from '../../shared/playerProtocol';
import {
  maximumPlayerMediaBytes,
  playerMediaMagicMatches,
  type PlayerMediaMime,
} from '../media/mediaPolicy';
import {
  canonicalizeBundleRoot,
  openSafeBundleFile,
  readStableUtf8File,
  sameFileSnapshot,
  sha256File,
} from './safeFiles';
import {
  parseRuntimeBundleDocuments,
  type RuntimeManifestAsset,
} from './runtimeBundleSchema';

const MAX_GAME_JSON_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_JSON_BYTES = 16 * 1024 * 1024;

export type LoadedPlayerAsset = RuntimeManifestAsset & {
  snapshot: Stats;
};

export type LoadedRuntimeBundle = {
  rootPath: string;
  game: PlayerGameData;
  assets: ReadonlyMap<string, LoadedPlayerAsset>;
  identity: PlayerBundleIdentity;
};

export type PlayerBundleIdentity = {
  projectId: string;
  runtimeVersion: number;
  contentFingerprint: string;
};

async function validateAssetFile(
  rootPath: string,
  asset: RuntimeManifestAsset,
): Promise<LoadedPlayerAsset> {
  if (asset.bytes > maximumPlayerMediaBytes(asset.type)) {
    throw new Error('游戏资源超过 Player 的大小限制');
  }

  const opened = await openSafeBundleFile(rootPath, asset.path);
  try {
    if (opened.snapshot.size !== asset.bytes) {
      throw new Error('游戏资源大小与 manifest 不一致');
    }
    if (
      !(await playerMediaMagicMatches(
        opened.file,
        asset.mime as PlayerMediaMime,
        opened.snapshot.size,
      ))
    ) {
      throw new Error('游戏资源内容与声明类型不一致');
    }
    if ((await sha256File(opened.file, opened.snapshot.size)) !== asset.sha256) {
      throw new Error('游戏资源完整性校验失败');
    }
    const afterRead = await opened.file.stat();
    if (!sameFileSnapshot(opened.snapshot, afterRead)) {
      throw new Error('游戏资源在校验时发生了变化');
    }
    return { ...asset, snapshot: afterRead };
  } finally {
    await opened.file.close();
  }
}

export async function loadRuntimeBundle(
  bundleRoot: string,
): Promise<LoadedRuntimeBundle> {
  const rootPath = await canonicalizeBundleRoot(bundleRoot);
  const [gameContents, manifestContents] = await Promise.all([
    readStableUtf8File(rootPath, 'game.json', MAX_GAME_JSON_BYTES),
    readStableUtf8File(rootPath, 'manifest.json', MAX_MANIFEST_JSON_BYTES),
  ]);
  const parsed = parseRuntimeBundleDocuments(gameContents, manifestContents);
  const assets = new Map<string, LoadedPlayerAsset>();

  // Keep validation sequential: a malicious manifest must not make Main open
  // thousands of file descriptors at the same time.
  for (const asset of parsed.files) {
    assets.set(asset.id, await validateAssetFile(rootPath, asset));
  }

  // Treat game + manifest + Assets as one immutable snapshot. A file that is
  // individually stable is not enough if another process swaps game.json
  // after it was parsed while the Asset list is still being verified.
  const [gameAfterValidation, manifestAfterValidation] = await Promise.all([
    readStableUtf8File(rootPath, 'game.json', MAX_GAME_JSON_BYTES),
    readStableUtf8File(rootPath, 'manifest.json', MAX_MANIFEST_JSON_BYTES),
  ]);
  if (
    gameAfterValidation !== gameContents ||
    manifestAfterValidation !== manifestContents
  ) {
    throw new Error('游戏内容包在加载时发生了变化');
  }

  return {
    rootPath,
    game: parsed.game,
    assets,
    identity: {
      projectId: parsed.game.project.id,
      runtimeVersion: parsed.runtimeVersion,
      contentFingerprint: createHash('sha256')
        .update(gameContents, 'utf8')
        .digest('hex'),
    },
  };
}
