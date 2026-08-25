import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { Stats } from 'node:fs';
import {
  chmod,
  cp,
  link,
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build as buildViteBundle } from 'vite';

import {
  exportStandaloneApplication,
  finalizeStandaloneApplication,
  sanitizeAndVerifyStandaloneApplication,
  STANDALONE_APPLICATION_FORMAT,
  verifyStandalonePlayerTemplateSignature,
} from '../../src/main/export/StandaloneApplicationExporter';
import {
  loadStandalonePlayerTemplate,
  PLAYER_TEMPLATE_FORMAT,
  PLAYER_TEMPLATE_VERSION,
} from '../../src/main/export/StandalonePlayerTemplate';

const runtimeMocks = vi.hoisted(() => ({
  exportRuntimeBundle: vi.fn(),
}));

const execFileAsync = promisify(execFile);

function pickleUInt32(value: number): Buffer {
  const pickle = Buffer.alloc(8);
  pickle.writeUInt32LE(4, 0);
  pickle.writeUInt32LE(value, 4);
  return pickle;
}

function pickleString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const payloadLength = 4 + paddedLength;
  const pickle = Buffer.alloc(4 + payloadLength);
  pickle.writeUInt32LE(payloadLength, 0);
  pickle.writeInt32LE(bytes.length, 4);
  bytes.copy(pickle, 8);
  return pickle;
}

function asarIntegrity(contents: Buffer) {
  const sha256 = createHash('sha256').update(contents).digest('hex');
  return {
    algorithm: 'SHA256',
    hash: sha256,
    blockSize: 4 * 1024 * 1024,
    blocks: [sha256],
  };
}

async function writeMinimalVirtualizedAsar(filePath: string): Promise<void> {
  const virtualMain = Buffer.from(
    'export const virtualAsarTrap = true;\n',
    'utf8',
  );
  const packageJson = Buffer.from(
    `${JSON.stringify({ name: 'asar-contract', version: '1.0.0' })}\n`,
    'utf8',
  );
  const header = {
    files: {
      '.vite': {
        files: {
          build: {
            files: {
              'main.js': {
                size: virtualMain.length,
                offset: '0',
                integrity: asarIntegrity(virtualMain),
              },
            },
          },
        },
      },
      'package.json': {
        size: packageJson.length,
        offset: String(virtualMain.length),
        integrity: asarIntegrity(packageJson),
      },
    },
  };
  const headerPickle = pickleString(JSON.stringify(header));
  await writeFile(
    filePath,
    Buffer.concat([
      pickleUInt32(headerPickle.length),
      headerPickle,
      virtualMain,
      packageJson,
    ]),
  );
}

vi.mock('../../src/main/export/RuntimeBundleExporter', () => ({
  exportRuntimeBundle: runtimeMocks.exportRuntimeBundle,
}));

const project = {
  schemaVersion: 1 as const,
  id: 'project-1',
  name: 'Story',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Standalone Story',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  },
  scenes: [
    {
      schemaVersion: 1 as const,
      id: 'scene-1',
      name: 'Scene 1',
      backgroundAssetId: null,
      nodes: [],
    },
  ],
};

const sourceManifestContents = JSON.stringify({
  format: 'vn-engine-project',
  fileVersion: 15,
  project: {
    ...project,
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        visuals: { backgroundAssetId: null, characters: [] },
        nodes: [],
      },
    ],
  },
  assets: [],
});

type MutableFileHandlePrototype = {
  read: FileHandle['read'];
};

async function interceptFileHandleReads(
  probePath: string,
  interceptor: (
    file: FileHandle,
    argumentsList: unknown[],
    invokeOriginal: () => Promise<unknown>,
  ) => Promise<unknown>,
): Promise<() => void> {
  const probe = await open(probePath, 'r');
  const prototype = Object.getPrototypeOf(probe) as MutableFileHandlePrototype;
  await probe.close();
  const original = prototype.read;
  prototype.read = (async function (
    this: FileHandle,
    ...argumentsList: unknown[]
  ): Promise<unknown> {
    return interceptor(this, argumentsList, () =>
      Reflect.apply(original, this, argumentsList) as Promise<unknown>,
    );
  }) as FileHandle['read'];
  return () => {
    prototype.read = original;
  };
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
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
    sameFileIdentity(after, before) &&
    after.mode === before.mode &&
    after.size === before.size &&
    after.mtimeMs === before.mtimeMs &&
    after.ctimeMs !== before.ctimeMs &&
    after.nlink === before.nlink
  );
}

function platformTemplateManifest(overrides: Record<string, unknown> = {}) {
  const macos = process.platform === 'darwin';
  return {
    format: PLAYER_TEMPLATE_FORMAT,
    templateVersion: PLAYER_TEMPLATE_VERSION,
    platform: process.platform,
    arch: process.arch,
    playerVersion: '0.1.0',
    runtimeCompatibility: '>=1 <7',
    payloadRoot: 'payload',
    artifactEntry: macos ? 'VN Engine Player.app' : 'vn-engine-player',
    gameResourceDirectory: macos
      ? 'Contents/Resources/game'
      : 'resources/game',
    applicationMetadataFile: macos
      ? 'Contents/Resources/vn-game-application.json'
      : 'resources/vn-game-application.json',
    macosInfoPlistFile: macos ? 'Contents/Info.plist' : null,
    ...overrides,
  };
}

describe.runIf(process.platform === 'darwin')('standalone application exporter', () => {
  const temporaryRoots: string[] = [];

  async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vn-standalone-export-'));
    temporaryRoots.push(root);
    return root;
  }

  async function createTemplate(
    root: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ templateRoot: string; artifactRoot: string }> {
    const manifest = platformTemplateManifest(overrides);
    const templateRoot = path.join(root, 'template');
    const artifactRoot = path.join(
      templateRoot,
      String(manifest.payloadRoot),
      String(manifest.artifactEntry),
    );
    const resourcesPath = path.join(
      artifactRoot,
      ...path.posix.dirname(String(manifest.gameResourceDirectory)).split('/'),
    );
    await mkdir(resourcesPath, { recursive: true });
    await writeFile(
      path.join(templateRoot, 'player-template.json'),
      `${JSON.stringify(manifest)}\n`,
    );
    await writeFile(path.join(artifactRoot, 'player-binary'), 'template');
    if (typeof manifest.macosInfoPlistFile === 'string') {
      const plistPath = path.join(
        artifactRoot,
        ...manifest.macosInfoPlistFile.split('/'),
      );
      await mkdir(path.dirname(plistPath), { recursive: true });
      await writeFile(plistPath, '<?xml version="1.0"?><plist><dict/></plist>');
    }
    return { templateRoot, artifactRoot };
  }

  function artifactPath(root: string, name = 'Story'): string {
    return path.join(
      root,
      process.platform === 'darwin' ? `${name}-macOS.zip` : name,
    );
  }

  function exportLockPath(root: string, name = 'Story'): string {
    return path.join(root, `.${path.basename(artifactPath(root, name))}.export.lock`);
  }

  async function publishingDirectoryPaths(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          /^\.vn-engine-[^.]+\.publishing$/u.test(entry.name),
      )
      .map((entry) => path.join(root, entry.name));
  }

  async function requirePublishingDirectory(root: string): Promise<string> {
    const publishingDirectories = await publishingDirectoryPaths(root);
    expect(publishingDirectories).toHaveLength(1);
    return publishingDirectories[0]!;
  }

  async function macosFileFlags(filePath: string): Promise<string[]> {
    const { stdout } = await execFileAsync('/usr/bin/stat', [
      '-f',
      '%Sf',
      filePath,
    ]);
    return stdout
      .trim()
      .split(',')
      .map((flag) => flag.trim())
      .filter((flag) => flag !== '' && flag !== '-');
  }

  async function extendedAttributeNames(filePath: string): Promise<string[]> {
    const { stdout } = await execFileAsync('/usr/bin/xattr', [filePath]);
    return stdout
      .split('\n')
      .map((attribute) => attribute.trim())
      .filter(Boolean);
  }

  async function makePublishingDirectoryFinderHidden(
    publishingDirectoryPath: string,
  ): Promise<void> {
    await execFileAsync('/usr/bin/chflags', ['hidden', publishingDirectoryPath]);
    await execFileAsync('/usr/bin/xattr', [
      '-wx',
      'com.apple.FinderInfo',
      `${'00'.repeat(8)}4000${'00'.repeat(22)}`,
      publishingDirectoryPath,
    ]);
  }

  function options(
    root: string,
    templateRoot: string,
    overrides: Record<string, unknown> = {},
  ) {
    let archivedApplicationPath = '';
    return {
      sourceProjectRootPath: path.join(root, 'source'),
      targetArtifactPath: artifactPath(root),
      templateRootPath: templateRoot,
      sourceRevision: 7,
      expectedManifestSha256: createHash('sha256')
        .update(sourceManifestContents)
        .digest('hex'),
      expectedProject: project,
      expectedAssets: [],
      application: {
        name: 'Story',
        version: '1.2.3',
        applicationId: 'com.example.story',
      },
      finalizeApplication: vi.fn().mockResolvedValue(undefined),
      preparePublishedArtifact: vi.fn().mockResolvedValue(undefined),
      archiveApplication: vi.fn(
        async (applicationPath: string, archivePath: string) => {
          archivedApplicationPath = applicationPath;
          await writeFile(archivePath, 'fake-standalone-zip');
        },
      ),
      extractApplicationArchive: vi.fn(
        async (_archivePath: string, extractionRootPath: string) => {
          await cp(
            archivedApplicationPath,
            path.join(extractionRootPath, 'Story.app'),
            { recursive: true },
          );
        },
      ),
      verifyExtractedApplication: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    runtimeMocks.exportRuntimeBundle.mockImplementation(async (runtimeOptions) => {
      await mkdir(runtimeOptions.targetBundlePath);
      await writeFile(
        path.join(runtimeOptions.targetBundlePath, 'game.json'),
        '{"format":"vn-engine-runtime"}\n',
      );
      await writeFile(
        path.join(runtimeOptions.targetBundlePath, 'manifest.json'),
        '{"format":"vn-engine-runtime-manifest"}\n',
      );
      await runtimeOptions.assertSourceStillCurrent?.();
      return {
        bundleName: path.basename(runtimeOptions.targetBundlePath),
        buildId: 'runtime-build-1',
        sourceRevision: runtimeOptions.sourceRevision,
        assetCount: 2,
      };
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('injects a verified runtime bundle and path-free application metadata', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    let stagedApplicationPath = '';
    let gameContents = '';
    let metadata: Record<string, unknown> = {};
    const archiveApplication = vi.fn(
      async (applicationPath: string, archivePath: string) => {
        stagedApplicationPath = applicationPath;
        gameContents = await readFile(
          path.join(
            applicationPath,
            'Contents',
            'Resources',
            'game',
            'game.json',
          ),
          'utf8',
        );
        metadata = JSON.parse(
          await readFile(
            path.join(
              applicationPath,
              'Contents',
              'Resources',
              'vn-game-application.json',
            ),
            'utf8',
          ),
        ) as Record<string, unknown>;
        await writeFile(archivePath, 'fake-standalone-zip');
      },
    );
    const extractApplicationArchive = vi.fn(
      async (_archivePath: string, extractionRootPath: string) => {
        await cp(
          stagedApplicationPath,
          path.join(extractionRootPath, 'Story.app'),
          { recursive: true },
        );
      },
    );

    const result = await exportStandaloneApplication(
      options(root, templateRoot, {
        archiveApplication,
        extractApplicationArchive,
      }),
    );
    const target = artifactPath(root);

    expect(result).toMatchObject({
      artifactName: path.basename(target),
      buildId: 'runtime-build-1',
      sourceRevision: 7,
      assetCount: 2,
      platform: process.platform,
      arch: process.arch,
    });
    expect(gameContents).toContain('vn-engine-runtime');
    expect(metadata).toEqual({
      format: STANDALONE_APPLICATION_FORMAT,
      configVersion: 1,
      productName: 'Story',
      version: '1.2.3',
      appBundleId: 'com.example.story',
      icon: 'template-default',
      runtimeBuildId: 'runtime-build-1',
      playerVersion: '0.1.0',
    });
    expect(JSON.stringify(metadata)).not.toContain(root);
    expect(await readFile(target, 'utf8')).toBe('fake-standalone-zip');
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
  });

  it('preserves nested read-only template modes and removes the private tree after a later error', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot, artifactRoot } = await createTemplate(root);
    const readOnlyRoot = path.join(
      artifactRoot,
      'Contents',
      'Resources',
      'read-only-tree',
    );
    const readOnlyNested = path.join(readOnlyRoot, 'nested');
    const readOnlyFile = path.join(readOnlyNested, 'main.js');
    await mkdir(readOnlyNested, { recursive: true });
    await writeFile(readOnlyFile, 'export const readOnly = true;\n');
    await chmod(readOnlyFile, 0o444);
    await chmod(readOnlyNested, 0o555);
    await chmod(readOnlyRoot, 0o555);
    let privateWorkspacePath = '';
    const copiedReadOnlyRoot = (applicationPath: string) =>
      path.join(
        applicationPath,
        'Contents',
        'Resources',
        'read-only-tree',
      );

    try {
      await expect(
        exportStandaloneApplication(
          options(root, templateRoot, {
            verifyTemplateArtifact: async (applicationPath: string) => {
              privateWorkspacePath = path.dirname(applicationPath);
              const copiedRoot = copiedReadOnlyRoot(applicationPath);
              expect((await stat(copiedRoot)).mode & 0o777).toBe(0o555);
              expect((await stat(path.join(copiedRoot, 'nested'))).mode & 0o777)
                .toBe(0o555);
              expect(
                (await stat(path.join(copiedRoot, 'nested', 'main.js'))).mode &
                  0o777,
              ).toBe(0o444);
            },
            injectFault: (point: string) => {
              if (point === 'after-template-copy') {
                throw new Error('simulated read-only rollback failure');
              }
            },
          }),
        ),
      ).rejects.toThrow('simulated read-only rollback failure');

      expect(privateWorkspacePath).not.toBe('');
      await expect(stat(privateWorkspacePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(stat(artifactPath(root))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readFile(exportLockPath(root), 'utf8')).rejects.toMatchObject(
        { code: 'ENOENT' },
      );
      expect((await stat(readOnlyRoot)).mode & 0o777).toBe(0o555);
      expect((await stat(readOnlyNested)).mode & 0o777).toBe(0o555);
      expect((await stat(readOnlyFile)).mode & 0o777).toBe(0o444);
    } finally {
      await chmod(readOnlyRoot, 0o755);
      await chmod(readOnlyNested, 0o755);
      await chmod(readOnlyFile, 0o644);
      if (privateWorkspacePath.length > 0) {
        const copiedRoot = copiedReadOnlyRoot(
          path.join(privateWorkspacePath, 'Story.app'),
        );
        await chmod(copiedRoot, 0o755).catch(() => undefined);
        await chmod(path.join(copiedRoot, 'nested'), 0o755).catch(
          () => undefined,
        );
        await rm(privateWorkspacePath, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
    }
  });

  it('copies app.asar as one regular file under Electron without expanding its virtual .vite tree', async () => {
    const root = await temporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const exportsRoot = path.join(root, 'exports');
    await Promise.all([mkdir(sourceRoot), mkdir(exportsRoot)]);
    await writeFile(
      path.join(sourceRoot, 'project.vn.json'),
      sourceManifestContents,
    );
    const { artifactRoot } = await createTemplate(root);
    const sourceAsarPath = path.join(
      artifactRoot,
      'Contents',
      'Resources',
      'app.asar',
    );
    await writeMinimalVirtualizedAsar(sourceAsarPath);
    await chmod(sourceAsarPath, 0o444);
    const sourceAsarStatus = await stat(sourceAsarPath);
    const sourceAsarSha256 = createHash('sha256')
      .update(await readFile(sourceAsarPath))
      .digest('hex');
    expect(sourceAsarStatus.isFile()).toBe(true);
    expect(sourceAsarStatus.mode & 0o777).toBe(0o444);

    const fixtureEntryPath = path.join(root, 'electron-asar-contract.ts');
    const fixtureOutputRoot = path.join(root, 'electron-fixture-build');
    const exporterModulePath = path.resolve(
      process.cwd(),
      'src/main/export/StandaloneApplicationExporter.ts',
    );
    const compilerModulePath = path.resolve(
      process.cwd(),
      'src/main/export/AuthorProjectCompiler.ts',
    );
    await writeFile(
      fixtureEntryPath,
      `import { createHash } from 'node:crypto';
import * as patchedFs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as originalFs from 'original-fs';
import { exportStandaloneApplication } from ${JSON.stringify(exporterModulePath)};
import { compileAuthorProjectV15 } from ${JSON.stringify(compilerModulePath)};

async function main() {
const root = process.env.VN_ASAR_CONTRACT_ROOT;
if (!root) {
  throw new Error('VN_ASAR_CONTRACT_ROOT is missing');
}
const sourceProjectRootPath = path.join(root, 'source');
const templateRootPath = path.join(root, 'template');
const targetArtifactPath = path.join(root, 'exports', 'Story-macOS.zip');
const sourceAsarPath = path.join(
  templateRootPath,
  'payload',
  'VN Engine Player.app',
  'Contents',
  'Resources',
  'app.asar',
);
const sourceManifestContents = await readFile(
  path.join(sourceProjectRootPath, 'project.vn.json'),
  'utf8',
);
const expectedSnapshot = compileAuthorProjectV15(sourceManifestContents);
const sentinel = 'simulated Electron ASAR post-copy failure';
let verifiedCopiedAsar = false;
let privateWorkspacePath = '';

const patchedAsarStatus = patchedFs.lstatSync(sourceAsarPath);
if (
  !patchedAsarStatus.isDirectory() ||
  !patchedFs.existsSync(path.join(sourceAsarPath, '.vite', 'build', 'main.js')) ||
  !originalFs.lstatSync(sourceAsarPath).isFile()
) {
  throw new Error('Electron ASAR virtualization precondition failed');
}
try {
  await exportStandaloneApplication({
    sourceProjectRootPath,
    targetArtifactPath,
    templateRootPath,
    sourceRevision: 7,
    expectedManifestSha256: createHash('sha256')
      .update(sourceManifestContents)
      .digest('hex'),
    expectedProject: expectedSnapshot.sourceProject,
    expectedAssets: expectedSnapshot.publicAssets,
    application: {
      name: 'Story',
      version: '1.2.3',
      applicationId: 'com.example.story',
    },
    verifyTemplateArtifact: async (applicationPath) => {
      privateWorkspacePath = path.dirname(applicationPath);
      const copiedAsarPath = path.join(
        applicationPath,
        'Contents',
        'Resources',
        'app.asar',
      );
      const sourceStatus = originalFs.lstatSync(sourceAsarPath);
      const copiedStatus = originalFs.lstatSync(copiedAsarPath);
      if (!sourceStatus.isFile() || !copiedStatus.isFile()) {
        throw new Error('app.asar must remain a regular file');
      }
      if (
        (copiedStatus.mode & 0o777) !== (sourceStatus.mode & 0o777) ||
        copiedStatus.size !== sourceStatus.size
      ) {
        throw new Error('copied app.asar metadata changed');
      }
      const sourceBytes = originalFs.readFileSync(sourceAsarPath);
      const copiedBytes = originalFs.readFileSync(copiedAsarPath);
      if (!sourceBytes.equals(copiedBytes)) {
        throw new Error('copied app.asar bytes changed');
      }
      if (originalFs.existsSync(path.join(copiedAsarPath, '.vite'))) {
        throw new Error('Electron virtual .vite tree escaped app.asar');
      }
      verifiedCopiedAsar = true;
    },
    injectFault: (point) => {
      if (point === 'after-template-copy') {
        throw new Error(sentinel);
      }
    },
  });
  throw new Error('expected injected post-copy failure');
} catch (error) {
  if (
    !(error instanceof Error) ||
    error.message !== sentinel ||
    !verifiedCopiedAsar ||
    privateWorkspacePath.length === 0
  ) {
    process.stderr.write(
      \`ASAR_CONTRACT_FAILED: \${error instanceof Error ? error.stack : String(error)}\\n\`,
    );
    process.exitCode = 1;
  } else if (
    originalFs.existsSync(privateWorkspacePath) ||
    originalFs.existsSync(targetArtifactPath) ||
    originalFs.existsSync(
      path.join(root, 'exports', '.Story-macOS.zip.export.lock'),
    )
  ) {
    process.stderr.write('ASAR_CONTRACT_FAILED: rollback left transaction data\\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('ASAR_CONTRACT_OK\\n');
    process.exitCode = 0;
  }
}
}

void main().catch((error) => {
  process.stderr.write(
    \`ASAR_CONTRACT_FAILED: \${error instanceof Error ? error.stack : String(error)}\\n\`,
  );
  process.exitCode = 1;
});
`,
    );
    await buildViteBundle({
      configFile: false,
      logLevel: 'silent',
      build: {
        ssr: fixtureEntryPath,
        outDir: fixtureOutputRoot,
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
          external: ['electron', 'original-fs'],
          output: {
            format: 'cjs',
            entryFileNames: 'electron-asar-contract.cjs',
          },
        },
      },
    });
    const electronBinary = createRequire(
      path.join(process.cwd(), 'package.json'),
    )('electron') as string;
    let electronResult: Awaited<ReturnType<typeof execFileAsync>>;
    try {
      electronResult = await execFileAsync(
        electronBinary,
        [path.join(fixtureOutputRoot, 'electron-asar-contract.cjs')],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            VN_ASAR_CONTRACT_ROOT: root,
          },
          timeout: 60_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
    } catch (error) {
      const childError = error as Error & {
        stdout?: string;
        stderr?: string;
      };
      throw new Error(
        `Electron ASAR contract fixture failed\nstdout:\n${childError.stdout ?? ''}\nstderr:\n${childError.stderr ?? ''}`,
        { cause: error },
      );
    }
    const { stdout, stderr } = electronResult;

    expect(stderr).not.toContain('ASAR_CONTRACT_FAILED');
    expect(stdout).toContain('ASAR_CONTRACT_OK');
    await expect(stat(sourceAsarPath)).resolves.toMatchObject({
      size: sourceAsarStatus.size,
    });
    expect((await stat(sourceAsarPath)).isFile()).toBe(true);
    expect((await stat(sourceAsarPath)).mode & 0o777).toBe(0o444);
    expect(
      createHash('sha256')
        .update(await readFile(sourceAsarPath))
        .digest('hex'),
    ).toBe(sourceAsarSha256);
    await expect(stat(artifactPath(exportsRoot))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(exportLockPath(exportsRoot), 'utf8')).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
  }, 90_000);

  it('assembles and verifies the app privately before publishing its ZIP', async () => {
    const root = await temporaryRoot();
    const sourceRoot = path.join(root, 'source');
    const targetRoot = path.join(root, 'exports');
    await Promise.all([mkdir(sourceRoot), mkdir(targetRoot)]);
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(targetRoot);
    const canonicalTargetRoot = await realpath(targetRoot);
    let runtimeBundlePath = '';
    let assemblyArtifactPath = '';
    let preparedPath = '';
    let archivedApplicationPath = '';
    runtimeMocks.exportRuntimeBundle.mockImplementationOnce(
      async (runtimeOptions) => {
        runtimeBundlePath = runtimeOptions.targetBundlePath;
        await mkdir(runtimeOptions.targetBundlePath);
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'game.json'),
          '{"format":"vn-engine-runtime"}\n',
        );
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'manifest.json'),
          '{"format":"vn-engine-runtime-manifest"}\n',
        );
        return {
          bundleName: path.basename(runtimeOptions.targetBundlePath),
          buildId: 'runtime-build-1',
          sourceRevision: runtimeOptions.sourceRevision,
          assetCount: 2,
        };
      },
    );
    const finalizeApplication = vi.fn(async (artifactPath: string) => {
      assemblyArtifactPath = artifactPath;
      expect(path.dirname(artifactPath)).not.toBe(canonicalTargetRoot);
      await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        (await readdir(targetRoot)).filter((name) =>
          /\.(?:publishing|staging|runtime\.vngame)$/u.test(name),
        ),
      ).toEqual([]);
    });
    const preparePublishedArtifact = vi.fn(async (artifactPath: string) => {
      preparedPath = artifactPath;
      expect(path.dirname(artifactPath)).not.toBe(canonicalTargetRoot);
      expect(path.basename(artifactPath)).toBe('Story.app');
      await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    });
    const archiveApplication = vi.fn(
      async (applicationPath: string, archivePath: string) => {
        archivedApplicationPath = applicationPath;
        await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
        await writeFile(archivePath, 'fake-standalone-zip');
      },
    );
    const extractApplicationArchive = vi.fn(
      async (_archivePath: string, extractionRootPath: string) => {
        await cp(
          archivedApplicationPath,
          path.join(extractionRootPath, 'Story.app'),
          { recursive: true },
        );
      },
    );

    await exportStandaloneApplication(
      options(root, templateRoot, {
        sourceProjectRootPath: sourceRoot,
        targetArtifactPath: target,
        finalizeApplication,
        preparePublishedArtifact,
        archiveApplication,
        extractApplicationArchive,
      }),
    );

    expect(path.dirname(runtimeBundlePath)).not.toBe(canonicalTargetRoot);
    expect(path.dirname(assemblyArtifactPath)).not.toBe(canonicalTargetRoot);
    expect(preparePublishedArtifact).toHaveBeenCalledTimes(1);
    expect(preparedPath).toBe(assemblyArtifactPath);
    await expect(stat(preparedPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(target, 'utf8')).resolves.toBe('fake-standalone-zip');
    expect(
      (await readdir(targetRoot)).filter((name) => name.startsWith('.Story')),
    ).toEqual([]);
  });

  it('publishes a visible ZIP from a regular file inside a hidden transaction directory', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(root);
    let publishingDirectory = '';

    await exportStandaloneApplication(
      options(root, templateRoot, {
        injectFault: async (point: string) => {
          if (point !== 'before-commit') {
            return;
          }
          publishingDirectory = await requirePublishingDirectory(root);
          expect(path.basename(publishingDirectory)).toMatch(
            /^\.vn-engine-[^.]+\.publishing$/u,
          );
          await expect(readdir(publishingDirectory)).resolves.toEqual([
            'archive.zip',
          ]);
          expect(
            (await stat(path.join(publishingDirectory, 'archive.zip'))).isFile(),
          ).toBe(true);

          // Reproduce Finder/FileProvider metadata on the hidden transaction
          // directory. Its ordinary child archive must not inherit that state.
          await makePublishingDirectoryFinderHidden(publishingDirectory);
          expect(await macosFileFlags(publishingDirectory)).toContain('hidden');
          expect(await extendedAttributeNames(publishingDirectory)).toContain(
            'com.apple.FinderInfo',
          );
        },
      }),
    );

    expect(publishingDirectory).not.toBe('');
    expect(path.basename(target).startsWith('.')).toBe(false);
    expect((await stat(target)).isFile()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('fake-standalone-zip');
    expect(await macosFileFlags(target)).not.toContain('hidden');
    expect(await extendedAttributeNames(target)).not.toContain(
      'com.apple.FinderInfo',
    );
    await expect(stat(publishingDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(publishingDirectoryPaths(root)).resolves.toEqual([]);
  });

  it('rolls back a hidden publishing directory when publication is interrupted', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(root);
    let publishingDirectory = '';

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          injectFault: async (point: string) => {
            if (point !== 'before-commit') {
              return;
            }
            publishingDirectory = await requirePublishingDirectory(root);
            await makePublishingDirectoryFinderHidden(publishingDirectory);
            throw new Error('publication interrupted');
          },
        }),
      ),
    ).rejects.toThrow('publication interrupted');

    await expect(stat(publishingDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(publishingDirectoryPaths(root)).resolves.toEqual([]);
    await expect(
      readFile(exportLockPath(root), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not remove a successor that replaces the publishing directory', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(root);
    let publishingDirectory = '';
    let displacedPublishingDirectory = '';

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          injectFault: async (point: string) => {
            if (point !== 'before-commit') {
              return;
            }
            publishingDirectory = await requirePublishingDirectory(root);
            displacedPublishingDirectory = path.join(
              root,
              '.displaced-publishing-transaction',
            );
            await rename(publishingDirectory, displacedPublishingDirectory);
            await mkdir(publishingDirectory, { mode: 0o700 });
            await Promise.all([
              writeFile(
                path.join(publishingDirectory, 'archive.zip'),
                'successor archive',
              ),
              writeFile(
                path.join(publishingDirectory, 'successor.txt'),
                'successor owns this directory',
              ),
            ]);
          },
        }),
      ),
    ).rejects.toThrow(/发布暂存目录.*发生了变化/u);

    await expect(
      readFile(path.join(publishingDirectory, 'archive.zip'), 'utf8'),
    ).resolves.toBe('successor archive');
    await expect(
      readFile(path.join(publishingDirectory, 'successor.txt'), 'utf8'),
    ).resolves.toBe('successor owns this directory');
    await expect(stat(displacedPublishingDirectory)).resolves.toMatchObject(
      {},
    );
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(exportLockPath(root), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects template ctime drift and removes copied staging data', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot, artifactRoot } = await createTemplate(root);
    const templateFilePath = path.join(artifactRoot, 'player-binary');
    const templateIdentity = await stat(templateFilePath);
    let injectedCtimeChange = false;
    const restoreRead = await interceptFileHandleReads(
      templateFilePath,
      async (file, argumentsList, invokeOriginal) => {
        const [, , , position] = argumentsList as [
          Buffer,
          number,
          number,
          number,
        ];
        if (
          !injectedCtimeChange &&
          position === 0 &&
          sameFileIdentity(await file.stat(), templateIdentity)
        ) {
          injectedCtimeChange = await changeOnlyCtime(templateFilePath);
        }
        return invokeOriginal();
      },
    );

    try {
      await expect(
        exportStandaloneApplication(options(root, templateRoot)),
      ).rejects.toThrow('独立应用模板文件在复制时发生了变化');
    } finally {
      restoreRead();
    }
    expect(injectedCtimeChange).toBe(true);
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
    expect(await readdir(root)).not.toContain('Story.app');
  });

  it('refuses to overwrite an existing application', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(root);
    await mkdir(target);
    await writeFile(path.join(target, 'keep.txt'), 'keep');

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).rejects.toThrow('已存在同名独立应用');
    expect(await readFile(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
    expect(runtimeMocks.exportRuntimeBundle).not.toHaveBeenCalled();
  });

  it('does not overwrite a target that appears immediately before publication', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(root);
    let privateWorkspacePath = '';

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          finalizeApplication: vi.fn(async (artifactPath: string) => {
            privateWorkspacePath = path.dirname(artifactPath);
          }),
          injectFault: async (point: string) => {
            if (point === 'before-commit') {
              await mkdir(target);
              await writeFile(path.join(target, 'successor.txt'), 'successor');
            }
          },
        }),
      ),
    ).rejects.toThrow(/导出位置/u);

    await expect(readFile(path.join(target, 'successor.txt'), 'utf8')).resolves.toBe(
      'successor',
    );
    await expect(stat(privateWorkspacePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(exportLockPath(root), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('blocks a concurrent export while the current owner is still alive', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    let releaseFirstExport!: () => void;
    const firstExportMayContinue = new Promise<void>((resolve) => {
      releaseFirstExport = resolve;
    });
    runtimeMocks.exportRuntimeBundle.mockImplementationOnce(async () => {
      await firstExportMayContinue;
      throw new Error('first export stopped after contention check');
    });

    const firstExport = exportStandaloneApplication(options(root, templateRoot));
    await vi.waitFor(() => {
      expect(runtimeMocks.exportRuntimeBundle).toHaveBeenCalledTimes(1);
    });

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    expect(runtimeMocks.exportRuntimeBundle).toHaveBeenCalledTimes(1);

    releaseFirstExport();
    await expect(firstExport).rejects.toThrow(
      'first export stopped after contention check',
    );
    await expect(readFile(exportLockPath(root), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('does not remove a successor lock while the previous owner is unwinding', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    let releaseFirstExport!: () => void;
    const firstExportMayContinue = new Promise<void>((resolve) => {
      releaseFirstExport = resolve;
    });
    runtimeMocks.exportRuntimeBundle.mockImplementationOnce(
      async (runtimeOptions) => {
        await firstExportMayContinue;
        await mkdir(runtimeOptions.targetBundlePath);
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'game.json'),
          '{"format":"vn-engine-runtime"}\n',
        );
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'manifest.json'),
          '{"format":"vn-engine-runtime-manifest"}\n',
        );
        return {
          bundleName: path.basename(runtimeOptions.targetBundlePath),
          buildId: 'runtime-build-1',
          sourceRevision: runtimeOptions.sourceRevision,
          assetCount: 2,
        };
      },
    );

    const firstExport = exportStandaloneApplication(options(root, templateRoot));
    await vi.waitFor(() => {
      expect(runtimeMocks.exportRuntimeBundle).toHaveBeenCalledTimes(1);
    });
    const lockPath = exportLockPath(root);
    await unlink(lockPath);
    const successorContents = '{"owner":"successor"}\n';
    await writeFile(lockPath, successorContents, { flag: 'wx', mode: 0o600 });

    releaseFirstExport();
    await expect(firstExport).rejects.toThrow(
      '另一个导出任务正在写入同名独立应用',
    );
    await expect(readFile(lockPath, 'utf8')).resolves.toBe(successorContents);
    await expect(readdir(artifactPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('allows only one contender to reclaim the same unowned lock', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    await writeFile(exportLockPath(root), '', { flag: 'wx', mode: 0o600 });

    const results = await Promise.allSettled([
      exportStandaloneApplication(options(root, templateRoot)),
      exportStandaloneApplication(options(root, templateRoot)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(runtimeMocks.exportRuntimeBundle).toHaveBeenCalledTimes(1);
  });

  it('does not delete unreferenced transaction-shaped files during recovery', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const artifactName = path.basename(artifactPath(root));
    const sentinelTransactionId = 'a30a6098-6c89-4d25-a6e1-f9119a0d7558';
    const stagingSentinel = path.join(
      root,
      `.${artifactName}.${sentinelTransactionId}.staging`,
    );
    const runtimeSentinel = path.join(
      root,
      `.${artifactName}.${sentinelTransactionId}.runtime.vngame`,
    );
    await mkdir(stagingSentinel);
    await mkdir(runtimeSentinel);
    await writeFile(path.join(stagingSentinel, 'keep.txt'), 'staging sentinel');
    await writeFile(path.join(runtimeSentinel, 'keep.txt'), 'runtime sentinel');
    await writeFile(exportLockPath(root), '', { flag: 'wx', mode: 0o600 });

    await exportStandaloneApplication(options(root, templateRoot));

    await expect(
      readFile(path.join(stagingSentinel, 'keep.txt'), 'utf8'),
    ).resolves.toBe('staging sentinel');
    await expect(
      readFile(path.join(runtimeSentinel, 'keep.txt'), 'utf8'),
    ).resolves.toBe('runtime sentinel');
  });

  it('recovers a legacy lock immediately after its owner process is killed', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const lockPath = exportLockPath(root);
    const lockOwnerScript = String.raw`
      const { spawnSync } = require('node:child_process');
      const { closeSync, openSync } = require('node:fs');
      const lockPath = process.argv[1];
      const lockFd = openSync(lockPath, 'a', 0o600);
      const result = spawnSync('/usr/bin/lockf', ['-s', '-t', '0', '3'], {
        stdio: ['ignore', 'ignore', 'ignore', lockFd],
      });
      if (result.status !== 0) {
        closeSync(lockFd);
        process.exit(result.status ?? 1);
      }
      process.stdout.write('ready\n');
      process.on('SIGTERM', () => {
        closeSync(lockFd);
        process.exit(0);
      });
      setInterval(() => undefined, 1_000);
    `;
    const owner = spawn(process.execPath, ['-e', lockOwnerScript, lockPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ownerOutput = '';
    owner.stdout.setEncoding('utf8');
    owner.stdout.on('data', (chunk: string) => {
      ownerOutput += chunk;
    });

    try {
      await vi.waitFor(() => {
        expect(ownerOutput).toContain('ready');
      });
      const oldTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      await utimes(lockPath, oldTimestamp, oldTimestamp);
      owner.kill('SIGSTOP');
      await expect(
        exportStandaloneApplication(options(root, templateRoot)),
      ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        const ownerExited = once(owner, 'exit');
        owner.kill('SIGKILL');
        await ownerExited;
      }
    }

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).resolves.toMatchObject({ artifactName: path.basename(artifactPath(root)) });
    await expect(readFile(lockPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not overlap an older exporter that only keeps the zero-byte file open', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const lockPath = exportLockPath(root);
    const legacyOwnerScript = String.raw`
      const { closeSync, openSync } = require('node:fs');
      const lockFd = openSync(process.argv[1], 'a', 0o600);
      process.stdout.write('ready\n');
      process.on('SIGTERM', () => {
        closeSync(lockFd);
        process.exit(0);
      });
      setInterval(() => undefined, 1_000);
    `;
    const owner = spawn(process.execPath, ['-e', legacyOwnerScript, lockPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ownerOutput = '';
    owner.stdout.setEncoding('utf8');
    owner.stdout.on('data', (chunk: string) => {
      ownerOutput += chunk;
    });

    try {
      await vi.waitFor(() => {
        expect(ownerOutput).toContain('ready');
      });
      await expect(
        exportStandaloneApplication(options(root, templateRoot)),
      ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) {
        const ownerExited = once(owner, 'exit');
        owner.kill('SIGTERM');
        await ownerExited;
      }
    }

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).resolves.toMatchObject({ artifactName: path.basename(artifactPath(root)) });
  });

  it('never follows or reclaims a lock-file symlink', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    const outsidePath = path.join(root, 'outside-lock-owner.txt');
    const outsideContents = 'must remain untouched\n';
    await writeFile(outsidePath, outsideContents);
    await symlink(outsidePath, exportLockPath(root));

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe(outsideContents);
    expect(runtimeMocks.exportRuntimeBundle).not.toHaveBeenCalled();
  });

  it('never reclaims a hard-linked or directory lock path', async () => {
    const hardLinkRoot = await temporaryRoot();
    await mkdir(path.join(hardLinkRoot, 'source'));
    const { templateRoot: hardLinkTemplateRoot } = await createTemplate(
      hardLinkRoot,
    );
    const outsidePath = path.join(hardLinkRoot, 'outside-hard-link-owner.txt');
    const outsideContents = 'hard-link owner must remain untouched\n';
    await writeFile(outsidePath, outsideContents);
    await link(outsidePath, exportLockPath(hardLinkRoot));

    await expect(
      exportStandaloneApplication(options(hardLinkRoot, hardLinkTemplateRoot)),
    ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe(outsideContents);

    const directoryRoot = await temporaryRoot();
    await mkdir(path.join(directoryRoot, 'source'));
    const { templateRoot: directoryTemplateRoot } = await createTemplate(
      directoryRoot,
    );
    const directoryLockPath = exportLockPath(directoryRoot);
    await mkdir(directoryLockPath);

    await expect(
      exportStandaloneApplication(options(directoryRoot, directoryTemplateRoot)),
    ).rejects.toThrow('另一个导出任务正在写入同名独立应用');
    await expect(readdir(directoryLockPath)).resolves.toEqual([]);
  });

  it('rejects a template symlink that escapes the payload and rolls back', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot, artifactRoot } = await createTemplate(root);
    const outsidePath = path.join(root, 'outside.txt');
    await writeFile(outsidePath, 'outside');
    await symlink(outsidePath, path.join(artifactRoot, 'escape'));

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).rejects.toThrow('不安全链接');
    await expect(readFile(outsidePath, 'utf8')).resolves.toBe('outside');
    await expect(readdir(artifactPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
  });

  it('rejects hard-linked template files and rolls back', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot, artifactRoot } = await createTemplate(root);
    await link(
      path.join(artifactRoot, 'player-binary'),
      path.join(artifactRoot, 'player-binary-alias'),
    );

    await expect(
      exportStandaloneApplication(options(root, templateRoot)),
    ).rejects.toThrow('硬链接文件');
    await expect(readdir(artifactPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
  });

  it('rolls back the bundle and staging when post-sign verification fails', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          finalizeApplication: vi
            .fn()
            .mockRejectedValue(new Error('codesign verify failed')),
        }),
      ),
    ).rejects.toThrow('codesign verify failed');
    await expect(readdir(artifactPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
  });

  it('removes private and target-side transaction data when publication preparation fails', async () => {
    const root = await temporaryRoot();
    const targetRoot = path.join(root, 'exports');
    await Promise.all([mkdir(path.join(root, 'source')), mkdir(targetRoot)]);
    const { templateRoot } = await createTemplate(root);
    const target = artifactPath(targetRoot);
    let privateWorkspacePath = '';
    let publishingPath = '';
    const finalizeApplication = vi.fn(async (artifactPath: string) => {
      privateWorkspacePath = path.dirname(artifactPath);
    });
    const preparePublishedArtifact = vi.fn(async (artifactPath: string) => {
      publishingPath = artifactPath;
      throw new Error('target-side strict verification failed');
    });

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          targetArtifactPath: target,
          finalizeApplication,
          preparePublishedArtifact,
        }),
      ),
    ).rejects.toThrow('target-side strict verification failed');

    expect(publishingPath).not.toBe(target);
    await expect(stat(publishingPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(privateWorkspacePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(exportLockPath(targetRoot), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      (await readdir(targetRoot)).filter((name) => name.startsWith('.Story')),
    ).toEqual([]);
  });

  it('verifies the ad-hoc signature after signing instead of trusting sign exit zero', async () => {
    const root = await temporaryRoot();
    const { templateRoot } = await createTemplate(root);
    const template = await loadStandalonePlayerTemplate(templateRoot);
    const commandRunner = vi.fn(
      async (_executablePath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === '--verify') {
          throw new Error('strict verification failed');
        }
      },
    );

    await expect(
      finalizeStandaloneApplication(
        template.artifactRootPath,
        template,
        {
          name: 'Story',
          version: '1.2.3',
          applicationId: 'com.example.story',
        },
        commandRunner,
      ),
    ).rejects.toThrow('strict verification failed');
    expect(commandRunner.mock.calls.at(-4)).toEqual([
      '/usr/bin/xattr',
      [
        '-d',
        '-r',
        '-s',
        'com.apple.FinderInfo',
        template.artifactRootPath,
      ],
    ]);
    expect(commandRunner.mock.calls.at(-3)).toEqual([
      '/usr/bin/xattr',
      [
        '-d',
        '-r',
        '-s',
        'com.apple.ResourceFork',
        template.artifactRootPath,
      ],
    ]);
    expect(commandRunner.mock.calls.at(-2)?.[1]).toEqual([
      '--force',
      '--deep',
      '--sign',
      '-',
      template.artifactRootPath,
    ]);
    expect(commandRunner.mock.calls.at(-1)?.[1]).toEqual([
      '--verify',
      '--deep',
      '--strict',
      template.artifactRootPath,
    ]);
    expect(
      commandRunner.mock.calls.some(([, arguments_]) =>
        arguments_.includes('CFBundleName'),
      ),
    ).toBe(false);
    expect(
      commandRunner.mock.calls.some(([, arguments_]) =>
        arguments_.includes('CFBundleDisplayName'),
      ),
    ).toBe(true);
  });

  it('removes signing detritus once and requires a later untouched strict check', async () => {
    const root = await temporaryRoot();
    const artifact = path.join(root, 'Prepared.app');
    const nestedFile = path.join(artifact, 'Contents', 'prepared-file');
    await mkdir(path.dirname(nestedFile), { recursive: true });
    await writeFile(nestedFile, 'prepared');
    await execFileAsync('/usr/bin/xattr', [
      '-wx',
      'com.apple.FinderInfo',
      `01${'00'.repeat(31)}`,
      nestedFile,
    ]);
    const canonicalArtifact = await realpath(artifact);
    await execFileAsync('/usr/bin/xattr', [
      '-w',
      'com.apple.ResourceFork',
      'resource-fork',
      nestedFile,
    ]);
    const commandRunner = vi.fn(
      async (executablePath: string, arguments_: readonly string[]) => {
        if (executablePath === '/usr/bin/xattr') {
          await execFileAsync(executablePath, [...arguments_]);
        }
      },
    );

    await sanitizeAndVerifyStandaloneApplication(canonicalArtifact, commandRunner);

    const { stdout: remainingAttributes } = await execFileAsync(
      '/usr/bin/xattr',
      [nestedFile],
    );
    expect(remainingAttributes).not.toContain('com.apple.FinderInfo');
    expect(remainingAttributes).not.toContain('com.apple.ResourceFork');
    expect(commandRunner.mock.calls).toEqual([
      [
        '/usr/bin/xattr',
        ['-d', '-r', '-s', 'com.apple.FinderInfo', canonicalArtifact],
      ],
      [
        '/usr/bin/xattr',
        ['-d', '-r', '-s', 'com.apple.ResourceFork', canonicalArtifact],
      ],
      [
        '/usr/bin/codesign',
        ['--verify', '--deep', '--strict', canonicalArtifact],
      ],
      [
        '/usr/bin/codesign',
        ['--verify', '--deep', '--strict', canonicalArtifact],
      ],
    ]);
  });

  it('rejects a destination that restores Finder metadata after the first strict check', async () => {
    const root = await temporaryRoot();
    const artifact = path.join(root, 'Rehydrated.app');
    await mkdir(path.join(artifact, 'Contents'), { recursive: true });
    let strictChecks = 0;
    const commandRunner = vi.fn(
      async (executablePath: string) => {
        if (executablePath === '/usr/bin/codesign') {
          strictChecks += 1;
          if (strictChecks === 2) {
            throw new Error(
              'resource fork, Finder information, or similar detritus not allowed',
            );
          }
        }
      },
    );

    await expect(
      sanitizeAndVerifyStandaloneApplication(
        await realpath(artifact),
        commandRunner,
      ),
    ).rejects.toMatchObject({
      code: 'UNSTABLE_STANDALONE_APPLICATION_METADATA',
    });
    expect(strictChecks).toBe(2);
  });

  it('requires a deep strict signature check for a copied Player template', async () => {
    const commandRunner = vi.fn().mockResolvedValue(undefined);

    await verifyStandalonePlayerTemplateSignature(
      '/private/tmp/Player.app',
      commandRunner,
    );

    expect(commandRunner).toHaveBeenCalledWith('/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      '/private/tmp/Player.app',
    ]);
  });

  it('rechecks the frozen revision after assembly and rolls back on change', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'source'));
    const { templateRoot } = await createTemplate(root);
    let checks = 0;

    await expect(
      exportStandaloneApplication(
        options(root, templateRoot, {
          assertSourceStillCurrent: () => {
            checks += 1;
            if (checks === 2) {
              throw new Error('revision changed');
            }
          },
        }),
      ),
    ).rejects.toThrow('revision changed');
    expect(checks).toBe(2);
    await expect(readdir(artifactPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await readdir(root)).filter((name) => name.startsWith('.Story'))).toEqual(
      [],
    );
  });
});
