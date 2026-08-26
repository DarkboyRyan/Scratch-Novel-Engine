import { describe, expect, it } from 'vitest';

import { compileAuthorProjectV15 } from '../../src/main/export/AuthorProjectCompiler';

function authorProject(): Record<string, unknown> {
  return {
    format: 'vn-engine-project',
    fileVersion: 16,
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: '导出测试',
      entrySceneId: 'scene-1',
      startScreen: {
        title: '星光物语',
        backgroundAssetId: 'title-background',
        musicAssetId: 'title-music',
      },
      cgGallery: {
        pages: [
          {
            imageAssetIds: [
              null,
              'unused-image',
              ...Array<string | null>(7).fill(null),
            ],
          },
          { imageAssetIds: Array<string | null>(9).fill(null) },
        ],
      },
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
              position: { x: 41.5, y: 90 },
            },
            { id: 'bgm-1', type: 'bgm', assetId: 'audio-1' },
            { id: 'extension-1', type: 'storyExtension' },
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
        id: 'title-background',
        type: 'image',
        relativePath: 'assets/images/title-background.png',
        displayName: '主界面背景.png',
      },
      {
        id: 'title-music',
        type: 'audio',
        relativePath: 'assets/audio/title-music.ogg',
        displayName: '主界面音乐.ogg',
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
  return compileAuthorProjectV15(JSON.stringify(document));
}

describe('author project v16 compiler', () => {
  it('builds exact runtime v7 data and includes fixed CG pages and CG-only assets', () => {
    const result = compile(authorProject());

    expect(result.game).toMatchObject({
      format: 'vn-engine-runtime',
      runtimeVersion: 7,
      game: {
        id: 'project-1',
        title: '导出测试',
        entrySceneId: 'scene-1',
        startScreen: {
          title: '星光物语',
          backgroundAssetId: 'title-background',
          musicAssetId: 'title-music',
        },
        cgGallery: {
          pages: [
            {
              imageAssetIds: [
                null,
                'unused-image',
                ...Array<string | null>(7).fill(null),
              ],
            },
            { imageAssetIds: Array<string | null>(9).fill(null) },
          ],
        },
      },
    });
    expect(result.game.scenes[0]).toMatchObject({
      schemaVersion: 1,
      id: 'scene-1',
      backgroundAssetId: 'image-1',
    });
    expect(result.game.scenes[0]).not.toHaveProperty('visuals');
    expect(result.game.scenes[0].nodes).toContainEqual(
      expect.objectContaining({
        id: 'character-1',
        position: { x: 41.5, y: 90 },
      }),
    );
    expect(result.sourceProject.scenes[0].nodes).toContainEqual({
      id: 'extension-1',
      type: 'storyExtension',
    });
    expect(result.project.scenes[0].nodes).not.toContainEqual(
      expect.objectContaining({ type: 'storyExtension' }),
    );
    expect(result.game.scenes[0].nodes).not.toContainEqual(
      expect.objectContaining({ type: 'storyExtension' }),
    );
    expect(result.referencedAssets.map((asset) => asset.id)).toEqual([
      'image-1',
      'image-2',
      'audio-1',
      'video-1-asset',
      'title-background',
      'title-music',
      'unused-image',
    ]);
    expect(result.allAssetCount).toBe(7);
  });

  it('accepts non-ASCII whitespace that the C++ ASCII trim rule preserves', () => {
    const document = authorProject();
    (document.project as { name: string }).name = '\u00a0标题\u00a0';

    expect(compile(document).project.name).toBe('\u00a0标题\u00a0');
  });

  it('compiles strict v16 logic markers and rejects them in older files', () => {
    const document = authorProject() as {
      fileVersion: number;
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    document.project.scenes[0]!.nodes = [
      { id: 'set', type: 'variableSet', variableName: 'score', value: 1 },
      {
        id: 'if',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'score' },
          operator: 'gte',
          right: { kind: 'literal', value: 1 },
        },
      },
      { id: 'repeat', type: 'logicRepeat', count: 2 },
      { id: 'change', type: 'variableChange', variableName: 'score', amount: 1 },
      { id: 'end-repeat', type: 'logicEndRepeat', repeatNodeId: 'repeat' },
      { id: 'else', type: 'logicElse', ifNodeId: 'if' },
      { id: 'reset', type: 'variableSet', variableName: 'score', value: 0 },
      { id: 'end-if', type: 'logicEndIf', ifNodeId: 'if' },
    ];

    expect(compile(document).game.scenes[0]!.nodes.map((node) => node.type))
      .toEqual([
        'variableSet',
        'logicIf',
        'logicRepeat',
        'variableChange',
        'logicEndRepeat',
        'logicElse',
        'variableSet',
        'logicEndIf',
      ]);

    document.fileVersion = 15;
    expect(() => compile(document)).toThrow('仅受作者项目 v16 支持');
  });

  it('rejects pagination inside controls and projects exceeding the variable budget', () => {
    const extensionInside = authorProject() as {
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    extensionInside.project.scenes[0]!.nodes = [
      {
        id: 'if',
        type: 'logicIf',
        condition: {
          left: { kind: 'literal', value: true },
          operator: 'eq',
          right: { kind: 'literal', value: true },
        },
      },
      { id: 'extension', type: 'storyExtension' },
      { id: 'else', type: 'logicElse', ifNodeId: 'if' },
      { id: 'end-if', type: 'logicEndIf', ifNodeId: 'if' },
    ];
    expect(() => compile(extensionInside)).toThrow('延伸节点不能位于逻辑控制结构内部');

    const tooManyVariables = authorProject() as {
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    tooManyVariables.project.scenes[0]!.nodes = Array.from(
      { length: 33 },
      (_, index) => ({
        id: `set-${index}`,
        type: 'variableSet',
        variableName: `variable-${index}`,
        value: 0,
      }),
    );
    expect(() => compile(tooManyVariables)).toThrow('剧情变量不能超过 32 个');
  });

  it('rejects unsupported versions and unknown fields', () => {
    const oldVersion = authorProject();
    oldVersion.fileVersion = 10;
    expect(() => compile(oldVersion)).toThrow('版本或格式不受支持');

    const unknownField = authorProject();
    (unknownField.project as Record<string, unknown>).nativePath = '/private/tmp';
    expect(() => compile(unknownField)).toThrow('字段不符合作者项目 v16');
  });

  it('rejects an empty or ASCII-padded custom title', () => {
    const empty = authorProject();
    (empty.project as { startScreen: { title: string } }).startScreen.title = '';
    expect(() => compile(empty)).toThrow('project.startScreen.title 不是有效字符串');

    const padded = authorProject();
    (padded.project as { startScreen: { title: string } }).startScreen.title =
      '  星光物语  ';
    expect(() => compile(padded)).toThrow(
      'project.startScreen.title 不能包含首尾空白',
    );
  });

  it('rejects duplicate IDs and duplicate asset paths', () => {
    const duplicateId = authorProject();
    const assets = duplicateId.assets as Array<Record<string, unknown>>;
    assets[6].id = 'dialogue-1';
    expect(() => compile(duplicateId)).toThrow('重复的实体或资源 ID');

    const duplicatePath = authorProject();
    const duplicatePathAssets = duplicatePath.assets as Array<Record<string, unknown>>;
    duplicatePathAssets[6].relativePath = 'assets/images/image-1.png';
    expect(() => compile(duplicatePath)).toThrow('重复的资源相对路径');
  });

  it('rejects missing and incorrectly typed start-screen resources', () => {
    const missing = authorProject();
    const startScreen = (missing.project as {
      startScreen: { backgroundAssetId: string };
    }).startScreen;
    startScreen.backgroundAssetId = 'missing';
    expect(() => compile(missing)).toThrow('主界面背景 引用了缺失或类型错误的资源');

    const wrongType = authorProject();
    const wrongStartScreen = (wrongType.project as {
      startScreen: { musicAssetId: string };
    }).startScreen;
    wrongStartScreen.musicAssetId = 'image-1';
    expect(() => compile(wrongType)).toThrow('主界面音乐 引用了缺失或类型错误的资源');
  });

  it('rejects duplicate, missing, or non-image CG gallery resources', () => {
    const duplicate = authorProject();
    (duplicate.project as {
      cgGallery: { pages: Array<{ imageAssetIds: Array<string | null> }> };
    }).cgGallery.pages[0].imageAssetIds[0] = 'unused-image';
    expect(() => compile(duplicate)).toThrow('不能包含重复资源 ID');

    const missing = authorProject();
    (missing.project as {
      cgGallery: { pages: Array<{ imageAssetIds: Array<string | null> }> };
    }).cgGallery.pages[0].imageAssetIds[1] = 'missing';
    expect(() => compile(missing)).toThrow(
      'CG 画廊 引用了缺失或类型错误的资源',
    );

    const wrongType = authorProject();
    (wrongType.project as {
      cgGallery: { pages: Array<{ imageAssetIds: Array<string | null> }> };
    }).cgGallery.pages[0].imageAssetIds[1] = 'title-music';
    expect(() => compile(wrongType)).toThrow(
      'CG 画廊 引用了缺失或类型错误的资源',
    );
  });

  it('rejects empty galleries and pages that do not have exactly nine slots', () => {
    const empty = authorProject();
    (empty.project as {
      cgGallery: { pages: Array<{ imageAssetIds: Array<string | null> }> };
    }).cgGallery.pages = [];
    expect(() => compile(empty)).toThrow('至少需要一页');

    const shortPage = authorProject();
    (shortPage.project as {
      cgGallery: { pages: Array<{ imageAssetIds: Array<string | null> }> };
    }).cgGallery.pages[0].imageAssetIds.pop();
    expect(() => compile(shortPage)).toThrow('必须精确包含 9 个槽位');
  });

  it('migrates strict v14 flat galleries into fixed pages before compiling', () => {
    const empty = authorProject();
    empty.fileVersion = 14;
    (empty.project as Record<string, unknown>).cgGallery = {
      imageAssetIds: [],
    };
    expect(compile(empty).sourceProject.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
    });

    const populated = authorProject();
    populated.fileVersion = 14;
    const legacyAssetIds = Array.from(
      { length: 10 },
      (_, index) => `legacy-cg-${index + 1}`,
    );
    (populated.project as Record<string, unknown>).cgGallery = {
      imageAssetIds: legacyAssetIds,
    };
    (populated.assets as Array<Record<string, unknown>>).push(
      ...legacyAssetIds.map((assetId) => ({
        id: assetId,
        type: 'image',
        relativePath: `assets/images/${assetId}.png`,
        displayName: `${assetId}.png`,
      })),
    );
    expect(compile(populated).sourceProject.cgGallery).toEqual({
      pages: [
        { imageAssetIds: legacyAssetIds.slice(0, 9) },
        {
          imageAssetIds: [
            legacyAssetIds[9],
            ...Array(8).fill(null),
          ],
        },
      ],
    });
  });

  it('still rejects malformed v14 CG gallery fields and values', () => {
    const wrongFields = authorProject();
    wrongFields.fileVersion = 14;
    (wrongFields.project as Record<string, unknown>).cgGallery = { pages: [] };
    expect(() => compile(wrongFields)).toThrow('字段不符合作者项目');

    const nullEntry = authorProject();
    nullEntry.fileVersion = 14;
    (nullEntry.project as Record<string, unknown>).cgGallery = {
      imageAssetIds: [null],
    };
    expect(() => compile(nullEntry)).toThrow('不是有效资源 ID');
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

  it('rejects portrait coordinates outside the visual stage', () => {
    const document = authorProject();
    const scenes = (document.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes;
    scenes[0].nodes[2].position = { x: 50, y: 101 };

    expect(() => compile(document)).toThrow('坐标必须在 0 到 100 之间');
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
