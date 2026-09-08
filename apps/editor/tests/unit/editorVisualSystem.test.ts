/**
 * 文件主要作用：验证 Editor 简洁视觉系统的静态 CSS 与组件契约。
 * 测试覆盖：主题导入顺序、核心 token、提示线、响应式、焦点与减弱动效。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

function atRule(css: string, pattern: RegExp): string {
  const match = pattern.exec(css);
  if (match === null) {
    return '';
  }

  const openingBrace = css.indexOf('{', match.index + match[0].length);
  if (openingBrace < 0) {
    return '';
  }

  let depth = 1;
  for (let index = openingBrace + 1; index < css.length; index += 1) {
    if (css[index] === '{') {
      depth += 1;
    } else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openingBrace + 1, index);
      }
    }
  }
  return '';
}

function importPosition(source: string, path: string): number {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.search(new RegExp(`import\\s+['"]${escaped}['"]\\s*;`));
}

describe('Editor visual system contract', () => {
  let baseCss = '';
  let themeCss = '';
  let indexSource = '';
  let assetManagerSource = '';

  beforeAll(async () => {
    [baseCss, themeCss, indexSource, assetManagerSource] = await Promise.all([
      readFile(resolve('src/renderer/styles/base.css'), 'utf8'),
      readFile(resolve('src/renderer/styles/editorTheme.css'), 'utf8'),
      readFile(resolve('src/renderer/index.tsx'), 'utf8'),
      readFile(
        resolve('src/renderer/features/assets/AssetManager.tsx'),
        'utf8',
      ),
    ]);
  });

  it('loads the visual theme after the base Editor styles and defines its core tokens', () => {
    const baseImport = importPosition(indexSource, './styles/base.css');
    const editorImport = importPosition(indexSource, './styles/editor.css');
    const themeImport = importPosition(indexSource, './styles/editorTheme.css');

    expect(baseImport).toBeGreaterThanOrEqual(0);
    expect(editorImport).toBeGreaterThan(baseImport);
    expect(themeImport).toBeGreaterThan(editorImport);

    const baseRoot = rule(baseCss, ':root');
    expect(baseRoot).toMatch(/--canvas:\s*#f3f5f7\b/i);
    expect(baseRoot).toMatch(/--primary:\s*#514f9d\b/i);
    expect(baseRoot).toMatch(/--font-display:\s*[^;}]+/i);
    expect(baseRoot).toMatch(/--font-body:\s*[^;}]+/i);
    expect(baseRoot).toMatch(/--font-mono:\s*[^;}]+/i);
    expect(baseRoot).toMatch(/font-family:\s*var\(--font-body\)/i);
  });

  it('separates workspace navigation from the nested editor-mode control', () => {
    const activeMode = rule(
      themeCss,
      "[data-toolbar-switch='workspace'] .editor-mode-button[aria-current='page']::after",
    );
    expect(activeMode).toMatch(/content:\s*(?:''|"")/);
    expect(activeMode).toMatch(/position:\s*absolute/);
    expect(activeMode).toMatch(/bottom:\s*0/);
    expect(activeMode).toMatch(/height:\s*3px/);
    expect(activeMode).toMatch(
      /background(?:-color)?:\s*var\(--primary\)/,
    );

    const editorModeSwitch = rule(
      themeCss,
      "[data-toolbar-switch='editor-mode']",
    );
    expect(editorModeSwitch).toMatch(/background:\s*var\(--control-track\)/);
    expect(editorModeSwitch).toMatch(/border:\s*1px\s+solid\s+var\(--border\)/);

    const activeEditorMode = rule(
      themeCss,
      "[data-toolbar-switch='editor-mode'] .editor-mode-button[aria-pressed='true']",
    );
    expect(activeEditorMode).toMatch(/background:\s*var\(--panel\)/);
    expect(activeEditorMode).not.toMatch(/::after/);
  });

  it('uses the primary cue line for selected authoring content', () => {
    expect(rule(themeCss, '.dialogue-list li.selected')).toMatch(
      /border-left:\s*3px\s+solid\s+var\(--primary\)/,
    );
    expect(rule(themeCss, '.asset-manager-grid button.is-selected')).toMatch(
      /box-shadow:\s*inset\s+3px\s+0\s+0\s+var\(--primary\)/,
    );
    expect(
      rule(themeCss, '.asset-manager-categories button.is-active::before'),
    ).toMatch(
      /width:\s*3px[\s\S]*background:\s*var\(--primary\)/,
    );
  });

  it('keeps asset details available in narrow layouts and exposes a visible scale focus ring', () => {
    const narrowAssetLayout = atRule(
      themeCss,
      /@media\s*\(max-width:\s*760px\)/,
    );
    const narrowDetails = rule(narrowAssetLayout, '.asset-manager-details');

    expect(narrowDetails).toMatch(/display:\s*block/);
    expect(narrowDetails).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(narrowDetails).not.toMatch(/display:\s*none/);

    const scaleFocus = rule(
      themeCss,
      '.resource-background-scale input:focus-visible',
    );
    expect(scaleFocus).toMatch(
      /outline:\s*2px\s+solid\s+var\(--focus-ring\)/,
    );
    expect(scaleFocus).toMatch(/outline-offset:\s*2px/);
    expect(scaleFocus).not.toMatch(/outline:\s*none/);
  });

  it('disables Editor transitions and animations when reduced motion is requested', () => {
    const reducedMotion = atRule(
      themeCss,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    );
    const editorMotionRule = reducedMotion.match(
      /\.editor\s+\*,\s*\.editor\s+\*::before,\s*\.editor\s+\*::after\s*\{([^}]*)\}/s,
    )?.[1] ?? '';

    expect(editorMotionRule).toMatch(
      /animation-duration:\s*0\.01ms\s*!important/,
    );
    expect(editorMotionRule).toMatch(
      /animation-iteration-count:\s*1\s*!important/,
    );
    expect(editorMotionRule).toMatch(
      /transition-duration:\s*0\.01ms\s*!important/,
    );
  });

  it('does not render the redundant Asset Manager help copy', () => {
    expect(assetManagerSource).not.toContain('labels.resource.managerHelp');
  });
});
