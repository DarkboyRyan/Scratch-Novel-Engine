/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ProjectDocument } from '@vnengine/runtime';
import type * as PlayerUi from '@vnengine/player-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';
import type { PlayerGateway } from '../../src/renderer/playerGateway';

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

function keyboard(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });
}

describe('Player Renderer', () => {
  let container: HTMLDivElement;
  let root: Root;
  let gateway: PlayerGateway;
  let resolveMediaUrl: ReturnType<typeof vi.fn>;
  let quit: ReturnType<typeof vi.fn>;

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
    gateway = {
      loadGame: vi.fn().mockResolvedValue({
        status: 'loaded',
        mode: 'generic',
        game,
      }),
      openGame: vi.fn().mockResolvedValue({ status: 'canceled' }),
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
    expect(button(container, '选项')).toBeTruthy();
    expect(button(container, '退出游戏')).toBeTruthy();
    expect(
      container.querySelector('.player-title-actions-vertical')?.children,
    ).toHaveLength(3);
    expect(container.textContent).not.toContain('打开其他游戏');

    await act(async () => button(container, '选项').click());
    expect(container.querySelector('[aria-label="选项"]')).not.toBeNull();
    expect(container.textContent).toContain('打开其他游戏');
    await act(async () => button(container, '返回').click());
    await act(async () => button(container, '开始游戏').click());

    expect(container.querySelector('.player-title-music')).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
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
