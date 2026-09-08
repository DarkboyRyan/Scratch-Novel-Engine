/**
 * 文件主要作用：验证 Editor settings protocol 的行为。
 * 测试覆盖：`Editor settings protocol`。
 */

import { describe, expect, it } from 'vitest';

import {
  createDefaultEditorSettings,
  isEditorColorTheme,
  isEditorSettings,
  isEditorSettingsPatch,
} from '../../src/shared/editorSettingsProtocol';

describe('Editor settings protocol', () => {
  it('uses Chinese and Daylight as deterministic first-run settings', () => {
    expect(createDefaultEditorSettings()).toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
    });
  });

  it('accepts only exact v2 settings and the two named color themes', () => {
    expect(isEditorSettings({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    })).toBe(true);
    expect(isEditorSettings({
      settingsVersion: 2,
      language: 'en-US',
    })).toBe(false);
    expect(isEditorSettings({
      settingsVersion: 1,
      language: 'en-US',
      colorTheme: 'daylight',
    })).toBe(false);
    expect(isEditorSettings({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'midnight',
    })).toBe(false);
    expect(isEditorSettings({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'daylight',
      injected: true,
    })).toBe(false);
    expect(isEditorColorTheme('daylight')).toBe(true);
    expect(isEditorColorTheme('moonlight')).toBe(true);
    expect(isEditorColorTheme('dark')).toBe(false);
  });

  it('accepts one narrow setting patch at a time', () => {
    expect(isEditorSettingsPatch({ language: 'zh-CN' })).toBe(true);
    expect(isEditorSettingsPatch({ colorTheme: 'moonlight' })).toBe(true);
    expect(isEditorSettingsPatch({ language: 'fr-FR' })).toBe(false);
    expect(isEditorSettingsPatch({ colorTheme: 'dark' })).toBe(false);
    expect(isEditorSettingsPatch({})).toBe(false);
    expect(isEditorSettingsPatch({
      language: 'en-US',
      colorTheme: 'daylight',
    })).toBe(false);
    expect(isEditorSettingsPatch({ language: 'en-US', path: '/tmp/settings' })).toBe(false);
  });
});
