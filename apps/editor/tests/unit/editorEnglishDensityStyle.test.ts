import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? '';
}

describe('English Editor density style contract', () => {
  it('compacts fixed scene controls only for the English interface', async () => {
    const [css, appSource] = await Promise.all([
      readFile(resolve('src/renderer/styles/editor.css'), 'utf8'),
      readFile(resolve('src/renderer/App.tsx'), 'utf8'),
    ]);

    expect(appSource).toContain(
      'data-editor-language={settings.language}',
    );
    expect(
      rule(css, ".editor[data-editor-language='en-US'] .scene-panel"),
    ).toContain(
      'padding-left: 14px',
    );
    expect(
      rule(css, ".editor[data-editor-language='en-US'] .scene-switcher"),
    ).toContain(
      'gap: 6px',
    );
    expect(
      rule(css, ".editor[data-editor-language='en-US'] .scene-menu-trigger"),
    ).toContain(
      'font-size: 13px',
    );
    expect(
      rule(css, ".editor[data-editor-language='en-US'] .scene-inline-action"),
    ).toContain(
      'font-size: 11px',
    );
  });

  it('fits every timeline inspector heading without scaling authored input text', async () => {
    const [css, inspectorSource] = await Promise.all([
      readFile(resolve('src/renderer/styles/editor.css'), 'utf8'),
      readFile(
        resolve(
          'src/renderer/features/form-editor/InspectorPanel.tsx',
        ),
        'utf8',
      ),
    ]);

    expect(
      inspectorSource.match(
        /className="panel-heading timeline-panel-heading"/g,
      ),
    ).toHaveLength(8);
    expect(
      rule(
        css,
        ".editor[data-editor-language='en-US'] .timeline-panel-heading",
      ),
    ).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(
      rule(
        css,
        ".editor[data-editor-language='en-US'] .timeline-panel-heading h2",
      ),
    ).toContain('font-size: 13px');
    expect(
      rule(
        css,
        ".editor[data-editor-language='en-US'] .timeline-panel-heading .panel-heading-actions",
      ),
    ).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(
      rule(
        css,
        ".editor[data-editor-language='en-US'] .timeline-panel-heading .panel-heading-action",
      ),
    ).toContain('font-size: 11px');

    const englishRules =
      css.match(/\.editor\[data-editor-language='en-US'\][^}]+}/g) ?? [];
    expect(
      englishRules.filter((englishRule) =>
        /\b(?:input|textarea|select)\b/.test(englishRule),
      ),
    ).toEqual([]);
  });
});
