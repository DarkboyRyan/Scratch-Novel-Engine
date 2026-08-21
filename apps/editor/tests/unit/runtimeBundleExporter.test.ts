import { createHash } from 'node:crypto';
import {
  access,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compileAuthorProjectV13 } from '../../src/main/export/AuthorProjectCompiler';
import {
  exportRuntimeBundle,
  type RuntimeBundleExportFaultPoint,
} from '../../src/main/export/RuntimeBundleExporter';

const temporaryDirectories: string[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'vn-export-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function projectDocument(relativePath = 'assets/images/image-1.png'): unknown {
  return {
    format: 'vn-engine-project',
    fileVersion: 13,
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: 'Export Game',
      entrySceneId: 'scene-1',
      startScreen: {
        title: 'Custom Title',
        backgroundAssetId: 'image-1',
        musicAssetId: 'title-music',
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene-1',
          name: 'Scene 1',
          visuals: { backgroundAssetId: 'image-1', characters: [] },
          nodes: [{ id: 'extension-1', type: 'storyExtension' }],
        },
      ],
    },
    assets: [
      {
        id: 'image-1',
        type: 'image',
        relativePath,
        displayName: 'Background.png',
      },
      {
        id: 'title-music',
        type: 'audio',
        relativePath: 'assets/audio/title-music.mp3',
        displayName: 'Title.mp3',
      },
      {
        id: 'unused-video',
        type: 'video',
        relativePath: 'assets/videos/unused-video.mp4',
        displayName: 'Unused.mp4',
      },
    ],
  };
}

function currentSnapshot() {
  const manifestContents = JSON.stringify(projectDocument());
  const compiled = compileAuthorProjectV13(manifestContents);
  return {
    expectedManifestSha256: createHash('sha256')
      .update(manifestContents)
      .digest('hex'),
    expectedProject: compiled.sourceProject,
    expectedAssets: compiled.publicAssets,
  };
}

async function createSavedProject(): Promise<{
  projectRoot: string;
  outputParent: string;
  imageBytes: Buffer;
  audioBytes: Buffer;
}> {
  const testRoot = await makeDirectory();
  const projectRoot = path.join(testRoot, 'Author Project');
  const outputParent = path.join(testRoot, 'Exports');
  await mkdir(path.join(projectRoot, 'assets', 'images'), { recursive: true });
  await mkdir(path.join(projectRoot, 'assets', 'audio'), { recursive: true });
  await mkdir(outputParent);
  const imageBytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('runtime-export-test'),
  ]);
  const audioBytes = Buffer.alloc(417);
  audioBytes.set([0xff, 0xfb, 0x90, 0x64]);
  await writeFile(path.join(projectRoot, 'project.vn.json'), JSON.stringify(projectDocument()));
  await writeFile(path.join(projectRoot, 'assets', 'images', 'image-1.png'), imageBytes);
  await writeFile(
    path.join(projectRoot, 'assets', 'audio', 'title-music.mp3'),
    audioBytes,
  );
  return { projectRoot, outputParent, imageBytes, audioBytes };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('runtime bundle exporter', () => {
  it('publishes a verified runtime v4 bundle with start-screen assets', async () => {
    const { projectRoot, outputParent, imageBytes, audioBytes } = await createSavedProject();
    const targetPath = path.join(outputParent, 'Custom Name.vngame');

    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: targetPath,
        sourceRevision: 12,
        ...currentSnapshot(),
        buildId: 'build-fixed',
        createdAt: '2026-08-18T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      bundleName: 'Custom Name.vngame',
      buildId: 'build-fixed',
      sourceRevision: 12,
      assetCount: 2,
    });

    const game = JSON.parse(await readFile(path.join(targetPath, 'game.json'), 'utf8'));
    const manifest = JSON.parse(
      await readFile(path.join(targetPath, 'manifest.json'), 'utf8'),
    );
    expect(Object.keys(game)).toEqual(['format', 'runtimeVersion', 'game', 'scenes']);
    expect(Object.keys(game.game)).toEqual([
      'id',
      'title',
      'entrySceneId',
      'startScreen',
    ]);
    expect(Object.keys(game.game.startScreen)).toEqual([
      'title',
      'backgroundAssetId',
      'musicAssetId',
    ]);
    expect(game).toMatchObject({
      format: 'vn-engine-runtime',
      runtimeVersion: 4,
      game: {
        id: 'project-1',
        title: 'Export Game',
        entrySceneId: 'scene-1',
        startScreen: {
          title: 'Custom Title',
          backgroundAssetId: 'image-1',
          musicAssetId: 'title-music',
        },
      },
    });
    expect(game.scenes[0].nodes).toEqual([]);
    expect(Object.keys(manifest)).toEqual([
      'format',
      'manifestVersion',
      'buildId',
      'projectId',
      'sourceRevision',
      'runtimeVersion',
      'playerCompatibility',
      'createdAt',
      'files',
    ]);
    expect(manifest).toMatchObject({
      runtimeVersion: 4,
      playerCompatibility: '>=4 <5',
    });
    expect(manifest.files).toEqual([
      {
        assetId: 'image-1',
        type: 'image',
        displayName: 'Background.png',
        path: 'assets/images/image-1.png',
        mime: 'image/png',
        bytes: imageBytes.length,
        sha256: createHash('sha256').update(imageBytes).digest('hex'),
      },
      {
        assetId: 'title-music',
        type: 'audio',
        displayName: 'Title.mp3',
        path: 'assets/audio/title-music.mp3',
        mime: 'audio/mpeg',
        bytes: audioBytes.length,
        sha256: createHash('sha256').update(audioBytes).digest('hex'),
      },
    ]);
    await expect(
      readFile(path.join(targetPath, 'assets', 'images', 'image-1.png')),
    ).resolves.toEqual(imageBytes);
    await expect(
      access(path.join(targetPath, 'assets', 'videos', 'unused-video.mp4')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.stringify({ game, manifest })).not.toContain(projectRoot);
  });

  it('removes staging and leaves no final bundle after any injected failure', async () => {
    const faultPoints: RuntimeBundleExportFaultPoint[] = [
      'after-game',
      'after-assets',
      'after-manifest',
      'before-commit',
    ];
    for (const faultPoint of faultPoints) {
      const { projectRoot, outputParent } = await createSavedProject();
      const targetPath = path.join(outputParent, `Failure-${faultPoint}.vngame`);

      await expect(
        exportRuntimeBundle({
          sourceProjectRootPath: projectRoot,
          targetBundlePath: targetPath,
          sourceRevision: 1,
          ...currentSnapshot(),
          injectFault: (point) => {
            if (point === faultPoint) {
              throw new Error(`injected failure at ${faultPoint}`);
            }
          },
        }),
      ).rejects.toThrow(`injected failure at ${faultPoint}`);
      await expect(access(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(outputParent)).toEqual([]);
    }
  });

  it('never replaces an existing export', async () => {
    const { projectRoot, outputParent } = await createSavedProject();
    const targetPath = path.join(outputParent, 'Existing.vngame');
    await mkdir(targetPath);
    const markerPath = path.join(targetPath, 'keep.txt');
    await writeFile(markerPath, 'old export');

    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: targetPath,
        sourceRevision: 1,
        ...currentSnapshot(),
      }),
    ).rejects.toThrow('已存在同名内容包');
    await expect(readFile(markerPath, 'utf8')).resolves.toBe('old export');
  });

  it('reclaims an unowned export lock through the shared lock implementation', async () => {
    const { projectRoot, outputParent } = await createSavedProject();
    const targetPath = path.join(outputParent, 'Recovered.vngame');
    const lockPath = path.join(outputParent, '.Recovered.vngame.export.lock');
    await writeFile(lockPath, '', { flag: 'wx', mode: 0o600 });

    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: targetPath,
        sourceRevision: 1,
        ...currentSnapshot(),
      }),
    ).resolves.toMatchObject({ bundleName: 'Recovered.vngame' });
    await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('detects source manifest changes before commit and rolls back', async () => {
    const { projectRoot, outputParent } = await createSavedProject();
    const targetPath = path.join(outputParent, 'Changed.vngame');
    const manifestPath = path.join(projectRoot, 'project.vn.json');

    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: targetPath,
        sourceRevision: 1,
        ...currentSnapshot(),
        injectFault: async (point) => {
          if (point === 'after-manifest') {
            await writeFile(manifestPath, `${JSON.stringify(projectDocument())}\n`);
          }
        },
      }),
    ).rejects.toThrow('project.vn.json 与已保存版本不一致');
    await expect(access(targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readdir(outputParent)).toEqual([]);
  });

  it('rejects symlinked and hard-linked referenced media', async () => {
    const { projectRoot, outputParent, imageBytes } = await createSavedProject();
    const assetPath = path.join(projectRoot, 'assets', 'images', 'image-1.png');
    const realAssetPath = path.join(projectRoot, 'real.png');
    await rm(assetPath);
    await writeFile(realAssetPath, imageBytes);
    await symlink(realAssetPath, assetPath);

    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: path.join(outputParent, 'Symlink.vngame'),
        sourceRevision: 1,
        ...currentSnapshot(),
      }),
    ).rejects.toThrow('符号链接');

    await rm(assetPath);
    await link(realAssetPath, assetPath);
    expect((await lstat(assetPath)).nlink).toBe(2);
    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: path.join(outputParent, 'Hardlink.vngame'),
        sourceRevision: 1,
        ...currentSnapshot(),
      }),
    ).rejects.toThrow('独立常规文件');
  });

  it('rejects exports inside the source project and same-ID snapshot changes', async () => {
    const { projectRoot, outputParent } = await createSavedProject();
    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: path.join(projectRoot, 'Nested.vngame'),
        sourceRevision: 1,
        ...currentSnapshot(),
      }),
    ).rejects.toThrow('源项目内部');

    const changedProject = currentSnapshot().expectedProject;
    changedProject.name = 'Different in-memory title';
    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: path.join(outputParent, 'Wrong.vngame'),
        sourceRevision: 1,
        expectedManifestSha256: currentSnapshot().expectedManifestSha256,
        expectedProject: changedProject,
        expectedAssets: currentSnapshot().expectedAssets,
      }),
    ).rejects.toThrow('磁盘项目与当前编辑器项目不一致');

    const changedAssets = currentSnapshot().expectedAssets;
    changedAssets[0] = { ...changedAssets[0], displayName: 'Changed.png' };
    await expect(
      exportRuntimeBundle({
        sourceProjectRootPath: projectRoot,
        targetBundlePath: path.join(outputParent, 'Wrong assets.vngame'),
        sourceRevision: 1,
        expectedManifestSha256: currentSnapshot().expectedManifestSha256,
        expectedProject: currentSnapshot().expectedProject,
        expectedAssets: changedAssets,
      }),
    ).rejects.toThrow('磁盘资源清单与当前编辑器项目不一致');
  });
});
