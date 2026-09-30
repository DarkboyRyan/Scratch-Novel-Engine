/**
 * 主要作用：把严格的页面样式 DTO 转换为 Player UI 可消费的安全 CSS 变量。
 * 关键实现：默认回退、颜色合成、高对比前景色和受控布局属性。
 */
import type { CSSProperties } from 'react';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  isCgGalleryStyleDocument,
  isStartScreenStyleDocument,
  type CgGalleryLayout,
  type CgGalleryStyleDocument,
  type PageFontPreset,
  type PageImageFit,
  type StartScreenLayout,
  type StartScreenStyleDocument,
} from '@vnengine/runtime';

type PlayerThemeCssProperties = CSSProperties & {
  [name: `--player-${string}`]: string | number;
};

export type StartScreenThemePresentation = {
  style: PlayerThemeCssProperties;
  layout: StartScreenLayout;
  backgroundFit: PageImageFit;
};

export type CgGalleryThemePresentation = {
  style: PlayerThemeCssProperties;
  layout: CgGalleryLayout;
  thumbnailFit: PageImageFit;
};

type Rgb = readonly [red: number, green: number, blue: number];

const PAGE_FONT_FAMILIES: Record<PageFontPreset, string> = {
  system:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif:
    'Georgia, "Times New Roman", "Noto Serif CJK SC", "Songti SC", serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", system-ui, sans-serif',
  mono:
    'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
};

function hexRgb(color: string): Rgb {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

function rgba(color: string, opacityPercent: number): string {
  const [red, green, blue] = hexRgb(color);
  const alpha = Math.max(0, Math.min(100, opacityPercent)) / 100;
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}

function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = hexRgb(color);
  return (
    (0.2126 * linearChannel(red)) +
    (0.7152 * linearChannel(green)) +
    (0.0722 * linearChannel(blue))
  );
}

/** Selects black or white, whichever has the stronger WCAG contrast. */
export function readableForegroundColor(backgroundColor: string): '#000000' | '#FFFFFF' {
  return relativeLuminance(backgroundColor) > 0.179
    ? '#000000'
    : '#FFFFFF';
}

function oppositeMonochrome(color: '#000000' | '#FFFFFF'): '#000000' | '#FFFFFF' {
  return color === '#000000' ? '#FFFFFF' : '#000000';
}

function startScreenStyleOrDefault(
  style: StartScreenStyleDocument | null | undefined,
): StartScreenStyleDocument {
  return isStartScreenStyleDocument(style)
    ? style
    : DEFAULT_START_SCREEN_STYLE;
}

function cgGalleryStyleOrDefault(
  style: CgGalleryStyleDocument | null | undefined,
): CgGalleryStyleDocument {
  return isCgGalleryStyleDocument(style)
    ? style
    : DEFAULT_CG_GALLERY_STYLE;
}

/**
 * Only validated values or built-in defaults reach CSS. No persisted value is
 * interpreted as a selector, declaration, URL, font stack, or arbitrary CSS.
 */
export function createStartScreenThemePresentation(
  input: StartScreenStyleDocument | null | undefined,
): StartScreenThemePresentation {
  const theme = startScreenStyleOrDefault(input);
  const focusColor = readableForegroundColor(theme.pageColor);
  const secondaryOpacity = Math.max(46, theme.surfaceOpacityPercent);
  const usesLegacyNeutralPalette =
    theme.pageColor === DEFAULT_START_SCREEN_STYLE.pageColor &&
    theme.textColor === DEFAULT_START_SCREEN_STYLE.textColor &&
    theme.mutedTextColor === DEFAULT_START_SCREEN_STYLE.mutedTextColor &&
    theme.surfaceColor === DEFAULT_START_SCREEN_STYLE.surfaceColor &&
    theme.accentColor === DEFAULT_START_SCREEN_STYLE.accentColor &&
    theme.overlayColor === DEFAULT_START_SCREEN_STYLE.overlayColor;
  const secondaryColor = usesLegacyNeutralPalette
    ? '#080A0D'
    : theme.surfaceColor;
  const secondaryHoverColor = usesLegacyNeutralPalette
    ? '#191C21'
    : theme.surfaceColor;
  const accentForeground = usesLegacyNeutralPalette
    ? '#13161B'
    : readableForegroundColor(theme.accentColor);
  return {
    layout: theme.layout,
    backgroundFit: theme.backgroundFit,
    style: {
      '--player-title-font-family': PAGE_FONT_FAMILIES[theme.fontPreset],
      '--player-title-font-scale': `${theme.fontScalePercent}%`,
      '--player-title-page-color': theme.pageColor,
      '--player-title-text-color': theme.textColor,
      '--player-title-muted-text-color': usesLegacyNeutralPalette
        ? rgba('#FFFFFF', 72)
        : theme.mutedTextColor,
      '--player-title-action-text-color': usesLegacyNeutralPalette
        ? rgba('#FFFFFF', 92)
        : theme.textColor,
      '--player-title-surface-color': rgba(
        theme.surfaceColor,
        theme.surfaceOpacityPercent,
      ),
      '--player-title-secondary-color': rgba(
        secondaryColor,
        secondaryOpacity,
      ),
      '--player-title-secondary-hover-color': rgba(
        secondaryHoverColor,
        Math.min(100, secondaryOpacity + 26),
      ),
      '--player-title-accent-color': theme.accentColor,
      '--player-title-accent-surface-color': rgba(theme.accentColor, 94),
      '--player-title-accent-border-color': rgba(theme.accentColor, 88),
      '--player-title-accent-foreground': accentForeground,
      '--player-title-overlay-strong': rgba(
        theme.overlayColor,
        theme.overlayOpacityPercent,
      ),
      '--player-title-overlay-soft': rgba(
        theme.overlayColor,
        Math.round(theme.overlayOpacityPercent * (12 / 44)),
      ),
      '--player-title-overlay-bottom': rgba(
        theme.overlayColor,
        Math.round(theme.overlayOpacityPercent * (32 / 44)),
      ),
      '--player-title-border-color': rgba(theme.textColor, 28),
      '--player-title-border-hover-color': rgba(theme.textColor, 52),
      '--player-title-card-border-width': theme.surfaceOpacityPercent === 0
        ? '0'
        : '1px',
      '--player-title-card-border-color': theme.surfaceOpacityPercent === 0
        ? 'transparent'
        : rgba(theme.textColor, 20),
      '--player-title-card-shadow': theme.surfaceOpacityPercent === 0
        ? 'none'
        : '0 24px 72px rgb(0 0 0 / 0.48)',
      '--player-title-corner-radius': `${theme.cornerRadiusPx}px`,
      '--player-title-background-fit': theme.backgroundFit,
      '--player-title-focus-color': focusColor,
      '--player-title-focus-halo-color': oppositeMonochrome(focusColor),
    },
  };
}

/** Converts a validated CG theme into scoped variables and enum attributes. */
export function createCgGalleryThemePresentation(
  input: CgGalleryStyleDocument | null | undefined,
): CgGalleryThemePresentation {
  const theme = cgGalleryStyleOrDefault(input);
  const accentForeground = readableForegroundColor(theme.accentColor);
  const focusColor = readableForegroundColor(theme.surfaceColor);
  const usesDefaultNeutralPalette =
    theme.pageColor === DEFAULT_CG_GALLERY_STYLE.pageColor &&
    theme.surfaceColor === DEFAULT_CG_GALLERY_STYLE.surfaceColor &&
    theme.textColor === DEFAULT_CG_GALLERY_STYLE.textColor &&
    theme.accentColor === DEFAULT_CG_GALLERY_STYLE.accentColor;
  const controlColor = usesDefaultNeutralPalette
    ? '#080A0D'
    : theme.surfaceColor;
  const thumbnailColor = usesDefaultNeutralPalette
    ? '#080A0D'
    : theme.pageColor;
  const controlHoverColor = usesDefaultNeutralPalette
    ? '#191C21'
    : theme.surfaceColor;
  const lightboxColor = usesDefaultNeutralPalette
    ? '#020305'
    : theme.pageColor;
  const responsiveGap = theme.gapPx === 0
    ? '0px'
    : `clamp(${theme.gapPx / 2}px, ${Number(
      (theme.gapPx * 0.0875).toFixed(4),
    )}vw, ${theme.gapPx}px)`;
  return {
    layout: theme.layout,
    thumbnailFit: theme.thumbnailFit,
    style: {
      '--player-cg-font-family': PAGE_FONT_FAMILIES[theme.fontPreset],
      '--player-cg-font-scale': `${theme.fontScalePercent}%`,
      '--player-cg-page-color': theme.pageColor,
      '--player-cg-text-color': theme.textColor,
      '--player-cg-muted-text-color': theme.mutedTextColor,
      '--player-cg-surface-color': rgba(
        theme.surfaceColor,
        theme.surfaceOpacityPercent,
      ),
      '--player-cg-accent-color': theme.accentColor,
      '--player-cg-accent-muted-color': rgba(theme.accentColor, 64),
      '--player-cg-accent-foreground': accentForeground,
      '--player-cg-overlay-color': rgba(
        theme.overlayColor,
        theme.overlayOpacityPercent,
      ),
      '--player-cg-control-color': rgba(controlColor, 46),
      '--player-cg-control-strong-color': rgba(controlColor, 64),
      '--player-cg-control-hover-color': rgba(controlHoverColor, 86),
      '--player-cg-thumbnail-color': thumbnailColor,
      '--player-cg-lightbox-color': rgba(lightboxColor, 96),
      '--player-cg-border-color': rgba(theme.textColor, 20),
      '--player-cg-control-border-color': rgba(theme.textColor, 26),
      '--player-cg-border-strong-color': rgba(theme.textColor, 50),
      '--player-cg-thumbnail-border-color': rgba(theme.textColor, 17),
      '--player-cg-corner-radius': `${theme.cornerRadiusPx}px`,
      '--player-cg-thumbnail-radius': `${Math.max(
        0,
        theme.cornerRadiusPx - 5,
      )}px`,
      '--player-cg-control-radius': `${Math.max(
        0,
        theme.cornerRadiusPx - 4,
      )}px`,
      '--player-cg-gap': `${theme.gapPx}px`,
      '--player-cg-responsive-gap': responsiveGap,
      '--player-cg-thumbnail-fit': theme.thumbnailFit,
      '--player-cg-focus-color': focusColor,
      '--player-cg-focus-halo-color': oppositeMonochrome(focusColor),
    },
  };
}
