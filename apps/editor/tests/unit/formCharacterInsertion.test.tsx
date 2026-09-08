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
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  type ProjectDocument,
} from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'portrait-form-project',
  name: 'Portrait form project',
  entrySceneId: 'scene-1',
  startScreen: {
    style: DEFAULT_START_SCREEN_STYLE,
    title: 'Portrait form project',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    style: DEFAULT_CG_GALLERY_STYLE,
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
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
          scalePercent: 100,
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
  scalePercent: 100,
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
  let updateBackground: ReturnType<typeof vi.fn>;
  let updateCharacter: ReturnType<typeof vi.fn>;
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
        updateBackground,
        updateCharacter,
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
    updateBackground = vi.fn().mockResolvedValue(addCharacterResult);
    updateCharacter = vi.fn().mockResolvedValue(addCharacterResult);
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

  it('inserts a portrait directly after a selected middle dialogue', async () => {
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
      afterNodeId: 'dialogue-current',
    });
  });

  it('inserts a portrait directly after a selected final dialogue', async () => {
    const dialogue = project.scenes[0].nodes[2];
    if (dialogue.type !== 'dialogue') {
      throw new Error('fixture final dialogue is invalid');
    }

    await act(async () => current?.selectNode(dialogue));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'dialogue-next',
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

  it('inserts after the selected portrait when it is the end of its group', async () => {
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
      afterNodeId: 'character-existing',
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
      afterNodeId: 'dialogue-created',
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

  it('commits a focused portrait scale draft through the ordinary save flush', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('175'));
    expect(current?.selectedImageScaleDraft).toBe('175');
    expect(current?.draftDirty).toBe(true);

    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(true);
    });

    expect(updateCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'character-existing',
      mode: 'show',
      assetId: 'portrait-existing',
      slot: 'left',
      layer: 1,
      position: null,
      scalePercent: 175,
    });
    expect(current?.draftDirty).toBe(false);
  });

  it.each([10, 100, 300])(
    'commits the supported portrait scale boundary %i',
    async (scalePercent) => {
      const character = project.scenes[0].nodes[0];
      if (character.type !== 'character') {
        throw new Error('fixture character is invalid');
      }

      await act(async () => current?.selectNode(character));
      await act(async () => {
        current?.setSelectedImageScaleDraft(String(scalePercent));
      });
      await act(async () => {
        expect(await current?.commitPendingDraft()).toBe(true);
      });

      if (scalePercent === character.scalePercent) {
        expect(updateCharacter).not.toHaveBeenCalled();
      } else {
        expect(updateCharacter).toHaveBeenCalledWith(expect.objectContaining({
          nodeId: character.id,
          scalePercent,
        }));
      }
      expect(current?.selectedImageScaleDraftInvalid).toBe(false);
      expect(current?.draftDirty).toBe(false);
    },
  );

  it('rejects a fractional portrait scale without invoking the engine', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('10.5'));
    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(false);
    });

    expect(updateCharacter).not.toHaveBeenCalled();
    expect(current?.selectedImageScaleDraftInvalid).toBe(true);
    expect(current?.selectedImageScaleDraft).toBe('10.5');
    expect(current?.draftDirty).toBe(true);
  });

  it('commits a focused background scale draft through the ordinary save flush', async () => {
    const background = {
      id: 'background-focused',
      type: 'background' as const,
      assetId: 'background-old',
      scalePercent: 120,
    };
    activeProject = {
      ...project,
      id: 'background-scale-project',
      scenes: [{
        ...project.scenes[0],
        nodes: [background, ...project.scenes[0].nodes],
      }],
    };
    await act(async () => root.render(<Harness key={activeProject.id} />));
    await act(async () => current?.selectNode(background));
    await act(async () => current?.setSelectedImageScaleDraft('165'));

    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(true);
    });

    expect(updateBackground).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-focused',
      assetId: 'background-old',
      scalePercent: 165,
    });
    expect(current?.draftDirty).toBe(false);
  });

  it('keeps a failed portrait scale draft dirty and available for retry', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }
    updateCharacter.mockRejectedValueOnce(new Error('scale save failed'));

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('175'));
    await act(async () => {
      expect(await current?.commitPendingDraft()).toBe(false);
    });

    expect(current?.selectedNodeId).toBe(character.id);
    expect(current?.selectedImageScaleDraft).toBe('175');
    expect(current?.draftDirty).toBe(true);
  });

  it('keeps an invalid scale draft visible and blocks navigation', async () => {
    const character = project.scenes[0].nodes[0];
    const dialogue = project.scenes[0].nodes[1];
    if (character.type !== 'character' || dialogue.type !== 'dialogue') {
      throw new Error('fixture nodes are invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('301'));
    await act(async () => current?.selectNode(dialogue));

    expect(updateCharacter).not.toHaveBeenCalled();
    expect(current?.selectedNodeId).toBe(character.id);
    expect(current?.selectedImageScaleDraft).toBe('301');
    expect(current?.draftDirty).toBe(true);
  });

  it('uses the latest portrait scale draft when the image changes', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('175'));
    await act(async () => current?.updateCharacterNode(character, {
      mode: 'show',
      assetId: 'portrait-replacement',
      slot: character.slot,
      layer: character.layer,
      position: character.position,
      scalePercent: character.scalePercent,
    }));

    expect(updateCharacter).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      nodeId: 'character-existing',
      mode: 'show',
      assetId: 'portrait-replacement',
      slot: 'left',
      layer: 1,
      position: null,
      scalePercent: 175,
    });
    expect(current?.draftDirty).toBe(false);
  });

  it('uses the latest background scale draft when the image changes', async () => {
    const background = {
      id: 'background-asset-change',
      type: 'background' as const,
      assetId: 'background-old',
      scalePercent: 120,
    };
    activeProject = {
      ...project,
      id: 'background-asset-change-project',
      scenes: [{
        ...project.scenes[0],
        nodes: [background, ...project.scenes[0].nodes],
      }],
    };
    await act(async () => root.render(<Harness key={activeProject.id} />));
    await act(async () => current?.selectNode(background));
    await act(async () => current?.setSelectedImageScaleDraft('165'));
    await act(async () => current?.updateBackgroundNode(background, {
      assetId: 'background-replacement',
      scalePercent: background.scalePercent,
    }));

    expect(updateBackground).toHaveBeenLastCalledWith({
      sceneId: 'scene-1',
      nodeId: 'background-asset-change',
      assetId: 'background-replacement',
      scalePercent: 165,
    });
    expect(current?.draftDirty).toBe(false);
  });

  it('blocks an image change while the selected scale draft is invalid', async () => {
    const character = project.scenes[0].nodes[0];
    if (character.type !== 'character') {
      throw new Error('fixture character is invalid');
    }

    await act(async () => current?.selectNode(character));
    await act(async () => current?.setSelectedImageScaleDraft('301'));
    let updated = true;
    await act(async () => {
      updated = await current!.updateCharacterNode(character, {
        mode: 'show',
        assetId: 'portrait-replacement',
        slot: character.slot,
        layer: character.layer,
        position: character.position,
        scalePercent: character.scalePercent,
      });
    });

    expect(updated).toBe(false);
    expect(updateCharacter).not.toHaveBeenCalled();
    expect(current?.selectedImageScaleDraft).toBe('301');
    expect(current?.draftDirty).toBe(true);
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
      afterNodeId: 'dialogue-current',
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

  it('inserts after the tail of a contiguous portrait group', async () => {
    const groupProject = await renderLogicProject('portrait-group-tail', [
      {
        id: 'character-group-first',
        type: 'character',
        mode: 'show',
        assetId: 'portrait-first',
        slot: 'left',
        layer: 1,
        position: null,
        effect: null,
        scalePercent: 100,
      },
      {
        id: 'character-group-second',
        type: 'character',
        mode: 'show',
        assetId: 'portrait-second',
        slot: 'right',
        layer: 1,
        position: null,
        effect: null,
        scalePercent: 100,
      },
      {
        id: 'dialogue-after-portrait-group',
        type: 'dialogue',
        speaker: '',
        text: 'After portrait group',
        voiceAssetId: null,
      },
    ]);
    const firstCharacter = groupProject.scenes[0].nodes[0];
    if (firstCharacter.type !== 'character') {
      throw new Error('portrait group fixture is invalid');
    }

    await act(async () => current?.selectNode(firstCharacter));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'character-group-second',
    });
  });

  it('inserts after the hidden CG end marker for a selected CG body dialogue', async () => {
    const cgProject = await renderLogicProject('cg-body-portrait-anchor', [
      {
        id: 'cg-root',
        type: 'cgDisplay',
        assetId: 'cg-image',
        leadInMs: 0,
      },
      {
        id: 'cg-body-dialogue',
        type: 'dialogue',
        speaker: '',
        text: 'Inside CG',
        voiceAssetId: null,
      },
      {
        id: 'cg-end',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-root',
      },
      {
        id: 'dialogue-after-cg',
        type: 'dialogue',
        speaker: '',
        text: 'After CG',
        voiceAssetId: null,
      },
    ]);
    const bodyDialogue = cgProject.scenes[0].nodes[1];
    if (bodyDialogue.type !== 'dialogue') {
      throw new Error('CG body fixture is invalid');
    }

    await act(async () => current?.selectNode(bodyDialogue));
    await act(async () => current?.insertCharacter());

    expect(addCharacter).toHaveBeenCalledWith({
      sceneId: 'scene-1',
      mode: 'show',
      assetId: null,
      afterNodeId: 'cg-end',
    });
  });

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
        scalePercent: 100,
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
        scalePercent: 100,
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
        scalePercent: 100,
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
