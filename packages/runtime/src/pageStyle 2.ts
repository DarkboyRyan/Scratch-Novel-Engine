/**
 * 主要作用：定义标题页与 CG 画廊共用的类型化页面样式契约。
 * 关键实现：默认样式、严格值域守卫和跨 Editor/Player 的稳定 DTO。
 */

export type PageFontPreset = 'system' | 'serif' | 'rounded' | 'mono';
export type PageImageFit = 'contain' | 'cover';
export type StartScreenLayout = 'split-right' | 'split-left' | 'center';
export type CgGalleryLayout = 'framed' | 'edge-to-edge';

type CommonPageStyleDocument = {
  fontPreset: PageFontPreset;
  /** Integer percentage in the inclusive range 75..150. */
  fontScalePercent: number;
  /** Canonical uppercase #RRGGBB colors. */
  pageColor: string;
  textColor: string;
  mutedTextColor: string;
  surfaceColor: string;
  /** Integer percentage in the inclusive range 0..100. */
  surfaceOpacityPercent: number;
  accentColor: string;
  overlayColor: string;
  /** Integer percentage in the inclusive range 0..100. */
  overlayOpacityPercent: number;
  /** Integer pixels in the inclusive range 0..48. */
  cornerRadiusPx: number;
};

export type StartScreenStyleDocument = CommonPageStyleDocument & {
  layout: StartScreenLayout;
  backgroundFit: PageImageFit;
};

export type CgGalleryStyleDocument = CommonPageStyleDocument & {
  layout: CgGalleryLayout;
  thumbnailFit: PageImageFit;
  /** Integer pixels in the inclusive range 0..32. */
  gapPx: number;
};

export const MIN_PAGE_FONT_SCALE_PERCENT = 75;
export const MAX_PAGE_FONT_SCALE_PERCENT = 150;
export const MIN_PAGE_OPACITY_PERCENT = 0;
export const MAX_PAGE_OPACITY_PERCENT = 100;
export const MIN_PAGE_CORNER_RADIUS_PX = 0;
export const MAX_PAGE_CORNER_RADIUS_PX = 48;
export const MIN_CG_GALLERY_GAP_PX = 0;
export const MAX_CG_GALLERY_GAP_PX = 32;

export const DEFAULT_START_SCREEN_STYLE: StartScreenStyleDocument = {
  fontPreset: 'system',
  fontScalePercent: 100,
  pageColor: '#0B0C0F',
  textColor: '#FFFFFF',
  mutedTextColor: '#B8BCC6',
  surfaceColor: '#0C0F14',
  surfaceOpacityPercent: 0,
  accentColor: '#FFFFFF',
  overlayColor: '#040609',
  overlayOpacityPercent: 44,
  cornerRadiusPx: 0,
  layout: 'split-right',
  backgroundFit: 'contain',
};

export const DEFAULT_CG_GALLERY_STYLE: CgGalleryStyleDocument = {
  fontPreset: 'system',
  fontScalePercent: 100,
  pageColor: '#040609',
  textColor: '#F7F8FA',
  mutedTextColor: '#969BA5',
  surfaceColor: '#0C0F14',
  surfaceOpacityPercent: 96,
  accentColor: '#FFFFFF',
  overlayColor: '#040609',
  overlayOpacityPercent: 88,
  cornerRadiusPx: 12,
  layout: 'framed',
  thumbnailFit: 'contain',
  gapPx: 16,
};

const COMMON_STYLE_FIELDS = [
  'fontPreset',
  'fontScalePercent',
  'pageColor',
  'textColor',
  'mutedTextColor',
  'surfaceColor',
  'surfaceOpacityPercent',
  'accentColor',
  'overlayColor',
  'overlayOpacityPercent',
  'cornerRadiusPx',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum;
}

function isCanonicalPageColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/u.test(value);
}

function hasValidCommonStyle(value: Record<string, unknown>): boolean {
  return (
    (value.fontPreset === 'system' ||
      value.fontPreset === 'serif' ||
      value.fontPreset === 'rounded' ||
      value.fontPreset === 'mono') &&
    isIntegerInRange(
      value.fontScalePercent,
      MIN_PAGE_FONT_SCALE_PERCENT,
      MAX_PAGE_FONT_SCALE_PERCENT,
    ) &&
    isCanonicalPageColor(value.pageColor) &&
    isCanonicalPageColor(value.textColor) &&
    isCanonicalPageColor(value.mutedTextColor) &&
    isCanonicalPageColor(value.surfaceColor) &&
    isIntegerInRange(
      value.surfaceOpacityPercent,
      MIN_PAGE_OPACITY_PERCENT,
      MAX_PAGE_OPACITY_PERCENT,
    ) &&
    isCanonicalPageColor(value.accentColor) &&
    isCanonicalPageColor(value.overlayColor) &&
    isIntegerInRange(
      value.overlayOpacityPercent,
      MIN_PAGE_OPACITY_PERCENT,
      MAX_PAGE_OPACITY_PERCENT,
    ) &&
    isIntegerInRange(
      value.cornerRadiusPx,
      MIN_PAGE_CORNER_RADIUS_PX,
      MAX_PAGE_CORNER_RADIUS_PX,
    )
  );
}

export function isStartScreenStyleDocument(
  value: unknown,
): value is StartScreenStyleDocument {
  return isObject(value) &&
    hasExactFields(value, [
      ...COMMON_STYLE_FIELDS,
      'layout',
      'backgroundFit',
    ]) &&
    hasValidCommonStyle(value) &&
    (value.layout === 'split-right' ||
      value.layout === 'split-left' ||
      value.layout === 'center') &&
    (value.backgroundFit === 'contain' || value.backgroundFit === 'cover');
}

export function isCgGalleryStyleDocument(
  value: unknown,
): value is CgGalleryStyleDocument {
  return isObject(value) &&
    hasExactFields(value, [
      ...COMMON_STYLE_FIELDS,
      'layout',
      'thumbnailFit',
      'gapPx',
    ]) &&
    hasValidCommonStyle(value) &&
    (value.layout === 'framed' || value.layout === 'edge-to-edge') &&
    (value.thumbnailFit === 'contain' || value.thumbnailFit === 'cover') &&
    isIntegerInRange(
      value.gapPx,
      MIN_CG_GALLERY_GAP_PX,
      MAX_CG_GALLERY_GAP_PX,
    );
}
