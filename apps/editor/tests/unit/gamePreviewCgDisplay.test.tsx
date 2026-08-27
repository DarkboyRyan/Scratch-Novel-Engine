/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Editor formal preview CG lead-in 的行为。
 * 测试覆盖：`Editor formal preview CG lead-in`。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  completeCgLeadIn,
  startGame,
  type ProjectDocument,
} from '@vnengine/runtime';
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
    onExit = vi.fn(),
  ) {
    function Harness() {
      const [runtime, setRuntime] = useState(() => startGame(project)!);
      const session: GamePreviewSession = {
        phase: 'story',
        project,
        runtime,
      };
      return (
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
          onCgLeadInComplete={() => {
            onCgLeadInComplete();
            setRuntime((current) => completeCgLeadIn(project, current));
          }}
          onVideoComplete={() => {}}
          onChoiceSelect={() => {}}
          onEnterStory={() => {}}
          onExit={onExit}
        />
      );
    }
    act(() => root.render(<Harness />));
    return { complete: onCgLeadInComplete, exit: onExit };
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
    const { complete, exit } = render(() => pending.promise);
    const overlay = container.querySelector('.game-preview-overlay');
    const stage = container.querySelector('.game-preview-stage');

    expect(overlay).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(container.querySelector('.dialogue-box')).toBeNull();

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
    expect(container.querySelector('.dialogue-box')?.textContent)
      .toContain('Line');
    expect(container.querySelector('.game-preview-cg-layer img')).not.toBeNull();
    expect(container.querySelector('.game-preview-overlay')).toBe(overlay);
    expect(container.querySelector('.game-preview-stage')).toBe(stage);

    const exitButton = container.querySelector<HTMLButtonElement>(
      '.game-preview-exit',
    );
    expect(exitButton?.disabled).toBe(false);
    act(() => exitButton?.click());
    expect(exit).toHaveBeenCalledOnce();
  });

  it('stays blocked with a stable error when CG resolution fails', async () => {
    const { complete } = render(async () => null);
    await act(async () => Promise.resolve());

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('CG 图片无法读取');
    expect(container.querySelector('[aria-label="剧情 CG"]')
      ?.getAttribute('aria-busy')).toBe('false');
    act(() => vi.advanceTimersByTime(3000));
    expect(complete).not.toHaveBeenCalled();
  });

  it('keeps the stage controls above the non-interactive CG surface', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );
    const cgRule = css.match(/\.game-preview-cg-layer\s*\{([^}]*)\}/s)?.[1]
      ?? '';
    const dialogueRule = css.match(/\.dialogue-box\s*\{([^}]*)\}/s)?.[1]
      ?? '';
    const exitRule = css.match(/\.game-preview-exit\s*\{([^}]*)\}/s)?.[1]
      ?? '';

    expect(cgRule).toContain('z-index: 20');
    expect(cgRule).toContain('pointer-events: none');
    expect(dialogueRule).toContain('z-index: 30');
    expect(exitRule).toContain('z-index: 1040');
  });
});
