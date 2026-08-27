// @vitest-environment jsdom

/**
 * 文件主要作用：验证 Editor localization 的行为。
 * 测试覆盖：`Editor localization`。
 */

import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly';

import {
  EditorI18nProvider,
  getEditorLabels,
  useEditorLabels,
} from '../../src/renderer/i18n/editorLocalization';
import {
  applyDialogueBlockLocalization,
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  registerDialogueBlock,
} from '../../src/renderer/features/block-editor/blocks/dialogueBlock';
import { createBlockEditorToolbox } from '../../src/renderer/features/block-editor/toolbox';
import {
  applyStartScreenBlocksLocalization,
  renderStartScreenBlocks,
  START_SCREEN_BLOCK_FIELDS,
  START_SCREEN_BLOCK_IDS,
} from '../../src/renderer/features/start-screen/startScreenBlocks';
import type { ProjectDocument } from '../../src/shared/projectTypes';

function StatefulProbe({ onMount }: { onMount: () => void }) {
  const labels = useEditorLabels();
  const [authorText, setAuthorText] = useState('作者原文');
  useEffect(onMount, [onMount]);
  return (
    <label>
      {labels.inspector.text}
      <input
        aria-label="author-text"
        value={authorText}
        onChange={(event) => setAuthorText(event.target.value)}
      />
    </label>
  );
}

describe('Editor localization', () => {
  it('switches Context labels without remounting or resetting author input', async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onMount = vi.fn();
    await act(async () => {
      root.render(
        <EditorI18nProvider language="zh-CN">
          <StatefulProbe onMount={onMount} />
        </EditorI18nProvider>,
      );
    });
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="author-text"]',
    );
    expect(input).not.toBeNull();
    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, 'Author draft');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    await act(async () => {
      root.render(
        <EditorI18nProvider language="en-US">
          <StatefulProbe onMount={onMount} />
        </EditorI18nProvider>,
      );
    });

    expect(container.textContent).toContain('Dialogue text');
    expect(input?.value).toBe('Author draft');
    expect(onMount).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    container.remove();
  });

  it('updates Blockly chrome in place while preserving author fields', () => {
    const zh = getEditorLabels('zh-CN');
    const en = getEditorLabels('en-US');
    registerDialogueBlock(zh);
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(DIALOGUE_BLOCK_TYPE);
    block.setFieldValue('Alice', DIALOGUE_BLOCK_FIELDS.speaker);
    block.setFieldValue('作者对白', DIALOGUE_BLOCK_FIELDS.text);
    const clear = vi.spyOn(workspace, 'clear');

    applyDialogueBlockLocalization(block, en);

    expect(block.getFieldValue('VN_LABEL_SPEAKER')).toBe('Speaker');
    expect(block.getFieldValue('VN_LABEL_TEXT')).toBe('Dialogue');
    expect(block.getFieldValue(DIALOGUE_BLOCK_FIELDS.speaker)).toBe('Alice');
    expect(block.getFieldValue(DIALOGUE_BLOCK_FIELDS.text)).toBe('作者对白');
    expect(clear).not.toHaveBeenCalled();
    const toolbox = createBlockEditorToolbox(true, en);
    if (typeof toolbox === 'string' || !('contents' in toolbox)) {
      throw new Error('Expected a structured Blockly toolbox');
    }
    expect(toolbox.contents[0]).toMatchObject({ name: 'Story' });
    workspace.dispose();
  });

  it('keeps a pending title when localizing managed title-screen blocks', () => {
    const project = {
      id: 'project-1',
      name: 'Project',
      startScreen: {
        title: 'Saved title',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
      entrySceneId: 'scene-1',
      scenes: [],
    } as unknown as ProjectDocument;
    const workspace = new Blockly.Workspace();
    renderStartScreenBlocks(workspace, project.startScreen, []);
    const root = workspace.getBlockById(START_SCREEN_BLOCK_IDS.root);
    root?.setFieldValue('Pending author title', START_SCREEN_BLOCK_FIELDS.title);
    const clear = vi.spyOn(workspace, 'clear');

    applyStartScreenBlocksLocalization(
      workspace,
      project.startScreen,
      [],
      getEditorLabels('en-US'),
    );

    expect(root?.getFieldValue(START_SCREEN_BLOCK_FIELDS.title)).toBe(
      'Pending author title',
    );
    expect(root?.getFieldValue('VN_LABEL_START_SCREEN_TITLE')).toBe(
      'Title-screen game name',
    );
    expect(clear).not.toHaveBeenCalled();
    workspace.dispose();
  });
});
