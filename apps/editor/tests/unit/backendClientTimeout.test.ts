import { describe, expect, it } from 'vitest';

import { backendRequestTimeoutMs } from '../../src/main/backend/backendClient';

describe('backend request timeout', () => {
  it('does not abandon an image import that may still commit', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'asset.import',
        params: {
          sourceFilePath: '/source/portrait.png',
          projectFilePath: '/project/project.vn.json',
        },
      }),
    ).toBeNull();
  });

  it.each(['project.open', 'project.save'] as const)(
    'does not abandon %s after it may still commit',
    (method) => {
      expect(
        backendRequestTimeoutMs({
          method,
          params: { filePath: '/project/project.vn.json' },
        }),
      ).toBeNull();
    },
  );

  it('keeps ordinary JSON commands responsive', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'project.get',
        params: {},
      }),
    ).toBe(10_000);
  });
});
