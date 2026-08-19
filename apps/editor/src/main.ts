import { app, BrowserWindow, protocol } from 'electron';
import started from 'electron-squirrel-startup';

import {
  ASSET_PREVIEW_SCHEME,
  AssetPreviewService,
} from './main/assets/AssetPreviewService';
import { BackendClient } from './main/backend/backendClient';
import {
  createEditorWindow,
  resolveEditorEntryUrl,
} from './main/createEditorWindow';
import { registerAssetIpc } from './main/ipc/registerAssetIpc';
import { registerEngineIpc } from './main/ipc/registerEngineIpc';
import { registerExportIpc } from './main/ipc/registerExportIpc';
import { registerProjectFileIpc } from './main/ipc/registerProjectFileIpc';
import { installApplicationMenu } from './main/menu/installApplicationMenu';
import { ProjectFileSession } from './main/project/ProjectFileSession';
import { ProjectStorageSession } from './main/project/ProjectStorageSession';
import type { EditorWindowContexts } from './main/window/EditorWindowContext';
import { FileOperationCoordinator } from './main/window/FileOperationCoordinator';
import { updateWindowDocumentPresentation } from './main/window/updateWindowDocumentPresentation';

const trustedEditorLocations = new Map<number, string>();
const editorWindowContexts: EditorWindowContexts = new Map();

// This declaration must run before app.ready. The scheme remains subject to
// CSP and deliberately does not support fetch/CORS or bypass CSP.
protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PREVIEW_SCHEME,
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

if (started) {
  app.quit();
}

type OpenEditorWindowOptions = {
  createProject?: boolean;
  projectName?: string;
  sourceWindow?: BrowserWindow;
};

async function openEditorWindow(
  options: OpenEditorWindowOptions = {},
): Promise<void> {
  const entryUrl = resolveEditorEntryUrl();
  // 先延迟加载页面，确保 Renderer 发出第一条请求前，它的独立后端和会话
  // 已经注册完成。新建窗口还会先在自己的后端中创建 Project。
  const editorWindow = createEditorWindow(entryUrl, {
    deferLoad: true,
    sourceWindow: options.sourceWindow,
  });
  const webContentsId = editorWindow.webContents.id;
  const backendClient = new BackendClient();
  const assetPreviewService = new AssetPreviewService(
    editorWindow.webContents.session.protocol,
  );
  const projectFileSession = new ProjectFileSession();
  const projectStorageSession = new ProjectStorageSession();
  const fileOperationCoordinator = new FileOperationCoordinator();

  trustedEditorLocations.set(webContentsId, entryUrl);
  editorWindowContexts.set(webContentsId, {
    editorWindow,
    backendClient,
    assetPreviewService,
    projectFileSession,
    projectStorageSession,
    fileOperationCoordinator,
  });

  editorWindow.webContents.once('destroyed', () => {
    trustedEditorLocations.delete(webContentsId);
    editorWindowContexts.delete(webContentsId);
    assetPreviewService.dispose();
    void projectStorageSession.dispose().catch((error: unknown) => {
      console.error('[project-storage] temporary cleanup failed', error);
    });
    backendClient.shutdown();
  });

  try {
    if (options.createProject) {
      const result = await backendClient.request({
        method: 'project.create',
        params: { name: options.projectName },
      });
      const session = projectFileSession.markCreated(result.session);
      updateWindowDocumentPresentation(
        editorWindow,
        result.project.name,
        session,
      );
    }

    await editorWindow.loadURL(entryUrl);
    // ready-to-show 负责避免白屏；这里再显式显示并聚焦，保证新建项目
    // 不会因为事件时序而成为隐藏窗口，也不会被旧窗口继续遮挡。
    if (!editorWindow.isDestroyed()) {
      editorWindow.show();
      editorWindow.focus();
    }
  } catch (error) {
    if (!editorWindow.isDestroyed()) {
      editorWindow.destroy();
    }

    throw error;
  }
}

registerEngineIpc(editorWindowContexts, trustedEditorLocations);
registerAssetIpc(editorWindowContexts, trustedEditorLocations);
registerExportIpc(editorWindowContexts, trustedEditorLocations);
registerProjectFileIpc(
  editorWindowContexts,
  trustedEditorLocations,
  async (projectName, sourceWindow) => {
    await openEditorWindow({
      createProject: true,
      projectName,
      sourceWindow,
    });
  },
);

app.on('ready', () => {
  installApplicationMenu();
  void openEditorWindow();
});

app.on('before-quit', () => {
  for (const context of editorWindowContexts.values()) {
    void context.projectStorageSession.dispose().catch((error: unknown) => {
      console.error('[project-storage] temporary cleanup failed', error);
    });
    context.backendClient.shutdown();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void openEditorWindow();
  }
});
