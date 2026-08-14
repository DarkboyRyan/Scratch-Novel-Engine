/** @vitest-environment jsdom */

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
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
      nodes: [
        { id: 'video-1', type: 'video', assetId: 'asset-video' },
        {
          id: 'dialogue-1',
          type: 'dialogue',
          speaker: 'A',
          text: 'after video',
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
      expect(current?.start(project)).toBe(true);
    });
    expect(current?.session?.runtime.status).toBe('playingVideo');

    await act(async () => current?.advance());
    expect(current?.session?.runtime.status).toBe('playingVideo');
    expect(current?.session?.runtime.videoAssetId).toBe('asset-video');

    await act(async () => current?.completeVideo());
    expect(current?.session?.runtime.status).toBe('playing');
    expect(current?.session?.runtime.dialogue?.id).toBe('dialogue-1');
  });
});
