/**
 * 文件主要作用：验证 title preview modal visual style contract 的行为。
 * 测试覆盖：`title preview modal visual style contract`。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

describe('title preview modal visual style contract', () => {
  it('mirrors the neutral Options and CG surfaces inside the preview container', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    const optionsCard = rule(
      css,
      '.game-preview-title-overlay .player-options-card',
    );
    const cgCard = rule(
      css,
      '.game-preview-title-overlay .player-cg-gallery-card',
    );
    const optionsPrimary = rule(
      css,
      '.game-preview-title-overlay .player-options-actions > .player-options-primary',
    );

    expect(optionsCard).toContain('width: min(620px, calc(100% - 32px))');
    expect(optionsCard).not.toContain('100vw');
    expect(optionsCard).toContain('background: rgb(12 15 20 / 96%)');
    expect(optionsCard).toContain('overflow: auto');
    expect(cgCard).toContain(
      'background: var(--player-cg-surface-color, rgb(12 15 20 / 96%))',
    );
    expect(cgCard).toContain(
      'border-radius: var(--player-cg-corner-radius, 12px)',
    );
    expect(optionsPrimary).toContain('background: rgb(255 255 255 / 94%)');
  });

  it('preserves the nine-slot grid and non-busy empty cells', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    const grid = rule(
      css,
      '.game-preview-title-overlay .player-cg-grid',
    );
    const disabledThumbnail = rule(
      css,
      '.game-preview-title-overlay .player-cg-thumbnail:disabled',
    );

    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(grid).toContain('grid-template-rows: repeat(3, minmax(0, 1fr))');
    expect(disabledThumbnail).toContain('cursor: default');
    expect(disabledThumbnail).toContain('filter: none');
    expect(disabledThumbnail).toContain('opacity: 1');
    expect(css).toMatch(
      /(?:^|\n)\.game-preview-title-overlay \.player-cg-lightbox-close\s*\{[^}]*position:\s*absolute[^}]*right:\s*76px/s,
    );
  });
});
