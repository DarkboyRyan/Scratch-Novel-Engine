import { dialog, ipcMain, type BrowserWindow } from 'electron';
import path from 'node:path';

import {
  PROJECT_FILE_IPC_CHANNEL,
  PROJECT_FILE_NAME,
  PROJECT_FILE_SUFFIX,
  type ProjectFileCompletedResult,
  type ProjectFileInvocation,
  type ProjectFileOperationResult,
  type ProjectFileResponse,
} from '../../shared/projectFileProtocol';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import {
  canonicalizeProjectFilePath,
  validateProjectFilePath,
} from '../project/ProjectStorageSession';
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

  const selectedFilePath = path.resolve(selection.filePaths[0]);
  validateProjectFilePath(selectedFilePath);
  let filePath: string;
  try {
    filePath = await canonicalizeProjectFilePath(selectedFilePath);
  } catch (error) {
    console.error('[project-storage] selected project path failed', error);
    throw new Error('所选项目文件无法安全读取');
  }

  // Read the private Asset manifest before C++ opens the project, but do not
  // activate it yet. This keeps the old project's preview capability alive
  // when the selected file is invalid.
  let preparedPreview;
  try {
    preparedPreview =
      await context.assetPreviewService.prepareProjectFile(filePath);
  } catch (error) {
    console.error('[asset-preview] project manifest preparation failed', error);
    throw new Error('项目资源清单无法安全读取');
  }

  // project.open 在 C++ 中先解析和校验临时对象；失败时不会替换当前项目。
  const result = await context.backendClient.request({
    method: 'project.open',
    params: { filePath },
  });
  if (!(await context.assetPreviewService.activateProjectFile(
    filePath,
    result,
    preparedPreview,
    true,
  ))) {
    // C++ has already committed the newly opened project at this point.
    // Keep that state coherent and fail only the optional preview capability.
    console.error(
      '[asset-preview] opened project manifest did not match backend state',
    );
  }
  const session = context.projectFileSession.markOpened(
    filePath,
    result.session,
  );
  updateWindowDocumentPresentation(
    context.editorWindow,
    result.project.name,
    session,
  );
  await context.projectStorageSession
    .discardTemporaryWorkspace()
    .catch((error: unknown) => {
      console.error('[project-storage] old workspace cleanup failed', error);
    });

  return completedResult(result, context);
}

async function chooseProjectSavePath(
  context: EditorWindowContext,
): Promise<string | null> {
  if (context.projectFileSession.snapshot().filePath) {
    return context.projectFileSession.snapshot().filePath;
  }

  // 用户可以修改基名，但固定的 .vn.json 后缀让打开对话框和文件关联
  // 保持明确。Main 不会静默改写路径，以免绕过原生覆盖确认。
  const selection = await dialog.showSaveDialog(context.editorWindow, {
    title: '保存 VN Engine 项目',
    buttonLabel: '保存项目',
    message: `可以修改项目前面的名称，请保留 ${PROJECT_FILE_SUFFIX} 后缀`,
    nameFieldLabel: '项目文件名',
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

  const selectedFilePath = path.resolve(selection.filePath);
  if (
    !path.basename(selectedFilePath).toLowerCase().endsWith(
      PROJECT_FILE_SUFFIX,
    )
  ) {
    throw new Error(
      `项目名称可以自定义，但必须保留 ${PROJECT_FILE_SUFFIX} 后缀`,
    );
  }
  try {
    return await canonicalizeProjectFilePath(selectedFilePath);
  } catch (error) {
    console.error('[project-storage] selected save path failed', error);
    throw new Error('所选位置无法安全保存项目');
  }
}

async function saveProject(
  context: EditorWindowContext,
): Promise<ProjectFileOperationResult> {
  const filePath = await chooseProjectSavePath(context);
  if (!filePath) {
    return cancelledResult(context);
  }

  let backendFilePath: string;
  try {
    backendFilePath =
      await context.projectStorageSession.backendSavePath(filePath);
  } catch (error) {
    console.error('[project-storage] working path preparation failed', error);
    throw new Error('无法准备安全的项目保存位置');
  }

  // C++ 只写固定名 project.vn.json。自定义文件名由 Main 在所有临时
  // Assets 安全到位后作为最后的提交标记发布。
  const result = await context.backendClient.request({
    method: 'project.save',
    params: { filePath: backendFilePath },
  });
  try {
    await context.projectStorageSession.publishSavedProject(
      backendFilePath,
      filePath,
    );
  } catch (error) {
    console.error('[project-storage] project publication failed', error);
    // The C++ working save may have succeeded, but the logical file session is
    // intentionally left dirty until the user-visible manifest commits.
    throw new Error('项目未能安全保存，原项目和临时资源均已保留');
  }

  if (
    !(await context.assetPreviewService.activateProjectFile(
      filePath,
      result,
    ))
  ) {
    // Saving the project succeeded. Preview activation fails closed without
    // pretending the durable save failed or exposing a native path.
    console.error(
      '[asset-preview] saved project manifest could not be activated',
    );
  }
  const session = context.projectFileSession.markSaved(
    filePath,
    result.session,
  );
  const publicResult = {
    ...result,
    session: {
      revision: session.revision,
      savedRevision: session.savedRevision,
      isDirty: session.isDirty,
    },
  };
  updateWindowDocumentPresentation(
    context.editorWindow,
    result.project.name,
    session,
  );
  await context.projectStorageSession
    .completeSuccessfulSave(backendFilePath)
    .catch((error: unknown) => {
      // Target data is already committed. A stale private temp directory is a
      // cleanup issue, not a failed user save.
      console.error('[project-storage] workspace cleanup failed', error);
    });

  return completedResult(publicResult, context);
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
      return context.fileOperationCoordinator.runExclusive(() =>
        openProject(context),
      );
    case 'save':
      return context.fileOperationCoordinator.runExclusive(() =>
        saveProject(context),
      );
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
