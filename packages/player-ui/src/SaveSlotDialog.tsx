import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type SaveSlotId = 1 | 2 | 3 | 'quick';

export type SaveSlotSummary = {
  slotId: SaveSlotId;
  savedAt: string | null;
  sceneName: string | null;
  summary: string | null;
};

export type SaveSlotDialogProps = {
  mode: 'save' | 'load';
  slots: readonly SaveSlotSummary[];
  loading?: boolean;
  busySlotId?: SaveSlotId | null;
  error?: string | null;
  onSelectSlot: (slotId: SaveSlotId) => void;
  onClose: () => void;
};

const MANUAL_SLOT_IDS = [1, 2, 3] as const;
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

function emptySlot(slotId: SaveSlotId): SaveSlotSummary {
  return {
    slotId,
    savedAt: null,
    sceneName: null,
    summary: null,
  };
}

export function formatSaveTimestamp(savedAt: string | null): string {
  if (savedAt === null) {
    return '空存档';
  }
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return '时间未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function SaveSlotDialog({
  mode,
  slots,
  loading = false,
  busySlotId = null,
  error = null,
  onSelectSlot,
  onClose,
}: SaveSlotDialogProps) {
  const [confirmSlotId, setConfirmSlotId] = useState<number | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const normalizedSlots = useMemo(
    () => {
      const manualSlots = MANUAL_SLOT_IDS.map(
        (slotId) =>
          slots.find((slot) => slot.slotId === slotId) ?? emptySlot(slotId),
      );
      return mode === 'load'
        ? [
            ...manualSlots,
            slots.find((slot) => slot.slotId === 'quick') ?? emptySlot('quick'),
          ]
        : manualSlots;
    },
    [mode, slots],
  );
  const confirmSlot = confirmSlotId === null
    ? null
    : normalizedSlots.find((slot) => slot.slotId === confirmSlotId) ?? null;

  useLayoutEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const layer = layerRef.current;
    (layer === null ? null : focusableElements(layer)[0] ?? layer)?.focus();
    return () => {
      const previousFocus = previousFocusRef.current;
      // The owning view may remove `inert`/`disabled` in the same React
      // commit that unmounts this dialog. Restore after that commit has fully
      // settled so the original trigger is focusable again.
      queueMicrotask(() => {
        if (
          previousFocus?.isConnected &&
          !previousFocus.matches(':disabled') &&
          previousFocus.closest('[inert]') === null
        ) {
          previousFocus.focus();
        }
      });
    };
  }, []);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (
      layer !== null &&
      (!(document.activeElement instanceof HTMLElement) ||
        !layer.contains(document.activeElement) ||
        document.activeElement.matches(':disabled'))
    ) {
      (focusableElements(layer)[0] ?? layer).focus();
    }
  }, [busySlotId, confirmSlotId, loading]);

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
      if (busySlotId !== null) {
        return;
      }
      if (confirmSlotId !== null) {
        setConfirmSlotId(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, {
      capture: true,
    });
  }, [busySlotId, confirmSlotId, onClose]);

  return (
    <div
      ref={layerRef}
      className="player-save-layer"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'save' ? '保存游戏' : '读取游戏'}
      tabIndex={-1}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section className="player-save-card">
        <header className="player-save-header">
          <div>
            <p className="player-eyebrow">{mode === 'save' ? 'SAVE' : 'LOAD'}</p>
            <h2>{mode === 'save' ? '保存游戏' : '读取游戏'}</h2>
          </div>
          <button
            type="button"
            className="player-save-close secondary"
            aria-label="关闭存档窗口"
            disabled={busySlotId !== null}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {confirmSlot !== null ? (
          <div className="player-save-confirm" role="alert">
            <strong>覆盖存档 {confirmSlot.slotId}？</strong>
            <p>原有进度将被当前游戏进度替换。</p>
            <div className="player-save-confirm-actions">
              <button
                type="button"
                className="secondary"
                disabled={busySlotId !== null}
                onClick={() => setConfirmSlotId(null)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busySlotId !== null}
                onClick={() => onSelectSlot(confirmSlot.slotId)}
              >
                {busySlotId === confirmSlot.slotId ? '正在覆盖…' : '确认覆盖'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="player-save-loading" role="status">
                正在读取存档信息…
              </p>
            ) : (
              <div className="player-save-slots">
                {normalizedSlots.map((slot) => {
                  const occupied = slot.savedAt !== null;
                  const busy = busySlotId === slot.slotId;
                  const slotLabel = slot.slotId === 'quick'
                    ? '快速存档'
                    : `存档 ${slot.slotId}`;
                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      className={`player-save-slot${occupied ? ' is-occupied' : ' is-empty'}`}
                      aria-label={`${mode === 'save' ? '存入' : '读取'}${slotLabel}`}
                      disabled={
                        busySlotId !== null ||
                        error !== null ||
                        (mode === 'load' && !occupied)
                      }
                      onClick={() => {
                        if (
                          mode === 'save' &&
                          occupied &&
                          typeof slot.slotId === 'number'
                        ) {
                          setConfirmSlotId(slot.slotId);
                        } else {
                          onSelectSlot(slot.slotId);
                        }
                      }}
                    >
                      <span className="player-save-slot-number">
                        {slotLabel}
                      </span>
                      <span className="player-save-slot-time">
                        {busy ? '正在处理…' : formatSaveTimestamp(slot.savedAt)}
                      </span>
                      <strong>{slot.sceneName ?? (occupied ? '未知场景' : '未保存')}</strong>
                      <span className="player-save-slot-summary">
                        {slot.summary ?? (occupied
                          ? '暂无摘要'
                          : mode === 'save'
                            ? '选择此槽位保存当前进度'
                            : '此槽位尚无存档')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {error !== null ? (
          <p className="player-save-error" role="alert">{error}</p>
        ) : null}
      </section>
    </div>
  );
}
