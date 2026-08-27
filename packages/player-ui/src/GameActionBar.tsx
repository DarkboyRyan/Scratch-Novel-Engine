/**
 * 主要作用：渲染保存、读取、快存、快读、快进、选项和返回标题操作栏。
 * 关键函数与实现：`GameActionBarProps`、`GameActionBar`；基于 React 组件、Hooks、可访问交互与受控状态实现。
 */
import type { PointerEvent } from 'react';

import type { PlayerUiLocalizationProps } from './localization';
import { usePlayerUiLabels } from './PlayerUiProvider';

export type GameActionBarProps = PlayerUiLocalizationProps & {
  disabled?: boolean;
  fastForwardActive?: boolean;
  quickSaveBusy?: boolean;
  quickLoadBusy?: boolean;
  onSave: () => void;
  onLoad: () => void;
  onQuickSave: () => void;
  onQuickLoad: () => void;
  onToggleFastForward: () => void;
  onOptions: () => void;
  onReturnToTitle: () => void;
};

export function GameActionBar({
  language,
  labels: labelsOverride,
  disabled = false,
  fastForwardActive = false,
  quickSaveBusy = false,
  quickLoadBusy = false,
  onSave,
  onLoad,
  onQuickSave,
  onQuickLoad,
  onToggleFastForward,
  onOptions,
  onReturnToTitle,
}: GameActionBarProps) {
  const labels = usePlayerUiLabels(language, labelsOverride).actionBar;
  const stopPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };
  return (
    <nav
      className="player-game-action-bar"
      aria-label={labels.ariaLabel}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onSave}
      >
        {labels.save}
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onLoad}
      >
        {labels.load}
      </button>
      <button
        type="button"
        disabled={disabled || quickSaveBusy}
        onPointerUp={stopPointerUp}
        onClick={onQuickSave}
      >
        {quickSaveBusy ? labels.saving : labels.quickSave}
      </button>
      <button
        type="button"
        disabled={disabled || quickLoadBusy}
        onPointerUp={stopPointerUp}
        onClick={onQuickLoad}
      >
        {quickLoadBusy ? labels.loading : labels.quickLoad}
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-keyshortcuts="Space"
        aria-pressed={fastForwardActive}
        title={fastForwardActive
          ? labels.disableFastForward
          : labels.enableFastForward}
        onPointerUp={stopPointerUp}
        onClick={onToggleFastForward}
      >
        {labels.fastForward}
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onOptions}
      >
        {labels.options}
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onReturnToTitle}
      >
        {labels.returnToTitle}
      </button>
    </nav>
  );
}
