/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 CodeEditor 的剧情代码与页面样式草稿。
 * 测试覆盖：权威投影、草稿、Apply、场景切换、冲突和语言重投影。
 */

import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CodeEditor,
  type CodeEditorDraft,
  type CodeEditorHandle,
  type CodeEditorTarget,
} from '../../src/renderer/features/code-editor/CodeEditor';
import { getCodeTextareaEdit } from '../../src/renderer/features/code-editor/codeTextareaEditing';
import { projectSceneToReadonlyCode } from '../../src/renderer/features/code-editor/sceneCodeProjection';
import { CG_GALLERY_SCENE_ID } from '../../src/renderer/features/start-screen/startScreenScene';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { EditorLanguage } from '../../src/shared/editorSettingsProtocol';
import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
} from '../../src/shared/projectTypes';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
} from '../../src/shared/projectTypes';

const sceneOne: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-one',
  name: '醒来',
  backgroundAssetId: 'bedroom',
  backgroundScalePercent: 80,
  nodes: [
    {
      id: 'dialogue-one',
      type: 'dialogue',
      speaker: '格里高尔',
      text: '我发生了什么？',
      voiceAssetId: null,
    },
  ],
};

const sceneTwo: SceneDocument = {
  schemaVersion: 1,
  id: 'scene-two',
  name: '门外',
  backgroundAssetId: null,
  backgroundScalePercent: 100,
  nodes: [
    {
      id: 'dialogue-two',
      type: 'dialogue',
      speaker: '',
      text: '母亲正在敲门。',
      voiceAssetId: null,
    },
  ],
};

const assets: AssetDocument[] = [
  { id: 'bedroom', type: 'image', displayName: 'Bedroom' },
];

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function projectWithScenes(scenes: SceneDocument[]): ProjectDocument {
  return {
    schemaVersion: 1,
    id: 'readonly-code-project',
    name: 'Metamorphosis',
    entrySceneId: 'scene-one',
    startScreen: {
      title: 'Metamorphosis',
      eyebrow: 'A VN ENGINE STORY',
      backgroundAssetId: null,
      musicAssetId: null,
      style: DEFAULT_START_SCREEN_STYLE,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      style: DEFAULT_CG_GALLERY_STYLE,
    },
    scenes,
  };
}

describe('CodeEditor projection and page styling', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSceneChange = vi.fn().mockResolvedValue(undefined);
  const onUpdateStartScreenStyle = vi.fn().mockResolvedValue(true);
  const onUpdateCgGalleryStyle = vi.fn().mockResolvedValue(true);
  const onReplaceSceneContent = vi.fn().mockResolvedValue(true);
  const onSelectStartScreen = vi.fn().mockResolvedValue(undefined);
  const onSelectCgGallery = vi.fn().mockResolvedValue(undefined);
  const onDraftDirtyChange = vi.fn();
  const onDraftChange = vi.fn();
  const onStartPreview = vi.fn();
  const codeEditorRef = createRef<CodeEditorHandle>();

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onSceneChange.mockClear();
    onUpdateStartScreenStyle.mockClear();
    onUpdateCgGalleryStyle.mockClear();
    onReplaceSceneContent.mockClear();
    onSelectStartScreen.mockClear();
    onSelectCgGallery.mockClear();
    onDraftDirtyChange.mockClear();
    onDraftChange.mockClear();
    onStartPreview.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderCodeEditor(
    language: EditorLanguage,
    project: ProjectDocument,
    scene: SceneDocument,
    target: CodeEditorTarget = { kind: 'story', scene },
    persistedDraft: CodeEditorDraft | null = null,
    isBusy = false,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <EditorI18nProvider language={language}>
          <CodeEditor
            project={project}
            ref={codeEditorRef}
            target={target}
            assets={assets}
            isBusy={isBusy}
            onSceneChange={onSceneChange}
            onSelectStartScreen={onSelectStartScreen}
            onSelectCgGallery={onSelectCgGallery}
            onUpdateStartScreenStyle={onUpdateStartScreenStyle}
            onUpdateCgGalleryStyle={onUpdateCgGalleryStyle}
            onReplaceSceneContent={onReplaceSceneContent}
            draftKey={`${project.id}:${target.kind}:${target.kind === 'story' ? target.scene.id : ''}`}
            persistedDraft={persistedDraft}
            onDraftChange={onDraftChange}
            onDraftDirtyChange={onDraftDirtyChange}
            onStartPreview={onStartPreview}
          />
        </EditorI18nProvider>,
      );
    });
  }

  function sourceElement(): HTMLTextAreaElement {
    const source = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label]',
    );
    if (!source) {
      throw new Error('missing editable scene code');
    }
    return source;
  }

  function setTextareaValue(
    textarea: HTMLTextAreaElement,
    value: string,
  ): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    nativeSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pressEditorKey(
    textarea: HTMLTextAreaElement,
    key: 'Enter' | 'Escape' | 'Shift' | 'Tab',
    options: {
      altKey?: boolean;
      ctrlKey?: boolean;
      isComposing?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
    } = {},
  ): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      altKey: options.altKey ?? false,
      bubbles: true,
      cancelable: true,
      ctrlKey: options.ctrlKey ?? false,
      isComposing: options.isComposing ?? false,
      key,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
    });
    textarea.dispatchEvent(event);
    return event;
  }

  function editableSource(): HTMLTextAreaElement {
    const editor = container.querySelector<HTMLTextAreaElement>('textarea');
    if (!editor) {
      throw new Error('missing editable style source');
    }
    return editor;
  }

  function buttonNamed(name: string): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === name,
    );
    if (!button) {
      throw new Error(`missing ${name} button`);
    }
    return button;
  }

  it('starts story editing from the canonical authoritative projection', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('zh-CN', project, sceneOne);

    expect(sourceElement().getAttribute('aria-label')).toBe('场景代码');
    expect(sourceElement().value).toBe(
      projectSceneToReadonlyCode({ project, scene: sceneOne, assets }).source,
    );
    expect(container.querySelector('pre')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
    expect(buttonNamed('应用代码').disabled).toBe(true);
  });

  it('omits redundant sync and editor-mode labels but keeps the dirty warning', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);

    expect(container.textContent).not.toContain('Synced with the current page');
    expect(container.textContent).not.toContain('Editable story code');

    await act(async () => {
      setTextareaValue(
        sourceElement(),
        sourceElement().value.replace('我发生了什么？', 'Local edit'),
      );
    });
    expect(container.textContent).toContain('Unapplied local draft');
  });

  it('inserts a two-space Tab at the caret and restores the caret after React renders', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = 'first\n  second\nthird';
    await act(async () => setTextareaValue(editor, source));
    const caret = source.indexOf('second');
    editor.setSelectionRange(caret, caret);

    let event!: KeyboardEvent;
    await act(async () => {
      event = pressEditorKey(editor, 'Tab');
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.value).toBe('first\n    second\nthird');
    expect(editor.selectionStart).toBe(caret + 2);
    expect(editor.selectionEnd).toBe(caret + 2);
  });

  it('indents and unindents every selected line while preserving the logical selection', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = 'alpha\n  beta\ngamma';
    await act(async () => setTextareaValue(editor, source));
    const selectionStart = 2;
    const selectionEnd = source.indexOf('beta') + 'beta'.length;
    editor.setSelectionRange(selectionStart, selectionEnd, 'backward');

    let indentEvent!: KeyboardEvent;
    await act(async () => {
      indentEvent = pressEditorKey(editor, 'Tab');
    });

    expect(indentEvent.defaultPrevented).toBe(true);
    expect(editor.value).toBe('  alpha\n    beta\ngamma');
    expect(editor.selectionStart).toBe(selectionStart + 2);
    expect(editor.selectionEnd).toBe(selectionEnd + 4);
    expect(editor.selectionDirection).toBe('backward');

    let unindentEvent!: KeyboardEvent;
    await act(async () => {
      unindentEvent = pressEditorKey(editor, 'Tab', { shiftKey: true });
    });

    expect(unindentEvent.defaultPrevented).toBe(true);
    expect(editor.value).toBe(source);
    expect(editor.selectionStart).toBe(selectionStart);
    expect(editor.selectionEnd).toBe(selectionEnd);
    expect(editor.selectionDirection).toBe('backward');
  });

  it('does not indent the next line when a multiline selection ends at its start', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = 'alpha\nbeta\ngamma';
    await act(async () => setTextareaValue(editor, source));
    const thirdLineStart = source.indexOf('gamma');
    editor.setSelectionRange(0, thirdLineStart);

    await act(async () => {
      pressEditorKey(editor, 'Tab');
    });

    expect(editor.value).toBe('  alpha\n  beta\ngamma');
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(thirdLineStart + 4);
  });

  it.each([
    ['Tab', false],
    ['Shift+Tab', true],
  ] as const)(
    'lets %s leave after Escape, then restores Tab indentation',
    async (_label, shiftKey) => {
      const project = projectWithScenes([sceneOne, sceneTwo]);
      await renderCodeEditor('en-US', project, sceneOne);
      const editor = sourceElement();
      const source = '  line';
      await act(async () => setTextareaValue(editor, source));
      const caret = source.indexOf('line');
      editor.setSelectionRange(caret, caret);

      let escapeEvent!: KeyboardEvent;
      let focusExitEvent!: KeyboardEvent;
      await act(async () => {
        escapeEvent = pressEditorKey(editor, 'Escape');
        if (shiftKey) {
          pressEditorKey(editor, 'Shift', { shiftKey: true });
        }
        focusExitEvent = pressEditorKey(editor, 'Tab', { shiftKey });
      });

      expect(escapeEvent.defaultPrevented).toBe(false);
      expect(focusExitEvent.defaultPrevented).toBe(false);
      expect(editor.value).toBe(source);
      expect(editor.selectionStart).toBe(caret);
      expect(editor.selectionEnd).toBe(caret);

      let resumedIndentEvent!: KeyboardEvent;
      await act(async () => {
        resumedIndentEvent = pressEditorKey(editor, 'Tab');
      });

      expect(resumedIndentEvent.defaultPrevented).toBe(true);
      expect(editor.value).toBe('    line');
      expect(editor.selectionStart).toBe(caret + 2);
      expect(editor.selectionEnd).toBe(caret + 2);
    },
  );

  it.each([
    ['Ctrl+Tab', 'Tab', { ctrlKey: true }],
    ['Ctrl+Enter', 'Enter', { ctrlKey: true }],
    ['Meta+Tab', 'Tab', { metaKey: true }],
    ['Meta+Enter', 'Enter', { metaKey: true }],
    ['Alt+Tab', 'Tab', { altKey: true }],
    ['Alt+Enter', 'Enter', { altKey: true }],
  ] as const)(
    'does not intercept %s',
    async (_label, key, options) => {
      const project = projectWithScenes([sceneOne, sceneTwo]);
      await renderCodeEditor('en-US', project, sceneOne);
      const editor = sourceElement();
      const source = '  line';
      await act(async () => setTextareaValue(editor, source));
      const caret = source.indexOf('line');
      editor.setSelectionRange(caret, caret);

      let event!: KeyboardEvent;
      await act(async () => {
        event = pressEditorKey(editor, key, options);
      });

      expect(event.defaultPrevented).toBe(false);
      expect(editor.value).toBe(source);
      expect(editor.selectionStart).toBe(caret);
      expect(editor.selectionEnd).toBe(caret);
    },
  );

  it('does not intercept Enter while an IME composition is active', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = '  输入中';
    await act(async () => setTextareaValue(editor, source));
    const caret = source.length;
    editor.setSelectionRange(caret, caret);

    let event!: KeyboardEvent;
    await act(async () => {
      event = pressEditorKey(editor, 'Enter', { isComposing: true });
    });

    expect(event.isComposing).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(editor.value).toBe(source);
    expect(editor.selectionStart).toBe(caret);
    expect(editor.selectionEnd).toBe(caret);
  });

  it('inherits the current line indentation when Enter starts the next line', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = 'scene {\n    say("one")\n}';
    await act(async () => setTextareaValue(editor, source));
    const caret = source.indexOf('\n}');
    editor.setSelectionRange(caret, caret);

    let event!: KeyboardEvent;
    await act(async () => {
      event = pressEditorKey(editor, 'Enter');
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.value).toBe('scene {\n    say("one")\n    \n}');
    expect(editor.selectionStart).toBe(caret + 5);
    expect(editor.selectionEnd).toBe(caret + 5);
  });

  it('expands braces on Enter and places the caret on the indented blank line', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    const source = 'scene("Opening") {}';
    await act(async () => setTextareaValue(editor, source));
    const caret = source.indexOf('}');
    editor.setSelectionRange(caret, caret);

    await act(async () => {
      pressEditorKey(editor, 'Enter');
    });

    expect(editor.value).toBe('scene("Opening") {\n  \n}');
    expect(editor.selectionStart).toBe(caret + 3);
    expect(editor.selectionEnd).toBe(caret + 3);
  });

  it('handles normalized CRLF input and indentation-only blank lines without corrupting offsets', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const editor = sourceElement();
    await act(async () => setTextareaValue(editor, 'root\r\n    \r\nend'));
    // The HTML textarea value API normalizes CRLF to LF before React receives it.
    expect(editor.value).toBe('root\n    \nend');
    const blankLineEnd = editor.value.indexOf('\nend');
    editor.setSelectionRange(blankLineEnd, blankLineEnd);

    await act(async () => {
      pressEditorKey(editor, 'Enter');
    });

    expect(editor.value).toBe('root\n    \n    \nend');
    expect(editor.value).not.toContain('\r');
    expect(editor.selectionStart).toBe(blankLineEnd + 5);
    expect(editor.selectionEnd).toBe(blankLineEnd + 5);
  });

  it('preserves CRLF line endings when the editing primitive receives raw source text', () => {
    const source = 'scene {\r\n  say("one")\r\n}';
    const caret = source.indexOf('\r\n}');

    const edit = getCodeTextareaEdit({
      source,
      selectionStart: caret,
      selectionEnd: caret,
      key: 'Enter',
      shiftKey: false,
    });

    expect(edit).toEqual({
      source: 'scene {\r\n  say("one")\r\n  \r\n}',
      selectionStart: caret + 4,
      selectionEnd: caret + 4,
    });
  });

  it('uses the same keyboard editing behavior in the page-style code textarea', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = editableSource();
    const source = 'main_screen(\n  layout: center\n)';
    await act(async () => setTextareaValue(editor, source));
    const caret = source.indexOf('layout');
    editor.setSelectionRange(caret, caret);

    await act(async () => {
      pressEditorKey(editor, 'Tab');
    });

    expect(editor.value).toBe('main_screen(\n    layout: center\n)');
    expect(editor.selectionStart).toBe(caret + 2);

    await act(async () => setTextareaValue(editor, 'main_screen()'));
    const closingParenthesis = editor.value.indexOf(')');
    editor.setSelectionRange(closingParenthesis, closingParenthesis);
    await act(async () => {
      pressEditorKey(editor, 'Enter');
    });

    expect(editor.value).toBe('main_screen(\n  \n)');
    expect(editor.selectionStart).toBe(closingParenthesis + 3);
  });

  it('leaves Tab and Enter untouched while the code textarea is locked', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'story', scene: sceneOne },
      null,
      true,
    );
    const editor = sourceElement();
    const source = editor.value;
    const caret = source.indexOf('say(');
    editor.setSelectionRange(caret, caret);

    let tabEvent!: KeyboardEvent;
    let enterEvent!: KeyboardEvent;
    await act(async () => {
      tabEvent = pressEditorKey(editor, 'Tab');
      enterEvent = pressEditorKey(editor, 'Enter');
    });

    expect(editor.disabled).toBe(true);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(editor.value).toBe(source);
    expect(editor.selectionStart).toBe(caret);
    expect(editor.selectionEnd).toBe(caret);
  });

  it('parses and atomically applies valid story code', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('zh-CN', project, sceneOne);
    const editor = sourceElement();
    await act(async () => {
      setTextareaValue(
        editor,
        editor.value.replace('我发生了什么？', '这是代码页修改的对白。'),
      );
    });

    await act(async () => {
      buttonNamed('应用代码').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(onReplaceSceneContent).toHaveBeenCalledOnce();
    expect(onReplaceSceneContent).toHaveBeenCalledWith(
      sceneOne.id,
      expect.objectContaining({
        name: sceneOne.name,
        nodes: [
          expect.objectContaining({
            type: 'dialogue',
            speaker: '格里高尔',
            text: '这是代码页修改的对白。',
          }),
        ],
      }),
    );
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps invalid story code local, blocks strict flush, and permits leaving', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const invalidSource = sourceElement().value.replace(
      'say(',
      'unknown_command(',
    );
    await act(async () => setTextareaValue(sourceElement(), invalidSource));

    await act(async () => {
      await expect(codeEditorRef.current!.flushPendingDraft()).resolves.toBe(
        false,
      );
      await expect(codeEditorRef.current!.prepareToLeave()).resolves.toBe(true);
    });

    expect(onReplaceSceneContent).not.toHaveBeenCalled();
    expect(sourceElement().value).toBe(invalidSource);
    expect(buttonNamed('Apply code').disabled).toBe(true);
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.stringContaining(`story:${sceneOne.id}`),
      { source: invalidSource, baseSource: expect.any(String) },
    );
  });

  it('single-flights story Apply and its strict flush boundary', async () => {
    const pendingUpdate = deferred<boolean>();
    onReplaceSceneContent.mockReturnValueOnce(pendingUpdate.promise);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    await act(async () => {
      setTextareaValue(
        sourceElement(),
        sourceElement().value.replace(
          '我发生了什么？',
          'A submitted edit.',
        ),
      );
    });

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = codeEditorRef.current!.flushPendingDraft();
      second = codeEditorRef.current!.flushPendingDraft();
    });
    expect(first).toBe(second);
    expect(onReplaceSceneContent).toHaveBeenCalledOnce();
    expect(sourceElement().disabled).toBe(true);

    await act(async () => {
      pendingUpdate.resolve(true);
      await expect(first).resolves.toBe(true);
    });
    expect(sourceElement().disabled).toBe(false);
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('preserves story source as a conflict when another editor changes authority', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('en-US', project, sceneOne);
    const localDraft = sourceElement().value.replace(
      '我发生了什么？',
      'Local Code draft.',
    );
    await act(async () => setTextareaValue(sourceElement(), localDraft));

    const authorityScene: SceneDocument = {
      ...sceneOne,
      nodes: [{
        ...(sceneOne.nodes[0] as Extract<
          SceneDocument['nodes'][number],
          { type: 'dialogue' }
        >),
        text: 'Changed from Form.',
      }],
    };
    await renderCodeEditor(
      'en-US',
      projectWithScenes([authorityScene, sceneTwo]),
      authorityScene,
    );

    expect(sourceElement().value).toBe(localDraft);
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('changed in another view');
    await act(async () => {
      await expect(codeEditorRef.current!.flushPendingDraft()).resolves.toBe(
        false,
      );
      await expect(codeEditorRef.current!.prepareToLeave()).resolves.toBe(true);
    });
    expect(onReplaceSceneContent).not.toHaveBeenCalled();
  });

  it('requests scene navigation and reprojects the scene supplied by the authority', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('zh-CN', project, sceneOne);
    const sceneSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="选择当前场景"]',
    );
    if (!sceneSelect) {
      throw new Error('missing scene selector');
    }

    await act(async () => {
      sceneSelect.value = sceneTwo.id;
      sceneSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSceneChange).toHaveBeenCalledWith(sceneTwo.id);

    await renderCodeEditor('zh-CN', project, sceneTwo);
    expect(sourceElement().value).toBe(
      projectSceneToReadonlyCode({ project, scene: sceneTwo, assets }).source,
    );
    expect(sourceElement().value).toContain('母亲正在敲门。');
  });

  it('reprojects a new authoritative snapshot even when scene identity is unchanged', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('zh-CN', project, sceneOne);
    const previousSource = sourceElement().value;

    const updatedScene: SceneDocument = {
      ...sceneOne,
      nodes: [
        {
          id: 'dialogue-one',
          type: 'dialogue',
          speaker: '格里高尔',
          text: '我的声音也变了。',
          voiceAssetId: null,
        },
      ],
    };
    const updatedProject = projectWithScenes([updatedScene, sceneTwo]);
    await renderCodeEditor('zh-CN', updatedProject, updatedScene);

    expect(sourceElement().value).not.toBe(previousSource);
    expect(sourceElement().value).toBe(
      projectSceneToReadonlyCode({
        project: updatedProject,
        scene: updatedScene,
        assets,
      }).source,
    );
    expect(sourceElement().value).toContain('我的声音也变了。');
  });

  it('localizes the section chrome while preserving the DSL source', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor('zh-CN', project, sceneOne);
    const chineseSource = sourceElement().value;
    expect(container.querySelector('h1')?.textContent).toBe('代码');

    await renderCodeEditor('en-US', project, sceneOne);
    expect(container.querySelector('h1')?.textContent).toBe('Code');
    expect(sourceElement().getAttribute('aria-label')).toBe('Scene code');
    expect(sourceElement().value).toBe(chineseSource);
    expect(
      container.querySelector('[aria-label="Select current scene"]'),
    ).not.toBeNull();
  });

  it('localizes projection diagnostics without changing the stable reference', async () => {
    const sceneWithMissingAsset: SceneDocument = {
      ...sceneOne,
      backgroundAssetId: 'missing-background',
    };
    const project = projectWithScenes([sceneWithMissingAsset, sceneTwo]);

    await renderCodeEditor('zh-CN', project, sceneWithMissingAsset);
    const chineseDiagnostics = container.querySelector(
      '[aria-label="代码投影提示"]',
    );
    expect(chineseDiagnostics?.textContent).toContain(
      '引用的资源不存在: missing-background',
    );

    await renderCodeEditor('en-US', project, sceneWithMissingAsset);
    const englishDiagnostics = container.querySelector(
      '[aria-label="Code projection diagnostics"]',
    );
    expect(englishDiagnostics?.textContent).toContain(
      'Referenced asset is missing: missing-background',
    );
  });

  it('edits and applies title-screen style without exposing raw CSS execution', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'zh-CN',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="页面样式代码"]',
    );
    if (!editor) {
      throw new Error('missing editable title-screen style source');
    }
    expect(editor.value).toContain('main_screen(');
    expect(editor.value).toContain('layout: split-right');
    expect(container.querySelector('pre')).toBeNull();

    await act(async () => {
      setTextareaValue(editor, editor.value.replace(
        'layout: split-right',
        'layout: center',
      ));
    });
    const applyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '应用样式',
    );
    await act(async () => {
      applyButton?.click();
      await Promise.resolve();
    });
    expect(onUpdateStartScreenStyle).toHaveBeenCalledWith({
      ...DEFAULT_START_SCREEN_STYLE,
      layout: 'center',
    });
  });

  it('keeps invalid CG style local and reports a precise diagnostic', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'cg-gallery' },
    );
    const editor = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Page style code"]',
    );
    if (!editor) {
      throw new Error('missing editable CG style source');
    }

    await act(async () => {
      setTextareaValue(editor, editor.value.replace('gap: 16', 'gap: 999'));
    });
    expect(container.querySelector('[aria-label="Code projection diagnostics"]')
      ?.textContent).toContain('Invalid value or range: gap');
    const applyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Apply style',
    );
    expect(applyButton?.disabled).toBe(true);
    expect(onUpdateCgGalleryStyle).not.toHaveBeenCalled();
  });

  it('single-flights Apply and disables editing until the mutation settles', async () => {
    const pendingUpdate = deferred<boolean>();
    onUpdateStartScreenStyle.mockReturnValueOnce(pendingUpdate.promise);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = editableSource();
    await act(async () => {
      setTextareaValue(
        editor,
        editor.value.replace('layout: split-right', 'layout: center'),
      );
    });

    let firstFlush!: Promise<boolean>;
    let secondFlush!: Promise<boolean>;
    act(() => {
      firstFlush = codeEditorRef.current!.flushPendingDraft();
      secondFlush = codeEditorRef.current!.flushPendingDraft();
    });

    expect(firstFlush).toBe(secondFlush);
    expect(onUpdateStartScreenStyle).toHaveBeenCalledOnce();
    expect(editableSource().disabled).toBe(true);
    expect(buttonNamed('Applying…').disabled).toBe(true);

    await act(async () => {
      pendingUpdate.resolve(true);
      await expect(firstFlush).resolves.toBe(true);
    });
    expect(editableSource().disabled).toBe(false);
    expect(buttonNamed('Apply style').disabled).toBe(true);
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('waits for the active Apply before navigating away', async () => {
    const pendingUpdate = deferred<boolean>();
    onUpdateStartScreenStyle.mockReturnValueOnce(pendingUpdate.promise);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace(
          'layout: split-right',
          'layout: center',
        ),
      );
    });

    act(() => buttonNamed('Apply style').click());
    const sceneSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Select current scene"]',
    );
    if (!sceneSelect) {
      throw new Error('missing Code scene selector');
    }
    act(() => {
      sceneSelect.value = CG_GALLERY_SCENE_ID;
      sceneSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSelectCgGallery).not.toHaveBeenCalled();
    expect(onUpdateStartScreenStyle).toHaveBeenCalledOnce();

    await act(async () => {
      pendingUpdate.resolve(true);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(onSelectCgGallery).toHaveBeenCalledOnce();
  });

  it('does not navigate when flushing the current draft fails', async () => {
    onUpdateStartScreenStyle.mockResolvedValueOnce(false);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace(
          'layout: split-right',
          'layout: center',
        ),
      );
    });
    const sceneSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Select current scene"]',
    );
    if (!sceneSelect) {
      throw new Error('missing Code scene selector');
    }
    await act(async () => {
      sceneSelect.value = CG_GALLERY_SCENE_ID;
      sceneSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(onUpdateStartScreenStyle).toHaveBeenCalledOnce();
    expect(onSelectCgGallery).not.toHaveBeenCalled();
    expect(editableSource().value).toContain('layout: center');
  });

  it.each([
    ['returns false', () => Promise.resolve(false)],
    ['rejects', () => Promise.reject(new Error('backend unavailable'))],
  ])('keeps the draft when the backend %s', async (_label, response) => {
    onUpdateStartScreenStyle.mockImplementationOnce(response);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = editableSource();
    const draft = editor.value.replace(
      'layout: split-right',
      'layout: center',
    );
    await act(async () => setTextareaValue(editor, draft));

    let flushed = true;
    await act(async () => {
      flushed = await codeEditorRef.current!.flushPendingDraft();
    });

    expect(flushed).toBe(false);
    expect(editableSource().value).toBe(draft);
    expect(editableSource().disabled).toBe(false);
    expect(buttonNamed('Apply style').disabled).toBe(false);
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('preserves the draft as a conflict when authority changes during Apply', async () => {
    const pendingUpdate = deferred<boolean>();
    onUpdateStartScreenStyle.mockReturnValueOnce(pendingUpdate.promise);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = editableSource();
    const draft = editor.value.replace(
      'layout: split-right',
      'layout: center',
    );
    await act(async () => setTextareaValue(editor, draft));

    let flush!: Promise<boolean>;
    act(() => {
      flush = codeEditorRef.current!.flushPendingDraft();
    });
    const concurrentProject = {
      ...project,
      startScreen: {
        ...project.startScreen,
        style: { ...project.startScreen.style, layout: 'split-left' as const },
      },
    };
    await renderCodeEditor(
      'en-US',
      concurrentProject,
      sceneOne,
      { kind: 'start-screen' },
    );
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('changed in another view');

    await act(async () => {
      pendingUpdate.resolve(true);
      await expect(flush).resolves.toBe(false);
    });
    expect(editableSource().value).toBe(draft);
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('changed in another view');
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('accepts the requested style when that same authority arrives during Apply', async () => {
    const pendingUpdate = deferred<boolean>();
    onUpdateStartScreenStyle.mockReturnValueOnce(pendingUpdate.promise);
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'start-screen' },
    );
    const editor = editableSource();
    const draft = editor.value.replace(
      'layout: split-right',
      'layout: center',
    );
    await act(async () => setTextareaValue(editor, draft));
    let flush!: Promise<boolean>;
    act(() => {
      flush = codeEditorRef.current!.flushPendingDraft();
    });
    await renderCodeEditor(
      'en-US',
      {
        ...project,
        startScreen: {
          ...project.startScreen,
          style: { ...project.startScreen.style, layout: 'center' },
        },
      },
      sceneOne,
      { kind: 'start-screen' },
    );

    await act(async () => {
      pendingUpdate.resolve(true);
      await expect(flush).resolves.toBe(true);
    });
    expect(editableSource().value).toBe(draft);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('isolates drafts by project and page target', async () => {
    const firstProject = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      firstProject,
      sceneOne,
      { kind: 'start-screen' },
    );
    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace(
          'layout: split-right',
          'layout: center',
        ),
      );
    });

    await renderCodeEditor(
      'en-US',
      firstProject,
      sceneOne,
      { kind: 'cg-gallery' },
    );
    expect(editableSource().value).toContain('cg_gallery(');
    expect(editableSource().value).not.toContain('layout: center');

    const secondProject = {
      ...projectWithScenes([sceneOne, sceneTwo]),
      id: 'second-project',
      cgGallery: {
        ...firstProject.cgGallery,
        style: { ...DEFAULT_CG_GALLERY_STYLE, gapPx: 24 },
      },
    };
    await renderCodeEditor(
      'en-US',
      secondProject,
      sceneOne,
      { kind: 'cg-gallery' },
    );
    expect(editableSource().value).toContain('gap: 24');
    expect(onUpdateStartScreenStyle).not.toHaveBeenCalled();
    expect(onUpdateCgGalleryStyle).not.toHaveBeenCalled();
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('uses defaults locally and reloads the latest authoritative style', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    const customizedProject = {
      ...project,
      startScreen: {
        ...project.startScreen,
        style: { ...DEFAULT_START_SCREEN_STYLE, layout: 'split-left' as const },
      },
    };
    await renderCodeEditor(
      'en-US',
      customizedProject,
      sceneOne,
      { kind: 'start-screen' },
    );
    expect(editableSource().value).toContain('layout: split-left');

    await act(async () => buttonNamed('Use defaults').click());
    expect(editableSource().value).toContain('layout: split-right');
    expect(onUpdateStartScreenStyle).not.toHaveBeenCalled();
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(true);

    await act(async () => buttonNamed('Cancel').click());
    expect(editableSource().value).toContain('layout: split-left');
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace('layout: split-left', 'layout: center'),
      );
    });
    const latestProject = {
      ...customizedProject,
      startScreen: {
        ...customizedProject.startScreen,
        style: { ...DEFAULT_START_SCREEN_STYLE, layout: 'split-right' as const },
      },
    };
    await renderCodeEditor(
      'en-US',
      latestProject,
      sceneOne,
      { kind: 'start-screen' },
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    await act(async () => buttonNamed('Reload saved style').click());
    expect(editableSource().value).toContain('layout: split-right');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onDraftDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('exposes the same flush boundary used by preview and save', async () => {
    const project = projectWithScenes([sceneOne, sceneTwo]);
    await renderCodeEditor(
      'en-US',
      project,
      sceneOne,
      { kind: 'cg-gallery' },
    );
    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace('gap: 16', 'gap: 20'),
      );
    });

    await act(async () => {
      await expect(codeEditorRef.current!.flushPendingDraft()).resolves.toBe(
        true,
      );
    });
    expect(onUpdateCgGalleryStyle).toHaveBeenCalledWith({
      ...DEFAULT_CG_GALLERY_STYLE,
      gapPx: 20,
    });

    await act(async () => {
      setTextareaValue(
        editableSource(),
        editableSource().value.replace('gap: 20', 'gap: 24'),
      );
    });
    await act(async () => {
      buttonNamed('Preview full page').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(onUpdateCgGalleryStyle).toHaveBeenLastCalledWith({
      ...DEFAULT_CG_GALLERY_STYLE,
      gapPx: 24,
    });
    expect(onUpdateCgGalleryStyle).toHaveBeenCalledTimes(2);
    expect(onStartPreview).toHaveBeenCalledOnce();
  });
});
