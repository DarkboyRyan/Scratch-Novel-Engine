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
