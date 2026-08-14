import { describe, expect, it } from 'vitest';

import { parseBackendResponse } from '../../src/main/backend/backendResponse';

const validProject = {
  schemaVersion: 1,
  id: 'project-1',
  name: 'Story',
  entrySceneId: 'scene-1',
  scenes: [
    {
      schemaVersion: 1,
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
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
        },
        {
          id: 'character-1',
          type: 'character',
          assetId: 'asset-1',
          slot: 'right',
          layer: 3,
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
                { type: 'background', assetId: 'asset-1' },
                {
                  type: 'character',
                  assetId: 'asset-1',
                  slot: 'right',
                  layer: 3,
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
    { type: 'background', assetId: 7 },
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
});
