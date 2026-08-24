/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectorPanel } from '../../src/renderer/features/form-editor/InspectorPanel';
import { ScenePanel } from '../../src/renderer/features/form-editor/ScenePanel';
import type { ProjectDocument } from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'choice-form-project',
  name: 'Choice form compatibility',
  entrySceneId: 'scene-entry',
  startScreen: {
    title: 'Story',
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
});
