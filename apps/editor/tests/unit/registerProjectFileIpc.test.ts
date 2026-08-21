import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackendClient } from '../../src/main/backend/backendClient';
import { registerProjectFileIpc } from '../../src/main/ipc/registerProjectFileIpc';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import {
  FILE_OPERATION_BUSY_MESSAGE,
  FileOperationCoordinator,
} from '../../src/main/window/FileOperationCoordinator';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  createProjectRootInParent: vi.fn(
    async (parentPath: string, projectName: string) =>
      `${parentPath}/${projectName}`,
  ),
  removeProjectRootIfEmpty: vi.fn().mockResolvedValue(undefined),
  projectManifestPath: vi.fn(),
  resolveProjectManifestPath: vi.fn(async (rootPath: string) => ({
    projectRootPath: rootPath,
    projectFilePath: `${rootPath}/project.vn.json`,
  })),
}));

vi.mock('../../src/main/project/ProjectPathPolicy', () => ({
  createProjectRootInParent: storageMocks.createProjectRootInParent,
  removeProjectRootIfEmpty: storageMocks.removeProjectRootIfEmpty,
  projectManifestPath: storageMocks.projectManifestPath,
  resolveProjectManifestPath: storageMocks.resolveProjectManifestPath,
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
}));

storageMocks.createProjectRootInParent.mockImplementation(
  async (parentPath: string, projectName: string) =>
    path.join(parentPath, projectName),
);
storageMocks.resolveProjectManifestPath.mockImplementation(
  async (rootPath: string) => ({
    projectRootPath: rootPath,
    projectFilePath: path.join(rootPath, 'project.vn.json'),
  }),
);
storageMocks.projectManifestPath.mockImplementation(
  (rootPath: string) => path.join(rootPath, 'project.vn.json'),
);

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
    startScreen: {
      title: 'My story',
      backgroundAssetId: null,
      musicAssetId: null,
    },
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
  assets: [],
  session: {
    revision: 2,
    savedRevision: 2,
    isDirty: false,
  },
  sceneId: 'scene-1',
};

function registerWithBackend(request = vi.fn()) {
  const projectFileSession = new ProjectFileSession();
  const editorWindow = {
    setTitle: vi.fn(),
    setDocumentEdited: vi.fn(),
    setRepresentedFilename: vi.fn(),
  };
  const previewProjectRootPath = path.resolve('/projects/My story');
  const assetPreviewService = {
    prepareProjectFile: vi.fn().mockResolvedValue({
      projectFilePath: path.join(previewProjectRootPath, 'project.vn.json'),
      projectRootPath: previewProjectRootPath,
      projectId: 'project-1',
      assets: new Map(),
      manifestContents: '{"format":"vn-engine-project"}',
    }),
    activateProjectFile: vi.fn().mockResolvedValue(true),
    validateProjectSnapshotAtRoot: vi.fn().mockResolvedValue(undefined),
  };
  const projectStorageSession = {
    backendSavePath: vi.fn(async (rootPath: string) =>
      path.join(rootPath, 'project.vn.json'),
    ),
    publishSavedProject: vi.fn().mockResolvedValue(
      '{"format":"vn-engine-project"}',
    ),
    completeSuccessfulSave: vi.fn().mockResolvedValue(undefined),
    discardTemporaryWorkspace: vi.fn().mockResolvedValue(undefined),
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
        fileOperationCoordinator: new FileOperationCoordinator(),
      },
    ],
  ]) as unknown as EditorWindowContexts;
  const openNewProjectWindow = vi.fn().mockResolvedValue(undefined);

  registerProjectFileIpc(
    contexts,
    new Map([[7, 'file:///editor/index.html']]),
    openNewProjectWindow,
  );

  return {
    request,
    assetPreviewService,
    projectStorageSession,
    projectFileSession,
    openNewProjectWindow,
    handler: electronMocks.handle.mock.calls[0][1] as RegisteredHandler,
  };
}

function trustedEvent() {
  const mainFrame = { url: 'file:///editor/index.html' };
  const sender = { id: 7, mainFrame };
  return { sender, senderFrame: mainFrame };
}

describe('project folder IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a project in a new window without replacing this window', async () => {
    const { handler, request, openNewProjectWindow } =
      registerWithBackend();

    await expect(
      handler(trustedEvent(), {
        action: 'create',
        params: { name: 'Second story' },
      }),
    ).resolves.toEqual({ opened: true });
    expect(openNewProjectWindow).toHaveBeenCalledWith(
      'Second story',
      expect.any(Object),
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('returns a path-free cancellation snapshot', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const { handler, request } = registerWithBackend();

    await expect(
      handler(trustedEvent(), { action: 'open', params: {} }),
    ).resolves.toEqual({
      cancelled: true,
      session: {
        hasStorage: false,
        projectFolderName: null,
        revision: 0,
        savedRevision: null,
        isDirty: false,
      },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('opens only project.vn.json inside the selected directory', async () => {
    const rootPath = path.resolve('/projects/My story');
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [rootPath],
    });
    const request = vi.fn().mockResolvedValue(projectResult);
    const { handler, assetPreviewService, projectFileSession } =
      registerWithBackend(request);

    await expect(
      handler(trustedEvent(), { action: 'open', params: {} }),
    ).resolves.toMatchObject({
      cancelled: false,
      session: {
        hasStorage: true,
        projectFolderName: 'My story',
        isDirty: false,
      },
    });
    expect(request).toHaveBeenCalledWith({
      method: 'project.open',
      params: { contents: '{"format":"vn-engine-project"}' },
    });
    expect(assetPreviewService.prepareProjectFile).toHaveBeenCalledWith(
      path.join(rootPath, 'project.vn.json'),
    );
    expect(
      storageMocks.resolveProjectManifestPath,
    ).toHaveBeenCalledWith(rootPath);
    expect(projectFileSession.getSavedManifestSha256()).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('does not replace the current project when folder validation fails', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/projects/not-a-project'],
    });
    storageMocks.resolveProjectManifestPath.mockRejectedValueOnce(
      new Error('missing project.vn.json'),
    );
    const { handler, request } = registerWithBackend();

    await expect(
      handler(trustedEvent(), { action: 'open', params: {} }),
    ).rejects.toThrow('无法安全读取');
    expect(request).not.toHaveBeenCalled();
  });

  it('creates a named child folder on first save', async () => {
    const parentPath = path.resolve('/projects');
    const rootPath = path.join(parentPath, 'My story');
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [parentPath],
    });
    const request = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectStorageSession, projectFileSession } =
      registerWithBackend(request);

    await expect(
      handler(trustedEvent(), { action: 'save', params: {} }),
    ).resolves.toMatchObject({
      cancelled: false,
      session: {
        hasStorage: true,
        projectFolderName: 'My story',
        isDirty: false,
      },
    });
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'project.get',
      params: {},
    });
    expect(storageMocks.createProjectRootInParent).toHaveBeenCalledWith(
      parentPath,
      'My story',
    );
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'project.save',
      params: { filePath: path.join(rootPath, 'project.vn.json') },
    });
    expect(projectStorageSession.publishSavedProject).toHaveBeenCalledWith(
      path.join(rootPath, 'project.vn.json'),
      rootPath,
      expect.any(Function),
    );
    expect(projectFileSession.getSavedManifestSha256()).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('reuses the Main-private project root on later saves', async () => {
    const rootPath = path.resolve('/projects/My story');
    const request = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession } = registerWithBackend(request);
    projectFileSession.markOpened(rootPath, {
      revision: 1,
      savedRevision: 1,
      isDirty: true,
    });

    await handler(trustedEvent(), { action: 'save', params: {} });

    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      method: 'project.save',
      params: { filePath: path.join(rootPath, 'project.vn.json') },
    });
  });

  it('keeps the logical session dirty when publication fails', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [path.resolve('/projects')],
    });
    const request = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession, projectStorageSession } =
      registerWithBackend(request);
    projectFileSession.updateEngineSession({
      revision: 2,
      savedRevision: null,
      isDirty: true,
    });
    projectStorageSession.publishSavedProject.mockRejectedValue(
      new Error('disk full'),
    );

    await expect(
      handler(trustedEvent(), { action: 'save', params: {} }),
    ).rejects.toThrow('原项目和临时资源均已保留');
    expect(projectFileSession.snapshot()).toMatchObject({
      hasStorage: false,
      isDirty: true,
    });
    expect(storageMocks.removeProjectRootIfEmpty).toHaveBeenCalledWith(
      path.resolve('/projects/My story'),
    );
  });

  it('serializes open and save while a native dialog is pending', async () => {
    let finishDialog: (
      selection: { canceled: boolean; filePaths: string[] },
    ) => void = () => {};
    electronMocks.showOpenDialog.mockReturnValue(
      new Promise((resolve) => {
        finishDialog = resolve;
      }),
    );
    const { handler } = registerWithBackend();

    const opening = handler(trustedEvent(), {
      action: 'open',
      params: {},
    });
    await vi.waitFor(() => {
      expect(electronMocks.showOpenDialog).toHaveBeenCalledOnce();
    });
    await expect(
      handler(trustedEvent(), { action: 'save', params: {} }),
    ).rejects.toThrow(FILE_OPERATION_BUSY_MESSAGE);
    finishDialog({ canceled: true, filePaths: [] });
    await expect(opening).resolves.toMatchObject({ cancelled: true });
  });

  it('rejects Renderer paths and untrusted frames', async () => {
    const { handler, request } = registerWithBackend();

    await expect(
      handler(trustedEvent(), {
        action: 'open',
        params: { filePath: '/tmp/project.vn.json' },
      }),
    ).rejects.toThrow('无效的项目文件请求');

    const mainFrame = { url: 'file:///editor/index.html' };
    await expect(
      handler(
        {
          sender: { id: 7, mainFrame },
          senderFrame: {},
        },
        { action: 'save', params: {} },
      ),
    ).rejects.toThrow('非编辑器主页面');
    expect(request).not.toHaveBeenCalled();
  });
});
