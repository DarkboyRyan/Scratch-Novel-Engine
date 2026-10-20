/**
 * 主要作用：验证页面样式默认值与严格值域守卫。
 * 测试覆盖：标题页/CG 默认契约、边界值、枚举、颜色和精确字段。
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  isCgGalleryStyleDocument,
  isStartScreenStyleDocument,
} from '../src';

describe('page style documents', () => {
  it('publishes valid canonical defaults', () => {
    expect(isStartScreenStyleDocument(DEFAULT_START_SCREEN_STYLE)).toBe(true);
    expect(isCgGalleryStyleDocument(DEFAULT_CG_GALLERY_STYLE)).toBe(true);
    expect(DEFAULT_START_SCREEN_STYLE).toMatchObject({
      surfaceOpacityPercent: 0,
      overlayOpacityPercent: 44,
      layout: 'split-right',
      backgroundFit: 'contain',
    });
    expect(DEFAULT_CG_GALLERY_STYLE).toMatchObject({
      surfaceOpacityPercent: 96,
      overlayOpacityPercent: 88,
      cornerRadiusPx: 12,
      layout: 'framed',
      thumbnailFit: 'contain',
      gapPx: 16,
    });
  });

  it('accepts inclusive numeric boundaries and all enums', () => {
    expect(isStartScreenStyleDocument({
      ...DEFAULT_START_SCREEN_STYLE,
      fontPreset: 'mono',
      fontScalePercent: 75,
      surfaceOpacityPercent: 100,
      overlayOpacityPercent: 0,
      cornerRadiusPx: 48,
      layout: 'center',
      backgroundFit: 'cover',
    })).toBe(true);
    expect(isCgGalleryStyleDocument({
      ...DEFAULT_CG_GALLERY_STYLE,
      fontPreset: 'rounded',
      fontScalePercent: 150,
      surfaceOpacityPercent: 0,
      overlayOpacityPercent: 100,
      cornerRadiusPx: 0,
      layout: 'edge-to-edge',
      thumbnailFit: 'cover',
      gapPx: 32,
    })).toBe(true);
  });

  it('rejects noncanonical colors, out-of-range values, and extra fields', () => {
    for (const style of [
      { ...DEFAULT_START_SCREEN_STYLE, pageColor: '#0b0c0f' },
      { ...DEFAULT_START_SCREEN_STYLE, pageColor: '#FFF' },
      { ...DEFAULT_START_SCREEN_STYLE, fontScalePercent: 74 },
      { ...DEFAULT_START_SCREEN_STYLE, surfaceOpacityPercent: 101 },
      { ...DEFAULT_START_SCREEN_STYLE, cornerRadiusPx: 1.5 },
      { ...DEFAULT_START_SCREEN_STYLE, layout: 'right' },
      { ...DEFAULT_START_SCREEN_STYLE, unexpected: true },
    ]) {
      expect(isStartScreenStyleDocument(style)).toBe(false);
    }

    for (const style of [
      { ...DEFAULT_CG_GALLERY_STYLE, gapPx: -1 },
      { ...DEFAULT_CG_GALLERY_STYLE, gapPx: 33 },
      { ...DEFAULT_CG_GALLERY_STYLE, thumbnailFit: 'fill' },
      { ...DEFAULT_CG_GALLERY_STYLE, layout: 'modal' },
      { ...DEFAULT_CG_GALLERY_STYLE, unexpected: true },
    ]) {
      expect(isCgGalleryStyleDocument(style)).toBe(false);
    }
  });
});
