// 主要作用：安装符合当前语言的 Electron 应用菜单和项目命令。
// 关键实现：installApplicationMenu 构建菜单模板并向聚焦窗口发送命令。
import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

import {
  PROJECT_FILE_COMMAND_CHANNEL,
  type ProjectFileCommand,
} from '../../shared/projectFileProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorNativeLabels } from '../i18n/editorNativeLabels';

function sendProjectCommand(command: ProjectFileCommand): void {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return;
  }

  focusedWindow.webContents.send(PROJECT_FILE_COMMAND_CHANNEL, command);
}

export function installApplicationMenu(language: EditorLanguage = 'zh-CN'): void {
  const labels = getEditorNativeLabels(language).menu;
  const template: MenuItemConstructorOptions[] = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push(
    {
      label: labels.file,
      submenu: [
        {
          label: labels.newProject,
          accelerator: 'CmdOrCtrl+N',
          click: () => sendProjectCommand('new'),
        },
        {
          label: labels.openProject,
          accelerator: 'CmdOrCtrl+O',
          click: () => sendProjectCommand('open'),
        },
        { type: 'separator' },
        {
          label: labels.saveProject,
          accelerator: 'CmdOrCtrl+S',
          click: () => sendProjectCommand('save'),
        },
        ...(process.platform === 'darwin'
          ? []
          : ([
              { type: 'separator' },
              { role: 'quit', label: labels.quit },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: labels.edit,
      submenu: [
        { role: 'undo', label: labels.undo },
        { role: 'redo', label: labels.redo },
        { type: 'separator' },
        { role: 'cut', label: labels.cut },
        { role: 'copy', label: labels.copy },
        { role: 'paste', label: labels.paste },
        { role: 'selectAll', label: labels.selectAll },
      ],
    },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
