// 主要作用：注册 Renderer 导入图片、音频和视频的可信 IPC 入口。
// 关键实现：registerAssetIpc 校验 Frame、串行文件操作并刷新窗口状态。
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
