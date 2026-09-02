// 主要作用：验证 Editor 导出的运行包能被 Player 严格读取并启动。
// 关键实现：编译作者项目、导出资产清单，再以真实 Player 加载器回读。
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_START_SCREEN_STYLE,
  startGame,
} from '@vnengine/runtime';

import { loadRuntimeBundle } from '../../../player/src/main/content/PlayerBundleLoader';
import { compileAuthorProjectV15 } from '../../src/main/export/AuthorProjectCompiler';
import { exportRuntimeBundle } from '../../src/main/export/RuntimeBundleExporter';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Editor export to Player compatibility', () => {
  it('preserves Author v22 styles, language, and image scales in Runtime v13 through the Player strict reader', async () => {
    const testRoot = await mkdtemp(
      path.join(tmpdir(), 'vn-export-player-contract-'),
    );
    temporaryDirectories.push(testRoot);
    const projectRoot = path.join(testRoot, 'Author Project');
    const outputRoot = path.join(testRoot, 'Output');
    const bundlePath = path.join(outputRoot, 'Contract.vngame');
    await mkdir(path.join(projectRoot, 'assets', 'images'), {
      recursive: true,
    });
    await mkdir(outputRoot);

    const authorDocument = {
      format: 'vn-engine-project',
      fileVersion: 22,
      project: {
        schemaVersion: 1,
        id: 'contract-project',
        name: 'Contract Game',
        entrySceneId: 'scene-1',
        startScreen: {
          title: 'Contract Title',
          eyebrow: 'A VN ENGINE STORY',
          backgroundAssetId: 'background-asset',
          musicAssetId: null,
          style: {
            ...DEFAULT_START_SCREEN_STYLE,
            layout: 'center',
          },
        },
        cgGallery: {
          pages: [{
            imageAssetIds: [
              null,
              'background-asset',
              ...Array<string | null>(7).fill(null),
            ],
          }],
          style: {
            ...DEFAULT_CG_GALLERY_STYLE,
            gapPx: 24,
          },
        },
        scenes: [
          {
            schemaVersion: 1,
            id: 'scene-1',
            name: 'Opening',
            visuals: {
              backgroundAssetId: 'background-asset',
              backgroundScalePercent: 80,
              characters: [],
            },
            nodes: [
              {
                id: 'set-route',
                type: 'variableSet',
                variableName: 'route',
                value: 'open',
              },
              {
                id: 'if-route',
                type: 'logicIf',
                condition: {
                  left: { kind: 'variable', name: 'route' },
                  operator: 'eq',
                  right: { kind: 'literal', value: 'open' },
                },
              },
              {
                id: 'background-1',
                type: 'background',
                assetId: 'background-asset',
                scalePercent: 125,
              },
              {
                id: 'portrait-1',
                type: 'character',
                mode: 'show',
                assetId: 'background-asset',
                slot: 'left',
                layer: 1,
                position: null,
                effect: {
                  type: 'slideIn',
                  durationMs: 650,
                  intensity: 'normal',
                  direction: 'left',
                },
                scalePercent: 70,
              },
              {
                id: 'dialogue-1',
                type: 'dialogue',
                speaker: '',
                text: '',
                voiceAssetId: null,
              },
              { id: 'else-route', type: 'logicElse', ifNodeId: 'if-route' },
              {
                id: 'dialogue-2',
                type: 'dialogue',
                speaker: 'Narrator',
                text: 'Wrong branch',
                voiceAssetId: null,
              },
              { id: 'end-route', type: 'logicEndIf', ifNodeId: 'if-route' },
              { id: 'extension-1', type: 'storyExtension' },
            ],
          },
        ],
      },
      assets: [
        {
          id: 'background-asset',
          type: 'image',
          relativePath: 'assets/images/background-asset.png',
          displayName: 'Background.png',
        },
      ],
    };
    const authorContents = JSON.stringify(authorDocument);
    const compiled = compileAuthorProjectV15(authorContents, 'en-US');
    await writeFile(path.join(projectRoot, 'project.vn.json'), authorContents);
    await writeFile(
      path.join(projectRoot, 'assets', 'images', 'background-asset.png'),
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('editor-to-player-contract'),
      ]),
    );

    await exportRuntimeBundle({
      sourceProjectRootPath: projectRoot,
      targetBundlePath: bundlePath,
      sourceRevision: 7,
      expectedManifestSha256: createHash('sha256')
        .update(authorContents)
        .digest('hex'),
      expectedProject: compiled.sourceProject,
      expectedAssets: compiled.publicAssets,
      defaultLanguage: 'en-US',
      buildId: 'contract-build',
      createdAt: '2026-08-18T00:00:00.000Z',
    });
    const loaded = await loadRuntimeBundle(bundlePath);

    expect(compiled.game.runtimeVersion).toBe(13);
    expect(loaded.identity.runtimeVersion).toBe(13);
    expect(loaded.game.defaultLanguage).toBe('en-US');
    expect(loaded.game.project).toEqual(compiled.project);
    expect(loaded.game.project.scenes[0]).toMatchObject({
      backgroundAssetId: 'background-asset',
      backgroundScalePercent: 80,
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: 'background-1',
          scalePercent: 125,
        }),
        expect.objectContaining({
          id: 'portrait-1',
          scalePercent: 70,
        }),
      ]),
    });
    expect(loaded.game.project.scenes[0].nodes).not.toContainEqual(
      expect.objectContaining({ type: 'storyExtension' }),
    );
    expect(startGame(loaded.game.project)).toMatchObject({
      backgroundAssetId: 'background-asset',
      backgroundScalePercent: 125,
      dialogue: { id: 'dialogue-1', speaker: '', text: '' },
      variables: { route: 'open' },
      characters: [{
        nodeId: 'portrait-1',
        scalePercent: 70,
        effect: {
          type: 'slideIn',
          durationMs: 650,
          intensity: 'normal',
          direction: 'left',
        },
      }],
    });
    expect([...loaded.assets.keys()]).toEqual(['background-asset']);
    expect(loaded.assets.get('background-asset')).toMatchObject({
      type: 'image',
      displayName: 'Background.png',
      path: 'assets/images/background-asset.png',
      mime: 'image/png',
    });
  });
});
