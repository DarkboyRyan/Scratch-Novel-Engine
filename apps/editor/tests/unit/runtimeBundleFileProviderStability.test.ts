import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { compileAuthorProjectV15 } from '../../src/main/export/AuthorProjectCompiler';
import { exportRuntimeBundle } from '../../src/main/export/RuntimeBundleExporter';

const temporaryDirectories: string[] = [];
const restoreFileHandleMethods: Array<() => void> = [];
const FIXED_TIMESTAMP_SECONDS = Date.UTC(2026, 0, 2, 3, 4, 5) / 1_000;

type MutableFileHandlePrototype = {
  read: FileHandle['read'];
  readFile: FileHandle['readFile'];
};

type FileHandleMethodInterceptor = (
  file: FileHandle,
  argumentsList: unknown[],
  invokeOriginal: () => Promise<unknown>,
) => Promise<unknown>;

function projectDocument(): unknown {
  return {
    format: 'vn-engine-project',
    fileVersion: 15,
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: 'FileProvider Story',
      entrySceneId: 'scene-1',
      startScreen: {
        title: 'FileProvider Title',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene-1',
          name: 'Scene 1',
          visuals: { backgroundAssetId: 'image-1', characters: [] },
          nodes: [],
        },
      ],
    },
    assets: [
      {
        id: 'image-1',
        type: 'image',
        relativePath: 'assets/images/image-1.png',
        displayName: 'Background.png',
      },
    ],
  };
}

async function createSavedProject(options: {
  trailingManifestWhitespace?: boolean;
} = {}): Promise<{
  projectRoot: string;
  outputParent: string;
  manifestPath: string;
  assetPath: string;
  manifestContents: string;
  imageBytes: Buffer;
  expectedProject: ReturnType<typeof compileAuthorProjectV15>['sourceProject'];
  expectedAssets: ReturnType<typeof compileAuthorProjectV15>['publicAssets'];
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-file-provider-stability-'));
  temporaryDirectories.push(root);
  const projectRoot = path.join(root, 'Author Project');
  const outputParent = path.join(root, 'Exports');
  const manifestPath = path.join(projectRoot, 'project.vn.json');
  const assetPath = path.join(projectRoot, 'assets', 'images', 'image-1.png');
  await mkdir(path.dirname(assetPath), { recursive: true });
  await mkdir(outputParent);
  const imageBytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(512 * 1_024, 0x41),
  ]);
  const manifestContents = `${JSON.stringify(projectDocument())}${
    options.trailingManifestWhitespace ? ' ' : ''
  }`;
  await writeFile(manifestPath, manifestContents);
  await writeFile(assetPath, imageBytes);
  const compiled = compileAuthorProjectV15(manifestContents);
  return {
    projectRoot,
    outputParent,
    manifestPath,
    assetPath,
    manifestContents,
    imageBytes,
    expectedProject: compiled.sourceProject,
    expectedAssets: compiled.publicAssets,
  };
}

async function fileHandlePrototype(
  probePath: string,
): Promise<MutableFileHandlePrototype> {
  const probe = await open(probePath, 'r');
  try {
    return Object.getPrototypeOf(probe) as MutableFileHandlePrototype;
  } finally {
    await probe.close();
  }
}

async function interceptFileHandleMethod(
  probePath: string,
  method: keyof MutableFileHandlePrototype,
  interceptor: FileHandleMethodInterceptor,
): Promise<void> {
  const prototype = await fileHandlePrototype(probePath);
  const original = prototype[method];
  const replacement = async function (
    this: FileHandle,
    ...argumentsList: unknown[]
  ): Promise<unknown> {
    return interceptor(this, argumentsList, () =>
      Reflect.apply(original, this, argumentsList) as Promise<unknown>,
    );
  };
  prototype[method] = replacement as FileHandle['read'] & FileHandle['readFile'];
  restoreFileHandleMethods.push(() => {
    prototype[method] = original as FileHandle['read'] & FileHandle['readFile'];
  });
}

function sameIdentity(
  left: Stats,
  right: Stats,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function changeOnlyCtime(filePath: string): Promise<boolean> {
  const before = await stat(filePath);
  const originalPermissions = before.mode & 0o777;
  await chmod(filePath, originalPermissions ^ 0o100);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await chmod(filePath, originalPermissions);
  const after = await stat(filePath);
  return (
    after.dev === before.dev &&
    after.ino === before.ino &&
    after.mode === before.mode &&
    after.size === before.size &&
    after.mtimeMs === before.mtimeMs &&
    after.ctimeMs !== before.ctimeMs &&
    after.nlink === before.nlink
  );
}

function runtimeOptions(
  fixture: Awaited<ReturnType<typeof createSavedProject>>,
  targetName: string,
) {
  return {
    sourceProjectRootPath: fixture.projectRoot,
    targetBundlePath: path.join(fixture.outputParent, targetName),
    sourceRevision: 1,
    expectedManifestSha256: createHash('sha256')
      .update(fixture.manifestContents)
      .digest('hex'),
    expectedProject: fixture.expectedProject,
    expectedAssets: fixture.expectedAssets,
    buildId: 'file-provider-build',
    createdAt: '2026-08-19T00:00:00.000Z',
  };
}

afterEach(async () => {
  for (const restore of restoreFileHandleMethods.splice(0).reverse()) {
    restore();
  }
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe.runIf(process.platform === 'darwin')(
  'runtime bundle FileProvider stability',
  () => {
  it('retries a saved project manifest ctime change against its trusted hash', async () => {
    const fixture = await createSavedProject();
    const sourceIdentity = await stat(fixture.manifestPath);
    let injectedCtimeChange = false;
    let sourceReads = 0;
    await interceptFileHandleMethod(
      fixture.manifestPath,
      'readFile',
      async (file, _argumentsList, invokeOriginal) => {
        if (
          !injectedCtimeChange &&
          sameIdentity(await file.stat(), sourceIdentity)
        ) {
          injectedCtimeChange = await changeOnlyCtime(fixture.manifestPath);
        }
        if (sameIdentity(await file.stat(), sourceIdentity)) {
          sourceReads += 1;
        }
        return invokeOriginal();
      },
    );

    await expect(
      exportRuntimeBundle(runtimeOptions(fixture, 'Manifest ctime.vngame')),
    ).resolves.toMatchObject({ bundleName: 'Manifest ctime.vngame' });
    expect(injectedCtimeChange).toBe(true);
    expect(sourceReads).toBeGreaterThanOrEqual(3);
  });

  it('rejects a same-size manifest rewrite between snapshot and first read', async () => {
    const fixture = await createSavedProject({ trailingManifestWhitespace: true });
    await utimes(
      fixture.manifestPath,
      FIXED_TIMESTAMP_SECONDS,
      FIXED_TIMESTAMP_SECONDS,
    );
    const sourceIdentity = await stat(fixture.manifestPath);
    let changed = false;
    await interceptFileHandleMethod(
      fixture.manifestPath,
      'readFile',
      async (file, _argumentsList, invokeOriginal) => {
        if (!changed && sameIdentity(await file.stat(), sourceIdentity)) {
          const replacement = Buffer.from(fixture.manifestContents);
          expect(replacement.at(-1)).toBe(0x20);
          replacement[replacement.length - 1] = 0x0a;
          await writeFile(fixture.manifestPath, replacement, { flag: 'r+' });
          await utimes(
            fixture.manifestPath,
            FIXED_TIMESTAMP_SECONDS,
            FIXED_TIMESTAMP_SECONDS,
          );
          expect(await changeOnlyCtime(fixture.manifestPath)).toBe(true);
          const after = await stat(fixture.manifestPath);
          expect(sameIdentity(after, sourceIdentity)).toBe(true);
          expect(after.size).toBe(sourceIdentity.size);
          expect(after.mtimeMs).toBe(sourceIdentity.mtimeMs);
          expect(after.ctimeMs).not.toBe(sourceIdentity.ctimeMs);
          changed = true;
        }
        return invokeOriginal();
      },
    );

    await expect(
      exportRuntimeBundle(runtimeOptions(fixture, 'Changed manifest.vngame')),
    ).rejects.toThrow('与已保存版本不一致');
    expect(changed).toBe(true);
    expect(await readdir(fixture.outputParent)).toEqual([]);
  });

  it('rejects a source asset ctime change after a partial copy and cleans up', async () => {
    const fixture = await createSavedProject();
    const sourceIdentity = await stat(fixture.assetPath);
    let injectedCtimeChange = false;
    await interceptFileHandleMethod(
      fixture.assetPath,
      'read',
      async (file, argumentsList, invokeOriginal) => {
        const [, , length, position] = argumentsList as [
          Buffer,
          number,
          number,
          number,
        ];
        if (
          !injectedCtimeChange &&
          position > 0 &&
          position + length >= fixture.imageBytes.length &&
          sameIdentity(await file.stat(), sourceIdentity)
        ) {
          injectedCtimeChange = await changeOnlyCtime(fixture.assetPath);
        }
        return invokeOriginal();
      },
    );

    await expect(
      exportRuntimeBundle(runtimeOptions(fixture, 'Asset ctime.vngame')),
    ).rejects.toThrow('发生了变化');
    expect(injectedCtimeChange).toBe(true);
    expect(await readdir(fixture.outputParent)).toEqual([]);
  });

  it('rejects a same-size asset rewrite between snapshot and first read', async () => {
    const fixture = await createSavedProject();
    await utimes(fixture.assetPath, FIXED_TIMESTAMP_SECONDS, FIXED_TIMESTAMP_SECONDS);
    const sourceIdentity = await stat(fixture.assetPath);
    let changed = false;
    await interceptFileHandleMethod(
      fixture.assetPath,
      'read',
      async (file, argumentsList, invokeOriginal) => {
        const [, , , position] = argumentsList as [
          Buffer,
          number,
          number,
          number,
        ];
        if (
          !changed &&
          position === 0 &&
          sameIdentity(await file.stat(), sourceIdentity)
        ) {
          const replacement = Buffer.from(fixture.imageBytes);
          replacement[replacement.length - 1] ^= 0xff;
          await writeFile(fixture.assetPath, replacement, { flag: 'r+' });
          await utimes(
            fixture.assetPath,
            FIXED_TIMESTAMP_SECONDS,
            FIXED_TIMESTAMP_SECONDS,
          );
          expect(await changeOnlyCtime(fixture.assetPath)).toBe(true);
          const after = await stat(fixture.assetPath);
          expect(sameIdentity(after, sourceIdentity)).toBe(true);
          expect(after.size).toBe(sourceIdentity.size);
          expect(after.mtimeMs).toBe(sourceIdentity.mtimeMs);
          expect(after.ctimeMs).not.toBe(sourceIdentity.ctimeMs);
          changed = true;
        }
        return invokeOriginal();
      },
    );

    await expect(
      exportRuntimeBundle(runtimeOptions(fixture, 'Changed asset.vngame')),
    ).rejects.toThrow('发生了变化');
    expect(changed).toBe(true);
    expect(await readdir(fixture.outputParent)).toEqual([]);
    await expect(
      access(path.join(fixture.outputParent, 'Changed asset.vngame')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('records the hash of the immutable asset bytes', async () => {
    const fixture = await createSavedProject();
    const targetName = 'Hash control.vngame';
    await exportRuntimeBundle(runtimeOptions(fixture, targetName));
    const manifest = JSON.parse(
      await readFile(
        path.join(fixture.outputParent, targetName, 'manifest.json'),
        'utf8',
      ),
    ) as { files: Array<{ sha256: string }> };
    expect(manifest.files[0]?.sha256).toBe(
      createHash('sha256').update(fixture.imageBytes).digest('hex'),
    );
  });
  },
);
