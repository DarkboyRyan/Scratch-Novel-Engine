/** @vitest-environment jsdom */
/**
 * 主要作用：验证立绘特效样式变量、重播、暂停和动画契约。
 * 关键函数与实现：测试套件“VisualStage character effects”、`character`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act, useLayoutEffect } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VisualStage, type PreviewCharacter } from '@vnengine/player-ui';

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

const character: PreviewCharacter = {
  id: 'hero-node',
  url: 'blob:hero',
  name: 'Hero',
  slot: 'center',
  layer: 2,
  position: { x: 42, y: 91 },
  opacity: 1,
  effect: {
    type: 'slideIn',
    durationMs: 850,
    intensity: 'strong',
    direction: 'left',
  },
  effectSequence: 3,
};

describe('VisualStage character effects', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(
    current: PreviewCharacter,
    options: { animate?: boolean; paused?: boolean } = {},
  ) {
    act(() => root.render(
      <VisualStage
        speaker="Hero"
        text="Hello"
        backgroundUrl={null}
        backgroundName={null}
        characters={[current]}
        animateCharacters={options.animate}
        animationsPaused={options.paused}
      />,
    ));
  }

  async function loadImage(image?: HTMLImageElement | null) {
    expect(image).not.toBeNull();
    await act(async () => {
      image!.dispatchEvent(new Event('load'));
      await Promise.resolve();
    });
  }

  it('starts the effect only after the image can be displayed', async () => {
    render(character, { animate: true, paused: true });

    const stage = container.querySelector('.preview-stage')!;
    const anchor = container.querySelector<HTMLElement>(
      '.preview-character-anchor',
    )!;
    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    expect(stage.getAttribute('data-character-animations-paused')).toBe('true');
    expect(anchor.style.left).toBe('42%');
    expect(anchor.style.top).toBe('91%');
    expect(anchor.style.transform).toBe('translate(-50%, -100%)');
    expect(image.dataset.characterImageStatus).toBe('loading');
    expect(image.style.visibility).toBe('hidden');
    expect(image.classList.contains('preview-character-effect')).toBe(false);

    await loadImage(image);

    expect(image.dataset.characterImageStatus).toBe('ready');
    expect(image.style.visibility).toBe('');
    expect(image.classList.contains('preview-character-effect-slideIn'))
      .toBe(true);
    expect(image.style.getPropertyValue('--character-effect-duration'))
      .toBe('850ms');
    expect(image.style.getPropertyValue('--character-slide-x')).toBe('-25%');
    expect(image.getAttribute('data-effect-sequence')).toBe('3');
  });

  it('remounts and reload-gates the animation image for a replay sequence', async () => {
    render(character, { animate: true });
    const first = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    );
    await loadImage(first);
    expect(first?.classList.contains('preview-character-effect')).toBe(true);

    render({ ...character, effectSequence: 4 }, { animate: true });
    const replay = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    );
    expect(replay).not.toBe(first);
    expect(replay?.getAttribute('data-effect-sequence')).toBe('4');
    expect(replay?.classList.contains('preview-character-effect')).toBe(false);
    await loadImage(replay);
    expect(replay?.classList.contains('preview-character-effect')).toBe(true);
  });

  it('starts a cached portrait after decode without waiting for another load event', async () => {
    const prototype = HTMLImageElement.prototype;
    const completeDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      'complete',
    );
    const naturalWidthDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      'naturalWidth',
    );
    const decodeDescriptor = Object.getOwnPropertyDescriptor(prototype, 'decode');
    Object.defineProperties(prototype, {
      complete: { configurable: true, get: () => true },
      naturalWidth: { configurable: true, get: () => 1280 },
      decode: { configurable: true, value: () => Promise.resolve() },
    });

    try {
      await act(async () => {
        root.render(
          <VisualStage
            speaker="Hero"
            text="Cached"
            backgroundUrl={null}
            backgroundName={null}
            characters={[character]}
            animateCharacters
          />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
    } finally {
      for (const [name, descriptor] of [
        ['complete', completeDescriptor],
        ['naturalWidth', naturalWidthDescriptor],
        ['decode', decodeDescriptor],
      ] as const) {
        if (descriptor === undefined) {
          delete (prototype as unknown as Record<string, unknown>)[name];
        } else {
          Object.defineProperty(prototype, name, descriptor);
        }
      }
    }

    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    expect(image.dataset.characterImageStatus).toBe('ready');
    expect(image.classList.contains('preview-character-effect-slideIn'))
      .toBe(true);
  });

  it('accepts load and decode completion before passive effects run', async () => {
    function FirstCommitLoadHarness() {
      useLayoutEffect(() => {
        const image = container.querySelector<HTMLImageElement>(
          '.preview-character-image',
        )!;
        Object.defineProperty(image, 'decode', {
          configurable: true,
          value: () => ({
            then(onFulfilled: () => void) {
              onFulfilled();
              return Promise.resolve();
            },
          }) as Promise<void>,
        });
        image.dispatchEvent(new Event('load'));
      }, []);
      return (
        <VisualStage
          speaker="Hero"
          text="First commit"
          backgroundUrl={null}
          backgroundName={null}
          characters={[character]}
          animateCharacters
        />
      );
    }

    await act(async () => root.render(<FirstCommitLoadHarness />));

    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    expect(image.complete).toBe(false);
    expect(image.dataset.characterImageStatus).toBe('ready');
    expect(image.classList.contains('preview-character-effect-slideIn'))
      .toBe(true);
  });

  it('waits for decode before starting and hides failed images', async () => {
    render(character, { animate: true });
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
    expect(image.classList.contains('preview-character-effect')).toBe(false);

    await act(async () => {
      finishDecode();
      await decode;
    });
    expect(image.dataset.characterImageStatus).toBe('ready');
    expect(image.classList.contains('preview-character-effect')).toBe(true);

    render({ ...character, url: 'blob:broken', effectSequence: 4 }, {
      animate: true,
    });
    const broken = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    act(() => broken.dispatchEvent(new Event('error')));
    expect(container.querySelector('.preview-character-image')).toBeNull();
  });

  it('renders static previews directly at final opacity after loading', async () => {
    render({
      ...character,
      opacity: 0,
      effect: { type: 'fadeOut', durationMs: 500 },
    });
    const image = container.querySelector<HTMLImageElement>(
      '.preview-character-image',
    )!;
    await loadImage(image);
    expect(image.classList.contains('preview-character-effect')).toBe(false);
    expect(image.style.opacity).toBe('0');
  });

  it('defines paused and reduced-motion fallbacks in the Player stylesheet', () => {
    const css = readFileSync(
      path.resolve(process.cwd(), 'src/renderer/styles/player.css'),
      'utf8',
    );
    expect(css).toMatch(
      /data-character-animations-paused="true"[\s\S]*animation-play-state:\s*paused/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.preview-character-effect[\s\S]*animation:\s*none/,
    );
    expect(css).toMatch(
      /\.preview-character-image\s*\{[\s\S]*transform-origin:\s*center bottom/,
    );
  });
});
