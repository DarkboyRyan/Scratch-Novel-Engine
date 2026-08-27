import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createDefaultEditorSettings,
  type EditorLanguage,
  type EditorSettings,
} from '../../shared/editorSettingsProtocol';
import {
  isEditorSettingsRestartRequiredError,
  readEditorSettings,
  subscribeEditorSettings,
  updateEditorSettings,
} from '../application/editorSettingsGateway';

export type EditorSettingsState = {
  settings: EditorSettings | null;
  isSaving: boolean;
  saveFailed: boolean;
  restartRequired: boolean;
  changeLanguage(language: EditorLanguage): Promise<void>;
  dismissSaveError(): void;
};

export function useEditorSettings(): EditorSettingsState {
  const [settings, setSettings] = useState<EditorSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const authoritativeRef = useRef<EditorSettings>(
    createDefaultEditorSettings(),
  );
  const settingsRef = useRef<EditorSettings | null>(null);
  const authoritativeGenerationRef = useRef(0);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);

  const acceptAuthoritative = useCallback((next: EditorSettings): void => {
    authoritativeGenerationRef.current += 1;
    authoritativeRef.current = { ...next };
    settingsRef.current = { ...next };
    setSettings({ ...next });
    setSaveFailed(false);
    setRestartRequired(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe = (): void => {};
    const readGeneration = authoritativeGenerationRef.current;
    const useDefaultAfterReadFailure = (error?: unknown): void => {
      if (
        mountedRef.current &&
        authoritativeGenerationRef.current === readGeneration
      ) {
        const fallback = createDefaultEditorSettings();
        authoritativeRef.current = fallback;
        settingsRef.current = fallback;
        setSettings(fallback);
        const requiresRestart = isEditorSettingsRestartRequiredError(error);
        setRestartRequired(requiresRestart);
        setSaveFailed(!requiresRestart);
      }
    };
    try {
      unsubscribe = subscribeEditorSettings((next) => {
        if (mountedRef.current) {
          acceptAuthoritative(next);
        }
      });
      void readEditorSettings()
        .then((result) => {
          if (!mountedRef.current) {
            return;
          }
          if (
            result.status === 'ready' &&
            authoritativeGenerationRef.current === readGeneration
          ) {
            acceptAuthoritative(result.settings);
          } else if (result.status === 'rejected') {
            useDefaultAfterReadFailure();
          }
        })
        .catch((error: unknown) => useDefaultAfterReadFailure(error));
    } catch (error) {
      useDefaultAfterReadFailure(error);
    }
    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, [acceptAuthoritative]);

  const changeLanguage = async (
    language: EditorLanguage,
  ): Promise<void> => {
    const current = settingsRef.current;
    if (
      current === null ||
      savingRef.current ||
      restartRequired ||
      language === current.language
    ) {
      return;
    }
    const requestGeneration = authoritativeGenerationRef.current;
    const optimistic = { ...current, language };
    settingsRef.current = optimistic;
    setSettings(optimistic);
    setSaveFailed(false);
    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await updateEditorSettings({ language });
      if (
        mountedRef.current &&
        authoritativeGenerationRef.current === requestGeneration
      ) {
        if (result.status === 'updated') {
          acceptAuthoritative(result.settings);
        } else {
          settingsRef.current = { ...authoritativeRef.current };
          setSettings({ ...authoritativeRef.current });
          setSaveFailed(true);
        }
      }
    } catch (error) {
      if (
        mountedRef.current &&
        authoritativeGenerationRef.current === requestGeneration
      ) {
        settingsRef.current = { ...authoritativeRef.current };
        setSettings({ ...authoritativeRef.current });
        const requiresRestart = isEditorSettingsRestartRequiredError(error);
        setRestartRequired(requiresRestart);
        setSaveFailed(!requiresRestart);
      }
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  return {
    settings,
    isSaving,
    saveFailed,
    restartRequired,
    changeLanguage,
    dismissSaveError: () => setSaveFailed(false),
  };
}
