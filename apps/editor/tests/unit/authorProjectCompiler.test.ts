/**
 * 文件主要作用：验证 author project v21 compiler 的行为。
 * 测试覆盖：严格编译、旧版迁移、Author 人物模式与标题界面的 Runtime 投影。
 */

import { describe, expect, it } from 'vitest';

import {
  AUTHOR_PROJECT_COMPILE_ERROR_CODES,
  AuthorProjectCompileError,
  compileAuthorProjectV15,
} from '../../src/main/export/AuthorProjectCompiler';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  toRuntimeProjectDocument,
  type ProjectDocument,
} from '../../src/shared/projectTypes';

function authorProject(): Record<string, unknown> {
  return {
    format: 'vn-engine-project',
    fileVersion: 22,
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: '导出测试',
      entrySceneId: 'scene-1',
      startScreen: {
        title: '星光物语',
        eyebrow: 'A CUSTOM STORY',
        backgroundAssetId: 'title-background',
        musicAssetId: 'title-music',
        style: {
          ...DEFAULT_START_SCREEN_STYLE,
          layout: 'center',
          backgroundFit: 'cover',
        },
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
        style: {
          ...DEFAULT_CG_GALLERY_STYLE,
          layout: 'edge-to-edge',
          thumbnailFit: 'cover',
          gapPx: 24,
        },
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene-1',
          name: '开场',
          visuals: {
            backgroundAssetId: 'image-1',
            backgroundScalePercent: 80,
            characters: [],
          },
          nodes: [
            {
              id: 'dialogue-1',
              type: 'dialogue',
              speaker: '旁白',
              text: '开始',
              voiceAssetId: 'audio-1',
            },
            {
              id: 'background-1',
              type: 'background',
              assetId: null,
              scalePercent: 100,
            },
            {
              id: 'character-1',
              type: 'character',
              mode: 'show',
              assetId: 'image-2',
              slot: 'center',
              layer: 2,
              scalePercent: 125,
              position: { x: 41.5, y: 90 },
              effect: null,
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
          visuals: {
            backgroundAssetId: null,
            backgroundScalePercent: 100,
            characters: [],
          },
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

function downgradeTo(
  document: Record<string, unknown>,
  fileVersion: number,
): void {
  document.fileVersion = fileVersion;
  if (fileVersion < 22) {
    const project = document.project as {
      startScreen: Record<string, unknown>;
      cgGallery: Record<string, unknown>;
    };
    delete project.startScreen.style;
    delete project.cgGallery.style;
  }
  if (fileVersion < 20) {
    const startScreen = (document.project as {
      startScreen: Record<string, unknown>;
    }).startScreen;
    delete startScreen.eyebrow;
  }
  const scenes = (document.project as {
    scenes: Array<{
      visuals: Record<string, unknown>;
      nodes: Array<Record<string, unknown>>;
    }>;
  }).scenes;
  for (const scene of scenes) {
    if (fileVersion < 21) {
      delete scene.visuals.backgroundScalePercent;
    }
    for (const node of scene.nodes) {
      if (
        fileVersion < 21 &&
        (node.type === 'background' || node.type === 'character')
      ) {
        delete node.scalePercent;
      }
      if (node.type === 'character') {
        if (fileVersion < 19) {
          delete node.mode;
        }
        if (fileVersion < 18) {
          delete node.effect;
        }
      }
    }
  }
}

describe('author project v22 compiler', () => {
  it('preserves empty speaker and text fields in the runtime projection', () => {
    const document = authorProject() as {
      project: { scenes: Array<{ nodes: Array<Record<string, unknown>> }> };
    };
    document.project.scenes[0]!.nodes[0] = {
      id: 'dialogue-1',
      type: 'dialogue',
      speaker: '',
      text: '',
      voiceAssetId: 'audio-1',
    };

    expect(compile(document).game.scenes[0]!.nodes[0]).toEqual({
      id: 'dialogue-1',
      type: 'dialogue',
      speaker: '',
      text: '',
      voiceAssetId: 'audio-1',
    });
  });

  it('builds exact runtime v13 data with the selected default language', () => {
    const result = compileAuthorProjectV15(
      JSON.stringify(authorProject()),
      'en-US',
    );

    expect(result.game).toMatchObject({
      format: 'vn-engine-runtime',
      runtimeVersion: 13,
      game: {
        id: 'project-1',
        title: '导出测试',
        entrySceneId: 'scene-1',
        defaultLanguage: 'en-US',
        startScreen: {
          title: '星光物语',
          eyebrow: 'A CUSTOM STORY',
          backgroundAssetId: 'title-background',
          musicAssetId: 'title-music',
          style: {
            ...DEFAULT_START_SCREEN_STYLE,
            layout: 'center',
            backgroundFit: 'cover',
          },
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
          style: {
            ...DEFAULT_CG_GALLERY_STYLE,
            layout: 'edge-to-edge',
            thumbnailFit: 'cover',
            gapPx: 24,
          },
        },
      },
    });
    expect(compile(authorProject()).game.game.defaultLanguage).toBe('zh-CN');
    expect(result.game.scenes[0]).toMatchObject({
      schemaVersion: 1,
      id: 'scene-1',
      backgroundAssetId: 'image-1',
      backgroundScalePercent: 80,
    });
    expect(result.game.scenes[0]).not.toHaveProperty('visuals');
    expect(result.game.scenes[0].nodes).toContainEqual(
      expect.objectContaining({
        id: 'character-1',
        position: { x: 41.5, y: 90 },
        scalePercent: 125,
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
    expect(result.sourceProject.scenes[0].nodes).toContainEqual(
      expect.objectContaining({
        id: 'character-1',
        mode: 'show',
      }),
    );
    expect(result.project.scenes[0].nodes).toContainEqual(
      expect.objectContaining({
        id: 'character-1',
        assetId: 'image-2',
      }),
    );
    expect(result.project.scenes[0].nodes[2]).not.toHaveProperty('mode');
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

  it('migrates v20 image scales and validates v21 scales strictly', () => {
    const legacy = authorProject();
    downgradeTo(legacy, 20);
    const migrated = compile(legacy);
    expect(migrated.sourceProject.scenes[0]).toMatchObject({
      backgroundScalePercent: 100,
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'background-1', scalePercent: 100 }),
        expect.objectContaining({ id: 'character-1', scalePercent: 100 }),
      ]),
    });
    expect(migrated.game.scenes[0]).toMatchObject({
      backgroundScalePercent: 100,
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'background-1', scalePercent: 100 }),
        expect.objectContaining({ id: 'character-1', scalePercent: 100 }),
      ]),
    });

    const missingSceneScale = authorProject();
    delete (missingSceneScale.project as {
      scenes: Array<{ visuals: Record<string, unknown> }>;
    }).scenes[0]!.visuals.backgroundScalePercent;
    expect(() => compile(missingSceneScale)).toThrow(
      '字段不符合作者项目 v22',
    );

    for (const [target, scalePercent] of [
      ['scene', 9],
      ['scene', 301],
      ['background', 100.5],
      ['character', true],
    ] as const) {
      const invalid = authorProject();
      const scene = (invalid.project as {
        scenes: Array<{
          visuals: Record<string, unknown>;
          nodes: Array<Record<string, unknown>>;
        }>;
      }).scenes[0]!;
      if (target === 'scene') {
        scene.visuals.backgroundScalePercent = scalePercent;
      } else {
        scene.nodes[target === 'background' ? 1 : 2]!.scalePercent =
          scalePercent;
      }
      expect(() => compile(invalid)).toThrow(
        target === 'scene' ? 'backgroundScalePercent' : 'scalePercent',
      );
    }

    const invalidNullBackground = authorProject();
    const nullBackgroundScene = (invalidNullBackground.project as {
      scenes: Array<{
        visuals: Record<string, unknown>;
        nodes: Array<Record<string, unknown>>;
      }>;
    }).scenes[0]!;
    nullBackgroundScene.visuals.backgroundAssetId = null;
    expect(() => compile(invalidNullBackground)).toThrow(
      'backgroundAssetId 为 null 时 backgroundScalePercent 必须是 100',
    );

    const invalidClearScale = authorProject();
    const clearCharacter = (invalidClearScale.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    clearCharacter.mode = 'clear';
    clearCharacter.assetId = null;
    clearCharacter.position = null;
    clearCharacter.effect = null;
    expect(() => compile(invalidClearScale)).toThrow(
      'scalePercent 在 clear 模式下必须是 100',
    );
  });

  it('preserves strict v22 page styles and injects defaults for v21', () => {
    const current = compile(authorProject());
    expect(current.project.startScreen.style).toMatchObject({
      layout: 'center',
      backgroundFit: 'cover',
    });
    expect(current.project.cgGallery.style).toMatchObject({
      layout: 'edge-to-edge',
      thumbnailFit: 'cover',
      gapPx: 24,
    });

    const legacy = authorProject();
    downgradeTo(legacy, 21);
    expect(compile(legacy).project).toMatchObject({
      startScreen: { style: DEFAULT_START_SCREEN_STYLE },
      cgGallery: { style: DEFAULT_CG_GALLERY_STYLE },
    });

    const invalid = authorProject();
    const style = (invalid.project as {
      startScreen: { style: Record<string, unknown> };
    }).startScreen.style;
    style.pageColor = '#0b0c0f';
    expect(() => compile(invalid)).toThrow('project.startScreen.style');
  });

  it('keeps unresolved show nodes as preview no-ops and explicit clear nodes destructive', () => {
    const sourceProject = compile(authorProject()).sourceProject;
    const sourceCharacter = sourceProject.scenes[0]!.nodes.find(
      (node) => node.id === 'character-1',
    );
    if (sourceCharacter?.type !== 'character' || sourceCharacter.assetId === null) {
      throw new Error('fixture character missing');
    }

    const project: ProjectDocument = {
      ...sourceProject,
      scenes: [{
        ...sourceProject.scenes[0]!,
        nodes: [
          sourceCharacter,
          {
            ...sourceCharacter,
            id: 'character-unresolved',
            mode: 'show',
            assetId: null,
            effect: null,
          },
          {
            ...sourceCharacter,
            id: 'character-clear',
            mode: 'clear',
            assetId: null,
            position: null,
            effect: null,
            scalePercent: 100,
          },
        ],
      }],
    };

    const runtimeCharacters = toRuntimeProjectDocument(project)
      .scenes[0]!.nodes;
    expect(runtimeCharacters).toEqual([
      {
        id: 'character-1',
        type: 'character',
        assetId: 'image-2',
        slot: 'center',
        layer: 2,
        position: { x: 41.5, y: 90 },
        effect: null,
        scalePercent: 125,
      },
      {
        id: 'character-clear',
        type: 'character',
        assetId: null,
        slot: 'center',
        layer: 2,
        position: null,
        effect: null,
        scalePercent: 100,
      },
    ]);
    expect(runtimeCharacters.every((node) => !Object.hasOwn(node, 'mode')))
      .toBe(true);
  });

  it('fails export of unresolved show nodes with a stable error code', () => {
    const document = authorProject();
    const character = (document.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    character.assetId = null;
    character.effect = null;

    let thrown: unknown;
    try {
      compile(document);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AuthorProjectCompileError);
    expect(thrown).toMatchObject({
      code: AUTHOR_PROJECT_COMPILE_ERROR_CODES.unresolvedCharacterAsset,
      nodeId: 'character-1',
    });
    expect((thrown as Error).message).toContain('尚未选择人物立绘图片');
  });

  it('compiles explicit clear and strictly validates its v21 null fields', () => {
    const cleared = authorProject();
    const clearCharacter = (cleared.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    clearCharacter.mode = 'clear';
    clearCharacter.assetId = null;
    clearCharacter.position = null;
    clearCharacter.effect = null;
    clearCharacter.scalePercent = 100;

    expect(compile(cleared).project.scenes[0]!.nodes[2]).toEqual({
      id: 'character-1',
      type: 'character',
      assetId: null,
      slot: 'center',
      layer: 2,
      position: null,
      effect: null,
      scalePercent: 100,
    });

    for (const [field, value, message] of [
      ['assetId', 'image-2', 'assetId 在 clear 模式下必须是 null'],
      ['position', { x: 50, y: 90 }, 'position 在 clear 模式下必须是 null'],
      [
        'effect',
        { type: 'fadeOut', durationMs: 500 },
        'effect 在 clear 模式下必须是 null',
      ],
    ] as const) {
      const invalid = structuredClone(cleared);
      const character = (invalid.project as {
        scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
      }).scenes[0]!.nodes[2]!;
      character[field] = value;
      expect(() => compile(invalid)).toThrow(message);
    }
  });

  it('migrates v18 portrait nullability into author modes without rejecting legacy positions', () => {
    const shown = authorProject();
    downgradeTo(shown, 18);
    expect(compile(shown).sourceProject.scenes[0]!.nodes[2]).toMatchObject({
      type: 'character',
      mode: 'show',
      assetId: 'image-2',
    });

    const cleared = authorProject();
    downgradeTo(cleared, 18);
    const legacyCharacter = (cleared.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    legacyCharacter.assetId = null;
    legacyCharacter.position = { x: 41.5, y: 90 };
    legacyCharacter.effect = null;

    expect(compile(cleared).sourceProject.scenes[0]!.nodes[2]).toEqual({
      id: 'character-1',
      type: 'character',
      mode: 'clear',
      assetId: null,
      slot: 'center',
      layer: 2,
      position: null,
      effect: null,
      scalePercent: 100,
    });
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

    downgradeTo(document, 15);
    expect(() => compile(document)).toThrow('仅受作者项目 v16 支持');
  });

  it('compiles strict v17 CG display controls inside logic branches', () => {
    const document = authorProject() as {
      fileVersion: number;
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    const condition = {
      left: { kind: 'literal', value: true },
      operator: 'eq',
      right: { kind: 'literal', value: true },
    };
    document.project.scenes[0]!.nodes = [
      { id: 'if', type: 'logicIf', condition },
      {
        id: 'cg-then',
        type: 'cgDisplay',
        assetId: 'image-1',
        leadInMs: 1500,
      },
      {
        id: 'cg-dialogue',
        type: 'dialogue',
        speaker: '旁白',
        text: 'CG is visible.',
        voiceAssetId: 'audio-1',
      },
      {
        id: 'cg-then-end',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-then',
      },
      { id: 'else', type: 'logicElse', ifNodeId: 'if' },
      {
        id: 'cg-else',
        type: 'cgDisplay',
        assetId: 'image-2',
        leadInMs: 0,
      },
      {
        id: 'cg-else-end',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-else',
      },
      { id: 'if-end', type: 'logicEndIf', ifNodeId: 'if' },
    ];

    expect(compile(document).game.scenes[0]!.nodes).toEqual(
      document.project.scenes[0]!.nodes,
    );

    downgradeTo(document, 16);
    expect(() => compile(document)).toThrow('仅受作者项目 v17 支持');

    document.fileVersion = 17;
    (document.project.scenes[0]!.nodes[1] as { leadInMs: number })
      .leadInMs = 60001;
    expect(() => compile(document)).toThrow('leadInMs');
  });

  it('rejects non-dialogue CG bodies and non-image CG assets', () => {
    const body = authorProject() as {
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    body.project.scenes[0]!.nodes = [
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'image-1',
        leadInMs: 0,
      },
      {
        id: 'background-inside',
        type: 'background',
        assetId: null,
        scalePercent: 100,
      },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
    ];
    expect(() => compile(body)).toThrow('CG');

    const wrongAsset = authorProject() as {
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    wrongAsset.project.scenes[0]!.nodes = [
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'video-1-asset',
        leadInMs: 0,
      },
      {
        id: 'cg-end-1',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg-1',
      },
    ];
    expect(() => compile(wrongAsset)).toThrow('缺失或类型错误的资源');
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

    const extensionInsideCg = authorProject() as {
      project: { scenes: Array<{ nodes: unknown[] }> };
    };
    extensionInsideCg.project.scenes[0]!.nodes = [
      {
        id: 'cg',
        type: 'cgDisplay',
        assetId: 'image-1',
        leadInMs: 0,
      },
      { id: 'extension-in-cg', type: 'storyExtension' },
      {
        id: 'cg-end',
        type: 'cgEndDisplay',
        cgDisplayNodeId: 'cg',
      },
    ];
    expect(() => compile(extensionInsideCg)).toThrow(
      '延伸节点不能位于 CG 显示结构内部',
    );

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
    expect(() => compile(unknownField)).toThrow('字段不符合作者项目 v22');
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

  it('migrates the v19 eyebrow default and validates v20 eyebrow copy', () => {
    const legacy = authorProject();
    downgradeTo(legacy, 19);
    expect(compile(legacy).game.game.startScreen.eyebrow).toBe(
      'A VN ENGINE STORY',
    );

    const empty = authorProject();
    (empty.project as { startScreen: { eyebrow: string } })
      .startScreen.eyebrow = '';
    expect(compile(empty).game.game.startScreen.eyebrow).toBe('');

    const padded = authorProject();
    (padded.project as { startScreen: { eyebrow: string } })
      .startScreen.eyebrow = ' PADDED ';
    expect(() => compile(padded)).toThrow(
      'project.startScreen.eyebrow 必须是无首尾空白',
    );

    const tooLong = authorProject();
    (tooLong.project as { startScreen: { eyebrow: string } })
      .startScreen.eyebrow = '界'.repeat(86);
    expect(() => compile(tooLong)).toThrow('256 字节');

    const nul = authorProject();
    (nul.project as { startScreen: { eyebrow: string } })
      .startScreen.eyebrow = 'BAD\0COPY';
    expect(() => compile(nul)).toThrow(
      'project.startScreen.eyebrow 不是有效字符串',
    );

    const invalidUnicode = authorProject();
    (invalidUnicode.project as { startScreen: { eyebrow: string } })
      .startScreen.eyebrow = '\ud800';
    expect(() => compile(invalidUnicode)).toThrow('有效 UTF-8');

    const missing = authorProject();
    delete (missing.project as { startScreen: Record<string, unknown> })
      .startScreen.eyebrow;
    expect(() => compile(missing)).toThrow('字段不符合作者项目 v22');
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
    downgradeTo(empty, 14);
    (empty.project as Record<string, unknown>).cgGallery = {
      imageAssetIds: [],
    };
    expect(compile(empty).sourceProject.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
      style: DEFAULT_CG_GALLERY_STYLE,
    });

    const populated = authorProject();
    downgradeTo(populated, 14);
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
      style: DEFAULT_CG_GALLERY_STYLE,
    });
  });

  it('still rejects malformed v14 CG gallery fields and values', () => {
    const wrongFields = authorProject();
    downgradeTo(wrongFields, 14);
    (wrongFields.project as Record<string, unknown>).cgGallery = { pages: [] };
    expect(() => compile(wrongFields)).toThrow('字段不符合作者项目');

    const nullEntry = authorProject();
    downgradeTo(nullEntry, 14);
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

  it('compiles every strict v18 portrait-effect variant', () => {
    const effects = [
      { type: 'shake', durationMs: 100, intensity: 'subtle' },
      { type: 'jump', durationMs: 250, intensity: 'normal' },
      { type: 'breathe', durationMs: 10_000, intensity: 'strong' },
      { type: 'flash', durationMs: 500, intensity: 'normal' },
      { type: 'fadeIn', durationMs: 600 },
      { type: 'fadeOut', durationMs: 700 },
      {
        type: 'slideIn',
        durationMs: 800,
        intensity: 'strong',
        direction: 'left',
      },
    ];

    for (const effect of effects) {
      const document = authorProject();
      const character = (document.project as {
        scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
      }).scenes[0]!.nodes[2]!;
      character.effect = effect;

      expect(compile(document).game.scenes[0]!.nodes[2]).toMatchObject({
        type: 'character',
        effect,
      });
    }
  });

  it('migrates v17 portraits to effect null and rejects version spoofing', () => {
    const legacy = authorProject();
    downgradeTo(legacy, 17);
    expect(compile(legacy).game.scenes[0]!.nodes[2]).toMatchObject({
      type: 'character',
      effect: null,
    });

    const forgedLegacy = authorProject();
    forgedLegacy.fileVersion = 17;
    expect(() => compile(forgedLegacy)).toThrow(
      '字段不符合作者项目 v22',
    );

    const missingCurrentField = authorProject();
    const missingCharacter = (missingCurrentField.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    delete missingCharacter.effect;
    expect(() => compile(missingCurrentField)).toThrow(
      '字段不符合作者项目 v22',
    );
  });

  it('rejects invalid or inapplicable portrait effects', () => {
    const invalidEffects: unknown[] = [
      { type: 'shake', durationMs: 99, intensity: 'normal' },
      { type: 'shake', durationMs: 100.5, intensity: 'normal' },
      { type: 'fadeIn', durationMs: 500, intensity: 'normal' },
      {
        type: 'slideIn',
        durationMs: 500,
        intensity: 'normal',
      },
      {
        type: 'slideIn',
        durationMs: 500,
        intensity: 'normal',
        direction: 'diagonal',
      },
    ];

    for (const effect of invalidEffects) {
      const document = authorProject();
      const character = (document.project as {
        scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
      }).scenes[0]!.nodes[2]!;
      character.effect = effect;
      expect(() => compile(document)).toThrow('不是有效的立绘特效');
    }

    const cleared = authorProject();
    const clearedCharacter = (cleared.project as {
      scenes: Array<{ nodes: Array<Record<string, unknown>> }>;
    }).scenes[0]!.nodes[2]!;
    clearedCharacter.mode = 'clear';
    clearedCharacter.assetId = null;
    clearedCharacter.position = null;
    clearedCharacter.effect = {
      type: 'fadeOut',
      durationMs: 500,
    };
    expect(() => compile(cleared)).toThrow(
      'effect 在 clear 模式下必须是 null',
    );
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
