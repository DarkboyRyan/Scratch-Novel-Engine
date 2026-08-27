export const PLAYER_LANGUAGES = ['zh-CN', 'en-US'] as const;

export type PlayerLanguage = typeof PLAYER_LANGUAGES[number];

export type PlayerUiErrorCode =
  | 'bundle-load-failed'
  | 'bundle-selection-failed'
  | 'embedded-open-disabled'
  | 'no-active-game'
  | 'save-storage-unavailable'
  | 'runtime-not-saveable'
  | 'save-incompatible'
  | 'game-session-stale'
  | 'settings-storage-unavailable'
  | 'settings-invalid'
  | 'web-open-disabled'
  | 'web-game-not-loaded'
  | 'fullscreen-denied';

export type PlayerUiLabels = {
  locale: PlayerLanguage;
  common: {
    back: string;
    options: string;
    openingGame: string;
    openOtherGame: string;
    restart: string;
    returnToTitle: string;
    closeWithEscape: string;
  };
  errors: Record<PlayerUiErrorCode, string>;
  shell: {
    loadingGame: string;
    emptyEyebrow: string;
    emptyTitle: string;
    emptyDescription: string;
    selectGamePackage: string;
    errorEyebrow: string;
    errorTitle: string;
    selectOtherGamePackage: string;
    exitGame: string;
    openErrorAria: string;
    openErrorTitle: string;
    settingsReadFallback: string;
    embeddedGameMissing: string;
    bundleReadFailed: string;
    windowSettingsSyncFailed: string;
    settingsApplyFailed: string;
    openBundleFailed: string;
    entrySceneMissing: string;
    saveSlotsReadFailed: string;
    progressNotSaveable: string;
    savedToSlot: (slotId: number) => string;
    loadedQuickSave: string;
    loadedSlot: (slotId: number) => string;
    slotEmpty: string;
    saveFailed: string;
    loadFailed: string;
    quickSaveComplete: string;
    quickLoadComplete: string;
    noQuickSave: string;
    quickSaveFailed: string;
    quickLoadFailed: string;
  };
  title: {
    eyebrow: string;
    untitledGame: string;
    startGame: string;
    loadGame: string;
    loadingSave: string;
    cgGallery: string;
    options: string;
    exitGame: string;
  };
  actionBar: {
    ariaLabel: string;
    save: string;
    load: string;
    quickSave: string;
    quickLoad: string;
    saving: string;
    loading: string;
    fastForward: string;
    enableFastForward: string;
    disableFastForward: string;
    options: string;
    returnToTitle: string;
  };
  options: {
    eyebrow: string;
    title: string;
    closeAria: string;
    loadingSettings: string;
    languageSection: string;
    language: string;
    languageNames: Record<PlayerLanguage, string>;
    volumeSection: string;
    masterVolume: string;
    bgmVolume: string;
    voiceVolume: string;
    videoVolume: string;
    displaySection: string;
    windowMode: string;
    windowed: string;
    fullscreen: string;
    windowSize: string;
    smallWindow: string;
    mediumWindow: string;
    largeWindow: string;
    fullscreenHelp: string;
    windowControlsUnavailable: string;
    browserWindowSizeUnavailable: string;
    applyingSettings: string;
    resetDefaults: string;
    back: string;
  };
  saves: {
    saveEyebrow: string;
    loadEyebrow: string;
    saveTitle: string;
    loadTitle: string;
    closeAria: string;
    overwriteSlot: (slotId: number) => string;
    overwriteDescription: string;
    cancel: string;
    overwriting: string;
    confirmOverwrite: string;
    loadingSlots: string;
    quickSlot: string;
    manualSlot: (slotId: number) => string;
    saveToSlotAria: (slotLabel: string) => string;
    loadSlotAria: (slotLabel: string) => string;
    processing: string;
    emptySlot: string;
    unknownTime: string;
    unknownScene: string;
    notSaved: string;
    noSummary: string;
    saveSlotHint: string;
    loadSlotHint: string;
    dialogueSummary: (speaker: string, text: string) => string;
    progressSummary: string;
    choosingSummary: string;
    playingVideoSummary: string;
    finishedSummary: string;
  };
  cgGallery: {
    eyebrow: string;
    title: string;
    closeAria: string;
    emptyThumbnailAria: (imageNumber: number) => string;
    enlargeThumbnailAria: (imageNumber: number) => string;
    empty: string;
    imageLoadFailed: string;
    loadingImage: string;
    imageAlt: (imageNumber: number) => string;
    paginationAria: string;
    previousPage: string;
    nextPage: string;
    enlargedAria: (imageNumber: number) => string;
    closeEnlargedAria: string;
    enlargedCaption: (imageNumber: number) => string;
  };
  game: {
    screenAria: string;
    missingCharacter: string;
    noBackground: string;
    choicesAria: string;
    unnamedChoice: string;
    pauseMenuAria: string;
    pausedEyebrow: string;
    pausedTitle: string;
    continueGame: string;
    endAria: string;
    endEyebrow: string;
    endTitle: string;
    runtimeErrorAria: string;
    runtimeErrorEyebrow: string;
    runtimeErrorTitle: string;
    runtimeErrorFallback: string;
    pauseAria: string;
    pauseTitle: string;
  };
  visualStage: {
    previewPlaceholder: string;
    unknownImage: string;
    backgroundLoadFailed: (backgroundName: string) => string;
  };
  video: {
    unavailable: string;
    readFailed: string;
    autoplayBlocked: string;
    decodeFailed: string;
    ariaLabel: string;
    skippableAriaLabel: string;
    loading: string;
  };
};

const ZH_CN_LABELS: PlayerUiLabels = {
  locale: 'zh-CN',
  common: {
    back: '返回',
    options: '选项',
    openingGame: '正在打开…',
    openOtherGame: '打开其他游戏',
    restart: '重新开始',
    returnToTitle: '返回标题',
    closeWithEscape: '关闭（Esc）',
  },
  errors: {
    'bundle-load-failed': '无法读取游戏内容包，请重新安装或联系游戏作者。',
    'bundle-selection-failed': '无法打开游戏内容包，请重试。',
    'embedded-open-disabled': '内嵌游戏不支持打开其他游戏内容包。',
    'no-active-game': '当前没有可用的游戏内容。',
    'save-storage-unavailable': '无法访问存档，请检查存储权限后重试。',
    'runtime-not-saveable': '当前进度暂时无法保存，请继续游戏后重试。',
    'save-incompatible': '存档与当前游戏不兼容或已经损坏。',
    'game-session-stale': '游戏内容已经变化，请重新进入游戏后重试。',
    'settings-storage-unavailable': '无法访问设置存储，请重试。',
    'settings-invalid': '设置值无效，请重新选择。',
    'web-open-disabled': 'Web Player 不支持打开其他游戏内容包。',
    'web-game-not-loaded': 'Web 游戏内容尚未载入。',
    'fullscreen-denied': '浏览器未允许进入全屏，请再次操作或检查权限。',
  },
  shell: {
    loadingGame: '正在载入游戏…',
    emptyEyebrow: 'VN ENGINE PLAYER',
    emptyTitle: '打开游戏',
    emptyDescription: '请选择一个名称以 .vngame 结尾的游戏目录包。',
    selectGamePackage: '选择游戏包',
    errorEyebrow: 'LOAD ERROR',
    errorTitle: '游戏无法载入',
    selectOtherGamePackage: '选择其他游戏包',
    exitGame: '退出游戏',
    openErrorAria: '内容包未打开',
    openErrorTitle: '内容包未打开',
    settingsReadFallback: '无法读取设置，已使用默认值。',
    embeddedGameMissing: '内嵌游戏内容缺失，请重新安装游戏。',
    bundleReadFailed: '无法读取游戏内容包，请重新安装或联系游戏作者。',
    windowSettingsSyncFailed: '无法同步当前窗口设置。',
    settingsApplyFailed: '设置未能应用，请重试。',
    openBundleFailed: '无法打开游戏内容包，请重试。',
    entrySceneMissing: '游戏入口场景不存在，内容包可能已经损坏。',
    saveSlotsReadFailed: '无法读取存档信息，请重试。',
    progressNotSaveable: '当前进度暂时无法保存，请继续游戏后重试。',
    savedToSlot: (slotId) => `已保存到存档 ${slotId}`,
    loadedQuickSave: '已读取快速存档',
    loadedSlot: (slotId) => `已读取存档 ${slotId}`,
    slotEmpty: '该存档为空。',
    saveFailed: '保存失败，当前进度未受影响。',
    loadFailed: '读取失败，当前进度未受影响。',
    quickSaveComplete: '快速保存完成',
    quickLoadComplete: '快速读取完成',
    noQuickSave: '尚无快速存档',
    quickSaveFailed: '快速保存失败，当前进度未受影响。',
    quickLoadFailed: '快速读取失败，当前进度未受影响。',
  },
  title: {
    eyebrow: 'A VN ENGINE STORY',
    untitledGame: '未命名游戏',
    startGame: '开始游戏',
    loadGame: '读取游戏',
    loadingSave: '正在读取…',
    cgGallery: 'CG画廊',
    options: '选项',
    exitGame: '退出游戏',
  },
  actionBar: {
    ariaLabel: '游戏操作',
    save: '保存',
    load: '读取',
    quickSave: '快速保存',
    quickLoad: '快速读取',
    saving: '保存中…',
    loading: '读取中…',
    fastForward: '快进',
    enableFastForward: '开启快进（长按空格可临时快进）',
    disableFastForward: '关闭快进',
    options: '选项',
    returnToTitle: '返回标题',
  },
  options: {
    eyebrow: 'OPTIONS',
    title: '选项',
    closeAria: '关闭选项',
    loadingSettings: '正在读取设置…',
    languageSection: '语言',
    language: '界面语言',
    languageNames: { 'zh-CN': '中文', 'en-US': 'English' },
    volumeSection: '音量',
    masterVolume: '主音量',
    bgmVolume: '背景音乐',
    voiceVolume: '语音',
    videoVolume: '视频',
    displaySection: '显示',
    windowMode: '窗口模式',
    windowed: '窗口',
    fullscreen: '全屏',
    windowSize: '窗口尺寸',
    smallWindow: '小（960 × 600）',
    mediumWindow: '中（1280 × 800）',
    largeWindow: '大（1600 × 1000）',
    fullscreenHelp: '全屏模式会使用当前显示器尺寸；返回窗口模式后应用所选尺寸。',
    windowControlsUnavailable: '当前运行环境不支持切换窗口模式或窗口尺寸。',
    browserWindowSizeUnavailable: '浏览器支持全屏；窗口尺寸由浏览器和操作系统控制。',
    applyingSettings: '正在应用设置…',
    resetDefaults: '恢复默认',
    back: '返回',
  },
  saves: {
    saveEyebrow: 'SAVE',
    loadEyebrow: 'LOAD',
    saveTitle: '保存游戏',
    loadTitle: '读取游戏',
    closeAria: '关闭存档窗口',
    overwriteSlot: (slotId) => `覆盖存档 ${slotId}？`,
    overwriteDescription: '原有进度将被当前游戏进度替换。',
    cancel: '取消',
    overwriting: '正在覆盖…',
    confirmOverwrite: '确认覆盖',
    loadingSlots: '正在读取存档信息…',
    quickSlot: '快速存档',
    manualSlot: (slotId) => `存档 ${slotId}`,
    saveToSlotAria: (slotLabel) => `存入${slotLabel}`,
    loadSlotAria: (slotLabel) => `读取${slotLabel}`,
    processing: '正在处理…',
    emptySlot: '空存档',
    unknownTime: '时间未知',
    unknownScene: '未知场景',
    notSaved: '未保存',
    noSummary: '暂无摘要',
    saveSlotHint: '选择此槽位保存当前进度',
    loadSlotHint: '此槽位尚无存档',
    dialogueSummary: (speaker, text) => speaker.length > 0
      ? `${speaker}：${text}`
      : text,
    progressSummary: '剧情进行中',
    choosingSummary: '等待选择',
    playingVideoSummary: '正在播放过场动画',
    finishedSummary: '剧情结束',
  },
  cgGallery: {
    eyebrow: 'CG GALLERY',
    title: 'CG画廊',
    closeAria: '关闭CG画廊',
    emptyThumbnailAria: (imageNumber) => `CG ${imageNumber}：无`,
    enlargeThumbnailAria: (imageNumber) => `放大 CG ${imageNumber}`,
    empty: '无',
    imageLoadFailed: '图片无法读取',
    loadingImage: '正在载入…',
    imageAlt: (imageNumber) => `CG ${imageNumber}`,
    paginationAria: 'CG画廊分页',
    previousPage: '上一页',
    nextPage: '下一页',
    enlargedAria: (imageNumber) => `CG ${imageNumber} 大图`,
    closeEnlargedAria: '关闭CG大图',
    enlargedCaption: (imageNumber) => `CG ${imageNumber}`,
  },
  game: {
    screenAria: '游戏画面',
    missingCharacter: '缺失立绘',
    noBackground: '暂无背景',
    choicesAria: '请选择接下来的行动',
    unnamedChoice: '未命名选项',
    pauseMenuAria: '暂停菜单',
    pausedEyebrow: 'PAUSED',
    pausedTitle: '游戏已暂停',
    continueGame: '继续游戏',
    endAria: '游戏结束',
    endEyebrow: 'THE END',
    endTitle: '故事结束',
    runtimeErrorAria: '运行错误',
    runtimeErrorEyebrow: 'RUNTIME ERROR',
    runtimeErrorTitle: '游戏无法继续',
    runtimeErrorFallback: '剧情数据发生错误。',
    pauseAria: '暂停游戏',
    pauseTitle: '暂停游戏（Esc）',
  },
  visualStage: {
    previewPlaceholder: '预览界面',
    unknownImage: '未知图片',
    backgroundLoadFailed: (backgroundName) => `无法读取背景：${backgroundName}`,
  },
  video: {
    unavailable: '视频资源不可用，按 Enter 跳过后继续剧情',
    readFailed: '视频资源读取失败，按 Enter 跳过后继续剧情',
    autoplayBlocked: '自动播放被阻止，按 Enter 跳过后继续剧情',
    decodeFailed: '视频无法解码或已损坏，按 Enter 跳过后继续剧情',
    ariaLabel: '剧情视频',
    skippableAriaLabel: '剧情视频，按 Enter 跳过',
    loading: '正在加载视频…',
  },
};

const EN_US_LABELS: PlayerUiLabels = {
  locale: 'en-US',
  common: {
    back: 'Back',
    options: 'Options',
    openingGame: 'Opening…',
    openOtherGame: 'Open Another Game',
    restart: 'Restart',
    returnToTitle: 'Return to Title',
    closeWithEscape: 'Close (Esc)',
  },
  errors: {
    'bundle-load-failed': 'The game package could not be loaded. Reinstall it or contact the author.',
    'bundle-selection-failed': 'The game package could not be opened. Try again.',
    'embedded-open-disabled': 'Embedded games cannot open another game package.',
    'no-active-game': 'No active game is available.',
    'save-storage-unavailable': 'Save storage is unavailable. Check storage permissions and try again.',
    'runtime-not-saveable': 'This progress cannot be saved yet. Continue the game and try again.',
    'save-incompatible': 'This save is incompatible with the current game or is damaged.',
    'game-session-stale': 'The game content has changed. Re-enter the game and try again.',
    'settings-storage-unavailable': 'Settings storage is unavailable. Try again.',
    'settings-invalid': 'The settings are invalid. Choose valid values and try again.',
    'web-open-disabled': 'Web Player cannot open another game package.',
    'web-game-not-loaded': 'The web game has not loaded yet.',
    'fullscreen-denied': 'Fullscreen was not allowed. Try again or check browser permissions.',
  },
  shell: {
    loadingGame: 'Loading game…',
    emptyEyebrow: 'VN ENGINE PLAYER',
    emptyTitle: 'Open Game',
    emptyDescription: 'Select a game directory package ending in .vngame.',
    selectGamePackage: 'Select Game Package',
    errorEyebrow: 'LOAD ERROR',
    errorTitle: 'Unable to Load Game',
    selectOtherGamePackage: 'Select Another Game Package',
    exitGame: 'Quit Game',
    openErrorAria: 'Game package not opened',
    openErrorTitle: 'Game Package Not Opened',
    settingsReadFallback: 'Settings could not be loaded. Defaults are in use.',
    embeddedGameMissing: 'Embedded game content is missing. Reinstall the game.',
    bundleReadFailed: 'The game package could not be read. Reinstall it or contact the author.',
    windowSettingsSyncFailed: 'The current window settings could not be synchronized.',
    settingsApplyFailed: 'Settings could not be applied. Try again.',
    openBundleFailed: 'The game package could not be opened. Try again.',
    entrySceneMissing: 'The game has no valid entry scene and may be damaged.',
    saveSlotsReadFailed: 'Save information could not be loaded. Try again.',
    progressNotSaveable: 'This progress cannot be saved yet. Continue the game and try again.',
    savedToSlot: (slotId) => `Saved to Slot ${slotId}`,
    loadedQuickSave: 'Quick save loaded',
    loadedSlot: (slotId) => `Loaded Slot ${slotId}`,
    slotEmpty: 'This save slot is empty.',
    saveFailed: 'Save failed. Your current progress was not changed.',
    loadFailed: 'Load failed. Your current progress was not changed.',
    quickSaveComplete: 'Quick save complete',
    quickLoadComplete: 'Quick load complete',
    noQuickSave: 'No quick save is available',
    quickSaveFailed: 'Quick save failed. Your current progress was not changed.',
    quickLoadFailed: 'Quick load failed. Your current progress was not changed.',
  },
  title: {
    eyebrow: 'A VN ENGINE STORY',
    untitledGame: 'Untitled Game',
    startGame: 'Start Game',
    loadGame: 'Load Game',
    loadingSave: 'Loading…',
    cgGallery: 'CG Gallery',
    options: 'Options',
    exitGame: 'Quit Game',
  },
  actionBar: {
    ariaLabel: 'Game controls',
    save: 'Save',
    load: 'Load',
    quickSave: 'Quick Save',
    quickLoad: 'Quick Load',
    saving: 'Saving…',
    loading: 'Loading…',
    fastForward: 'Fast Forward',
    enableFastForward: 'Enable fast forward (hold Space for temporary fast forward)',
    disableFastForward: 'Disable fast forward',
    options: 'Options',
    returnToTitle: 'Return to Title',
  },
  options: {
    eyebrow: 'OPTIONS',
    title: 'Options',
    closeAria: 'Close options',
    loadingSettings: 'Loading settings…',
    languageSection: 'Language',
    language: 'Interface Language',
    languageNames: { 'zh-CN': '中文', 'en-US': 'English' },
    volumeSection: 'Volume',
    masterVolume: 'Master Volume',
    bgmVolume: 'Background Music',
    voiceVolume: 'Voice',
    videoVolume: 'Video',
    displaySection: 'Display',
    windowMode: 'Window Mode',
    windowed: 'Windowed',
    fullscreen: 'Fullscreen',
    windowSize: 'Window Size',
    smallWindow: 'Small (960 × 600)',
    mediumWindow: 'Medium (1280 × 800)',
    largeWindow: 'Large (1600 × 1000)',
    fullscreenHelp: 'Fullscreen uses the current display size. The selected size applies after returning to windowed mode.',
    windowControlsUnavailable: 'This environment cannot change window mode or window size.',
    browserWindowSizeUnavailable: 'Fullscreen is available; window size is controlled by your browser and operating system.',
    applyingSettings: 'Applying settings…',
    resetDefaults: 'Restore Defaults',
    back: 'Back',
  },
  saves: {
    saveEyebrow: 'SAVE',
    loadEyebrow: 'LOAD',
    saveTitle: 'Save Game',
    loadTitle: 'Load Game',
    closeAria: 'Close save window',
    overwriteSlot: (slotId) => `Overwrite Slot ${slotId}?`,
    overwriteDescription: 'The existing progress will be replaced with your current progress.',
    cancel: 'Cancel',
    overwriting: 'Overwriting…',
    confirmOverwrite: 'Confirm Overwrite',
    loadingSlots: 'Loading save information…',
    quickSlot: 'Quick Save',
    manualSlot: (slotId) => `Slot ${slotId}`,
    saveToSlotAria: (slotLabel) => `Save to ${slotLabel}`,
    loadSlotAria: (slotLabel) => `Load ${slotLabel}`,
    processing: 'Processing…',
    emptySlot: 'Empty Slot',
    unknownTime: 'Unknown Time',
    unknownScene: 'Unknown Scene',
    notSaved: 'Not Saved',
    noSummary: 'No Summary',
    saveSlotHint: 'Select this slot to save current progress',
    loadSlotHint: 'This slot has no saved game',
    dialogueSummary: (speaker, text) => speaker.length > 0
      ? `${speaker}: ${text}`
      : text,
    progressSummary: 'Story in Progress',
    choosingSummary: 'Waiting for a Choice',
    playingVideoSummary: 'Playing a Cutscene',
    finishedSummary: 'Story Complete',
  },
  cgGallery: {
    eyebrow: 'CG GALLERY',
    title: 'CG Gallery',
    closeAria: 'Close CG gallery',
    emptyThumbnailAria: (imageNumber) => `CG ${imageNumber}: Empty`,
    enlargeThumbnailAria: (imageNumber) => `Enlarge CG ${imageNumber}`,
    empty: 'Empty',
    imageLoadFailed: 'Image unavailable',
    loadingImage: 'Loading…',
    imageAlt: (imageNumber) => `CG ${imageNumber}`,
    paginationAria: 'CG gallery pages',
    previousPage: 'Previous',
    nextPage: 'Next',
    enlargedAria: (imageNumber) => `Enlarged CG ${imageNumber}`,
    closeEnlargedAria: 'Close enlarged CG',
    enlargedCaption: (imageNumber) => `CG ${imageNumber}`,
  },
  game: {
    screenAria: 'Game screen',
    missingCharacter: 'Missing character image',
    noBackground: 'No background',
    choicesAria: 'Choose what happens next',
    unnamedChoice: 'Untitled Choice',
    pauseMenuAria: 'Pause menu',
    pausedEyebrow: 'PAUSED',
    pausedTitle: 'Game Paused',
    continueGame: 'Continue',
    endAria: 'Game finished',
    endEyebrow: 'THE END',
    endTitle: 'The End',
    runtimeErrorAria: 'Runtime error',
    runtimeErrorEyebrow: 'RUNTIME ERROR',
    runtimeErrorTitle: 'The Game Cannot Continue',
    runtimeErrorFallback: 'The story data contains an error.',
    pauseAria: 'Pause game',
    pauseTitle: 'Pause game (Esc)',
  },
  visualStage: {
    previewPlaceholder: 'Preview',
    unknownImage: 'Unknown Image',
    backgroundLoadFailed: (backgroundName) => `Unable to load background: ${backgroundName}`,
  },
  video: {
    unavailable: 'Video unavailable. Press Enter to skip and continue.',
    readFailed: 'The video could not be loaded. Press Enter to skip and continue.',
    autoplayBlocked: 'Autoplay was blocked. Press Enter to skip and continue.',
    decodeFailed: 'The video is damaged or unsupported. Press Enter to skip and continue.',
    ariaLabel: 'Story video',
    skippableAriaLabel: 'Story video; press Enter to skip',
    loading: 'Loading video…',
  },
};

export const PLAYER_UI_LABELS: Readonly<Record<PlayerLanguage, PlayerUiLabels>> = {
  'zh-CN': ZH_CN_LABELS,
  'en-US': EN_US_LABELS,
};

export const DEFAULT_PLAYER_LANGUAGE: PlayerLanguage = 'zh-CN';

export type PlayerUiLocalizationProps = {
  language?: PlayerLanguage;
  labels?: PlayerUiLabels;
};

export function normalizePlayerLanguage(language: unknown): PlayerLanguage {
  return language === 'en-US' ? 'en-US' : DEFAULT_PLAYER_LANGUAGE;
}

export function getPlayerUiLabels(
  language: PlayerLanguage = DEFAULT_PLAYER_LANGUAGE,
): PlayerUiLabels {
  return PLAYER_UI_LABELS[language];
}

export function resolvePlayerUiLabels(
  language: PlayerLanguage = DEFAULT_PLAYER_LANGUAGE,
  labels?: PlayerUiLabels,
): PlayerUiLabels {
  return labels ?? getPlayerUiLabels(language);
}
