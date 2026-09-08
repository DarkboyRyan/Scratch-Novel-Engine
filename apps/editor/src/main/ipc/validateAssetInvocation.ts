// 主要作用：在 Main 边界严格校验资源导入 IPC 的动作和参数。
// 关键实现：isAssetInvocation 仅接受白名单动作及精确空参数对象。
import type { AssetInvocation } from '../../shared/assetProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const utf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

function isOpaqueAssetId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isManagementAssetId(value: unknown): value is string {
  return (
    isOpaqueAssetId(value) &&
    !value.includes('\0') &&
    utf8ByteLength(value) <= 1024
  );
}

function isAssetDisplayName(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    value !== value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '') ||
    utf8ByteLength(value) > 256
  ) {
    return false;
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(
    new TextEncoder().encode(value),
  ) === value;
}

export function isAssetInvocation(
  value: unknown,
): value is AssetInvocation {
  if (
    !isObject(value) ||
    Object.keys(value).length !== 2 ||
    !isObject(value.params)
  ) {
    return false;
  }

  if (
    value.action === 'import-image' ||
    value.action === 'import-video' ||
    value.action === 'import-audio'
  ) {
    return Object.keys(value.params).length === 0;
  }

  if (value.action === 'rename') {
    return (
      Object.keys(value.params).length === 2 &&
      isManagementAssetId(value.params.assetId) &&
      isAssetDisplayName(value.params.displayName)
    );
  }

  if (value.action === 'delete-many') {
    if (
      Object.keys(value.params).length !== 1 ||
      !Array.isArray(value.params.assetIds) ||
      value.params.assetIds.length === 0 ||
      value.params.assetIds.length > 1000 ||
      !value.params.assetIds.every(isManagementAssetId)
    ) {
      return false;
    }
    return new Set(value.params.assetIds).size === value.params.assetIds.length;
  }

  return (
    (value.action === 'get-preview-url' ||
      value.action === 'get-media-url') &&
    Object.keys(value.params).length === 1 &&
    isOpaqueAssetId(value.params.assetId)
  );
}
