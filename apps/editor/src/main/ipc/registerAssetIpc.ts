import { dialog, ipcMain } from 'electron';

import {
  ASSET_IPC_CHANNEL,
  type AssetResponse,
  type ImportImageResult,
} from '../../shared/assetProtocol';
import type { EngineMutationResult } from '../../shared/engineProtocol';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';
import { isAssetInvocation } from './validateAssetInvocation';

export function registerAssetIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
): void {
  ipcMain.handle(
    ASSET_IPC_CHANNEL,
    async (event, invocation: unknown): Promise<AssetResponse> => {
      if (!isTrustedEditorFrame(event, trustedEditorLocations)) {
        throw new Error('拒绝来自非编辑器主页面的资源请求');
      }

      if (!isAssetInvocation(invocation)) {
        throw new Error('Renderer 发来了无效的资源导入请求');
      }

      const context = contexts.get(event.sender.id);
      if (!context) {
        throw new Error('找不到当前编辑器窗口对应的项目会话');
      }

      if (invocation.action === 'get-preview-url') {
        return context.assetPreviewService.getPreviewUrl(
          invocation.params.assetId,
        );
      }

      return context.fileOperationCoordinator.runExclusive(
        async (): Promise<ImportImageResult> => {
          const logicalProjectFilePath =
            context.projectFileSession.snapshot().filePath;

          // Capture both identities before yielding to the native dialog. The
          // shared coordinator prevents file operations; the explicit checks
          // also defend against future code changing the context unexpectedly.
          const projectBeforeDialog = await context.backendClient.request({
            method: 'project.get',
            params: {},
          });
          const projectId = projectBeforeDialog.project.id;

          const selection = await dialog.showOpenDialog(
            context.editorWindow,
            {
              title: '导入图片资源',
              buttonLabel: '导入图片',
              properties: ['openFile'],
              filters: [
                {
                  name: '图片',
                  extensions: ['png', 'jpg', 'jpeg', 'webp'],
                },
              ],
            },
          );

          if (selection.canceled || selection.filePaths.length === 0) {
            return { status: 'cancelled' };
          }

          if (
            context.projectFileSession.snapshot().filePath !==
            logicalProjectFilePath
          ) {
            throw new Error(
              '导入期间项目文件已变更，请重新选择图片',
            );
          }

          const projectAfterDialog = await context.backendClient.request({
            method: 'project.get',
            params: {},
          });
          if (projectAfterDialog.project.id !== projectId) {
            throw new Error(
              '导入期间当前项目已变更，请重新选择图片',
            );
          }

          let storageLocation;
          try {
            storageLocation =
              await context.projectStorageSession.assetImportLocation(
                logicalProjectFilePath,
              );
            if (
              storageLocation.isTemporary &&
              !(await context.assetPreviewService.activateTemporaryProject(
                storageLocation.previewProjectFilePath,
                projectAfterDialog,
              ))
            ) {
              throw new Error(
                'temporary preview state does not match the project',
              );
            }
          } catch (error) {
            console.error(
              '[asset-import] temporary project storage preparation failed',
              error,
            );
            throw new Error('无法准备项目资源存储位置');
          }

          let result: EngineMutationResult;
          try {
            result = await context.backendClient.request({
              method: 'asset.import',
              params: {
                sourceFilePath: selection.filePaths[0],
                projectFilePath:
                  storageLocation.backendProjectFilePath,
              },
            });
          } catch (error) {
            // Backend diagnostics stay in Main because they may contain native
            // filesystem details. Renderer receives only a stable user error.
            console.error('[asset-import] backend import failed', error);
            throw new Error(
              '图片导入失败，请确认文件有效且项目目录可写',
            );
          }
          const session = context.projectFileSession.updateEngineSession(
            result.session,
          );
          const publicResult: EngineMutationResult = {
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

          if (
            !context.assetPreviewService.registerImportedImage(
              storageLocation.previewProjectFilePath,
              selection.filePaths[0],
              publicResult,
            )
          ) {
            // The import itself remains successful. Failing closed here means
            // only that this image has no preview URL until the project is
            // reopened; no filesystem detail crosses into Renderer.
            console.error(
              '[asset-preview] imported image was not added to the private preview manifest',
            );
          }

          // Absolute paths remain confined to this Main-process function.
          return { status: 'imported', result: publicResult };
        },
      );
    },
  );
}
