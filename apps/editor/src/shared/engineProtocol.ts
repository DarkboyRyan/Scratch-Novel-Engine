import type { AssetDocument, ProjectDocument } from './projectTypes';

// C++、Electron Main、Preload 和 React 共同遵守的跨进程协议。
export type EngineSessionState = {
  revision: number;
  savedRevision: number | null;
  isDirty: boolean;
};

export type EngineMutationResult = {
  project: ProjectDocument;
  assets: AssetDocument[];
  session: EngineSessionState;
  sceneId?: string;
  nodeId?: string;
  assetId?: string;
};

export type AddDialogueParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
  speaker?: string;
  text?: string;
};

export type ReorderDialogueParams = {
  sceneId: string;
  nodeId: string;
  // null 明确表示移动到当前场景末尾。
  beforeNodeId: string | null;
};

export type ReorderDialoguesParams = {
  sceneId: string;
  nodeIds: string[];
  // null 明确表示把整个选择组移动到当前场景末尾。
  beforeNodeId: string | null;
};

export type DeleteDialoguesParams = {
  sceneId: string;
  nodeIds: string[];
};

export const ENGINE_METHODS = [
  'project.create',
  'project.ensure',
  'project.get',
  'project.rename',
  'scene.add',
  'scene.rename',
  'scene.delete',
  'scene.setBackground',
  'dialogue.add',
  'dialogue.update',
  'dialogue.delete',
  'dialogue.deleteMany',
  'dialogue.move',
  'dialogue.reorder',
  'dialogue.reorderMany',
] as const;

export type EngineMethod = (typeof ENGINE_METHODS)[number];

export type EngineParamsByMethod = {
  'project.create': {
    name?: string;
  };
  'project.ensure': Record<string, never>;
  'project.get': Record<string, never>;
  'project.rename': {
    name: string;
  };
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
  'scene.setBackground': {
    sceneId: string;
    assetId: string | null;
  };
  'dialogue.add': AddDialogueParams;
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
  'dialogue.deleteMany': DeleteDialoguesParams;
  'dialogue.move': {
    sceneId: string;
    nodeId: string;
    direction: -1 | 1;
  };
  'dialogue.reorder': ReorderDialogueParams;
  'dialogue.reorderMany': ReorderDialoguesParams;
};

export type EngineInvocation = {
  [Method in EngineMethod]: {
    method: Method;
    params: EngineParamsByMethod[Method];
  };
}[EngineMethod];

// `project.open` 带有本机文件路径，因此它不是 Renderer 可以直接构造的
// EngineInvocation。只有 Electron Main 在用户完成原生文件选择后，才能创建
// 这个后端请求。
export type OpenProjectBackendInvocation = {
  method: 'project.open';
  params: {
    filePath: string;
  };
};

export type SaveProjectBackendInvocation = {
  method: 'project.save';
  params: {
    filePath: string;
  };
};

// Asset import paths are created only by Electron Main after a native file
// selection. This invocation must never be added to ENGINE_METHODS.
export type ImportImageBackendInvocation = {
  method: 'asset.import';
  params: {
    sourceFilePath: string;
    projectFilePath: string;
  };
};

export type BackendInvocation =
  | EngineInvocation
  | OpenProjectBackendInvocation
  | SaveProjectBackendInvocation
  | ImportImageBackendInvocation;

// Electron Main 会补充 id；C++ 使用同一个 id 返回结果。
export type BackendRequest = BackendInvocation & {
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
  ensureProject(): Promise<EngineMutationResult>;
  getProject(): Promise<EngineMutationResult>;
  renameProject(name: string): Promise<EngineMutationResult>;
  addScene(name?: string): Promise<EngineMutationResult>;
  renameScene(
    sceneId: string,
    name: string,
  ): Promise<EngineMutationResult>;
  deleteScene(sceneId: string): Promise<EngineMutationResult>;
  setSceneBackground(
    sceneId: string,
    assetId: string | null,
  ): Promise<EngineMutationResult>;
  addDialogue(
    params: AddDialogueParams,
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
  deleteDialogues(
    params: DeleteDialoguesParams,
  ): Promise<EngineMutationResult>;
  moveDialogue(
    sceneId: string,
    nodeId: string,
    direction: -1 | 1,
  ): Promise<EngineMutationResult>;
  reorderDialogue(
    params: ReorderDialogueParams,
  ): Promise<EngineMutationResult>;
  reorderDialogues(
    params: ReorderDialoguesParams,
  ): Promise<EngineMutationResult>;
};

export const ENGINE_IPC_CHANNEL = 'vn-engine:request';
