// 主要作用：定义 Editor 偏好设置的版本模型、校验器和 IPC API。
// 关键实现：提供默认设置及 isEditorSettings、isEditorSettingsPatch 守卫。
export const EDITOR_SETTINGS_IPC_CHANNEL = 'vn-editor-settings:request';
export const EDITOR_SETTINGS_CHANGED_CHANNEL = 'vn-editor-settings:changed';
export const EDITOR_SETTINGS_VERSION = 2 as const;

export type EditorLanguage = 'zh-CN' | 'en-US';
export type EditorColorTheme = 'daylight' | 'moonlight';

export type EditorSettings = {
  readonly settingsVersion: typeof EDITOR_SETTINGS_VERSION;
  readonly language: EditorLanguage;
  readonly colorTheme: EditorColorTheme;
};

export type EditorSettingsPatch =
  | Readonly<Pick<EditorSettings, 'language'>>
  | Readonly<Pick<EditorSettings, 'colorTheme'>>;

export const DEFAULT_EDITOR_LANGUAGE: EditorLanguage = 'zh-CN';
export const DEFAULT_EDITOR_COLOR_THEME: EditorColorTheme = 'daylight';

export const DEFAULT_EDITOR_SETTINGS: Readonly<EditorSettings> = Object.freeze({
  settingsVersion: EDITOR_SETTINGS_VERSION,
  language: DEFAULT_EDITOR_LANGUAGE,
  colorTheme: DEFAULT_EDITOR_COLOR_THEME,
});

export function createDefaultEditorSettings(): EditorSettings {
  return { ...DEFAULT_EDITOR_SETTINGS };
}

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

export function isEditorLanguage(value: unknown): value is EditorLanguage {
  return value === 'zh-CN' || value === 'en-US';
}

export function isEditorColorTheme(
  value: unknown,
): value is EditorColorTheme {
  return value === 'daylight' || value === 'moonlight';
}

export function isEditorSettings(value: unknown): value is EditorSettings {
  return isObject(value) &&
    hasExactFields(value, ['settingsVersion', 'language', 'colorTheme']) &&
    value.settingsVersion === EDITOR_SETTINGS_VERSION &&
    isEditorLanguage(value.language) &&
    isEditorColorTheme(value.colorTheme);
}

export function isEditorSettingsPatch(
  value: unknown,
): value is EditorSettingsPatch {
  if (!isObject(value)) {
    return false;
  }
  if (hasExactFields(value, ['language'])) {
    return isEditorLanguage(value.language);
  }
  return hasExactFields(value, ['colorTheme']) &&
    isEditorColorTheme(value.colorTheme);
}

export type EditorSettingsErrorCode =
  | 'settings-storage-unavailable'
  | 'settings-invalid';

export type EditorSettingsReadResult =
  | { status: 'ready'; settings: EditorSettings }
  | { status: 'rejected'; error: EditorSettingsErrorCode };

export type EditorSettingsWriteResult =
  | { status: 'updated'; settings: EditorSettings }
  | { status: 'rejected'; error: EditorSettingsErrorCode };

export type EditorSettingsInvocation =
  | {
      action: 'get-settings';
      params: Record<string, never>;
    }
  | {
      action: 'update-settings';
      params: { patch: EditorSettingsPatch };
    };

export type VnEditorSettingsApi = {
  getSettings(): Promise<EditorSettingsReadResult>;
  updateSettings(
    patch: EditorSettingsPatch,
  ): Promise<EditorSettingsWriteResult>;
  onChanged(listener: (settings: EditorSettings) => void): () => void;
};
