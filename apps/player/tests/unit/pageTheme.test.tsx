/** @vitest-environment jsdom */
/**
 * 主要作用：验证页面主题只通过受控变量和布局枚举进入共享 UI。
 * 测试覆盖：默认回退、高对比色、Title/CG DOM 接线与非法 CSS 隔离。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  CgGallery,
  TitleScreen,
  createCgGalleryThemePresentation,
  createStartScreenThemePresentation,
  readableForegroundColor,
} from '@vnengine/player-ui';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  type StartScreenStyleDocument,
} from '@vnengine/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('typed Player page themes', () => {
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

  it('derives readable accent and focus colors without accepting CSS text', () => {
    expect(readableForegroundColor('#FFFFFF')).toBe('#000000');
    expect(readableForegroundColor('#000000')).toBe('#FFFFFF');

    const custom: StartScreenStyleDocument = {
      ...DEFAULT_START_SCREEN_STYLE,
      fontPreset: 'serif',
      fontScalePercent: 125,
      pageColor: '#FFFFFF',
      surfaceColor: '#123456',
      surfaceOpacityPercent: 70,
      accentColor: '#000000',
      layout: 'split-left',
      backgroundFit: 'cover',
    };
    const presentation = createStartScreenThemePresentation(custom);

    expect(presentation.layout).toBe('split-left');
    expect(presentation.backgroundFit).toBe('cover');
    expect(presentation.style['--player-title-font-scale']).toBe('125%');
    expect(presentation.style['--player-title-surface-color']).toBe(
      'rgb(18 52 86 / 0.7)',
    );
    expect(presentation.style['--player-title-accent-foreground']).toBe(
      '#FFFFFF',
    );
    expect(presentation.style['--player-title-focus-color']).toBe('#000000');
    expect(presentation.style['--player-title-card-border-width']).toBe('1px');

    const untrusted = {
      ...custom,
      pageColor: 'red; background: url(https://invalid.example)',
    } as unknown as StartScreenStyleDocument;
    const fallback = createStartScreenThemePresentation(untrusted);
    expect(fallback.style['--player-title-page-color']).toBe(
      DEFAULT_START_SCREEN_STYLE.pageColor,
    );
    expect(JSON.stringify(fallback.style)).not.toContain('url(');
  });

  it('keeps the established neutral title palette at the typed defaults', () => {
    const presentation = createStartScreenThemePresentation(
      DEFAULT_START_SCREEN_STYLE,
    );

    expect(presentation.style['--player-title-secondary-color']).toBe(
      'rgb(8 10 13 / 0.46)',
    );
    expect(
      presentation.style['--player-title-secondary-hover-color'],
    ).toBe('rgb(25 28 33 / 0.72)');
    expect(presentation.style['--player-title-action-text-color']).toBe(
      'rgb(255 255 255 / 0.92)',
    );
    expect(presentation.style['--player-title-accent-foreground']).toBe(
      '#13161B',
    );
    expect(presentation.style['--player-title-card-border-width']).toBe('0');
    expect(presentation.style['--player-title-card-shadow']).toBe('none');
  });

  it('maps CG layout, fit, gap and high-contrast controls independently', () => {
    const presentation = createCgGalleryThemePresentation({
      ...DEFAULT_CG_GALLERY_STYLE,
      fontPreset: 'mono',
      fontScalePercent: 90,
      surfaceColor: '#F0F0F0',
      accentColor: '#FFFF00',
      layout: 'edge-to-edge',
      thumbnailFit: 'cover',
      gapPx: 31,
    });

    expect(presentation.layout).toBe('edge-to-edge');
    expect(presentation.thumbnailFit).toBe('cover');
    expect(presentation.style['--player-cg-gap']).toBe('31px');
    expect(presentation.style['--player-cg-responsive-gap']).toBe(
      'clamp(15.5px, 2.7125vw, 31px)',
    );
    expect(presentation.style['--player-cg-thumbnail-fit']).toBe('cover');
    expect(presentation.style['--player-cg-accent-foreground']).toBe(
      '#000000',
    );
    expect(presentation.style['--player-cg-focus-color']).toBe('#000000');
  });

  it('keeps the established framed CG geometry and neutral surfaces by default', () => {
    const presentation = createCgGalleryThemePresentation(
      DEFAULT_CG_GALLERY_STYLE,
    );

    expect(presentation.style['--player-cg-surface-color']).toBe(
      'rgb(12 15 20 / 0.96)',
    );
    expect(presentation.style['--player-cg-control-color']).toBe(
      'rgb(8 10 13 / 0.46)',
    );
    expect(presentation.style['--player-cg-control-hover-color']).toBe(
      'rgb(25 28 33 / 0.86)',
    );
    expect(presentation.style['--player-cg-thumbnail-color']).toBe(
      '#080A0D',
    );
    expect(presentation.style['--player-cg-lightbox-color']).toBe(
      'rgb(2 3 5 / 0.96)',
    );
    expect(presentation.style['--player-cg-responsive-gap']).toBe(
      'clamp(8px, 1.4vw, 16px)',
    );
  });

  it('places only typed variables and enum attributes on Title and CG roots', async () => {
    const startStyle = {
      ...DEFAULT_START_SCREEN_STYLE,
      layout: 'center' as const,
      backgroundFit: 'cover' as const,
      accentColor: '#112233',
    };
    await act(async () => root.render(
      <TitleScreen
        startScreen={{
          title: 'Themed title',
          eyebrow: 'THEME',
          backgroundAssetId: null,
          musicAssetId: null,
          style: startStyle,
        }}
        resolveMediaUrl={vi.fn(async () => null)}
        onStart={vi.fn()}
        onExit={vi.fn()}
      />,
    ));

    const title = container.querySelector<HTMLElement>('.player-title-page');
    expect(title?.dataset.playerTitleLayout).toBe('center');
    expect(title?.dataset.playerTitleBackgroundFit).toBe('cover');
    expect(title?.style.getPropertyValue('--player-title-accent-color')).toBe(
      '#112233',
    );
    expect(title?.querySelector('style')).toBeNull();

    await act(async () => root.render(
      <CgGallery
        pages={[]}
        galleryStyle={{
          ...DEFAULT_CG_GALLERY_STYLE,
          layout: 'edge-to-edge',
          thumbnailFit: 'cover',
          gapPx: 5,
        }}
        resolveMediaUrl={vi.fn(async () => null)}
        onClose={vi.fn()}
      />,
    ));

    const gallery = container.querySelector<HTMLElement>(
      '.player-cg-gallery-layer',
    );
    expect(gallery?.dataset.playerCgLayout).toBe('edge-to-edge');
    expect(gallery?.dataset.playerCgThumbnailFit).toBe('cover');
    expect(gallery?.style.getPropertyValue('--player-cg-gap')).toBe('5px');
    expect(gallery?.querySelector('style')).toBeNull();
  });
});
