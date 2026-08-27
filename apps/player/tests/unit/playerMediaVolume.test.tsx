/** @vitest-environment jsdom */
/**
 * 主要作用：验证主音量、通道音量和视频元素的实时同步。
 * 关键函数与实现：测试套件“Player media volume”；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewVideo } from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Player media volume', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let playedVolumes: number[];

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    playedVolumes = [];
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      function (this: HTMLMediaElement) {
        playedVolumes.push(this.volume);
        return Promise.resolve();
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('sets zero volume before every play and does not replay on volume change', async () => {
    const resolveMediaUrl = vi.fn(async () => 'vn-game-asset://video/intro');
    const onComplete = vi.fn();
    await act(async () => {
      root.render(
        <PreviewVideo
          assetId="intro"
          sequence={1}
          resolveMediaUrl={resolveMediaUrl}
          onComplete={onComplete}
          volume={0}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const video = container.querySelector('video');
    expect(video?.autoplay).toBe(false);
    expect(video?.volume).toBe(0);
    await act(async () => video?.dispatchEvent(
      new Event('canplay', { bubbles: true }),
    ));
    expect(playedVolumes.length).toBeGreaterThan(0);
    expect(playedVolumes.every((volume) => volume === 0)).toBe(true);

    const playCount = playedVolumes.length;
    await act(async () => root.render(
      <PreviewVideo
        assetId="intro"
        sequence={1}
        resolveMediaUrl={resolveMediaUrl}
        onComplete={onComplete}
        volume={0.5}
      />,
    ));
    expect(video?.volume).toBe(0.5);
    expect(playedVolumes).toHaveLength(playCount);
  });
});
