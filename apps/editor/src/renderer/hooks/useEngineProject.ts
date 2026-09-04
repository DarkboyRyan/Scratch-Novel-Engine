/**
 * 文件主要作用：管理引擎项目加载、刷新、修订、错误和保存状态。
 * 包含实现：项目默认值、旧 Preload 契约保护、命令队列、资源管理、导入导出和 `useEngineProject`。
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ImportAssetResult } from '../../shared/assetProtocol';
import type {
  EngineMutationResult,
  ReplaceSceneContentParams,
  VnEngineApi,
} from '../../shared/engineProtocol';
import type {
  ExportGameCompletedResult,
  GameExportRequest,
} from '../../shared/exportProtocol';
import type {
  AssetDocument,
  CgGalleryStyleDocument,
  ProjectDocument,
  StartScreenStyleDocument,
} from '../../shared/projectTypes';
import {
  DEFAULT_CG_GALLERY_STYLE,
  DEFAULT_IMAGE_SCALE_PERCENT,
  DEFAULT_START_SCREEN_EYEBROW,
  DEFAULT_START_SCREEN_STYLE,
  isCgGalleryStyleDocument,
  isImageScalePercent,
  isStartScreenStyleDocument,
} from '../../shared/projectTypes';
import type { ProjectFileSessionSnapshot } from '../../shared/projectFileProtocol';
import { createAuthoringActions } from '../application/createAuthoringActions';
import {
  getEditorPlatformGateway,
  supportsAssetManagement,
  type EditorPlatformGateway,
} from '../application/editorPlatformGateway';
import {
  type EditorLabels,
  useEditorLabels,
} from '../i18n/editorLocalization';

// Transitional re-export for callers outside feature code. Renderer features
// import the port definitions directly from application/authoringPorts.
export type * from '../application/authoringPorts';

export type OpenProjectStatus =
  | 'opened'
  | 'cancelled'
  | 'failed';

export type ImportAssetStatus = ImportAssetResult['status'] | 'failed';
export type ImportImageStatus = ImportAssetStatus;
export type ExportGameStatus = 'exported' | 'cancelled' | 'failed';

function requestInitialProject(
  platform: EditorPlatformGateway,
): Promise<EngineMutationResult> {
  // 每个 BrowserWindow 都拥有独立后端；不可使用模块级 Promise，否则开发
  // StrictMode 或同一 Renderer 进程中的另一窗口可能读到错误项目。
  return platform.engine.ensureProject();
}

function withRendererProjectDefaults(
  project: ProjectDocument,
): ProjectDocument {
  // Vite can hot-reload the Renderer while Electron Main, Preload and the C++
  // backend keep running. Project snapshots retained by React can therefore
  // predate CG gallery or title-eyebrow support. Supply those two legacy
  // in-memory defaults so the new Renderer can render safely. Fresh backend
  // responses are still validated strictly by Main before this boundary.
  const legacyStartScreen = project.startScreen as
    Omit<ProjectDocument['startScreen'], 'eyebrow' | 'style'> & {
      eyebrow?: unknown;
      style?: unknown;
    };
  const normalizedEyebrow = typeof legacyStartScreen.eyebrow === 'string'
    ? legacyStartScreen.eyebrow
    : DEFAULT_START_SCREEN_EYEBROW;
  const hasValidEyebrow = normalizedEyebrow === legacyStartScreen.eyebrow;
  const normalizedStartScreenStyle = isStartScreenStyleDocument(
    legacyStartScreen.style,
  )
    ? legacyStartScreen.style
    : { ...DEFAULT_START_SCREEN_STYLE };
  const hasValidStartScreenStyle =
    normalizedStartScreenStyle === legacyStartScreen.style;
  const gallery = (
    project as ProjectDocument & {
      cgGallery?: Omit<ProjectDocument['cgGallery'], 'style'> & {
        style?: unknown;
      };
    }
  ).cgGallery;
  const assetIds = new Set<string>();
  const hasValidPages =
    gallery &&
    Array.isArray(gallery.pages) &&
    gallery.pages.length > 0 &&
    gallery.pages.every(
      (page) =>
        page !== null &&
        typeof page === 'object' &&
        Array.isArray(page.imageAssetIds) &&
        page.imageAssetIds.length === 9 &&
        page.imageAssetIds.every((assetId) => {
          if (assetId === null) {
            return true;
          }
          if (
            typeof assetId !== 'string' ||
            assetId.length === 0 ||
            assetIds.has(assetId)
          ) {
            return false;
          }
          assetIds.add(assetId);
          return true;
        }),
    );
  const normalizedCgGalleryStyle = isCgGalleryStyleDocument(gallery?.style)
    ? gallery.style
    : { ...DEFAULT_CG_GALLERY_STYLE };
  const hasValidCgGalleryStyle = normalizedCgGalleryStyle === gallery?.style;
  let normalizedLegacyImageScale = false;
  const scenes = project.scenes.map((scene) => {
    const legacyScene = scene as typeof scene & {
      backgroundScalePercent?: unknown;
    };
    const backgroundScalePercent = scene.backgroundAssetId === null
      ? DEFAULT_IMAGE_SCALE_PERCENT
      : isImageScalePercent(legacyScene.backgroundScalePercent)
        ? legacyScene.backgroundScalePercent
        : DEFAULT_IMAGE_SCALE_PERCENT;
    if (legacyScene.backgroundScalePercent !== backgroundScalePercent) {
      normalizedLegacyImageScale = true;
    }

    return {
      ...scene,
      backgroundScalePercent,
      nodes: scene.nodes.map((node) => {
      if (node.type === 'background') {
        const legacyNode = node as typeof node & { scalePercent?: unknown };
        const scalePercent = node.assetId === null
          ? DEFAULT_IMAGE_SCALE_PERCENT
          : isImageScalePercent(legacyNode.scalePercent)
            ? legacyNode.scalePercent
            : DEFAULT_IMAGE_SCALE_PERCENT;
        if (legacyNode.scalePercent !== scalePercent) {
          normalizedLegacyImageScale = true;
          return {
            ...node,
            scalePercent,
          };
        }
      }
      if (node.type === 'character') {
        const legacyNode = node as typeof node & {
          mode?: unknown;
          effect?: unknown;
          scalePercent?: unknown;
        };
        const mode = legacyNode.mode === 'show' || legacyNode.mode === 'clear'
          ? legacyNode.mode
          : node.assetId === null
            ? 'clear'
            : 'show';
        const scalePercent = mode === 'clear'
          ? DEFAULT_IMAGE_SCALE_PERCENT
          : isImageScalePercent(legacyNode.scalePercent)
            ? legacyNode.scalePercent
            : DEFAULT_IMAGE_SCALE_PERCENT;
        const needsDefaults =
          legacyNode.mode !== mode ||
          !Object.hasOwn(legacyNode, 'effect') ||
          legacyNode.scalePercent !== scalePercent;
        if (needsDefaults) {
          normalizedLegacyImageScale = true;
          return mode === 'clear'
            ? {
                ...node,
                mode,
                assetId: null,
                position: null,
                effect: null,
                scalePercent,
              }
            : node.assetId === null
              ? {
                  ...node,
                  mode,
                  assetId: null,
                  effect: null,
                  scalePercent,
                }
              : {
                ...node,
                mode,
                effect: Object.hasOwn(legacyNode, 'effect')
                  ? node.effect
                  : null,
                  scalePercent,
                };
        }
      }
      return node;
      }),
    };
  });
  if (
    hasValidPages &&
    hasValidEyebrow &&
    hasValidStartScreenStyle &&
    hasValidCgGalleryStyle &&
    !normalizedLegacyImageScale
  ) {
    return project;
  }

  return {
    ...project,
    startScreen: {
      ...project.startScreen,
      eyebrow: normalizedEyebrow,
      style: normalizedStartScreenStyle,
    },
    cgGallery: {
      pages: hasValidPages
        ? gallery.pages
        : [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      style: normalizedCgGalleryStyle,
    },
    scenes,
  };
}

function isStartScreenModuleUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('[start-screen-module]') ||
    message.includes('updatestartscreen is not a function') ||
    message.includes('unknown method: startscreen.update')
  );
}

function shouldMarkStartScreenModuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    isStartScreenModuleUnavailableError(error) ||
    message.includes('no handler registered') ||
    message.includes('renderer 发来了无效的引擎请求') ||
    message.includes('invalid engine request')
  );
}

function startScreenModuleError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[start-screen-module] ${message}`, { cause: error });
}

function imageScaleContractError(): Error {
  return new Error('[image-scale-contract] stale preload');
}

function surfaceStyleContractError(): Error {
  return new Error('[surface-style-contract] stale preload');
}

function isStoryCodeContractUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('[story-code-contract]') ||
    message.includes('replacescenecontent is not a function') ||
    message.includes('unknown method: scene.content.replace') ||
    message.includes('no handler registered') ||
    message.includes('invalid engine invocation') ||
    message.includes('invalid engine request') ||
    message.includes('无效的引擎请求')
  );
}

function isBackendProtocolContractError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('[backend-protocol-contract]') ||
    message.includes('c++ 后端响应格式不正确') ||
    message.includes('c++ 后端响应缺少有效的') ||
    message.includes('c++ backend response format') ||
    message.includes('c++ backend response is missing')
  );
}

function storyCodeContractError(cause?: unknown): Error {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new Error(`[story-code-contract] stale preload or Main${detail}`, {
    cause,
  });
}

function backendProtocolContractError(cause?: unknown): Error {
  const detail = cause instanceof Error ? `: ${cause.message}` : '';
  return new Error(`[backend-protocol-contract] stale backend${detail}`, {
    cause,
  });
}

function hasImageScaleContract(engine: VnEngineApi): boolean {
  return engine.imageScaleContractVersion === 1;
}

function hasSurfaceStyleContract(engine: VnEngineApi): boolean {
  return engine.surfaceStyleContractVersion === 1;
}

function hasStoryCodeContract(engine: VnEngineApi): boolean {
  return engine.storyCodeContractVersion === 1;
}

function assetManagementContractError(): Error {
  return new Error('[asset-management-contract] stale preload or Main');
}

function engineErrorHasCode(error: Error, code: string): boolean {
  return error.name === `VnEngineError:${code}` ||
    error.message.includes(code);
}

function readableError(error: unknown, labels: EditorLabels): string {
  if (
    error instanceof Error &&
    error.message.includes('[asset-management-contract]')
  ) {
    return labels.resource.managementUnavailable;
  }

  if (error instanceof Error && engineErrorHasCode(error, 'asset_name_invalid')) {
    return labels.resource.assetNameInvalid;
  }

  if (error instanceof Error && engineErrorHasCode(error, 'asset_name_conflict')) {
    return labels.resource.assetNameConflict;
  }

  if (error instanceof Error && engineErrorHasCode(error, 'asset_in_use')) {
    return labels.resource.assetInUse;
  }

  if (error instanceof Error && engineErrorHasCode(error, 'asset_not_found')) {
    return labels.resource.assetNotFound;
  }

  if (
    error instanceof Error &&
    error.message.includes('[image-scale-contract]')
  ) {
    return labels.locale === 'zh-CN'
      ? '图片缩放功能已更新，请完全退出并重新启动 Editor 后再试。'
      : 'Image scaling was updated. Fully quit and restart Editor, then try again.';
  }

  if (
    error instanceof Error &&
    error.message.includes('[surface-style-contract]')
  ) {
    return labels.locale === 'zh-CN'
      ? '页面样式功能已更新，请完全退出并重新启动 Editor 后再试。'
      : 'Page styling was updated. Fully quit and restart Editor, then try again.';
  }

  if (
    error instanceof Error &&
    error.message.includes('[story-code-contract]')
  ) {
    return labels.locale === 'zh-CN'
      ? '剧情代码编辑功能已更新，请完全退出并重新启动 Editor 后再试。'
      : 'Story Code editing was updated. Fully quit and restart Editor, then try again.';
  }

  if (
    error instanceof Error &&
    error.message.includes('[backend-protocol-contract]')
  ) {
    return labels.locale === 'zh-CN'
      ? 'Editor 与 C++ 后端版本不一致。请完全退出并重新启动 Editor 后再试；若仍出现，请重新构建后端。'
      : 'The Editor and C++ backend are out of sync. Fully quit and restart Editor, then try again; if it continues, rebuild the backend.';
  }

  if (isStartScreenModuleUnavailableError(error)) {
    return labels.messages.startScreenModuleUnavailable;
  }

  if (
    error instanceof Error &&
    error.message.includes('[character-mode-module]')
  ) {
    return labels.messages.characterModeModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.message.includes('[character-effect-module]') ||
      error.message.includes('updateCharacterEffect is not a function') ||
      error.message.includes('moveCharacterEffect is not a function') ||
      error.message.includes('unknown method: characterEffect.'))
  ) {
    return labels.messages.effectModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.message.includes('[cg-display-module]') ||
      error.message.includes('addCgDisplay is not a function') ||
      error.message.includes('updateCgDisplay is not a function') ||
      error.message.includes('deleteCgDisplay is not a function') ||
      error.message.includes('reorderCgDisplay is not a function') ||
      error.message.includes('unknown method: cgDisplay.'))
  ) {
    return labels.messages.cgDisplayModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.message.includes('[logic-module]') ||
      error.message.includes('addVariableSet is not a function') ||
      error.message.includes('updateVariableSet is not a function') ||
      error.message.includes('addVariableChange is not a function') ||
      error.message.includes('updateVariableChange is not a function') ||
      error.message.includes('addLogicIf is not a function') ||
      error.message.includes('updateLogicIf is not a function') ||
      error.message.includes('addLogicRepeat is not a function') ||
      error.message.includes('updateLogicRepeat is not a function') ||
      error.message.includes('deleteLogicControl is not a function') ||
      error.message.includes('reorderLogicControl is not a function') ||
      error.message.includes('unknown method: variableSet.') ||
      error.message.includes('unknown method: variableChange.') ||
      error.message.includes('unknown method: logicIf.') ||
      error.message.includes('unknown method: logicRepeat.') ||
      error.message.includes('unknown method: logicControl.'))
  ) {
    return labels.messages.logicModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.name === 'VnEngineError:logic_variable_limit' ||
      error.message.includes('logic_variable_limit') ||
      error.message.includes(
        'project cannot contain more than 32 logic variables',
      ))
  ) {
    return labels.messages.logicVariableLimit;
  }

  if (
    error instanceof Error &&
    (error.message.includes('updateCgGallery is not a function') ||
      error.message.includes('unknown method: cgGallery.update'))
  ) {
    return labels.messages.cgModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.message.includes('addStoryExtension is not a function') ||
      error.message.includes('reorderTimelineNodes is not a function') ||
      error.message.includes('unknown method: storyExtension') ||
      error.message.includes('unknown method: timeline.reorderMany'))
  ) {
    return labels.messages.extensionModuleUnavailable;
  }

  if (
    error instanceof Error &&
    (error.message.includes('addSceneJump is not a function') ||
      error.message.includes('updateSceneJump is not a function') ||
      error.message.includes('unknown method: sceneJump'))
  ) {
    return labels.messages.sceneJumpModuleUnavailable;
  }

  if (
    error instanceof Error &&
    error.message.includes('project name must not be empty')
  ) {
    return labels.messages.projectNameRequired;
  }

  if (
    error instanceof Error &&
    error.message.includes('start screen title must not be empty')
  ) {
    return labels.messages.gameTitleRequired;
  }

  if (
    error instanceof Error &&
    error.message.includes('project file could not be saved safely')
  ) {
    return labels.messages.saveFailed;
  }

  if (!(error instanceof Error)) {
    return labels.messages.unknownBackendError;
  }
  return labels.locale === 'en-US' && /[\p{Script=Han}]/u.test(error.message)
    ? labels.messages.unknownBackendError
    : error.message;
}

// 这一层只协调“Project 快照 ↔ C++ API”，不知道当前选中了哪个节点。
export function useEngineProject(
  platform: EditorPlatformGateway = getEditorPlatformGateway(),
) {
  const labels = useEditorLabels();
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [project, setProject] =
    useState<ProjectDocument | null>(null);
  const rendererProject = useMemo(
    () => project === null ? null : withRendererProjectDefaults(project),
    [project],
  );
  const [assets, setAssets] = useState<AssetDocument[]>([]);
  // 即使重新打开的是同一个 project.id，Main 也会轮换图片预览能力令牌。
  // 这个计数让 Renderer 丢弃旧 URL，并按新项目会话重新申请。
  const [projectGeneration, setProjectGeneration] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [pendingEngineActions, setPendingEngineActions] = useState(0);
  const [isFileOperating, setIsFileOperating] = useState(false);
  const [engineMessage, setEngineMessage] = useState('');
  const [session, setSession] = useState<ProjectFileSessionSnapshot>({
    hasStorage: false,
    projectFolderName: null,
    revision: 0,
    savedRevision: null,
    isDirty: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  useEffect(() => {
    // Export summaries are localized at completion time. Do not leave a
    // completed summary in the previous language after the UI switches.
    setExportMessage('');
  }, [labels]);
  const fileOperationInProgress = useRef(false);
  const engineActionQueue = useRef<Promise<void>>(Promise.resolve());
  const initializationRequest = useRef<Promise<[
    EngineMutationResult,
    ProjectFileSessionSnapshot,
  ]> | null>(null);
  const isBusy =
    isInitializing ||
    pendingEngineActions > 0 ||
    isFileOperating ||
    isSaving ||
    isExporting;

  const authoringCommands = useMemo<VnEngineApi>(() => {
    const hasImageScale = hasImageScaleContract(platform.engine);
    const hasSurfaceStyle = hasSurfaceStyleContract(platform.engine);
    const hasStoryCode = hasStoryCodeContract(platform.engine);
    if (hasImageScale && hasSurfaceStyle && hasStoryCode) {
      return platform.engine;
    }
    const rejectStaleImageScalePreload = () =>
      Promise.reject<EngineMutationResult>(imageScaleContractError());
    const rejectStaleSurfaceStylePreload = () =>
      Promise.reject<EngineMutationResult>(surfaceStyleContractError());
    const rejectStaleStoryCodePreload = () =>
      Promise.reject<EngineMutationResult>(storyCodeContractError());
    return {
      ...platform.engine,
      ...(hasImageScale
        ? {}
        : {
            setSceneBackground: rejectStaleImageScalePreload,
            updateBackground: rejectStaleImageScalePreload,
            updateCharacter: rejectStaleImageScalePreload,
          }),
      ...(hasSurfaceStyle
        ? {}
        : {
            updateStartScreenStyle: rejectStaleSurfaceStylePreload,
            updateCgGalleryStyle: rejectStaleSurfaceStylePreload,
          }),
      ...(hasStoryCode
        ? {}
        : {
            replaceSceneContent: rejectStaleStoryCodePreload,
          }),
    } as VnEngineApi;
  }, [platform.engine]);

  function applyResult(
    result: EngineMutationResult,
    fileSession?: ProjectFileSessionSnapshot,
  ): EngineMutationResult {
    const normalizedProject = withRendererProjectDefaults(result.project);
    const normalizedResult = normalizedProject === result.project
      ? result
      : { ...result, project: normalizedProject };
    setProject(normalizedProject);
    setAssets(result.assets);

    if (fileSession) {
      setSession({
        ...fileSession,
        ...result.session,
      });
      return normalizedResult;
    }

    setSession((current) => ({
      ...current,
      ...result.session,
    }));
    return normalizedResult;
  }

  useEffect(() => {
    let isActive = true;

    initializationRequest.current ??= Promise.all([
      requestInitialProject(platform),
      platform.projectFiles.getSession(),
    ]);

    void initializationRequest.current
      .then(([result, session]) => {
        if (isActive) {
          applyResult(result, {
            ...session,
            revision: result.session.revision,
            savedRevision: result.session.savedRevision,
            isDirty: result.session.isDirty,
          });
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setEngineMessage(readableError(error, labelsRef.current));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsInitializing(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  async function runEngineAction(
    action: () => Promise<EngineMutationResult>,
  ): Promise<EngineMutationResult | null> {
    let resolveQueuedResult: (
      result: EngineMutationResult | null,
    ) => void = () => {};
    const queuedResult = new Promise<EngineMutationResult | null>(
      (resolve) => {
        resolveQueuedResult = resolve;
      },
    );

    // 在命令进入队列时就计数，而不是等它真正开始执行。这样 UI 在前一条
    // 命令尚未结束时也不会短暂恢复为可编辑状态。
    setPendingEngineActions((current) => current + 1);
    engineActionQueue.current = engineActionQueue.current.then(async () => {
      setEngineMessage('');
      setExportMessage('');

      try {
        const result = await action();
        const normalizedResult = applyResult(result);
        resolveQueuedResult(normalizedResult);
      } catch (error: unknown) {
        setEngineMessage(readableError(error, labelsRef.current));
        resolveQueuedResult(null);
      } finally {
        setPendingEngineActions((current) => Math.max(0, current - 1));
      }
    });

    return queuedResult;
  }

  async function waitForEngineActions(): Promise<void> {
    await engineActionQueue.current;
  }

  async function getProjectSnapshot(): Promise<ProjectDocument | null> {
    const result = await runEngineAction(() => platform.engine.getProject());
    return result === null
      ? null
      : withRendererProjectDefaults(result.project);
  }

  const authoringActions = createAuthoringActions({
    commands: authoringCommands,
    run: runEngineAction,
    onSceneJumpUnavailable: () => {
      setEngineMessage(labelsRef.current.messages.sceneJumpModuleUnavailable);
    },
    onStoryExtensionUnavailable: () => {
      setEngineMessage(labelsRef.current.messages.extensionModuleUnavailable);
    },
    onLogicModuleUnavailable: () => {
      setEngineMessage(labelsRef.current.messages.logicModuleUnavailable);
    },
    onCgDisplayModuleUnavailable: () => {
      setEngineMessage(labelsRef.current.messages.cgDisplayModuleUnavailable);
    },
    onCharacterEffectModuleUnavailable: () => {
      setEngineMessage(labelsRef.current.messages.effectModuleUnavailable);
    },
  });

  async function createProject(name?: string): Promise<boolean> {
    if (fileOperationInProgress.current) {
      return false;
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await platform.projectFiles.createProject(name);
      return true;
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return false;
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function openProject(): Promise<OpenProjectStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.projectFiles.openProject();

      if (outcome.cancelled) {
        return 'cancelled';
      }

      // Main 只会在 C++ 已完整解析并校验项目后返回成功。
      applyResult(outcome.result, outcome.session);
      setProjectGeneration((current) => current + 1);
      return 'opened';
    } catch (error: unknown) {
      // 失败时不调用 setProject，因此当前编辑内容会原样保留。
      setEngineMessage(readableError(error, labelsRef.current));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function saveProject(
    prepare?: () => Promise<boolean>,
  ): Promise<boolean> {
    if (fileOperationInProgress.current) {
      return false;
    }

    fileOperationInProgress.current = true;
    setIsSaving(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      if (prepare && !(await prepare())) {
        return false;
      }
      await waitForEngineActions();
      const outcome = await platform.projectFiles.saveProject();

      if (outcome.cancelled) {
        setSession(outcome.session);
        return false;
      }

      applyResult(outcome.result, outcome.session);
      // Main 会在每次成功保存后刷新私有资源清单。即使 project/assets
      // 业务数据没变，也重新申请一次预览 URL，以便从先前的安全降级
      // （例如临时读取失败）中恢复。
      setProjectGeneration((current) => current + 1);
      return true;
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return false;
    } finally {
      fileOperationInProgress.current = false;
      setIsSaving(false);
    }
  }

  async function exportGame(
    prepare?: () => Promise<boolean>,
    request: GameExportRequest = { output: 'runtime-bundle' },
  ): Promise<ExportGameStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsExporting(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      // 导出必须来自一次已提交、已保存的权威 revision。即使项目当前看似
      // clean，也再次走保存边界，让首次保存和媒体发布使用同一条安全流程。
      if (prepare && !(await prepare())) {
        return 'failed';
      }

      await waitForEngineActions();
      setIsSaving(true);
      const saveOutcome = await platform.projectFiles.saveProject();
      setIsSaving(false);

      if (saveOutcome.cancelled) {
        setSession(saveOutcome.session);
        setExportMessage(labelsRef.current.messages.saveCancelledBeforeExport);
        return 'cancelled';
      }

      applyResult(saveOutcome.result, saveOutcome.session);
      setProjectGeneration((current) => current + 1);

      const savedSession = {
        ...saveOutcome.session,
        ...saveOutcome.result.session,
      };
      if (
        !savedSession.hasStorage ||
        savedSession.isDirty ||
        savedSession.savedRevision !== savedSession.revision
      ) {
        throw new Error(labelsRef.current.messages.projectNotSavedForExport);
      }

      const outcome = await platform.gameExport.exportGame(request);
      if (outcome.cancelled) {
        setExportMessage(labelsRef.current.messages.exportCancelled);
        return 'cancelled';
      }

      if (outcome.sourceRevision !== savedSession.revision) {
        throw new Error(labelsRef.current.messages.exportRevisionMismatch);
      }

      setExportMessage(exportCompletedMessage(outcome, labelsRef.current));
      return 'exported';
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsSaving(false);
      setIsExporting(false);
    }
  }

  async function renameProject(name: string): Promise<boolean> {
    const result = await runEngineAction(() =>
      platform.engine.renameProject(name),
    );
    return result !== null;
  }

  async function setSceneBackground(
    sceneId: string,
    assetId: string | null,
    scalePercent: number,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      authoringCommands.setSceneBackground(sceneId, assetId, scalePercent),
    );
    return result !== null;
  }

  async function updateStartScreen(
    title: string,
    eyebrow: string,
    backgroundAssetId: string | null,
    musicAssetId: string | null,
  ): Promise<boolean> {
    const command = platform.engine.updateStartScreen;
    if (typeof command !== 'function') {
      setEngineMessage(labelsRef.current.messages.startScreenModuleUnavailable);
      setExportMessage('');
      return false;
    }
    const result = await runEngineAction(async () => {
      try {
        return await command({
          title,
          eyebrow,
          backgroundAssetId,
          musicAssetId,
        });
      } catch (error: unknown) {
        if (shouldMarkStartScreenModuleError(error)) {
          throw startScreenModuleError(error);
        }
        throw error;
      }
    });
    return result !== null;
  }

  async function updateCgGallery(
    pages: ProjectDocument['cgGallery']['pages'],
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      platform.engine.updateCgGallery(pages),
    );
    return result !== null;
  }

  async function updateStartScreenStyle(
    style: StartScreenStyleDocument,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      authoringCommands.updateStartScreenStyle(style),
    );
    return result !== null;
  }

  async function updateCgGalleryStyle(
    style: CgGalleryStyleDocument,
  ): Promise<boolean> {
    const result = await runEngineAction(() =>
      authoringCommands.updateCgGalleryStyle(style),
    );
    return result !== null;
  }

  async function replaceSceneContent(
    params: ReplaceSceneContentParams,
  ): Promise<boolean> {
    const result = await runEngineAction(async () => {
      try {
        return await authoringCommands.replaceSceneContent(params);
      } catch (error: unknown) {
        // Renderer/Preload can hot-reload while the Electron Main process is
        // still serving an older invocation schema. Surface that recoverable
        // version mismatch instead of hiding Main's Chinese validation error
        // behind the English generic "unknown error" message.
        if (isBackendProtocolContractError(error)) {
          throw backendProtocolContractError(error);
        }
        if (isStoryCodeContractUnavailableError(error)) {
          throw storyCodeContractError(error);
        }
        throw error;
      }
    });
    return result !== null;
  }

  async function importImage(): Promise<ImportImageStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importImage();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function importVideo(): Promise<ImportAssetStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importVideo();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function importAudio(): Promise<ImportAssetStatus> {
    if (fileOperationInProgress.current) {
      return 'failed';
    }

    fileOperationInProgress.current = true;
    setIsFileOperating(true);
    setEngineMessage('');
    setExportMessage('');

    try {
      await waitForEngineActions();
      const outcome = await platform.assets.importAudio();

      if (outcome.status === 'cancelled') {
        return outcome.status;
      }

      applyResult(outcome.result);
      return outcome.status;
    } catch (error: unknown) {
      setEngineMessage(readableError(error, labelsRef.current));
      return 'failed';
    } finally {
      fileOperationInProgress.current = false;
      setIsFileOperating(false);
    }
  }

  async function renameAsset(
    assetId: string,
    displayName: string,
  ): Promise<boolean> {
    const management = supportsAssetManagement(platform.assets)
      ? platform.assets
      : null;
    const result = await runEngineAction(() => management === null
      ? Promise.reject<EngineMutationResult>(assetManagementContractError())
      : management.renameAsset(assetId, displayName));
    return result !== null;
  }

  async function deleteAssets(assetIds: string[]): Promise<boolean> {
    const management = supportsAssetManagement(platform.assets)
      ? platform.assets
      : null;
    const result = await runEngineAction(() => management === null
      ? Promise.reject<EngineMutationResult>(assetManagementContractError())
      : management.deleteAssets(assetIds));
    if (result !== null) {
      // Main rotates the window-local preview/media capability set after a
      // deletion. IDs of surviving assets stay stable, so explicitly force
      // their opaque URLs to be requested again.
      setProjectGeneration((current) => current + 1);
    }
    return result !== null;
  }

  return {
    project: rendererProject,
    assets,
    projectGeneration,
    projectFolderName: session.projectFolderName,
    session,
    isSaving,
    isExporting,
    isBusy,
    engineMessage,
    exportMessage,
    setEngineMessage,
    runEngineAction,
    authoringCommands,
    ...authoringActions,
    createProject,
    openProject,
    saveProject,
    exportGame,
    importImage,
    importVideo,
    importAudio,
    renameAsset,
    deleteAssets,
    renameProject,
    updateStartScreen,
    updateStartScreenStyle,
    updateCgGallery,
    updateCgGalleryStyle,
    replaceSceneContent,
    setSceneBackground,
    waitForEngineActions,
    getProjectSnapshot,
  };
}

function exportCompletedMessage(
  outcome: ExportGameCompletedResult,
  labels: EditorLabels,
): string {
  const kind =
    outcome.output === 'standalone-application'
      ? labels.messages.standaloneZip
      : outcome.output === 'web-player'
        ? labels.messages.webZip
        : labels.messages.contentBundle;
  const count = labels.locale === 'zh-CN'
    ? `（${outcome.assetCount} ${labels.messages.assetUnit}）`
    : ` (${outcome.assetCount} ${labels.messages.assetUnit})`;
  return `${labels.messages.exportedPrefix}${labels.common.wordSeparator}${kind} ${outcome.artifactName}${count}`;
}

export type EngineProjectState = ReturnType<typeof useEngineProject>;
