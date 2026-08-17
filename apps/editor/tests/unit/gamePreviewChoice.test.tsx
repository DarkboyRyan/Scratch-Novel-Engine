/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamePreview } from '../../src/renderer/features/game-preview/GamePreview';
import type { GamePreviewSession } from '../../src/renderer/features/game-preview/useGamePreview';

vi.mock(
  '../../src/renderer/features/game-preview/usePreviewAudio',
  () => ({ usePreviewAudio: vi.fn() }),
);

const options = [
  { id: 'option-a', text: '调查教室', targetSceneId: 'scene-a' },
  { id: 'option-b', text: '前往天台', targetSceneId: 'scene-b' },
  { id: 'option-c', text: '留在原地', targetSceneId: 'scene-c' },
];

const session: GamePreviewSession = {
  project: {
    schemaVersion: 1,
    id: 'project-choice-input',
    name: 'Choice input',
    entrySceneId: 'scene-entry',
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [{ id: 'choice-1', type: 'choice', options }],
      },
      ...options.map((option) => ({
        schemaVersion: 1 as const,
        id: option.targetSceneId,
        name: option.text,
        backgroundAssetId: null,
        nodes: [],
      })),
    ],
  },
  runtime: {
    status: 'choosing',
    sceneId: 'scene-entry',
    nextNodeIndex: 1,
    backgroundAssetId: null,
    bgmAssetId: 'theme',
    bgmSequence: 1,
    dialogueSequence: 2,
    videoAssetId: null,
    videoSequence: 0,
    characters: [],
    dialogue: null,
    choices: options,
  },
};

describe('GamePreview choices', () => {
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
    vi.restoreAllMocks();
  });

  it('renders one fixed-size rectangular button per option and selects by ID', async () => {
    const onAdvance = vi.fn();
    const onChoiceSelect = vi.fn();
    const onExit = vi.fn();

    await act(async () => {
      root.render(
        <GamePreview
          session={session}
          assets={[]}
          previewUrls={{}}
          resolveMediaUrl={async () => null}
          onAdvance={onAdvance}
          onVideoComplete={vi.fn()}
          onChoiceSelect={onChoiceSelect}
          onExit={onExit}
        />,
      );
    });

    const list = container.querySelector('.game-preview-choice-list');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(
      '.game-preview-choice-button',
    )];
    expect(list?.getAttribute('role')).toBe('group');
    expect(buttons.map((button) => button.textContent)).toEqual(
      options.map((option) => option.text),
    );
    expect(buttons.every((button) => button.style.height === '')).toBe(true);

    await act(async () => buttons[1].click());
    expect(onChoiceSelect).toHaveBeenCalledOnce();
    expect(onChoiceSelect).toHaveBeenCalledWith('option-b');
    expect(onAdvance).not.toHaveBeenCalled();

    const stage = container.querySelector('.game-preview-stage');
    await act(async () => {
      stage?.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0 }),
      );
    });
    expect(onAdvance).not.toHaveBeenCalled();

    const escape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    await act(async () => buttons[0].dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
  });
});
