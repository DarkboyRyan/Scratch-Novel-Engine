import { contextBridge, ipcRenderer } from 'electron';

import {
  ASSET_IPC_CHANNEL,
  type AssetInvocation,
  type ImportAssetResult,
  type VnAssetsApi,
} from './shared/assetProtocol';
import {
  ENGINE_IPC_CHANNEL,
  type EngineInvocation,
  type EngineMutationResult,
  type VnEngineApi,
} from './shared/engineProtocol';
import {
  type ExportGameInvocation,
  type ExportGameResult,
  type VnGameExportApi,
} from './shared/exportProtocol';
import { EXPORT_GAME_IPC_CHANNEL } from './shared/exportIpcChannel';
import {
  PROJECT_FILE_COMMAND_CHANNEL,
  PROJECT_FILE_IPC_CHANNEL,
  type CreateProjectWindowResult,
  type ProjectFileCommand,
  type ProjectFileInvocation,
  type ProjectFileOperationResult,
  type ProjectFileSessionSnapshot,
  type VnProjectFilesApi,
} from './shared/projectFileProtocol';

function invokeEngine(
  invocation: EngineInvocation,
): Promise<EngineMutationResult> {
  return ipcRenderer.invoke(ENGINE_IPC_CHANNEL, invocation);
}

function invokeAsset(
  invocation: AssetInvocation,
): Promise<ImportAssetResult | string | null> {
  return ipcRenderer.invoke(ASSET_IPC_CHANNEL, invocation) as Promise<
    ImportAssetResult | string | null
  >;
}

function invokeGameExport(
  invocation: ExportGameInvocation,
): Promise<ExportGameResult> {
  return ipcRenderer.invoke(EXPORT_GAME_IPC_CHANNEL, invocation);
}

const vnAssets: VnAssetsApi = {
  importImage: () =>
    invokeAsset({
      action: 'import-image',
      params: {},
    }) as Promise<ImportAssetResult>,
  importVideo: () =>
    invokeAsset({
      action: 'import-video',
      params: {},
    }) as Promise<ImportAssetResult>,
  importAudio: () =>
    invokeAsset({
      action: 'import-audio',
      params: {},
    }) as Promise<ImportAssetResult>,
  getPreviewUrl: (assetId) =>
    invokeAsset({
      action: 'get-preview-url',
      params: { assetId },
    }) as Promise<string | null>,
  getMediaUrl: (assetId) =>
    invokeAsset({
      action: 'get-media-url',
      params: { assetId },
    }) as Promise<string | null>,
};

const vnEngine: VnEngineApi = {
  ensureProject: () =>
    invokeEngine({ method: 'project.ensure', params: {} }),
  getProject: () =>
    invokeEngine({ method: 'project.get', params: {} }),
  renameProject: (name) =>
    invokeEngine({ method: 'project.rename', params: { name } }),
  addScene: (name) =>
    invokeEngine({ method: 'scene.add', params: { name } }),
  renameScene: (sceneId, name) =>
    invokeEngine({
      method: 'scene.rename',
      params: { sceneId, name },
    }),
  deleteScene: (sceneId) =>
    invokeEngine({ method: 'scene.delete', params: { sceneId } }),
  setSceneBackground: (sceneId, assetId) =>
    invokeEngine({
      method: 'scene.setBackground',
      params: { sceneId, assetId },
    }),
  addDialogue: (params) =>
    invokeEngine({
      method: 'dialogue.add',
      params,
    }),
  updateDialogue: (sceneId, nodeId, speaker, text) =>
    invokeEngine({
      method: 'dialogue.update',
      params: { sceneId, nodeId, speaker, text },
    }),
  setDialogueVoice: (params) =>
    invokeEngine({
      method: 'dialogue.setVoice',
      params,
    }),
  deleteDialogue: (sceneId, nodeId) =>
    invokeEngine({
      method: 'dialogue.delete',
      params: { sceneId, nodeId },
    }),
  deleteDialogues: (params) =>
    invokeEngine({
      method: 'dialogue.deleteMany',
      params,
    }),
  moveDialogue: (sceneId, nodeId, direction) =>
    invokeEngine({
      method: 'dialogue.move',
      params: { sceneId, nodeId, direction },
    }),
  reorderDialogue: (params) =>
    invokeEngine({
      method: 'dialogue.reorder',
      params,
    }),
  reorderDialogues: (params) =>
    invokeEngine({
      method: 'dialogue.reorderMany',
      params,
    }),
  addBackground: (params) =>
    invokeEngine({
      method: 'background.add',
      params,
    }),
  updateBackground: (params) =>
    invokeEngine({
      method: 'background.update',
      params,
    }),
  deleteBackground: (params) =>
    invokeEngine({
      method: 'background.delete',
      params,
    }),
  reorderBackground: (params) =>
    invokeEngine({
      method: 'background.reorder',
      params,
    }),
  addCharacter: (params) =>
    invokeEngine({
      method: 'character.add',
      params,
    }),
  updateCharacter: (params) =>
    invokeEngine({
      method: 'character.update',
      params,
    }),
  addSceneJump: (params) =>
    invokeEngine({
      method: 'sceneJump.add',
      params,
    }),
  updateSceneJump: (params) =>
    invokeEngine({
      method: 'sceneJump.update',
      params,
    }),
  addBgm: (params) =>
    invokeEngine({
      method: 'bgm.add',
      params,
    }),
  updateBgm: (params) =>
    invokeEngine({
      method: 'bgm.update',
      params,
    }),
  addVideo: (params) =>
    invokeEngine({
      method: 'video.add',
      params,
    }),
  updateVideo: (params) =>
    invokeEngine({
      method: 'video.update',
      params,
    }),
  addChoice: (params) =>
    invokeEngine({
      method: 'choice.add',
      params,
    }),
  addChoiceOption: (params) =>
    invokeEngine({
      method: 'choice.option.add',
      params,
    }),
  updateChoiceOption: (params) =>
    invokeEngine({
      method: 'choice.option.update',
      params,
    }),
  deleteChoiceOption: (params) =>
    invokeEngine({
      method: 'choice.option.delete',
      params,
    }),
  reorderChoiceOption: (params) =>
    invokeEngine({
      method: 'choice.option.reorder',
      params,
    }),
  deleteTimelineNodes: (params) =>
    invokeEngine({
      method: 'timeline.deleteMany',
      params,
    }),
  reorderTimelineNode: (params) =>
    invokeEngine({
      method: 'timeline.reorder',
      params,
    }),
  reorderTimelineNodes: (params) =>
    invokeEngine({
      method: 'timeline.reorderMany',
      params,
    }),
};

type ProjectFileResultByAction = {
  create: CreateProjectWindowResult;
  open: ProjectFileOperationResult;
  save: ProjectFileOperationResult;
  'get-session': ProjectFileSessionSnapshot;
};

function invokeProjectFile<Action extends ProjectFileInvocation['action']>(
  invocation: Extract<ProjectFileInvocation, { action: Action }>,
): Promise<ProjectFileResultByAction[Action]> {
  return ipcRenderer.invoke(PROJECT_FILE_IPC_CHANNEL, invocation);
}

const vnProjectFiles: VnProjectFilesApi = {
  createProject: (name) =>
    invokeProjectFile({ action: 'create', params: { name } }),
  openProject: () =>
    invokeProjectFile({ action: 'open', params: {} }),
  saveProject: () =>
    invokeProjectFile({ action: 'save', params: {} }),
  getSession: () =>
    invokeProjectFile({ action: 'get-session', params: {} }),
  onCommand: (listener) => {
    const handleCommand = (
      _event: Electron.IpcRendererEvent,
      command: ProjectFileCommand,
    ) => {
      listener(command);
    };

    ipcRenderer.on(PROJECT_FILE_COMMAND_CHANNEL, handleCommand);

    return () => {
      ipcRenderer.removeListener(
        PROJECT_FILE_COMMAND_CHANNEL,
        handleCommand,
      );
    };
  },
};

const vnGameExport: VnGameExportApi = {
  exportGame: (request) =>
    invokeGameExport({ action: 'export', params: request }),
};

contextBridge.exposeInMainWorld('vnAssets', vnAssets);
contextBridge.exposeInMainWorld('vnEngine', vnEngine);
contextBridge.exposeInMainWorld('vnProjectFiles', vnProjectFiles);
contextBridge.exposeInMainWorld('vnGameExport', vnGameExport);
