/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FormEditorCommands } from '../../src/renderer/application/authoringPorts';
import { useFormEditor } from '../../src/renderer/features/form-editor/useFormEditor';
import type {
  EngineMutationResult,
} from '../../src/shared/engineProtocol';
import type { ProjectDocument } from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'portrait-form-project',
  name: 'Portrait form project',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Portrait form project',
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
          assetId: 'portrait-existing',
          slot: 'left',
          layer: 1,
          position: null,
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
  assetId: null,
  slot: 'center' as const,
  layer: 1,
  position: null,
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
  let addCharacter: ReturnType<typeof vi.fn>;
  let addDialogue: ReturnType<typeof vi.fn>;

  function Harness() {
    current = useFormEditor({
      project,
      isBusy: false,
      engineMessage: '',
      setEngineMessage: vi.fn(),
      runEngineAction: async (action) => action(),
      authoringCommands: {
        addCharacter,
        addDialogue,
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
    await act(async () => root.render(<Harness />));
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
      beforeNodeId: 'dialogue-current',
    });
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
      beforeNodeId: 'dialogue-created',
    });
  });
});
