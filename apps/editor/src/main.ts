import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';

import { BackendClient } from './main/backend/backendClient';
import { createEditorWindow } from './main/createEditorWindow';
import { registerEngineIpc } from './main/ipc/registerEngineIpc';

const backendClient = new BackendClient();
const trustedWebContentsIds = new Set<number>();

if (started) {
  app.quit();
}

function openEditorWindow(): void {
  const editorWindow = createEditorWindow();
  const webContentsId = editorWindow.webContents.id;

  trustedWebContentsIds.add(webContentsId);
  editorWindow.webContents.once('destroyed', () => {
    trustedWebContentsIds.delete(webContentsId);
  });
}

registerEngineIpc(backendClient, trustedWebContentsIds);

app.on('ready', openEditorWindow);

app.on('before-quit', () => {
  backendClient.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openEditorWindow();
  }
});
