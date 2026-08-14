import { BrowserWindow, screen } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isSameEditorLocation } from './security/editorFrameTrust';
import { cascadedEditorWindowPosition } from './window/editorWindowPlacement';

export function resolveEditorEntryUrl(): string {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return MAIN_WINDOW_VITE_DEV_SERVER_URL;
  }

  return pathToFileURL(
    path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    ),
  ).toString();
}

type CreateEditorWindowOptions = {
  deferLoad?: boolean;
  sourceWindow?: BrowserWindow;
};

export function createEditorWindow(
  entryUrl: string,
  options: CreateEditorWindowOptions = {},
): BrowserWindow {
  const editorWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    useContentSize: true,
    center: true,
    show: false,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      zoomFactor: 1,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A separate in-memory Electron session gives every editor window its
      // own vn-asset protocol handler and prevents one project from loading a
      // capability URL created by another window.
      partition: `vn-editor-${randomUUID()}`,
    },
  });

  const sourceWindow = options.sourceWindow;
  if (sourceWindow && !sourceWindow.isDestroyed()) {
    const sourceBounds = sourceWindow.getBounds();
    const [width, height] = editorWindow.getSize();
    const workArea = screen.getDisplayMatching(sourceBounds).workArea;
    const position = cascadedEditorWindowPosition(
      sourceBounds,
      { width, height },
      workArea,
    );
    editorWindow.setPosition(position.x, position.y);
  }

  // 等 Renderer 完成首屏加载再显示，避免启动时闪过空白窗口。
  editorWindow.once('ready-to-show', () => {
    editorWindow.show();
  });

  editorWindow.webContents.on('did-finish-load', () => {
    editorWindow.webContents.setZoomFactor(1);
  });

  // Preload 拥有受限的项目 API，因此编辑器窗口不能导航到外部页面，
  // 也不允许页面自行创建继承编辑器权限的新窗口。
  editorWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSameEditorLocation(targetUrl, entryUrl)) {
      event.preventDefault();
    }
  });
  editorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (!options.deferLoad) {
    void editorWindow.loadURL(entryUrl);
  }

  return editorWindow;
}
