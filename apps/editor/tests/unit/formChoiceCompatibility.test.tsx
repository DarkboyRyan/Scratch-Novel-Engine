/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 form editor choice compatibility 的行为。
 * 测试覆盖：`form editor choice compatibility`。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorPanel } from '../../src/renderer/features/form-editor/InspectorPanel';
import { ScenePanel } from '../../src/renderer/features/form-editor/ScenePanel';
import { useFormEditor } from '../../src/renderer/features/form-editor/useFormEditor';
import type { FormEditorCommands } from '../../src/renderer/application/authoringPorts';
import { EditorI18nProvider } from '../../src/renderer/i18n/editorLocalization';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';
import type { ProjectDocument } from '../../src/shared/projectTypes';

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function waitForMacrotask() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'choice-form-project',
  name: 'Choice form compatibility',
  entrySceneId: 'scene-entry',
  startScreen: {
    title: 'Story',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-entry',
      name: 'Entry',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'choice-1',
          type: 'choice',
          options: [
            { id: 'option-a', text: '选择 A', targetSceneId: 'scene-a' },
            { id: 'option-b', text: '选择 B', targetSceneId: 'scene-b' },
          ],
        },
        { id: 'extension-1', type: 'storyExtension' },
        {
          id: 'dialogue-1',
          type: 'dialogue',
          speaker: '旁白',
          text: '后续对白',
          voiceAssetId: null,
        },
      ],
    },
    {
      schemaVersion: 1,
      id: 'scene-a',
      name: 'A',
      backgroundAssetId: null,
      nodes: [],
    },
    {
      schemaVersion: 1,
      id: 'scene-b',
      name: 'B',
      backgroundAssetId: null,
      nodes: [],
    },
  ],
};

const idleSceneRenameProps = {
  editingSceneId: null as string | null,
  sceneNameDraft: '',
  sceneRenameError: null as string | null,
  isRenamingScene: false,
  onBeginSceneRename: () => {},
  onSceneNameDraftChange: () => {},
  onCancelSceneRename: () => {},
  onCommitSceneRename: async () => true,
};

type ScenePanelHarnessProps = {
  project: ProjectDocument;
  onRenameScene: (sceneId: string, name: string) => Promise<boolean>;
  onSelectScene: (sceneId: string) => Promise<void>;
  onAddScene?: () => Promise<void>;
  showsExternalFlush?: boolean;
};

function ScenePanelHarness({
  project: activeProject,
  onRenameScene,
  onSelectScene,
  onAddScene,
  showsExternalFlush = false,
}: ScenePanelHarnessProps) {
  const activeScene = activeProject.scenes[0];
  const editor = useFormEditor({
    project: activeProject,
    isBusy: false,
    engineMessage: '',
    runEngineAction: async (action) => {
      try {
        return await action();
      } catch {
        return null;
      }
    },
    authoringCommands: {
      renameScene: async (sceneId: string, name: string) => {
        if (!(await onRenameScene(sceneId, name))) {
          throw new Error('rename failed');
        }
        return {
          project: {
            ...activeProject,
            scenes: activeProject.scenes.map((scene) =>
              scene.id === sceneId ? { ...scene, name } : scene,
            ),
          },
          assets: [],
          session: {
            revision: 2,
            savedRevision: 1,
            isDirty: true,
          },
          sceneId,
        } satisfies EngineMutationResult;
      },
    } as unknown as FormEditorCommands,
  });
  const noop = async () => {};

  return (
    <>
      {showsExternalFlush ? (
        <button
          type="button"
          data-testid="external-scene-flush"
          onClick={() => void editor.commitPendingDraft()}
        >
          Save draft
        </button>
      ) : null}
      <ScenePanel
        project={activeProject}
        scene={activeScene}
        assets={[]}
        selectedNodeId={null}
        isBusy={false}
        editingSceneId={editor.editingSceneId}
        sceneNameDraft={editor.sceneNameDraft}
        sceneRenameError={editor.sceneRenameError}
        isRenamingScene={editor.isRenamingScene}
        onAddScene={onAddScene ?? noop}
        onBeginSceneRename={editor.beginSceneRename}
        onSceneNameDraftChange={editor.setSceneNameDraft}
        onCancelSceneRename={editor.cancelSceneRename}
        onCommitSceneRename={editor.commitSceneRename}
        onSelectScene={onSelectScene}
        onSelectNode={noop}
        onInsertBackground={noop}
        onInsertSceneJump={noop}
        onMoveNode={noop}
        onDeleteNode={noop}
      />
    </>
  );
}

describe('form editor choice compatibility', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows existing choices read-only without a form creation action', async () => {
    const choice = project.scenes[0].nodes[0];
    if (choice.type !== 'choice') throw new Error('fixture is not a choice');
    const noop = async () => {};
    const moveNode = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <>
          <ScenePanel
            project={project}
            scene={project.scenes[0]}
            assets={[]}
            selectedNodeId={choice.id}
            isBusy={false}
            {...idleSceneRenameProps}
            onAddScene={noop}
            onSelectScene={noop}
            onSelectNode={noop}
            onInsertBackground={noop}
            onInsertSceneJump={noop}
            onMoveNode={moveNode}
            onDeleteNode={noop}
          />
          <InspectorPanel
            selectedNode={choice}
            scenes={project.scenes}
            currentSceneId="scene-entry"
            assets={[]}
            speaker=""
            text=""
            isBusy={false}
            onSpeakerChange={vi.fn()}
            onTextChange={vi.fn()}
            onBackgroundChange={noop}
            onCharacterChange={noop}
            onSceneJumpChange={noop}
            onBgmChange={noop}
            onVideoChange={noop}
            onDialogueVoiceChange={noop}
            onInsertDialogue={noop}
            onInsertCharacter={noop}
            onInsertBgm={noop}
            onSubmit={noop}
          />
        </>,
      );
    });

    expect(container.textContent).toContain('2 个选项');
    expect(container.textContent).toContain('2 个剧情节点');
    expect(container.textContent).not.toContain('延伸');
    expect(container.textContent).toContain('选择 A');
    expect(container.textContent).toContain('跳转到场景 2');
    expect(container.textContent).toContain('选择 B');
    expect(container.textContent).toContain('跳转到场景 3');
    expect(
      container.querySelector('[aria-label="在当前节点后插入场景选项"]'),
    ).toBeNull();

    const moveDown = container.querySelector<HTMLButtonElement>(
      '[aria-label="下移第 1 个剧情节点"]',
    );
    await act(async () => moveDown?.click());
    expect(moveNode).toHaveBeenCalledWith('choice-1', 1);
  });

  it('keeps ordinary flow sorting available after a CG display is added', async () => {
    const projectWithCg: ProjectDocument = {
      ...project,
      scenes: [
        {
          ...project.scenes[0],
          nodes: [
            {
              id: 'dialogue-before-a',
              type: 'dialogue',
              speaker: '',
              text: 'First ordinary dialogue',
              voiceAssetId: null,
            },
            {
              id: 'dialogue-before-b',
              type: 'dialogue',
              speaker: '',
              text: 'Second ordinary dialogue',
              voiceAssetId: null,
            },
            {
              id: 'cg-display-1',
              type: 'cgDisplay',
              assetId: 'cg-image-1',
              leadInMs: 0,
            },
            {
              id: 'cg-dialogue-a',
              type: 'dialogue',
              speaker: '',
              text: 'First CG dialogue',
              voiceAssetId: null,
            },
            {
              id: 'cg-dialogue-b',
              type: 'dialogue',
              speaker: '',
              text: 'Second CG dialogue',
              voiceAssetId: null,
            },
            {
              id: 'cg-end-display-1',
              type: 'cgEndDisplay',
              cgDisplayNodeId: 'cg-display-1',
            },
            {
              id: 'dialogue-after-cg',
              type: 'dialogue',
              speaker: '',
              text: 'After CG',
              voiceAssetId: null,
            },
          ],
        },
        ...project.scenes.slice(1),
      ],
    };
    const noop = async () => {};
    const moveNode = vi.fn(async () => {});

    await act(async () => {
      root.render(
        <ScenePanel
          project={projectWithCg}
          scene={projectWithCg.scenes[0]}
          assets={[]}
          selectedNodeId={null}
          isBusy={false}
          {...idleSceneRenameProps}
          onAddScene={noop}
          onSelectScene={noop}
          onSelectNode={noop}
          onInsertBackground={noop}
          onInsertSceneJump={noop}
          onMoveNode={moveNode}
          onDeleteNode={noop}
        />,
      );
    });

    const moveDown = container.querySelector<HTMLButtonElement>(
      '[aria-label="下移第 1 个剧情节点"]',
    );
    expect(moveDown).not.toBeNull();
    expect(moveDown?.disabled).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="上移第 3 个剧情节点"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="下移第 3 个剧情节点"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="上移第 4 个剧情节点"]',
      )?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="下移第 4 个剧情节点"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="上移第 5 个剧情节点"]',
      )?.disabled,
    ).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="下移第 5 个剧情节点"]',
      )?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="下移第 6 个剧情节点"]',
      )?.disabled,
    ).toBe(true);

    await act(async () => moveDown?.click());
    expect(moveNode).toHaveBeenCalledOnce();
    expect(moveNode).toHaveBeenCalledWith('dialogue-before-a', 1);
  });

  it('leaves the speaker line absent when a dialogue has no speaker', async () => {
    const unnamedProject: ProjectDocument = {
      ...project,
      scenes: [
        {
          ...project.scenes[0],
          nodes: [
            {
              id: 'dialogue-empty-speaker',
              type: 'dialogue',
              speaker: '',
              text: 'No displayed speaker',
              voiceAssetId: null,
            },
          ],
        },
        ...project.scenes.slice(1),
      ],
    };
    const noop = async () => {};

    await act(async () => {
      root.render(
        <ScenePanel
          project={unnamedProject}
          scene={unnamedProject.scenes[0]}
          assets={[]}
          selectedNodeId={null}
          isBusy={false}
          {...idleSceneRenameProps}
          onAddScene={noop}
          onSelectScene={noop}
          onSelectNode={noop}
          onInsertBackground={noop}
          onInsertSceneJump={noop}
          onMoveNode={noop}
          onDeleteNode={noop}
        />,
      );
    });

    const dialogueRow = container.querySelector('.dialogue-list-item');
    expect(dialogueRow?.textContent).toContain('No displayed speaker');
    expect(dialogueRow?.querySelector('strong')).toBeNull();
    expect(dialogueRow?.textContent).not.toContain('旁白');
  });

  it('selects scenes on click and renames the current scene on double-click', async () => {
    const selectScene = vi.fn(async () => {});
    let finishRename: ((renamed: boolean) => void) | undefined;
    const renameScene = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishRename = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <ScenePanelHarness
          project={project}
          onRenameScene={renameScene}
          onSelectScene={selectScene}
        />,
      );
    });

    const sceneTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    expect(sceneTrigger?.textContent).toContain('场景 1');
    expect(sceneTrigger?.textContent).toContain('Entry');

    await act(async () => sceneTrigger?.click());
    const secondSceneOption = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((option) => option.textContent?.includes('场景 2'));
    await act(async () => secondSceneOption?.click());
    expect(selectScene).toHaveBeenCalledOnce();
    expect(selectScene).toHaveBeenCalledWith('scene-a');

    await act(async () => {
      sceneTrigger?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
      sceneTrigger?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 2 }),
      );
      sceneTrigger?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
    });
    const sceneNameInput = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    expect(sceneNameInput).not.toBeNull();
    expect(sceneNameInput?.value).toBe('Entry');
    expect(document.activeElement).toBe(sceneNameInput);

    await act(async () => {
      sceneNameInput?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          isComposing: true,
          key: 'Enter',
        }),
      );
    });
    expect(renameScene).not.toHaveBeenCalled();

    await act(async () => {
      if (!sceneNameInput) return;
      setInputValue(sceneNameInput, '  Renamed Entry  ');
      sceneNameInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
      );
      sceneNameInput.blur();
      await Promise.resolve();
    });
    expect(renameScene).toHaveBeenCalledOnce();
    expect(renameScene).toHaveBeenCalledWith('scene-entry', 'Renamed Entry');
    expect(sceneNameInput?.disabled).toBe(true);

    await act(async () => finishRename?.(true));
    expect(
      container.querySelector('[aria-label="场景名称: 场景 1"]'),
    ).toBeNull();

    const restoredTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    expect(document.activeElement).toBe(restoredTrigger);
    await act(async () => {
      restoredTrigger?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
    });
    const cancelledInput = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    await act(async () => {
      if (!cancelledInput) return;
      setInputValue(cancelledInput, 'Do not save');
      cancelledInput.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    expect(renameScene).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[aria-label="场景名称: 场景 1"]'),
    ).toBeNull();

    const triggerBeforeBlur = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    expect(document.activeElement).toBe(triggerBeforeBlur);
    await act(async () => {
      triggerBeforeBlur?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
    });
    const blurredInput = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    await act(async () => {
      if (!blurredInput) return;
      setInputValue(blurredInput, 'Blurred Entry');
      blurredInput.blur();
      await waitForMacrotask();
    });
    expect(renameScene).toHaveBeenCalledTimes(2);
    expect(renameScene).toHaveBeenLastCalledWith(
      'scene-entry',
      'Blurred Entry',
    );

    await act(async () => finishRename?.(false));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      '场景重命名失败，请重试',
    );
    expect(blurredInput?.disabled).toBe(false);

    await act(async () => {
      blurredInput?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    const f2Trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    expect(f2Trigger?.getAttribute('aria-keyshortcuts')).toBe('F2');
    await act(async () => {
      f2Trigger?.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'F2' }),
      );
    });
    expect(
      container.querySelector('[aria-label="场景名称: 场景 1"]'),
    ).not.toBeNull();
  });

  it('lets the blur source click run before the deferred scene rename', async () => {
    const actionOrder: string[] = [];
    const renameScene = vi.fn(async () => {
      actionOrder.push('rename');
      return true;
    });
    const addScene = vi.fn(async () => {
      actionOrder.push('add');
    });

    await act(async () => {
      root.render(
        <ScenePanelHarness
          project={project}
          onRenameScene={renameScene}
          onSelectScene={async () => {}}
          onAddScene={addScene}
        />,
      );
    });
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
    });
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    const addButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="新建场景"]',
    );

    await act(async () => {
      if (!input) return;
      setInputValue(input, 'Blur before click');
      const pointerDown = new Event('pointerdown', { bubbles: true });
      Object.defineProperty(pointerDown, 'pointerId', { value: 1 });
      addButton?.dispatchEvent(pointerDown);
      addButton?.focus();
      await waitForMacrotask();
    });

    expect(renameScene).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(addButton);

    await act(async () => {
      const pointerUp = new Event('pointerup', { bubbles: true });
      Object.defineProperty(pointerUp, 'pointerId', { value: 1 });
      addButton?.dispatchEvent(pointerUp);
      addButton?.click();
      expect(actionOrder).toEqual(['add']);
      await waitForMacrotask();
    });

    expect(addScene).toHaveBeenCalledOnce();
    expect(renameScene).toHaveBeenCalledOnce();
    expect(actionOrder).toEqual(['add', 'rename']);
    expect(document.activeElement).toBe(addButton);
  });

  it('restores scene focus after an external draft flush disables the input', async () => {
    let finishRename: ((renamed: boolean) => void) | undefined;
    const renameScene = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishRename = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <ScenePanelHarness
          project={project}
          onRenameScene={renameScene}
          onSelectScene={async () => {}}
          showsExternalFlush
        />,
      );
    });
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      );
    });
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    const flushButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="external-scene-flush"]',
    );
    await act(async () => {
      if (!input) return;
      setInputValue(input, 'Saved by shortcut');
      flushButton?.click();
      await Promise.resolve();
    });
    expect(renameScene).toHaveBeenCalledOnce();
    expect(input?.disabled).toBe(true);

    await act(async () => {
      input?.blur();
      finishRename?.(true);
      await Promise.resolve();
    });

    const restoredTrigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="选择当前场景"]',
    );
    expect(document.activeElement).toBe(restoredTrigger);
  });

  it('retains a scene-name draft across language changes and discards it for another project', async () => {
    const noop = async () => {};
    const renameScene = vi.fn(async () => true);
    const renderPanel = (language: 'zh-CN' | 'en-US', nextProject = project) => (
      <EditorI18nProvider language={language}>
        <ScenePanelHarness
          project={nextProject}
          onRenameScene={renameScene}
          onSelectScene={noop}
        />
      </EditorI18nProvider>
    );

    await act(async () => root.render(renderPanel('zh-CN')));
    const startEditing = async (triggerLabel: string) => {
      const trigger = container.querySelector<HTMLButtonElement>(
        `[aria-label="${triggerLabel}"]`,
      );
      await act(async () => {
        trigger?.dispatchEvent(
          new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
        );
      });
    };

    await startEditing('选择当前场景');
    const chineseInput = container.querySelector<HTMLInputElement>(
      '[aria-label="场景名称: 场景 1"]',
    );
    await act(async () => {
      if (chineseInput) setInputValue(chineseInput, 'Language draft');
    });

    await act(async () => root.render(renderPanel('en-US')));
    const englishInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Scene name: Scene 1"]',
    );
    expect(englishInput?.value).toBe('Language draft');
    expect(renameScene).not.toHaveBeenCalled();

    await act(async () => {
      if (englishInput) setInputValue(englishInput, 'Project draft');
    });
    const otherProject: ProjectDocument = {
      ...project,
      id: 'another-project',
      scenes: project.scenes.map((item, index) =>
        index === 0 ? { ...item, name: 'Another entry' } : item,
      ),
    };

    await act(async () => root.render(renderPanel('en-US', otherProject)));
    expect(container.querySelector('[aria-label^="Scene name:"]')).toBeNull();
    expect(container.textContent).not.toContain('Project draft');
    expect(container.textContent).toContain('Another entry');
    expect(renameScene).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(
      container.querySelector('[aria-label="Select current scene"]'),
    );
  });
});
