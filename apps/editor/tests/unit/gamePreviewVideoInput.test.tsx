/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 GamePreview video input 的行为。
 * 测试覆盖：`GamePreview video input`。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamePreview } from '../../src/renderer/features/game-preview/GamePreview';
import type { GamePreviewSession } from '../../src/renderer/features/game-preview/useGamePreview';

vi.mock(
  '../../src/renderer/features/game-preview/usePreviewAudio',
  () => ({ usePreviewAudio: vi.fn() }),
);

const session: GamePreviewSession = {
  phase: 'story',
  project: {
    schemaVersion: 1,
    id: 'project-video-input',
    name: 'Video input',
    entrySceneId: 'scene-1',
    startScreen: {
      title: 'Story',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    },
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: null,
        nodes: [],
      },
    ],
  },
  runtime: {
    status: 'playingVideo',
    sceneId: 'scene-1',
    nextNodeIndex: 1,
    backgroundAssetId: null,
    bgmAssetId: null,
    bgmSequence: 0,
    dialogueSequence: 0,
    characterEffectSequence: 0,
    videoAssetId: 'asset-video',
    videoSequence: 1,
    cgAssetId: null,
    cgLeadInMs: 0,
    cgSequence: 0,
    characters: [],
    dialogue: null,
    choices: [],
    variables: {},
    loopStack: [],
  },
};

describe('GamePreview video input', () => {
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
    vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('skips only on a non-repeated Enter press while video is blocking', async () => {
    const onAdvance = vi.fn();
    const onVideoComplete = vi.fn();
    const onExit = vi.fn();
    const resolveMediaUrl = vi.fn().mockResolvedValue(
      'vn-asset://video/token/asset-token',
    );

    await act(async () => {
      root.render(
        <GamePreview
          session={session}
          assets={[]}
          previewUrls={{}}
          resolveMediaUrl={resolveMediaUrl}
          onAdvance={onAdvance}
          onVideoComplete={onVideoComplete}
          onChoiceSelect={vi.fn()}
          onEnterStory={vi.fn()}
          onExit={onExit}
        />,
      );
    });

    const video = container.querySelector('video');
    expect(video).not.toBeNull();

    await act(async () => {
      video?.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0 }),
      );
      video?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: ' ' }),
      );
    });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onVideoComplete).not.toHaveBeenCalled();

    await act(async () => {
      video?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
      );
    });
    expect(onVideoComplete).toHaveBeenCalledOnce();

    await act(async () => {
      video?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
          repeat: true,
        }),
      );
    });
    expect(onVideoComplete).toHaveBeenCalledOnce();

    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    await act(async () => {
      video?.dispatchEvent(escapeEvent);
    });
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
    expect(onVideoComplete).toHaveBeenCalledOnce();
  });
});
