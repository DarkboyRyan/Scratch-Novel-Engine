import { describe, expect, it } from 'vitest';

import { backendRequestTimeoutMs } from '../../src/main/backend/backendClient';

describe('backend request timeout', () => {
  it('does not abandon an image import that may still commit', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'asset.import',
        params: {
          kind: 'image',
          sourceFilePath: '/source/portrait.png',
          projectFilePath: '/project/project.vn.json',
        },
      }),
    ).toBeNull();
  });

  it('does not abandon project.open after it may still commit', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'project.open',
        params: { contents: '{"format":"vn-engine-project"}' },
      }),
    ).toBeNull();
  });

  it('does not abandon project.save after it may still commit', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'project.save',
        params: { filePath: '/project/project.vn.json' },
      }),
    ).toBeNull();
  });

  it('keeps ordinary JSON commands responsive', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'project.get',
        params: {},
      }),
    ).toBe(10_000);
  });
});
