/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamePreview } from '../../src/renderer/features/game-preview/GamePreview';
import type { GamePreviewSession } from '../../src/renderer/features/game-preview/useGamePreview';

vi.mock(
  '../../src/renderer/features/game-preview/usePreviewAudio',
  () => ({ usePreviewAudio: vi.fn() }),
);

const options = [
  { id: 'option-a', text: '调查教室', targetSceneId: 'scene-a' },
  { id: 'option-b', text: '前往天台', targetSceneId: 'scene-b' },
  { id: 'option-c', text: '留在原地', targetSceneId: 'scene-c' },
];

const session: GamePreviewSession = {
  phase: 'story',
  project: {
    schemaVersion: 1,
    id: 'project-choice-input',
    name: 'Choice input',
    entrySceneId: 'scene-entry',
    startScreen: {
      title: 'Choice input',
      backgroundAssetId: null,
      musicAssetId: null,
    },
    cgGallery: {
      pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
    },
    scenes: [
      {
        schemaVersion: 1,
        id: 'scene-entry',
        name: 'Entry',
        backgroundAssetId: null,
        nodes: [{ id: 'choice-1', type: 'choice', options }],
      },
      ...options.map((option) => ({
        schemaVersion: 1 as const,
        id: option.targetSceneId,
        name: option.text,
        backgroundAssetId: null,
        nodes: [],
      })),
    ],
  },
  runtime: {
    status: 'choosing',
    sceneId: 'scene-entry',
    nextNodeIndex: 1,
    backgroundAssetId: null,
    bgmAssetId: 'theme',
    bgmSequence: 1,
    dialogueSequence: 2,
    videoAssetId: null,
    videoSequence: 0,
    characters: [],
    dialogue: null,
    choices: options,
  },
};

describe('GamePreview choices', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('renders one fixed-size rectangular button per option and selects by ID', async () => {
    const onAdvance = vi.fn();
    const onChoiceSelect = vi.fn();
    const onExit = vi.fn();

    await act(async () => {
      root.render(
        <GamePreview
          session={session}
          assets={[]}
          previewUrls={{}}
          resolveMediaUrl={async () => null}
          onAdvance={onAdvance}
          onVideoComplete={vi.fn()}
          onChoiceSelect={onChoiceSelect}
          onEnterStory={vi.fn()}
          onExit={onExit}
        />,
      );
    });

    const list = container.querySelector('.game-preview-choice-list');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(
      '.game-preview-choice-button',
    )];
    expect(list?.getAttribute('role')).toBe('group');
    expect(buttons.map((button) => button.textContent)).toEqual(
      options.map((option) => option.text),
    );
    expect(buttons.every((button) => button.style.height === '')).toBe(true);

    await act(async () => buttons[1].click());
    expect(onChoiceSelect).toHaveBeenCalledOnce();
    expect(onChoiceSelect).toHaveBeenCalledWith('option-b');
    expect(onAdvance).not.toHaveBeenCalled();

    const stage = container.querySelector('.game-preview-stage');
    await act(async () => {
      stage?.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0 }),
      );
    });
    expect(onAdvance).not.toHaveBeenCalled();

    const escape = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    await act(async () => buttons[0].dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('renders the complete title phase and enters the story from Start', async () => {
    const onEnterStory = vi.fn();
    const onExit = vi.fn();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => {});
    const resolveMediaUrl = vi.fn(async (assetId: string) => {
      if (assetId === 'title-background') {
        return 'vn-asset://preview/title-background';
      }
      if (assetId === 'title-music') {
        return 'vn-asset://preview/title-music';
      }
      if (assetId.startsWith('cg-')) {
        return `vn-asset://preview/${assetId}`;
      }
      return null;
    });
    const titleSession: GamePreviewSession = {
      ...session,
      phase: 'title',
      project: {
        ...session.project,
        name: '完整主界面',
        startScreen: {
          title: '自定义预览标题',
          backgroundAssetId: 'title-background',
          musicAssetId: 'title-music',
        },
        cgGallery: {
          pages: [{
            imageAssetIds: [
              'cg-1',
              null,
              'cg-2',
              ...Array<string | null>(6).fill(null),
            ],
          }],
        },
      },
    };

    await act(async () => {
      root.render(
        <GamePreview
          session={titleSession}
          assets={[]}
          previewUrls={{}}
          resolveMediaUrl={resolveMediaUrl}
          onAdvance={vi.fn()}
          onVideoComplete={vi.fn()}
          onChoiceSelect={vi.fn()}
          onEnterStory={onEnterStory}
          onExit={onExit}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[aria-label="完整主界面预览"]'),
    ).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('自定义预览标题');
    expect(container.textContent).toContain('开始游戏');
    expect(container.textContent).toContain('CG画廊');
    expect(container.textContent).toContain('读取游戏');
    expect(container.textContent).toContain('选项');
    expect(container.textContent).toContain('退出游戏');
    expect(
      container.querySelector('.player-title-fit > .player-title-card'),
    ).not.toBeNull();
    expect(resolveMediaUrl).toHaveBeenCalledWith('title-background');
    expect(resolveMediaUrl).toHaveBeenCalledWith('title-music');
    expect(
      container.querySelector<HTMLImageElement>(
        '.player-title-background',
      )?.src,
    ).toContain('vn-asset://preview/title-background');
    const music = container.querySelector<HTMLAudioElement>(
      '.player-title-music',
    );
    expect(music?.src).toContain('vn-asset://preview/title-music');
    expect(music?.loop).toBe(true);
    expect(play).toHaveBeenCalled();

    const loadButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '读取游戏',
    );
    loadButton?.focus();
    await act(async () => loadButton?.click());
    const loadPreviewNotice = container.querySelector(
      '[aria-label="读取游戏预览说明"]',
    );
    expect(loadPreviewNotice?.textContent).toContain(
      'Editor 只预览读取入口',
    );
    expect(loadPreviewNotice?.textContent).toContain(
      '不会访问或修改 Player',
    );
    const dismissLoadNotice = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '知道了',
    );
    expect(document.activeElement).toBe(dismissLoadNotice);
    expect(loadButton?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(
      '[aria-label="退出游戏预览"]',
    )?.disabled).toBe(true);
    const trappedTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    await act(async () => window.dispatchEvent(trappedTab));
    expect(trappedTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dismissLoadNotice);
    await act(async () => {
      dismissLoadNotice?.click();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[aria-label="读取游戏预览说明"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(loadButton);

    const galleryButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'CG画廊',
    );
    await act(async () => galleryButton?.click());
    await act(async () => undefined);
    expect(container.querySelector('[aria-label="CG画廊"]')).not.toBeNull();
    expect(container.querySelectorAll('.player-cg-thumbnail')).toHaveLength(9);
    expect(container.querySelectorAll('.player-cg-thumbnail:disabled')).toHaveLength(7);
    expect(resolveMediaUrl).toHaveBeenCalledWith('cg-1');
    const closeGalleryButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="关闭CG画廊"]',
    );
    await act(async () => closeGalleryButton?.click());

    const optionsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '选项',
    );
    await act(async () => optionsButton?.click());
    const optionsDialog = container.querySelector('[role="dialog"]');
    expect(optionsDialog?.textContent).toContain('主音量');
    expect(optionsDialog?.textContent).toContain('背景音乐');
    expect(optionsDialog?.textContent).toContain(
      '当前运行环境不支持切换窗口模式或窗口尺寸',
    );
    expect(
      optionsDialog?.querySelector<HTMLSelectElement>(
        'select[aria-label="窗口模式"]',
      )?.disabled,
    ).toBe(true);
    expect(
      optionsDialog?.querySelector<HTMLSelectElement>(
        'select[aria-label="窗口尺寸"]',
      )?.disabled,
    ).toBe(true);
    expect(optionsDialog?.textContent).not.toContain('打开其他游戏');
    const returnButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '返回',
    );
    await act(async () => returnButton?.click());

    const startButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('开始游戏'),
    );
    await act(async () => startButton?.click());
    expect(onEnterStory).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();

    const exitButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '退出游戏',
    );
    await act(async () => exitButton?.click());
    expect(onExit).toHaveBeenCalledOnce();
  });
});
