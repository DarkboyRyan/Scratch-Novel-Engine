import { app, dialog } from 'electron';
import path from 'node:path';

import type {
  ExportGameResult,
  GameExportRequest,
} from '../../shared/exportProtocol';
import type { EditorWindowContext } from '../window/EditorWindowContext';
import { exportRuntimeBundle } from './RuntimeBundleExporter';
import {
  exportStandaloneApplication,
  verifyStandalonePlayerTemplateSignature,
} from './StandaloneApplicationExporter';
import {
  loadStandalonePlayerTemplate,
  resolveStandalonePlayerTemplateRoot,
} from './StandalonePlayerTemplate';

export const STANDALONE_TEMPLATE_UNAVAILABLE_MESSAGE =
  '当前平台的独立 Player 模板不可用，请安装对应模板后重试';
export const STANDALONE_LOCAL_PLATFORM_UNSUPPORTED_MESSAGE =
  '当前 Editor 只支持在 macOS 本地组装独立应用；Windows/Linux 请使用对应平台 CI 构建';
export const STANDALONE_UNSTABLE_TARGET_MESSAGE =
  '当前导出位置会持续修改 macOS 应用元数据，无法保持签名有效；请选择“下载”或其他本地非同步目录';

function isUnstableStandaloneTargetError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code ===
      'UNSTABLE_STANDALONE_APPLICATION_METADATA'
  );
}

function safeBundleBaseName(projectName: string): string {
  const withoutControlCharacters = [...projectName]
    .map((character) => (character.charCodeAt(0) < 32 ? '-' : character))
    .join('');
  const normalized = withoutControlCharacters
    .normalize('NFC')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 100)
    .trim();
  return normalized.length === 0 ? '未命名游戏' : normalized;
}

function normalizeBundlePath(selectedPath: string): string {
  const absolutePath = path.resolve(selectedPath);
  if (absolutePath.toLowerCase().endsWith('.vngame')) {
    return `${absolutePath.slice(0, -'.vngame'.length)}.vngame`;
  }
  return `${absolutePath}.vngame`;
}

function normalizeStandaloneArtifactPath(selectedPath: string): string {
  const absolutePath = path.resolve(selectedPath);
  if (process.platform !== 'darwin') {
    return absolutePath;
  }
  if (absolutePath.toLowerCase().endsWith('.app')) {
    return `${absolutePath.slice(0, -'.app'.length)}.app`;
  }
  return `${absolutePath}.app`;
}

function assertExportableSession(context: EditorWindowContext): {
  projectRootPath: string;
  revision: number;
  manifestSha256: string;
} {
  const session = context.projectFileSession.snapshot();
  const projectRootPath = context.projectFileSession.getProjectRootPath();
  if (!session.hasStorage || projectRootPath === null) {
    throw new Error('导出游戏前请先保存项目');
  }
  if (
    session.isDirty ||
    session.savedRevision === null ||
    session.savedRevision !== session.revision
  ) {
    throw new Error('导出游戏前请先保存最新修改');
  }
  const manifestSha256 = context.projectFileSession.getSavedManifestSha256();
  if (manifestSha256 === null) {
    throw new Error('无法确认当前保存版本，请重新保存项目后再导出');
  }
  return {
    projectRootPath,
    revision: session.revision,
    manifestSha256,
  };
}

export async function runExportGameWorkflow(
  context: EditorWindowContext,
  request: GameExportRequest,
): Promise<ExportGameResult> {
  const frozen = assertExportableSession(context);
  const current = await context.backendClient.request({
    method: 'project.get',
    params: {},
  });
  if (
    current.session.revision !== frozen.revision ||
    current.session.savedRevision !== frozen.revision ||
    current.session.isDirty
  ) {
    throw new Error('编辑器项目版本与已保存版本不一致，请重新保存');
  }

  let templateRootPath: string | null = null;
  if (request.output === 'standalone-application') {
    if (process.platform !== 'darwin') {
      throw new Error(STANDALONE_LOCAL_PLATFORM_UNSUPPORTED_MESSAGE);
    }
    try {
      templateRootPath = resolveStandalonePlayerTemplateRoot(
        process.resourcesPath,
        process.platform,
        process.arch,
        process.env,
        { isPackaged: app.isPackaged, appPath: app.getAppPath() },
      );
      await loadStandalonePlayerTemplate(templateRootPath);
    } catch (error) {
      console.error('[game-export] standalone player template unavailable', error);
      throw new Error(STANDALONE_TEMPLATE_UNAVAILABLE_MESSAGE);
    }
  }

  const standalone = request.output === 'standalone-application';
  const extension = process.platform === 'darwin' ? '.app' : '';
  const selection = await dialog.showSaveDialog(context.editorWindow, {
    title: standalone ? '导出独立游戏应用' : '导出 VN 游戏内容包',
    buttonLabel: '导出',
    defaultPath: path.join(
      path.dirname(frozen.projectRootPath),
      standalone
        ? `${safeBundleBaseName(request.application.name)}${extension}`
        : `${safeBundleBaseName(current.project.name)}.vngame`,
    ),
    filters: standalone && process.platform === 'darwin'
      ? [{ name: 'macOS Application', extensions: ['app'] }]
      : standalone
        ? undefined
        : [{ name: 'VN Game Bundle', extensions: ['vngame'] }],
    properties: ['createDirectory', 'dontAddToRecent'],
  });
  if (selection.canceled || !selection.filePath) {
    return { cancelled: true };
  }

  try {
    const commonOptions = {
      sourceProjectRootPath: frozen.projectRootPath,
      sourceRevision: frozen.revision,
      expectedProject: current.project,
      expectedAssets: current.assets,
      expectedManifestSha256: frozen.manifestSha256,
      assertSourceStillCurrent: () => {
        const session = context.projectFileSession.snapshot();
        if (
          context.projectFileSession.getProjectRootPath() !== frozen.projectRootPath ||
          session.revision !== frozen.revision ||
          session.savedRevision !== frozen.revision ||
          session.isDirty
        ) {
          throw new Error('当前项目在导出期间发生了变化');
        }
      },
    };
    if (request.output === 'standalone-application') {
      if (templateRootPath === null) {
        throw new Error('独立 Player 模板未解析');
      }
      const exported = await exportStandaloneApplication({
        ...commonOptions,
        targetArtifactPath: normalizeStandaloneArtifactPath(selection.filePath),
        templateRootPath,
        application: request.application,
        verifyTemplateArtifact: verifyStandalonePlayerTemplateSignature,
      });
      return {
        cancelled: false,
        output: request.output,
        artifactName: exported.artifactName,
        sourceRevision: exported.sourceRevision,
        assetCount: exported.assetCount,
      };
    }

    const exported = await exportRuntimeBundle({
      ...commonOptions,
      targetBundlePath: normalizeBundlePath(selection.filePath),
    });
    return {
      cancelled: false,
      output: request.output,
      artifactName: exported.bundleName,
      sourceRevision: exported.sourceRevision,
      assetCount: exported.assetCount,
    };
  } catch (error) {
    // Native paths and low-level filesystem details stay in Main logs.
    console.error('[game-export] export failed', error);
    if (standalone && isUnstableStandaloneTargetError(error)) {
      // This diagnosis is deliberately path-free and actionable. Do not expose
      // the wrapped codesign error, which may contain a private absolute path.
      throw new Error(STANDALONE_UNSTABLE_TARGET_MESSAGE);
    }
    throw new Error(
      standalone
        ? '独立应用导出失败，源项目和已有导出内容均未修改'
        : '游戏导出失败，源项目和已有导出内容均未修改',
    );
  }
}
