/**
 * 主要作用：提供语言、四路音量和显示模式的可访问设置对话框。
 * 关键函数与实现：`OptionsSettingsValue`、`OptionsDialogProps`、`OptionsDialog`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import { useLayoutEffect, useRef } from 'react';

import {
  PLAYER_LANGUAGES,
  type PlayerLanguage,
  type PlayerUiLocalizationProps,
} from './localization';
import { clampMediaVolume } from './mediaVolume';
import { usePlayerUiLocalization } from './PlayerUiProvider';

export type OptionsSettingsValue = {
  settingsVersion: 2;
  language: PlayerLanguage;
  masterVolume: number;
  bgmVolume: number;
  voiceVolume: number;
  videoVolume: number;
  windowMode: 'windowed' | 'fullscreen';
  windowSizePreset: 'small' | 'medium' | 'large';
};

export type OptionsDialogProps = PlayerUiLocalizationProps & {
  settings: OptionsSettingsValue;
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  openingGame?: boolean;
  windowControlsEnabled?: boolean;
  fullscreenControlsEnabled?: boolean;
  windowSizeControlsEnabled?: boolean;
  onPreviewSettingsChange: (settings: OptionsSettingsValue) => void;
  onCommitSettings: (settings: OptionsSettingsValue) => void;
  onReset: () => void;
  onOpenGame?: () => void;
  restoreFocusTo?: HTMLElement | null;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.tabIndex >= 0);
}

type VolumeKey =
  | 'masterVolume'
  | 'bgmVolume'
  | 'voiceVolume'
  | 'videoVolume';

const VOLUME_FIELDS: readonly VolumeKey[] = [
  'masterVolume',
  'bgmVolume',
  'voiceVolume',
  'videoVolume',
];

export function OptionsDialog({
  language,
  labels: labelsOverride,
  settings,
  loading = false,
  busy = false,
  error = null,
  openingGame = false,
  windowControlsEnabled = true,
  fullscreenControlsEnabled = windowControlsEnabled,
  windowSizeControlsEnabled = windowControlsEnabled,
  onPreviewSettingsChange,
  onCommitSettings,
  onReset,
  onOpenGame,
  restoreFocusTo = null,
  onClose,
}: OptionsDialogProps) {
  const { labels: allLabels } = usePlayerUiLocalization(
    language ?? settings.language,
    labelsOverride,
  );
  const labels = allLabels.options;
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusToRef = useRef(restoreFocusTo);
  const commitControlRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    previousFocusRef.current = restoreFocusToRef.current ?? (
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    );
    const layer = layerRef.current;
    (layer === null ? null : focusableElements(layer)[0] ?? layer)?.focus();
    return () => {
      const previousFocus = previousFocusRef.current;
      queueMicrotask(() => {
        if (
          previousFocus?.isConnected
          && !previousFocus.matches(':disabled')
          && previousFocus.closest('[inert]') === null
        ) {
          previousFocus.focus();
        }
      });
    };
  }, []);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer === null) {
      return;
    }
    if (busy || loading) {
      if (
        !(document.activeElement instanceof HTMLElement) ||
        !layer.contains(document.activeElement) ||
        document.activeElement.matches(':disabled')
      ) {
        layer.focus();
      }
      return;
    }
    const committedControl = commitControlRef.current;
    if (
      committedControl?.isConnected &&
      layer.contains(committedControl) &&
      !committedControl.matches(':disabled')
    ) {
      committedControl.focus();
      commitControlRef.current = null;
    } else if (
      !(document.activeElement instanceof HTMLElement) ||
      !layer.contains(document.activeElement)
    ) {
      (focusableElements(layer)[0] ?? layer).focus();
    }
  }, [busy, loading]);

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const layer = layerRef.current;
        if (layer === null) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusable = focusableElements(layer);
        if (focusable.length === 0) {
          layer.focus();
          return;
        }
        const currentIndex = document.activeElement instanceof HTMLElement
          ? focusable.indexOf(document.activeElement)
          : -1;
        const nextIndex = event.shiftKey
          ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
          : currentIndex < 0 || currentIndex === focusable.length - 1
            ? 0
            : currentIndex + 1;
        focusable[nextIndex]?.focus();
        return;
      }
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, {
      capture: true,
    });
  }, [busy, loading, onClose]);

  return (
    <div
      ref={layerRef}
      className="player-options-layer"
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      aria-busy={loading || busy}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section className="player-options-card">
        <header className="player-options-header">
          <div>
            <p className="player-eyebrow">{labels.eyebrow}</p>
            <h2>{labels.title}</h2>
          </div>
          <button
            type="button"
            className="player-options-close secondary"
            aria-label={labels.closeAria}
            disabled={loading || busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="player-options-status" role="status">
            {labels.loadingSettings}
          </p>
        ) : (
          <>
            <fieldset className="player-options-section">
              <legend>{labels.languageSection}</legend>
              <label className="player-options-select">
                <span>{labels.language}</span>
                <select
                  aria-label={labels.language}
                  value={settings.language}
                  disabled={busy}
                  onChange={(event) => {
                    commitControlRef.current = event.currentTarget;
                    const nextLanguage = event.currentTarget.value === 'en-US'
                      ? 'en-US'
                      : 'zh-CN';
                    const nextSettings: OptionsSettingsValue = {
                      ...settings,
                      language: nextLanguage,
                    };
                    onPreviewSettingsChange(nextSettings);
                    onCommitSettings(nextSettings);
                  }}
                >
                  {PLAYER_LANGUAGES.map((supportedLanguage) => (
                    <option key={supportedLanguage} value={supportedLanguage}>
                      {labels.languageNames[supportedLanguage]}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset className="player-options-section">
              <legend>{labels.volumeSection}</legend>
              {VOLUME_FIELDS.map((key) => {
                const label = labels[key];
                const percentage = Math.round(
                  clampMediaVolume(settings[key]) * 100,
                );
                return (
                  <label key={key} className="player-options-volume">
                    <span>{label}</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={percentage}
                      aria-label={label}
                      disabled={loading || busy}
                      onChange={(event) => {
                        const nextValue = Number(event.currentTarget.value) / 100;
                        onPreviewSettingsChange({
                          ...settings,
                          [key]: clampMediaVolume(nextValue),
                        });
                      }}
                      onPointerUp={(event) => {
                        commitControlRef.current = event.currentTarget;
                        const nextValue = Number(event.currentTarget.value) / 100;
                        onCommitSettings({
                          ...settings,
                          [key]: clampMediaVolume(nextValue),
                        });
                      }}
                      onKeyUp={(event) => {
                        commitControlRef.current = event.currentTarget;
                        const nextValue = Number(event.currentTarget.value) / 100;
                        onCommitSettings({
                          ...settings,
                          [key]: clampMediaVolume(nextValue),
                        });
                      }}
                      onBlur={(event) => {
                        commitControlRef.current = event.currentTarget;
                        const nextValue = Number(event.currentTarget.value) / 100;
                        onCommitSettings({
                          ...settings,
                          [key]: clampMediaVolume(nextValue),
                        });
                      }}
                    />
                    <output>{percentage}%</output>
                  </label>
                );
              })}
            </fieldset>

            <fieldset className="player-options-section">
              <legend>{labels.displaySection}</legend>
              <label className="player-options-select">
                <span>{labels.windowMode}</span>
                <select
                  aria-label={labels.windowMode}
                  value={settings.windowMode}
                  disabled={busy || !fullscreenControlsEnabled}
                  onChange={(event) => {
                    commitControlRef.current = event.currentTarget;
                    const nextSettings: OptionsSettingsValue = {
                      ...settings,
                      windowMode: event.currentTarget.value === 'fullscreen'
                        ? 'fullscreen'
                        : 'windowed',
                    };
                    onPreviewSettingsChange(nextSettings);
                    onCommitSettings(nextSettings);
                  }}
                >
                  <option value="windowed">{labels.windowed}</option>
                  <option value="fullscreen">{labels.fullscreen}</option>
                </select>
              </label>
              <label className="player-options-select">
                <span>{labels.windowSize}</span>
                <select
                  aria-label={labels.windowSize}
                  value={settings.windowSizePreset}
                  disabled={
                    busy ||
                    !windowSizeControlsEnabled ||
                    settings.windowMode === 'fullscreen'
                  }
                  onChange={(event) => {
                    commitControlRef.current = event.currentTarget;
                    const value = event.currentTarget.value;
                    const windowSizePreset = value === 'small' || value === 'large'
                      ? value
                      : 'medium';
                    const nextSettings: OptionsSettingsValue = {
                      ...settings,
                      windowSizePreset,
                    };
                    onPreviewSettingsChange(nextSettings);
                    onCommitSettings(nextSettings);
                  }}
                >
                  <option value="small">{labels.smallWindow}</option>
                  <option value="medium">{labels.mediumWindow}</option>
                  <option value="large">{labels.largeWindow}</option>
                </select>
              </label>
              {settings.windowMode === 'fullscreen' &&
              windowSizeControlsEnabled ? (
                <p className="player-options-help">
                  {labels.fullscreenHelp}
                </p>
              ) : null}
              {!fullscreenControlsEnabled && !windowSizeControlsEnabled ? (
                <p className="player-options-help">
                  {labels.windowControlsUnavailable}
                </p>
              ) : fullscreenControlsEnabled && !windowSizeControlsEnabled ? (
                <p className="player-options-help">
                  {labels.browserWindowSizeUnavailable}
                </p>
              ) : null}
            </fieldset>
          </>
        )}

        {busy ? (
          <p className="player-options-status" role="status">
            {labels.applyingSettings}
          </p>
        ) : null}
        {error !== null ? (
          <p className="player-options-error" role="alert">{error}</p>
        ) : null}

        <div className="player-options-actions">
          {onOpenGame ? (
            <button
              type="button"
              className="secondary"
              disabled={loading || busy || openingGame}
              onClick={onOpenGame}
            >
              {openingGame
                ? allLabels.common.openingGame
                : allLabels.common.openOtherGame}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary"
            disabled={loading || busy}
            onClick={(event) => {
              commitControlRef.current = event.currentTarget;
              onReset();
            }}
          >
            {labels.resetDefaults}
          </button>
          <button
            type="button"
            className="player-options-primary"
            disabled={loading || busy}
            onClick={onClose}
          >
            {labels.back}
          </button>
        </div>
      </section>
    </div>
  );
}
