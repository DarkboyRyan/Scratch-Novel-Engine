/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 PreviewPanel 提示、CG 回退和视口布局约束。
 * 测试覆盖：逻辑/CG 提示、图片失败回退、长时间线下的预览定位。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PreviewPanel } from '../../src/renderer/components/PreviewPanel';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

function cssDeclaration(property: string, value: string): RegExp {
  const escape = (input: string) =>
    input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:^|;)\\s*${escape(property)}\\s*:\\s*${escape(value)}\\s*;`,
  );
}

function renderPreview(language: 'zh-CN' | 'en-US', uncertain: boolean): string {
  return renderToStaticMarkup(
    <EditorI18nProvider language={language}>
      <PreviewPanel
        speaker=""
        text=""
        backgroundUrl={null}
        backgroundName={null}
        logicPreviewUncertain={uncertain}
      />
    </EditorI18nProvider>,
  );
}

function renderCgPreview(language: 'zh-CN' | 'en-US'): string {
  return renderToStaticMarkup(
    <EditorI18nProvider language={language}>
      <PreviewPanel
        speaker="Gregor"
        text="What happened?"
        backgroundUrl={null}
        backgroundName={null}
        cgUrl="blob:morning-cg"
        cgName="Morning CG"
        showDialogue
        cgPreviewUncertain
      />
    </EditorI18nProvider>,
  );
}

describe('PreviewPanel logic uncertainty notice', () => {
  it('localizes the empty static-stage placeholder with the Editor language', () => {
    const chinese = renderPreview('zh-CN', false);
    const english = renderPreview('en-US', false);

    expect(chinese).toContain('<p class="preview-placeholder">预览</p>');
    expect(chinese).not.toContain('>Preview</p>');
    expect(english).toContain('<p class="preview-placeholder">Preview</p>');
    expect(english).not.toContain('预览界面');
  });

  it('shows a visible bilingual instruction when form preview reaches logic', () => {
    expect(renderPreview('zh-CN', true)).toContain(
      '当前位置包含逻辑分支，请使用运行预览查看实际结果。',
    );
    expect(renderPreview('en-US', true)).toContain(
      'This position contains logic branches. Use game preview to see the actual result.',
    );
  });

  it('does not show the notice on a deterministic timeline position', () => {
    expect(renderPreview('zh-CN', false)).not.toContain(
      'preview-logic-notice',
    );
  });

  it('shows a bilingual CG timing notice for the static form preview', () => {
    const chinese = renderCgPreview('zh-CN');
    const english = renderCgPreview('en-US');

    expect(chinese).toContain(
      'CG 图片已静态显示；等待时长和实际播放顺序请使用运行预览检查。',
    );
    expect(english).toContain(
      'The CG image is shown statically. Use game preview to check its lead-in timing and actual playback order.',
    );
    expect(chinese).toContain('class="static-preview-cg-layer"');
    expect(chinese).toContain('src="blob:morning-cg"');
    expect(chinese).toContain('alt="Morning CG"');
    expect(chinese).toContain('Gregor');
    expect(chinese).toContain('What happened?');
  });

  it('falls back inside the stage and retries when the CG URL changes', () => {
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    const render = (cgUrl: string) => {
      act(() => root.render(
        <EditorI18nProvider language="en-US">
          <PreviewPanel
            speaker=""
            text=""
            backgroundUrl={null}
            backgroundName={null}
            cgUrl={cgUrl}
            cgName="Morning CG"
            showDialogue={false}
          />
        </EditorI18nProvider>,
      ));
    };

    try {
      render('blob:first-cg');
      const stage = container.querySelector('.preview-stage');
      const firstImage = container.querySelector<HTMLImageElement>(
        '.static-preview-cg-layer img',
      );
      expect(firstImage?.src).toContain('blob:first-cg');

      act(() => firstImage?.dispatchEvent(new Event('error', {
        bubbles: true,
      })));
      expect(container.querySelector('.static-preview-cg-layer img')).toBeNull();
      expect(container.querySelector('.static-preview-cg-layer')?.textContent)
        .toBe('Morning CG');

      render('blob:replacement-cg');
      expect(container.querySelector<HTMLImageElement>(
        '.static-preview-cg-layer img',
      )?.src).toContain('blob:replacement-cg');
      expect(container.querySelector('.preview-stage')).toBe(stage);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});

describe('PreviewPanel viewport layout contract', () => {
  it('keeps the preview centered in the visible workspace when a long dialogue timeline scrolls', async () => {
    const css = await readFile(
      resolve('src/renderer/styles/editor.css'),
      'utf8',
    );
    const editor = cssRule(css, '.editor');
    const scenePanel = cssRule(css, '.scene-panel');
    const previewPanel = cssRule(css, '.preview-panel');
    const inspectorPanel = cssRule(css, '.inspector-panel');

    // The timeline must scroll inside the fixed application viewport. If the
    // outer grid grows with every dialogue, align-items:center moves the
    // preview to the midpoint of the complete dialogue list instead.
    expect(editor).toMatch(cssDeclaration('height', '100vh'));
    expect(editor).toMatch(cssDeclaration('overflow', 'hidden'));
    expect(scenePanel).toMatch(cssDeclaration('min-height', '0'));
    expect(scenePanel).toMatch(cssDeclaration('overflow-y', 'auto'));

    expect(previewPanel).toMatch(cssDeclaration('min-width', '0'));
    expect(previewPanel).toMatch(cssDeclaration('min-height', '0'));
    expect(previewPanel).toMatch(cssDeclaration('overflow-y', 'auto'));
    expect(inspectorPanel).toMatch(cssDeclaration('min-height', '0'));
    expect(inspectorPanel).toMatch(cssDeclaration('overflow-y', 'auto'));
  });
});
