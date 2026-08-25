/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { startGame, type ProjectDocument } from '@vnengine/runtime';
import { TitleScreen, usePreviewAudio } from '@vnengine/player-ui';
import type * as PlayerUi from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';
import type { PlayerGateway } from '../../src/renderer/playerGateway';
import { createDefaultPlayerSettings } from '../../src/shared/playerProtocol';

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
      nodes: [
        { id: 'background', type: 'background', assetId: 'background-1' },
        {
          id: 'character',
          type: 'character',
          assetId: 'character-1',
          slot: 'center',
          layer: 2,
          position: { x: 37, y: 89 },
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

function keyboard(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {
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
        summary: '小星：欢迎来到故事。',
      },
    });
    loadGameSlot = vi.fn().mockResolvedValue({ status: 'empty' });
    quickSave = vi.fn().mockResolvedValue({
      status: 'saved',
      slot: {
        slotId: 'quick',
        savedAt: '2026-08-24T08:00:00.000Z',
        sceneName: '序章',
        summary: '小星：欢迎来到故事。',
      },
    });
    quickLoad = vi.fn().mockResolvedValue({ status: 'empty' });
    let storedSettings = createDefaultPlayerSettings();
    getSettings = vi.fn().mockResolvedValue({
      status: 'ready',
      settings: storedSettings,
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
    expect(container.textContent).toContain('正在载入游戏');
    expect(resolveMediaUrl).not.toHaveBeenCalledWith('title-music');

    await act(async () => settingsRequest.resolve({
      status: 'ready',
      settings: quietSettings,
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

  it('commits keyboard volume changes one at a time and restores focus', async () => {
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        masterVolume: 0.4,
      },
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

  it('refreshes native window mode while the options dialog is open', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    getSettings.mockResolvedValue({
      status: 'ready',
      settings: {
        ...createDefaultPlayerSettings(),
        windowMode: 'fullscreen',
      },
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
    });
    const pendingUpdate = deferred<{
      status: 'rejected';
      error: string;
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
      error: '设置暂时无法保存',
    }));
    expect(master?.value).toBe('50');
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('设置暂时无法保存');
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
      windowMode: 'windowed',
      windowSizePreset: 'medium',
    });
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
          summary: '小星：欢迎来到故事。',
        },
        {
          slotId: 'quick',
          savedAt: '2026-08-24T08:30:00.000Z',
          sceneName: '序章',
          summary: '快速存档',
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
    expect(container.querySelector('[aria-label="读取快速存档"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>(
      '[aria-label="读取存档 2"]',
    )?.disabled).toBe(true);

    await act(async () => container.querySelector<HTMLButtonElement>(
      '[aria-label="读取快速存档"]',
    )?.click());

    expect(quickLoad).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).toContain('已读取快速存档');
  });

  it('traps title-load focus, deduplicates list requests and restores its trigger', async () => {
    const pendingSlots = deferred<{
      status: 'ready';
      slots: Array<{
        slotId: 1;
        savedAt: string;
        sceneName: string;
        summary: string;
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
        summary: '小星：欢迎来到故事。',
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
      '[aria-label="读取存档 1"]',
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

  it('keeps the action bar from advancing the story and marks future actions unavailable', async () => {
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());

    const actionBar = container.querySelector('[aria-label="游戏操作"]');
    expect(actionBar?.querySelectorAll('button')).toHaveLength(7);
    expect(exactButton(actionBar!, '快进').disabled).toBe(true);
    expect(exactButton(actionBar!, '快进').title).toBe('暂未开放');
    expect(exactButton(actionBar!, '选项').disabled).toBe(false);
    expect(exactButton(actionBar!, '选项').title).toBe('');

    await act(async () => exactButton(actionBar!, '保存').dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, button: 0 }),
    ));

    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.textContent).not.toContain('继续前进');
    expect(listSaveSlots).not.toHaveBeenCalled();
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
        summary: '旧进度',
      }],
    });
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    await act(async () => exactButton(container, '保存').click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[aria-label="存入存档 1"]',
    )?.click());

    expect(container.textContent).toContain('覆盖存档 1？');
    expect(saveGame).not.toHaveBeenCalled();

    await act(async () => exactButton(container, '确认覆盖').click());

    expect(saveGame).toHaveBeenCalledOnce();
    expect(saveGame.mock.calls[0]?.[0]).toBe(1);
    expect(saveGame.mock.calls[0]?.[1]).toMatchObject({
      snapshotVersion: 1,
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
        summary: string;
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
      '[aria-label="存入存档 1"]',
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
        summary: '过场动画',
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
        summary: '旧进度',
      }],
    });
    const pendingLoad = deferred<{
      status: 'rejected';
      error: string;
    }>();
    loadGameSlot.mockReturnValue(pendingLoad.promise);
    await act(async () => root.render(<App gateway={gateway} />));
    await act(async () => button(container, '开始游戏').click());
    const gameBeforeLoad = container.querySelector('.player-game');
    await act(async () => exactButton(container, '读取').click());
    await act(async () => container.querySelector<HTMLButtonElement>(
      '[aria-label="读取存档 1"]',
    )?.click());

    const escape = keyboard('Escape');
    await act(async () => window.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(container.querySelector('[aria-label="读取游戏"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="暂停菜单"]')).toBeNull();

    await act(async () => pendingLoad.resolve({
      status: 'rejected',
      error: '存档校验失败',
    }));
    expect(container.querySelector('.player-game')).toBe(gameBeforeLoad);
    expect(container.textContent).toContain('欢迎来到故事。');
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toContain('存档校验失败');
  });

  it('latches quick operations and remounts gameplay after a successful load', async () => {
    const pendingSave = deferred<{
      status: 'saved';
      slot: {
        slotId: 'quick';
        savedAt: string;
        sceneName: string;
        summary: string;
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
        summary: '小星：欢迎来到故事。',
      },
    }));
    expect(container.textContent).toContain('快速保存完成');

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

  it('re-resolves same-ID title assets after replacing the bundle', async () => {
    const titledGame = {
      ...game,
      project: {
        ...project,
        startScreen: {
          title: project.startScreen.title,
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
  });

  it('offers restart and exit after the story finishes', async () => {
    const shortGame = {
      project: {
        ...project,
        scenes: [{
          schemaVersion: 1 as const,
          id: 'entry',
          name: '短篇',
          backgroundAssetId: null,
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
    await act(async () => button(container, '退出游戏').click());
    expect(quit).toHaveBeenCalledOnce();
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
    await act(async () => button(container, '选择游戏包').click());
    expect(gateway.openGame).toHaveBeenCalledOnce();
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.textContent).toContain('开始游戏');
  });

  it('keeps the current game when a replacement bundle is rejected', async () => {
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'rejected',
      error: '游戏内容包无效、已损坏或版本不受支持',
    });
    await act(async () => root.render(<App gateway={gateway} />));

    await act(async () => button(container, '选项').click());
    await act(async () => button(container, '打开其他游戏').click());
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
    expect(container.querySelector('[role="alertdialog"]')?.textContent)
      .toContain('版本不受支持');

    await act(async () => button(container, '返回').click());
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('自定义星光标题');
  });

  it('traps replacement errors and blocks the underlying story until dismissed', async () => {
    gateway.openGame = vi.fn().mockResolvedValue({
      status: 'rejected',
      error: '替换内容包无效',
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
    expect(errorDialog?.textContent).toContain('替换内容包无效');
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
      error: 'manifest.json 校验失败',
    });
    await act(async () => root.render(<App gateway={gateway} />));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'manifest.json 校验失败',
    );
    gateway.openGame = vi.fn().mockRejectedValueOnce(new Error('read failed'));
    await act(async () => button(container, '选择其他游戏包').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'manifest.json 校验失败',
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
      error: '游戏内容包无效、已损坏或版本不受支持',
    });
    await act(async () => root.render(<App gateway={gateway} />));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('选择其他游戏包');
    expect(container.textContent).toContain('退出游戏');
  });
});
