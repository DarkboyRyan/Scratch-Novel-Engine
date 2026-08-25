import { useLayoutEffect, useRef } from 'react';

import { clampMediaVolume } from './mediaVolume';

export type OptionsSettingsValue = {
  settingsVersion: 1;
  masterVolume: number;
  bgmVolume: number;
  voiceVolume: number;
  videoVolume: number;
  windowMode: 'windowed' | 'fullscreen';
  windowSizePreset: 'small' | 'medium' | 'large';
};

export type OptionsDialogProps = {
  settings: OptionsSettingsValue;
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  openingGame?: boolean;
  windowControlsEnabled?: boolean;
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

const VOLUME_FIELDS: ReadonlyArray<{ key: VolumeKey; label: string }> = [
  { key: 'masterVolume', label: '主音量' },
  { key: 'bgmVolume', label: '背景音乐' },
  { key: 'voiceVolume', label: '语音' },
  { key: 'videoVolume', label: '视频' },
];

export function OptionsDialog({
  settings,
  loading = false,
  busy = false,
  error = null,
  openingGame = false,
  windowControlsEnabled = true,
  onPreviewSettingsChange,
  onCommitSettings,
  onReset,
  onOpenGame,
  restoreFocusTo = null,
  onClose,
}: OptionsDialogProps) {
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
      aria-label="选项"
      aria-busy={loading || busy}
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section className="player-options-card">
        <header className="player-options-header">
          <div>
            <p className="player-eyebrow">OPTIONS</p>
            <h2>选项</h2>
          </div>
          <button
            type="button"
            className="player-options-close secondary"
            aria-label="关闭选项"
            disabled={loading || busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {loading ? (
          <p className="player-options-status" role="status">
            正在读取设置…
          </p>
        ) : (
          <>
            <fieldset className="player-options-section">
              <legend>音量</legend>
              {VOLUME_FIELDS.map(({ key, label }) => {
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
              <legend>显示</legend>
              <label className="player-options-select">
                <span>窗口模式</span>
                <select
                  aria-label="窗口模式"
                  value={settings.windowMode}
                  disabled={busy || !windowControlsEnabled}
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
                  <option value="windowed">窗口</option>
                  <option value="fullscreen">全屏</option>
                </select>
              </label>
              <label className="player-options-select">
                <span>窗口尺寸</span>
                <select
                  aria-label="窗口尺寸"
                  value={settings.windowSizePreset}
                  disabled={
                    busy ||
                    !windowControlsEnabled ||
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
                  <option value="small">小（960 × 600）</option>
                  <option value="medium">中（1280 × 800）</option>
                  <option value="large">大（1600 × 1000）</option>
                </select>
              </label>
              {settings.windowMode === 'fullscreen' ? (
                <p className="player-options-help">
                  全屏模式会使用当前显示器尺寸；返回窗口模式后应用所选尺寸。
                </p>
              ) : null}
              {!windowControlsEnabled ? (
                <p className="player-options-help">
                  窗口模式和尺寸仅在正式 Player 中应用。
                </p>
              ) : null}
            </fieldset>
          </>
        )}

        {busy ? (
          <p className="player-options-status" role="status">
            正在应用设置…
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
              {openingGame ? '正在打开…' : '打开其他游戏'}
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
            恢复默认
          </button>
          <button
            type="button"
            className="player-options-primary"
            disabled={loading || busy}
            onClick={onClose}
          >
            返回
          </button>
        </div>
      </section>
    </div>
  );
}
