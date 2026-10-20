/**
 * 文件主要作用：生成 Code DSL 和资源详情共用的安全逻辑资源路径。
 * 关键实现：只使用 Renderer 可见的类型与显示名，不读取或推导真实存储路径。
 */

import type { AssetDocument } from '../../../shared/projectTypes';

const LOGICAL_ASSET_DIRECTORIES: Record<AssetDocument['type'], string> = {
  image: 'images',
  audio: 'audio',
  video: 'videos',
};
const UTF8_ENCODER = new TextEncoder();

export function escapeLogicalAssetName(displayName: string): string {
  const characters = Array.from(displayName);
  if (characters.length === 0) {
    return '%EMPTY';
  }

  const escaped = characters.map((character, index) => {
    const isInternalSpace = character === ' ' &&
      index > 0 &&
      index < characters.length - 1;
    if (/^[\p{L}\p{N}_.-]$/u.test(character) || isInternalSpace) {
      return character;
    }
    return Array.from(
      UTF8_ENCODER.encode(character),
      (byte) => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`,
    ).join('');
  }).join('');

  return escaped.replace(/^\.+/u, (leadingDots) =>
    leadingDots.replaceAll('.', '%2E')
  );
}

export function logicalAssetPath(asset: AssetDocument): string {
  return `assets/${LOGICAL_ASSET_DIRECTORIES[asset.type]}/${escapeLogicalAssetName(asset.displayName)}`;
}

export function missingLogicalAssetPath(
  type: AssetDocument['type'],
): string {
  return `assets/${LOGICAL_ASSET_DIRECTORIES[type]}/%MISSING`;
}
