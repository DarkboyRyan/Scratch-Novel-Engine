import { BrowserWindow } from 'electron';
import path from 'node:path';

export function createEditorWindow(): BrowserWindow {
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
    },
  });

  // 等 Renderer 完成首屏加载再显示，避免启动时闪过空白窗口。
  editorWindow.once('ready-to-show', () => {
    editorWindow.show();
  });

  editorWindow.webContents.on('did-finish-load', () => {
    editorWindow.webContents.setZoomFactor(1);
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void editorWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void editorWindow.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  return editorWindow;
}
