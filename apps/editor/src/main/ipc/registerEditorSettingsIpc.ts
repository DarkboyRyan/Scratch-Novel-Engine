// 主要作用：注册 Editor 设置读取、更新和跨窗口广播的 IPC 通道。
// 关键实现：验证调用与来源，broadcastEditorSettings 向可信窗口推送设置。
import { ipcMain } from 'electron';

import {
  EDITOR_SETTINGS_CHANGED_CHANNEL,
  EDITOR_SETTINGS_IPC_CHANNEL,
  isEditorSettingsPatch,
  type EditorSettings,
  type EditorSettingsInvocation,
  type EditorSettingsReadResult,
  type EditorSettingsWriteResult,
} from '../../shared/editorSettingsProtocol';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';

export type EditorSettingsController = {
  getSettings(): Promise<EditorSettingsReadResult>;
  updateSettings(
    patch: Extract<EditorSettingsInvocation, { action: 'update-settings' }>['params']['patch'],
  ): Promise<EditorSettingsWriteResult>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

export function isEditorSettingsInvocation(
  value: unknown,
): value is EditorSettingsInvocation {
  if (
    !isObject(value) ||
    !hasExactFields(value, ['action', 'params']) ||
    !isObject(value.params)
  ) {
    return false;
  }
  if (value.action === 'get-settings') {
    return hasExactFields(value.params, []);
  }
  return value.action === 'update-settings' &&
    hasExactFields(value.params, ['patch']) &&
    isEditorSettingsPatch(value.params.patch);
}

export function broadcastEditorSettings(
  contexts: EditorWindowContexts,
  settings: EditorSettings,
): void {
  for (const context of contexts.values()) {
    if (!context.editorWindow.isDestroyed()) {
      context.editorWindow.webContents.send(
        EDITOR_SETTINGS_CHANGED_CHANNEL,
        { ...settings },
      );
    }
  }
}

export function registerEditorSettingsIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
  controller: EditorSettingsController,
): void {
  ipcMain.handle(
    EDITOR_SETTINGS_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('Rejected an Editor settings request from an untrusted frame');
      }
      if (!isEditorSettingsInvocation(invocation)) {
        throw new Error('Renderer sent an invalid Editor settings request');
      }
      if (!contexts.has(event.sender.id)) {
        throw new Error('Editor settings request has no active window context');
      }
      if (invocation.action === 'get-settings') {
        return controller.getSettings();
      }
      return controller.updateSettings(invocation.params.patch);
    },
  );
}
