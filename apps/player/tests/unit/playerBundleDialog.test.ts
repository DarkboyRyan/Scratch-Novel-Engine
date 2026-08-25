import { describe, expect, it, vi } from 'vitest';

import { selectPlayerBundleDirectory } from '../../src/main/content/selectPlayerBundleDirectory';

describe('Player native bundle dialog', () => {
  it('asks Main to select exactly one directory and returns no metadata', async () => {
    const owner = {} as Electron.BrowserWindow;
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/Games/Story.vngame'],
      bookmarks: [],
    });

    await expect(
      selectPlayerBundleDirectory(owner, { showOpenDialog }, 'zh-CN'),
    ).resolves.toBe('/Games/Story.vngame');
    expect(showOpenDialog).toHaveBeenCalledWith(owner, {
      title: '打开 VN Engine 游戏',
      buttonLabel: '打开游戏',
      message: '请选择名称以 .vngame 结尾的游戏目录包',
      properties: ['openDirectory'],
    });
  });

  it('uses English native dialog labels for an English Player', async () => {
    const owner = {} as Electron.BrowserWindow;
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/Games/Story.vngame'],
      bookmarks: [],
    });

    await expect(
      selectPlayerBundleDirectory(owner, { showOpenDialog }, 'en-US'),
    ).resolves.toBe('/Games/Story.vngame');
    expect(showOpenDialog).toHaveBeenCalledWith(owner, {
      title: 'Open VN Engine Game',
      buttonLabel: 'Open Game',
      message: 'Select a game directory whose name ends with .vngame',
      properties: ['openDirectory'],
    });
  });

  it('returns null for cancellation or an impossible multi-selection', async () => {
    const owner = {} as Electron.BrowserWindow;
    const showOpenDialog = vi.fn()
      .mockResolvedValueOnce({ canceled: true, filePaths: [] })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: ['/one.vngame', '/two.vngame'],
      });

    await expect(
      selectPlayerBundleDirectory(owner, { showOpenDialog }, 'zh-CN'),
    ).resolves.toBeNull();
    await expect(
      selectPlayerBundleDirectory(owner, { showOpenDialog }, 'en-US'),
    ).resolves.toBeNull();
  });
});
