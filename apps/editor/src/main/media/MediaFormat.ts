// 主要作用：统一资产扩展名、预览 MIME 和不同媒体的大小上限。
// 关键实现：canonicalAssetExtension、previewMimeForAsset 与 maximumPreviewBytes。
import path from 'node:path';

import type { AssetDocument } from '../../shared/projectTypes';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type AudioMime = 'audio/mpeg' | 'audio/ogg' | 'audio/wav';
export type VideoMime = 'video/mp4' | 'video/webm';
export type PreviewMime = ImageMime | AudioMime | VideoMime;

const MAX_PREVIEW_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_PREVIEW_AUDIO_BYTES = 512 * 1024 * 1024;
const MAX_PROJECT_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export function canonicalAssetExtension(
  type: AssetDocument['type'],
  sourceFilePath: string,
): string | null {
  const extension = path.extname(sourceFilePath).toLowerCase();
  if (type === 'image') {
    switch (extension) {
      case '.png':
        return '.png';
      case '.jpg':
      case '.jpeg':
        return '.jpg';
      case '.webp':
        return '.webp';
      default:
        return null;
    }
  }

  if (type === 'video' && (extension === '.mp4' || extension === '.webm')) {
    return extension;
  }

  if (
    type === 'audio' &&
    (extension === '.mp3' || extension === '.wav' || extension === '.ogg')
  ) {
    return extension;
  }

  return null;
}

function imageMimeForPath(relativePath: string): ImageMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return null;
  }
}

function audioMimeForPath(relativePath: string): AudioMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    default:
      return null;
  }
}

function videoMimeForPath(relativePath: string): VideoMime | null {
  switch (path.posix.extname(relativePath).toLowerCase()) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return null;
  }
}

export function previewMimeForAsset(
  type: AssetDocument['type'],
  relativePath: string,
): PreviewMime | null {
  if (type === 'image') {
    return imageMimeForPath(relativePath);
  }
  if (type === 'audio') {
    return audioMimeForPath(relativePath);
  }
  return videoMimeForPath(relativePath);
}

export function maximumPreviewBytes(
  type: AssetDocument['type'],
): number {
  return type === 'video'
    ? MAX_PROJECT_VIDEO_BYTES
    : type === 'audio'
      ? MAX_PREVIEW_AUDIO_BYTES
      : MAX_PREVIEW_IMAGE_BYTES;
}
