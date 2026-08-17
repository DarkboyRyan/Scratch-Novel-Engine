import { dialog, type BrowserWindow } from 'electron';
import path from 'node:path';

import {
  PROJECT_FILE_NAME,
  type ProjectFileCompletedResult,
  type ProjectFileInvocation,
  type ProjectFileOperationResult,
  type ProjectFileResponse,
} from '../../shared/projectFileProtocol';
import type { EditorWindowContext } from '../window/EditorWindowContext';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';
import {
  createProjectRootInParent,
  projectManifestPath,
  removeProjectRootIfEmpty,
  resolveProjectManifestPath,
} from './ProjectPathPolicy';

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
    properties: ['openDirectory', 'noResolveAliases'],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return cancelledResult(context);
  }

  const selectedRootPath = path.resolve(selection.filePaths[0]);
  let projectRootPath: string;
  let filePath: string;
  try {
    ({ projectRootPath, projectFilePath: filePath } =
      await resolveProjectManifestPath(selectedRootPath));
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
    console.error(
      '[asset-preview] project manifest preparation failed',
      error,
    );
    throw new Error('项目资源清单无法安全读取');
  }

  // Main has already read a stable manifest snapshot. C++ parses these exact
  // bytes so Project and private Asset metadata cannot come from two reads.
  const result = await context.backendClient.request({
    method: 'project.open',
    params: { contents: preparedPreview.manifestContents },
  });
  if (
    !(await context.assetPreviewService.activateProjectFile(
      filePath,
      result,
      preparedPreview,
      true,
    ))
  ) {
    // C++ has already committed the newly opened project at this point.
    // Keep that state coherent and fail only the optional preview capability.
    console.error(
      '[asset-preview] opened project manifest did not match backend state',
    );
  }
  const session = context.projectFileSession.markOpened(
    projectRootPath,
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
  projectName: string,
): Promise<string | null> {
  const currentProjectRootPath =
    context.projectFileSession.getProjectRootPath();
  if (currentProjectRootPath) {
    return currentProjectRootPath;
  }

  // 用户选择父目录，Main 再用可编辑的项目名创建同名项目文件夹。
  // 这样原生对话框不会退化为“选择一个 JSON 文件”。
  const selection = await dialog.showOpenDialog(context.editorWindow, {
    title: '选择项目保存位置',
    buttonLabel: '创建项目文件夹',
    message: `将在所选位置创建“${projectName}”项目文件夹，内部清单固定为 ${PROJECT_FILE_NAME}`,
    properties: [
      'openDirectory',
      'createDirectory',
      'noResolveAliases',
    ],
  });

  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const selectedParentPath = path.resolve(selection.filePaths[0]);
  try {
    return await createProjectRootInParent(
      selectedParentPath,
      projectName,
    );
  } catch (error) {
    console.error('[project-storage] selected save path failed', error);
    throw new Error('所选位置无法安全保存项目');
  }
}

async function saveProject(
  context: EditorWindowContext,
): Promise<ProjectFileOperationResult> {
  const isFirstSave =
    context.projectFileSession.getProjectRootPath() === null;
  let projectName = '';
  if (isFirstSave) {
    const currentProject = await context.backendClient.request({
      method: 'project.get',
      params: {},
    });
    projectName = currentProject.project.name;
  }
  const projectRootPath = await chooseProjectSavePath(
    context,
    projectName,
  );
  if (!projectRootPath) {
    return cancelledResult(context);
  }

  const cleanFailedFirstSave = async (): Promise<void> => {
    if (!isFirstSave) {
      return;
    }
    await removeProjectRootIfEmpty(projectRootPath).catch(
      (error: unknown) => {
        // Never recursively delete a target directory. A non-empty directory
        // is preserved for inspection and a later retry.
        console.error(
          '[project-storage] failed first-save directory cleanup skipped',
          error,
        );
      },
    );
  };

  let backendFilePath: string;
  try {
    backendFilePath =
      await context.projectStorageSession.backendSavePath(
        projectRootPath,
      );
  } catch (error) {
    console.error(
      '[project-storage] working path preparation failed',
      error,
    );
    await cleanFailedFirstSave();
    throw new Error('无法准备安全的项目保存位置');
  }

  // C++ 只写固定名 project.vn.json。自定义文件名由 Main 在所有临时
  // Assets 安全到位后作为最后的提交标记发布。
  let result;
  try {
    result = await context.backendClient.request({
      method: 'project.save',
      params: { filePath: backendFilePath },
    });
  } catch (error) {
    await cleanFailedFirstSave();
    throw error;
  }
  try {
    await context.projectStorageSession.publishSavedProject(
      backendFilePath,
      projectRootPath,
      (manifestContents, targetRootPath) =>
        context.assetPreviewService.validateProjectSnapshotAtRoot(
          manifestContents,
          targetRootPath,
        ),
    );
  } catch (error) {
    console.error('[project-storage] project publication failed', error);
    // The C++ working save may have succeeded, but the logical file session is
    // intentionally left dirty until the user-visible manifest commits.
    await cleanFailedFirstSave();
    throw new Error('项目未能安全保存，原项目和临时资源均已保留');
  }

  if (
    !(await context.assetPreviewService.activateProjectFile(
      projectManifestPath(projectRootPath),
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
    projectRootPath,
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

export async function runProjectFileWorkflow(
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
