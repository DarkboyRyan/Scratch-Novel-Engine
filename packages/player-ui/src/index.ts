/**
 * 主要作用：集中导出 Player UI 的公共组件、Hooks、类型和工具。
 * 关键函数与实现：Player UI 公共 API 转发；以 TypeScript 类型边界和可组合函数实现。
 */
export {
  CgGallery,
  type CgGalleryProps,
} from './CgGallery';
export {
  GameActionBar,
  type GameActionBarProps,
} from './GameActionBar';
export {
  SaveSlotDialog,
  formatSaveTimestamp,
  type SaveSlotId,
  type SaveSlotDialogProps,
  type SaveSlotSummary,
} from './SaveSlotDialog';
export {
  DEFAULT_CHARACTER_SLOT_POSITIONS,
  VisualStage,
  type PreviewCharacter,
  type VisualStageProps,
} from './VisualStage';
export {
  PreviewVideo,
  type PreviewVideoProps,
} from './PreviewVideo';
export {
  TitleScreen,
  type TitleScreenProps,
} from './TitleScreen';
export {
  OptionsDialog,
  type OptionsDialogProps,
  type OptionsSettingsValue,
} from './OptionsDialog';
export {
  clampMediaVolume,
  effectiveMediaVolume,
} from './mediaVolume';
export {
  calculateAutoFitScale,
  useAutoFitScale,
  type AutoFitScaleRefs,
} from './useAutoFitScale';
export {
  createPreviewAudioController,
  type PreviewAudioController,
  type PreviewAudioControllerOptions,
  type PreviewAudioElement,
  type PreviewAudioSyncOptions,
} from './previewAudioController';
export { usePreviewAudio } from './usePreviewAudio';
export type { MediaUrlResolver } from './mediaPort';
export {
  DEFAULT_PLAYER_LANGUAGE,
  PLAYER_LANGUAGES,
  PLAYER_UI_LABELS,
  getPlayerUiLabels,
  normalizePlayerLanguage,
  resolvePlayerUiLabels,
  type PlayerLanguage,
  type PlayerUiErrorCode,
  type PlayerUiLabels,
  type PlayerUiLocalizationProps,
} from './localization';
export {
  PlayerUiProvider,
  usePlayerLanguage,
  usePlayerUiLabels,
  usePlayerUiLocalization,
  type PlayerUiLocalization,
  type PlayerUiProviderProps,
} from './PlayerUiProvider';
