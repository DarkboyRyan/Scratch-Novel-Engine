/**
 * 文件主要作用：封装编辑器设置的读取、更新、订阅和重启错误处理。
 * 包含实现：`EditorSettingsRestartRequiredError`、`isEditorSettingsRestartRequiredError`、`readEditorSettings`、`updateEditorSettings`、`subscribeEditorSettings`。
 */

import type {
  EditorSettings,
  EditorSettingsPatch,
  EditorSettingsReadResult,
  EditorSettingsWriteResult,
  VnEditorSettingsApi,
} from '../../shared/editorSettingsProtocol';
import { EDITOR_SETTINGS_IPC_CHANNEL } from '../../shared/editorSettingsProtocol';

/**
 * The Vite development server can reload Renderer/Preload code while the
 * already-running Electron Main process still has the previous IPC table.
 * In that state retrying a settings write cannot succeed; a full application
 * restart is required to load the matching Main/Preload pair.
 */
export class EditorSettingsRestartRequiredError extends Error {
  override readonly name = 'EditorSettingsRestartRequiredError';

  constructor() {
    super('Editor settings IPC is unavailable until the Editor restarts');
  }
}

function isSettingsApi(value: unknown): value is VnEditorSettingsApi {
  return typeof value === 'object' &&
    value !== null &&
    'getSettings' in value &&
    typeof value.getSettings === 'function' &&
    'updateSettings' in value &&
    typeof value.updateSettings === 'function' &&
    'onChanged' in value &&
    typeof value.onChanged === 'function';
}

function settingsApi(): VnEditorSettingsApi {
  const candidate: unknown = window.vnEditorSettings;
  if (!isSettingsApi(candidate)) {
    throw new EditorSettingsRestartRequiredError();
  }
  return candidate;
}

function asGatewayError(error: unknown): unknown {
  if (error instanceof EditorSettingsRestartRequiredError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('No handler registered') &&
    message.includes(EDITOR_SETTINGS_IPC_CHANNEL)
  ) {
    return new EditorSettingsRestartRequiredError();
  }
  return error;
}

function invokeSettings<Result>(
  invocation: (api: VnEditorSettingsApi) => Promise<Result>,
): Promise<Result> {
  try {
    return invocation(settingsApi()).catch((error: unknown) =>
      Promise.reject(asGatewayError(error)));
  } catch (error) {
    return Promise.reject(asGatewayError(error));
  }
}

export function isEditorSettingsRestartRequiredError(
  error: unknown,
): error is EditorSettingsRestartRequiredError {
  return error instanceof EditorSettingsRestartRequiredError;
}

export function readEditorSettings(): Promise<EditorSettingsReadResult> {
  return invokeSettings((api) => api.getSettings());
}

export function updateEditorSettings(
  patch: EditorSettingsPatch,
): Promise<EditorSettingsWriteResult> {
  return invokeSettings((api) => api.updateSettings(patch));
}

export function subscribeEditorSettings(
  listener: (settings: EditorSettings) => void,
): () => void {
  try {
    return settingsApi().onChanged(listener);
  } catch (error) {
    throw asGatewayError(error);
  }
}
