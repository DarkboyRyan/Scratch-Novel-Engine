import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  broadcastEditorSettings,
  registerEditorSettingsIpc,
} from '../../src/main/ipc/registerEditorSettingsIpc';
import type { EditorWindowContexts } from '../../src/main/window/EditorWindowContext';
import { EDITOR_SETTINGS_IPC_CHANNEL } from '../../src/shared/editorSettingsProtocol';

const electronMocks = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
}));

type RegisteredHandler = (event: unknown, invocation: unknown) => Promise<unknown>;

function trustedEvent(senderId = 7) {
  const mainFrame = { url: 'file:///editor/index.html' };
  const sender = { id: senderId, mainFrame };
  return { sender, senderFrame: mainFrame };
}

function register() {
  const sends = [vi.fn(), vi.fn()];
  const contexts = new Map([7, 8].map((id, index) => [
    id,
    {
      editorWindow: {
        isDestroyed: () => false,
        webContents: { send: sends[index] },
      },
    },
  ])) as unknown as EditorWindowContexts;
  const controller = {
    getSettings: vi.fn().mockResolvedValue({
      status: 'ready',
      settings: { settingsVersion: 1, language: 'zh-CN' },
    }),
    updateSettings: vi.fn().mockResolvedValue({
      status: 'updated',
      settings: { settingsVersion: 1, language: 'en-US' },
    }),
  };
  registerEditorSettingsIpc(
    contexts,
    new Map([
      [7, 'file:///editor/index.html'],
      [8, 'file:///editor/index.html'],
    ]),
    controller,
  );
  expect(electronMocks.handle).toHaveBeenCalledWith(
    EDITOR_SETTINGS_IPC_CHANNEL,
    expect.any(Function),
  );
  return {
    contexts,
    controller,
    sends,
    handler: electronMocks.handle.mock.calls[0][1] as RegisteredHandler,
  };
}

describe('Editor settings IPC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts only exact settings requests from a trusted main frame', async () => {
    const { handler, controller } = register();
    await expect(handler(trustedEvent(), {
      action: 'update-settings',
      params: { patch: { language: 'en-US' } },
    })).resolves.toMatchObject({ status: 'updated' });
    expect(controller.updateSettings).toHaveBeenCalledWith({ language: 'en-US' });

    await expect(handler(trustedEvent(), {
      action: 'update-settings',
      params: { patch: { language: 'en-US', path: '/tmp/injected' } },
    })).rejects.toThrow('invalid Editor settings request');
    await expect(handler({
      ...trustedEvent(),
      senderFrame: { url: 'https://attacker.invalid/' },
    }, {
      action: 'get-settings',
      params: {},
    })).rejects.toThrow('untrusted frame');
  });

  it('broadcasts a path-free snapshot to every active Editor window', () => {
    const { contexts, sends } = register();
    broadcastEditorSettings(contexts, {
      settingsVersion: 1,
      language: 'en-US',
    });
    for (const send of sends) {
      expect(send).toHaveBeenCalledWith('vn-editor-settings:changed', {
        settingsVersion: 1,
        language: 'en-US',
      });
    }
  });
});
