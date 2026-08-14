import type {
  AssetDocument,
  CharacterSlot,
  ProjectDocument,
} from './projectTypes';

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
  optionId?: string;
  assetId?: string;
};

export type AddDialogueParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
  speaker?: string;
  text?: string;
};

export type AddBackgroundParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateBackgroundParams = {
  sceneId: string;
  nodeId: string;
  assetId: string | null;
};

export type AddCharacterParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateCharacterParams = {
  sceneId: string;
  nodeId: string;
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
};

export type AddSceneJumpParams = {
  sceneId: string;
  targetSceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateSceneJumpParams = {
  sceneId: string;
  nodeId: string;
  targetSceneId: string;
};

export type SetDialogueVoiceParams = {
  sceneId: string;
  nodeId: string;
  assetId: string | null;
};

export type AddBgmParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateBgmParams = {
  sceneId: string;
  nodeId: string;
  assetId: string | null;
};

export type AddVideoParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateVideoParams = {
  sceneId: string;
  nodeId: string;
  assetId: string | null;
};

export type AddChoiceParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type AddChoiceOptionParams = {
  sceneId: string;
  nodeId: string;
  text: string;
  targetSceneId: string;
  beforeOptionId?: string | null;
};

export type UpdateChoiceOptionParams = {
  sceneId: string;
  nodeId: string;
  optionId: string;
  text: string;
  targetSceneId: string;
};

export type DeleteChoiceOptionParams = {
  sceneId: string;
  nodeId: string;
  optionId: string;
};

export type ReorderChoiceOptionParams = {
  sceneId: string;
  nodeId: string;
  optionId: string;
  beforeOptionId: string | null;
};

export type DeleteBackgroundParams = {
  sceneId: string;
  nodeId: string;
};

export type ReorderBackgroundParams = {
  sceneId: string;
  nodeId: string;
  // null 明确表示移动到当前场景末尾。
  beforeNodeId: string | null;
};

export type TimelineDeleteManyParams = {
  sceneId: string;
  nodeIds: string[];
};

export type TimelineReorderParams = {
  sceneId: string;
  nodeId: string;
  // null 明确表示移动到当前场景末尾。
  beforeNodeId: string | null;
};

export type TimelineReorderManyParams = {
  sceneId: string;
  nodeIds: string[];
  // null 明确表示把整个选择组移动到当前场景末尾。
  beforeNodeId: string | null;
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
  'dialogue.setVoice',
  'dialogue.delete',
  'dialogue.deleteMany',
  'dialogue.move',
  'dialogue.reorder',
  'dialogue.reorderMany',
  'background.add',
  'background.update',
  'background.delete',
  'background.reorder',
  'character.add',
  'character.update',
  'sceneJump.add',
  'sceneJump.update',
  'bgm.add',
  'bgm.update',
  'video.add',
  'video.update',
  'choice.add',
  'choice.option.add',
  'choice.option.update',
  'choice.option.delete',
  'choice.option.reorder',
  'timeline.deleteMany',
  'timeline.reorder',
  'timeline.reorderMany',
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
  'dialogue.setVoice': SetDialogueVoiceParams;
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
  'background.add': AddBackgroundParams;
  'background.update': UpdateBackgroundParams;
  'background.delete': DeleteBackgroundParams;
  'background.reorder': ReorderBackgroundParams;
  'character.add': AddCharacterParams;
  'character.update': UpdateCharacterParams;
  'sceneJump.add': AddSceneJumpParams;
  'sceneJump.update': UpdateSceneJumpParams;
  'bgm.add': AddBgmParams;
  'bgm.update': UpdateBgmParams;
  'video.add': AddVideoParams;
  'video.update': UpdateVideoParams;
  'choice.add': AddChoiceParams;
  'choice.option.add': AddChoiceOptionParams;
  'choice.option.update': UpdateChoiceOptionParams;
  'choice.option.delete': DeleteChoiceOptionParams;
  'choice.option.reorder': ReorderChoiceOptionParams;
  'timeline.deleteMany': TimelineDeleteManyParams;
  'timeline.reorder': TimelineReorderParams;
  'timeline.reorderMany': TimelineReorderManyParams;
};

export type EngineInvocation = {
  [Method in EngineMethod]: {
    method: Method;
    params: EngineParamsByMethod[Method];
  };
}[EngineMethod];

// `project.open` carries manifest bytes read and stabilized by Electron Main,
// so it is not an EngineInvocation that Renderer may construct. C++ parses
// exactly this snapshot instead of reopening a mutable native path.
export type OpenProjectBackendInvocation = {
  method: 'project.open';
  params: {
    contents: string;
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
export type ImportAssetBackendInvocation = {
  method: 'asset.import';
  params: {
    kind: 'image' | 'video' | 'audio';
    sourceFilePath: string;
    projectFilePath: string;
  };
};

export type BackendInvocation =
  | EngineInvocation
  | OpenProjectBackendInvocation
  | SaveProjectBackendInvocation
  | ImportAssetBackendInvocation;

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
  setDialogueVoice(
    params: SetDialogueVoiceParams,
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
  addBackground(
    params: AddBackgroundParams,
  ): Promise<EngineMutationResult>;
  updateBackground(
    params: UpdateBackgroundParams,
  ): Promise<EngineMutationResult>;
  deleteBackground(
    params: DeleteBackgroundParams,
  ): Promise<EngineMutationResult>;
  reorderBackground(
    params: ReorderBackgroundParams,
  ): Promise<EngineMutationResult>;
  addCharacter(
    params: AddCharacterParams,
  ): Promise<EngineMutationResult>;
  updateCharacter(
    params: UpdateCharacterParams,
  ): Promise<EngineMutationResult>;
  addSceneJump(
    params: AddSceneJumpParams,
  ): Promise<EngineMutationResult>;
  updateSceneJump(
    params: UpdateSceneJumpParams,
  ): Promise<EngineMutationResult>;
  addBgm(
    params: AddBgmParams,
  ): Promise<EngineMutationResult>;
  updateBgm(
    params: UpdateBgmParams,
  ): Promise<EngineMutationResult>;
  addVideo(
    params: AddVideoParams,
  ): Promise<EngineMutationResult>;
  updateVideo(
    params: UpdateVideoParams,
  ): Promise<EngineMutationResult>;
  addChoice(
    params: AddChoiceParams,
  ): Promise<EngineMutationResult>;
  addChoiceOption(
    params: AddChoiceOptionParams,
  ): Promise<EngineMutationResult>;
  updateChoiceOption(
    params: UpdateChoiceOptionParams,
  ): Promise<EngineMutationResult>;
  deleteChoiceOption(
    params: DeleteChoiceOptionParams,
  ): Promise<EngineMutationResult>;
  reorderChoiceOption(
    params: ReorderChoiceOptionParams,
  ): Promise<EngineMutationResult>;
  deleteTimelineNodes(
    params: TimelineDeleteManyParams,
  ): Promise<EngineMutationResult>;
  reorderTimelineNode(
    params: TimelineReorderParams,
  ): Promise<EngineMutationResult>;
  reorderTimelineNodes(
    params: TimelineReorderManyParams,
  ): Promise<EngineMutationResult>;
};

export const ENGINE_IPC_CHANNEL = 'vn-engine:request';
