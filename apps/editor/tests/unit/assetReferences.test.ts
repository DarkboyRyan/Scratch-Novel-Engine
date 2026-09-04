/**
 * 文件主要作用：验证资源引用扫描覆盖所有可执行与页面位置。
 * 测试覆盖：主界面、CG 槽位、场景初始背景和六种剧情节点引用。
 */

import { describe, expect, it } from 'vitest';

import { collectAssetReferences } from '../../src/renderer/features/assets/assetReferences';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  type ProjectDocument,
} from '../../src/shared/projectTypes';

const targetAssetId = 'asset-private-key';

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'project-private-key',
  name: 'Reference project',
  entrySceneId: 'scene-private-key',
  startScreen: {
    title: 'Reference project',
    eyebrow: '',
    backgroundAssetId: targetAssetId,
    musicAssetId: targetAssetId,
    style: DEFAULT_START_SCREEN_STYLE,
  },
  cgGallery: {
    style: DEFAULT_CG_GALLERY_STYLE,
    pages: [
      { imageAssetIds: [targetAssetId, null, targetAssetId] },
    ],
  },
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-private-key',
      name: 'Opening',
      backgroundAssetId: targetAssetId,
      backgroundScalePercent: 100,
      nodes: [
        { id: 'extension-private-key', type: 'storyExtension' },
        {
          id: 'hidden-else-private-key',
          type: 'logicElse',
          ifNodeId: 'logic-private-key',
        },
        {
          id: 'dialogue-private-key',
          type: 'dialogue',
          speaker: 'Alice',
          text: 'Hello',
          voiceAssetId: targetAssetId,
        },
        {
          id: 'background-private-key',
          type: 'background',
          assetId: targetAssetId,
          scalePercent: 100,
        },
        {
          id: 'hidden-end-private-key',
          type: 'logicEndIf',
          ifNodeId: 'logic-private-key',
        },
        {
          id: 'character-private-key',
          type: 'character',
          mode: 'show',
          assetId: targetAssetId,
          slot: 'center',
          layer: 1,
          position: null,
          scalePercent: 100,
          effect: null,
        },
        { id: 'bgm-private-key', type: 'bgm', assetId: targetAssetId },
        { id: 'video-private-key', type: 'video', assetId: targetAssetId },
        {
          id: 'cg-private-key',
          type: 'cgDisplay',
          assetId: targetAssetId,
          leadInMs: 500,
        },
        {
          id: 'jump-private-key',
          type: 'sceneJump',
          targetSceneId: 'somewhere-else',
        },
      ],
    },
  ],
};

describe('collectAssetReferences', () => {
  it('finds page, gallery, initial-background, and supported timeline uses', () => {
    expect(collectAssetReferences(project, targetAssetId)).toEqual([
      { surface: 'start-screen', usage: 'background' },
      { surface: 'start-screen', usage: 'music' },
      {
        surface: 'cg-gallery',
        usage: 'image',
        pageNumber: 1,
        slotNumber: 1,
      },
      {
        surface: 'cg-gallery',
        usage: 'image',
        pageNumber: 1,
        slotNumber: 3,
      },
      {
        surface: 'scene',
        usage: 'initial-background',
        sceneName: 'Opening',
      },
      {
        surface: 'scene',
        usage: 'dialogue-voice',
        sceneName: 'Opening',
        nodeNumber: 1,
      },
      {
        surface: 'scene',
        usage: 'timeline-background',
        sceneName: 'Opening',
        nodeNumber: 2,
      },
      {
        surface: 'scene',
        usage: 'character',
        sceneName: 'Opening',
        nodeNumber: 3,
      },
      {
        surface: 'scene',
        usage: 'bgm',
        sceneName: 'Opening',
        nodeNumber: 4,
      },
      {
        surface: 'scene',
        usage: 'video',
        sceneName: 'Opening',
        nodeNumber: 5,
      },
      {
        surface: 'scene',
        usage: 'cg-display',
        sceneName: 'Opening',
        nodeNumber: 6,
      },
    ]);
  });

  it('returns no UI locations for an unreferenced asset and never emits IDs', () => {
    expect(collectAssetReferences(project, 'unused-private-key')).toEqual([]);
    expect(
      JSON.stringify(collectAssetReferences(project, targetAssetId)),
    ).not.toContain('private-key');
  });

  it('accepts a presentation formatter for generated scene names', () => {
    const generatedNameProject: ProjectDocument = {
      ...project,
      scenes: [{ ...project.scenes[0], name: '场景 1' }],
    };

    const references = collectAssetReferences(
      generatedNameProject,
      targetAssetId,
      (sceneName, sceneIndex) =>
        sceneName === `场景 ${sceneIndex + 1}`
          ? `Scene ${sceneIndex + 1}`
          : sceneName,
    );

    expect(
      references
        .filter((reference) => reference.surface === 'scene')
        .every((reference) => reference.sceneName === 'Scene 1'),
    ).toBe(true);
  });
});
