import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerExportIpc } from '../../src/main/ipc/registerExportIpc';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import { FileOperationCoordinator } from '../../src/main/window/FileOperationCoordinator';
import {
  EXPORT_GAME_IPC_CHANNEL,
  standaloneApplicationMetadataError,
} from '../../src/shared/exportProtocol';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showSaveDialog: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  exportRuntimeBundle: vi.fn(),
  exportStandaloneApplication: vi.fn(),
  loadStandalonePlayerTemplate: vi.fn(),
  resolveStandalonePlayerTemplateRoot: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => '/packaged/editor.asar' },
  ipcMain: { handle: electronMocks.handle },
  dialog: { showSaveDialog: electronMocks.showSaveDialog },
}));

vi.mock('../../src/main/export/RuntimeBundleExporter', () => ({
  exportRuntimeBundle: exportMocks.exportRuntimeBundle,
}));

vi.mock('../../src/main/export/StandaloneApplicationExporter', () => ({
  exportStandaloneApplication: exportMocks.exportStandaloneApplication,
  verifyStandalonePlayerTemplateSignature: vi.fn(),
}));

vi.mock('../../src/main/export/StandalonePlayerTemplate', () => ({
  loadStandalonePlayerTemplate: exportMocks.loadStandalonePlayerTemplate,
  resolveStandalonePlayerTemplateRoot:
    exportMocks.resolveStandalonePlayerTemplateRoot,
}));

const runtimeInvocation = {
  action: 'export',
  params: { output: 'runtime-bundle' },
} as const;

const standaloneInvocation = {
  action: 'export',
  params: {
    output: 'standalone-application',
    application: {
      name: 'Custom Story',
      version: '1.2.3',
      applicationId: 'com.example.custom-story',
    },
  },
} as const;

type RegisteredHandler = (
  event: unknown,
  invocation: unknown,
) => Promise<unknown>;

function projectResult(revision = 3) {
  return {
    project: {
      schemaVersion: 1 as const,
      id: 'project-1',
      name: 'My / Story',
      entrySceneId: 'scene-1',
      scenes: [
        {
          schemaVersion: 1 as const,
          id: 'scene-1',
          name: 'Scene 1',
          backgroundAssetId: null,
          nodes: [],
        },
      ],
    },
    assets: [],
    session: {
      revision,
      savedRevision: revision,
      isDirty: false,
    },
  };
}

function registerSession(options: { saved?: boolean; dirty?: boolean } = {}) {
  const projectFileSession = new ProjectFileSession();
  if (options.saved) {
    projectFileSession.markOpened(
      '/projects/My Story',
      {
        revision: 3,
        savedRevision: 3,
        isDirty: false,
      },
      '{"format":"vn-engine-project"}\n',
    );
    if (options.dirty) {
      projectFileSession.updateEngineSession({
        revision: 4,
        savedRevision: 3,
        isDirty: true,
      });
    }
  }
  const request = vi.fn().mockResolvedValue(
    projectResult(options.dirty ? 4 : 3),
  );
  const contexts = new Map([
    [
      7,
      {
        editorWindow: {},
        backendClient: { request },
        projectFileSession,
        fileOperationCoordinator: new FileOperationCoordinator(),
      },
    ],
  ]) as unknown as EditorWindowContexts;

  registerExportIpc(
    contexts,
    new Map([[7, 'file:///editor/index.html']]),
  );
  return {
    request,
    projectFileSession,
    channel: electronMocks.handle.mock.calls[0][0] as string,
    handler: electronMocks.handle.mock.calls[0][1] as RegisteredHandler,
  };
}

function trustedEvent() {
  const mainFrame = { url: 'file:///editor/index.html' };
  const sender = { id: 7, mainFrame };
  return { sender, senderFrame: mainFrame };
}

describe('game export IPC', () => {
  it('counts application names by Unicode code point and caps versions at 32 characters', () => {
    expect(standaloneApplicationMetadataError({
      name: '😀'.repeat(50),
      version: '1.0.0',
      applicationId: 'com.example.unicode',
    })).toBeNull();
    expect(standaloneApplicationMetadataError({
      name: '😀'.repeat(51),
      version: '1.0.0',
      applicationId: 'com.example.unicode',
    })).not.toBeNull();
    expect(standaloneApplicationMetadataError({
      name: `${'😀'.repeat(20)}${'中'.repeat(60)}`,
      version: '1.0.0',
      applicationId: 'com.example.unicode',
    })).not.toBeNull();
    expect(standaloneApplicationMetadataError({
      name: '中'.repeat(80),
      version: '1.0.0',
      applicationId: 'com.example.unicode',
    })).toBeNull();
    expect(standaloneApplicationMetadataError({
      name: 'Story',
      version: `${'1'.repeat(30)}.1.1`,
      applicationId: 'com.example.unicode',
    })).not.toBeNull();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    exportMocks.exportRuntimeBundle.mockResolvedValue({
      bundleName: 'Custom.vngame',
      buildId: 'private-build-id',
      sourceRevision: 3,
      assetCount: 2,
    });
    exportMocks.exportStandaloneApplication.mockResolvedValue({
      artifactName:
        process.platform === 'darwin'
          ? 'Custom Story-macOS.zip'
          : 'Custom Story',
      buildId: 'private-standalone-build-id',
      sourceRevision: 3,
      assetCount: 2,
      platform: process.platform,
      arch: process.arch,
    });
    exportMocks.resolveStandalonePlayerTemplateRoot.mockReturnValue(
      '/templates/current',
    );
    exportMocks.loadStandalonePlayerTemplate.mockResolvedValue({});
  });

  it('registers the dedicated channel and rejects paths or unknown fields', async () => {
    const { channel, handler } = registerSession({ saved: true });
    expect(channel).toBe(EXPORT_GAME_IPC_CHANNEL);

    await expect(
      handler(trustedEvent(), {
        action: 'export',
        params: { output: 'runtime-bundle', outputPath: '/tmp/game.vngame' },
      }),
    ).rejects.toThrow('无效的游戏导出请求');
    await expect(
      handler(trustedEvent(), {
        action: 'export',
        params: {},
        path: '/tmp/game.vngame',
      }),
    ).rejects.toThrow('无效的游戏导出请求');
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it('rejects untrusted subframes', async () => {
    const { handler } = registerSession({ saved: true });
    const event = trustedEvent();
    event.senderFrame = { url: 'https://attacker.invalid/' };

    await expect(
      handler(event, runtimeInvocation),
    ).rejects.toThrow('非编辑器主页面');
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it('requires a saved and clean project before opening the dialog', async () => {
    const unsaved = registerSession();
    await expect(
      unsaved.handler(trustedEvent(), runtimeInvocation),
    ).rejects.toThrow('先保存项目');

    vi.clearAllMocks();
    const dirty = registerSession({ saved: true, dirty: true });
    await expect(
      dirty.handler(trustedEvent(), runtimeInvocation),
    ).rejects.toThrow('先保存最新修改');
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it('rejects a clean Main session when the backend snapshot is not saved', async () => {
    const registered = registerSession({ saved: true });
    registered.request.mockResolvedValue({
      ...projectResult(),
      session: {
        revision: 3,
        savedRevision: 2,
        isDirty: true,
      },
    });

    await expect(
      registered.handler(
        trustedEvent(),
        runtimeInvocation,
      ),
    ).rejects.toThrow('版本与已保存版本不一致');
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it('returns a path-free cancellation without invoking the writer', async () => {
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: true,
      filePath: undefined,
    });
    const { handler } = registerSession({ saved: true });

    await expect(
      handler(trustedEvent(), runtimeInvocation),
    ).resolves.toEqual({ cancelled: true });
    expect(exportMocks.exportRuntimeBundle).not.toHaveBeenCalled();
  });

  it('normalizes the native filename and returns no path or build ID', async () => {
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/Custom',
    });
    const { handler } = registerSession({ saved: true });

    await expect(
      handler(trustedEvent(), runtimeInvocation),
    ).resolves.toEqual({
      cancelled: false,
      output: 'runtime-bundle',
      artifactName: 'Custom.vngame',
      sourceRevision: 3,
      assetCount: 2,
    });
    expect(electronMocks.showSaveDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        defaultPath: '/projects/My - Story.vngame',
        filters: [{ name: 'VN Game Bundle', extensions: ['vngame'] }],
      }),
    );
    expect(exportMocks.exportRuntimeBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceProjectRootPath: '/projects/My Story',
        targetBundlePath: '/exports/Custom.vngame',
        sourceRevision: 3,
        expectedProject: projectResult().project,
        expectedAssets: [],
        expectedManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    const response = await handler(
      trustedEvent(),
      runtimeInvocation,
    );
    expect(JSON.stringify(response)).not.toContain('/exports');
    expect(response).not.toHaveProperty('buildId');
  });

  it('fails closed if the logical revision changes after target selection', async () => {
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/exports/Changed.vngame',
    });
    const registered = registerSession({ saved: true });
    exportMocks.exportRuntimeBundle.mockImplementation(
      async (options: {
        assertSourceStillCurrent?: () => void | Promise<void>;
      }) => {
        registered.projectFileSession.updateEngineSession({
          revision: 4,
          savedRevision: 3,
          isDirty: true,
        });
        await options.assertSourceStillCurrent?.();
        throw new Error('expected revision guard to fail');
      },
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      registered.handler(
        trustedEvent(),
        runtimeInvocation,
      ),
    ).rejects.toThrow('源项目和已有导出内容均未修改');
  });

  it.runIf(process.platform === 'darwin')(
    'exports a macOS ZIP from validated path-free metadata',
    async () => {
      electronMocks.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/exports/Custom Story',
      });
      const { handler } = registerSession({ saved: true });

      await expect(handler(trustedEvent(), standaloneInvocation)).resolves.toEqual({
        cancelled: false,
        output: 'standalone-application',
        artifactName: 'Custom Story-macOS.zip',
        sourceRevision: 3,
        assetCount: 2,
      });
      expect(electronMocks.showSaveDialog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          defaultPath: '/projects/Custom Story-macOS.zip',
          filters: [expect.objectContaining({ extensions: ['zip'] })],
        }),
      );
      expect(exportMocks.loadStandalonePlayerTemplate).toHaveBeenCalledWith(
        '/templates/current',
      );
      expect(exportMocks.exportStandaloneApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceProjectRootPath: '/projects/My Story',
          targetArtifactPath: '/exports/Custom Story-macOS.zip',
          templateRootPath: '/templates/current',
          sourceRevision: 3,
          application: standaloneInvocation.params.application,
        }),
      );
      expect(
        JSON.stringify(await handler(trustedEvent(), standaloneInvocation)),
      ).not.toContain('/exports');
    },
  );

  it.runIf(process.platform === 'darwin')(
    'normalizes ZIP, prior app, and platform suffixes to one -macOS.zip suffix',
    async () => {
      const { handler } = registerSession({ saved: true });
      for (const [selectedPath, expectedPath] of [
        ['/exports/Custom Package.ZIP', '/exports/Custom Package-macOS.zip'],
        ['/exports/Already-macOS.ZIP', '/exports/Already-macOS.zip'],
        ['/exports/Legacy.app', '/exports/Legacy-macOS.zip'],
      ] as const) {
        electronMocks.showSaveDialog.mockResolvedValueOnce({
          canceled: false,
          filePath: selectedPath,
        });

        await handler(trustedEvent(), standaloneInvocation);

        expect(exportMocks.exportStandaloneApplication).toHaveBeenLastCalledWith(
          expect.objectContaining({ targetArtifactPath: expectedPath }),
        );
      }
    },
  );

  it.runIf(process.platform === 'darwin')(
    'keeps the default ZIP filename within the macOS UTF-8 component budget',
    async () => {
      electronMocks.showSaveDialog.mockResolvedValue({
        canceled: true,
        filePath: undefined,
      });
      const { handler } = registerSession({ saved: true });

      await handler(trustedEvent(), {
        action: 'export',
        params: {
          output: 'standalone-application',
          application: {
            name: '中'.repeat(80),
            version: '1.0.0',
            applicationId: 'com.example.unicode',
          },
        },
      });

      const dialogOptions = electronMocks.showSaveDialog.mock.calls.at(-1)?.[1] as
        | { defaultPath?: string }
        | undefined;
      expect(dialogOptions?.defaultPath).toMatch(/-macOS\.zip$/u);
      expect(
        Buffer.byteLength(path.basename(dialogOptions?.defaultPath ?? ''), 'utf8'),
      ).toBeLessThanOrEqual(240);
    },
  );

  it('rejects invalid standalone metadata before Main opens a dialog', async () => {
    const { handler } = registerSession({ saved: true });

    await expect(
      handler(trustedEvent(), {
        action: 'export',
        params: {
          output: 'standalone-application',
          application: {
            name: '../escape',
            version: 'latest',
            applicationId: '/tmp/game',
          },
        },
      }),
    ).rejects.toThrow('无效的游戏导出请求');
    for (const version of ['1.0', '1.0.0.0']) {
      await expect(
        handler(trustedEvent(), {
          action: 'export',
          params: {
            output: 'standalone-application',
            application: {
              name: 'Story',
              version,
              applicationId: 'com.example.story',
            },
          },
        }),
      ).rejects.toThrow('无效的游戏导出请求');
    }
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it('reports a stable path-free error when the current template is unavailable', async () => {
    exportMocks.loadStandalonePlayerTemplate.mockRejectedValue(
      new Error('/private/template/player-template.json missing'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = registerSession({ saved: true });

    const failure = handler(trustedEvent(), standaloneInvocation);
    await expect(failure).rejects.toThrow('当前平台的独立 Player 模板不可用');
    await expect(failure).rejects.not.toThrow('/private/template');
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === 'darwin')(
    'keeps archive failures path-free even for a FileProvider target',
    async () => {
      electronMocks.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/private/file-provider/Story-macOS.zip',
      });
      exportMocks.exportStandaloneApplication.mockRejectedValue(
        new Error(
          '/private/file-provider/Story-macOS.zip: archive verification failed',
        ),
      );
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { handler } = registerSession({ saved: true });

      const failure = handler(trustedEvent(), standaloneInvocation);
      await expect(failure).rejects.toThrow(
        '独立应用导出失败，源项目和已有导出内容均未修改',
      );
      await expect(failure).rejects.not.toThrow('/private/file-provider');
    },
  );
});
