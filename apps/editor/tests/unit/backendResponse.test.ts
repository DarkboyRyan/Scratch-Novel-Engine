import { describe, expect, it } from 'vitest';

import { parseBackendResponse } from '../../src/main/backend/backendResponse';

function successResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 1,
    ok: true,
    result: {
      project: { id: 'project-1' },
      assets: [
        {
          id: 'asset-1',
          type: 'image',
          displayName: 'portrait.png',
        },
      ],
      session: {
        revision: 2,
        savedRevision: 1,
        isDirty: true,
      },
      ...overrides,
    },
  });
}

describe('backend response validation', () => {
  it('accepts asset metadata and optional imported asset ID', () => {
    expect(
      parseBackendResponse(successResponse({ assetId: 'asset-1' })),
    ).toMatchObject({
      ok: true,
      result: {
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            displayName: 'portrait.png',
          },
        ],
        assetId: 'asset-1',
      },
    });
  });

  it('strips backend-only paths and unknown result metadata', () => {
    const parsed = parseBackendResponse(
      successResponse({
        sourceFilePath: '/Users/example/Pictures/portrait.png',
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            displayName: 'portrait.png',
            relativePath: 'assets/images/asset-1.png',
          },
        ],
      }),
    );

    expect(JSON.stringify(parsed)).not.toContain('sourceFilePath');
    expect(JSON.stringify(parsed)).not.toContain('relativePath');
  });

  it.each([
    { assets: undefined },
    { assets: [{ id: 'asset-1', type: 'binary', displayName: 'a' }] },
    { assets: [{ id: 'asset-1', type: 'image' }] },
    { assetId: 42 },
  ])('rejects malformed asset results: %j', (overrides) => {
    expect(() =>
      parseBackendResponse(successResponse(overrides)),
    ).toThrow('assets');
  });
});
