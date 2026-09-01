/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 character position form controls 的行为。
 * 测试覆盖：`character position form controls`。
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorPanel } from '../../src/renderer/features/form-editor/InspectorPanel';
import type {
  CharacterNode,
  SemanticSceneNode,
} from '../../src/shared/projectTypes';

const character: CharacterNode = {
  id: 'character-1',
  type: 'character',
  mode: 'show',
  assetId: 'portrait-1',
  slot: 'left',
  layer: 2,
  position: { x: 31, y: 87 },
  effect: null,
  scalePercent: 125,
};

function setInputValue(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('character position form controls', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onCharacterChange = vi.fn().mockResolvedValue(undefined);
  const onBackgroundChange = vi.fn().mockResolvedValue(undefined);
  const onImageScaleDraftChange = vi.fn();
  const onImageScaleDraftCommit = vi.fn().mockResolvedValue(true);

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
    onBackgroundChange.mockClear();
    onImageScaleDraftChange.mockClear();
    onImageScaleDraftCommit.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderInspector(
    selectedNode: SemanticSceneNode = character,
    imageScaleDraft = selectedNode.type === 'background' ||
        selectedNode.type === 'character'
      ? String(selectedNode.scalePercent)
      : '100',
    imageScaleDraftInvalid = false,
  ) {
    await act(async () => {
      root.render(
        <InspectorPanel
          selectedNode={selectedNode}
          scenes={[]}
          currentSceneId="scene-1"
          assets={[{ id: 'portrait-1', type: 'image', displayName: '立绘' }]}
          speaker=""
          text=""
          imageScaleDraft={imageScaleDraft}
          imageScaleDraftInvalid={imageScaleDraftInvalid}
          isBusy={false}
          onSpeakerChange={vi.fn()}
          onTextChange={vi.fn()}
          onImageScaleDraftChange={onImageScaleDraftChange}
          onImageScaleDraftCommit={onImageScaleDraftCommit}
          onBackgroundChange={onBackgroundChange}
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
      scalePercent: 125,
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
      scalePercent: 125,
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
      scalePercent: 125,
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
      scalePercent: 125,
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
      scalePercent: 100,
    });
    const imageSelect = container.querySelectorAll('select')[0];

    expect(imageSelect.options[0]?.textContent).toBe('无立绘（清空这一层）');
    expect(container.querySelector('.character-coordinate-fields')).toBeNull();
    expect(container.querySelector('.character-effect-readonly')).toBeNull();
    expect(
      container.querySelector('[aria-label="立绘缩放百分比"]'),
    ).toBeNull();

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
      scalePercent: 100,
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

  it('keeps portrait scale input controlled and delegates its commit', async () => {
    await renderInspector();
    const scaleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘缩放百分比"]',
    );
    expect(scaleInput?.value).toBe('125');

    await act(async () => {
      if (!scaleInput) throw new Error('missing scale input');
      setInputValue(scaleInput, '175');
    });
    expect(onImageScaleDraftChange).toHaveBeenCalledWith('175');

    await renderInspector(character, '175');
    const updatedScaleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘缩放百分比"]',
    );
    await act(async () => {
      if (!updatedScaleInput) throw new Error('missing updated scale input');
      updatedScaleInput.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true }),
      );
      await Promise.resolve();
    });
    expect(onImageScaleDraftCommit).toHaveBeenCalledOnce();
    expect(onCharacterChange).not.toHaveBeenCalled();

    await renderInspector(character, '301', true);
    const invalidScaleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘缩放百分比"]',
    );
    expect(invalidScaleInput?.value).toBe('301');
    expect(invalidScaleInput?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('10');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('300');
  });

  it('lets an image selection consume the focused scale draft without a blur mutation', async () => {
    await renderInspector(character, '175');
    const scaleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="立绘缩放百分比"]',
    );
    const imageSelect = container.querySelector('select');
    if (!scaleInput || !imageSelect) {
      throw new Error('missing portrait image controls');
    }

    await act(async () => {
      scaleInput.focus();
      scaleInput.dispatchEvent(new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget: imageSelect,
      }));
      imageSelect.value = '';
      imageSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onImageScaleDraftCommit).not.toHaveBeenCalled();
    expect(onCharacterChange).toHaveBeenCalledWith({
      assetId: null,
      slot: 'left',
      layer: 2,
      position: { x: 31, y: 87 },
      scalePercent: 125,
    });
  });

  it('updates a background-node scale and resets it when the image is cleared', async () => {
    await renderInspector({
      id: 'background-1',
      type: 'background',
      assetId: 'portrait-1',
      scalePercent: 130,
    });
    const scaleInput = container.querySelector<HTMLInputElement>(
      '[aria-label="背景缩放百分比"]',
    );
    expect(scaleInput?.value).toBe('130');

    await act(async () => {
      if (!scaleInput) throw new Error('missing background scale input');
      setInputValue(scaleInput, '155');
    });
    expect(onImageScaleDraftChange).toHaveBeenCalledWith('155');

    onBackgroundChange.mockClear();
    const imageSelect = container.querySelector('select');
    await act(async () => {
      if (!imageSelect) throw new Error('missing background image select');
      imageSelect.value = '';
      imageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onBackgroundChange).toHaveBeenCalledWith({
      assetId: null,
      scalePercent: 100,
    });
  });
});
