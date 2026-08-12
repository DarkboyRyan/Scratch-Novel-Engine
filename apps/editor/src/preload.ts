import { contextBridge, ipcRenderer } from 'electron';

import {
  ENGINE_IPC_CHANNEL,
  type EngineInvocation,
  type EngineMutationResult,
  type VnEngineApi,
} from './shared/engineProtocol';

function invokeEngine(
  invocation: EngineInvocation,
): Promise<EngineMutationResult> {
  return ipcRenderer.invoke(ENGINE_IPC_CHANNEL, invocation);
}

const vnEngine: VnEngineApi = {
  createProject: (name) =>
    invokeEngine({ method: 'project.create', params: { name } }),
  ensureProject: () =>
    invokeEngine({ method: 'project.ensure', params: {} }),
  getProject: () =>
    invokeEngine({ method: 'project.get', params: {} }),
  addScene: (name) =>
    invokeEngine({ method: 'scene.add', params: { name } }),
  renameScene: (sceneId, name) =>
    invokeEngine({
      method: 'scene.rename',
      params: { sceneId, name },
    }),
  deleteScene: (sceneId) =>
    invokeEngine({ method: 'scene.delete', params: { sceneId } }),
  addDialogue: (sceneId, afterNodeId, speaker, text) =>
    invokeEngine({
      method: 'dialogue.add',
      params: { sceneId, afterNodeId, speaker, text },
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
  moveDialogue: (sceneId, nodeId, direction) =>
    invokeEngine({
      method: 'dialogue.move',
      params: { sceneId, nodeId, direction },
    }),
};

contextBridge.exposeInMainWorld('vnEngine', vnEngine);
