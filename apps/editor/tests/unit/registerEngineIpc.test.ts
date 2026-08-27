/**
 * 文件主要作用：验证 engine IPC transaction boundary 的行为。
 * 测试覆盖：`engine IPC transaction boundary`。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BackendClient } from '../../src/main/backend/backendClient';
import { registerEngineIpc } from '../../src/main/ipc/registerEngineIpc';
import { ProjectFileSession } from '../../src/main/project/ProjectFileSession';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import {
  FILE_OPERATION_BUSY_MESSAGE,
  FileOperationCoordinator,
} from '../../src/main/window/FileOperationCoordinator';

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
}));

type RegisteredHandler = (
  event: unknown,
  invocation: unknown,
) => Promise<unknown>;

function trustedEvent() {
  const mainFrame = { url: 'file:///editor/index.html' };
  const sender = { id: 7, mainFrame };
  return { sender, senderFrame: mainFrame };
}

describe('engine IPC transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an editor mutation while a file transaction owns the window', async () => {
    const coordinator = new FileOperationCoordinator();
    const request = vi.fn();
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
          projectFileSession: new ProjectFileSession(),
          fileOperationCoordinator: coordinator,
        },
      ],
    ]) as unknown as EditorWindowContexts;
    registerEngineIpc(
      contexts,
      new Map([[7, 'file:///editor/index.html']]),
    );
    const handler = electronMocks.handle.mock.calls[0][1] as RegisteredHandler;

    let releaseTransaction: (() => void) | undefined;
    const heldTransaction = coordinator.runExclusive(
      () => new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      }),
    );
    await Promise.resolve();

    await expect(
      handler(trustedEvent(), {
        method: 'project.rename',
        params: { name: 'must wait' },
      }),
    ).rejects.toThrow(FILE_OPERATION_BUSY_MESSAGE);
    expect(request).not.toHaveBeenCalled();

    releaseTransaction?.();
    await heldTransaction;
  });
});
