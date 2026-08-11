import type { ProjectDocument } from './projectTypes';

// C++、Electron Main、Preload 和 React 共同遵守的跨进程协议。
export type EngineMutationResult = {
  project: ProjectDocument;
  sceneId?: string;
  nodeId?: string;
};

export const ENGINE_METHODS = [
  'project.create',
  'project.ensure',
  'project.get',
  'scene.add',
  'scene.rename',
  'scene.delete',
  'dialogue.add',
  'dialogue.update',
  'dialogue.delete',
  'dialogue.move',
] as const;

export type EngineMethod = (typeof ENGINE_METHODS)[number];

export type EngineParamsByMethod = {
  'project.create': {
    name?: string;
  };
  'project.ensure': Record<string, never>;
  'project.get': Record<string, never>;
  'scene.add': {
    name?: string;
  };
  'scene.rename': {
    sceneId: string;
    name: string;
  };
  'scene.delete': {
    sceneId: string;
  };
  'dialogue.add': {
    sceneId: string;
    afterNodeId?: string | null;
    speaker?: string;
    text?: string;
  };
  'dialogue.update': {
    sceneId: string;
    nodeId: string;
    speaker: string;
    text: string;
  };
  'dialogue.delete': {
    sceneId: string;
    nodeId: string;
  };
  'dialogue.move': {
    sceneId: string;
    nodeId: string;
    direction: -1 | 1;
  };
};

export type EngineInvocation = {
  [Method in EngineMethod]: {
    method: Method;
    params: EngineParamsByMethod[Method];
  };
}[EngineMethod];

// Electron Main 会补充 id；C++ 使用同一个 id 返回结果。
export type BackendRequest = EngineInvocation & {
  id: number;
};

export type BackendResponse =
  | {
      id: number;
      ok: true;
      result: EngineMutationResult;
    }
  | {
      id: number;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

// Renderer 只能使用业务级 API，不能接触 ipcRenderer 或任意 IPC channel。
export type VnEngineApi = {
  createProject(name?: string): Promise<EngineMutationResult>;
  ensureProject(): Promise<EngineMutationResult>;
  getProject(): Promise<EngineMutationResult>;
  addScene(name?: string): Promise<EngineMutationResult>;
  renameScene(
    sceneId: string,
    name: string,
  ): Promise<EngineMutationResult>;
  deleteScene(sceneId: string): Promise<EngineMutationResult>;
  addDialogue(
    sceneId: string,
    afterNodeId?: string | null,
    speaker?: string,
    text?: string,
  ): Promise<EngineMutationResult>;
  updateDialogue(
    sceneId: string,
    nodeId: string,
    speaker: string,
    text: string,
  ): Promise<EngineMutationResult>;
  deleteDialogue(
    sceneId: string,
    nodeId: string,
  ): Promise<EngineMutationResult>;
  moveDialogue(
    sceneId: string,
    nodeId: string,
    direction: -1 | 1,
  ): Promise<EngineMutationResult>;
};

export const ENGINE_IPC_CHANNEL = 'vn-engine:request';
