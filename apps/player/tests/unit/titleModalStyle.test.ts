/**
 * 主要作用：验证标题页 Modal 的层级、背景和控件视觉契约。
 * 关键函数与实现：测试套件“title modal visual style contract”、`rule`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

describe('title modal visual style contract', () => {
  it('uses the clean neutral title-screen language for Options and CG', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    const optionsCard = rule(css, '.player-options-card');
    const cgCard = rule(css, '.player-cg-gallery-card');
    const optionsPrimary = rule(
      css,
      '.player-options-actions > .player-options-primary',
    );

    expect(optionsCard).toContain('background: rgb(12 15 20 / 96%)');
    expect(optionsCard).toContain('border-radius: 12px');
    expect(cgCard).toContain('background: rgb(12 15 20 / 96%)');
    expect(cgCard).toContain('border-radius: 12px');
    expect(optionsPrimary).toContain('background: rgb(255 255 255 / 94%)');
    expect(rule(css, '.player-options-volume input')).toContain(
      'accent-color: #ffffff',
    );
  });

  it('keeps low-height scrolling, the nine-slot grid, and inert empty slots', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    const optionsCard = rule(css, '.player-options-card');
    const grid = rule(css, '.player-cg-grid');
    const disabledThumbnail = rule(css, '.player-cg-thumbnail:disabled');

    expect(optionsCard).toContain('max-height: 100%');
    expect(optionsCard).toContain('overflow: auto');
    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(grid).toContain('grid-template-rows: repeat(3, minmax(0, 1fr))');
    expect(disabledThumbnail).toContain('cursor: default');
    expect(disabledThumbnail).toContain('filter: none');
    expect(disabledThumbnail).toContain('opacity: 1');
    expect(css).toMatch(
      /(?:^|\n)\.player-cg-lightbox-close\s*\{[^}]*position:\s*absolute[^}]*right:\s*24px/s,
    );
  });
});
