import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import {
  DEFAULT_PLAYER_LANGUAGE,
  getPlayerUiLabels,
  type PlayerLanguage,
  type PlayerUiLabels,
} from './localization';

export type PlayerUiLocalization = {
  language: PlayerLanguage;
  labels: PlayerUiLabels;
};

export type PlayerUiProviderProps = PropsWithChildren<{
  language: PlayerLanguage;
  labels?: PlayerUiLabels;
}>;

const DEFAULT_LOCALIZATION: PlayerUiLocalization = {
  language: DEFAULT_PLAYER_LANGUAGE,
  labels: getPlayerUiLabels(DEFAULT_PLAYER_LANGUAGE),
};

const PlayerUiContext = createContext<PlayerUiLocalization>(
  DEFAULT_LOCALIZATION,
);

export function PlayerUiProvider({
  language,
  labels,
  children,
}: PlayerUiProviderProps) {
  const value = useMemo<PlayerUiLocalization>(() => ({
    language,
    labels: labels ?? getPlayerUiLabels(language),
  }), [labels, language]);

  return (
    <PlayerUiContext.Provider value={value}>
      {children}
    </PlayerUiContext.Provider>
  );
}

export function usePlayerUiLocalization(
  language?: PlayerLanguage,
  labels?: PlayerUiLabels,
): PlayerUiLocalization {
  const context = useContext(PlayerUiContext);
  if (labels !== undefined) {
    return {
      language: language ?? labels.locale,
      labels,
    };
  }
  if (language !== undefined) {
    return {
      language,
      labels: getPlayerUiLabels(language),
    };
  }
  return context;
}

export function usePlayerUiLabels(
  language?: PlayerLanguage,
  labels?: PlayerUiLabels,
): PlayerUiLabels {
  return usePlayerUiLocalization(language, labels).labels;
}

export function usePlayerLanguage(
  language?: PlayerLanguage,
  labels?: PlayerUiLabels,
): PlayerLanguage {
  return usePlayerUiLocalization(language, labels).language;
}
