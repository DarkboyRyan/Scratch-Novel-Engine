// 主要作用：编排运行包、Web 包和独立应用的原生导出流程。
// 关键实现：runExportGameWorkflow 选择目标、加载模板并调度对应导出器。
import { app, dialog } from 'electron';
import path from 'node:path';

import type {
  ExportGameResult,
  GameExportRequest,
} from '../../shared/exportProtocol';
import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import { getEditorNativeLabels } from '../i18n/editorNativeLabels';
import type { EditorWindowContext } from '../window/EditorWindowContext';
import { AuthorProjectCompileError } from './AuthorProjectCompiler';
import { exportRuntimeBundle } from './RuntimeBundleExporter';
import {
  exportStandaloneApplication,
  verifyStandalonePlayerTemplateSignature,
} from './StandaloneApplicationExporter';
import {
  loadStandalonePlayerTemplate,
  resolveStandalonePlayerTemplateRoot,
} from './StandalonePlayerTemplate';
import { exportWebPlayer } from './WebPlayerExporter';
import {
  loadWebPlayerTemplate,
  resolveWebPlayerTemplateRoot,
} from './WebPlayerTemplate';

export const STANDALONE_TEMPLATE_UNAVAILABLE_MESSAGE =
  '当前平台的独立 Player 模板不可用，请安装对应模板后重试';
export const STANDALONE_LOCAL_PLATFORM_UNSUPPORTED_MESSAGE =
  '当前 Editor 只支持在 macOS 或 Windows x64 本地组装独立应用；其他平台请使用对应平台 CI 构建';
export const WEB_PLAYER_TEMPLATE_UNAVAILABLE_MESSAGE =
  'Web Player 模板不可用，请重新安装 Editor 或生成开发模板后重试';

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

function truncateUtf8(value: string, maximumBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maximumBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function standaloneArchiveSuffix(platform: NodeJS.Platform): string {
  return platform === 'win32' ? '-Windows.zip' : '-macOS.zip';
}

function safeStandaloneArchiveName(
  applicationName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const suffix = standaloneArchiveSuffix(platform);
  const baseName = truncateUtf8(
    safeBundleBaseName(applicationName),
    240 - Buffer.byteLength(suffix, 'utf8'),
  );
  return `${baseName.length === 0 ? '未命名游戏' : baseName}${suffix}`;
}

function safeWebArchiveName(projectName: string): string {
  const suffix = '-Web.zip';
  const baseName = truncateUtf8(
    safeBundleBaseName(projectName),
    240 - Buffer.byteLength(suffix, 'utf8'),
  );
  return `${baseName.length === 0 ? '未命名游戏' : baseName}${suffix}`;
}

function normalizeBundlePath(selectedPath: string): string {
  const absolutePath = path.resolve(selectedPath);
  if (absolutePath.toLowerCase().endsWith('.vngame')) {
    return `${absolutePath.slice(0, -'.vngame'.length)}.vngame`;
  }
  return `${absolutePath}.vngame`;
}

function normalizeStandaloneArtifactPath(
  selectedPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  let basePath = path.resolve(selectedPath);
  if (/\.zip$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'.zip'.length);
  }
  if (/\.app$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'.app'.length);
  }
  if (/-windows$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'-Windows'.length);
  }
  if (/-macos$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'-macOS'.length);
  }
  return `${basePath}${standaloneArchiveSuffix(platform)}`;
}

function normalizeWebArtifactPath(selectedPath: string): string {
  let basePath = path.resolve(selectedPath);
  if (/\.zip$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'.zip'.length);
  }
  if (/-web$/iu.test(basePath)) {
    basePath = basePath.slice(0, -'-Web'.length);
  }
  return `${basePath}-Web.zip`;
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
  language: EditorLanguage = 'zh-CN',
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
    if (
      process.platform !== 'darwin' &&
      !(process.platform === 'win32' && process.arch === 'x64')
    ) {
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
  } else if (request.output === 'web-player') {
    try {
      templateRootPath = resolveWebPlayerTemplateRoot(
        process.resourcesPath,
        process.env,
        { isPackaged: app.isPackaged, appPath: app.getAppPath() },
      );
      await loadWebPlayerTemplate(templateRootPath);
    } catch (error) {
      console.error('[game-export] web player template unavailable', error);
      throw new Error(WEB_PLAYER_TEMPLATE_UNAVAILABLE_MESSAGE);
    }
  }

  const standalone = request.output === 'standalone-application';
  const webPlayer = request.output === 'web-player';
  const labels = getEditorNativeLabels(language).export;
  const selection = await dialog.showSaveDialog(context.editorWindow, {
    title: standalone
      ? labels.standaloneTitle
      : webPlayer
        ? labels.webTitle
        : labels.bundleTitle,
    buttonLabel: labels.button,
    defaultPath: path.join(
      path.dirname(frozen.projectRootPath),
      standalone
        ? safeStandaloneArchiveName(request.application.name)
        : webPlayer
          ? safeWebArchiveName(current.project.name)
        : `${safeBundleBaseName(current.project.name)}.vngame`,
    ),
    filters: webPlayer
      ? [{ name: labels.webFilter, extensions: ['zip'] }]
      : standalone
        ? [{
            name: process.platform === 'win32'
              ? labels.windowsFilter
              : labels.macFilter,
            extensions: ['zip'],
          }]
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

    if (request.output === 'web-player') {
      if (templateRootPath === null) {
        throw new Error('Web Player 模板未解析');
      }
      const exported = await exportWebPlayer({
        ...commonOptions,
        targetArtifactPath: normalizeWebArtifactPath(selection.filePath),
        templateRootPath,
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
    if (error instanceof AuthorProjectCompileError) {
      const publicError = new Error(
        getEditorNativeLabels(language).export.characterImageRequired,
      );
      // The stable name lets future Renderer versions map the failure without
      // parsing localized prose; current clients still receive a useful text.
      publicError.name = `GameExportError:${error.code}`;
      throw publicError;
    }
    throw new Error(
      standalone
        ? '独立应用导出失败，源项目和已有导出内容均未修改'
        : webPlayer
          ? 'Web 游戏导出失败，源项目和已有导出内容均未修改'
          : '游戏导出失败，源项目和已有导出内容均未修改',
    );
  }
}
