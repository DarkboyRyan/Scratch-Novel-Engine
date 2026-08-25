import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { calculateAutoFitScale } from '@vnengine/player-ui';
import { describe, expect, it } from 'vitest';

describe('title screen auto-fit contract', () => {
  it('uniformly fits the menu by its most constrained dimension', () => {
    expect(calculateAutoFitScale(452, 254, 307, 276)).toBeCloseTo(
      254 / 276,
    );
    expect(calculateAutoFitScale(960, 504, 680, 551)).toBeCloseTo(
      504 / 551,
    );
    expect(calculateAutoFitScale(960, 600, 680, 500)).toBe(1);
    expect(calculateAutoFitScale(400, 300, 800, 400)).toBe(0.5);
    expect(calculateAutoFitScale(704, 404, 680, 718)).toBeCloseTo(
      404 / 718,
    );
  });

  it('keeps invalid pre-layout measurements at natural size', () => {
    expect(calculateAutoFitScale(0, 254, 307, 276)).toBe(1);
    expect(calculateAutoFitScale(452, 254, Number.NaN, 276)).toBe(1);
  });

  it('connects the measured scale to the Player title card', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.player-title-fit\s*\{[^}]+position:\s*relative[^}]+overflow:\s*hidden/s,
    );
    expect(css).toMatch(
      /\.player-title-card\s*\{[^}]+position:\s*absolute[^}]+top:\s*50%[^}]+left:\s*50%[^}]+transform:\s*translate\(-50%,\s*-50%\)\s*scale\(var\(--auto-fit-scale,\s*1\)\)/s,
    );
    expect(
      css.match(/\.player-title-card h1\s*\{([^}]*)\}/s)?.[1],
    ).not.toContain('line-clamp');
  });

  it('keeps the complete background behind a clean responsive menu', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/player.css'),
      'utf8',
    );
    const backgroundRule = css.match(
      /\.player-title-background\s*\{([^}]*)\}/s,
    )?.[1];
    const cardRule = css.match(/\.player-title-card\s*\{([^}]*)\}/s)?.[1];
    const actionsRule = css.match(
      /\.player-title-actions\s*\{([^}]*)\}/s,
    )?.[1];
    const primaryRule = css.match(
      /\.player-title-actions > \.player-start-button\s*\{([^}]*)\}/s,
    )?.[1];

    expect(backgroundRule).toContain('object-fit: contain');
    expect(backgroundRule).toContain('object-position: center');
    expect(cardRule).toContain('display: grid');
    expect(cardRule).toContain('"eyebrow actions"');
    expect(cardRule).toContain('"title actions"');
    expect(actionsRule).toContain('flex-direction: column');
    expect(primaryRule).toContain('background: rgb(255 255 255 / 94%)');
    expect(css).toContain('@container (max-width: 680px)');
  });
});
