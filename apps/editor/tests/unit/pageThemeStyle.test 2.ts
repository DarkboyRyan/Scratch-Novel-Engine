/**
 * 主要作用：确保 Editor 的小预览与完整预览消费同一组受控主题变量。
 * 测试覆盖：Title/CG 布局属性、图片适配、间距和完整预览响应式规则。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Editor page theme CSS', () => {
  it('themes both form previews through shared variables and enum attributes', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    expect(css).toContain(
      '.start-screen-design-preview[data-player-title-layout=',
    );
    expect(css).toContain(
      'object-fit: var(--player-title-background-fit, contain)',
    );
    expect(css).toContain(
      '.cg-gallery-design-preview[data-player-cg-layout=',
    );
    expect(css).toContain('gap: var(--player-cg-gap, 16px)');
    expect(css).toContain(
      'object-fit: var(--player-cg-thumbnail-fit, cover)',
    );
  });

  it('mirrors full Player layouts without changing default geometry', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    expect(css).toContain(
      ".player-title-page[data-player-title-layout='split-left']",
    );
    expect(css).toContain(
      ".player-title-page[data-player-title-layout='center']",
    );
    expect(css).toContain(
      ".player-cg-gallery-layer[data-player-cg-layout='edge-to-edge']",
    );
    expect(css).toContain(
      'border-radius: var(--player-title-corner-radius, 0)',
    );
    expect(
      css.match(/border: var\(--player-title-card-border-width, 0\) solid/g),
    ).toHaveLength(2);
    expect(css).toContain(
      'border-radius: var(--player-cg-corner-radius, 12px)',
    );
  });
});
