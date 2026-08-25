import type { MenuItemConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installApplicationMenu } from '../../src/main/menu/installApplicationMenu';
import { PROJECT_FILE_COMMAND_CHANNEL } from '../../src/shared/projectFileProtocol';

const electronMocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  getFocusedWindow: vi.fn(),
  setApplicationMenu: vi.fn(),
  webContentsSend: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { name: 'VN Engine Editor' },
  BrowserWindow: {
    getFocusedWindow: electronMocks.getFocusedWindow,
  },
  Menu: {
    buildFromTemplate: electronMocks.buildFromTemplate,
    setApplicationMenu: electronMocks.setApplicationMenu,
  },
}));

function installAndFindSaveItem(): MenuItemConstructorOptions {
  installApplicationMenu();

  const template = electronMocks.buildFromTemplate.mock.calls[0]?.[0] as
    | MenuItemConstructorOptions[]
    | undefined;
  const fileMenu = template?.find((item) => item.label === '文件');
  const fileSubmenu = fileMenu?.submenu as
    | MenuItemConstructorOptions[]
    | undefined;
  const saveItem = fileSubmenu?.find(
    (item) => item.label === '保存项目',
  );

  if (!saveItem) {
    throw new Error('应用菜单中缺少“保存项目”');
  }

  return saveItem;
}

function clickMenuItem(item: MenuItemConstructorOptions): void {
  if (!item.click) {
    throw new Error('“保存项目”没有 click 处理函数');
  }

  (item.click as () => void)();
}

describe('application menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.getFocusedWindow.mockReturnValue(null);
  });

  it('registers CmdOrCtrl+S for the save command', () => {
    const saveItem = installAndFindSaveItem();

    expect(saveItem.accelerator).toBe('CmdOrCtrl+S');
    expect(electronMocks.setApplicationMenu).toHaveBeenCalledWith(
      electronMocks.buildFromTemplate.mock.results[0]?.value,
    );
  });

  it('sends save to the focused editor window', () => {
    electronMocks.getFocusedWindow.mockReturnValue({
      isDestroyed: () => false,
      webContents: { send: electronMocks.webContentsSend },
    });
    const saveItem = installAndFindSaveItem();

    clickMenuItem(saveItem);

    expect(electronMocks.webContentsSend).toHaveBeenCalledOnce();
    expect(electronMocks.webContentsSend).toHaveBeenCalledWith(
      PROJECT_FILE_COMMAND_CHANNEL,
      'save',
    );
  });

  it('does nothing when no editor window is focused', () => {
    const saveItem = installAndFindSaveItem();

    expect(() => clickMenuItem(saveItem)).not.toThrow();
    expect(electronMocks.getFocusedWindow).toHaveBeenCalledOnce();
    expect(electronMocks.webContentsSend).not.toHaveBeenCalled();
  });

  it('rebuilds the native menu in English for the global Editor language', () => {
    installApplicationMenu('en-US');
    const template = electronMocks.buildFromTemplate.mock.calls[0]?.[0] as
      MenuItemConstructorOptions[];
    const fileMenu = template.find((item) => item.label === 'File');
    const fileItems = fileMenu?.submenu as MenuItemConstructorOptions[];

    expect(fileItems.map((item) => item.label).filter(Boolean)).toEqual(
      expect.arrayContaining([
        'New Project',
        'Open Project…',
        'Save Project',
      ]),
    );
    expect(template.some((item) => item.label === 'Edit')).toBe(true);
    const editMenu = template.find((item) => item.label === 'Edit');
    const editItems = editMenu?.submenu as MenuItemConstructorOptions[];
    expect(editItems.map((item) => item.label).filter(Boolean)).toEqual([
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Select All',
    ]);
  });
});
