import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackendClient } from '../../src/main/backend/backendClient';
import { registerProjectFileIpc } from '../../src/main/ipc/registerProjectFileIpc';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';
import { PROJECT_FILE_IPC_CHANNEL } from '../../src/shared/projectFileProtocol';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  dialog: {
    showOpenDialog: electronMocks.showOpenDialog,
    showSaveDialog: electronMocks.showSaveDialog,
  },
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
        nodes: [],
      },
    ],
  },
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
  const contexts = new Map([
    [
      7,
      {
        editorWindow,
        backendClient: { request } as unknown as BackendClient,
        projectFileSession,
      },
    ],
  ]) as unknown as EditorWindowContexts;
  const openNewProjectWindow = vi.fn().mockResolvedValue(undefined);

  registerProjectFileIpc(
    contexts,
    new Map([[7, 'file:///editor/index.html']]),
    openNewProjectWindow,
  );

  expect(electronMocks.handle).toHaveBeenCalledWith(
    PROJECT_FILE_IPC_CHANNEL,
    expect.any(Function),
  );

  return {
    request,
    editorWindow,
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

describe('project file IPC', () => {
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

  it('returns a cancellation result without touching C++', async () => {
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
        filePath: null,
        revision: 0,
        savedRevision: null,
        isDirty: false,
      },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('opens only the path selected by the native dialog', async () => {
    const filePath = '/projects/My story/project.vn.json';
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [filePath],
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler } = registerWithBackend(backendRequest);

    await expect(
      handler(trustedEvent(), { action: 'open', params: {} }),
    ).resolves.toEqual({
      cancelled: false,
      result: projectResult,
      session: {
        filePath,
        ...projectResult.session,
      },
    });
    expect(backendRequest).toHaveBeenCalledWith({
      method: 'project.open',
      params: { filePath },
    });
  });

  it('saves an unsaved project to a native-dialog path', async () => {
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: '/projects/My story/project.vn.json',
    });
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler } = registerWithBackend(backendRequest);

    await expect(
      handler(trustedEvent(), { action: 'save', params: {} }),
    ).resolves.toMatchObject({
      cancelled: false,
      session: {
        filePath: '/projects/My story/project.vn.json',
        isDirty: false,
      },
    });
    expect(backendRequest).toHaveBeenCalledWith({
      method: 'project.save',
      params: { filePath: '/projects/My story/project.vn.json' },
    });
  });

  it('reuses the current path on later saves without another dialog', async () => {
    const filePath = '/projects/My story/project.vn.json';
    const backendRequest = vi.fn().mockResolvedValue(projectResult);
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(filePath, {
      revision: 1,
      savedRevision: 1,
      isDirty: true,
    });

    await handler(trustedEvent(), { action: 'save', params: {} });

    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
    expect(backendRequest).toHaveBeenCalledWith({
      method: 'project.save',
      params: { filePath },
    });
  });

  it('keeps the previous path and dirty state when save fails', async () => {
    const filePath = '/projects/My story/project.vn.json';
    const backendRequest = vi
      .fn()
      .mockRejectedValue(new Error('disk full'));
    const { handler, projectFileSession } =
      registerWithBackend(backendRequest);
    projectFileSession.markOpened(filePath, {
      revision: 4,
      savedRevision: 3,
      isDirty: true,
    });

    await expect(
      handler(trustedEvent(), { action: 'save', params: {} }),
    ).rejects.toThrow('disk full');
    expect(projectFileSession.snapshot()).toEqual({
      filePath,
      revision: 4,
      savedRevision: 3,
      isDirty: true,
    });
  });

  it('rejects Renderer paths and non-project JSON files', async () => {
    const { handler, request } = registerWithBackend();

    await expect(
      handler(trustedEvent(), {
        action: 'open',
        params: { filePath: '/tmp/project.vn.json' },
      }),
    ).rejects.toThrow('无效的项目文件请求');

    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/projects/other.json'],
    });
    await expect(
      handler(trustedEvent(), { action: 'open', params: {} }),
    ).rejects.toThrow('请选择名为 project.vn.json');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects requests from an untrusted frame', async () => {
    const { handler, request } = registerWithBackend();
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
    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
    expect(electronMocks.showSaveDialog).not.toHaveBeenCalled();
  });
});
