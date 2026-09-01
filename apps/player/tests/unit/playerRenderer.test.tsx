/** @vitest-environment jsdom */
/**
 * 主要作用：覆盖标题页、游戏、存读档、选项、快进和返回标题主流程。
 * 关键函数与实现：测试套件“Player Renderer”、`project`、`game`、`button`；使用 Vitest、测试夹具与必要的 DOM/文件系统模拟覆盖公开行为。
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { startGame, type ProjectDocument } from '@vnengine/runtime';
import { TitleScreen, usePreviewAudio } from '@vnengine/player-ui';
import type * as PlayerUi from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';
import type {
  PlayerGameView,
  PlayerGateway,
} from '../../src/renderer/playerGateway';
import {
  createDefaultPlayerSettings,
  type PlayerErrorCode,
  type PlayerMode,
  type PlayerSaveSummaryContent,
} from '../../src/shared/playerProtocol';

vi.mock('@vnengine/player-ui', async (importOriginal) => {
  const original = await importOriginal<typeof PlayerUi>();
  return { ...original, usePreviewAudio: vi.fn() };
});

const project: ProjectDocument = {
  schemaVersion: 1,
  id: 'player-project',
  name: '星光测试',
  entrySceneId: 'entry',
  startScreen: {
    title: '自定义星光标题',
    eyebrow: 'A VN ENGINE STORY',
    backgroundAssetId: null,
    musicAssetId: null,
  },
  cgGallery: { pages: [{ imageAssetIds: Array(9).fill(null) }] },
  scenes: [
    {
      schemaVersion: 1,
      id: 'entry',
      name: '序章',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        {
          id: 'background',
          type: 'background',
          assetId: 'background-1',
          scalePercent: 125,
        },
        {
          id: 'character',
          type: 'character',
          assetId: 'character-1',
          slot: 'center',
          layer: 2,
          position: { x: 37, y: 89 },
          scalePercent: 70,
          effect: null,
        },
        { id: 'bgm', type: 'bgm', assetId: 'bgm-1' },
        {
          id: 'hello',
          type: 'dialogue',
          speaker: '小星',
          text: '欢迎来到故事。',
          voiceAssetId: null,
        },
        {
          id: 'choice',
          type: 'choice',
          options: [
            { id: 'continue', text: '继续前进', targetSceneId: 'movie' },
          ],
        },
      ],
    },
    {
      schemaVersion: 1,
      id: 'movie',
      name: '过场',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: [
        { id: 'video', type: 'video', assetId: 'video-1' },
        { id: 'video-skip', type: 'video', assetId: 'video-2' },
        { id: 'jump', type: 'sceneJump', targetSceneId: 'ending' },
      ],
    },
    {
      schemaVersion: 1,
      id: 'ending',
      name: '终章',
      backgroundAssetId: 'background-2',
      backgroundScalePercent: 80,
      nodes: [
        {
          id: 'goodbye',
          type: 'dialogue',
          speaker: '小星',
          text: '下次再见。',
          voiceAssetId: null,
        },
      ],
    },
  ],
};

const game = {
  defaultLanguage: 'zh-CN' as const,
  project,
  assets: [
    { id: 'background-1', type: 'image' as const, displayName: '教室' },
    { id: 'background-2', type: 'image' as const, displayName: '星空' },
    { id: 'character-1', type: 'image' as const, displayName: '小星立绘' },
    { id: 'bgm-1', type: 'audio' as const, displayName: '主题曲' },
    { id: 'video-1', type: 'video' as const, displayName: '过场动画' },
    { id: 'video-2', type: 'video' as const, displayName: '第二段动画' },
  ],
};

function button(container: Element, label: string): HTMLButtonElement {
  const candidate = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.includes(label),
  );
  if (!candidate) {
    throw new Error(`Button not found: ${label}`);
  }
  return candidate;
}

function exactButton(container: Element, label: string): HTMLButtonElement {
  const candidate = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!candidate) {
    throw new Error(`Button not found: ${label}`);
  }
  return candidate;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function keyboard(
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });
}

function keyboardUp(key: string): KeyboardEvent {
  return new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    key,
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function initialRuntime() {
  const runtime = startGame(project);
  if (runtime === null) {
    throw new Error('Test project must have a valid entry scene');
  }
  return runtime;
}

function dialogueOnlyGame(lineCount = 12) {
  const dialogueProject: ProjectDocument = {
    ...project,
    scenes: [{
      schemaVersion: 1,
      id: 'entry',
      name: '快进测试',
      backgroundAssetId: null,
      backgroundScalePercent: 100,
      nodes: Array.from({ length: lineCount }, (_, index) => ({
        id: `line-${index + 1}`,
        type: 'dialogue' as const,
        speaker: '旁白',
        text: `快进对白 ${index + 1}`,
        voiceAssetId: null,
      })),
    }],
  };
  return {
    defaultLanguage: 'zh-CN' as const,
    project: dialogueProject,
    assets: [],
  };
}

describe('Player Renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let gateway: PlayerGateway;
  let resolveMediaUrl: ReturnType<typeof vi.fn>;
  let quit: ReturnType<typeof vi.fn>;
  let listSaveSlots: ReturnType<typeof vi.fn>;
  let saveGame: ReturnType<typeof vi.fn>;
  let loadGameSlot: ReturnType<typeof vi.fn>;
  let quickSave: ReturnType<typeof vi.fn>;
  let quickLoad: ReturnType<typeof vi.fn>;
  let getSettings: ReturnType<typeof vi.fn>;
  let updateSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    resolveMediaUrl = vi.fn(async (assetId: string) =>
      `vn-game-asset://session/${assetId}`,
    );
    quit = vi.fn().mockResolvedValue(undefined);
    listSaveSlots = vi.fn().mockResolvedValue({ status: 'ready', slots: [] });
    saveGame = vi.fn().mockResolvedValue({
      status: 'saved',
      slot: {
        slotId: 1,
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: {
          kind: 'dialogue',
          speaker: '小星',
          text: '欢迎来到故事。',
        },
      },
    });
    loadGameSlot = vi.fn().mockResolvedValue({ status: 'empty' });
    quickSave = vi.fn().mockResolvedValue({
      status: 'saved',
      slot: {
        slotId: 'quick',
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: {
          kind: 'dialogue',
          speaker: '小星',
          text: '欢迎来到故事。',
        },
      },
    });
    quickLoad = vi.fn().mockResolvedValue({ status: 'empty' });
    let storedSettings = createDefaultPlayerSettings();
    getSettings = vi.fn().mockResolvedValue({
      status: 'ready',
      settings: storedSettings,
      languageSource: 'stored',
    });
    updateSettings = vi.fn().mockImplementation(async (patch) => {
      storedSettings = { ...storedSettings, ...patch };
      return { status: 'updated', settings: storedSettings };
    });
    gateway = {
      loadGame: vi.fn().mockResolvedValue({
        status: 'loaded',
        mode: 'generic',
        game,
      }),
      openGame: vi.fn().mockResolvedValue({ status: 'canceled' }),
      listSaveSlots,
      saveGame,
      loadGameSlot,
      quickSave,
      quickLoad,
      getSettings,
      updateSettings,
      resolveMediaUrl,
      quit,
    };
    vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits for a real start click, then executes all seven node types', async () => {
    await act(async () => root.render(<App gateway={gateway} />));

    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.textContent).not.toContain('欢迎来到故事。');
    expect(resolveMediaUrl).not.toHaveBeenCalled();

    await act(async () => button(container, '开始游戏').click());
    expect(container.textContent).toContain('欢迎来到故事。');
    const portrait = container.querySelector<HTMLImageElement>(
      '.preview-character-center',
    );
    expect(portrait).not.toBeNull();
    expect(portrait?.style.left).toBe('37%');
    expect(portrait?.style.top).toBe('89%');
    expect(portrait?.style.transform).toBe('translate(-50%, -100%)');
    expect(
      container.querySelector<HTMLElement>('.preview-character-scale')?.style
        .transform,
    ).toBe('scale(0.7)');
    expect(
      container.querySelector<HTMLImageElement>('.preview-background')?.style
        .transform,
    ).toBe('scale(1.25)');
    expect(resolveMediaUrl).toHaveBeenCalledWith('background-1');
    expect(resolveMediaUrl).toHaveBeenCalledWith('character-1');

    const stage = container.querySelector('.player-game');
    await act(async () => {
      stage?.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0 }),
      );
    });
    expect(container.getAttribute('aria-label')).toBeNull();
    expect(button(container, '继续前进').className).toContain(
      'player-choice-button',
    );

    await act(async () => button(container, '继续前进').click());
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(false);
    expect(resolveMediaUrl).toHaveBeenCalledWith('video-1');

    await act(async () => {
      video?.dispatchEvent(new Event('ended', { bubbles: true }));
    });
    expect(resolveMediaUrl).toHaveBeenCalledWith('video-2');

    await act(async () => window.dispatchEvent(keyboard('Enter')));
    expect(container.textContent).toContain('下次再见。');
    expect(resolveMediaUrl).toHaveBeenCalledWith('background-2');
    expect(
      container.querySelector<HTMLImageElement>('.preview-background')?.style
        .transform,
    ).toBe('scale(0.8)');

    await act(async () => window.dispatchEvent(keyboard(' ')));
    expect(container.querySelector('[aria-label="游戏结束"]')).not.toBeNull();
  });

  it('renders title media, keeps fixed main actions and stops music on start', async () => {
    const titleGame = {
      ...game,
      project: {
        ...project,
        startScreen: {
          title: '媒体标题页',
          eyebrow: project.startScreen.eyebrow,
          backgroundAssetId: 'title-background',
          musicAssetId: 'title-music',
        },
      },
      assets: [
        ...game.assets,
        { id: 'title-background', type: 'image' as const, displayName: '封面' },
        { id: 'title-music', type: 'audio' as const, displayName: '标题曲' },
      ],
    };
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: titleGame,
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => undefined);

    expect(resolveMediaUrl).toHaveBeenCalledWith('title-background');
    expect(resolveMediaUrl).toHaveBeenCalledWith('title-music');
    expect(container.querySelector<HTMLImageElement>('.player-title-background')?.src)
      .toContain('title-background');
    expect(container.querySelector<HTMLAudioElement>('.player-title-music')?.loop)
      .toBe(true);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(button(container, '开始游戏')).toBeTruthy();
    expect(button(container, '读取游戏')).toBeTruthy();
    expect(button(container, 'CG画廊')).toBeTruthy();
    expect(button(container, '选项')).toBeTruthy();
    expect(button(container, '退出游戏')).toBeTruthy();
    expect(
      container.querySelector('.player-title-actions-vertical')?.children,
    ).toHaveLength(5);
    expect(
      container.querySelector('.player-title-fit > .player-title-card'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain('打开其他游戏');

    const playCallsBeforeSaveDialog = vi.mocked(HTMLMediaElement.prototype.play)
      .mock.calls.length;
    const titleMusicBeforeSave = container.querySelector<HTMLAudioElement>(
      '.player-title-music',
    );
    if (titleMusicBeforeSave) {
      titleMusicBeforeSave.currentTime = 17;
    }
    await act(async () => button(container, '读取游戏').click());
    expect(container.querySelector('[aria-label="读取游戏"]')).not.toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[aria-label="关闭存档窗口"]',
    )?.click());
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length)
      .toBeGreaterThan(playCallsBeforeSaveDialog);
    expect(titleMusicBeforeSave?.currentTime).toBe(17);

    await act(async () => button(container, '选项').click());
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    expect(container.textContent).toContain('打开其他游戏');
    await act(async () => button(container, '返回').click());
    await act(async () => button(container, '开始游戏').click());

    expect(container.querySelector('.player-title-music')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it('settles settings before title playback and applies effective volume', async () => {
    const settingsRequest = deferred<{
      status: 'ready';
      settings: ReturnType<typeof createDefaultPlayerSettings>;
      languageSource: 'stored';
    }>();
    const quietSettings = {
      ...createDefaultPlayerSettings(),
      masterVolume: 0,
      bgmVolume: 0.4,
    };
    const musicUrlRequest = deferred<string | null>();
    resolveMediaUrl.mockImplementation((assetId: string) =>
      assetId === 'title-music'
        ? musicUrlRequest.promise
        : Promise.resolve(`vn-game-asset://session/${assetId}`),
    );
    const playedVolumes: number[] = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(
      function (this: HTMLMediaElement) {
        playedVolumes.push(this.volume);
        return Promise.resolve();
      },
    );
    getSettings.mockReturnValue(settingsRequest.promise);
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: {
        ...game,
        project: {
          ...project,
          startScreen: {
            ...project.startScreen,
            musicAssetId: 'title-music',
          },
        },
        assets: [
          ...game.assets,
          { id: 'title-music', type: 'audio' as const, displayName: '标题曲' },
        ],
      },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    expect(container.querySelector('.player-loading-status p')).toBeNull();
    expect(container.querySelector('.player-loading')?.getAttribute('aria-busy'))
      .toBe('true');
    expect(container.querySelector('[role="status"]')?.className)
      .toContain('player-loading-status');
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('title-music');

    await act(async () => settingsRequest.resolve({
      status: 'ready',
      settings: quietSettings,
      languageSource: 'stored',
    }));
    await act(async () => undefined);

    expect(container.querySelector('.player-title-music')).toBeNull();
    await act(async () => musicUrlRequest.resolve(
      'vn-game-asset://session/title-music',
    ));

    const titleMusic = container.querySelector<HTMLAudioElement>(
      '.player-title-music',
    );
    expect(titleMusic?.volume).toBe(0);
    expect(playedVolumes).toEqual([0]);
    expect(resolveMediaUrl).toHaveBeenCalledWith('title-music');

    const playCalls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    const pauseCalls = vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;
    await act(async () => exactButton(container, '选项').click());
    const masterVolume = container.querySelector<HTMLInputElement>(
      '[aria-label="主音量"]',
    );
    await act(async () => {
      if (masterVolume) {
        setInputValue(masterVolume, '50');
      }
    });
    expect(titleMusic?.volume).toBeCloseTo(0.2);
    expect(vi.mocked(HTMLMediaElement.prototype.play)).toHaveBeenCalledTimes(
      playCalls,
    );
    expect(vi.mocked(HTMLMediaElement.prototype.pause)).toHaveBeenCalledTimes(
      pauseCalls,
    );
  });

  it('uses a game-first bundle default without persisting it on a volume update', async () => {
    gateway.gameScopedLanguagePreferences = true;
    const settingsRequest = deferred<{
      status: 'ready';
      settings: ReturnType<typeof createDefaultPlayerSettings>;
      languageSource: 'default';
    }>();
    getSettings.mockReturnValue(settingsRequest.promise);
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: { ...game, defaultLanguage: 'en-US' },
    });
    updateSettings.mockResolvedValueOnce({
      status: 'updated',
      settings: {
        ...createDefaultPlayerSettings(),
        language: 'en-US',
        masterVolume: 0.5,
      },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => settingsRequest.resolve({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        masterVolume: 0.4,
      },
      languageSource: 'default',
    }));

    expect(document.documentElement.lang).toBe('en-US');
    await act(async () => exactButton(container, 'Options').click());
    const master = container.querySelector<HTMLInputElement>(
      '[aria-label="Master Volume"]',
    );
    await act(async () => {
      if (master) {
        setInputValue(master, '50');
        master.dispatchEvent(new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
        }));
      }
      await Promise.resolve();
    });

    expect(updateSettings).toHaveBeenLastCalledWith({ masterVolume: 0.5 });
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('persists the active bundle language with a desktop volume update', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: createDefaultPlayerSettings(),
      languageSource: 'default',
    });
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'embedded',
      game: { ...game, defaultLanguage: 'en-US' },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, 'Options').click());
    const master = container.querySelector<HTMLInputElement>(
      '[aria-label="Master Volume"]',
    );
    await act(async () => {
      if (master) {
        setInputValue(master, '50');
        master.dispatchEvent(new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
        }));
      }
      await Promise.resolve();
    });

    expect(updateSettings).toHaveBeenLastCalledWith({
      language: 'en-US',
      masterVolume: 0.5,
    });
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('applies a settings-first game default and keeps it through options refresh', async () => {
    const gameRequest = deferred<{
      status: 'loaded';
      mode: PlayerMode;
      game: PlayerGameView;
    }>();
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: createDefaultPlayerSettings(),
      languageSource: 'default',
    });
    gateway.loadGame = vi.fn().mockReturnValue(gameRequest.promise);

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => undefined);
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(
      container.querySelector('.player-loading-status p'),
    ).toBeNull();

    await act(async () => gameRequest.resolve({
      status: 'loaded',
      mode: 'generic',
      game: { ...game, defaultLanguage: 'en-US' },
    }));
    expect(document.documentElement.lang).toBe('en-US');

    await act(async () => exactButton(container, 'Options').click());
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 70)));
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(document.documentElement.lang).toBe('en-US');
    expect(container.querySelector<HTMLSelectElement>(
      '[aria-label="Interface Language"]',
    )?.value).toBe('en-US');
  });

  it('keeps default language provenance after a volume-only update', async () => {
    gateway.gameScopedLanguagePreferences = true;
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: createDefaultPlayerSettings(),
      languageSource: 'default',
    });
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'opened',
      game: { ...game, defaultLanguage: 'en-US' },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, '选项').click());
    const master = container.querySelector<HTMLInputElement>(
      '[aria-label="主音量"]',
    );
    await act(async () => {
      if (master) {
        setInputValue(master, '50');
        master.dispatchEvent(new MouseEvent('pointerup', {
          bubbles: true,
          button: 0,
        }));
      }
      await Promise.resolve();
    });

    expect(updateSettings).toHaveBeenLastCalledWith({ masterVolume: 0.5 });
    expect(document.documentElement.lang).toBe('zh-CN');

    await act(async () => exactButton(container, '打开其他游戏').click());

    expect(document.documentElement.lang).toBe('en-US');
    expect(container.textContent).toContain('Start Game');
  });

  it('lets stored language override the game and resets to that game default', async () => {
    const customized = {
      ...createDefaultPlayerSettings(),
      language: 'zh-CN' as const,
      masterVolume: 0.4,
      bgmVolume: 0.5,
      voiceVolume: 0.6,
      videoVolume: 0.7,
      windowMode: 'fullscreen' as const,
      windowSizePreset: 'large' as const,
    };
    let persisted = customized;
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: customized,
      languageSource: 'stored',
    });
    updateSettings.mockImplementation(async (patch) => {
      persisted = { ...persisted, ...patch };
      return { status: 'updated', settings: persisted };
    });
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: { ...game, defaultLanguage: 'en-US' },
    });
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'opened',
      game: { ...game, defaultLanguage: 'zh-CN' },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    expect(document.documentElement.lang).toBe('zh-CN');
    await act(async () => exactButton(container, '选项').click());
    await act(async () => exactButton(container, '恢复默认').click());

    expect(updateSettings).toHaveBeenLastCalledWith({
      language: 'en-US',
      masterVolume: 1,
      bgmVolume: 1,
      voiceVolume: 1,
      videoVolume: 1,
      windowMode: 'windowed',
      windowSizePreset: 'medium',
    });
    expect(document.documentElement.lang).toBe('en-US');

    await act(async () => exactButton(container, 'Open Another Game').click());
    expect(document.documentElement.lang).toBe('en-US');
  });

  it('keeps the localized loading shell visible while the bundle is pending', async () => {
    const gameRequest = deferred<{
      status: 'loaded';
      mode: PlayerMode;
      game: typeof game;
    }>();
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        language: 'en-US',
      },
      languageSource: 'stored',
    });
    gateway.loadGame = vi.fn().mockReturnValue(gameRequest.promise);

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => undefined);

    const loadingStatus = container.querySelector('[role="status"]');
    expect(loadingStatus?.className).toContain('player-loading-status');
    expect(loadingStatus?.textContent).toContain('Loading game');
    expect(document.documentElement.lang).toBe('en-US');

    await act(async () => gameRequest.resolve({
      status: 'loaded',
      mode: 'generic',
      game,
    }));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
  });

  it('commits keyboard volume changes one at a time and restores focus', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        masterVolume: 0.4,
      },
      languageSource: 'stored',
    });
    await act(async () => root.render(<App gateway={gateway} />));
    const optionsTrigger = exactButton(container, '选项');
    optionsTrigger.focus();
    await act(async () => optionsTrigger.click());

    const master = container.querySelector<HTMLInputElement>(
      '[aria-label="主音量"]',
    );
    expect(master).not.toBeNull();
    master?.focus();

    for (const percentage of [41, 42, 43]) {
      await act(async () => {
        if (master) {
          setInputValue(master, String(percentage));
          master.dispatchEvent(new KeyboardEvent('keyup', {
            bubbles: true,
            key: 'ArrowRight',
          }));
        }
        await Promise.resolve();
      });
      expect(document.activeElement).toBe(master);
    }

    expect(updateSettings).toHaveBeenNthCalledWith(1, { masterVolume: 0.41 });
    expect(updateSettings).toHaveBeenNthCalledWith(2, { masterVolume: 0.42 });
    expect(updateSettings).toHaveBeenNthCalledWith(3, { masterVolume: 0.43 });
    expect(master?.value).toBe('43');

    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.querySelector('[aria-label="选项"]')).toBeNull();
    expect(document.activeElement).toBe(optionsTrigger);
  });

  it('switches the Player shell to English without resetting authored story state', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(container.textContent).toContain('开始游戏');
    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Enter')));
    expect(exactButton(container, '继续前进')).toBeTruthy();

    await act(async () => exactButton(
      container.querySelector('.player-game-action-bar')!,
      '选项',
    ).click());
    const language = container.querySelector<HTMLSelectElement>(
      '[aria-label="界面语言"]',
    );
    expect(language).not.toBeNull();

    await act(async () => {
      if (language) {
        setSelectValue(language, 'en-US');
      }
      await Promise.resolve();
    });

    expect(updateSettings).toHaveBeenLastCalledWith({ language: 'en-US' });
    expect(document.documentElement.lang).toBe('en-US');
    expect(container.querySelector('[aria-label="Options"]')).not.toBeNull();
    expect(container.textContent).toContain('Master Volume');
    await act(async () => exactButton(container, 'Back').click());

    expect(exactButton(container, 'Save')).toBeTruthy();
    expect(exactButton(container, 'Fast Forward')).toBeTruthy();
    expect(exactButton(container, 'Return to Title')).toBeTruthy();
    expect(exactButton(container, '继续前进')).toBeTruthy();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('rolls the interface language back when persistence is rejected', async () => {
    const pendingUpdate = deferred<{
      status: 'rejected';
      error: PlayerErrorCode;
    }>();
    updateSettings.mockReturnValueOnce(pendingUpdate.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, '选项').click());
    const language = container.querySelector<HTMLSelectElement>(
      '[aria-label="界面语言"]',
    );

    await act(async () => {
      if (language) {
        setSelectValue(language, 'en-US');
      }
    });
    expect(document.documentElement.lang).toBe('en-US');
    expect(container.querySelector('[aria-label="Options"]')).not.toBeNull();

    await act(async () => pendingUpdate.resolve({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    }));
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="界面语言"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '无法访问设置存储',
    );
  });

  it('localizes an earlier asynchronous load error after settings settle', async () => {
    const pendingSettings = deferred<{
      status: 'ready';
      settings: ReturnType<typeof createDefaultPlayerSettings>;
      languageSource: 'stored';
    }>();
    getSettings.mockReturnValue(pendingSettings.promise);
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'error',
      mode: 'generic',
      error: 'bundle-load-failed',
    });

    await act(async () => root.render(<App gateway={gateway} />));
    expect(container.querySelector('.player-loading-status p')).toBeNull();

    await act(async () => pendingSettings.resolve({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        language: 'en-US',
      },
      languageSource: 'stored',
    }));

    expect(document.documentElement.lang).toBe('en-US');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'The game package could not be loaded',
    );
    expect(container.textContent).not.toContain('无法读取游戏内容包');
  });

  it('refreshes native window mode while the options dialog is open', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        windowMode: 'fullscreen',
      },
      languageSource: 'stored',
    });
    await act(async () => exactButton(container, '选项').click());
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 70)));

    const modeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="窗口模式"]',
    );
    expect(modeSelect?.value).toBe('fullscreen');

    getSettings.mockResolvedValue({
      status: 'ready',
      settings: createDefaultPlayerSettings(),
      languageSource: 'stored',
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => window.setTimeout(resolve, 70));
    });
    expect(modeSelect?.value).toBe('windowed');
  });

  it('previews a volume immediately, blocks close while busy and rolls back rejection', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        masterVolume: 0.5,
      },
      languageSource: 'stored',
    });
    const pendingUpdate = deferred<{
      status: 'rejected';
      error: PlayerErrorCode;
    }>();
    updateSettings.mockReturnValueOnce(pendingUpdate.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, '选项').click());
    const master = container.querySelector<HTMLInputElement>(
      '[aria-label="主音量"]',
    );

    await act(async () => {
      if (master) {
        setInputValue(master, '20');
      }
    });
    expect(master?.value).toBe('20');
    expect(updateSettings).not.toHaveBeenCalled();

    await act(async () => master?.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    ));
    expect(updateSettings).toHaveBeenCalledWith({ masterVolume: 0.2 });
    expect(master?.disabled).toBe(true);
    const escapeWhileBusy = keyboard('Escape');
    await act(async () => window.dispatchEvent(escapeWhileBusy));
    expect(escapeWhileBusy.defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();

    await act(async () => pendingUpdate.resolve({
      status: 'rejected',
      error: 'settings-storage-unavailable',
    }));
    expect(master?.value).toBe('50');
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('无法访问设置存储');
    expect(document.activeElement).toBe(master);
  });

  it('applies window controls through narrow patches and resets defaults', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, '选项').click());
    const mode = container.querySelector<HTMLSelectElement>(
      '[aria-label="窗口模式"]',
    );
    const size = container.querySelector<HTMLSelectElement>(
      '[aria-label="窗口尺寸"]',
    );
    expect(mode).not.toBeNull();
    expect(size).not.toBeNull();

    await act(async () => {
      if (size) {
        setSelectValue(size, 'large');
      }
      await Promise.resolve();
    });
    expect(updateSettings).toHaveBeenLastCalledWith({
      windowSizePreset: 'large',
    });
    expect(document.activeElement).toBe(size);

    await act(async () => {
      if (mode) {
        setSelectValue(mode, 'fullscreen');
      }
      await Promise.resolve();
    });
    expect(updateSettings).toHaveBeenLastCalledWith({
      windowMode: 'fullscreen',
    });
    expect(size?.disabled).toBe(true);

    await act(async () => exactButton(container, '恢复默认').click());
    expect(updateSettings).toHaveBeenLastCalledWith({
      language: 'zh-CN',
      windowMode: 'windowed',
      windowSizePreset: 'medium',
    });
  });

  it('scales typography from the retained preset without remounting gameplay', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Enter')));

    const playerApp = container.querySelector<HTMLElement>('.player-app');
    const gameScreen = container.querySelector<HTMLElement>('.player-game');
    const portrait = container.querySelector<HTMLImageElement>(
      '.preview-character-center',
    );
    expect(exactButton(container, '继续前进')).toBeTruthy();
    expect(portrait).not.toBeNull();
    expect(playerApp?.dataset.playerWindowSizePreset).toBe('medium');

    await act(async () => exactButton(
      container.querySelector('.player-game-action-bar')!,
      '选项',
    ).click());
    const size = container.querySelector<HTMLSelectElement>(
      '[aria-label="窗口尺寸"]',
    );
    const mode = container.querySelector<HTMLSelectElement>(
      '[aria-label="窗口模式"]',
    );

    await act(async () => {
      if (size) {
        setSelectValue(size, 'large');
      }
      await Promise.resolve();
    });
    expect(playerApp?.dataset.playerWindowSizePreset).toBe('large');
    expect(container.querySelector('.player-game')).toBe(gameScreen);
    expect(container.querySelector('.preview-character-center')).toBe(
      portrait,
    );

    await act(async () => {
      if (mode) {
        setSelectValue(mode, 'fullscreen');
      }
      await Promise.resolve();
    });
    expect(playerApp?.dataset.playerWindowSizePreset).toBe('large');
    expect(size?.disabled).toBe(true);
    expect(container.querySelector('.player-game')).toBe(gameScreen);
    expect(container.querySelector('.preview-character-center')).toBe(
      portrait,
    );

    await act(async () => exactButton(container, '返回').click());
    expect(exactButton(container, '继续前进')).toBeTruthy();
    expect(container.querySelector('.player-game')).toBe(gameScreen);
    expect(container.querySelector('.preview-character-center')).toBe(
      portrait,
    );
  });

  it('passes effective gameplay channel volumes without pausing for options', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        masterVolume: 0.5,
        bgmVolume: 0.4,
        voiceVolume: 0.6,
        videoVolume: 0.8,
      },
      languageSource: 'stored',
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    expect(vi.mocked(usePreviewAudio)).toHaveBeenLastCalledWith(
      expect.any(Object),
      resolveMediaUrl,
      { bgmVolume: 0.2, voiceVolume: 0.3, paused: false },
    );
    await act(async () => exactButton(
      container.querySelector('.player-game-action-bar')!,
      '选项',
    ).click());
    expect(vi.mocked(usePreviewAudio)).toHaveBeenLastCalledWith(
      expect.any(Object),
      resolveMediaUrl,
      { bgmVolume: 0.2, voiceVolume: 0.3, paused: false },
    );
  });

  it('loads manual and quick slots from the title without starting a new game', async () => {
    listSaveSlots.mockResolvedValue({
      status: 'ready',
      slots: [
        {
          slotId: 1,
          savedAt: '2026-08-24T08:00:00.000Z',
          sceneName: '序章',
          summary: {
            kind: 'dialogue',
            speaker: '小星',
            text: '欢迎来到故事。',
          },
        },
        {
          slotId: 'quick',
          savedAt: '2026-08-24T08:30:00.000Z',
          sceneName: '序章',
          summary: { kind: 'progress' },
        },
      ],
    });
    quickLoad.mockResolvedValue({
      status: 'loaded',
      runtime: initialRuntime(),
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => exactButton(container, '读取游戏').click());

    expect(container.querySelectorAll('.player-save-slot')).toHaveLength(4);
    expect(container.querySelector('[data-save-slot-id="quick"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>(
      '[data-save-slot-id="2"]',
    )?.disabled).toBe(true);

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-save-slot-id="quick"]',
    )?.click());

    expect(quickLoad).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).toContain('已读取快速存档');
  });

  it('relocalizes structured save summaries without remounting gameplay', async () => {
    listSaveSlots.mockResolvedValue({
      status: 'ready',
      slots: [
        {
          slotId: 1,
          savedAt: '2026-08-24T08:00:00.000Z',
          sceneName: '作者场景名',
          summary: {
            kind: 'dialogue',
            speaker: 'Alice',
            text: 'Hello!',
          },
        },
        {
          slotId: 2,
          savedAt: '2026-08-24T08:10:00.000Z',
          sceneName: '选择场景',
          summary: { kind: 'choosing' },
        },
      ],
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    const gameScreen = container.querySelector('.player-game');

    await act(async () => exactButton(container, '读取').click());
    expect(container.textContent).toContain('Alice：Hello!');
    expect(container.textContent).toContain('等待选择');
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[aria-label="关闭存档窗口"]',
    )?.click());

    await act(async () => exactButton(container, '选项').click());
    const language = container.querySelector<HTMLSelectElement>(
      '[aria-label="界面语言"]',
    );
    await act(async () => {
      if (language) {
        setSelectValue(language, 'en-US');
      }
      await Promise.resolve();
    });
    await act(async () => exactButton(container, 'Back').click());

    expect(container.querySelector('.player-game')).toBe(gameScreen);
    await act(async () => exactButton(container, 'Load').click());
    expect(container.textContent).toContain('Alice: Hello!');
    expect(container.textContent).toContain('Waiting for a Choice');
    expect(container.textContent).not.toContain('Alice：Hello!');
    expect(container.querySelector('.player-game')).toBe(gameScreen);
  });

  it('traps title-load focus, deduplicates list requests and restores its trigger', async () => {
    const pendingSlots = deferred<{
      status: 'ready';
      slots: Array<{
        slotId: 1;
        savedAt: string;
        sceneName: string;
        summary: PlayerSaveSummaryContent;
      }>;
    }>();
    listSaveSlots.mockReturnValue(pendingSlots.promise);
    await act(async () => root.render(<App gateway={gateway} />));

    const loadTrigger = exactButton(container, '读取游戏');
    loadTrigger.focus();
    await act(async () => loadTrigger.click());
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="关闭存档窗口"]',
    );
    expect(document.activeElement).toBe(closeButton);
    expect(document.activeElement).not.toBe(loadTrigger);

    await act(async () => loadTrigger.click());
    expect(listSaveSlots).toHaveBeenCalledOnce();
    await act(async () => {
      button(container, '开始游戏').click();
      button(container, '退出游戏').click();
    });
    expect(container.textContent).not.toContain('欢迎来到故事。');
    expect(quit).not.toHaveBeenCalled();

    await act(async () => pendingSlots.resolve({
      status: 'ready',
      slots: [{
        slotId: 1,
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: {
          kind: 'dialogue',
          speaker: '小星',
          text: '欢迎来到故事。',
        },
      }],
    }));
    closeButton?.focus();
    const reverseTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    await act(async () => window.dispatchEvent(reverseTab));
    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector(
      '[data-save-slot-id="1"]',
    ));

    const forwardTab = keyboard('Tab');
    await act(async () => window.dispatchEvent(forwardTab));
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.querySelector('[aria-label="读取游戏"]')).toBeNull();
    expect(document.activeElement).toBe(loadTrigger);
    expect(container.textContent).not.toContain('欢迎来到故事。');
    expect(quit).not.toHaveBeenCalled();
  });

  it('keeps the action bar from advancing the story and exposes fast-forward', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const actionBar = container.querySelector('[aria-label="游戏操作"]');
    expect(actionBar?.querySelectorAll('button')).toHaveLength(7);
    expect(exactButton(actionBar!, '快进').disabled).toBe(false);
    expect(exactButton(actionBar!, '快进').getAttribute('aria-pressed'))
      .toBe('false');
    expect(exactButton(actionBar!, '选项').disabled).toBe(false);
    expect(exactButton(actionBar!, '选项').title).toBe('');

    await act(async () => exactButton(actionBar!, '保存').dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    ));

    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');
    expect(listSaveSlots).not.toHaveBeenCalled();
  });

  it('does not advance while the reader scrolls overflowing dialogue', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const dialogue = container.querySelector<HTMLElement>('.dialogue-box')!;
    const dialogueText = dialogue.querySelector('p')!;
    Object.defineProperties(dialogue, {
      clientHeight: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 320 },
    });

    dialogueText.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 120,
    }));
    dialogue.scrollTop = 80;
    await act(async () => dialogueText.dispatchEvent(new MouseEvent(
      'pointerup',
      { bubbles: true, button: 0, clientY: 40 },
    )));

    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');

    dialogueText.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientY: 40,
    }));
    await act(async () => dialogueText.dispatchEvent(new MouseEvent(
      'pointerup',
      { bubbles: true, button: 0, clientY: 40 },
    )));
    expect(exactButton(container, '继续前进')).toBeTruthy();
  });

  it('toggles timed fast-forward from the action bar and stops immediately', async () => {
    vi.useFakeTimers();
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: dialogueOnlyGame(),
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const fastForward = exactButton(container, '快进');
    expect(container.textContent).toContain('快进对白 1');
    await act(async () => fastForward.click());

    expect(fastForward.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('快进对白 1');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container.textContent).toContain('快进对白 2');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container.textContent).toContain('快进对白 3');

    await act(async () => fastForward.click());
    expect(fastForward.getAttribute('aria-pressed')).toBe('false');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain('快进对白 3');
    expect(container.textContent).not.toContain('快进对白 4');
  });

  it('advances once on a short Space press and fast-forwards only while held', async () => {
    vi.useFakeTimers();
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: dialogueOnlyGame(),
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const shortPress = keyboard(' ');
    await act(async () => {
      window.dispatchEvent(shortPress);
      window.dispatchEvent(keyboardUp(' '));
    });
    expect(shortPress.defaultPrevented).toBe(true);
    expect(container.textContent).toContain('快进对白 2');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain('快进对白 2');

    const longPress = keyboard(' ');
    await act(async () => window.dispatchEvent(longPress));
    expect(container.textContent).toContain('快进对白 3');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(exactButton(container, '快进').getAttribute('aria-pressed'))
      .toBe('true');
    const dialogueAtActivation = container.querySelector('.dialogue-box p')
      ?.textContent;
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(container.querySelector('.dialogue-box p')?.textContent)
      .not.toBe(dialogueAtActivation);

    await act(async () => window.dispatchEvent(keyboardUp(' ')));
    expect(exactButton(container, '快进').getAttribute('aria-pressed'))
      .toBe('false');
    const stoppedDialogue = container.querySelector('.dialogue-box p')
      ?.textContent;
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.querySelector('.dialogue-box p')?.textContent)
      .toBe(stoppedDialogue);
  });

  it('ignores modified or composing Space input and stops fast-forward on blur', async () => {
    vi.useFakeTimers();
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: dialogueOnlyGame(),
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    await act(async () => {
      window.dispatchEvent(keyboard(' ', { altKey: true }));
      window.dispatchEvent(keyboard(' ', { ctrlKey: true }));
      window.dispatchEvent(keyboard(' ', { metaKey: true }));
      window.dispatchEvent(keyboard(' ', { shiftKey: true }));
      window.dispatchEvent(keyboard(' ', { isComposing: true }));
      window.dispatchEvent(keyboard(' ', { repeat: true }));
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(container.textContent).toContain('快进对白 1');

    await act(async () => exactButton(container, '快进').click());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    const dialogueBeforeBlur = container.querySelector('.dialogue-box p')
      ?.textContent;
    expect(dialogueBeforeBlur).not.toBe('快进对白 1');

    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(exactButton(container, '快进').getAttribute('aria-pressed'))
      .toBe('false');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.querySelector('.dialogue-box p')?.textContent)
      .toBe(dialogueBeforeBlur);
  });

  it('never auto-selects a choice or skips a video while fast-forwarding', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => exactButton(container, '快进').click());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(exactButton(container, '继续前进')).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(exactButton(container, '继续前进')).toBeTruthy();
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('video-1');

    await act(async () => exactButton(container, '继续前进').click());
    expect(container.querySelector('video')).not.toBeNull();
    expect(resolveMediaUrl).toHaveBeenCalledWith('video-1');
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.querySelector('video')).not.toBeNull();
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('video-2');
  });

  it('ignores Space fast-forward on the title, pause menu and modal layers', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(<App gateway={gateway} />));

    await act(async () => {
      window.dispatchEvent(keyboard(' '));
      await vi.advanceTimersByTimeAsync(10_000);
      window.dispatchEvent(keyboardUp(' '));
    });
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');

    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Escape')));
    await act(async () => {
      window.dispatchEvent(keyboard(' '));
      await vi.advanceTimersByTimeAsync(10_000);
      window.dispatchEvent(keyboardUp(' '));
    });
    expect(container.querySelector('[aria-label="暂停菜单"]')).not.toBeNull();
    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.textContent).toContain('欢迎来到故事。');

    await act(async () => exactButton(container, '选项').click());
    await act(async () => {
      window.dispatchEvent(keyboard(' '));
      await vi.advanceTimersByTimeAsync(10_000);
      window.dispatchEvent(keyboardUp(' '));
    });
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    await act(async () => exactButton(container, '返回').click());
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');
  });

  it('keeps options and storage operations mutually exclusive in the same tick', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    const actionBar = container.querySelector('[aria-label="游戏操作"]')!;
    const optionsButton = exactButton(actionBar, '选项');
    const saveButton = exactButton(actionBar, '保存');
    const quickSaveButton = exactButton(actionBar, '快速保存');

    await act(async () => {
      optionsButton.click();
      saveButton.click();
      quickSaveButton.click();
    });
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="保存游戏"]')).toBeNull();
    expect(listSaveSlots).not.toHaveBeenCalled();
    expect(quickSave).not.toHaveBeenCalled();
    await act(async () => exactButton(container, '返回').click());

    const pendingSlots = deferred<{
      status: 'ready';
      slots: [];
    }>();
    listSaveSlots.mockReturnValueOnce(pendingSlots.promise);
    const activeBar = container.querySelector('[aria-label="游戏操作"]')!;
    await act(async () => {
      exactButton(activeBar, '保存').click();
      exactButton(activeBar, '选项').click();
    });
    expect(container.querySelector('[aria-label="保存游戏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="选项"]')).toBeNull();
    expect(listSaveSlots).toHaveBeenCalledOnce();
    await act(async () => pendingSlots.resolve({ status: 'ready', slots: [] }));
  });

  it('keeps the title CG gallery exclusive with save and options dialogs', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    const cgButton = exactButton(container, 'CG画廊');
    const loadButton = exactButton(container, '读取游戏');
    const optionsButton = exactButton(container, '选项');

    await act(async () => {
      cgButton.click();
      loadButton.click();
      optionsButton.click();
    });

    expect(container.querySelector('[aria-label="CG画廊"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="读取游戏"]')).toBeNull();
    expect(container.querySelector('[aria-label="选项"]')).toBeNull();
    expect(listSaveSlots).not.toHaveBeenCalled();
  });

  it('traps CG gallery focus and restores the title trigger when it closes', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    const cgButton = exactButton(container, 'CG画廊');
    cgButton.focus();

    await act(async () => cgButton.click());
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="关闭CG画廊"]',
    );
    expect(document.activeElement).toBe(closeButton);

    const forwardTab = keyboard('Tab');
    await act(async () => window.dispatchEvent(forwardTab));
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(closeButton);

    await act(async () => {
      window.dispatchEvent(keyboard('Escape'));
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label="CG画廊"]')).toBeNull();
    expect(document.activeElement).toBe(cgButton);
  });

  it('restores internal title-modal triggers after Chromium-style inert focus loss', async () => {
    await act(async () => root.render(
      <TitleScreen
        startScreen={project.startScreen}
        cgGalleryPages={project.cgGallery.pages}
        resolveMediaUrl={resolveMediaUrl}
        onStart={vi.fn()}
        onExit={vi.fn()}
      />,
    ));

    const cgButton = exactButton(container, 'CG画廊');
    cgButton.focus();
    cgButton.addEventListener('click', () => cgButton.blur(), { once: true });
    await act(async () => cgButton.click());
    expect(document.activeElement).toBe(container.querySelector(
      '[aria-label="关闭CG画廊"]',
    ));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        '[aria-label="关闭CG画廊"]',
      )?.click();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(cgButton);

    const optionsButton = exactButton(container, '选项');
    optionsButton.focus();
    optionsButton.addEventListener(
      'click',
      () => optionsButton.blur(),
      { once: true },
    );
    await act(async () => optionsButton.click());
    expect(document.activeElement).toBe(container.querySelector(
      '[aria-label="关闭选项"]',
    ));
    await act(async () => {
      exactButton(container, '返回').click();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(optionsButton);
  });

  it('confirms overwriting a manual slot before saving its canonical snapshot', async () => {
    listSaveSlots.mockResolvedValue({
      status: 'ready',
      slots: [{
        slotId: 1,
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: { kind: 'progress' },
      }],
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => exactButton(container, '保存').click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-save-slot-id="1"]',
    )?.click());

    expect(container.textContent).toContain('覆盖存档 1？');
    expect(saveGame).not.toHaveBeenCalled();

    await act(async () => exactButton(container, '确认覆盖').click());

    expect(saveGame).toHaveBeenCalledOnce();
    expect(saveGame.mock.calls[0]?.[0]).toBe(1);
    expect(saveGame.mock.calls[0]?.[1]).toMatchObject({
      snapshotVersion: 5,
      sceneId: 'entry',
      status: 'playing',
    });
    expect(container.querySelector('[aria-label="保存游戏"]')).toBeNull();
    expect(container.textContent).toContain('已保存到存档 1');
  });

  it('keeps a late video URL paused during save and resumes it afterwards', async () => {
    const pendingVideoUrl = deferred<string | null>();
    const pendingSave = deferred<{
      status: 'saved';
      slot: {
        slotId: 1;
        savedAt: string;
        sceneName: string;
        summary: PlayerSaveSummaryContent;
      };
    }>();
    resolveMediaUrl.mockImplementation((assetId: string) =>
      assetId === 'video-1'
        ? pendingVideoUrl.promise
        : Promise.resolve(`vn-game-asset://session/${assetId}`),
    );
    saveGame.mockReturnValue(pendingSave.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => container.querySelector('.player-game')?.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    ));
    await act(async () => exactButton(container, '继续前进').click());
    expect(container.querySelector('video')).not.toBeNull();

    const pauseCalls = vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;
    await act(async () => exactButton(container, '保存').click());
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length)
      .toBeGreaterThan(pauseCalls);
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-save-slot-id="1"]',
    )?.click());

    const playCallsWhileBlocked = vi.mocked(HTMLMediaElement.prototype.play)
      .mock.calls.length;
    await act(async () => pendingVideoUrl.resolve(
      'vn-game-asset://session/video-1',
    ));
    const blockedVideo = container.querySelector('video');
    expect(blockedVideo?.getAttribute('src')).toContain('video-1');
    expect(blockedVideo?.autoplay).toBe(false);
    await act(async () => blockedVideo?.dispatchEvent(
      new Event('canplay', { bubbles: true }),
    ));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length)
      .toBe(playCallsWhileBlocked);

    await act(async () => blockedVideo?.dispatchEvent(
      new Event('ended', { bubbles: true }),
    ));
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('video-2');

    const playCalls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await act(async () => pendingSave.resolve({
      status: 'saved',
      slot: {
        slotId: 1,
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '过场',
        summary: { kind: 'playing-video' },
      },
    }));
    expect(vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length)
      .toBeGreaterThan(playCalls);

    await act(async () => container.querySelector('video')?.dispatchEvent(
      new Event('ended', { bubbles: true }),
    ));
    expect(resolveMediaUrl).toHaveBeenCalledWith('video-2');
  });

  it('keeps current progress and blocks Escape while a manual load is pending', async () => {
    listSaveSlots.mockResolvedValue({
      status: 'ready',
      slots: [{
        slotId: 1,
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: { kind: 'progress' },
      }],
    });
    const pendingLoad = deferred<{
      status: 'rejected';
      error: PlayerErrorCode;
    }>();
    loadGameSlot.mockReturnValue(pendingLoad.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    const gameBeforeLoad = container.querySelector('.player-game');
    await act(async () => exactButton(container, '读取').click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[data-save-slot-id="1"]',
    )?.click());

    const escape = keyboard('Escape');
    await act(async () => window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="读取游戏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="暂停菜单"]')).toBeNull();

    await act(async () => pendingLoad.resolve({
      status: 'rejected',
      error: 'save-incompatible',
    }));
    expect(container.querySelector('.player-game')).toBe(gameBeforeLoad);
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('存档与当前游戏不兼容');
  });

  it('latches quick operations and remounts gameplay after a successful load', async () => {
    const pendingSave = deferred<{
      status: 'saved';
      slot: {
        slotId: 'quick';
        savedAt: string;
        sceneName: string;
        summary: PlayerSaveSummaryContent;
      };
    }>();
    quickSave.mockReturnValue(pendingSave.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    await act(async () => {
      exactButton(container, '快速保存').click();
      exactButton(container, '快速保存').click();
    });
    expect(quickSave).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('保存中…');
    expect(container.querySelector('[aria-label="游戏操作"]')).not.toBeNull();

    await act(async () => pendingSave.resolve({
      status: 'saved',
      slot: {
        slotId: 'quick',
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: {
          kind: 'dialogue',
          speaker: '小星',
          text: '欢迎来到故事。',
        },
      },
    }));
    expect(container.textContent).toContain('快速保存完成');

    expect(container.querySelector('.player-save-toast')
      ?.getAttribute('aria-atomic')).toBe('true');

    const gameBeforeLoad = container.querySelector('.player-game');
    quickLoad.mockResolvedValue({
      status: 'loaded',
      runtime: initialRuntime(),
    });
    await act(async () => exactButton(container, '快速读取').click());

    expect(quickLoad).toHaveBeenCalledOnce();
    expect(container.querySelector('.player-game')).not.toBe(gameBeforeLoad);
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).toContain('快速读取完成');
  });

  it('does not block start when title-music autoplay is rejected', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
      new Error('autoplay denied'),
    );
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: {
        ...game,
        project: {
          ...project,
          startScreen: {
            title: project.startScreen.title,
            eyebrow: project.startScreen.eyebrow,
            backgroundAssetId: null,
            musicAssetId: 'title-music',
          },
        },
      },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => undefined);
    await act(async () => button(container, '开始游戏').click());
    expect(container.textContent).toContain('欢迎来到故事。');
  });

  it('browses CG images nine per page and opens a selected image', async () => {
    const imageAssetIds = Array.from({ length: 10 }, (_, index) =>
      `cg-${index + 1}`,
    );
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: {
        ...game,
        project: {
          ...project,
          cgGallery: {
            pages: [
              { imageAssetIds: imageAssetIds.slice(0, 9) },
              {
                imageAssetIds: [
                  imageAssetIds[9],
                  ...Array<string | null>(8).fill(null),
                ],
              },
            ],
          },
        },
      },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('cg-1');

    await act(async () => button(container, 'CG画廊').click());
    await act(async () => undefined);
    expect(container.querySelector('[aria-label="CG画廊"]')).not.toBeNull();
    expect(container.querySelectorAll('.player-cg-thumbnail')).toHaveLength(9);
    expect(resolveMediaUrl).toHaveBeenCalledWith('cg-1');
    expect(resolveMediaUrl).toHaveBeenCalledWith('cg-9');
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('cg-10');

    await act(async () => button(container, '下一页').click());
    await act(async () => undefined);
    expect(container.querySelectorAll('.player-cg-thumbnail')).toHaveLength(9);
    expect(container.querySelectorAll('.player-cg-thumbnail:disabled')).toHaveLength(8);
    expect(container.textContent).toContain('2 / 2');
    expect(resolveMediaUrl).toHaveBeenCalledWith('cg-10');

    const lastCg = container.querySelector<HTMLButtonElement>(
      '[aria-label="放大 CG 10"]',
    );
    lastCg?.focus();
    await act(async () => lastCg?.click());
    expect(container.querySelector('[aria-label="CG 10 大图"]')).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector(
      '.player-cg-lightbox-close',
    ));

    await act(async () => {
      window.dispatchEvent(keyboard('Escape'));
      await Promise.resolve();
    });
    expect(container.querySelector('[aria-label="CG 10 大图"]')).toBeNull();
    expect(container.querySelector('[aria-label="CG画廊"]')).not.toBeNull();
    expect(document.activeElement).toBe(lastCg);
    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.querySelector('[aria-label="CG画廊"]')).toBeNull();
  });

  it('keeps a manually added empty CG page in pagination', async () => {
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: {
        ...game,
        project: {
          ...project,
          cgGallery: {
            pages: [
              {
                imageAssetIds: [
                  'cg-1',
                  ...Array<string | null>(8).fill(null),
                ],
              },
              { imageAssetIds: Array<string | null>(9).fill(null) },
            ],
          },
        },
      },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, 'CG画廊').click());
    await act(async () => undefined);
    await act(async () => button(container, '下一页').click());

    expect(container.textContent).toContain('2 / 2');
    expect(container.querySelectorAll('.player-cg-thumbnail')).toHaveLength(9);
    expect(container.querySelectorAll('.player-cg-thumbnail:disabled')).toHaveLength(9);
    expect(container.textContent).toContain('无');
  });

  it('maps the title exit action to the Player quit gateway', async () => {
    await act(async () => root.render(<App gateway={gateway} />));

    await act(async () => button(container, '退出游戏').click());

    expect(quit).toHaveBeenCalledOnce();
    expect(gateway.openGame).not.toHaveBeenCalled();
  });

  it('returns from the running story to its title without quitting the Player', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Enter')));

    expect(exactButton(container, '返回标题')).toBeTruthy();
    expect(exactButton(container, '继续前进')).toBeTruthy();
    expect(container.querySelector('h1')).toBeNull();

    await act(async () => exactButton(container, '返回标题').click());

    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(button(container, '开始游戏')).toBeTruthy();
    expect(exactButton(container, '退出游戏')).toBeTruthy();
    expect(quit).not.toHaveBeenCalled();

    await act(async () => button(container, '开始游戏').click());
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');
    expect(quit).not.toHaveBeenCalled();
  });

  it('re-resolves same-ID title assets after replacing the bundle', async () => {
    const titledGame = {
      ...game,
      project: {
        ...project,
        startScreen: {
          title: project.startScreen.title,
          eyebrow: project.startScreen.eyebrow,
          backgroundAssetId: 'same-title',
          musicAssetId: null,
        },
      },
    };
    resolveMediaUrl.mockResolvedValueOnce('vn-game-asset://first/same-title')
      .mockResolvedValueOnce('vn-game-asset://second/same-title');
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: titledGame,
    });
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'opened',
      game: { ...titledGame, project: { ...titledGame.project } },
    });

    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => undefined);
    expect(container.querySelector<HTMLImageElement>('.player-title-background')?.src)
      .toContain('first/same-title');

    await act(async () => button(container, '选项').click());
    await act(async () => button(container, '打开其他游戏').click());
    await act(async () => undefined);

    expect(resolveMediaUrl).toHaveBeenCalledTimes(2);
    expect(container.querySelector<HTMLImageElement>('.player-title-background')?.src)
      .toContain('second/same-title');
    expect(container.querySelector('[aria-label="选项"]')).toBeNull();
  });

  it('pauses and resumes with Escape without advancing the dialogue', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const escape = keyboard('Escape');
    await act(async () => window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="暂停菜单"]')).not.toBeNull();
    expect(container.textContent).not.toContain('欢迎来到故事。');

    await act(async () => window.dispatchEvent(keyboard('Enter')));
    expect(container.querySelector('[aria-label="暂停菜单"]')).not.toBeNull();

    const pauseMenu = container.querySelector<HTMLElement>(
      '[aria-label="暂停菜单"]',
    );
    expect(exactButton(pauseMenu!, '重新开始').classList)
      .toContain('secondary');
    const pauseOptions = exactButton(pauseMenu!, '选项');
    pauseOptions.focus();
    await act(async () => pauseOptions.click());
    expect(container.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(pauseMenu?.getAttribute('aria-hidden')).toBe('true');
    expect(pauseMenu?.hasAttribute('inert')).toBe(true);
    const continueButton = exactButton(pauseMenu!, '继续游戏');
    expect(continueButton.disabled).toBe(true);
    await act(async () => continueButton.click());
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="暂停菜单"]')).not.toBeNull();
    await act(async () => exactButton(
      container.querySelector('[aria-label="选项"]')!,
      '返回',
    ).click());
    expect(pauseMenu?.getAttribute('aria-hidden')).toBeNull();
    expect(pauseMenu?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(pauseOptions);

    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.querySelector('[aria-label="暂停菜单"]')).toBeNull();
    expect(container.textContent).toContain('欢迎来到故事。');

    await act(async () => window.dispatchEvent(keyboard('Escape')));
    const reopenedPauseMenu = container.querySelector<HTMLElement>(
      '[aria-label="暂停菜单"]',
    );
    expect(exactButton(reopenedPauseMenu!, '返回标题')).toBeTruthy();
    await act(async () => exactButton(reopenedPauseMenu!, '返回标题').click());
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(quit).not.toHaveBeenCalled();
  });

  it('offers restart and return-to-title after the story finishes', async () => {
    const shortGame = {
      project: {
        ...project,
        scenes: [{
          schemaVersion: 1 as const,
          id: 'entry',
          name: '短篇',
          backgroundAssetId: null,
          backgroundScalePercent: 100,
          nodes: [{
            id: 'only-line',
            type: 'dialogue' as const,
            speaker: '旁白',
            text: '结束。',
            voiceAssetId: null,
          }],
        }],
      },
      assets: [],
    };
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: shortGame,
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Enter')));

    expect(container.querySelector('[aria-label="游戏结束"]')).not.toBeNull();
    await act(async () => button(container, '重新开始').click());
    expect(container.textContent).toContain('结束。');

    await act(async () => window.dispatchEvent(keyboard('Enter')));
    await act(async () => exactButton(container, '返回标题').click());
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(button(container, '开始游戏')).toBeTruthy();
    expect(quit).not.toHaveBeenCalled();
  });

  it('opens a .vngame from the empty shell and switches to its title page', async () => {
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'empty',
      mode: 'generic',
    });
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'opened',
      game,
    });
    await act(async () => root.render(<App gateway={gateway} />));

    expect(container.textContent).toContain('.vngame');
    const emptyCard = container.querySelector<HTMLElement>('.player-shell-card');
    expect(emptyCard?.getAttribute('aria-labelledby')).toBe('player-empty-title');
    expect(emptyCard?.getAttribute('aria-describedby'))
      .toBe('player-empty-description');
    await act(async () => button(container, '选择游戏包').click());
    expect(gateway.openGame).toHaveBeenCalledOnce();
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.textContent).toContain('开始游戏');
  });

  it('keeps the current game when a replacement bundle is rejected', async () => {
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'rejected',
      error: 'bundle-selection-failed',
    });
    await act(async () => root.render(<App gateway={gateway} />));

    await act(async () => button(container, '选项').click());
    await act(async () => button(container, '打开其他游戏').click());
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.querySelector('[role="alertdialog"]')?.textContent)
      .toContain('无法打开游戏内容包');

    await act(async () => button(container, '返回').click());
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
  });

  it('traps replacement errors and blocks the underlying story until dismissed', async () => {
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'rejected',
      error: 'bundle-selection-failed',
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    const gameOptions = exactButton(
      container.querySelector('[aria-label="游戏操作"]')!,
      '选项',
    );
    gameOptions.focus();
    await act(async () => gameOptions.click());
    await act(async () => exactButton(container, '打开其他游戏').click());

    const errorDialog = container.querySelector<HTMLElement>(
      '[aria-label="内容包未打开"]',
    );
    expect(errorDialog?.textContent).toContain('无法打开游戏内容包');
    expect(container.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(exactButton(errorDialog!, '返回')).toBe(document.activeElement);
    expect(container.textContent).toContain('欢迎来到故事。');

    await act(async () => window.dispatchEvent(keyboard('Enter')));
    await act(async () => container.querySelector('.player-game')?.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    ));
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');

    const reverseTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    await act(async () => window.dispatchEvent(reverseTab));
    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(
      exactButton(errorDialog!, '选择其他游戏包'),
    );

    await act(async () => exactButton(
      errorDialog!,
      '选择其他游戏包',
    ).click());
    expect(gateway.openGame).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[aria-label="内容包未打开"]')).not.toBeNull();

    const escape = keyboard('Escape');
    await act(async () => window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="内容包未打开"]')).toBeNull();
    expect(document.activeElement).toBe(gameOptions);
    expect(container.textContent).toContain('欢迎来到故事。');
  });

  it('shows a recoverable error page for a rejected or malformed bundle', async () => {
    gateway.loadGame = vi.fn().mockResolvedValueOnce({
      status: 'error',
      mode: 'generic',
      error: 'bundle-load-failed',
    });
    await act(async () => root.render(<App gateway={gateway} />));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '无法读取游戏内容包',
    );
    const errorCard = container.querySelector<HTMLElement>('[role="alert"]');
    expect(errorCard?.getAttribute('aria-labelledby')).toBe('player-error-title');
    expect(errorCard?.getAttribute('aria-describedby'))
      .toBe('player-error-description');
    gateway.openGame = vi.fn().mockRejectedValueOnce(new Error('read failed'));
    await act(async () => button(container, '选择其他游戏包').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '无法读取游戏内容包',
    );
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain(
      '无法打开游戏内容包',
    );
  });

  it('turns a missing entry scene into a player-facing error', async () => {
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'generic',
      game: {
        defaultLanguage: 'zh-CN',
        project: { ...project, entrySceneId: 'missing' },
        assets: [],
      },
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '入口场景不存在',
    );
  });

  it('keeps embedded games read-only across title, pause, end and load errors', async () => {
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'loaded',
      mode: 'embedded',
      game,
    });
    await act(async () => root.render(<App gateway={gateway} />));

    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.textContent).not.toContain('打开其他游戏');
    expect(container.textContent).not.toContain('选择游戏包');

    await act(async () => button(container, '开始游戏').click());
    await act(async () => window.dispatchEvent(keyboard('Escape')));
    expect(container.querySelector('[aria-label="暂停菜单"]')).not.toBeNull();
    expect(container.textContent).not.toContain('打开其他游戏');
    expect(gateway.openGame).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    root = createRoot(container);
    gateway.loadGame = vi.fn().mockResolvedValue({
      status: 'error',
      mode: 'embedded',
      error: 'bundle-load-failed',
    });
    await act(async () => root.render(<App gateway={gateway} />));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('选择其他游戏包');
    expect(container.textContent).toContain('退出游戏');
  });
});
