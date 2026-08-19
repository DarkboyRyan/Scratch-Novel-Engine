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
): Record<string, unknown> {
  return {
    format: 'vn-engine-runtime-manifest',
    manifestVersion: 1,
    buildId: 'build-1',
    projectId: 'project-1',
    sourceRevision: 3,
    runtimeVersion: 1,
    playerCompatibility: '>=1 <2',
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
    ).toThrow('字段不符合 runtime v1');

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
