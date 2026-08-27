/**
 * 主要作用：定义 Player 支持的媒体 MIME、目录和大小限制。
 * 关键函数与实现：`PlayerMediaMime`、`maximumPlayerMediaBytes`、`expectedAssetDirectory`、`mimeForPlayerAsset`；以 TypeScript 类型边界和可组合函数实现。
 */
import type { PlayerAssetType } from './playerProtocol';

export type PlayerMediaMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'audio/wav'
  | 'video/mp4'
  | 'video/webm';

const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

const MIME_BY_EXTENSION: Readonly<Record<string, PlayerMediaMime>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const MIME_TYPE: Readonly<Record<PlayerMediaMime, PlayerAssetType>> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
};

export function maximumPlayerMediaBytes(type: PlayerAssetType): number {
  if (type === 'image') {
    return MAX_IMAGE_BYTES;
  }
  return type === 'audio' ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
}

export function expectedAssetDirectory(type: PlayerAssetType): string {
  if (type === 'image') {
    return 'images';
  }
  return type === 'audio' ? 'audio' : 'videos';
}

function posixExtension(relativePath: string): string {
  const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  const dot = fileName.lastIndexOf('.');
  return dot <= 0 ? '' : fileName.slice(dot).toLowerCase();
}

export function mimeForPlayerAsset(
  type: PlayerAssetType,
  relativePath: string,
): PlayerMediaMime | null {
  const mime = MIME_BY_EXTENSION[posixExtension(relativePath)];
  return mime !== undefined && MIME_TYPE[mime] === type ? mime : null;
}

export function mimeMatchesAssetType(
  type: PlayerAssetType,
  mime: string,
): mime is PlayerMediaMime {
  return mime in MIME_TYPE && MIME_TYPE[mime as PlayerMediaMime] === type;
}
