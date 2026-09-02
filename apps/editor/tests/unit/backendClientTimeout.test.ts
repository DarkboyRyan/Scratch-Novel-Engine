/**
 * 文件主要作用：验证 backend request timeout 的行为。
 * 测试覆盖：`backend request timeout`。
 */

import { describe, expect, it, vi } from 'vitest';

import {
  BackendClient,
  backendRequestTimeoutMs,
} from '../../src/main/backend/backendClient';

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

  it('does not report a failed scene replacement while C++ may still commit it', () => {
    expect(
      backendRequestTimeoutMs({
        method: 'scene.content.replace',
        params: {
          sceneId: 'scene-1',
          draft: {
            name: 'Scene 1',
            initialBackground: { assetId: null, scalePercent: 100 },
            nodes: [],
          },
        },
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

  it('rejects a matching malformed response immediately instead of timing out', () => {
    vi.useFakeTimers();
    const client = new BackendClient();
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeout = setTimeout(vi.fn(), 10_000);
    const internals = client as unknown as {
      pendingRequests: Map<
        number,
        {
          resolve: typeof resolve;
          reject: typeof reject;
          timeout: typeof timeout;
        }
      >;
      handleLine(line: string): void;
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      internals.pendingRequests.set(7, {
        resolve,
        reject,
        timeout,
      });
      internals.handleLine(
        JSON.stringify({ id: 7, ok: true, result: {} }),
      );

      expect(resolve).not.toHaveBeenCalled();
      expect(reject).toHaveBeenCalledOnce();
      expect(reject).toHaveBeenCalledWith(
        new Error('C++ 后端响应格式不正确（请求 7）'),
      );
      expect(internals.pendingRequests.has(7)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it('rejects a matching malformed CG response immediately', () => {
    vi.useFakeTimers();
    const client = new BackendClient();
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeout = setTimeout(vi.fn(), 10_000);
    const internals = client as unknown as {
      pendingRequests: Map<
        number,
        {
          resolve: typeof resolve;
          reject: typeof reject;
          timeout: typeof timeout;
        }
      >;
      handleLine(line: string): void;
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      internals.pendingRequests.set(9, { resolve, reject, timeout });
      internals.handleLine(JSON.stringify({
        id: 9,
        ok: true,
        result: {
          project: {
            schemaVersion: 1,
            id: 'project-1',
            name: 'Story',
            entrySceneId: 'scene-1',
            startScreen: {
              title: 'Story',
              backgroundAssetId: null,
              musicAssetId: null,
            },
            cgGallery: {
              pages: [{ imageAssetIds: Array(9).fill(null) }],
            },
            scenes: [{
              schemaVersion: 1,
              id: 'scene-1',
              name: 'Scene 1',
              backgroundAssetId: null,
              backgroundScalePercent: 100,
              nodes: [
                {
                  id: 'cg-1',
                  type: 'cgDisplay',
                  assetId: 'image-1',
                  leadInMs: 0,
                },
                {
                  id: 'background-inside',
                  type: 'background',
                  assetId: null,
                },
                {
                  id: 'cg-end-1',
                  type: 'cgEndDisplay',
                  cgDisplayNodeId: 'cg-1',
                },
              ],
            }],
          },
          assets: [{ id: 'image-1', type: 'image', displayName: 'CG' }],
          session: { revision: 1, savedRevision: null, isDirty: true },
        },
      }));

      expect(resolve).not.toHaveBeenCalled();
      expect(reject).toHaveBeenCalledWith(
        new Error('C++ 后端响应格式不正确（请求 9）'),
      );
      expect(internals.pendingRequests.has(9)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it('rejects a matching malformed portrait-effect response immediately', () => {
    vi.useFakeTimers();
    const client = new BackendClient();
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeout = setTimeout(vi.fn(), 10_000);
    const internals = client as unknown as {
      pendingRequests: Map<
        number,
        {
          resolve: typeof resolve;
          reject: typeof reject;
          timeout: typeof timeout;
        }
      >;
      handleLine(line: string): void;
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      internals.pendingRequests.set(10, { resolve, reject, timeout });
      internals.handleLine(JSON.stringify({
        id: 10,
        ok: true,
        result: {
          project: {
            schemaVersion: 1,
            id: 'project-1',
            name: 'Story',
            entrySceneId: 'scene-1',
            startScreen: {
              title: 'Story',
              backgroundAssetId: null,
              musicAssetId: null,
            },
            cgGallery: {
              pages: [{ imageAssetIds: Array(9).fill(null) }],
            },
            scenes: [{
              schemaVersion: 1,
              id: 'scene-1',
              name: 'Scene 1',
              backgroundAssetId: null,
              backgroundScalePercent: 100,
              nodes: [{
                id: 'character-1',
                type: 'character',
                assetId: 'image-1',
                slot: 'center',
                layer: 1,
                position: null,
                effect: {
                  type: 'fadeIn',
                  durationMs: 500,
                  intensity: 'normal',
                },
              }],
            }],
          },
          assets: [{ id: 'image-1', type: 'image', displayName: 'Portrait' }],
          session: { revision: 1, savedRevision: null, isDirty: true },
        },
      }));

      expect(resolve).not.toHaveBeenCalled();
      expect(reject).toHaveBeenCalledWith(
        new Error('C++ 后端响应格式不正确（请求 10）'),
      );
      expect(internals.pendingRequests.has(10)).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it('rejects pending work when malformed output has no request ID', () => {
    vi.useFakeTimers();
    const client = new BackendClient();
    const resolve = vi.fn();
    const reject = vi.fn();
    const timeout = setTimeout(vi.fn(), 10_000);
    const internals = client as unknown as {
      pendingRequests: Map<
        number,
        {
          resolve: typeof resolve;
          reject: typeof reject;
          timeout: typeof timeout;
        }
      >;
      handleLine(line: string): void;
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      internals.pendingRequests.set(8, {
        resolve,
        reject,
        timeout,
      });
      internals.handleLine('not-json');

      expect(resolve).not.toHaveBeenCalled();
      expect(reject).toHaveBeenCalledWith(
        new Error('C++ 后端输出无法关联到请求，协议连接已失去同步'),
      );
      expect(internals.pendingRequests.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });
});
