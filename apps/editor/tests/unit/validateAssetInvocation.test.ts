import { describe, expect, it } from 'vitest';

import { isAssetInvocation } from '../../src/main/ipc/validateAssetInvocation';

describe('asset IPC invocation validation', () => {
  it('accepts only the path-free image import intent', () => {
    expect(
      isAssetInvocation({ action: 'import-image', params: {} }),
    ).toBe(true);
    expect(
      isAssetInvocation({ action: 'import-video', params: {} }),
    ).toBe(true);
  });

  it('treats every non-empty asset ID as opaque data for preview lookup', () => {
    expect(
      isAssetInvocation({
        action: 'get-preview-url',
        params: { assetId: 'asset_123-ABC' },
      }),
    ).toBe(true);
    // An ID is only a Map key in Main, never a filesystem path component.
    expect(
      isAssetInvocation({
        action: 'get-preview-url',
        params: { assetId: '../still-just-an-id' },
      }),
    ).toBe(true);
    expect(
      isAssetInvocation({
        action: 'get-preview-url',
        params: { assetId: '' },
      }),
    ).toBe(false);
    expect(
      isAssetInvocation({
        action: 'get-preview-url',
        params: { assetId: 'asset-1', relativePath: '/tmp/a.png' },
      }),
    ).toBe(false);
  });

  it.each([
    null,
    {},
    { action: 'import-image' },
    { action: 'import-image', params: null },
    { action: 'import-image', params: { sourceFilePath: '/tmp/a.png' } },
    {
      action: 'import-image',
      params: { projectFilePath: '/tmp/project.vn.json' },
    },
    { action: 'import-video', params: { sourceFilePath: '/tmp/a.mp4' } },
    { action: 'import-image', params: {}, extra: true },
  ])('rejects malformed or path-bearing requests: %j', (value) => {
    expect(isAssetInvocation(value)).toBe(false);
  });
});
