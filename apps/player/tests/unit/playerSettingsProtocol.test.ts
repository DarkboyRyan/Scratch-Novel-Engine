/**
 * 主要作用：验证设置版本、默认值、Patch 与存档摘要协议。
 * 关键函数与实现：测试套件“Player settings protocol”、`legacySettings`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */
import { describe, expect, it } from 'vitest';

import {
  createPlayerSaveSummaryContent,
  DEFAULT_PLAYER_SETTINGS,
  isPlayerSettings,
  isPlayerSettingsPatch,
  isPlayerSettingsV1,
  PLAYER_ERROR_CODES,
} from '../../src/shared/playerProtocol';

const legacySettings = {
  settingsVersion: 1,
  masterVolume: 1,
  bgmVolume: 1,
  voiceVolume: 1,
  videoVolume: 1,
  windowMode: 'windowed',
  windowSizePreset: 'medium',
};

describe('Player settings protocol', () => {
  it('publishes an exact stable Player error code set', () => {
    expect(PLAYER_ERROR_CODES).toEqual([
      'bundle-load-failed',
      'bundle-selection-failed',
      'embedded-open-disabled',
      'no-active-game',
      'save-storage-unavailable',
      'runtime-not-saveable',
      'save-incompatible',
      'game-session-stale',
      'settings-storage-unavailable',
      'settings-invalid',
      'web-open-disabled',
      'web-game-not-loaded',
      'fullscreen-denied',
    ]);
  });

  it('creates language-neutral save summary variants without rewriting dialogue', () => {
    expect(createPlayerSaveSummaryContent({
      status: 'playing',
      dialogue: {
        id: 'line',
        type: 'dialogue',
        speaker: '原作者 / Author',
        text: '原文：Keep this exact.',
        voiceAssetId: null,
      },
    })).toEqual({
      kind: 'dialogue',
      speaker: '原作者 / Author',
      text: '原文：Keep this exact.',
    });
    expect(createPlayerSaveSummaryContent({
      status: 'playing',
      dialogue: null,
    })).toEqual({ kind: 'progress' });
    expect(createPlayerSaveSummaryContent({
      status: 'choosing',
      dialogue: null,
    })).toEqual({ kind: 'choosing' });
    expect(createPlayerSaveSummaryContent({
      status: 'playingVideo',
      dialogue: null,
    })).toEqual({ kind: 'playing-video' });
    expect(createPlayerSaveSummaryContent({
      status: 'finished',
      dialogue: null,
    })).toEqual({ kind: 'finished' });
  });

  it('uses a strict v2 Chinese default while recognizing only exact legacy v1', () => {
    expect(DEFAULT_PLAYER_SETTINGS).toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      masterVolume: 1,
      bgmVolume: 1,
      voiceVolume: 1,
      videoVolume: 1,
      windowMode: 'windowed',
      windowSizePreset: 'medium',
    });
    expect(isPlayerSettingsV1(legacySettings)).toBe(true);
    expect(isPlayerSettingsV1({
      ...legacySettings,
      language: 'zh-CN',
    })).toBe(false);
    expect(isPlayerSettings(DEFAULT_PLAYER_SETTINGS)).toBe(true);
    const missingLanguage: Record<string, unknown> = {
      ...DEFAULT_PLAYER_SETTINGS,
    };
    delete missingLanguage.language;
    expect(isPlayerSettings(missingLanguage)).toBe(false);
    expect(isPlayerSettings({
      ...DEFAULT_PLAYER_SETTINGS,
      privatePath: '/private/settings',
    })).toBe(false);
  });

  it('accepts only supported language patches with no extra fields', () => {
    expect(isPlayerSettingsPatch({ language: 'zh-CN' })).toBe(true);
    expect(isPlayerSettingsPatch({ language: 'en-US' })).toBe(true);
    expect(isPlayerSettingsPatch({ language: 'fr-FR' })).toBe(false);
    expect(isPlayerSettingsPatch({
      language: 'en-US',
      localePath: '/private/translations',
    })).toBe(false);
  });
});
