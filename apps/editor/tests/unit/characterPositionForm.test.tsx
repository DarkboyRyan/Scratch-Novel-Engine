/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 character position form controls 的行为。
 * 测试覆盖：`character position form controls`。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorPanel } from '../../src/renderer/features/form-editor/InspectorPanel';
import type { CharacterNode } from '../../src/shared/projectTypes';

const character: CharacterNode = {
  id: 'character-1',
  type: 'character',
  mode: 'show',
  assetId: 'portrait-1',
  slot: 'left',
  layer: 2,
  position: { x: 31, y: 87 },
  effect: null,
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

  async function renderInspector(selectedNode: CharacterNode = character) {
    await act(async () => {
      root.render(
        <InspectorPanel
          selectedNode={selectedNode}
          scenes={[]}
          currentSceneId="scene-1"
          assets={[{ id: 'portrait-1', type: 'image', displayName: '立绘' }]}
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

  it('uses the same 80/100 anchor for the right preset and custom position', async () => {
    await renderInspector({
      ...character,
      slot: 'right',
      position: null,
    });
    const xInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘 X 坐标"]',
    );
    const yInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘 Y 坐标"]',
    );

    expect(xInput?.value).toBe('80');
    expect(yInput?.value).toBe('100');

    await act(async () => {
      xInput?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(onCharacterChange).toHaveBeenCalledWith({
      assetId: 'portrait-1',
      slot: 'right',
      layer: 2,
      position: { x: 80, y: 100 },
    });
  });

  it('keeps an unresolved show portrait editable and selects its image as show', async () => {
    await renderInspector({
      ...character,
      assetId: null,
      position: null,
      effect: null,
    });
    const imageSelect = container.querySelectorAll('select')[0];

    expect(imageSelect.value).toBe('');
    expect(imageSelect.options[0]?.textContent).toBe('无');
    expect(
      container.querySelector('.character-coordinate-fields'),
    ).not.toBeNull();

    await act(async () => {
      imageSelect.value = 'portrait-1';
      imageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCharacterChange).toHaveBeenCalledWith({
      mode: 'show',
      assetId: 'portrait-1',
      slot: 'left',
      layer: 2,
      position: null,
    });
  });

  it('hides coordinates for clear and atomically turns it into show when an image is selected', async () => {
    await renderInspector({
      id: 'clear-1',
      type: 'character',
      mode: 'clear',
      assetId: null,
      slot: 'center',
      layer: 3,
      position: null,
      effect: null,
    });
    const imageSelect = container.querySelectorAll('select')[0];

    expect(imageSelect.options[0]?.textContent).toBe('无立绘（清空这一层）');
    expect(container.querySelector('.character-coordinate-fields')).toBeNull();
    expect(container.querySelector('.character-effect-readonly')).toBeNull();

    await act(async () => {
      imageSelect.value = 'portrait-1';
      imageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCharacterChange).toHaveBeenCalledWith({
      mode: 'show',
      assetId: 'portrait-1',
      slot: 'center',
      layer: 3,
      position: null,
    });
  });

  it('summarizes a portrait effect without exposing form edit controls', async () => {
    await renderInspector({
      ...character,
      effect: {
        type: 'slideIn',
        durationMs: 850,
        intensity: 'strong',
        direction: 'right',
      },
    });

    const summary = container.querySelector('.character-effect-readonly');
    expect(summary?.textContent).toContain('人物特效');
    expect(summary?.textContent).toContain('滑入');
    expect(summary?.textContent).toContain('从右侧');
    expect(summary?.textContent).toContain('强烈');
    expect(summary?.textContent).toContain('0.85秒');
    expect(summary?.querySelector('input, select, button')).toBeNull();
  });
});
