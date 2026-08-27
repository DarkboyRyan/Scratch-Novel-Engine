// 主要作用：在 Main 边界严格校验资源导入 IPC 的动作和参数。
// 关键实现：isAssetInvocation 仅接受白名单动作及精确空参数对象。
import type { AssetInvocation } from '../../shared/assetProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

  return (
    (value.action === 'get-preview-url' ||
      value.action === 'get-media-url') &&
    Object.keys(value.params).length === 1 &&
    typeof value.params.assetId === 'string' &&
    value.params.assetId.length > 0
  );
}
