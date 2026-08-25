import { app, BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isSamePlayerLocation } from './security/playerFrameTrust';

export function resolvePlayerEntryUrl(): string {
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

export function createPlayerWindow(entryUrl: string): BrowserWindow {
  const packagedLinuxIcon = path.join(
    process.resourcesPath,
    'vn-player-icon.png',
  );
  const icon = app.isPackaged && process.platform === 'linux' && existsSync(packagedLinuxIcon)
    ? packagedLinuxIcon
    : undefined;
  const playerWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    useContentSize: true,
    center: true,
    show: false,
    backgroundColor: '#000000',
    ...(icon === undefined ? {} : { icon }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      // Each Player window owns a separate protocol registry and capability
      // namespace. A URL from one window cannot be consumed by another.
      partition: `vn-player-${randomUUID()}`,
    },
  });

  playerWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isSamePlayerLocation(targetUrl, entryUrl)) {
      event.preventDefault();
    }
  });
  playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return playerWindow;
}
