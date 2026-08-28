/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 form character insertion 的行为。
 * 测试覆盖：`form character insertion`。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormEditorCommands } from '../../src/renderer/application/authoringPorts';
import { useFormEditor } from '../../src/renderer/features/form-editor/useFormEditor';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';
import type { ProjectDocument } from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'portrait-form-project',
  name: 'Portrait form project',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Portrait form project',
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
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
      nodes: [
        {
          id: 'character-existing',
          type: 'character',
          mode: 'show',
          assetId: 'portrait-existing',
          slot: 'left',
          layer: 1,
          position: null,
          effect: null,
        },
        {
          id: 'dialogue-current',
          type: 'dialogue',
          speaker: 'A',
          text: '当前对白',
          voiceAssetId: null,
        },
        {
          id: 'dialogue-next',
          type: 'dialogue',
          speaker: 'B',
          text: '下一对白',
          voiceAssetId: null,
        },
      ],
    },
  ],
};

const createdCharacter = {
  id: 'character-new',
  type: 'character' as const,
  mode: 'show' as const,
  assetId: null,
  slot: 'center' as const,
  layer: 1,
  position: null,
  effect: null,
};

const addCharacterResult: EngineMutationResult = {
  project: {
    ...project,
    scenes: [
      {
        ...project.scenes[0],
        nodes: [
          project.scenes[0].nodes[0],
          createdCharacter,
          ...project.scenes[0].nodes.slice(1),
        ],
      },
    ],
  },
  assets: [],
  session: {
    revision: 2,
    savedRevision: 1,
    isDirty: true,
  },
  nodeId: createdCharacter.id,
};

describe('form character insertion', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useFormEditor> | null;
  let activeProject: ProjectDocument;
  let addCharacter: ReturnType<typeof vi.fn>;
  let addDialogue: ReturnType<typeof vi.fn>;
  let updateDialogue: ReturnType<typeof vi.fn>;
  let renameScene: ReturnType<typeof vi.fn>;
  let reorderTimelineNode: ReturnType<typeof vi.fn>;
  let reorderCgDisplay: ReturnType<typeof vi.fn>;
  let runEngineAction: ReturnType<typeof vi.fn>;

  function Harness() {
    current = useFormEditor({
      project: activeProject,
      isBusy: false,
      engineMessage: '',
      runEngineAction,
      authoringCommands: {
        addCharacter,
        addDialogue,
        updateDialogue,
        renameScene,
        reorderTimelineNode,
        reorderCgDisplay,
      } as unknown as FormEditorCommands,
    });
    return null;
  }

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    current = null;
    activeProject = project;
    runEngineAction = vi.fn(async (action: () => Promise<EngineMutationResult>) => {
      try {
        return await action();
      } catch {
        return null;
      }
    });
    addCharacter = vi.fn().mockResolvedValue(addCharacterResult);
    addDialogue = vi.fn().mockResolvedValue({
      ...addCharacterResult,
      project: {
        ...project,
        scenes: [
          {
            ...project.scenes[0],
            nodes: [
              ...project.scenes[0].nodes,
              {
                id: 'dialogue-created',
                type: 'dialogue',
                speaker: '',
                text: '新对白',
                voiceAssetId: null,
              },
            ],
          },
        ],
      },
      nodeId: 'dialogue-created',
    });
    updateDialogue = vi.fn().mockImplementation(
      async (
        sceneId: string,
        nodeId: string,
        speaker: string,
        text: string,
      ) => ({
        ...addCharacterResult,
        project: {
          ...project,
          scenes: project.scenes.map((scene) => ({
            ...scene,
            nodes: scene.nodes.map((node) =>
              node.id === nodeId && node.type === 'dialogue'
                ? { ...node, speaker, text }
                : node,
            ),
          })),
        },
        sceneId,
        nodeId,
      }),
    );
    renameScene = vi.fn().mockImplementation(
      async (sceneId: string, name: string) => ({
        ...addCharacterResult,
        project: {
          ...project,
          scenes: project.scenes.map((scene) =>
            scene.id === sceneId ? { ...scene, name } : scene,
          ),
        },
        sceneId,
      }),
    );
    reorderTimelineNode = vi.fn().mockResolvedValue(addCharacterResult);
    reorderCgDisplay = vi.fn().mockResolvedValue(addCharacterResult);
    await act(async () => root.render(<Harness key={activeProject.id} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('inserts a portrait before the selected dialogue so it appears in that frame', async () => {
    const dialogue = project.scenes[0].nodes[1];
    if (dialogue.type !== 'dialogue') {
      throw new Error('fixture dialogue is invalid');
    }

    await act(async () => current?.selectNode(dialogue));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      beforeNodeId: 'dialogue-current',
    });
  });

  it('routes CG-aware form moves through atomic structural commands', async () => {
    activeProject = {
      ...project,
      id: 'portrait-form-project-with-cg',
      scenes: [
        {
          ...project.scenes[0],
          nodes: [
            {
              id: 'before-cg',
              type: 'dialogue',
              speaker: '',
              text: 'Before',
              voiceAssetId: null,
            },
            {
              id: 'cg-root',
              type: 'cgDisplay',
              assetId: 'cg-image',
              leadInMs: 0,
            },
            {
              id: 'cg-line-a',
              type: 'dialogue',
              speaker: '',
              text: 'A',
              voiceAssetId: null,
            },
            {
              id: 'cg-line-b',
              type: 'dialogue',
              speaker: '',
              text: 'B',
              voiceAssetId: null,
            },
            {
              id: 'cg-end',
              type: 'cgEndDisplay',
              cgDisplayNodeId: 'cg-root',
            },
            {
              id: 'after-cg',
              type: 'dialogue',
              speaker: '',
              text: 'After',
              voiceAssetId: null,
            },
          ],
        },
      ],
    };
    await act(async () => {
      root.render(<Harness key={activeProject.id} />);
    });

    await act(async () => current?.moveNode('before-cg', 1));
    expect(reorderTimelineNode).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      nodeId: 'before-cg',
      beforeNodeId: 'after-cg',
    });

    await act(async () => current?.moveNode('cg-root', 1));
    expect(reorderCgDisplay).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'cg-root',
      beforeNodeId: null,
    });

    await act(async () => current?.moveNode('cg-line-a', 1));
    expect(reorderTimelineNode).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      nodeId: 'cg-line-a',
      beforeNodeId: 'cg-end',
    });
  });

  it('does not reorder from a stale scene while an empty dialogue is being created', async () => {
    let finishAdd: ((result: EngineMutationResult) => void) | undefined;
    addDialogue.mockImplementationOnce(
      () =>
        new Promise<EngineMutationResult>((resolve) => {
          finishAdd = resolve;
        }),
    );
    let submit!: Promise<void>;
    let move!: Promise<void>;

    await act(async () => {
      submit = current!.submitDialogue();
      await Promise.resolve();
      move = current!.moveNode('dialogue-current', 1);
      await Promise.resolve();
    });
    expect(addDialogue).toHaveBeenCalledOnce();
    expect(reorderTimelineNode).not.toHaveBeenCalled();

    await act(async () => {
      finishAdd?.({
        ...addCharacterResult,
        nodeId: 'dialogue-created',
      });
      await Promise.all([submit, move]);
    });
    expect(reorderTimelineNode).not.toHaveBeenCalled();
  });

  it('keeps additional portraits in the same group before the following dialogue', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      beforeNodeId: 'dialogue-current',
    });
  });

  it('keeps a portrait with a dialogue draft committed by the same click', async () => {
    await act(async () => {
      current?.setText('新对白');
    });
    await act(async () => current?.insertCharacter());

    expect(addDialogue).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      afterNodeId: null,
      speaker: '',
      text: '新对白',
    });
    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      beforeNodeId: 'dialogue-created',
    });
  });

  it('creates a completely empty dialogue after an explicit form submit', async () => {
    await act(async () => current?.submitDialogue());

    expect(addDialogue).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      afterNodeId: null,
      speaker: '',
      text: '',
    });
  });

  it('does not create an empty node during an ordinary draft flush', async () => {
    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(true);
    });

    expect(addDialogue).not.toHaveBeenCalled();
  });

  it('keeps an empty-dialogue submit single-flight', async () => {
    let finishAdd: ((result: EngineMutationResult) => void) | undefined;
    addDialogue.mockReturnValueOnce(
      new Promise<EngineMutationResult>((resolve) => {
        finishAdd = resolve;
      }),
    );

    await act(async () => {
      const first = current!.submitDialogue();
      const second = current!.submitDialogue();
      expect(addDialogue).toHaveBeenCalledTimes(1);
      finishAdd?.({
        ...addCharacterResult,
        nodeId: 'dialogue-empty',
      });
      await Promise.all([first, second]);
    });

    expect(addDialogue).toHaveBeenCalledTimes(1);
  });

  it('saves a cleared dialogue before continuing with another insertion', async () => {
    const dialogue = project.scenes[0].nodes[1];
    if (dialogue.type !== 'dialogue') {
      throw new Error('fixture dialogue is invalid');
    }

    await act(async () => current?.selectNode(dialogue));
    await act(async () => {
      current?.setSpeaker('');
      current?.setText('');
    });
    await act(async () => current?.insertCharacter());

    expect(updateDialogue).toHaveBeenCalledWith(
      'scene-1',
      'dialogue-current',
      '',
      '',
    );
    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      beforeNodeId: 'dialogue-current',
    });
  });

  it('commits the current dialogue draft before renaming a scene', async () => {
    const dialogue = project.scenes[0].nodes[1];
    if (dialogue.type !== 'dialogue') {
      throw new Error('fixture dialogue is invalid');
    }

    await act(async () => current?.selectNode(dialogue));
    await act(async () => current?.setText('重命名前保存'));
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('序章'));

    let renamed = false;
    await act(async () => {
      renamed = (await current?.commitPendingDraft()) ?? false;
    });

    expect(renamed).toBe(true);
    expect(updateDialogue).toHaveBeenCalledWith(
      'scene-1',
      'dialogue-current',
      'A',
      '重命名前保存',
    );
    expect(renameScene).toHaveBeenCalledWith('scene-1', '序章');
    expect(updateDialogue.mock.invocationCallOrder[0]).toBeLessThan(
      renameScene.mock.invocationCallOrder[0],
    );
  });

  it('does not invoke scene.rename when the current draft cannot be saved', async () => {
    const dialogue = project.scenes[0].nodes[1];
    if (dialogue.type !== 'dialogue') {
      throw new Error('fixture dialogue is invalid');
    }

    await act(async () => current?.selectNode(dialogue));
    await act(async () => current?.setText('尚未保存'));
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('不会生效'));
    updateDialogue.mockRejectedValueOnce(new Error('save failed'));

    let renamed = true;
    await act(async () => {
      renamed = (await current?.commitPendingDraft()) ?? true;
    });

    expect(renamed).toBe(false);
    expect(renameScene).not.toHaveBeenCalled();
    expect(current?.scene?.id).toBe('scene-1');
    expect(current?.scene?.name).toBe('Scene 1');
  });

  it('keeps the scene-name draft when scene.rename fails', async () => {
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('不会生效'));
    renameScene.mockRejectedValueOnce(new Error('rename failed'));

    let renamed = true;
    await act(async () => {
      renamed = (await current?.commitSceneRename()) ?? true;
    });

    expect(renamed).toBe(false);
    expect(current?.scene?.id).toBe('scene-1');
    expect(current?.scene?.name).toBe('Scene 1');
    expect(current?.editingSceneId).toBe('scene-1');
    expect(current?.sceneNameDraft).toBe('不会生效');
    expect(current?.sceneRenameError).toBe('场景重命名失败，请重试');
    expect(current?.draftDirty).toBe(true);
  });

  it('keeps Enter and blur scene-name commits single-flight', async () => {
    let finishRename: ((result: EngineMutationResult) => void) | undefined;
    renameScene.mockReturnValueOnce(
      new Promise<EngineMutationResult>((resolve) => {
        finishRename = resolve;
      }),
    );
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('序章'));

    await act(async () => {
      const enterCommit = current!.commitSceneRename();
      const blurCommit = current!.commitSceneRename();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(renameScene).toHaveBeenCalledTimes(1);
      finishRename?.({
        ...addCharacterResult,
        project: {
          ...project,
          scenes: [{ ...project.scenes[0], name: '序章' }],
        },
      });
      await Promise.all([enterCommit, blurCommit]);
    });

    expect(renameScene).toHaveBeenCalledTimes(1);
    expect(current?.editingSceneId).toBeNull();
  });

  it('flushes a scene-name draft without creating an empty dialogue', async () => {
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('序章'));

    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(true);
    });

    expect(addDialogue).not.toHaveBeenCalled();
    expect(renameScene).toHaveBeenCalledWith('scene-1', '序章');
  });

  it('still force-creates an empty dialogue on explicit submit with a scene draft', async () => {
    await act(async () => current?.beginSceneRename('scene-1'));
    await act(async () => current?.setSceneNameDraft('序章'));

    await act(async () => current?.submitDialogue());

    expect(addDialogue).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      afterNodeId: null,
      speaker: '',
      text: '',
    });
    expect(renameScene).toHaveBeenCalledWith('scene-1', '序章');
  });

  async function renderLogicProject(
    id: string,
    nodes: ProjectDocument['scenes'][number]['nodes'],
  ): Promise<ProjectDocument> {
    activeProject = {
      ...project,
      id,
      scenes: [{ ...project.scenes[0], nodes }],
    };
    await act(async () => {
      root.render(<Harness key={activeProject.id} />);
    });
    return activeProject;
  }

  it('does not search across Then into Else for a portrait dialogue anchor', async () => {
    const logicProject = await renderLogicProject('then-boundary', [
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      },
      {
        id: 'then-character',
        type: 'character',
        mode: 'show',
        assetId: 'then-portrait',
        slot: 'left',
        layer: 1,
        position: null,
        effect: null,
      },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      {
        id: 'else-dialogue',
        type: 'dialogue',
        speaker: 'B',
        text: 'Else',
        voiceAssetId: null,
      },
      { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
    ]);
    const character = logicProject.scenes[0].nodes[1];
    if (character.type !== 'character') {
      throw new Error('Then fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'then-character',
    });
  });

  it('does not search past Else into the root sequence', async () => {
    const logicProject = await renderLogicProject('else-boundary', [
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'A' },
        },
      },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      {
        id: 'else-character',
        type: 'character',
        mode: 'show',
        assetId: 'else-portrait',
        slot: 'right',
        layer: 1,
        position: null,
        effect: null,
      },
      { id: 'endif-1', type: 'logicEndIf', ifNodeId: 'if-1' },
      {
        id: 'root-dialogue',
        type: 'dialogue',
        speaker: 'C',
        text: 'After',
        voiceAssetId: null,
      },
    ]);
    const character = logicProject.scenes[0].nodes[2];
    if (character.type !== 'character') {
      throw new Error('Else fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'else-character',
    });
  });

  it('does not search past a Repeat body into the root sequence', async () => {
    const logicProject = await renderLogicProject('repeat-boundary', [
      { id: 'repeat-1', type: 'logicRepeat', count: 2 },
      {
        id: 'body-character',
        type: 'character',
        mode: 'show',
        assetId: 'body-portrait',
        slot: 'center',
        layer: 1,
        position: null,
        effect: null,
      },
      {
        id: 'endrepeat-1',
        type: 'logicEndRepeat',
        repeatNodeId: 'repeat-1',
      },
      {
        id: 'root-dialogue',
        type: 'dialogue',
        speaker: 'C',
        text: 'After',
        voiceAssetId: null,
      },
    ]);
    const character = logicProject.scenes[0].nodes[1];
    if (character.type !== 'character') {
      throw new Error('Repeat fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'body-character',
    });
  });

  it('creates an unresolved show portrait when no image has been imported', async () => {
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: null,
    });
  });
});
