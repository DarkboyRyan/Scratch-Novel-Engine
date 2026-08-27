import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  DEFAULT_PLAYER_LANGUAGE,
  resolvePlayerUiLabels,
  type PlayerLanguage,
  type PlayerUiLabels,
  type PlayerUiLocalizationProps,
} from './localization';
import { usePlayerUiLocalization } from './PlayerUiProvider';

export type SaveSlotId = 1 | 2 | 3 | 'quick';

export type SaveSlotSummary = {
  slotId: SaveSlotId;
  savedAt: string | null;
  sceneName: string | null;
  summary: string | null;
};

export type SaveSlotDialogProps = PlayerUiLocalizationProps & {
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

export function formatSaveTimestamp(
  savedAt: string | null,
  language: PlayerLanguage = DEFAULT_PLAYER_LANGUAGE,
  labelsOverride?: PlayerUiLabels,
): string {
  const labels = resolvePlayerUiLabels(language, labelsOverride).saves;
  if (savedAt === null) {
    return labels.emptySlot;
  }
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return labels.unknownTime;
  }
  return new Intl.DateTimeFormat(language, {
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
  language,
  labels: labelsOverride,
  mode,
  slots,
  loading = false,
  busySlotId = null,
  error = null,
  onSelectSlot,
  onClose,
}: SaveSlotDialogProps) {
  const { language: activeLanguage, labels: allLabels } =
    usePlayerUiLocalization(language, labelsOverride);
  const labels = allLabels.saves;
  const slotIdPrefix = useId();
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
      aria-label={mode === 'save' ? labels.saveTitle : labels.loadTitle}
      tabIndex={-1}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <section className="player-save-card">
        <header className="player-save-header">
          <div>
            <p className="player-eyebrow">
              {mode === 'save' ? labels.saveEyebrow : labels.loadEyebrow}
            </p>
            <h2>{mode === 'save' ? labels.saveTitle : labels.loadTitle}</h2>
          </div>
          <button
            type="button"
            className="player-save-close secondary"
            aria-label={labels.closeAria}
            disabled={busySlotId !== null}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {confirmSlot !== null ? (
          <div className="player-save-confirm" role="alert">
            <strong>{labels.overwriteSlot(confirmSlot.slotId as number)}</strong>
            <p>{labels.overwriteDescription}</p>
            <div className="player-save-confirm-actions">
              <button
                type="button"
                className="secondary"
                disabled={busySlotId !== null}
                onClick={() => setConfirmSlotId(null)}
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                disabled={busySlotId !== null}
                onClick={() => onSelectSlot(confirmSlot.slotId)}
              >
                {busySlotId === confirmSlot.slotId
                  ? labels.overwriting
                  : labels.confirmOverwrite}
              </button>
            </div>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="player-save-loading" role="status">
                {labels.loadingSlots}
              </p>
            ) : (
              <div className="player-save-slots">
                {normalizedSlots.map((slot) => {
                  const occupied = slot.savedAt !== null;
                  const busy = busySlotId === slot.slotId;
                  const slotLabel = slot.slotId === 'quick'
                    ? labels.quickSlot
                    : labels.manualSlot(slot.slotId);
                  const slotBaseId = `${slotIdPrefix}-slot-${slot.slotId}`;
                  const actionId = `${slotBaseId}-action`;
                  const timeId = `${slotBaseId}-time`;
                  const sceneId = `${slotBaseId}-scene`;
                  const summaryId = `${slotBaseId}-summary`;
                  return (
                    <button
                      key={slot.slotId}
                      type="button"
                      className={`player-save-slot${occupied ? ' is-occupied' : ' is-empty'}`}
                      data-save-slot-id={slot.slotId}
                      data-save-slot-mode={mode}
                      aria-labelledby={actionId}
                      aria-describedby={`${timeId} ${sceneId} ${summaryId}`}
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
                      <span id={actionId} hidden>
                        {mode === 'save'
                          ? labels.saveToSlotAria(slotLabel)
                          : labels.loadSlotAria(slotLabel)}
                      </span>
                      <span className="player-save-slot-number">
                        {slotLabel}
                      </span>
                      <span id={timeId} className="player-save-slot-time">
                        {busy
                          ? labels.processing
                          : formatSaveTimestamp(
                              slot.savedAt,
                              activeLanguage,
                              allLabels,
                            )}
                      </span>
                      <strong id={sceneId}>
                        {slot.sceneName ?? (
                          occupied ? labels.unknownScene : labels.notSaved
                        )}
                      </strong>
                      <span id={summaryId} className="player-save-slot-summary">
                        {slot.summary ?? (occupied
                          ? labels.noSummary
                          : mode === 'save'
                            ? labels.saveSlotHint
                            : labels.loadSlotHint)}
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
