/**
 * 主要作用：在主界面/CG 画廊的可编辑 Code 页面与严格主题 DTO 之间双向转换。
 * 关键实现：白名单字段、受界数字、规范 Hex 颜色和固定枚举；源码不会作为 CSS 执行或持久化。
 */

import type {
  CgGalleryStyleDocument,
  StartScreenStyleDocument,
} from '../../../shared/projectTypes';

export type SurfaceStyleCodeTarget = 'start-screen' | 'cg-gallery';

export type SurfaceStyleCodeDiagnosticCode =
  | 'sourceTooLong'
  | 'invalidHeader'
  | 'invalidSyntax'
  | 'duplicateField'
  | 'unknownField'
  | 'missingField'
  | 'invalidValue';

export type SurfaceStyleCodeDiagnostic = {
  code: SurfaceStyleCodeDiagnosticCode;
  line: number;
  field?: string;
};

export type ParsedSurfaceStyleCode =
  | {
      ok: true;
      target: 'start-screen';
      style: StartScreenStyleDocument;
      diagnostics: [];
    }
  | {
      ok: true;
      target: 'cg-gallery';
      style: CgGalleryStyleDocument;
      diagnostics: [];
    }
  | {
      ok: false;
      target: SurfaceStyleCodeTarget;
      diagnostics: SurfaceStyleCodeDiagnostic[];
    };

const MAX_STYLE_SOURCE_BYTES = 16 * 1024;
const UTF8_ENCODER = new TextEncoder();

const COMMON_FIELDS = [
  'style_version',
  'font',
  'font_scale',
  'page',
  'text',
  'muted_text',
  'surface',
  'surface_opacity',
  'accent',
  'overlay',
  'overlay_opacity',
  'radius',
] as const;

const TARGET_FIELDS = {
  'start-screen': [
    ...COMMON_FIELDS,
    'layout',
    'background_fit',
  ],
  'cg-gallery': [
    ...COMMON_FIELDS,
    'layout',
    'thumbnail_fit',
    'gap',
  ],
} as const satisfies Record<SurfaceStyleCodeTarget, readonly string[]>;

const TARGET_HEADERS = {
  'start-screen': 'main_screen',
  'cg-gallery': 'cg_gallery',
} as const satisfies Record<SurfaceStyleCodeTarget, string>;

function quote(value: string): string {
  return JSON.stringify(value);
}

function commonLines(
  style: StartScreenStyleDocument | CgGalleryStyleDocument,
): string[] {
  return [
    '  style_version: 1,',
    `  font: ${style.fontPreset},`,
    `  font_scale: ${style.fontScalePercent},`,
    `  page: ${quote(style.pageColor)},`,
    `  text: ${quote(style.textColor)},`,
    `  muted_text: ${quote(style.mutedTextColor)},`,
    `  surface: ${quote(style.surfaceColor)},`,
    `  surface_opacity: ${style.surfaceOpacityPercent},`,
    `  accent: ${quote(style.accentColor)},`,
    `  overlay: ${quote(style.overlayColor)},`,
    `  overlay_opacity: ${style.overlayOpacityPercent},`,
    `  radius: ${style.cornerRadiusPx},`,
  ];
}

export function formatStartScreenStyleCode(
  style: StartScreenStyleDocument,
): string {
  return [
    `${TARGET_HEADERS['start-screen']}(`,
    ...commonLines(style),
    `  layout: ${style.layout},`,
    `  background_fit: ${style.backgroundFit}`,
    ')',
    '',
  ].join('\n');
}

export function formatCgGalleryStyleCode(
  style: CgGalleryStyleDocument,
): string {
  return [
    `${TARGET_HEADERS['cg-gallery']}(`,
    ...commonLines(style),
    `  layout: ${style.layout},`,
    `  thumbnail_fit: ${style.thumbnailFit},`,
    `  gap: ${style.gapPx}`,
    ')',
    '',
  ].join('\n');
}

function diagnostic(
  code: SurfaceStyleCodeDiagnosticCode,
  line: number,
  field?: string,
): SurfaceStyleCodeDiagnostic {
  return field === undefined ? { code, line } : { code, line, field };
}

function parseInteger(
  raw: string | undefined,
  minimum: number,
  maximum: number,
): number | null {
  if (raw === undefined || !/^(?:0|[1-9]\d*)$/u.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseColor(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/u.test(value)
    ? value.toUpperCase()
    : null;
}

function parseEnum<const Value extends string>(
  raw: string | undefined,
  values: readonly Value[],
): Value | null {
  return raw !== undefined && values.includes(raw as Value)
    ? raw as Value
    : null;
}

export function parseSurfaceStyleCode(
  source: string,
  target: SurfaceStyleCodeTarget,
): ParsedSurfaceStyleCode {
  if (UTF8_ENCODER.encode(source).byteLength > MAX_STYLE_SOURCE_BYTES) {
    return {
      ok: false,
      target,
      diagnostics: [diagnostic('sourceTooLong', 1)],
    };
  }

  const lines = source.replaceAll('\r\n', '\n').split('\n');
  while (lines.length > 0 && lines.at(-1)?.trim() === '') {
    lines.pop();
  }
  const header = TARGET_HEADERS[target];
  if (lines[0]?.trim() !== `${header}(` || lines.at(-1)?.trim() !== ')') {
    return {
      ok: false,
      target,
      diagnostics: [diagnostic('invalidHeader', 1)],
    };
  }

  const expectedFields = new Set<string>(TARGET_FIELDS[target]);
  const values = new Map<string, { raw: string; line: number }>();
  const diagnostics: SurfaceStyleCodeDiagnostic[] = [];
  for (let index = 1; index < lines.length - 1; index += 1) {
    const text = lines[index]?.trim() ?? '';
    if (text.length === 0) {
      continue;
    }
    const match = /^([a-z][a-z0-9_]*)\s*:\s*(.+?)(?:,)?$/u.exec(text);
    if (match === null) {
      diagnostics.push(diagnostic('invalidSyntax', index + 1));
      continue;
    }
    const [, field = '', raw = ''] = match;
    if (!expectedFields.has(field)) {
      diagnostics.push(diagnostic('unknownField', index + 1, field));
      continue;
    }
    if (values.has(field)) {
      diagnostics.push(diagnostic('duplicateField', index + 1, field));
      continue;
    }
    values.set(field, { raw: raw.trim(), line: index + 1 });
  }

  for (const field of expectedFields) {
    if (!values.has(field)) {
      diagnostics.push(diagnostic('missingField', 1, field));
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, target, diagnostics };
  }

  const read = (field: string): string | undefined => values.get(field)?.raw;
  const lineOf = (field: string): number => values.get(field)?.line ?? 1;
  const styleVersion = parseInteger(read('style_version'), 1, 1);
  const fontPreset = parseEnum(read('font'), [
    'system',
    'serif',
    'rounded',
    'mono',
  ] as const);
  const fontScalePercent = parseInteger(read('font_scale'), 75, 150);
  const pageColor = parseColor(read('page'));
  const textColor = parseColor(read('text'));
  const mutedTextColor = parseColor(read('muted_text'));
  const surfaceColor = parseColor(read('surface'));
  const surfaceOpacityPercent = parseInteger(
    read('surface_opacity'),
    0,
    100,
  );
  const accentColor = parseColor(read('accent'));
  const overlayColor = parseColor(read('overlay'));
  const overlayOpacityPercent = parseInteger(
    read('overlay_opacity'),
    0,
    100,
  );
  const cornerRadiusPx = parseInteger(read('radius'), 0, 48);

  const commonValues = [
    ['style_version', styleVersion],
    ['font', fontPreset],
    ['font_scale', fontScalePercent],
    ['page', pageColor],
    ['text', textColor],
    ['muted_text', mutedTextColor],
    ['surface', surfaceColor],
    ['surface_opacity', surfaceOpacityPercent],
    ['accent', accentColor],
    ['overlay', overlayColor],
    ['overlay_opacity', overlayOpacityPercent],
    ['radius', cornerRadiusPx],
  ] as const;
  for (const [field, value] of commonValues) {
    if (value === null) {
      diagnostics.push(diagnostic('invalidValue', lineOf(field), field));
    }
  }
  if (diagnostics.length > 0) {
    return { ok: false, target, diagnostics };
  }

  const common = {
    fontPreset: fontPreset!,
    fontScalePercent: fontScalePercent!,
    pageColor: pageColor!,
    textColor: textColor!,
    mutedTextColor: mutedTextColor!,
    surfaceColor: surfaceColor!,
    surfaceOpacityPercent: surfaceOpacityPercent!,
    accentColor: accentColor!,
    overlayColor: overlayColor!,
    overlayOpacityPercent: overlayOpacityPercent!,
    cornerRadiusPx: cornerRadiusPx!,
  };

  if (target === 'start-screen') {
    const layout = parseEnum(read('layout'), [
      'split-right',
      'split-left',
      'center',
    ] as const);
    const backgroundFit = parseEnum(read('background_fit'), [
      'contain',
      'cover',
    ] as const);
    if (layout === null) {
      diagnostics.push(diagnostic('invalidValue', lineOf('layout'), 'layout'));
    }
    if (backgroundFit === null) {
      diagnostics.push(diagnostic(
        'invalidValue',
        lineOf('background_fit'),
        'background_fit',
      ));
    }
    return diagnostics.length > 0
      ? { ok: false, target, diagnostics }
      : {
          ok: true,
          target,
          style: { ...common, layout: layout!, backgroundFit: backgroundFit! },
          diagnostics: [],
        };
  }

  const layout = parseEnum(read('layout'), [
    'framed',
    'edge-to-edge',
  ] as const);
  const thumbnailFit = parseEnum(read('thumbnail_fit'), [
    'contain',
    'cover',
  ] as const);
  const gapPx = parseInteger(read('gap'), 0, 32);
  if (layout === null) {
    diagnostics.push(diagnostic('invalidValue', lineOf('layout'), 'layout'));
  }
  if (thumbnailFit === null) {
    diagnostics.push(diagnostic(
      'invalidValue',
      lineOf('thumbnail_fit'),
      'thumbnail_fit',
    ));
  }
  if (gapPx === null) {
    diagnostics.push(diagnostic('invalidValue', lineOf('gap'), 'gap'));
  }
  return diagnostics.length > 0
    ? { ok: false, target, diagnostics }
    : {
        ok: true,
        target,
        style: {
          ...common,
          layout: layout!,
          thumbnailFit: thumbnailFit!,
          gapPx: gapPx!,
        },
        diagnostics: [],
      };
}
