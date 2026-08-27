/**
 * 文件主要作用：验证 Editor settings protocol 的行为。
 * 测试覆盖：`Editor settings protocol`。
 */

import { describe, expect, it } from 'vitest';

import {
  createDefaultEditorSettings,
  isEditorSettings,
  isEditorSettingsPatch,
} from '../../src/shared/editorSettingsProtocol';

describe('Editor settings protocol', () => {
  it('uses Chinese as the deterministic first-run language', () => {
    expect(createDefaultEditorSettings()).toEqual({
      settingsVersion: 1,
      language: 'zh-CN',
    });
  });

  it('accepts only exact versioned settings and narrow language patches', () => {
    expect(isEditorSettings({ settingsVersion: 1, language: 'en-US' })).toBe(true);
    expect(isEditorSettings({
      settingsVersion: 1,
      language: 'en-US',
      injected: true,
    })).toBe(false);
    expect(isEditorSettings({ settingsVersion: 2, language: 'zh-CN' })).toBe(false);
    expect(isEditorSettingsPatch({ language: 'zh-CN' })).toBe(true);
    expect(isEditorSettingsPatch({ language: 'fr-FR' })).toBe(false);
    expect(isEditorSettingsPatch({ language: 'en-US', path: '/tmp/settings' })).toBe(false);
  });
});

