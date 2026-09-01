/**
 * 文件主要作用：在 Windows runner 验证 Editor 本地独立游戏 ZIP 的完整组装链路。
 * 测试覆盖：x64 Player 模板复验、内容注入、PowerShell 归档/解压和根目录保留。
 */

import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  exportStandaloneApplication,
  extractStandaloneApplicationArchive,
  STANDALONE_APPLICATION_FORMAT,
  verifyStandalonePlayerTemplateSignature,
  windowsStandaloneArchiveInvocation,
  windowsStandaloneExtractionInvocation,
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

const project = {
  schemaVersion: 1 as const,
  id: 'project-windows',
  name: 'Windows Story',
  entrySceneId: 'scene-1',
  startScreen: {
    title: 'Windows Story',
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

function minimalX64Pe(): Buffer {
  const executable = Buffer.alloc(512);
  executable.write('MZ', 0, 'ascii');
  executable.writeUInt32LE(0x80, 0x3c);
  executable.write('PE\0\0', 0x80, 'binary');
  executable.writeUInt16LE(0x8664, 0x84);
  return executable;
}

describe('standalone Windows PowerShell policy', () => {
  it('passes author-controlled paths only through child environment variables', () => {
    const source = 'C:\\Exports\\Story"; Write-Error injected; #';
    const archive = 'C:\\Exports\\Story $(injected)-Windows.zip';
    const extraction = 'C:\\Temp\\verify & injected';
    const archiveInvocation = windowsStandaloneArchiveInvocation(
      source,
      archive,
      {},
    );
    const extractionInvocation = windowsStandaloneExtractionInvocation(
      archive,
      extraction,
      {},
    );

    expect(archiveInvocation.command).toBe('powershell.exe');
    expect(archiveInvocation.arguments.join(' ')).not.toContain(source);
    expect(archiveInvocation.arguments.join(' ')).not.toContain(archive);
    expect(archiveInvocation.environment).toMatchObject({
      VN_PLAYER_WINDOWS_ARCHIVE_SOURCE: source,
      VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION: archive,
    });
    expect(extractionInvocation.arguments.join(' ')).not.toContain(archive);
    expect(extractionInvocation.arguments.join(' ')).not.toContain(extraction);
    expect(extractionInvocation.environment).toMatchObject({
      VN_EDITOR_WINDOWS_ARCHIVE_SOURCE: archive,
      VN_EDITOR_WINDOWS_ARCHIVE_DESTINATION: extraction,
    });
  });

  it('rejects relative or null-containing command paths', () => {
    expect(() =>
      windowsStandaloneArchiveInvocation('relative', 'C:\\game.zip', {}),
    ).toThrow('Windows 绝对路径');
    expect(() =>
      windowsStandaloneExtractionInvocation(
        'C:\\game.zip\0evil',
        'C:\\verify',
        {},
      ),
    ).toThrow('Windows 绝对路径');
  });
});

describe.runIf(process.platform === 'win32')(
  'standalone Windows x64 application export',
  () => {
    const roots: string[] = [];

    async function temporaryRoot(): Promise<string> {
      const root = await mkdtemp(path.join(os.tmpdir(), 'vn-windows-export-'));
      roots.push(root);
      return root;
    }

    beforeEach(() => {
      runtimeMocks.exportRuntimeBundle.mockImplementation(async (options) => {
        await mkdir(options.targetBundlePath);
        await Promise.all([
          writeFile(
            path.join(options.targetBundlePath, 'game.json'),
            '{"format":"vn-engine-runtime"}\n',
          ),
          writeFile(
            path.join(options.targetBundlePath, 'manifest.json'),
            '{"format":"vn-engine-runtime-manifest"}\n',
          ),
        ]);
        await options.assertSourceStillCurrent?.();
        return {
          bundleName: path.basename(options.targetBundlePath),
          buildId: 'windows-runtime-build',
          sourceRevision: options.sourceRevision,
          assetCount: 0,
        };
      });
    });

    afterEach(async () => {
      vi.clearAllMocks();
      await Promise.all(
        roots.splice(0).map((root) =>
          rm(root, { recursive: true, force: true }),
        ),
      );
    });

    it('publishes a ZIP with one runnable application directory', async () => {
      const root = await temporaryRoot();
      const sourceRoot = path.join(root, 'source');
      const exportRoot = path.join(root, 'exports');
      const templateRoot = path.join(root, 'template');
      const applicationRoot = path.join(
        templateRoot,
        'payload',
        'VN Engine Player-win32-x64',
      );
      await Promise.all([
        mkdir(sourceRoot),
        mkdir(exportRoot),
        mkdir(path.join(applicationRoot, 'resources'), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          path.join(templateRoot, 'player-template.json'),
          `${JSON.stringify({
            format: PLAYER_TEMPLATE_FORMAT,
            templateVersion: PLAYER_TEMPLATE_VERSION,
            platform: 'win32',
            arch: 'x64',
            playerVersion: '0.1.0',
            runtimeCompatibility: '>=1 <13',
            payloadRoot: 'payload',
            artifactEntry: 'VN Engine Player-win32-x64',
            gameResourceDirectory: 'resources/game',
            applicationMetadataFile:
              'resources/vn-game-application.json',
            macosInfoPlistFile: null,
          })}\n`,
        ),
        writeFile(
          path.join(applicationRoot, 'VN Engine Player.exe'),
          minimalX64Pe(),
        ),
        writeFile(path.join(applicationRoot, 'resources', 'app.asar'), 'asar'),
      ]);

      const target = path.join(exportRoot, 'Windows Story-Windows.zip');
      const result = await exportStandaloneApplication({
        sourceProjectRootPath: sourceRoot,
        targetArtifactPath: target,
        templateRootPath: templateRoot,
        defaultLanguage: 'en-US',
        sourceRevision: 4,
        expectedManifestSha256: '0'.repeat(64),
        expectedProject: project,
        expectedAssets: [],
        application: {
          name: 'Windows Story',
          version: '1.2.3',
          applicationId: 'com.example.windows-story',
        },
        verifyTemplateArtifact: verifyStandalonePlayerTemplateSignature,
      });

      expect(result).toMatchObject({
        artifactName: 'Windows Story-Windows.zip',
        platform: 'win32',
        arch: 'x64',
        buildId: 'windows-runtime-build',
      });

      const inspectionRootPath = path.join(root, 'inspection');
      await mkdir(inspectionRootPath);
      const inspectionRoot = await realpath(inspectionRootPath);
      await extractStandaloneApplicationArchive(target, inspectionRoot);
      const exportedApplication = path.join(
        inspectionRoot,
        'Windows Story-Windows',
      );
      await expect(
        readFile(path.join(exportedApplication, 'VN Engine Player.exe')),
      ).resolves.toEqual(minimalX64Pe());
      await expect(
        readFile(
          path.join(
            exportedApplication,
            'resources',
            'game',
            'game.json',
          ),
          'utf8',
        ),
      ).resolves.toContain('vn-engine-runtime');
      const metadata = JSON.parse(
        await readFile(
          path.join(
            exportedApplication,
            'resources',
            'vn-game-application.json',
          ),
          'utf8',
        ),
      ) as Record<string, unknown>;
      expect(metadata).toMatchObject({
        format: STANDALONE_APPLICATION_FORMAT,
        productName: 'Windows Story',
        version: '1.2.3',
        appBundleId: 'com.example.windows-story',
      });
    }, 60_000);
  },
);
