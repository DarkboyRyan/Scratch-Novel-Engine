import { dialog, ipcMain, type BrowserWindow } from 'electron';
import path from 'node:path';

import {
  PROJECT_FILE_IPC_CHANNEL,
  PROJECT_FILE_NAME,
  type ProjectFileCompletedResult,
  type ProjectFileInvocation,
  type ProjectFileOperationResult,
  type ProjectFileResponse,
} from '../../shared/projectFileProtocol';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type {
  EditorWindowContext,
  EditorWindowContexts,
} from '../window/EditorWindowContext';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';
import { isProjectFileInvocation } from './validateProjectFileInvocation';

export type OpenNewProjectWindow = (
  name?: string,
  sourceWindow?: BrowserWindow,
) => Promise<void>;

function completedResult(
  result: ProjectFileCompletedResult['result'],
  context: EditorWindowContext,
): ProjectFileCompletedResult {
  return {
    cancelled: false,
    result,
    session: context.projectFileSession.snapshot(),
  };
}

function cancelledResult(
  context: EditorWindowContext,
): ProjectFileOperationResult {
  return {
    cancelled: true,
    session: context.projectFileSession.snapshot(),
  };
}

async function openProject(
  context: EditorWindowContext,
): Promise<ProjectFileOperationResult> {
  const selection = await dialog.showOpenDialog(context.editorWindow, {
    title: '打开 VN Engine 项目',
    buttonLabel: '打开项目',
    properties: ['openFile'],
    filters: [
      {
        name: 'VN Engine 项目',
        extensions: ['json'],
      },
    ],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return cancelledResult(context);
  }

  const filePath = selection.filePaths[0];
  if (path.basename(filePath) !== PROJECT_FILE_NAME) {
    throw new Error(`请选择名为 ${PROJECT_FILE_NAME} 的项目文件`);
  }

  // project.open 在 C++ 中先解析和校验临时对象；失败时不会替换当前项目。
  const result = await context.backendClient.request({
    method: 'project.open',
    params: { filePath },
  });
  const session = context.projectFileSession.markOpened(
    filePath,
    result.session,
  );
  updateWindowDocumentPresentation(
    context.editorWindow,
    result.project.name,
    session,
  );

  return completedResult(result, context);
}

async function chooseProjectSavePath(
  context: EditorWindowContext,
): Promise<string | null> {
  if (context.projectFileSession.snapshot().filePath) {
    return context.projectFileSession.snapshot().filePath;
  }

  // 原生保存框负责覆盖确认；固定文件名让父目录自然成为未来 assets 目录
  // 的项目根目录。
  const selection = await dialog.showSaveDialog(context.editorWindow, {
    title: '保存 VN Engine 项目',
    buttonLabel: '保存项目',
    defaultPath: PROJECT_FILE_NAME,
    filters: [
      {
        name: 'VN Engine 项目',
        extensions: ['json'],
      },
    ],
  });

  if (selection.canceled || !selection.filePath) {
    return null;
  }

  if (path.basename(selection.filePath) !== PROJECT_FILE_NAME) {
    throw new Error(`请使用固定文件名 ${PROJECT_FILE_NAME}`);
  }

  return selection.filePath;
}

async function saveProject(
  context: EditorWindowContext,
): Promise<ProjectFileOperationResult> {
  const filePath = await chooseProjectSavePath(context);
  if (!filePath) {
    return cancelledResult(context);
  }

  // C++ 在目标目录写临时文件并进行原子替换。只有完全成功后，Main 才更新
  // filePath 和 savedRevision，保存失败不会让 UI 误以为项目已经保存。
  const result = await context.backendClient.request({
    method: 'project.save',
    params: { filePath },
  });
  const session = context.projectFileSession.markSaved(
    filePath,
    result.session,
  );
  updateWindowDocumentPresentation(
    context.editorWindow,
    result.project.name,
    session,
  );

  return completedResult(result, context);
}

async function handleProjectFileInvocation(
  context: EditorWindowContext,
  invocation: ProjectFileInvocation,
  openNewProjectWindow: OpenNewProjectWindow,
): Promise<ProjectFileResponse> {
  switch (invocation.action) {
    case 'get-session':
      return context.projectFileSession.snapshot();
    case 'create':
      await openNewProjectWindow(
        invocation.params.name,
        context.editorWindow,
      );
      return { opened: true };
    case 'open':
      return openProject(context);
    case 'save':
      return saveProject(context);
  }
}

export function registerProjectFileIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
  openNewProjectWindow: OpenNewProjectWindow,
): void {
  ipcMain.handle(
    PROJECT_FILE_IPC_CHANNEL,
    async (event, invocation: unknown) => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('拒绝来自非编辑器主页面的项目文件请求');
      }

      if (!isProjectFileInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的项目文件请求');
      }

      const context = contexts.get(event.sender.id);
      if (!context) {
        throw new Error('找不到当前编辑器窗口对应的项目会话');
      }

      return handleProjectFileInvocation(
        context,
        invocation,
        openNewProjectWindow,
      );
    },
  );
}
