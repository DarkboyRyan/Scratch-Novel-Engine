/**
 * 文件主要作用：验证 Editor 日光/月色主题的静态 CSS 契约。
 * 测试覆盖：主题 token、关键表面、Blockly 暗色外壳、作品预览边界与主题卡状态。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

function declarationsForSelector(css: string, selector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gs)]
    .filter((match) =>
      match[1]
        ?.split(',')
        .map((candidate) => candidate.trim())
        .includes(selector),
    )
    .map((match) => match[2] ?? '')
    .join('\n');
}

describe('Editor color theme style contract', () => {
  let baseCss = '';
  let themeCss = '';

  beforeAll(async () => {
    [baseCss, themeCss] = await Promise.all([
      readFile(resolve('src/renderer/styles/base.css'), 'utf8'),
      readFile(resolve('src/renderer/styles/editorTheme.css'), 'utf8'),
    ]);
  });

  it('defines a complete moonlight root palette and surface tokens', () => {
    const moonlight = declarationsForSelector(
      baseCss,
      ":root[data-editor-theme='moonlight']",
    );

    expect(moonlight).toMatch(/color-scheme:\s*dark/);
    expect(moonlight).toMatch(/--canvas:\s*#0f1118\b/i);
    expect(moonlight).toMatch(/--panel:\s*#171a24\b/i);
    expect(moonlight).toMatch(/--panel-subtle:\s*#202431\b/i);
    expect(moonlight).toMatch(/--border:\s*#343a4d\b/i);
    expect(moonlight).toMatch(/--text:\s*#eceef7\b/i);
    expect(moonlight).toMatch(/--text-muted:\s*#a5abbd\b/i);
    expect(moonlight).toMatch(/--primary:\s*#aaa3ff\b/i);
    expect(moonlight).toMatch(/--toolbar-surface:\s*#[0-9a-f]{6}\b/i);
    expect(moonlight).toMatch(/--preview-canvas:\s*#[0-9a-f]{6}\b/i);
    expect(moonlight).toMatch(/--code-surface:\s*#[0-9a-f]{6}\b/i);
    expect(moonlight).toMatch(/--blockly-workspace:\s*#[0-9a-f]{6}\b/i);
  });

  it('routes Editor chrome through theme surface tokens', () => {
    const daylight = declarationsForSelector(baseCss, ':root');
    expect(daylight).toMatch(/--toolbar-surface:\s*#ffffff\b/i);
    expect(daylight).toMatch(/--control-track:\s*#f0f2f5\b/i);
    expect(daylight).toMatch(/--preview-canvas:\s*#edf0f3\b/i);
    expect(daylight).toMatch(/--stage-empty:\s*#f8f9fb\b/i);
    expect(daylight).toMatch(/--scrollbar:\s*#c4cad2\b/i);

    expect(declarationsForSelector(themeCss, '.toolbar')).toMatch(
      /background:\s*var\(--toolbar-surface\)/,
    );
    expect(declarationsForSelector(themeCss, '.preview-panel')).toMatch(
      /background:\s*var\(--preview-canvas\)/,
    );
    expect(declarationsForSelector(themeCss, '.preview-stage')).toMatch(
      /background:\s*var\(--stage-empty\)/,
    );
    expect(declarationsForSelector(themeCss, '.code-editor-panel')).toMatch(
      /background:\s*var\(--code-surface\)/,
    );
    expect(
      declarationsForSelector(themeCss, '.asset-manager-card-preview'),
    ).toMatch(/var\(--checker-light\)/);
  });

  it('themes Blockly shells, popups, editable fields, and controls', () => {
    expect(
      declarationsForSelector(
        themeCss,
        '.blockly-workspace .blocklyMainBackground',
      ),
    ).toMatch(/fill:\s*var\(--blockly-workspace\)\s*!important/);
    expect(declarationsForSelector(themeCss, '.blocklyToolbox')).toMatch(
      /background-color:\s*var\(--blockly-toolbox\)\s*!important/,
    );
    expect(
      declarationsForSelector(themeCss, '.blocklyFlyoutBackground'),
    ).toMatch(/fill:\s*var\(--blockly-flyout\)\s*!important/);
    expect(declarationsForSelector(themeCss, '.blocklyDropDownDiv')).toMatch(
      /background-color:\s*var\(--blockly-popup\)\s*!important/,
    );
    expect(
      declarationsForSelector(
        themeCss,
        '.blockly-workspace .blocklyEditableField > .blocklyFieldRect',
      ),
    ).toMatch(/fill:\s*var\(--blockly-field\)\s*!important/);
    expect(
      declarationsForSelector(
        themeCss,
        '.blocklyTrash .vn-engine-trash-body path',
      ),
    ).toMatch(/fill:\s*var\(--blockly-control\)\s*!important/);
    expect(
      declarationsForSelector(
        themeCss,
        '.blocklyZoom .vn-blockly-zoom-button',
      ),
    ).toMatch(/fill:\s*var\(--blockly-control\)\s*!important/);
  });

  it('does not apply a global filter to authored preview content', () => {
    const protectedPreviewSelector =
      /(?:start-screen-design-preview|cg-gallery-design-preview|dialogue-box|game-preview-|player-)[^{]*\{[^}]*\bfilter\s*:/s;
    const globalThemeFilter =
      /:root\[data-editor-theme=['"]moonlight['"]\]\s+(?:\*|\.editor)[^{]*\{[^}]*\bfilter\s*:/s;

    expect(themeCss).not.toMatch(protectedPreviewSelector);
    expect(themeCss).not.toMatch(globalThemeFilter);
  });

  it('provides selected, hover, focus, disabled, and swatch card states', () => {
    expect(declarationsForSelector(themeCss, '.editor-theme-option')).toMatch(
      /background:\s*var\(--control-surface\)/,
    );
    expect(
      declarationsForSelector(
        themeCss,
        ".editor-theme-option:hover:not(:has(input:disabled)):not([aria-disabled='true'])",
      ),
    ).toMatch(/border-color:\s*var\(--border-strong\)/);
    expect(
      declarationsForSelector(themeCss, '.editor-theme-option:focus-within'),
    ).toMatch(/outline:\s*2px\s+solid\s+var\(--focus-ring\)/);
    expect(
      declarationsForSelector(themeCss, '.editor-theme-option.is-selected'),
    ).toMatch(/box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--primary\)/);
    expect(
      declarationsForSelector(
        themeCss,
        '.editor-theme-option:has(input:disabled)',
      ),
    ).toMatch(/cursor:\s*not-allowed/);
    expect(
      declarationsForSelector(themeCss, '.editor-theme-swatch.is-daylight'),
    ).toContain('#514f9d');
    expect(
      declarationsForSelector(themeCss, '.editor-theme-swatch.is-moonlight'),
    ).toContain('#aaa3ff');
  });
});
