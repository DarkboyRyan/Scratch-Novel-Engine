/**
 * 主要作用：验证 Player 标题、剧情、Modal 与状态提示的统一视觉契约。
 * 关键函数与实现：测试套件“Player surface visual style contract”、`rule`；检查中性主题、长文本、低高度滚动和安全区层级。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

describe('Player surface visual style contract', () => {
  it('uses the same restrained neutral language for startup and recovery', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    const shell = rule(css, '.player-shell');
    const loadingStatus = rule(css, '.player-loading-status');
    const shellCard = rule(css, '.player-shell-card');
    const shellButton = rule(css, '.player-shell-actions > button');
    const shellPrimary = rule(
      css,
      '.player-shell-actions > .player-shell-primary',
    );

    expect(shell).toContain('background: #090b0f');
    expect(loadingStatus).toContain('background: #0c0f14');
    expect(loadingStatus).toContain('border-radius: 12px');
    expect(shellCard).toContain('background: #0c0f14');
    expect(shellCard).toContain('border-radius: 12px');
    expect(shellCard).toContain('max-height: 100%');
    expect(shellCard).toContain('overflow: auto');
    expect(shellButton).toContain('border-radius: 8px');
    expect(shellPrimary).toContain('background: rgb(255 255 255 / 94%)');
    expect(css).toContain('@media (max-height: 420px)');
  });

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

  it('keeps story text complete in the neutral gameplay surface', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    const stage = rule(css, '.player-game,\n.preview-stage,\n.player-stage');
    const dialogue = rule(css, '.dialogue-box');
    const dialogueText = rule(css, '.dialogue-box p');
    const choiceList = rule(css, '.player-choice-list');
    const choice = rule(css, '.player-choice-button');
    const menu = rule(css, '.player-menu-card');
    const menuPrimary = rule(
      css,
      '.player-menu-card > button:not(.secondary)',
    );
    const actionBar = rule(css, '.player-game-action-bar');

    expect(stage).toContain('background: #0b0c0f');
    expect(dialogue).toContain('background: rgb(12 15 20 / 92%)');
    expect(dialogue).toContain('overflow-y: auto');
    expect(dialogueText).toContain('overflow-wrap: anywhere');
    expect(dialogueText).toContain('white-space: pre-wrap');
    expect(choiceList).toContain('max-height: 100%');
    expect(choiceList).toContain('overflow-y: auto');
    expect(choice).toContain('height: auto');
    expect(choice).toContain('white-space: normal');
    expect(choice).toContain('overflow-wrap: anywhere');
    expect(menu).toContain('background: rgb(12 15 20 / 96%)');
    expect(menu).toContain('max-height: 100%');
    expect(menu).toContain('overflow-y: auto');
    expect(menuPrimary).toContain('background: rgb(255 255 255 / 94%)');
    expect(actionBar).toContain('background: rgb(12 15 20 / 90%)');
  });

  it('keeps saves scrollable and notifications in the top safe area', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    const saveLayer = rule(css, '.player-save-layer');
    const saveCard = rule(css, '.player-save-card');
    const saveSlots = rule(css, '.player-save-slots');
    const toast = rule(css, '.player-save-toast');

    expect(saveCard).toContain('max-height: 100%');
    expect(saveCard).toContain('background: rgb(12 15 20 / 96%)');
    expect(saveCard).toContain('border-radius: 12px');
    expect(saveSlots).toContain('min-height: 0');
    expect(saveSlots).toContain('overflow-y: auto');
    expect(toast).toContain(
      'top: max(16px, env(safe-area-inset-top))',
    );
    expect(toast).toContain('bottom: auto');
    expect(toast).toContain('z-index: 80');
    expect(toast).toContain('pointer-events: none');
    expect(toast).toContain('max-width: min(520px, calc(100vw - 144px))');
    expect(Number.parseInt(
      saveLayer.match(/z-index:\s*(\d+)/)?.[1] ?? '0',
      10,
    )).toBeGreaterThan(80);
  });
});
