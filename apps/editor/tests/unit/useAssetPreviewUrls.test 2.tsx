/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证图片预览 URL 与当前项目身份严格绑定。
 * 测试覆盖：媒体类型筛选、项目切换同步失效以及延迟解析回写。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetPreviewUrls } from '../../src/renderer/features/assets/useAssetPreviewUrls';
import type { AssetPreviewUrlResolver } from '../../src/renderer/application/mediaPort';
import type { AssetDocument } from '../../src/shared/projectTypes';

const assets: AssetDocument[] = [
  { id: 'shared-image-id', type: 'image', displayName: 'Portrait.png' },
  { id: 'audio-id', type: 'audio', displayName: 'Theme.ogg' },
];

describe('useAssetPreviewUrls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderHarness(
    projectId: string,
    projectGeneration: number,
    resolvePreviewUrl: AssetPreviewUrlResolver,
  ): Promise<void> {
    function Harness() {
      const urls = useAssetPreviewUrls(
        projectId,
        projectGeneration,
        assets,
        resolvePreviewUrl,
      );
      const imageUrl = urls['shared-image-id'];
      return imageUrl ? <img src={imageUrl} alt="Preview probe" /> : null;
    }

    await act(async () => {
      root.render(<Harness />);
    });
  }

  it('resolves preview URLs for image assets only', async () => {
    const resolvePreviewUrl = vi.fn<AssetPreviewUrlResolver>()
      .mockResolvedValue('asset-preview://project-a/image');

    await renderHarness('project-a', 1, resolvePreviewUrl);
    await act(async () => Promise.resolve());

    expect(resolvePreviewUrl).toHaveBeenCalledOnce();
    expect(resolvePreviewUrl).toHaveBeenCalledWith('shared-image-id');
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'asset-preview://project-a/image',
    );
  });

  it('hides a previous project URL synchronously while the replacement resolves', async () => {
    let resolveProjectB: ((url: string | null) => void) | undefined;
    const resolvePreviewUrl = vi.fn<AssetPreviewUrlResolver>()
      .mockResolvedValueOnce('asset-preview://project-a/image')
      .mockReturnValueOnce(new Promise<string | null>((resolve) => {
        resolveProjectB = resolve;
      }));

    await renderHarness('project-a', 1, resolvePreviewUrl);
    await act(async () => Promise.resolve());
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'asset-preview://project-a/image',
    );

    await renderHarness('project-b', 1, resolvePreviewUrl);
    expect(container.querySelector('img')).toBeNull();

    await act(async () => {
      resolveProjectB?.('asset-preview://project-b/image');
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'asset-preview://project-b/image',
    );
  });
});
