import type { PointerEvent } from 'react';

export type GameActionBarProps = {
  disabled?: boolean;
  quickSaveBusy?: boolean;
  quickLoadBusy?: boolean;
  onSave: () => void;
  onLoad: () => void;
  onQuickSave: () => void;
  onQuickLoad: () => void;
  onOptions: () => void;
  onExit: () => void;
};

export function GameActionBar({
  disabled = false,
  quickSaveBusy = false,
  quickLoadBusy = false,
  onSave,
  onLoad,
  onQuickSave,
  onQuickLoad,
  onOptions,
  onExit,
}: GameActionBarProps) {
  const stopPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };
  return (
    <nav
      className="player-game-action-bar"
      aria-label="游戏操作"
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onSave}
      >
        保存
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onLoad}
      >
        读取
      </button>
      <button
        type="button"
        disabled={disabled || quickSaveBusy}
        onPointerUp={stopPointerUp}
        onClick={onQuickSave}
      >
        {quickSaveBusy ? '保存中…' : '快速保存'}
      </button>
      <button
        type="button"
        disabled={disabled || quickLoadBusy}
        onPointerUp={stopPointerUp}
        onClick={onQuickLoad}
      >
        {quickLoadBusy ? '读取中…' : '快速读取'}
      </button>
      <button
        type="button"
        disabled
        title="暂未开放"
        onPointerUp={stopPointerUp}
      >
        快进
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onOptions}
      >
        选项
      </button>
      <button
        type="button"
        disabled={disabled}
        onPointerUp={stopPointerUp}
        onClick={onExit}
      >
        退出游戏
      </button>
    </nav>
  );
}
