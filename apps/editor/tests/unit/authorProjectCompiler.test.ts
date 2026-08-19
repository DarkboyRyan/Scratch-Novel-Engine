import { describe, expect, it } from 'vitest';

import { compileAuthorProjectV9 } from '../../src/main/export/AuthorProjectCompiler';

function authorProject(): Record<string, unknown> {
  return {
    format: 'vn-engine-project',
    fileVersion: 9,
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: '导出测试',
      entrySceneId: 'scene-1',
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene-1',
          name: '开场',
          visuals: { backgroundAssetId: 'image-1', characters: [] },
          nodes: [
            {
              id: 'dialogue-1',
              type: 'dialogue',
              speaker: '旁白',
              text: '开始',
              voiceAssetId: 'audio-1',
            },
            { id: 'background-1', type: 'background', assetId: null },
            {
              id: 'character-1',
              type: 'character',
              assetId: 'image-2',
              slot: 'center',
              layer: 2,
            },
            { id: 'bgm-1', type: 'bgm', assetId: 'audio-1' },
            { id: 'video-1', type: 'video', assetId: 'video-1-asset' },
            {
              id: 'choice-1',
              type: 'choice',
              options: [
                { id: 'option-1', text: '继续', targetSceneId: 'scene-2' },
              ],
            },
          ],
        },
        {
          schemaVersion: 1,
          id: 'scene-2',
          name: '结尾',
          visuals: { backgroundAssetId: null, characters: [] },
          nodes: [
            { id: 'jump-1', type: 'sceneJump', targetSceneId: 'scene-1' },
          ],
        },
      ],
    },
    assets: [
      {
        id: 'image-1',
        type: 'image',
        relativePath: 'assets/images/image-1.png',
        displayName: '背景.png',
      },
      {
        id: 'image-2',
        type: 'image',
        relativePath: 'assets/images/image-2.webp',
        displayName: '人物.webp',
      },
      {
        id: 'audio-1',
        type: 'audio',
        relativePath: 'assets/audio/audio-1.mp3',
        displayName: '语音.mp3',
      },
      {
        id: 'video-1-asset',
        type: 'video',
        relativePath: 'assets/videos/video-1.webm',
        displayName: '过场.webm',
      },
      {
        id: 'unused-image',
        type: 'image',
        relativePath: 'assets/images/unused-image.jpg',
        displayName: '未使用.jpg',
      },
    ],
  };
}

function compile(document: Record<string, unknown>) {
  return compileAuthorProjectV9(JSON.stringify(document));
}

describe('author project v9 compiler', () => {
  it('builds exact runtime v1 story data and filters unreferenced assets', () => {
    const result = compile(authorProject());

    expect(result.game).toMatchObject({
      format: 'vn-engine-runtime',
      runtimeVersion: 1,
      game: {
        id: 'project-1',
        title: '导出测试',
        entrySceneId: 'scene-1',
      },
    });
    expect(result.game.scenes[0]).toMatchObject({
      schemaVersion: 1,
      id: 'scene-1',
      backgroundAssetId: 'image-1',
    });
    expect(result.game.scenes[0]).not.toHaveProperty('visuals');
    expect(result.referencedAssets.map((asset) => asset.id)).toEqual([
      'image-1',
      'image-2',
      'audio-1',
      'video-1-asset',
    ]);
    expect(result.allAssetCount).toBe(5);
  });

  it('accepts non-ASCII whitespace that the C++ ASCII trim rule preserves', () => {
    const document = authorProject();
    (document.project as { name: string }).name = '\u00a0标题\u00a0';

    expect(compile(document).project.name).toBe('\u00a0标题\u00a0');
  });

  it('rejects unsupported versions and unknown fields', () => {
    const oldVersion = authorProject();
    oldVersion.fileVersion = 8;
    expect(() => compile(oldVersion)).toThrow('版本或格式不受支持');

    const unknownField = authorProject();
    (unknownField.project as Record<string, unknown>).nativePath = '/private/tmp';
    expect(() => compile(unknownField)).toThrow('字段不符合作者项目 v9');
  });

  it('rejects duplicate IDs and duplicate asset paths', () => {
    const duplicateId = authorProject();
    const assets = duplicateId.assets as Array<Record<string, unknown>>;
    assets[4].id = 'dialogue-1';
    expect(() => compile(duplicateId)).toThrow('重复的实体或资源 ID');

    const duplicatePath = authorProject();
    const duplicatePathAssets = duplicatePath.assets as Array<Record<string, unknown>>;
    duplicatePathAssets[4].relativePath = 'assets/images/image-1.png';
    expect(() => compile(duplicatePath)).toThrow('重复的资源相对路径');
  });

  it('rejects path traversal, wrong media types, and invalid scene jumps', () => {
    const traversal = authorProject();
    const assets = traversal.assets as Array<Record<string, unknown>>;
    assets[0].relativePath = 'assets/images/../secret.png';
    expect(() => compile(traversal)).toThrow('不安全的资源相对路径');

    const wrongType = authorProject();
    const wrongAssets = wrongType.assets as Array<Record<string, unknown>>;
    wrongAssets[0].type = 'audio';
    wrongAssets[0].relativePath = 'assets/audio/image-1.mp3';
    expect(() => compile(wrongType)).toThrow('缺失或类型错误的资源');

    const selfJump = authorProject();
    const scenes = (selfJump.project as { scenes: Array<Record<string, unknown>> }).scenes;
    const nodes = scenes[1].nodes as Array<Record<string, unknown>>;
    nodes[0].targetSceneId = 'scene-2';
    expect(() => compile(selfJump)).toThrow('目标无效');
  });

  it('fails instead of silently dropping legacy initial character visuals', () => {
    const document = authorProject();
    const scenes = (document.project as { scenes: Array<Record<string, unknown>> }).scenes;
    const visuals = scenes[0].visuals as { characters: unknown[] };
    visuals.characters.push({
      id: 'initial-character-1',
      assetId: 'image-2',
      slot: 'left',
    });

    expect(() => compile(document)).toThrow('不支持场景初始人物');
  });
});
