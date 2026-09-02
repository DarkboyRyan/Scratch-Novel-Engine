/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 Editor character effect previews 的行为。
 * 测试覆盖：`Editor character effect previews`。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  startGame,
  type ProjectDocument,
} from '@vnengine/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewPanel } from '../../src/renderer/components/PreviewPanel';
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
  id: 'preview-character-effect',
  name: 'Preview character effect',
  entrySceneId: 'entry',
  startScreen: {
    style: DEFAULT_START_SCREEN_STYLE,
    title: '',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    style: DEFAULT_CG_GALLERY_STYLE,
    pages: [{ imageAssetIds: Array(9).fill(null) }],
  },
  scenes: [{
    schemaVersion: 1,
    id: 'entry',
    name: 'Entry',
    backgroundAssetId: 'room',
    backgroundScalePercent: 75,
    nodes: [
      {
        id: 'hero-effect',
        type: 'character',
        assetId: 'hero',
        slot: 'right',
        layer: 2,
        position: { x: 75, y: 90 },
        effect: { type: 'jump', durationMs: 650, intensity: 'normal' },
        scalePercent: 135,
      },
      {
        id: 'line',
        type: 'dialogue',
        speaker: 'Hero',
        text: 'The effect starts with this line.',
        voiceAssetId: null,
      },
    ],
  }],
};

describe('Editor character effect previews', () => {
  let container: HTMLDivElement;
  let root: Root;
  let hidden = false;
  let hiddenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
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
    hidden = false;
  });

  it('waits for the portrait to decode, then animates and pauses while hidden', async () => {
    const session: GamePreviewSession = {
      phase: 'story',
      project,
      runtime: startGame(project)!,
    };
    act(() => root.render(
      <GamePreview
        session={session}
        assets={[
          { id: 'hero', type: 'image', displayName: 'Hero' },
          { id: 'room', type: 'image', displayName: 'Room' },
        ]}
        previewUrls={{ hero: 'blob:hero', room: 'blob:room' }}
        resolveMediaUrl={async () => null}
        onAdvance={() => {}}
        onVideoComplete={() => {}}
        onChoiceSelect={() => {}}
        onEnterStory={() => {}}
        onExit={() => {}}
      />,
    ));

    expect(container.querySelector('.dialogue-box')?.textContent)
      .toContain('The effect starts with this line.');
    expect(
      container.querySelector<HTMLImageElement>('.preview-background')
        ?.dataset.scalePercent,
    ).toBe('75');
    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    let finishDecode!: () => void;
    const decode = new Promise<void>((resolve) => {
      finishDecode = resolve;
    });
    Object.defineProperty(image, 'decode', {
      configurable: true,
      value: () => decode,
    });
    act(() => image.dispatchEvent(new Event('load')));
    expect(image.dataset.characterImageStatus).toBe('loading');
    expect(container.querySelector('.preview-character-effect-jump'))
      .toBeNull();

    await act(async () => {
      finishDecode();
      await decode;
    });
    expect(image.dataset.characterImageStatus).toBe('ready');
    expect(container.querySelector('.preview-character-effect-jump'))
      .not.toBeNull();
    expect(container.querySelector('.preview-character-anchor')
      ?.getAttribute('style')).toContain('translate(-50%, -100%)');
    expect(
      container.querySelector<HTMLElement>('.preview-character-scale')
        ?.dataset.scalePercent,
    ).toBe('135');

    hidden = true;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.querySelector('.preview-stage')
      ?.getAttribute('data-character-animations-paused')).toBe('true');
    hidden = false;
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(container.querySelector('.preview-stage')
      ?.hasAttribute('data-character-animations-paused')).toBe(false);
  });

  it('keeps the form preview static at the final state', async () => {
    act(() => root.render(
      <PreviewPanel
        speaker="Hero"
        text="Static"
        backgroundUrl="blob:room"
        backgroundName="Room"
        backgroundScalePercent={80}
        characters={[{
          id: 'fade-out',
          url: 'blob:hero',
          name: 'Hero',
          slot: 'center',
          layer: 1,
          position: null,
          scalePercent: 150,
          opacity: 0,
          effect: { type: 'fadeOut', durationMs: 500 },
          effectSequence: 1,
        }]}
      />,
    ));
    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    await act(async () => {
      image.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
    expect(image.classList.contains('preview-character-effect')).toBe(false);
    expect(image.style.opacity).toBe('0');
    const scaleLayer = container.querySelector<HTMLElement>(
      '.preview-character-scale',
    );
    expect(scaleLayer?.dataset.scalePercent).toBe('150');
    expect(scaleLayer?.style.transform).toBe('scale(1.5)');
    const background = container.querySelector<HTMLImageElement>(
      '.preview-background',
    );
    expect(background?.dataset.scalePercent).toBe('80');
    expect(background?.style.transform).toBe('scale(0.8)');
  });

  it.each([10, 100, 300])(
    'renders the canonical %i%% background and portrait scale boundary',
    (scalePercent) => {
      act(() => root.render(
        <PreviewPanel
          speaker=""
          text=""
          backgroundUrl="blob:room"
          backgroundName="Room"
          backgroundScalePercent={scalePercent}
          characters={[{
            id: `portrait-${scalePercent}`,
            url: 'blob:hero',
            name: 'Hero',
            slot: 'center',
            layer: 1,
            position: null,
            scalePercent,
            opacity: 1,
            effect: null,
            effectSequence: 0,
          }]}
        />,
      ));

      expect(
        container.querySelector<HTMLImageElement>('.preview-background')
          ?.dataset.scalePercent,
      ).toBe(String(scalePercent));
      expect(
        container.querySelector<HTMLElement>('.preview-character-scale')
          ?.dataset.scalePercent,
      ).toBe(String(scalePercent));
    },
  );

  it('defines reduced-motion and pause CSS for the Editor preview', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'src/renderer/styles/editor.css'),
      'utf8',
    );
    expect(css).toMatch(
      /data-character-animations-paused="true"[\s\S]*animation-play-state:\s*paused/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/,
    );
    expect(css).toMatch(
      /\.preview-character-image\s*\{[\s\S]*transform-origin:\s*center bottom/,
    );
  });
});
