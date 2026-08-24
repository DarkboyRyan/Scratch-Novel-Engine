import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRuntimeBundle } from '../../src/main/content/PlayerBundleLoader';
import { parseRuntimeBundleDocuments } from '../../src/main/content/runtimeBundleSchema';

const temporaryDirectories: string[] = [];
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

function gameDocument(assetId: string | null = null) {
  return {
    format: 'vn-engine-runtime',
    runtimeVersion: 1,
    game: {
      id: 'project-1',
      title: 'Runtime test',
      entrySceneId: 'scene-1',
    },
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: assetId,
        nodes: [],
      },
    ],
  };
}

function manifestDocument(
  files: unknown[] = [],
  runtimeVersion: 1 | 2 | 3 | 4 | 5 | 6 = 1,
): Record<string, unknown> {
  return {
    format: 'vn-engine-runtime-manifest',
    manifestVersion: 1,
    buildId: 'build-1',
    projectId: 'project-1',
    sourceRevision: 3,
    runtimeVersion,
    playerCompatibility: runtimeVersion === 1
      ? '>=1 <2'
      : runtimeVersion === 2
        ? '>=2 <3'
        : runtimeVersion === 3
          ? '>=3 <4'
          : runtimeVersion === 4
            ? '>=4 <5'
            : runtimeVersion === 5
              ? '>=5 <6'
              : '>=6 <7',
    createdAt: '2026-08-18T00:00:00.000Z',
    files,
  };
}

async function makeImageBundle(): Promise<{
  root: string;
  assetPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-player-bundle-'));
  temporaryDirectories.push(root);
  const relativePath = 'assets/images/background.png';
  const assetPath = path.join(root, relativePath);
  await mkdir(path.dirname(assetPath), { recursive: true });
  await writeFile(assetPath, PNG);
  await writeFile(
    path.join(root, 'game.json'),
    JSON.stringify(gameDocument('background')),
  );
  await writeFile(
    path.join(root, 'manifest.json'),
    JSON.stringify(
      manifestDocument([
        {
          assetId: 'background',
          type: 'image',
          displayName: 'Background',
          path: relativePath,
          mime: 'image/png',
          bytes: PNG.length,
          sha256: createHash('sha256').update(PNG).digest('hex'),
        },
      ]),
    ),
  );
  return { root, assetPath };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('runtime bundle loader', () => {
  it('loads the controlled development fixture as path-free public data', async () => {
    const fixture = path.resolve(__dirname, '../../fixtures/game');
    const bundle = await loadRuntimeBundle(fixture);

    expect(bundle.game.project).toMatchObject({
      schemaVersion: 1,
      id: 'development-player-fixture',
      name: 'VN Engine Player 演示',
      entrySceneId: 'scene-entry',
      startScreen: {
        title: '星光物语',
        backgroundAssetId: null,
        musicAssetId: null,
      },
    });
    expect(bundle.game.assets).toEqual([]);
    expect(JSON.stringify(bundle.game)).not.toContain('relativePath');
    expect(JSON.stringify(bundle.game)).not.toContain(fixture);
  });

  it('verifies media type, byte size, sha256 and content before activation', async () => {
    const { root } = await makeImageBundle();
    const bundle = await loadRuntimeBundle(root);

    expect(bundle.game.assets).toEqual([
      { id: 'background', type: 'image', displayName: 'Background' },
    ]);
    expect(bundle.assets.get('background')).toMatchObject({
      path: 'assets/images/background.png',
      mime: 'image/png',
      bytes: PNG.length,
    });
  });

  it('rejects an unknown runtime field and an unsafe asset path', () => {
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify({ ...gameDocument(), unexpected: true }),
        JSON.stringify(manifestDocument()),
      ),
    ).toThrow('字段不符合 runtime 约定');

    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(gameDocument('background')),
        JSON.stringify(
          manifestDocument([
            {
              assetId: 'background',
              type: 'image',
              displayName: 'Background',
              path: 'assets/images/../secret.png',
              mime: 'image/png',
              bytes: 12,
              sha256: '0'.repeat(64),
            },
          ]),
        ),
      ),
    ).toThrow('不安全的资源相对路径');
  });

  it('normalizes runtime v1 and strictly validates runtime v2 start screens', () => {
    const legacy = parseRuntimeBundleDocuments(
      JSON.stringify(gameDocument()),
      JSON.stringify(manifestDocument()),
    );
    expect(legacy.game.project.startScreen).toEqual({
      title: 'Runtime test',
      backgroundAssetId: null,
      musicAssetId: null,
    });
    expect(legacy.game.project.cgGallery).toEqual({
      pages: [{ imageAssetIds: Array(9).fill(null) }],
    });

    const runtimeV2 = gameDocument() as ReturnType<typeof gameDocument> & {
      runtimeVersion: number;
      game: ReturnType<typeof gameDocument>['game'] & {
        startScreen: Record<string, unknown>;
      };
    };
    runtimeV2.runtimeVersion = 2;
    runtimeV2.game.startScreen = {
      backgroundAssetId: 'title-background',
      musicAssetId: null,
    };
    const titleAsset = {
      assetId: 'title-background',
      type: 'image',
      displayName: 'Title',
      path: 'assets/images/title.png',
      mime: 'image/png',
      bytes: 12,
      sha256: '0'.repeat(64),
    };
    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV2),
        JSON.stringify(manifestDocument([titleAsset], 2)),
      ).game.project.startScreen,
    ).toEqual({
      title: 'Runtime test',
      backgroundAssetId: 'title-background',
      musicAssetId: null,
    });

    runtimeV2.game.startScreen.unexpected = true;
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV2),
        JSON.stringify(manifestDocument([titleAsset], 2)),
      ),
    ).toThrow('game.json.game.startScreen 字段不符合');
  });

  it('strictly reads a runtime v3 custom title without changing the project name', () => {
    const runtimeV3 = {
      ...gameDocument(),
      runtimeVersion: 3,
      game: {
        ...gameDocument().game,
        startScreen: {
          title: '自定义标题',
          backgroundAssetId: null,
          musicAssetId: null,
        },
      },
    };
    const parsed = parseRuntimeBundleDocuments(
      JSON.stringify(runtimeV3),
      JSON.stringify(manifestDocument([], 3)),
    );

    expect(parsed.game.project.name).toBe('Runtime test');
    expect(parsed.game.project.startScreen.title).toBe('自定义标题');

    delete (runtimeV3.game.startScreen as Partial<
      typeof runtimeV3.game.startScreen
    >).title;
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV3),
        JSON.stringify(manifestDocument([], 3)),
      ),
    ).toThrow('game.json.game.startScreen 字段不符合');
  });

  it('reads runtime v4 portrait coordinates and keeps v3 portraits on presets', () => {
    const makeCharacterGame = (runtimeVersion: 3 | 4) => ({
      ...gameDocument(),
      runtimeVersion,
      game: {
        ...gameDocument().game,
        startScreen: {
          title: '自定义标题',
          backgroundAssetId: null,
          musicAssetId: null,
        },
      },
      scenes: [{
        ...gameDocument().scenes[0],
        nodes: [{
          id: 'portrait',
          type: 'character',
          assetId: null,
          slot: 'left',
          layer: 2,
          ...(runtimeVersion === 4
            ? { position: { x: 33.5, y: 84 } }
            : {}),
        }],
      }],
    });

    const runtimeV4 = makeCharacterGame(4);
    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV4),
        JSON.stringify(manifestDocument([], 4)),
      ).game.project.scenes[0].nodes[0],
    ).toMatchObject({ position: { x: 33.5, y: 84 } });

    const runtimeV3 = makeCharacterGame(3);
    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV3),
        JSON.stringify(manifestDocument([], 3)),
      ).game.project.scenes[0].nodes[0],
    ).toMatchObject({ position: null });

    delete (runtimeV4.scenes[0].nodes[0] as Record<string, unknown>).position;
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV4),
        JSON.stringify(manifestDocument([], 4)),
      ),
    ).toThrow('字段不符合 runtime 约定');
  });

  it('strictly reads a runtime v5 CG gallery and validates its image assets', () => {
    const cgAsset = {
      assetId: 'cg-1',
      type: 'image',
      displayName: 'CG 1',
      path: 'assets/images/cg-1.png',
      mime: 'image/png',
      bytes: 12,
      sha256: '0'.repeat(64),
    };
    const runtimeV5 = {
      ...gameDocument(),
      runtimeVersion: 5,
      game: {
        ...gameDocument().game,
        startScreen: {
          title: '自定义标题',
          backgroundAssetId: null,
          musicAssetId: null,
        },
        cgGallery: { imageAssetIds: ['cg-1'] },
      },
    };

    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument([cgAsset], 5)),
      ).game.project.cgGallery,
    ).toEqual({
      pages: [{ imageAssetIds: ['cg-1', ...Array(8).fill(null)] }],
    });

    const migratedAssetIds = Array.from(
      { length: 10 },
      (_, index) => `legacy-cg-${index + 1}`,
    );
    runtimeV5.game.cgGallery.imageAssetIds = migratedAssetIds;
    const migratedFiles = migratedAssetIds.map((assetId) => ({
      ...cgAsset,
      assetId,
      displayName: assetId,
      path: `assets/images/${assetId}.png`,
    }));
    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument(migratedFiles, 5)),
      ).game.project.cgGallery,
    ).toEqual({
      pages: [
        { imageAssetIds: migratedAssetIds.slice(0, 9) },
        {
          imageAssetIds: [
            migratedAssetIds[9],
            ...Array(8).fill(null),
          ],
        },
      ],
    });

    runtimeV5.game.cgGallery.imageAssetIds = [];
    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument([], 5)),
      ).game.project.cgGallery,
    ).toEqual({ pages: [{ imageAssetIds: Array(9).fill(null) }] });

    runtimeV5.game.cgGallery.imageAssetIds = ['cg-1', 'cg-1'];
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument([cgAsset], 5)),
      ),
    ).toThrow('不能包含重复资源 ID');

    runtimeV5.game.cgGallery.imageAssetIds = ['missing'];
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument([cgAsset], 5)),
      ),
    ).toThrow('CG 画廊 引用了缺失或类型错误的资源');

    runtimeV5.game.cgGallery.imageAssetIds = ['cg-1'];
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV5),
        JSON.stringify(manifestDocument([{
          ...cgAsset,
          type: 'audio',
          path: 'assets/audio/cg-1.mp3',
          mime: 'audio/mpeg',
        }], 5)),
      ),
    ).toThrow('CG 画廊 引用了缺失或类型错误的资源');
  });

  it('strictly reads runtime v6 fixed CG pages and preserves empty slots', () => {
    const cgAsset = {
      assetId: 'cg-1',
      type: 'image',
      displayName: 'CG 1',
      path: 'assets/images/cg-1.png',
      mime: 'image/png',
      bytes: 12,
      sha256: '0'.repeat(64),
    };
    const slots: Array<string | null> = [
      null,
      'cg-1',
      ...Array<string | null>(7).fill(null),
    ];
    const runtimeV6 = {
      ...gameDocument(),
      runtimeVersion: 6,
      game: {
        ...gameDocument().game,
        startScreen: {
          title: '自定义标题',
          backgroundAssetId: null,
          musicAssetId: null,
        },
        cgGallery: { pages: [{ imageAssetIds: slots }] },
      },
    };

    expect(
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV6),
        JSON.stringify(manifestDocument([cgAsset], 6)),
      ).game.project.cgGallery,
    ).toEqual({ pages: [{ imageAssetIds: slots }] });

    runtimeV6.game.cgGallery.pages[0].imageAssetIds.pop();
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV6),
        JSON.stringify(manifestDocument([cgAsset], 6)),
      ),
    ).toThrow('必须精确包含 9 个槽位');

    runtimeV6.game.cgGallery.pages = [];
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV6),
        JSON.stringify(manifestDocument([cgAsset], 6)),
      ),
    ).toThrow('至少需要一页');

    runtimeV6.game.cgGallery.pages = [
      { imageAssetIds: ['cg-1', ...Array(8).fill(null)] },
      { imageAssetIds: [null, 'cg-1', ...Array(7).fill(null)] },
    ];
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV6),
        JSON.stringify(manifestDocument([cgAsset], 6)),
      ),
    ).toThrow('不能包含重复资源 ID');
  });

  it('rejects mismatched or incorrectly typed runtime v2 title assets', () => {
    const runtimeV2 = {
      ...gameDocument(),
      runtimeVersion: 2,
      game: {
        ...gameDocument().game,
        startScreen: {
          backgroundAssetId: 'title-background',
          musicAssetId: null,
        },
      },
    };
    const wrongType = {
      assetId: 'title-background',
      type: 'audio',
      displayName: 'Wrong',
      path: 'assets/audio/title.mp3',
      mime: 'audio/mpeg',
      bytes: 4,
      sha256: '0'.repeat(64),
    };
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV2),
        JSON.stringify(manifestDocument([wrongType], 2)),
      ),
    ).toThrow('主界面背景 引用了缺失或类型错误的资源');

    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(runtimeV2),
        JSON.stringify(manifestDocument([wrongType], 1)),
      ),
    ).toThrow('manifest.json.runtimeVersion');
  });

  it('rejects a changed hash and a symlinked resource', async () => {
    const { root, assetPath } = await makeImageBundle();
    const manifestPath = path.join(root, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      files: Array<{ sha256: string }>;
    };
    manifest.files[0].sha256 = '0'.repeat(64);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(loadRuntimeBundle(root)).rejects.toThrow('完整性校验失败');

    manifest.files[0].sha256 = createHash('sha256').update(PNG).digest('hex');
    await writeFile(manifestPath, JSON.stringify(manifest));
    const realAssetPath = path.join(root, 'real.png');
    await writeFile(realAssetPath, PNG);
    await rm(assetPath);
    await symlink(realAssetPath, assetPath);
    await expect(loadRuntimeBundle(root)).rejects.toThrow('符号链接');
  });

  it('rejects broken scene and typed asset references', () => {
    const wrongType = manifestDocument([
      {
        assetId: 'background',
        type: 'audio',
        displayName: 'Not an image',
        path: 'assets/audio/background.mp3',
        mime: 'audio/mpeg',
        bytes: 4,
        sha256: '0'.repeat(64),
      },
    ]);
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(gameDocument('background')),
        JSON.stringify(wrongType),
      ),
    ).toThrow('类型错误');

    const missingEntry = gameDocument();
    missingEntry.game.entrySceneId = 'missing';
    expect(() =>
      parseRuntimeBundleDocuments(
        JSON.stringify(missingEntry),
        JSON.stringify(manifestDocument()),
      ),
    ).toThrow('入口场景不存在');
  });
});
