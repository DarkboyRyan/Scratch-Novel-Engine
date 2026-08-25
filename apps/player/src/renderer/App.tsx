import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  advanceGame,
  createGameRuntimeSnapshot,
  selectChoice,
  startGame,
  type GameRuntime,
} from '@vnengine/runtime';
import {
  effectiveMediaVolume,
  OptionsDialog,
  SaveSlotDialog,
  TitleScreen,
  type SaveSlotSummary,
} from '@vnengine/player-ui';

import { GameScreen } from './GameScreen';
import {
  preloadPlayerGateway,
  type PlayerGameView,
  type PlayerGateway,
} from './playerGateway';
import type {
  PlayerManualSaveSlotId,
  PlayerMode,
  PlayerSaveSummary,
  PlayerSettingsPatch,
  PlayerSettingsV1,
} from '../shared/playerProtocol';
import { createDefaultPlayerSettings } from '../shared/playerProtocol';

type PlayerShellState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'title'; game: PlayerGameView; generation: number }
  | {
      kind: 'game';
      game: PlayerGameView;
      runtime: GameRuntime;
      paused: boolean;
      generation: number;
    };

type SaveDialogState = {
  mode: 'save' | 'load';
  loading: boolean;
  slots: SaveSlotSummary[];
  busySlotId: PlayerManualSaveSlotId | 'quick' | null;
  error: string | null;
};

type SaveToast = {
  kind: 'success' | 'error';
  message: string;
};

const MODAL_FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function modalFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR),
  ).filter((element) => !element.hidden && element.tabIndex >= 0);
}

type OpenErrorDialogProps = {
  message: string;
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
  onRetry: () => void;
};

function OpenErrorDialog({
  message,
  returnFocusTo = null,
  onClose,
  onRetry,
}: OpenErrorDialogProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    previousFocusRef.current = returnFocusTo ?? (
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    );
    const layer = layerRef.current;
    (layer === null ? null : modalFocusableElements(layer)[0] ?? layer)?.focus();
    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected && !previousFocus.matches(':disabled')) {
        previousFocus.focus();
      }
    };
  }, [returnFocusTo]);

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const layer = layerRef.current;
        if (layer === null) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const focusable = modalFocusableElements(layer);
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
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, {
      capture: true,
    });
  }, [onClose]);

  return (
    <div
      ref={layerRef}
      className="player-open-error-layer"
      role="alertdialog"
      aria-modal="true"
      aria-label="内容包未打开"
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section className="player-menu-card player-error-card">
        <p className="player-eyebrow">OPEN ERROR</p>
        <h2>内容包未打开</h2>
        <p>{message}</p>
        <button type="button" onClick={onClose}>返回</button>
        <button type="button" className="secondary" onClick={onRetry}>
          选择其他游戏包
        </button>
      </section>
    </div>
  );
}

function changedSettingsPatch(
  previous: PlayerSettingsV1,
  next: PlayerSettingsV1,
): PlayerSettingsPatch | null {
  const patch: {
    -readonly [Field in Exclude<
      keyof PlayerSettingsV1,
      'settingsVersion'
    >]?: PlayerSettingsV1[Field];
  } = {};
  if (previous.masterVolume !== next.masterVolume) {
    patch.masterVolume = next.masterVolume;
  }
  if (previous.bgmVolume !== next.bgmVolume) {
    patch.bgmVolume = next.bgmVolume;
  }
  if (previous.voiceVolume !== next.voiceVolume) {
    patch.voiceVolume = next.voiceVolume;
  }
  if (previous.videoVolume !== next.videoVolume) {
    patch.videoVolume = next.videoVolume;
  }
  if (previous.windowMode !== next.windowMode) {
    patch.windowMode = next.windowMode;
  }
  if (previous.windowSizePreset !== next.windowSizePreset) {
    patch.windowSizePreset = next.windowSizePreset;
  }
  return Object.keys(patch).length === 0
    ? null
    : patch as PlayerSettingsPatch;
}

function visibleSaveSlots(
  slots: readonly PlayerSaveSummary[],
): SaveSlotSummary[] {
  return slots.flatMap((slot) =>
    slot.slotId === 1 ||
    slot.slotId === 2 ||
    slot.slotId === 3 ||
    slot.slotId === 'quick'
      ? [{ ...slot, slotId: slot.slotId }]
      : [],
  );
}

export type AppProps = {
  gateway?: PlayerGateway;
};

export function App({ gateway = preloadPlayerGateway }: AppProps) {
  const [state, setState] = useState<PlayerShellState>({ kind: 'loading' });
  // Keep opening disabled until Main declares the mode. If load-game itself
  // fails, an embedded application must not accidentally reveal a picker.
  const [mode, setMode] = useState<PlayerMode | null>(null);
  const [openingGame, setOpeningGame] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [saveDialog, setSaveDialog] = useState<SaveDialogState | null>(null);
  const [quickOperation, setQuickOperation] = useState<'save' | 'load' | null>(
    null,
  );
  const [saveToast, setSaveToast] = useState<SaveToast | null>(null);
  const [settings, setSettings] = useState<PlayerSettingsV1>(
    createDefaultPlayerSettings,
  );
  const [settingsSettled, setSettingsSettled] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const openingRef = useRef(false);
  const saveDialogOpenRef = useRef(false);
  const saveDialogOpeningRef = useRef(false);
  const saveSlotOperationRef = useRef(false);
  const quickOperationRef = useRef(false);
  const gameplayInteractionBlockedRef = useRef(false);
  const settingsOperationRef = useRef(false);
  const settingsRequestEpochRef = useRef(0);
  const settingsRefreshEpochRef = useRef(0);
  const committedSettingsRef = useRef(settings);
  const settingsRef = useRef(settings);
  const optionsTriggerRef = useRef<HTMLElement | null>(null);
  const openGameTriggerRef = useRef<HTMLElement | null>(null);
  const storageRequestEpochRef = useRef(0);
  const bundleGenerationRef = useRef(0);
  const gameplayGenerationRef = useRef(0);
  const titleGenerationRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  settingsRef.current = settings;

  const loadSettings = useCallback(async () => {
    const requestEpoch = ++settingsRequestEpochRef.current;
    setSettingsSettled(false);
    try {
      const result = await gateway.getSettings();
      if (requestEpoch !== settingsRequestEpochRef.current) {
        return;
      }
      if (result.status === 'ready') {
        committedSettingsRef.current = result.settings;
        setSettings(result.settings);
        setSettingsError(null);
      } else {
        const defaults = createDefaultPlayerSettings();
        committedSettingsRef.current = defaults;
        setSettings(defaults);
        setSettingsError(result.error);
      }
    } catch {
      if (requestEpoch !== settingsRequestEpochRef.current) {
        return;
      }
      const defaults = createDefaultPlayerSettings();
      committedSettingsRef.current = defaults;
      setSettings(defaults);
      setSettingsError('无法读取设置，已使用默认值。');
    } finally {
      if (requestEpoch === settingsRequestEpochRef.current) {
        setSettingsSettled(true);
      }
    }
  }, [gateway]);

  const activateGameBundle = useCallback((game: PlayerGameView) => {
    bundleGenerationRef.current += 1;
    storageRequestEpochRef.current += 1;
    saveDialogOpenRef.current = false;
    saveDialogOpeningRef.current = false;
    saveSlotOperationRef.current = false;
    quickOperationRef.current = false;
    gameplayInteractionBlockedRef.current = false;
    setOptionsOpen(false);
    setSaveDialog(null);
    setQuickOperation(null);
    setSaveToast(null);
    titleGenerationRef.current += 1;
    setState({
      kind: 'title',
      game,
      generation: titleGenerationRef.current,
    });
  }, []);

  const activateRuntime = useCallback((
    game: PlayerGameView,
    runtime: GameRuntime,
  ) => {
    gameplayGenerationRef.current += 1;
    setState({
      kind: 'game',
      game,
      runtime,
      paused: false,
      generation: gameplayGenerationRef.current,
    });
  }, []);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const result = await gateway.loadGame();
      setMode(result.mode);
      if (result.status === 'loaded') {
        activateGameBundle(result.game);
      } else if (result.status === 'empty') {
        setState(result.mode === 'generic'
          ? { kind: 'empty' }
          : {
              kind: 'error',
              message: '内嵌游戏内容缺失，请重新安装游戏。',
            });
      } else {
        setState({ kind: 'error', message: result.error });
      }
    } catch {
      setState({
        kind: 'error',
        message: '无法读取游戏内容包，请重新安装或联系游戏作者。',
      });
    }
  }, [activateGameBundle, gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSettings();
    return () => {
      settingsRequestEpochRef.current += 1;
    };
  }, [loadSettings]);

  const openOptions = useCallback(() => {
    if (
      gameplayInteractionBlockedRef.current ||
      settingsOperationRef.current ||
      saveDialogOpenRef.current ||
      saveDialogOpeningRef.current ||
      saveSlotOperationRef.current ||
      quickOperationRef.current
    ) {
      return;
    }
    optionsTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    gameplayInteractionBlockedRef.current = true;
    setOptionsOpen(true);
  }, []);

  const closeOptions = useCallback(() => {
    if (settingsOperationRef.current) {
      return;
    }
    gameplayInteractionBlockedRef.current = false;
    setOptionsOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (optionsOpen) {
      return;
    }
    const trigger = optionsTriggerRef.current;
    if (trigger?.isConnected && !trigger.matches(':disabled')) {
      trigger.focus();
    }
    optionsTriggerRef.current = null;
  }, [optionsOpen]);

  useEffect(() => {
    if (!optionsOpen) {
      return;
    }
    let disposed = false;
    let timeout: number | null = null;
    const scheduleRefresh = () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      const expectedLocalSettings = settingsRef.current;
      timeout = window.setTimeout(() => {
        timeout = null;
        if (disposed || settingsOperationRef.current) {
          return;
        }
        const refreshEpoch = ++settingsRefreshEpochRef.current;
        void gateway.getSettings()
          .then((result) => {
            if (
              disposed ||
              refreshEpoch !== settingsRefreshEpochRef.current ||
              settingsOperationRef.current ||
              settingsRef.current !== expectedLocalSettings
            ) {
              return;
            }
            if (result.status === 'ready') {
              committedSettingsRef.current = result.settings;
              setSettings(result.settings);
              setSettingsError(null);
            } else {
              setSettingsError(result.error);
            }
          })
          .catch(() => {
            if (
              !disposed &&
              refreshEpoch === settingsRefreshEpochRef.current &&
              !settingsOperationRef.current
            ) {
              setSettingsError('无法同步当前窗口设置。');
            }
          });
      }, 50);
    };
    scheduleRefresh();
    window.addEventListener('focus', scheduleRefresh);
    window.addEventListener('resize', scheduleRefresh);
    return () => {
      disposed = true;
      settingsRefreshEpochRef.current += 1;
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      window.removeEventListener('focus', scheduleRefresh);
      window.removeEventListener('resize', scheduleRefresh);
    };
  }, [gateway, optionsOpen]);

  const previewSettings = useCallback((next: PlayerSettingsV1) => {
    if (!settingsOperationRef.current) {
      setSettings(next);
      setSettingsError(null);
    }
  }, []);

  const commitSettings = useCallback(async (next: PlayerSettingsV1) => {
    if (settingsOperationRef.current) {
      return;
    }
    const previous = committedSettingsRef.current;
    const patch = changedSettingsPatch(previous, next);
    if (patch === null) {
      setSettings(previous);
      return;
    }
    settingsOperationRef.current = true;
    settingsRefreshEpochRef.current += 1;
    const requestEpoch = ++settingsRequestEpochRef.current;
    setSettings(next);
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      const result = await gateway.updateSettings(patch);
      if (requestEpoch !== settingsRequestEpochRef.current) {
        return;
      }
      if (result.status === 'updated') {
        committedSettingsRef.current = result.settings;
        setSettings(result.settings);
      } else {
        setSettings(previous);
        setSettingsError(result.error);
      }
    } catch {
      if (requestEpoch === settingsRequestEpochRef.current) {
        setSettings(previous);
        setSettingsError('设置未能应用，请重试。');
      }
    } finally {
      if (requestEpoch === settingsRequestEpochRef.current) {
        settingsOperationRef.current = false;
        setSettingsBusy(false);
      }
    }
  }, [gateway]);

  const resetSettings = useCallback(() => {
    const defaults = createDefaultPlayerSettings();
    setSettings(defaults);
    void commitSettings(defaults);
  }, [commitSettings]);

  const closeOpenError = useCallback(() => {
    if (openingRef.current) {
      return;
    }
    setOpenError(null);
    gameplayInteractionBlockedRef.current = false;
  }, []);

  const openGame = useCallback(async () => {
    if (
      mode !== 'generic' ||
      openingRef.current ||
      gameplayInteractionBlockedRef.current
    ) {
      return;
    }
    if (openGameTriggerRef.current === null) {
      openGameTriggerRef.current = optionsTriggerRef.current ?? (
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      );
    }
    gameplayInteractionBlockedRef.current = true;
    openingRef.current = true;
    setOpeningGame(true);
    setOpenError(null);
    let keepInteractionBlocked = false;
    try {
      const result = await gateway.openGame();
      if (result.status === 'opened') {
        activateGameBundle(result.game);
      } else if (result.status === 'rejected') {
        keepInteractionBlocked = true;
        setOpenError(result.error);
      }
    } catch {
      keepInteractionBlocked = true;
      setOpenError('无法打开游戏内容包，请重试。');
    } finally {
      openingRef.current = false;
      setOpeningGame(false);
      if (!keepInteractionBlocked) {
        gameplayInteractionBlockedRef.current = false;
      }
    }
  }, [activateGameBundle, gateway, mode]);

  useLayoutEffect(() => {
    if (openingGame || openError !== null) {
      return;
    }
    const trigger = openGameTriggerRef.current;
    if (trigger?.isConnected && !trigger.matches(':disabled')) {
      trigger.focus();
    }
    openGameTriggerRef.current = null;
  }, [openError, openingGame]);

  const canOpenGame = mode === 'generic';

  const exitGame = useCallback(() => {
    if (!gameplayInteractionBlockedRef.current) {
      void gateway.quit();
    }
  }, [gateway]);

  const start = useCallback((game: PlayerGameView) => {
    if (gameplayInteractionBlockedRef.current) {
      return;
    }
    const runtime = startGame(game.project);
    if (!runtime) {
      setState({
        kind: 'error',
        message: '游戏入口场景不存在，内容包可能已经损坏。',
      });
      return;
    }
    activateRuntime(game, runtime);
  }, [activateRuntime]);

  const closeSaveDialog = useCallback(() => {
    if (saveSlotOperationRef.current) {
      return;
    }
    storageRequestEpochRef.current += 1;
    saveDialogOpenRef.current = false;
    saveDialogOpeningRef.current = false;
    gameplayInteractionBlockedRef.current = false;
    setSaveDialog(null);
  }, []);

  const openSaveDialog = useCallback(async (dialogMode: 'save' | 'load') => {
    const current = stateRef.current;
    if (
      saveDialogOpeningRef.current ||
      saveDialogOpenRef.current ||
      saveSlotOperationRef.current ||
      quickOperationRef.current ||
      gameplayInteractionBlockedRef.current ||
      (dialogMode === 'save' && current.kind !== 'game') ||
      (current.kind !== 'game' && current.kind !== 'title')
    ) {
      return;
    }
    saveDialogOpenRef.current = true;
    saveDialogOpeningRef.current = true;
    gameplayInteractionBlockedRef.current = true;
    const requestEpoch = ++storageRequestEpochRef.current;
    const bundleGeneration = bundleGenerationRef.current;
    setSaveDialog({
      mode: dialogMode,
      loading: true,
      slots: [],
      busySlotId: null,
      error: null,
    });
    try {
      const result = await gateway.listSaveSlots();
      if (
        requestEpoch !== storageRequestEpochRef.current ||
        bundleGeneration !== bundleGenerationRef.current
      ) {
        return;
      }
      setSaveDialog({
        mode: dialogMode,
        loading: false,
        slots: result.status === 'ready' ? visibleSaveSlots(result.slots) : [],
        busySlotId: null,
        error: result.status === 'rejected' ? result.error : null,
      });
    } catch {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        setSaveDialog({
          mode: dialogMode,
          loading: false,
          slots: [],
          busySlotId: null,
          error: '无法读取存档信息，请重试。',
        });
      }
    } finally {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        saveDialogOpeningRef.current = false;
      }
    }
  }, [gateway]);

  const selectSaveSlot = useCallback(async (slotId: number | 'quick') => {
    if (
      saveSlotOperationRef.current ||
      quickOperationRef.current ||
      (slotId !== 1 && slotId !== 2 && slotId !== 3 && slotId !== 'quick')
    ) {
      return;
    }
    const dialog = saveDialog;
    const current = stateRef.current;
    if (
      dialog === null ||
      (dialog.mode === 'save' && current.kind !== 'game') ||
      (dialog.mode === 'save' && slotId === 'quick') ||
      (current.kind !== 'game' && current.kind !== 'title')
    ) {
      return;
    }
    saveSlotOperationRef.current = true;
    const requestEpoch = ++storageRequestEpochRef.current;
    const bundleGeneration = bundleGenerationRef.current;
    setSaveDialog({ ...dialog, busySlotId: slotId, error: null });
    try {
      if (
        dialog.mode === 'save' &&
        current.kind === 'game' &&
        slotId !== 'quick'
      ) {
        const snapshot = createGameRuntimeSnapshot(
          current.game.project,
          current.runtime,
        );
        if (snapshot === null) {
          setSaveDialog({
            ...dialog,
            busySlotId: null,
            error: '当前进度暂时无法保存，请继续游戏后重试。',
          });
          return;
        }
        const result = await gateway.saveGame(slotId, snapshot);
        if (
          requestEpoch !== storageRequestEpochRef.current ||
          bundleGeneration !== bundleGenerationRef.current
        ) {
          return;
        }
        if (result.status === 'saved') {
          saveDialogOpenRef.current = false;
          gameplayInteractionBlockedRef.current = false;
          setSaveDialog(null);
          setSaveToast({ kind: 'success', message: `已保存到存档 ${slotId}` });
        } else {
          setSaveDialog({ ...dialog, busySlotId: null, error: result.error });
        }
      } else {
        const result = slotId === 'quick'
          ? await gateway.quickLoad()
          : await gateway.loadGameSlot(slotId);
        if (
          requestEpoch !== storageRequestEpochRef.current ||
          bundleGeneration !== bundleGenerationRef.current
        ) {
          return;
        }
        if (result.status === 'loaded') {
          saveDialogOpenRef.current = false;
          gameplayInteractionBlockedRef.current = false;
          activateRuntime(current.game, result.runtime);
          setSaveDialog(null);
          setSaveToast({
            kind: 'success',
            message: slotId === 'quick'
              ? '已读取快速存档'
              : `已读取存档 ${slotId}`,
          });
        } else {
          setSaveDialog({
            ...dialog,
            busySlotId: null,
            error: result.status === 'empty' ? '该存档为空。' : result.error,
          });
        }
      }
    } catch {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        setSaveDialog({
          ...dialog,
          busySlotId: null,
          error: dialog.mode === 'save'
            ? '保存失败，当前进度未受影响。'
            : '读取失败，当前进度未受影响。',
        });
      }
    } finally {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        saveSlotOperationRef.current = false;
      }
    }
  }, [activateRuntime, gateway, saveDialog]);

  const runQuickOperation = useCallback(async (operation: 'save' | 'load') => {
    const current = stateRef.current;
    if (
      current.kind !== 'game' ||
      quickOperationRef.current ||
      saveSlotOperationRef.current ||
      saveDialogOpeningRef.current ||
      gameplayInteractionBlockedRef.current ||
      saveDialog !== null
    ) {
      return;
    }
    quickOperationRef.current = true;
    gameplayInteractionBlockedRef.current = true;
    const requestEpoch = ++storageRequestEpochRef.current;
    const bundleGeneration = bundleGenerationRef.current;
    setQuickOperation(operation);
    try {
      if (operation === 'save') {
        const snapshot = createGameRuntimeSnapshot(
          current.game.project,
          current.runtime,
        );
        if (snapshot === null) {
          setSaveToast({
            kind: 'error',
            message: '当前进度暂时无法保存，请继续游戏后重试。',
          });
          return;
        }
        const result = await gateway.quickSave(snapshot);
        if (
          requestEpoch !== storageRequestEpochRef.current ||
          bundleGeneration !== bundleGenerationRef.current
        ) {
          return;
        }
        setSaveToast(result.status === 'saved'
          ? { kind: 'success', message: '快速保存完成' }
          : { kind: 'error', message: result.error });
      } else {
        const result = await gateway.quickLoad();
        if (
          requestEpoch !== storageRequestEpochRef.current ||
          bundleGeneration !== bundleGenerationRef.current
        ) {
          return;
        }
        if (result.status === 'loaded') {
          activateRuntime(current.game, result.runtime);
          setSaveToast({ kind: 'success', message: '快速读取完成' });
        } else {
          setSaveToast({
            kind: 'error',
            message: result.status === 'empty' ? '尚无快速存档' : result.error,
          });
        }
      }
    } catch {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        setSaveToast({
          kind: 'error',
          message: operation === 'save'
            ? '快速保存失败，当前进度未受影响。'
            : '快速读取失败，当前进度未受影响。',
        });
      }
    } finally {
      if (
        requestEpoch === storageRequestEpochRef.current &&
        bundleGeneration === bundleGenerationRef.current
      ) {
        quickOperationRef.current = false;
        gameplayInteractionBlockedRef.current = false;
        setQuickOperation(null);
      }
    }
  }, [activateRuntime, gateway, saveDialog]);

  useEffect(() => {
    if (saveToast === null) {
      return;
    }
    const timeout = window.setTimeout(() => setSaveToast(null), 2_800);
    return () => window.clearTimeout(timeout);
  }, [saveToast]);

  let content: ReactNode;
  if (state.kind === 'loading' || !settingsSettled) {
    content = (
      <main className="player-shell player-loading" aria-live="polite">
        <span className="player-loading-mark" aria-hidden="true" />
        <p>正在载入游戏…</p>
      </main>
    );
  } else if (state.kind === 'empty') {
    content = (
      <main className="player-shell player-empty-page">
        <section className="player-shell-card">
          <p className="player-eyebrow">VN ENGINE PLAYER</p>
          <h1>打开游戏</h1>
          <p>请选择一个名称以 .vngame 结尾的游戏目录包。</p>
          {canOpenGame ? <div className="player-shell-actions">
            <button
              type="button"
              disabled={openingGame}
              onClick={() => void openGame()}
            >
              {openingGame ? '正在打开…' : '选择游戏包'}
            </button>
          </div> : null}
        </section>
      </main>
    );
  } else if (state.kind === 'error') {
    content = (
      <main className="player-shell player-error-page">
        <section className="player-shell-card" role="alert">
          <p className="player-eyebrow">LOAD ERROR</p>
          <h1>游戏无法载入</h1>
          <p>{state.message}</p>
          <div className="player-shell-actions">
            {canOpenGame ? (
              <button
                type="button"
                disabled={openingGame}
                onClick={() => void openGame()}
              >
                {openingGame ? '正在打开…' : '选择其他游戏包'}
              </button>
            ) : null}
            <button
              type="button"
              className="secondary"
              onClick={exitGame}
            >
              退出游戏
            </button>
          </div>
        </section>
      </main>
    );
  } else if (state.kind === 'title') {
    content = (
      <TitleScreen
        key={state.generation}
        startScreen={state.game.project.startScreen}
        cgGalleryPages={state.game.project.cgGallery?.pages ?? []}
        mediaPaused={saveDialog !== null}
        interactionBlocked={
          saveDialog !== null ||
          optionsOpen ||
          openingGame ||
          openError !== null
        }
        bgmVolume={effectiveMediaVolume(
          settings.masterVolume,
          settings.bgmVolume,
        )}
        openingGame={openingGame}
        resolveMediaUrl={gateway.resolveMediaUrl}
        onStart={() => start(state.game)}
        onLoadGame={() => void openSaveDialog('load')}
        onOpenOptions={openOptions}
        onOpenGame={canOpenGame ? () => void openGame() : undefined}
        onModalStateChange={(open) => {
          gameplayInteractionBlockedRef.current = open;
        }}
        onExit={exitGame}
      />
    );
  } else {
    content = (
      <GameScreen
        key={state.generation}
        project={state.game.project}
        assets={state.game.assets}
        runtime={state.runtime}
        paused={state.paused}
        mediaPaused={saveDialog !== null || quickOperation !== null}
        interactionBlocked={
          saveDialog !== null ||
          quickOperation !== null ||
          optionsOpen ||
          openingGame ||
          openError !== null
        }
        bgmVolume={effectiveMediaVolume(
          settings.masterVolume,
          settings.bgmVolume,
        )}
        voiceVolume={effectiveMediaVolume(
          settings.masterVolume,
          settings.voiceVolume,
        )}
        videoVolume={effectiveMediaVolume(
          settings.masterVolume,
          settings.videoVolume,
        )}
        quickSaveBusy={quickOperation === 'save'}
        quickLoadBusy={quickOperation === 'load'}
        canOpenGame={canOpenGame}
        openingGame={openingGame}
        resolveMediaUrl={gateway.resolveMediaUrl}
        onAdvance={() => {
          if (gameplayInteractionBlockedRef.current) {
            return;
          }
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'playing'
            ? {
                ...current,
                runtime: advanceGame(current.game.project, current.runtime),
              }
            : current);
        }}
        onCompleteVideo={() => {
          if (gameplayInteractionBlockedRef.current) {
            return;
          }
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'playingVideo'
            ? {
                ...current,
                runtime: advanceGame(current.game.project, current.runtime),
              }
            : current);
        }}
        onSelectChoice={(optionId) => {
          if (gameplayInteractionBlockedRef.current) {
            return;
          }
          setState((current) => current.kind === 'game' && !current.paused &&
              current.runtime.status === 'choosing'
            ? {
                ...current,
                runtime: selectChoice(
                  current.game.project,
                  current.runtime,
                  optionId,
                ),
              }
            : current);
        }}
        onPause={() => {
          if (gameplayInteractionBlockedRef.current) {
            return;
          }
          setState((current) => current.kind === 'game'
            ? { ...current, paused: true }
            : current);
        }}
        onResume={() => {
          if (gameplayInteractionBlockedRef.current) {
            return;
          }
          setState((current) => current.kind === 'game'
            ? { ...current, paused: false }
            : current);
        }}
        onSave={() => void openSaveDialog('save')}
        onLoad={() => void openSaveDialog('load')}
        onQuickSave={() => void runQuickOperation('save')}
        onQuickLoad={() => void runQuickOperation('load')}
        onOptions={openOptions}
        onRestart={() => start(state.game)}
        onOpenGame={() => void openGame()}
        onExit={exitGame}
      />
    );
  }

  return (
    <>
      {content}
      {canOpenGame && openError !== null ? (
        <OpenErrorDialog
          message={openError}
          returnFocusTo={openGameTriggerRef.current}
          onClose={closeOpenError}
          onRetry={() => {
            closeOpenError();
            void openGame();
          }}
        />
      ) : null}
      {saveDialog !== null ? (
        <SaveSlotDialog
          mode={saveDialog.mode}
          slots={saveDialog.slots}
          loading={saveDialog.loading}
          busySlotId={saveDialog.busySlotId}
          error={saveDialog.error}
          onSelectSlot={(slotId) => void selectSaveSlot(slotId)}
          onClose={closeSaveDialog}
        />
      ) : null}
      {optionsOpen ? (
        <OptionsDialog
          settings={settings}
          busy={settingsBusy}
          error={settingsError}
          openingGame={openingGame}
          onPreviewSettingsChange={previewSettings}
          onCommitSettings={(next) => void commitSettings(next)}
          onReset={resetSettings}
          onOpenGame={canOpenGame ? () => {
            closeOptions();
            void openGame();
          } : undefined}
          onClose={closeOptions}
        />
      ) : null}
      {saveToast !== null ? (
        <p
          className={`player-save-toast${
            saveToast.kind === 'error' ? ' is-error' : ''
          }`}
          role={saveToast.kind === 'error' ? 'alert' : 'status'}
        >
          {saveToast.message}
        </p>
      ) : null}
    </>
  );
}
