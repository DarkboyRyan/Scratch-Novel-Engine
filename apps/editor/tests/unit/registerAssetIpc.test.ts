import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackendClient } from '../../src/main/backend/backendClient';
import { registerAssetIpc } from '../../src/main/ipc/registerAssetIpc';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import {
  FILE_OPERATION_BUSY_MESSAGE,
  FileOperationCoordinator,
} from '../../src/main/window/FileOperationCoordinator';
import { ASSET_IPC_CHANNEL } from '../../src/shared/assetProtocol';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
}));

type RegisteredHandler = (
  event: unknown,
  invocation: unknown,
) => Promise<unknown>;

const projectResult: EngineMutationResult = {
  project: {
    schemaVersion: 1,
    id: 'project-1',
    name: 'My story',
    entrySceneId: 'scene-1',
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-1',
        name: 'Scene 1',
        backgroundAssetId: null,
        nodes: [],
      },
    ],
  },
  assets: [
    {
      id: 'asset-1',
      type: 'image',
      displayName: 'portrait.png',
    },
  ],
  session: {
    revision: 3,
    savedRevision: 2,
    isDirty: true,
  },
  assetId: 'asset-1',
};

function registerWithBackend(request = vi.fn()) {
  const projectFileSession = new ProjectFileSession();
  const editorWindow = {
    setTitle: vi.fn(),
    setDocumentEdited: vi.fn(),
    setRepresentedFilename: vi.fn(),
  };
  const fileOperationCoordinator = new FileOperationCoordinator();
  const assetPreviewService = {
    getPreviewUrl: vi.fn((assetId: string) =>
      assetId === 'asset-1'
        ? 'vn-asset://image/token/asset-1'
        : null,
    ),
    activateTemporaryProject: vi.fn().mockResolvedValue(true),
    registerImportedAsset: vi.fn(() => true),
  };
  const projectStorageSession = {
    assetImportLocation: vi.fn(
      async (projectRootPath: string | null) =>
        projectRootPath
          ? {
              backendProjectFilePath: `${projectRootPath}/project.vn.json`,
              previewProjectFilePath: `${projectRootPath}/project.vn.json`,
              isTemporary: false,
            }
          : {
              backendProjectFilePath:
                '/private/temp/workspace/project.vn.json',
              previewProjectFilePath:
                '/private/temp/workspace/project.vn.json',
              isTemporary: true,
            },
    ),
  };
  const contexts = new Map([
    [
      7,
      {
        editorWindow,
        backendClient: { request } as unknown as BackendClient,
        assetPreviewService,
        projectFileSession,
        projectStorageSession,
        fileOperationCoordinator,
      },
    ],
  ]) as unknown as EditorWindowContexts;

  registerAssetIpc(
    contexts,
    new Map([[7, 'file:///editor/index.html']]),
  );

  expect(electronMocks.handle).toHaveBeenCalledWith(
    ASSET_IPC_CHANNEL,
    expect.any(Function),
  );

  return {
    request,
    assetPreviewService,
    projectStorageSession,
    projectFileSession,
    fileOperationCoordinator,
    handler: electronMocks.handle.mock.calls[0][1] as RegisteredHandler,
  };
}

function trustedEvent() {
  const mainFrame = { url: 'file:///editor/index.html' };
  const sender = { id: 7, mainFrame };

  return { sender, senderFrame: mainFrame };
}

describe('asset IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only an opaque preview URL for a known asset ID', async () => {
    const { handler, request, assetPreviewService } =
      registerWithBackend();

    await expect(
      handler(trustedEvent(), {
        action: 'get-preview-url',
        params: { assetId: 'asset-1' },
      }),
    ).resolves.toBe('vn-asset://image/token/asset-1');
    await expect(
      handler(trustedEvent(), {
        action: 'get-preview-url',
        params: { assetId: 'missing' },
      }),
    ).resolves.toBeNull();

    expect(assetPreviewService.getPreviewUrl).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
  });

  it('imports into private temporary storage while the project is unsaved', async () => {
    const sourceFilePath = '/Users/example/Pictures/portrait.png';
    const temporaryProjectFilePath =
      '/private/temp/workspace/project.vn.json';
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceFilePath],
    });
    const beforeImport = {
      ...projectResult,
      assets: [],
      assetId: undefined,
      session: {
        revision: 2,
        savedRevision: null,
        isDirty: true,
      },
    };
    const backendRequest = vi
      .fn()
      .mockResolvedValueOnce(beforeImport)
      .mockResolvedValueOnce(beforeImport)
      .mockResolvedValueOnce(projectResult);
    const {
      handler,
      assetPreviewService,
      projectStorageSession,
      projectFileSession,
    } = registerWithBackend(backendRequest);

    const response = await handler(trustedEvent(), {
      action: 'import-image',
      params: {},
    });

    expect(response).toMatchObject({
      status: 'imported',
      result: {
        session: {
          revision: 3,
          savedRevision: null,
          isDirty: true,
        },
      },
    });
    expect(JSON.stringify(response)).not.toContain(sourceFilePath);
    expect(JSON.stringify(response)).not.toContain(
      temporaryProjectFilePath,
    );
    expect(projectStorageSession.assetImportLocation).toHaveBeenCalledWith(
      null,
    );
    expect(
      assetPreviewService.activateTemporaryProject,
    ).toHaveBeenCalledWith(temporaryProjectFilePath, beforeImport);
    expect(backendRequest).toHaveBeenLastCalledWith({
      method: 'asset.import',
      params: {
        kind: 'image',
        sourceFilePath,
        projectFilePath: temporaryProjectFilePath,
      },
    });
    expect(projectFileSession.snapshot()).toMatchObject({
      hasStorage: false,
      projectFolderName: null,
      savedRevision: null,
      isDirty: true,
    });
  });

  it('does not create temporary storage when unsaved import is cancelled', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectStorageSession } =
      registerWithBackend(backendRequest);

    await expect(
      handler(trustedEvent(), {
        action: 'import-image',
        params: {},
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(
      projectStorageSession.assetImportLocation,
    ).not.toHaveBeenCalled();
  });

  it('returns a discriminated cancellation without importing', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened('/projects/story', {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });

    await expect(
      handler(trustedEvent(), {
        action: 'import-image',
        params: {},
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(backendRequest).toHaveBeenCalledTimes(1);
    expect(backendRequest).toHaveBeenCalledWith({
      method: 'project.get',
      params: {},
    });
  });

  it('keeps native paths in Main and imports into the captured project', async () => {
    const projectRootPath = '/projects/story';
    const projectFilePath = `${projectRootPath}/project.vn.json`;
    const sourceFilePath = '/Users/example/Pictures/portrait.png';
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceFilePath],
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(projectRootPath, {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });

    const response = await handler(trustedEvent(), {
      action: 'import-image',
      params: {},
    });

    expect(response).toEqual({ status: 'imported', result: projectResult });
    expect(JSON.stringify(response)).not.toContain(sourceFilePath);
    expect(JSON.stringify(response)).not.toContain(projectFilePath);
    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        properties: ['openFile'],
        filters: [
          {
            name: '图片',
            extensions: ['png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      }),
    );
    expect(backendRequest.mock.calls).toEqual([
      [{ method: 'project.get', params: {} }],
      [{ method: 'project.get', params: {} }],
      [
        {
          method: 'asset.import',
          params: { kind: 'image', sourceFilePath, projectFilePath },
        },
      ],
    ]);
    expect(projectFileSession.snapshot()).toEqual({
      hasStorage: true,
      projectFolderName: 'story',
      ...projectResult.session,
    });
  });

  it('selects and imports MP4/WebM video without exposing native paths', async () => {
    const projectRootPath = '/projects/story';
    const projectFilePath = `${projectRootPath}/project.vn.json`;
    const sourceFilePath = '/Users/example/Movies/opening.mp4';
    const videoResult: EngineMutationResult = {
      ...projectResult,
      assets: [
        {
          id: 'video-1',
          type: 'video',
          displayName: 'opening.mp4',
        },
      ],
      assetId: 'video-1',
    };
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceFilePath],
    });
    const backendRequest = vi.fn().mockResolvedValue(videoResult);
    const { handler, projectFileSession, assetPreviewService } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(projectRootPath, projectResult.session);

    const response = await handler(trustedEvent(), {
      action: 'import-video',
      params: {},
    });

    expect(response).toEqual({ status: 'imported', result: videoResult });
    expect(JSON.stringify(response)).not.toContain(sourceFilePath);
    expect(JSON.stringify(response)).not.toContain(projectFilePath);
    expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        title: '导入视频资源',
        buttonLabel: '导入视频',
        properties: ['openFile'],
        filters: [{ name: '视频', extensions: ['mp4', 'webm'] }],
      }),
    );
    expect(backendRequest).toHaveBeenLastCalledWith({
      method: 'asset.import',
      params: { kind: 'video', sourceFilePath, projectFilePath },
    });
    expect(assetPreviewService.registerImportedAsset).toHaveBeenCalledWith(
      projectFilePath,
      sourceFilePath,
      expect.objectContaining({ assetId: 'video-1' }),
    );
  });

  it('imports beside a custom manifest through C++ fixed-name path without exposing it', async () => {
    const logicalProjectRootPath = '/projects/story';
    const logicalProjectFilePath = '/projects/story/project.vn.json';
    const backendProjectFilePath =
      '/projects/story/project.vn.json';
    const sourceFilePath = '/Users/example/Pictures/portrait.png';
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceFilePath],
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const {
      handler,
      projectFileSession,
      projectStorageSession,
      assetPreviewService,
    } = registerWithBackend(backendRequest);
    projectFileSession.markOpened(logicalProjectRootPath, {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });
    projectStorageSession.assetImportLocation.mockResolvedValue({
      backendProjectFilePath,
      previewProjectFilePath: logicalProjectFilePath,
      isTemporary: false,
    });

    const response = await handler(trustedEvent(), {
      action: 'import-image',
      params: {},
    });

    expect(JSON.stringify(response)).not.toContain(
      backendProjectFilePath,
    );
    expect(backendRequest).toHaveBeenLastCalledWith({
      method: 'asset.import',
      params: {
        kind: 'image',
        sourceFilePath,
        projectFilePath: backendProjectFilePath,
      },
    });
    expect(
      assetPreviewService.registerImportedAsset,
    ).toHaveBeenCalledWith(
      logicalProjectFilePath,
      sourceFilePath,
      expect.any(Object),
    );
  });

  it('rejects path injection and untrusted frames before native I/O', async () => {
    const { handler, request } = registerWithBackend();

    await expect(
      handler(trustedEvent(), {
        action: 'import-image',
        params: { sourceFilePath: '/tmp/injected.png' },
      }),
    ).rejects.toThrow('无效的资源导入请求');

    const mainFrame = { url: 'file:///editor/index.html' };
    await expect(
      handler(
        {
          sender: { id: 7, mainFrame },
          senderFrame: {},
        },
        { action: 'import-image', params: {} },
      ),
    ).rejects.toThrow('非编辑器主页面');
    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a second operation while the native dialog is pending', async () => {
    let finishDialog: (
      selection: { canceled: boolean; filePaths: string[] },
    ) => void = () => {};
    electronMocks.showOpenDialog.mockReturnValue(
      new Promise((resolve) => {
        finishDialog = resolve;
      }),
    );
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession, fileOperationCoordinator } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened('/projects/story', {
      revision: 2,
      savedRevision: 2,
      isDirty: false,
    });

    const firstImport = handler(trustedEvent(), {
      action: 'import-image',
      params: {},
    });
    await vi.waitFor(() => {
      expect(electronMocks.showOpenDialog).toHaveBeenCalledOnce();
    });

    await expect(
      fileOperationCoordinator.runExclusive(async () => undefined),
    ).rejects.toThrow(FILE_OPERATION_BUSY_MESSAGE);
    finishDialog({ canceled: true, filePaths: [] });
    await expect(firstImport).resolves.toEqual({ status: 'cancelled' });
  });

  it('aborts if the project path changes while the dialog is open', async () => {
    const projectRootPath = '/projects/story';
    electronMocks.showOpenDialog.mockImplementation(
      async () => ({
        canceled: false,
        filePaths: ['/Users/example/Pictures/portrait.png'],
      }),
    );
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(projectRootPath, projectResult.session);
    electronMocks.showOpenDialog.mockImplementationOnce(async () => {
      projectFileSession.markOpened(
        '/projects/other',
        projectResult.session,
      );
      return {
        canceled: false,
        filePaths: ['/Users/example/Pictures/portrait.png'],
      };
    });

    await expect(
      handler(trustedEvent(), {
        action: 'import-image',
        params: {},
      }),
    ).rejects.toThrow('项目文件已变更');
    expect(backendRequest).toHaveBeenCalledTimes(1);
  });

  it('aborts if the backend project identity changes during selection', async () => {
    const changedProject = {
      ...projectResult,
      project: { ...projectResult.project, id: 'project-2' },
    };
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/Users/example/Pictures/portrait.png'],
    });
    const backendRequest = vi
      .fn()
      .mockResolvedValueOnce(projectResult)
      .mockResolvedValueOnce(changedProject);
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(
      '/projects/story',
      projectResult.session,
    );

    await expect(
      handler(trustedEvent(), {
        action: 'import-image',
        params: {},
      }),
    ).rejects.toThrow('当前项目已变更');
    expect(backendRequest).toHaveBeenCalledTimes(2);
  });
});
