/**
 * 文件主要作用：验证 backend response validation 的行为。
 * 测试覆盖：`backend response validation`。
 */

import { describe, expect, it } from 'vitest';

import { parseBackendResponse } from '../../src/main/backend/backendResponse';

const validProject = {
  schemaVersion: 1,
  id: 'project-1',
  name: 'Story',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Custom story title',
    eyebrow: 'A CUSTOM STORY',
    backgroundAssetId: 'asset-1',
    musicAssetId: null,
  },
  cgGallery: {
    pages: [{
      imageAssetIds: ['asset-1', null, null, null, null, null, null, null, null],
    }],
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
          id: 'dialogue-1',
          type: 'dialogue',
          speaker: 'Ryan',
          text: 'Hello',
          voiceAssetId: null,
        },
        {
          id: 'background-1',
          type: 'background',
          assetId: 'asset-1',
          scalePercent: 80,
        },
        {
          id: 'character-1',
          type: 'character',
          mode: 'show',
          assetId: 'asset-1',
          slot: 'right',
          layer: 3,
          scalePercent: 125,
          position: { x: 73, y: 92 },
          effect: null,
        },
        {
          id: 'jump-1',
          type: 'sceneJump',
          targetSceneId: 'scene-2',
        },
        {
          id: 'bgm-1',
          type: 'bgm',
          assetId: null,
        },
        {
          id: 'video-1',
          type: 'video',
          assetId: 'video-asset-1',
        },
        {
          id: 'choice-1',
          type: 'choice',
          options: [
            {
              id: 'option-1',
              text: '去屋顶',
              targetSceneId: 'scene-2',
            },
          ],
        },
      ],
    },
  ],
};

function successResponse(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 1,
    ok: true,
    result: {
      project: validProject,
      assets: [
        {
          id: 'asset-1',
          type: 'image',
          displayName: 'portrait.png',
        },
      ],
      session: {
        revision: 2,
        savedRevision: 1,
        isDirty: true,
      },
      ...overrides,
    },
  });
}

describe('backend response validation', () => {
  it('accepts asset metadata and optional imported asset ID', () => {
    expect(
      parseBackendResponse(successResponse({ assetId: 'asset-1' })),
    ).toMatchObject({
      ok: true,
      result: {
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            displayName: 'portrait.png',
          },
        ],
        assetId: 'asset-1',
      },
    });
  });

  it('accepts and sanitizes the project start screen', () => {
    const parsed = parseBackendResponse(
      successResponse({
        project: {
          ...validProject,
          startScreen: {
            ...validProject.startScreen,
            privateBackgroundPath: '/not/public/background.png',
          },
        },
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          startScreen: {
            title: 'Custom story title',
            backgroundAssetId: 'asset-1',
            musicAssetId: null,
          },
        },
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('privateBackgroundPath');
  });

  it('accepts and sanitizes fixed CG gallery pages', () => {
    const parsed = parseBackendResponse(successResponse({
      project: {
        ...validProject,
        cgGallery: {
          pages: [{
            imageAssetIds: ['asset-1', null, null, null, null, null, null, null, null],
            privatePath: '/not/public/cg-page',
          }],
          privatePath: '/not/public/cg',
        },
      },
    }));

    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          cgGallery: {
            pages: [{
              imageAssetIds: ['asset-1', null, null, null, null, null, null, null, null],
            }],
          },
        },
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('privatePath');
  });

  it.each([
    undefined,
    {},
    { pages: [] },
    { pages: 'page-1' },
    { pages: [{ imageAssetIds: Array(8).fill(null) }] },
    { pages: [{ imageAssetIds: ['asset-1', 2, ...Array(7).fill(null)] }] },
    {
      pages: [
        { imageAssetIds: ['asset-1', ...Array(8).fill(null)] },
        { imageAssetIds: ['asset-1', ...Array(8).fill(null)] },
      ],
    },
  ])('rejects a malformed CG gallery: %j', (cgGallery) => {
    expect(() => parseBackendResponse(successResponse({
      project: { ...validProject, cgGallery },
    }))).toThrow('project');
  });

  it.each([
    undefined,
    { title: 'Story', eyebrow: 'STORY', backgroundAssetId: null },
    { title: 'Story', backgroundAssetId: null, musicAssetId: null },
    { eyebrow: 'STORY', backgroundAssetId: null, musicAssetId: null },
    { title: 7, eyebrow: 'STORY', backgroundAssetId: null, musicAssetId: null },
    { title: 'Story', eyebrow: 7, backgroundAssetId: null, musicAssetId: null },
    { title: 'Story', eyebrow: 'STORY', backgroundAssetId: 7, musicAssetId: null },
    { title: 'Story', eyebrow: 'STORY', backgroundAssetId: null, musicAssetId: false },
  ])('rejects a malformed project start screen: %j', (startScreen) => {
    expect(() =>
      parseBackendResponse(
        successResponse({ project: { ...validProject, startScreen } }),
      ),
    ).toThrow('project');
  });

  it('rejects malformed scene background scales', () => {
    const withoutScale = { ...validProject.scenes[0] } as Record<
      string,
      unknown
    >;
    delete withoutScale.backgroundScalePercent;
    for (const scene of [
      withoutScale,
      { ...validProject.scenes[0], backgroundScalePercent: 9 },
      { ...validProject.scenes[0], backgroundScalePercent: 301 },
      { ...validProject.scenes[0], backgroundScalePercent: 100.5 },
      {
        ...validProject.scenes[0],
        backgroundAssetId: null,
        backgroundScalePercent: 80,
      },
    ]) {
      expect(() => parseBackendResponse(successResponse({
        project: { ...validProject, scenes: [scene] },
      }))).toThrow('project');
    }
  });

  it('accepts an optional generated choice option ID', () => {
    expect(
      parseBackendResponse(successResponse({ optionId: 'option-1' })),
    ).toMatchObject({
      ok: true,
      result: { optionId: 'option-1' },
    });
  });

  it('accepts and sanitizes all public timeline node types', () => {
    const parsed = parseBackendResponse(
      successResponse({
        project: {
          ...validProject,
          privateProjectPath: '/Users/example/story',
          scenes: [
            {
              ...validProject.scenes[0],
              nodes: [
                validProject.scenes[0].nodes[0],
                {
                  ...validProject.scenes[0].nodes[1],
                  relativePath: 'assets/images/asset-1.png',
                },
                {
                  ...validProject.scenes[0].nodes[2],
                  relativePath: 'assets/images/asset-1.png',
                },
                validProject.scenes[0].nodes[3],
                validProject.scenes[0].nodes[4],
                {
                  ...validProject.scenes[0].nodes[5],
                  relativePath: 'assets/videos/video-asset-1.mp4',
                },
                {
                  id: 'choice-1',
                  type: 'choice',
                  privateChoiceMetadata: '/not/public',
                  options: [
                    {
                      id: 'option-1',
                      text: '去屋顶',
                      targetSceneId: 'scene-2',
                      privateTargetPath: '/not/public',
                    },
                  ],
                },
                {
                  id: 'extension-1',
                  type: 'storyExtension',
                  privateLayoutPath: '/not/public',
                },
              ],
            },
          ],
        },
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [
            {
              nodes: [
                {
                  type: 'dialogue',
                  speaker: 'Ryan',
                  voiceAssetId: null,
                },
                { type: 'background', assetId: 'asset-1', scalePercent: 80 },
                {
                  type: 'character',
                  mode: 'show',
                  assetId: 'asset-1',
                  slot: 'right',
                  layer: 3,
                  scalePercent: 125,
                  position: { x: 73, y: 92 },
                  effect: null,
                },
                { type: 'sceneJump', targetSceneId: 'scene-2' },
                { type: 'bgm', assetId: null },
                { type: 'video', assetId: 'video-asset-1' },
                {
                  type: 'choice',
                  options: [
                    {
                      id: 'option-1',
                      text: '去屋顶',
                      targetSceneId: 'scene-2',
                    },
                  ],
                },
                { id: 'extension-1', type: 'storyExtension' },
              ],
            },
          ],
        },
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('privateProjectPath');
    expect(JSON.stringify(parsed)).not.toContain('relativePath');
    expect(JSON.stringify(parsed)).not.toContain('privateChoiceMetadata');
    expect(JSON.stringify(parsed)).not.toContain('privateTargetPath');
    expect(JSON.stringify(parsed)).not.toContain('privateLayoutPath');
  });

  it('accepts strict portrait effects and rejects malformed character payloads', () => {
    const character = validProject.scenes[0].nodes[2];
    const withEffect = {
      ...character,
      effect: {
        type: 'slideIn',
        durationMs: 750,
        intensity: 'normal',
        direction: 'left',
      },
    };
    const parsed = parseBackendResponse(successResponse({
      project: {
        ...validProject,
        scenes: [{ ...validProject.scenes[0], nodes: [withEffect] }],
      },
    }));
    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [{ nodes: [withEffect] }],
        },
      },
    });

    for (const characterMode of [
      {
        ...character,
        mode: 'show',
        assetId: null,
        effect: null,
      },
      {
        ...character,
        mode: 'clear',
        assetId: null,
        position: null,
        effect: null,
        scalePercent: 100,
      },
    ]) {
      expect(parseBackendResponse(successResponse({
        project: {
          ...validProject,
          scenes: [{ ...validProject.scenes[0], nodes: [characterMode] }],
        },
      }))).toMatchObject({
        ok: true,
        result: {
          project: {
            scenes: [{ nodes: [characterMode] }],
          },
        },
      });
    }

    const withoutEffect: Record<string, unknown> = { ...character };
    delete withoutEffect.effect;
    const withoutMode: Record<string, unknown> = { ...character };
    delete withoutMode.mode;
    const withoutScale: Record<string, unknown> = { ...character };
    delete withoutScale.scalePercent;
    for (const malformed of [
      withoutEffect,
      withoutMode,
      withoutScale,
      { ...character, scalePercent: 9 },
      { ...character, scalePercent: 301 },
      {
        ...character,
        assetId: null,
        effect: { type: 'fadeOut', durationMs: 500 },
      },
      {
        ...character,
        effect: { type: 'shake', durationMs: 99, intensity: 'normal' },
      },
      {
        ...character,
        effect: {
          type: 'fadeIn',
          durationMs: 500,
          intensity: 'normal',
        },
      },
      {
        ...character,
        effect: {
          type: 'slideIn',
          durationMs: 500,
          intensity: 'normal',
          direction: 'down',
          privateField: true,
        },
      },
      {
        ...character,
        mode: 'clear',
      },
      {
        ...character,
        mode: 'clear',
        assetId: null,
        position: { x: 50, y: 90 },
        effect: null,
      },
      {
        ...character,
        mode: 'clear',
        assetId: null,
        position: null,
        effect: { type: 'fadeOut', durationMs: 500 },
      },
      {
        ...character,
        mode: 'placeholder',
      },
    ]) {
      expect(() => parseBackendResponse(successResponse({
        project: {
          ...validProject,
          scenes: [{ ...validProject.scenes[0], nodes: [malformed] }],
        },
      }))).toThrow('project');
    }
  });

  it('accepts an explicit no-background timeline node', () => {
    const parsed = parseBackendResponse(
      successResponse({
        project: {
          ...validProject,
          scenes: [
            {
              ...validProject.scenes[0],
              nodes: [
                {
                  id: 'background-clear',
                  type: 'background',
                  assetId: null,
                  scalePercent: 100,
                },
              ],
            },
          ],
        },
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [
            {
              nodes: [
                {
                  id: 'background-clear',
                  type: 'background',
                  assetId: null,
                  scalePercent: 100,
                },
              ],
            },
          ],
        },
      },
    });
  });

  it('accepts an unassigned video node and rejects malformed video IDs', () => {
    const parsed = parseBackendResponse(
      successResponse({
        project: {
          ...validProject,
          scenes: [
            {
              ...validProject.scenes[0],
              nodes: [{ id: 'video-empty', type: 'video', assetId: null }],
            },
          ],
        },
      }),
    );

    expect(parsed).toMatchObject({
      ok: true,
      result: {
        project: {
          scenes: [
            {
              nodes: [
                { id: 'video-empty', type: 'video', assetId: null },
              ],
            },
          ],
        },
      },
    });

    expect(() =>
      parseBackendResponse(
        successResponse({
          project: {
            ...validProject,
            scenes: [
              {
                ...validProject.scenes[0],
                nodes: [{ id: 'video-bad', type: 'video', assetId: 7 }],
              },
            ],
          },
        }),
      ),
    ).toThrow('project');
  });

  it('rejects malformed nested choice options', () => {
    for (const options of [
      null,
      [{ id: 'option-1', text: 7, targetSceneId: 'scene-2' }],
      [{ id: 'option-1', text: '留下', targetSceneId: null }],
    ]) {
      expect(() =>
        parseBackendResponse(
          successResponse({
            project: {
              ...validProject,
              scenes: [
                {
                  ...validProject.scenes[0],
                  nodes: [{ id: 'choice-bad', type: 'choice', options }],
                },
              ],
            },
          }),
        ),
      ).toThrow('project');
    }
  });

  it('strips backend-only paths and unknown result metadata', () => {
    const parsed = parseBackendResponse(
      successResponse({
        sourceFilePath: '/Users/example/Pictures/portrait.png',
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            displayName: 'portrait.png',
            relativePath: 'assets/images/asset-1.png',
          },
        ],
      }),
    );

    expect(JSON.stringify(parsed)).not.toContain('sourceFilePath');
    expect(JSON.stringify(parsed)).not.toContain('relativePath');
  });

  it.each([
    { assets: undefined },
    { assets: [{ id: 'asset-1', type: 'binary', displayName: 'a' }] },
    { assets: [{ id: 'asset-1', type: 'image' }] },
    { assetId: 42 },
  ])('rejects malformed asset results: %j', (overrides) => {
    expect(() =>
      parseBackendResponse(successResponse(overrides)),
    ).toThrow('assets');
  });

  it.each([
    { type: 'background' },
    { type: 'background', assetId: 7, scalePercent: 100 },
    { type: 'background', assetId: 'asset-1', scalePercent: 9 },
    { type: 'background', assetId: 'asset-1', scalePercent: 301 },
    { type: 'background', assetId: null, scalePercent: 80 },
    { type: 'unknown', assetId: 'asset-1' },
  ])('rejects a malformed background node: %j', (node) => {
    expect(() =>
      parseBackendResponse(
        successResponse({
          project: {
            ...validProject,
            scenes: [
              {
                ...validProject.scenes[0],
                nodes: [{ id: 'background-1', ...node }],
              },
            ],
          },
        }),
      ),
    ).toThrow('project');
  });

  it.each([
    { sceneId: 4 },
    { nodeId: null },
    { optionId: false },
    { assetId: false },
  ])('rejects malformed optional result IDs: %j', (overrides) => {
    expect(() =>
      parseBackendResponse(successResponse(overrides)),
    ).toThrow('session');
  });

  it('accepts, sanitizes, and structurally validates logic markers', () => {
    const logicNodes = [
      {
        id: 'if-1',
        type: 'logicIf',
        condition: {
          left: { kind: 'variable', name: 'route' },
          operator: 'eq',
          right: { kind: 'literal', value: 'good' },
        },
        privateSource: 'never expose',
      },
      {
        id: 'set-1',
        type: 'variableSet',
        variableName: 'route',
        value: 'good',
      },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'repeat-1', type: 'logicRepeat', count: 3 },
      {
        id: 'change-1',
        type: 'variableChange',
        variableName: 'score',
        amount: 1,
      },
      {
        id: 'repeat-end-1',
        type: 'logicEndRepeat',
        repeatNodeId: 'repeat-1',
      },
      { id: 'if-end-1', type: 'logicEndIf', ifNodeId: 'if-1' },
    ];
    const parsed = parseBackendResponse(successResponse({
      project: {
        ...validProject,
        scenes: [{ ...validProject.scenes[0], nodes: logicNodes }],
      },
    }));

    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      throw new Error('expected a successful response');
    }
    expect(parsed.result.project.scenes[0]?.nodes.map((node) => node.type))
      .toEqual([
        'logicIf',
        'variableSet',
        'logicElse',
        'logicRepeat',
        'variableChange',
        'logicEndRepeat',
        'logicEndIf',
      ]);
    expect(JSON.stringify(parsed)).not.toContain('privateSource');

    for (const nodes of [
      logicNodes.filter((node) => node.type !== 'logicElse'),
      [logicNodes[0], { id: 'extension-1', type: 'storyExtension' }, ...logicNodes.slice(1)],
      logicNodes.map((node) => node.type === 'logicEndIf'
        ? { ...node, ifNodeId: 'another-if' }
        : node),
      logicNodes.map((node) => node.type === 'logicRepeat'
        ? { ...node, count: 1001 }
        : node),
    ]) {
      expect(() => parseBackendResponse(successResponse({
        project: {
          ...validProject,
          scenes: [{ ...validProject.scenes[0], nodes }],
        },
      }))).toThrow('project');
    }
  });

  it('sanitizes paired CG displays and rejects malformed bodies', () => {
    const condition = {
      left: { kind: 'literal', value: true },
      operator: 'eq',
      right: { kind: 'literal', value: true },
    };
    const cgNodes = [
      { id: 'if-1', type: 'logicIf', condition },
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'asset-1',
        leadInMs: 1250,
        privatePath: '/never/expose.png',
      },
      {
        id: 'cg-dialogue-1',
        type: 'dialogue',
        speaker: 'Ryan',
        text: 'CG dialogue',
        voiceAssetId: null,
      },
      { id: 'cg-end-1', type: 'cgEndDisplay', cgDisplayNodeId: 'cg-1' },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'if-end-1', type: 'logicEndIf', ifNodeId: 'if-1' },
    ];
    const response = successResponse({
      project: {
        ...validProject,
        scenes: [{ ...validProject.scenes[0], nodes: cgNodes }],
      },
    });
    const parsed = parseBackendResponse(response);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) {
      throw new Error('expected a successful response');
    }
    expect(parsed.result.project.scenes[0]?.nodes).toEqual([
      { id: 'if-1', type: 'logicIf', condition },
      {
        id: 'cg-1',
        type: 'cgDisplay',
        assetId: 'asset-1',
        leadInMs: 1250,
      },
      cgNodes[2],
      { id: 'cg-end-1', type: 'cgEndDisplay', cgDisplayNodeId: 'cg-1' },
      { id: 'else-1', type: 'logicElse', ifNodeId: 'if-1' },
      { id: 'if-end-1', type: 'logicEndIf', ifNodeId: 'if-1' },
    ]);
    expect(JSON.stringify(parsed)).not.toContain('privatePath');

    for (const nodes of [
      cgNodes.filter((node) => node.type !== 'cgEndDisplay'),
      cgNodes.map((node) => node.type === 'cgEndDisplay'
        ? { ...node, cgDisplayNodeId: 'another-cg' }
        : node),
      cgNodes.map((node) => node.type === 'cgDisplay'
        ? { ...node, leadInMs: 60001 }
        : node),
      [
        cgNodes[0],
        cgNodes[1],
        {
          id: 'background-inside',
          type: 'background',
          assetId: null,
          scalePercent: 100,
        },
        ...cgNodes.slice(2),
      ],
      [
        cgNodes[0],
        cgNodes[1],
        {
          id: 'nested-cg',
          type: 'cgDisplay',
          assetId: 'asset-1',
          leadInMs: 0,
        },
        ...cgNodes.slice(2),
      ],
    ]) {
      expect(() => parseBackendResponse(successResponse({
        project: {
          ...validProject,
          scenes: [{ ...validProject.scenes[0], nodes }],
        },
      }))).toThrow('project');
    }
  });
});
