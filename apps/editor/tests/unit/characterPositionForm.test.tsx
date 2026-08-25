/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorPanel } from '../../src/renderer/features/form-editor/InspectorPanel';
import type { CharacterNode } from '../../src/shared/projectTypes';

const character: CharacterNode = {
  id: 'character-1',
  type: 'character',
  assetId: 'portrait-1',
  slot: 'left',
  layer: 2,
  position: { x: 31, y: 87 },
};

describe('character position form controls', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onCharacterChange = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onCharacterChange.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderInspector() {
    await act(async () => {
      root.render(
        <InspectorPanel
          selectedNode={character}
          scenes={[]}
          currentSceneId="scene-1"
          assets={[
            { id: 'portrait-1', type: 'image', displayName: '立绘' },
          ]}
          speaker=""
          text=""
          isBusy={false}
          onSpeakerChange={vi.fn()}
          onTextChange={vi.fn()}
          onBackgroundChange={vi.fn()}
          onCharacterChange={onCharacterChange}
          onSceneJumpChange={vi.fn()}
          onBgmChange={vi.fn()}
          onVideoChange={vi.fn()}
          onDialogueVoiceChange={vi.fn()}
          onInsertDialogue={vi.fn()}
          onInsertCharacter={vi.fn()}
          onInsertBgm={vi.fn()}
          onSubmit={vi.fn()}
        />,
      );
    });
  }

  it('shows custom coordinates below position and updates one coordinate atomically', async () => {
    await renderInspector();

    const positionSelect = container.querySelectorAll('select')[1];
    const xInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘 X 坐标"]',
    );
    const yInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘 Y 坐标"]',
    );
    expect(positionSelect).toBeDefined();
    expect(positionSelect.value).toBe('custom');
    expect(xInput?.value).toBe('31');
    expect(yInput?.value).toBe('87');

    await act(async () => {
      if (!xInput) throw new Error('missing x input');
      xInput.value = '44';
      xInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onCharacterChange).toHaveBeenCalledWith({
      assetId: 'portrait-1',
      slot: 'left',
      layer: 2,
      position: { x: 44, y: 87 },
    });
  });

  it('returns to a named preset and clears the custom coordinates', async () => {
    await renderInspector();
    const selects = container.querySelectorAll('select');
    const positionSelect = selects[1] as HTMLSelectElement;

    await act(async () => {
      positionSelect.value = 'right';
      positionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCharacterChange).toHaveBeenCalledWith({
      assetId: 'portrait-1',
      slot: 'right',
      layer: 2,
      position: null,
    });
  });
});
