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

function sendProjectCommand(command: ProjectFileCommand): void {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return;
  }

  focusedWindow.webContents.send(PROJECT_FILE_COMMAND_CHANNEL, command);
}

export function installApplicationMenu(): void {
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
      label: '文件',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendProjectCommand('new'),
        },
        {
          label: '打开项目…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendProjectCommand('open'),
        },
        { type: 'separator' },
        {
          label: '保存项目',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendProjectCommand('save'),
        },
        ...(process.platform === 'darwin'
          ? []
          : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
