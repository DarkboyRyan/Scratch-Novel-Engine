/**
 * 文件主要作用：验证 start screen responsive style contract 的行为。
 * 测试覆盖：`start screen responsive style contract`。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('start screen responsive style contract', () => {
  it('auto-fits both the form preview and the full-screen preview', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.start-screen-design-preview\s*\{[^}]+container-type:\s*size/s,
    );
    expect(css).toMatch(
      /\.start-screen-design-fit\s*\{[^}]+position:\s*relative[^}]+overflow:\s*hidden/s,
    );
    expect(css).toMatch(
      /\.start-screen-design-card\s*\{[^}]+position:\s*absolute[^}]+top:\s*50%[^}]+left:\s*50%[^}]+transform:\s*translate\(-50%,\s*-50%\)\s*scale\(var\(--auto-fit-scale,\s*1\)\)/s,
    );
    expect(css).toMatch(
      /\.game-preview-title-overlay \.player-title-card\s*\{[^}]+position:\s*absolute[^}]+top:\s*50%[^}]+left:\s*50%[^}]+transform:\s*translate\(-50%,\s*-50%\)\s*scale\(var\(--auto-fit-scale,\s*1\)\)/s,
    );
    expect(
      css.match(/\.start-screen-design-card h2\s*\{([^}]*)\}/s)?.[1],
    ).not.toContain('line-clamp');
    expect(
      css.match(
        /\.game-preview-title-overlay \.player-title-card h1\s*\{([^}]*)\}/s,
      )?.[1],
    ).not.toContain('line-clamp');
  });

  it('mirrors the clean two-column title layout in both Editor previews', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );
    const designBackgroundRule = css.match(
      /\.start-screen-design-preview > img\s*\{([^}]*)\}/s,
    )?.[1];
    const designCardRule = css.match(
      /\.start-screen-design-card\s*\{([^}]*)\}/s,
    )?.[1];
    const fullBackgroundRule = css.match(
      /\.game-preview-title-overlay \.player-title-background\s*\{([^}]*)\}/s,
    )?.[1];
    const fullCardRule = css.match(
      /\.game-preview-title-overlay \.player-title-card\s*\{([^}]*)\}/s,
    )?.[1];
    const designActionsRule = css.match(
      /\.start-screen-design-actions\s*\{([^}]*)\}/s,
    )?.[1];
    const fullActionsRule = css.match(
      /\.game-preview-title-overlay \.player-title-actions\s*\{([^}]*)\}/s,
    )?.[1];

    expect(designBackgroundRule).toContain(
      'object-fit: var(--player-title-background-fit, contain)',
    );
    expect(fullBackgroundRule).toContain(
      'object-fit: var(--player-title-background-fit, contain)',
    );
    expect(designCardRule).toContain('display: grid');
    expect(designCardRule).toContain('"eyebrow actions"');
    expect(fullCardRule).toContain('display: grid');
    expect(fullCardRule).toContain('"eyebrow actions"');
    expect(designActionsRule).toContain('flex-direction: column');
    expect(fullActionsRule).toContain('flex-direction: column');
    expect(css).toContain('@container (max-width: 520px)');
    expect(css).toContain('@container (max-width: 680px)');
  });
});
