/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Editor formal preview CG lead-in 的行为。
 * 测试覆盖：`Editor formal preview CG lead-in`。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { startGame, type ProjectDocument } from '@vnengine/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamePreview } from '../../src/renderer/features/game-preview/GamePreview';
import type { GamePreviewSession } from '../../src/renderer/features/game-preview/useGamePreview';

vi.mock(
  '../../src/renderer/features/game-preview/usePreviewAudio',
  () => ({ usePreviewAudio: vi.fn() }),
);

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'preview-cg',
  name: 'Preview CG',
  entrySceneId: 'entry',
  startScreen: { title: '', backgroundAssetId: null, musicAssetId: null },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [{
    schemaVersion: 1,
    id: 'entry',
    name: 'Entry',
    backgroundAssetId: null,
    nodes: [
      { id: 'cg', type: 'cgDisplay', assetId: 'cg-image', leadInMs: 1000 },
      {
        id: 'line',
        type: 'dialogue',
        speaker: 'Narrator',
        text: 'Line',
        voiceAssetId: null,
      },
      { id: 'cg-end', type: 'cgEndDisplay', cgDisplayNodeId: 'cg' },
    ],
  }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('Editor formal preview CG lead-in', () => {
  let container: HTMLDivElement;
  let root: Root;
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

  function render(
    resolveMediaUrl: (assetId: string) => Promise<string | null>,
    onCgLeadInComplete = vi.fn(),
  ) {
    const session: GamePreviewSession = {
      phase: 'story',
      project,
      runtime: startGame(project)!,
    };
    act(() => root.render(
      <GamePreview
        session={session}
        assets={[{
          id: 'cg-image',
          type: 'image',
          displayName: 'Preview CG',
        }]}
        previewUrls={{}}
        resolveMediaUrl={resolveMediaUrl}
        onAdvance={() => {}}
        onCgLeadInComplete={onCgLeadInComplete}
        onVideoComplete={() => {}}
        onChoiceSelect={() => {}}
        onEnterStory={() => {}}
        onExit={() => {}}
      />,
    ));
    return onCgLeadInComplete;
  }

  async function markImageReady() {
    const image = container.querySelector<HTMLImageElement>(
      '.game-preview-cg-layer img',
    );
    if (!image) throw new Error('CG image was not rendered');
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    await act(async () => image.dispatchEvent(new Event('load')));
  }

  it('waits for deferred resolution and decode, then pauses while hidden', async () => {
    const pending = deferred<string | null>();
    const complete = render(() => pending.promise);

    act(() => vi.advanceTimersByTime(3000));
    expect(complete).not.toHaveBeenCalled();
    await act(async () => pending.resolve('blob:preview-cg'));
    act(() => vi.advanceTimersByTime(3000));
    expect(complete).not.toHaveBeenCalled();
    await markImageReady();

    act(() => vi.advanceTimersByTime(400));
    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(3000));
    expect(complete).not.toHaveBeenCalled();
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => vi.advanceTimersByTime(599));
    expect(complete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(complete).toHaveBeenCalledOnce();
  });

  it('stays blocked with a stable error when CG resolution fails', async () => {
    const complete = render(async () => null);
    await act(async () => Promise.resolve());

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('CG 图片无法读取');
    expect(container.querySelector('[aria-label="剧情 CG"]')
      ?.getAttribute('aria-busy')).toBe('false');
    act(() => vi.advanceTimersByTime(3000));
    expect(complete).not.toHaveBeenCalled();
  });
});
