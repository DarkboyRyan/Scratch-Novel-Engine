/** @vitest-environment jsdom */
/**
 * 主要作用：验证游戏内 CG 引导时长、暂停、错误回退和节点切换。
 * 关键函数与实现：测试套件“gameplay CG display lead-in”、`project`、`HarnessControls`、`deferred`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  completeCgLeadIn,
  startGame,
  type GameRuntime,
  type ProjectDocument,
} from '@vnengine/runtime';
import type * as PlayerUi from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GameScreen } from '../../src/renderer/GameScreen';

vi.mock('@vnengine/player-ui', async (importOriginal) => {
  const original = await importOriginal<typeof PlayerUi>();
  return { ...original, usePreviewAudio: vi.fn() };
});

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'cg-timer',
  name: 'CG timer',
  entrySceneId: 'entry',
  startScreen: {
    title: '',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [{
    schemaVersion: 1,
    id: 'entry',
    name: 'Entry',
    backgroundAssetId: null,
    backgroundScalePercent: 100,
    nodes: [
      { id: 'cg', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 1000 },
      {
        id: 'line',
        type: 'dialogue',
        speaker: 'Narrator',
        text: 'Visible after the lead-in',
        voiceAssetId: null,
      },
      { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
    ],
  }],
};

type HarnessControls = {
  runtime(): GameRuntime;
  setPaused(value: boolean): void;
  setMediaPaused(value: boolean): void;
  setInteractionBlocked(value: boolean): void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('gameplay CG display lead-in', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controls: HarnessControls;
  let hidden = false;
  let hiddenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    hidden = false;
    hiddenSpy = vi.spyOn(document, 'hidden', 'get').mockImplementation(
      () => hidden,
    );
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    hiddenSpy.mockRestore();
    vi.useRealTimers();
  });

  function renderHarness(
    resolveMediaUrl: (assetId: string) => Promise<string | null>,
    onReturnToTitle = vi.fn(),
  ) {
    function Harness() {
      const [runtime, setRuntime] = useState(() => startGame(project)!);
      const [paused, setPaused] = useState(false);
      const [mediaPaused, setMediaPaused] = useState(false);
      const [interactionBlocked, setInteractionBlocked] = useState(false);
      controls = {
        runtime: () => runtime,
        setPaused,
        setMediaPaused,
        setInteractionBlocked,
      };
      return (
        <GameScreen
          project={project}
          assets={[{ id: 'cg-image', type: 'image', displayName: 'Test CG' }]}
          runtime={runtime}
          paused={paused}
          mediaPaused={mediaPaused}
          interactionBlocked={interactionBlocked}
          bgmVolume={1}
          voiceVolume={1}
          videoVolume={1}
          quickSaveBusy={false}
          quickLoadBusy={false}
          canOpenGame={false}
          openingGame={false}
          resolveMediaUrl={resolveMediaUrl}
          onAdvance={() => {}}
          onCompleteCgLeadIn={() => setRuntime((current) =>
            completeCgLeadIn(project, current))}
          onCompleteVideo={() => {}}
          onSelectChoice={() => {}}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
          onSave={() => {}}
          onLoad={() => {}}
          onQuickSave={() => {}}
          onQuickLoad={() => {}}
          onOptions={() => {}}
          onRestart={() => {}}
          onOpenGame={() => {}}
          onReturnToTitle={onReturnToTitle}
        />
      );
    }
    act(() => root.render(<Harness />));
  }

  async function resolveAndLoadImage(
    pending: ReturnType<typeof deferred<string | null>>,
  ) {
    await act(async () => pending.resolve('blob:test-cg'));
    const image = container.querySelector<HTMLImageElement>(
      '.player-cg-display-layer img',
    );
    if (!image) throw new Error('CG image was not rendered');
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => image.dispatchEvent(new Event('load')));
  }

  it('starts timing only after deferred resolution and successful image decode', async () => {
    const pending = deferred<string | null>();
    renderHarness(() => pending.promise);

    act(() => vi.advanceTimersByTime(5000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    await act(async () => pending.resolve('blob:test-cg'));
    act(() => vi.advanceTimersByTime(5000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');

    const image = container.querySelector<HTMLImageElement>(
      '.player-cg-display-layer img',
    )!;
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => image.dispatchEvent(new Event('load')));
    act(() => vi.advanceTimersByTime(999));
    expect(container.querySelector('.dialogue-box')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(controls.runtime().status).toBe('playing');
    expect(container.querySelector('.dialogue-box')?.textContent)
      .toContain('Visible after the lead-in');
    expect(container.querySelector('.player-cg-display-layer img')).not.toBeNull();
  });

  it('preserves remaining time across pause, modal blocking and hidden pages', async () => {
    const pending = deferred<string | null>();
    renderHarness(() => pending.promise);
    await resolveAndLoadImage(pending);

    act(() => vi.advanceTimersByTime(250));
    act(() => controls.setPaused(true));
    expect(container.querySelector('.preview-stage')
      ?.getAttribute('data-character-animations-paused')).toBe('true');
    act(() => vi.advanceTimersByTime(2000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    act(() => controls.setPaused(false));
    expect(container.querySelector('.preview-stage')
      ?.hasAttribute('data-character-animations-paused')).toBe(false);

    act(() => vi.advanceTimersByTime(250));
    act(() => controls.setInteractionBlocked(true));
    expect(container.querySelector('.preview-stage')
      ?.getAttribute('data-character-animations-paused')).toBe('true');
    act(() => vi.advanceTimersByTime(2000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    act(() => controls.setInteractionBlocked(false));

    act(() => vi.advanceTimersByTime(250));
    act(() => controls.setMediaPaused(true));
    expect(container.querySelector('.preview-stage')
      ?.getAttribute('data-character-animations-paused')).toBe('true');
    act(() => vi.advanceTimersByTime(2000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    act(() => controls.setMediaPaused(false));

    act(() => vi.advanceTimersByTime(100));
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.querySelector('.preview-stage')
      ?.getAttribute('data-character-animations-paused')).toBe('true');
    act(() => vi.advanceTimersByTime(2000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    act(() => vi.advanceTimersByTime(149));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    act(() => vi.advanceTimersByTime(1));
    expect(controls.runtime().status).toBe('playing');
  });

  it('does not advance after an image failure and offers return to title', async () => {
    const returnToTitle = vi.fn();
    renderHarness(async () => 'blob:broken-cg', returnToTitle);
    await act(async () => Promise.resolve());
    const image = container.querySelector<HTMLImageElement>(
      '.player-cg-display-layer img',
    )!;
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('decode failed')),
    });
    await act(async () => image.dispatchEvent(new Event('load')));

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('CG 图片无法读取');
    expect(container.querySelector('[aria-label="剧情 CG"]')
      ?.getAttribute('aria-busy')).toBe('false');
    act(() => vi.advanceTimersByTime(5000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    act(() => container.querySelector<HTMLButtonElement>(
      '.player-cg-display-error button',
    )?.click());
    expect(returnToTitle).toHaveBeenCalledOnce();
  });

  it('clears its pending timer when gameplay unmounts', async () => {
    const pending = deferred<string | null>();
    renderHarness(() => pending.promise);
    await resolveAndLoadImage(pending);
    act(() => root.unmount());
    act(() => vi.advanceTimersByTime(2000));
    expect(controls.runtime().status).toBe('waitingCgLeadIn');
    root = createRoot(container);
  });
});
