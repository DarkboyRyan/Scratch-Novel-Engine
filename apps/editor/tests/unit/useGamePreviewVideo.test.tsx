/** @vitest-environment jsdom */

/**
 * 文件主要作用：验证 useGamePreview video transition 的行为。
 * 测试覆盖：`useGamePreview video transition`。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useGamePreview } from '../../src/renderer/features/game-preview/useGamePreview';
import type { ProjectDocument } from '../../src/shared/projectTypes';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'project-video',
  name: 'Video preview',
  entrySceneId: 'scene-1',
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
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
      nodes: [
        { id: 'video-1', type: 'video', assetId: 'asset-video' },
        { id: 'extension-1', type: 'storyExtension' },
        {
          id: 'dialogue-1',
          type: 'dialogue',
          speaker: 'A',
          text: 'after video',
          voiceAssetId: null,
        },
      ],
    },
    {
      schemaVersion: 1,
      id: 'scene-2',
      name: 'Scene 2',
      backgroundAssetId: 'scene-2-background',
      nodes: [
        {
          id: 'dialogue-2',
          type: 'dialogue',
          speaker: 'B',
          text: 'selected scene',
          voiceAssetId: null,
        },
      ],
    },
  ],
};

describe('useGamePreview video transition', () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useGamePreview> | null;

  function Harness() {
    current = useGamePreview();
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
    await act(async () => root.render(<Harness />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('ignores ordinary advance while video is blocking and resumes only on completion', async () => {
    await act(async () => {
      expect(current?.start(project, 'scene-1')).toBe(true);
    });
    expect(current?.session?.phase).toBe('story');
    expect(current?.session?.runtime.status).toBe('playingVideo');

    await act(async () => current?.advance());
    expect(current?.session?.runtime.status).toBe('playingVideo');
    expect(current?.session?.runtime.videoAssetId).toBe('asset-video');
    expect(current?.session?.project.scenes[0].nodes).not.toContainEqual(
      expect.objectContaining({ type: 'storyExtension' }),
    );

    await act(async () => current?.completeVideo());
    expect(current?.session?.runtime.status).toBe('playing');
    expect(current?.session?.runtime.dialogue?.id).toBe('dialogue-1');
  });

  it('does not create a preview session for a missing scene selection', async () => {
    await act(async () => {
      expect(current?.start(project, 'missing-scene')).toBe(false);
    });

    expect(current?.session).toBeNull();
  });

  it('stores a session that starts from the selected non-entry scene', async () => {
    await act(async () => {
      expect(current?.start(project, 'scene-2')).toBe(true);
    });

    expect(current?.session?.phase).toBe('story');
    expect(current?.session?.runtime).toMatchObject({
      sceneId: 'scene-2',
      backgroundAssetId: 'scene-2-background',
      dialogue: { id: 'dialogue-2' },
    });
  });

  it('holds a whole-game preview on the title screen until Start is chosen', async () => {
    await act(async () => {
      expect(current?.startWhole(project)).toBe(true);
    });

    expect(current?.session?.phase).toBe('title');
    expect(current?.session?.runtime.status).toBe('playingVideo');

    await act(async () => current?.completeVideo());
    expect(current?.session?.phase).toBe('title');
    expect(current?.session?.runtime.status).toBe('playingVideo');

    await act(async () => current?.enterStory());
    expect(current?.session?.phase).toBe('story');

    await act(async () => current?.completeVideo());
    expect(current?.session?.runtime.status).toBe('playing');
    expect(current?.session?.runtime.dialogue?.id).toBe('dialogue-1');
  });
});
