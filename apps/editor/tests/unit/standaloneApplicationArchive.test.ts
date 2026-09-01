/**
 * 文件主要作用：验证 standalone Application Archive 的关键行为与回归边界。
 * 测试覆盖：关键成功、失败与边界场景。
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  cp,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exportStandaloneApplication,
  verifyStandalonePlayerTemplateSignature,
} from '../../src/main/export/StandaloneApplicationExporter';
import {
  PLAYER_TEMPLATE_FORMAT,
  PLAYER_TEMPLATE_VERSION,
} from '../../src/main/export/StandalonePlayerTemplate';

const runtimeMocks = vi.hoisted(() => ({
  exportRuntimeBundle: vi.fn(),
}));

vi.mock('../../src/main/export/RuntimeBundleExporter', () => ({
  exportRuntimeBundle: runtimeMocks.exportRuntimeBundle,
}));

const execFileAsync = promisify(execFile);

type MutableFileHandlePrototype = {
  sync: FileHandle['sync'];
};

async function failFirstPublishingFileSync(
  probePath: string,
  targetRoot: string,
): Promise<{ injected: () => boolean; restore: () => void }> {
  const probe = await open(probePath, 'r');
  const prototype = Object.getPrototypeOf(probe) as MutableFileHandlePrototype;
  await probe.close();
  const original = prototype.sync;
  let didInject = false;
  prototype.sync = (async function (this: FileHandle): Promise<void> {
    if (!didInject) {
      const entries = await readdir(targetRoot);
      if (
        entries.some((entry) =>
          /^\.vn-engine-[^.]+\.publishing$/u.test(entry),
        )
      ) {
        didInject = true;
        throw new Error('simulated publishing fsync failure');
      }
    }
    await Reflect.apply(original, this, []);
  }) as FileHandle['sync'];
  return {
    injected: () => didInject,
    restore: () => {
      prototype.sync = original;
    },
  };
}

const project = {
  schemaVersion: 1 as const,
  id: 'project-1',
  name: 'Story',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Standalone Story',
    eyebrow: 'A VN ENGINE STORY',
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
      backgroundScalePercent: 100,
      nodes: [],
    },
  ],
};

const sourceManifestContents = JSON.stringify({
  format: 'vn-engine-project',
  fileVersion: 20,
  project,
  assets: [],
});

describe.runIf(process.platform === 'darwin')(
  'standalone macOS ZIP export',
  () => {
    const temporaryRoots: string[] = [];

    async function temporaryRoot(): Promise<string> {
      const root = await mkdtemp(path.join(tmpdir(), 'vn-standalone-zip-'));
      temporaryRoots.push(root);
      return root;
    }

    async function createTemplate(
      root: string,
      signed = false,
    ): Promise<string> {
      const templateRoot = path.join(root, 'template');
      const artifactRoot = path.join(
        templateRoot,
        'payload',
        'VN Engine Player.app',
      );
      await mkdir(path.join(artifactRoot, 'Contents', 'Resources'), {
        recursive: true,
      });
      await writeFile(
        path.join(templateRoot, 'player-template.json'),
        `${JSON.stringify({
          format: PLAYER_TEMPLATE_FORMAT,
          templateVersion: PLAYER_TEMPLATE_VERSION,
          platform: process.platform,
          arch: process.arch,
          playerVersion: '0.1.0',
          runtimeCompatibility: '>=1 <13',
          payloadRoot: 'payload',
          artifactEntry: 'VN Engine Player.app',
          gameResourceDirectory: 'Contents/Resources/game',
          applicationMetadataFile:
            'Contents/Resources/vn-game-application.json',
          macosInfoPlistFile: 'Contents/Info.plist',
        })}\n`,
      );
      const plist = signed
        ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>VN Engine Player</string>
<key>CFBundleIdentifier</key><string>com.example.vn-player-template</string>
<key>CFBundleName</key><string>VN Engine Player</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>0.1.0</string>
</dict></plist>\n`
        : '<?xml version="1.0"?><plist><dict/></plist>';
      await writeFile(path.join(artifactRoot, 'Contents', 'Info.plist'), plist);
      if (signed) {
        const executablePath = path.join(
          artifactRoot,
          'Contents',
          'MacOS',
          'VN Engine Player',
        );
        await mkdir(path.dirname(executablePath), { recursive: true });
        await writeFile(executablePath, '#!/bin/sh\nexit 0\n');
        await chmod(executablePath, 0o755);
        await execFileAsync('/usr/bin/codesign', [
          '--force',
          '--deep',
          '--sign',
          '-',
          artifactRoot,
        ]);
      } else {
        await writeFile(path.join(artifactRoot, 'player-binary'), 'template');
      }
      return templateRoot;
    }

    function targetPath(root: string): string {
      return path.join(root, 'exports', 'Story-macOS.zip');
    }

    function transactionNames(root: string): Promise<string[]> {
      return readdir(path.join(root, 'exports')).then((entries) =>
        entries.filter(
          (entry) =>
            entry.startsWith('.') ||
            entry.startsWith('VNEnginePublishing-') ||
            entry.startsWith('VNEngineRollback-'),
        ),
      );
    }

    function options(
      root: string,
      templateRoot: string,
      overrides: Record<string, unknown> = {},
    ) {
      let archivedApplicationPath = '';
      return {
        sourceProjectRootPath: path.join(root, 'source'),
        targetArtifactPath: targetPath(root),
        templateRootPath: templateRoot,
        sourceRevision: 7,
        expectedManifestSha256: createHash('sha256')
          .update(sourceManifestContents)
          .digest('hex'),
        expectedProject: project,
        expectedAssets: [],
        defaultLanguage: 'en-US' as const,
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
      runtimeMocks.exportRuntimeBundle.mockImplementation(
        async (runtimeOptions) => {
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
    });

    afterEach(async () => {
      vi.clearAllMocks();
      await Promise.all(
        temporaryRoots
          .splice(0)
          .map((root) => rm(root, { recursive: true, force: true })),
      );
    });

    it('keeps the final ZIP absent until a complete private app has been archived and verified', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root);
      const target = targetPath(root);
      const canonicalTargetParent = await realpath(path.dirname(target));
      let privateWorkspacePath = '';
      let archivedApplicationPath = '';
      const extractApplicationArchive = vi.fn(
        async (_archivePath: string, extractionRootPath: string) => {
          await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
          await cp(
            archivedApplicationPath,
            path.join(extractionRootPath, 'Story.app'),
            { recursive: true },
          );
        },
      );
      const archiveApplication = vi.fn(
        async (applicationPath: string, archivePath: string) => {
          archivedApplicationPath = applicationPath;
          privateWorkspacePath = path.dirname(applicationPath);
          expect(path.basename(applicationPath)).toBe('Story.app');
          expect(path.dirname(applicationPath)).not.toBe(canonicalTargetParent);
          await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
          await writeFile(archivePath, 'verified-fake-zip');
        },
      );
      const verifyExtractedApplication = vi.fn(
        async (applicationPath: string) => {
          expect(path.basename(applicationPath)).toBe('Story.app');
          await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
          await expect(
            readFile(
              path.join(
                applicationPath,
                'Contents',
                'Resources',
                'game',
                'game.json',
              ),
              'utf8',
            ),
          ).resolves.toContain('vn-engine-runtime');
        },
      );

      const result = await exportStandaloneApplication(
        options(root, templateRoot, {
          archiveApplication,
          extractApplicationArchive,
          verifyExtractedApplication,
        }),
      );

      expect(result.artifactName).toBe('Story-macOS.zip');
      expect(runtimeMocks.exportRuntimeBundle).toHaveBeenCalledWith(
        expect.objectContaining({ defaultLanguage: 'en-US' }),
      );
      expect(await readFile(target, 'utf8')).toBe('verified-fake-zip');
      expect(archiveApplication).toHaveBeenCalledTimes(1);
      expect(extractApplicationArchive).toHaveBeenCalledTimes(2);
      expect(verifyExtractedApplication).toHaveBeenCalledTimes(2);
      await expect(stat(privateWorkspacePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await transactionNames(root)).toEqual([]);
      expect(await readdir(path.join(root, 'exports'))).toEqual([
        'Story-macOS.zip',
      ]);
    });

    it('does not overwrite an existing ZIP', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root);
      const target = targetPath(root);
      await writeFile(target, 'existing-zip');
      const exportOptions = options(root, templateRoot);

      await expect(exportStandaloneApplication(exportOptions)).rejects.toThrow(
        '已存在同名独立应用',
      );

      expect(await readFile(target, 'utf8')).toBe('existing-zip');
      expect(exportOptions.archiveApplication).not.toHaveBeenCalled();
      expect(await transactionNames(root)).toEqual([]);
    });

    it('cleans private and target-side files when ZIP creation fails', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root);
      let privateWorkspacePath = '';
      const archiveApplication = vi.fn(
        async (applicationPath: string, archivePath: string) => {
          privateWorkspacePath = path.dirname(applicationPath);
          await writeFile(archivePath, 'partial-zip');
          throw new Error('archive creation failed');
        },
      );

      await expect(
        exportStandaloneApplication(
          options(root, templateRoot, { archiveApplication }),
        ),
      ).rejects.toThrow('archive creation failed');

      await expect(stat(targetPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(privateWorkspacePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await transactionNames(root)).toEqual([]);
    });

    it('does not publish an archive whose extracted app fails verification', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root);

      await expect(
        exportStandaloneApplication(
          options(root, templateRoot, {
            verifyExtractedApplication: vi
              .fn()
              .mockRejectedValue(new Error('extracted codesign failed')),
          }),
        ),
      ).rejects.toThrow('extracted codesign failed');

      await expect(stat(targetPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await transactionNames(root)).toEqual([]);
    });

    it('removes a publishing ZIP created before its fsync fails', async () => {
      const root = await temporaryRoot();
      const sourceRoot = path.join(root, 'source');
      const targetRoot = path.join(root, 'exports');
      await Promise.all([mkdir(sourceRoot), mkdir(targetRoot)]);
      const templateRoot = await createTemplate(root);
      const interception = await failFirstPublishingFileSync(
        sourceRoot,
        targetRoot,
      );

      try {
        await expect(
          exportStandaloneApplication(options(root, templateRoot)),
        ).rejects.toThrow('simulated publishing fsync failure');
      } finally {
        interception.restore();
      }

      expect(interception.injected()).toBe(true);
      await expect(stat(targetPath(root))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await transactionNames(root)).toEqual([]);
      expect(await readdir(targetRoot)).toEqual([]);
    });

    it('does not delete a successor that replaces the publishing ZIP before verification', async () => {
      const root = await temporaryRoot();
      const sourceRoot = path.join(root, 'source');
      const targetRoot = path.join(root, 'exports');
      await Promise.all([mkdir(sourceRoot), mkdir(targetRoot)]);
      const templateRoot = await createTemplate(root);
      const target = targetPath(root);
      let archivedApplicationPath = '';
      let publishingPath = '';
      let displacedPublishingPath = '';
      let extractionCalls = 0;
      const archiveApplication = vi.fn(
        async (applicationPath: string, archivePath: string) => {
          archivedApplicationPath = applicationPath;
          await writeFile(archivePath, 'original-archive');
        },
      );
      const extractApplicationArchive = vi.fn(
        async (archivePath: string, extractionRootPath: string) => {
          extractionCalls += 1;
          if (extractionCalls === 1) {
            await cp(
              archivedApplicationPath,
              path.join(extractionRootPath, 'Story.app'),
              { recursive: true },
            );
            return;
          }
          publishingPath = archivePath;
          displacedPublishingPath = path.join(
            targetRoot,
            'displaced-original-archive.zip',
          );
          await rename(publishingPath, displacedPublishingPath);
          await writeFile(publishingPath, 'successor-archive');
          throw new Error('publishing ZIP identity changed');
        },
      );

      await expect(
        exportStandaloneApplication(
          options(root, templateRoot, {
            archiveApplication,
            extractApplicationArchive,
          }),
        ),
      ).rejects.toThrow('publishing ZIP identity changed');

      expect(extractionCalls).toBe(2);
      await expect(readFile(publishingPath, 'utf8')).resolves.toBe(
        'successor-archive',
      );
      await expect(readFile(displacedPublishingPath, 'utf8')).resolves.toBe(
        'original-archive',
      );
      await expect(stat(target)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(
        stat(path.join(targetRoot, `.${path.basename(target)}.export.lock`)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('keeps a concurrently created ZIP and removes its own publication state', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root);
      const target = targetPath(root);

      await expect(
        exportStandaloneApplication(
          options(root, templateRoot, {
            injectFault: async (point: string) => {
              if (point === 'before-commit') {
                await writeFile(target, 'concurrent-writer');
              }
            },
          }),
        ),
      ).rejects.toThrow(/导出位置/u);

      expect(await readFile(target, 'utf8')).toBe('concurrent-writer');
      expect(await transactionNames(root)).toEqual([]);
    });

    it('creates a real ditto ZIP whose sole top-level app retains its content and signature', async () => {
      const root = await temporaryRoot();
      await Promise.all([
        mkdir(path.join(root, 'source')),
        mkdir(path.join(root, 'exports')),
      ]);
      const templateRoot = await createTemplate(root, true);

      const result = await exportStandaloneApplication({
        ...options(root, templateRoot),
        finalizeApplication: undefined,
        preparePublishedArtifact: undefined,
        archiveApplication: undefined,
        extractApplicationArchive: undefined,
        verifyExtractedApplication: undefined,
        verifyTemplateArtifact: verifyStandalonePlayerTemplateSignature,
      });
      const target = targetPath(root);
      const extractionRoot = path.join(root, 'consumer-extraction');
      await mkdir(extractionRoot);
      await execFileAsync('/usr/bin/ditto', ['-x', '-k', target, extractionRoot]);

      expect(result.artifactName).toBe('Story-macOS.zip');
      expect(await readdir(extractionRoot)).toEqual(['Story.app']);
      const extractedApplication = path.join(extractionRoot, 'Story.app');
      await execFileAsync('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        extractedApplication,
      ]);
      await expect(
        readFile(
          path.join(
            extractedApplication,
            'Contents',
            'Resources',
            'game',
            'game.json',
          ),
          'utf8',
        ),
      ).resolves.toContain('vn-engine-runtime');
      const metadata = JSON.parse(
        await readFile(
          path.join(
            extractedApplication,
            'Contents',
            'Resources',
            'vn-game-application.json',
          ),
          'utf8',
        ),
      ) as { productName?: unknown };
      expect(metadata.productName).toBe('Story');
      expect((await lstat(target)).isFile()).toBe(true);
      expect(await transactionNames(root)).toEqual([]);
    });
  },
);
