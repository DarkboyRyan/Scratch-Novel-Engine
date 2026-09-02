/**
 * 主要作用：锁定 Player 页面主题的响应式 CSS 接线和默认几何外观。
 * 测试覆盖：Title 三种布局、CG 两种布局、图片适配、间距和默认圆角。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Player page theme CSS', () => {
  it('keeps the legacy default geometry behind typed CSS variables', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    expect(css).toContain(
      'object-fit: var(--player-title-background-fit, contain)',
    );
    expect(css).toContain(
      'border-radius: var(--player-title-corner-radius, 0)',
    );
    expect(css).toContain(
      'border: var(--player-title-card-border-width, 0) solid',
    );
    expect(css).toContain(
      'border-radius: var(--player-cg-corner-radius, 12px)',
    );
    expect(css).toContain(
      'border-radius: var(--player-cg-thumbnail-radius, 7px)',
    );
    expect(css).toContain(
      '--player-cg-responsive-gap',
    );
  });

  it('supports controlled layout variants and responsive collapse', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    expect(css).toContain("[data-player-title-layout='split-left']");
    expect(css).toContain("[data-player-title-layout='center']");
    expect(css).toContain('@container (max-width: 680px)');
    expect(css).toContain("[data-player-cg-layout='edge-to-edge']");
    expect(css).toContain(
      'object-fit: var(--player-cg-thumbnail-fit, contain)',
    );
  });
});
