/**
 * 文件主要作用：验证 PreviewPanel logic uncertainty notice 的行为。
 * 测试覆盖：`PreviewPanel logic uncertainty notice`。
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PreviewPanel } from '../../src/renderer/components/PreviewPanel';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';

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
        speaker=""
        text=""
        backgroundUrl={null}
        backgroundName={null}
        cgPreviewUncertain
      />
    </EditorI18nProvider>,
  );
}

describe('PreviewPanel logic uncertainty notice', () => {
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
    expect(renderCgPreview('zh-CN')).toContain(
      '当前位置包含 CG 显示段，请使用运行预览查看图片、等待时长和对白效果。',
    );
    expect(renderCgPreview('en-US')).toContain(
      'This position contains a CG display segment. Use game preview to check its image, lead-in timing, and dialogue.',
    );
  });
});
