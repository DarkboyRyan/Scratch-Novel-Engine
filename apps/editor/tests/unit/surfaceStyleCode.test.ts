/**
 * 文件主要作用：验证主界面/CG 样式 DSL 的确定性格式化和安全解析。
 * 测试覆盖：默认往返、边界值、未知/重复/缺失字段、非法颜色枚举数值与源码上限。
 */

import { describe, expect, it } from 'vitest';

import {
  formatCgGalleryStyleCode,
  formatStartScreenStyleCode,
  parseSurfaceStyleCode,
} from '../../src/renderer/features/code-editor/surfaceStyleCode';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../src/shared/projectTypes';

describe('surface style Code DSL', () => {
  it('round-trips the canonical title-screen style', () => {
    const source = formatStartScreenStyleCode(DEFAULT_START_SCREEN_STYLE);

    expect(parseSurfaceStyleCode(source, 'start-screen')).toEqual({
      ok: true,
      target: 'start-screen',
      style: DEFAULT_START_SCREEN_STYLE,
      diagnostics: [],
    });
    expect(source).toContain('main_screen(');
    expect(source).toContain('layout: split-right');
  });

  it('round-trips a customized CG style and normalizes Hex case', () => {
    const source = formatCgGalleryStyleCode({
      ...DEFAULT_CG_GALLERY_STYLE,
      fontScalePercent: 150,
      pageColor: '#aabbcc',
      surfaceOpacityPercent: 0,
      cornerRadiusPx: 48,
      layout: 'edge-to-edge',
      thumbnailFit: 'cover',
      gapPx: 32,
    });
    const result = parseSurfaceStyleCode(source, 'cg-gallery');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.style).toMatchObject({
        fontScalePercent: 150,
        pageColor: '#AABBCC',
        surfaceOpacityPercent: 0,
        cornerRadiusPx: 48,
        layout: 'edge-to-edge',
        thumbnailFit: 'cover',
        gapPx: 32,
      });
    }
  });

  it.each([
    ['unknown field', '  custom_css: "body{}",', 'unknownField'],
    ['duplicate field', '  font: serif,\n  font: mono,', 'duplicateField'],
    ['invalid color', '  text: "red",', 'invalidValue'],
    ['invalid integer', '  radius: 49,', 'invalidValue'],
    ['invalid enum', '  layout: floating,', 'invalidValue'],
  ])('rejects %s', (_label, replacement, diagnosticCode) => {
    let source = formatStartScreenStyleCode(DEFAULT_START_SCREEN_STYLE);
    if (diagnosticCode === 'unknownField') {
      source = source.replace('  font: system,', `${replacement}\n  font: system,`);
    } else if (diagnosticCode === 'duplicateField') {
      source = source.replace('  font: system,', replacement);
    } else if (replacement.includes('text:')) {
      source = source.replace('  text: "#FFFFFF",', replacement);
    } else if (replacement.includes('radius:')) {
      source = source.replace('  radius: 0,', replacement);
    } else {
      source = source.replace('  layout: split-right,', replacement);
    }

    const result = parseSurfaceStyleCode(source, 'start-screen');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((entry) => entry.code === diagnosticCode))
        .toBe(true);
    }
  });

  it('rejects missing fields, the wrong surface wrapper, and oversized source', () => {
    const missing = formatCgGalleryStyleCode(DEFAULT_CG_GALLERY_STYLE)
      .replace(/^ {2}gap:.*\n/mu, '');
    expect(parseSurfaceStyleCode(missing, 'cg-gallery')).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'missingField', field: 'gap' }],
    });

    expect(parseSurfaceStyleCode(
      formatCgGalleryStyleCode(DEFAULT_CG_GALLERY_STYLE),
      'start-screen',
    )).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalidHeader' }],
    });

    expect(parseSurfaceStyleCode(
      `main_screen(\n${'x'.repeat(17_000)}\n)`,
      'start-screen',
    )).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'sourceTooLong' }],
    });
  });
});
