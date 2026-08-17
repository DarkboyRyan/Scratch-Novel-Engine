/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewVideo } from '@vnengine/player-ui';

describe('PreviewVideo', () => {
  let container: HTMLDivElement;
  let root: Root;
  let getMediaUrl: ReturnType<typeof vi.fn>;
  let play: ReturnType<typeof vi.spyOn>;
  let pause: ReturnType<typeof vi.spyOn>;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    getMediaUrl = vi.fn();
    play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    load = vi.spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('plays an opaque media capability and continues when playback ends', async () => {
    getMediaUrl.mockResolvedValue('vn-asset://video/token/asset-token');
    const onComplete = vi.fn();

    await act(async () => {
      root.render(
        <PreviewVideo
          assetId="video-1"
          sequence={1}
          resolveMediaUrl={getMediaUrl}
          onComplete={onComplete}
        />,
      );
    });

    expect(getMediaUrl).toHaveBeenCalledWith('video-1');
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe(
      'vn-asset://video/token/asset-token',
    );
    expect(video?.controls).toBe(false);
    expect(video?.hasAttribute('disablepictureinpicture')).toBe(true);

    await act(async () => {
      video?.dispatchEvent(new Event('canplay', { bubbles: true }));
    });
    expect(play).toHaveBeenCalled();

    await act(async () => {
      video?.dispatchEvent(new Event('ended', { bubbles: true }));
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')).toBeNull();

    await act(async () => root.unmount());
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    root = createRoot(container);
  });

  it('shows a non-fatal error with the Enter shortcut', async () => {
    getMediaUrl.mockResolvedValue(null);
    const onComplete = vi.fn();

    await act(async () => {
      root.render(
        <PreviewVideo
          assetId="missing-video"
          sequence={1}
          resolveMediaUrl={getMediaUrl}
          onComplete={onComplete}
        />,
      );
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '按 Enter 跳过',
    );
    expect(container.querySelector('button')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
