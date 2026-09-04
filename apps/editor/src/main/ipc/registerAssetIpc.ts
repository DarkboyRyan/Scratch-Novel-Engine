// 主要作用：注册 Renderer 导入、预览和管理媒体资源的可信 IPC 入口。
// 关键实现：校验 Frame、串行资源操作，并同步权威会话与预览 capability。
import { dialog, ipcMain } from 'electron';

import {
  ASSET_IPC_CHANNEL,
  type AssetResponse,
  type ImportAssetResult,
} from '../../shared/assetProtocol';
import type { EngineMutationResult } from '../../shared/engineProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorNativeLabels } from '../i18n/editorNativeLabels';
import {
  isTrustedEditorFrame,
  type TrustedEditorLocations,
} from '../security/editorFrameTrust';
import type { EditorWindowContexts } from '../window/EditorWindowContext';
import { updateWindowDocumentPresentation } from '../window/updateWindowDocumentPresentation';
import { isAssetInvocation } from './validateAssetInvocation';

const SAFE_ASSET_ERROR_CODES = new Set([
  'asset_name_invalid',
  'asset_name_conflict',
  'asset_in_use',
  'asset_not_found',
  'invalid_params',
]);

function rendererSafeAssetError(
  error: unknown,
  fallbackMessage: string,
): Error {
  if (error instanceof Error && error.name.startsWith('VnEngineError:')) {
    const code = error.name.slice('VnEngineError:'.length);
    if (code === 'method_not_found') {
      const contractError = new Error(
        '[asset-management-contract] Restart the editor to enable asset management.',
      );
      contractError.name = 'AssetManagementContractError';
      return contractError;
    }
    if (SAFE_ASSET_ERROR_CODES.has(code)) {
      const safeError = new Error(code);
      safeError.name = `VnEngineError:${code}`;
      return safeError;
    }
  }
  return new Error(fallbackMessage);
}

export function registerAssetIpc(
  contexts: EditorWindowContexts,
  trustedEditorLocations: TrustedEditorLocations,
  getLanguage: () => EditorLanguage = () => 'zh-CN',
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
      if (invocation.action === 'get-media-url') {
        return context.assetPreviewService.getMediaUrl(
          invocation.params.assetId,
        );
      }

      if (
        invocation.action === 'rename' ||
        invocation.action === 'delete-many'
      ) {
        return context.fileOperationCoordinator.runExclusive(async () => {
          const language = getLanguage();
          if (invocation.action === 'rename') {
            let result: EngineMutationResult;
            try {
              result = await context.backendClient.request({
                method: 'asset.rename',
                params: invocation.params,
              });
            } catch (error) {
              console.error('[asset-management] rename failed', error);
              throw rendererSafeAssetError(
                error,
                '资源重命名失败，请稍后重试',
              );
            }

            if (
              !context.assetPreviewService.synchronizeRenamedAsset(
                invocation.params.assetId,
                result,
              )
            ) {
              console.error(
                '[asset-preview] renamed asset metadata could not be synchronized',
              );
            }
            const session = context.projectFileSession.updateEngineSession(
              result.session,
            );
            updateWindowDocumentPresentation(
              context.editorWindow,
              result.project.name,
              session,
              language,
            );
            return {
              ...result,
              session: {
                revision: session.revision,
                savedRevision: session.savedRevision,
                isDirty: session.isDirty,
              },
            };
          }

          let result: EngineMutationResult;
          try {
            result = await context.backendClient.request({
              method: 'asset.deleteMany',
              params: invocation.params,
            });
          } catch (error) {
            console.error('[asset-management] deletion failed', error);
            throw rendererSafeAssetError(
              error,
              '资源删除失败，请稍后重试',
            );
          }

          // Revoke the capability before any public state is returned. This
          // release performs logical deletion only: managed files remain as
          // unreferenced data and no path crosses this IPC boundary.
          if (
            !context.assetPreviewService.revokeDeletedAssets(
              invocation.params.assetIds,
              result,
            )
          ) {
            console.error(
              '[asset-preview] deleted asset capabilities could not be synchronized',
            );
          }
          const session = context.projectFileSession.updateEngineSession(
            result.session,
          );
          updateWindowDocumentPresentation(
            context.editorWindow,
            result.project.name,
            session,
            language,
          );
          return {
            ...result,
            session: {
              revision: session.revision,
              savedRevision: session.savedRevision,
              isDirty: session.isDirty,
            },
          };
        });
      }

      const kind = invocation.action === 'import-video'
        ? 'video'
        : invocation.action === 'import-audio'
          ? 'audio'
          : 'image';
      const language = getLanguage();
      const labels = getEditorNativeLabels(language).asset;
      const noun = labels.nouns[kind];

      return context.fileOperationCoordinator.runExclusive(
        async (): Promise<ImportAssetResult> => {
          const logicalProjectRootPath =
            context.projectFileSession.getProjectRootPath();

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
              title: labels.importTitle(noun),
              buttonLabel: labels.importButton(noun),
              properties: ['openFile'],
              filters: [
                kind === 'video'
                  ? { name: labels.nouns.video, extensions: ['mp4', 'webm'] }
                  : kind === 'audio'
                    ? {
                        name: labels.nouns.audio,
                        extensions: ['mp3', 'wav', 'ogg'],
                      }
                  : {
                      name: labels.nouns.image,
                      extensions: ['png', 'jpg', 'jpeg', 'webp'],
                    },
              ],
            },
          );

          if (selection.canceled || selection.filePaths.length === 0) {
            return { status: 'cancelled' };
          }

          if (
            context.projectFileSession.getProjectRootPath() !==
            logicalProjectRootPath
          ) {
            throw new Error(
              `导入期间项目文件已变更，请重新选择${noun}`,
            );
          }

          const projectAfterDialog = await context.backendClient.request({
            method: 'project.get',
            params: {},
          });
          if (projectAfterDialog.project.id !== projectId) {
            throw new Error(
              `导入期间当前项目已变更，请重新选择${noun}`,
            );
          }

          let storageLocation;
          try {
            storageLocation =
              await context.projectStorageSession.assetImportLocation(
                logicalProjectRootPath,
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
                kind,
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
              `${noun}导入失败，请确认文件有效且项目目录可写`,
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
            language,
          );

          if (
            !context.assetPreviewService.registerImportedAsset(
              storageLocation.previewProjectFilePath,
              selection.filePaths[0],
              publicResult,
            )
          ) {
            // The import itself remains successful. Failing closed here means
            // only that this asset has no media URL until the project is
            // reopened; no filesystem detail crosses into Renderer.
            console.error(
              '[asset-preview] imported asset was not added to the private preview manifest',
            );
          }

          // Absolute paths remain confined to this Main-process function.
          return { status: 'imported', result: publicResult };
        },
      );
    },
  );
}
