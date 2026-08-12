import { contextBridge, ipcRenderer } from 'electron';

import {
  ENGINE_IPC_CHANNEL,
  type EngineInvocation,
  type EngineMutationResult,
  type VnEngineApi,
} from './shared/engineProtocol';
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

contextBridge.exposeInMainWorld('vnEngine', vnEngine);
contextBridge.exposeInMainWorld('vnProjectFiles', vnProjectFiles);
