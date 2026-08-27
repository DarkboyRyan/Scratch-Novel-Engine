/**
 * 主要作用：验证窗口尺寸预设同步缩放整套 Player 字体。
 * 关键函数与实现：测试套件“Player typography scale contract”、`ruleBody`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function ruleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const body = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'su'))
    ?.[1];
  if (body === undefined) {
    throw new Error(`Missing CSS rule: ${selector}`);
  }
  return body;
}

describe('Player typography scale contract', () => {
  it('maps each persisted window preset to a bounded font base', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    expect(ruleBody(css, '.player-app')).toContain(
      'font-size: var(--player-ui-font-base)',
    );
    expect(ruleBody(
      css,
      ".player-app[data-player-window-size-preset='small']",
    )).toContain('--player-ui-font-base: 14px');
    expect(ruleBody(
      css,
      ".player-app[data-player-window-size-preset='medium']",
    )).toContain('--player-ui-font-base: 16px');
    expect(ruleBody(
      css,
      ".player-app[data-player-window-size-preset='large']",
    )).toContain('--player-ui-font-base: 18px');
  });

  it('keeps the text hierarchy relative to the preset font base', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );
    const fontSizes = [...css.matchAll(/font-size:\s*([^;]+);/gu)]
      .map((match) => match[1]?.trim())
      .filter((value): value is string => value !== undefined);

    expect(fontSizes).toContain('clamp(2.625em, 7vw, 5.5em)');
    expect(fontSizes).toContain('clamp(1.0625em, 2vw, 1.375em)');
    expect(fontSizes).toContain('0.8125em');
    expect(fontSizes
      .filter((value) => value !== 'var(--player-ui-font-base)')
      .every((value) => !/\dpx/u.test(value))).toBe(true);
  });

  it('does not derive typography from fullscreen viewport dimensions', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    expect(css).not.toMatch(/fullscreen[^{}]*\{[^}]*--player-ui-font-base/isu);
    expect(css).not.toMatch(/:fullscreen[^{}]*font-size/isu);
  });
});
