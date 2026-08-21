import { app, BrowserWindow, dialog, ipcMain, Menu, protocol } from 'electron';

import { PlayerBundleSession } from './main/content/PlayerBundleSession';
import { resolvePlayerStartupContent } from './main/content/resolvePlayerStartupContent';
import { selectPlayerBundleDirectory } from './main/content/selectPlayerBundleDirectory';
import {
  createPlayerWindow,
  resolvePlayerEntryUrl,
} from './main/createPlayerWindow';
import { registerPlayerIpc } from './main/ipc/registerPlayerIpc';
import {
  PLAYER_MEDIA_SCHEME,
  PlayerMediaService,
} from './main/media/PlayerMediaService';
import type { PlayerWindowContext } from './main/window/PlayerWindowContext';

const trustedPlayerLocations = new Map<number, string>();
const playerWindowContexts = new Map<number, PlayerWindowContext>();

protocol.registerSchemesAsPrivileged([
  {
    scheme: PLAYER_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      bypassCSP: false,
      allowServiceWorkers: false,
      supportFetchAPI: false,
      corsEnabled: false,
    },
  },
]);

async function openPlayerWindow(): Promise<void> {
  const startupContent = await resolvePlayerStartupContent();
  const entryUrl = resolvePlayerEntryUrl();
  const playerWindow = createPlayerWindow(entryUrl);
  const webContentsId = playerWindow.webContents.id;
  const mediaService = new PlayerMediaService(
    playerWindow.webContents.session.protocol,
  );

  const bundleSession = new PlayerBundleSession(
    mediaService,
    () => selectPlayerBundleDirectory(playerWindow, dialog),
    undefined,
    (operation, error) => {
      // Filesystem exceptions remain in local Main diagnostics. No absolute
      // path or raw exception crosses IPC into the sandboxed Renderer.
      console.error(`[player] ${operation} failed`, error);
    },
    startupContent.kind === 'embedded' ? 'embedded' : 'generic',
  );
  if (startupContent.kind === 'development') {
    await bundleSession.loadDevelopmentFixture(startupContent.bundleRoot);
  } else if (startupContent.kind === 'embedded') {
    await bundleSession.loadEmbeddedGame(startupContent.bundleRoot);
  }
  const context: PlayerWindowContext = { bundleSession };

  trustedPlayerLocations.set(webContentsId, entryUrl);
  playerWindowContexts.set(webContentsId, context);
  playerWindow.webContents.once('destroyed', () => {
    trustedPlayerLocations.delete(webContentsId);
    playerWindowContexts.delete(webContentsId);
    bundleSession.dispose();
  });

  try {
    await playerWindow.loadURL(entryUrl);
  } catch (error) {
    if (!playerWindow.isDestroyed()) {
      playerWindow.destroy();
    }
    throw error;
  }
}

registerPlayerIpc(
  ipcMain,
  playerWindowContexts,
  trustedPlayerLocations,
  () => app.quit(),
);

app.on('ready', () => {
  Menu.setApplicationMenu(null);
  void openPlayerWindow().catch((error: unknown) => {
    console.error('[player] window startup failed', error);
    app.quit();
  });
});

app.on('before-quit', () => {
  for (const context of playerWindowContexts.values()) {
    context.bundleSession.dispose();
  }
  playerWindowContexts.clear();
  trustedPlayerLocations.clear();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void openPlayerWindow().catch((error: unknown) => {
      console.error('[player] window startup failed', error);
    });
  }
});
