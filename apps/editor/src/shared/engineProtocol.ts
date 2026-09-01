// 主要作用：定义 C++、Main、Preload 与 Renderer 共用的引擎命令协议。
// 关键实现：以方法到参数映射生成严格 Invocation、Response 和 VnEngineApi 类型。
import type {
  AssetDocument,
  CharacterEffect,
  CharacterMode,
  CharacterPosition,
  CharacterSlot,
  LogicCondition,
  LogicValue,
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
  // Omitted and empty author fields are equivalent; neither gains defaults.
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
  scalePercent: number;
};

export type AddCharacterParams = {
  sceneId: string;
  mode?: CharacterMode;
  assetId?: string | null;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateCharacterParams = {
  sceneId: string;
  nodeId: string;
  mode?: CharacterMode;
  assetId: string | null;
  slot: CharacterSlot;
  layer: number;
  position: CharacterPosition | null;
  scalePercent: number;
};

export type UpdateCharacterEffectParams = {
  sceneId: string;
  nodeId: string;
  effect: CharacterEffect | null;
};

export type MoveCharacterEffectParams = {
  sceneId: string;
  fromNodeId: string;
  toNodeId: string;
  effect: CharacterEffect;
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

export type UpdateStartScreenParams = {
  title: string;
  eyebrow: string;
  backgroundAssetId: string | null;
  musicAssetId: string | null;
};

export type UpdateCgGalleryParams = {
  pages: ProjectDocument['cgGallery']['pages'];
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

export type AddCgDisplayParams = {
  sceneId: string;
  assetId: string;
  leadInMs: number;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateCgDisplayParams = {
  sceneId: string;
  nodeId: string;
  assetId: string;
  leadInMs: number;
};

export type DeleteCgDisplayParams = {
  sceneId: string;
  nodeId: string;
};

export type ReorderCgDisplayParams = {
  sceneId: string;
  nodeId: string;
  beforeNodeId: string | null;
};

export type AddChoiceParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type AddStoryExtensionParams = {
  sceneId: string;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type AddVariableSetParams = {
  sceneId: string;
  variableName: string;
  value: LogicValue;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateVariableSetParams = {
  sceneId: string;
  nodeId: string;
  variableName: string;
  value: LogicValue;
};

export type AddVariableChangeParams = {
  sceneId: string;
  variableName: string;
  amount: number;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateVariableChangeParams = {
  sceneId: string;
  nodeId: string;
  variableName: string;
  amount: number;
};

export type AddLogicIfParams = {
  sceneId: string;
  condition: LogicCondition;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateLogicIfParams = {
  sceneId: string;
  nodeId: string;
  condition: LogicCondition;
};

export type AddLogicRepeatParams = {
  sceneId: string;
  count: number;
  afterNodeId?: string | null;
  beforeNodeId?: string | null;
};

export type UpdateLogicRepeatParams = {
  sceneId: string;
  nodeId: string;
  count: number;
};

export type DeleteLogicControlParams = {
  sceneId: string;
  nodeId: string;
};

export type ReorderLogicControlParams = {
  sceneId: string;
  nodeId: string;
  beforeNodeId: string | null;
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
  'startScreen.update',
  'cgGallery.update',
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
  'characterEffect.update',
  'characterEffect.move',
  'sceneJump.add',
  'sceneJump.update',
  'bgm.add',
  'bgm.update',
  'video.add',
  'video.update',
  'cgDisplay.add',
  'cgDisplay.update',
  'cgDisplay.delete',
  'cgDisplay.reorder',
  'choice.add',
  'choice.option.add',
  'choice.option.update',
  'choice.option.delete',
  'choice.option.reorder',
  'storyExtension.add',
  'variableSet.add',
  'variableSet.update',
  'variableChange.add',
  'variableChange.update',
  'logicIf.add',
  'logicIf.update',
  'logicRepeat.add',
  'logicRepeat.update',
  'logicControl.delete',
  'logicControl.reorder',
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
  'startScreen.update': UpdateStartScreenParams;
  'cgGallery.update': UpdateCgGalleryParams;
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
    scalePercent: number;
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
  'characterEffect.update': UpdateCharacterEffectParams;
  'characterEffect.move': MoveCharacterEffectParams;
  'sceneJump.add': AddSceneJumpParams;
  'sceneJump.update': UpdateSceneJumpParams;
  'bgm.add': AddBgmParams;
  'bgm.update': UpdateBgmParams;
  'video.add': AddVideoParams;
  'video.update': UpdateVideoParams;
  'cgDisplay.add': AddCgDisplayParams;
  'cgDisplay.update': UpdateCgDisplayParams;
  'cgDisplay.delete': DeleteCgDisplayParams;
  'cgDisplay.reorder': ReorderCgDisplayParams;
  'choice.add': AddChoiceParams;
  'choice.option.add': AddChoiceOptionParams;
  'choice.option.update': UpdateChoiceOptionParams;
  'choice.option.delete': DeleteChoiceOptionParams;
  'choice.option.reorder': ReorderChoiceOptionParams;
  'storyExtension.add': AddStoryExtensionParams;
  'variableSet.add': AddVariableSetParams;
  'variableSet.update': UpdateVariableSetParams;
  'variableChange.add': AddVariableChangeParams;
  'variableChange.update': UpdateVariableChangeParams;
  'logicIf.add': AddLogicIfParams;
  'logicIf.update': UpdateLogicIfParams;
  'logicRepeat.add': AddLogicRepeatParams;
  'logicRepeat.update': UpdateLogicRepeatParams;
  'logicControl.delete': DeleteLogicControlParams;
  'logicControl.reorder': ReorderLogicControlParams;
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
  // Renderer must refuse scale-bearing writes when an older live Preload is
  // still attached after HMR; otherwise the extra arguments can be dropped
  // silently and persisted as the backend default.
  readonly imageScaleContractVersion?: 1;
  ensureProject(): Promise<EngineMutationResult>;
  getProject(): Promise<EngineMutationResult>;
  renameProject(name: string): Promise<EngineMutationResult>;
  updateStartScreen(
    params: UpdateStartScreenParams,
  ): Promise<EngineMutationResult>;
  updateCgGallery(
    pages: ProjectDocument['cgGallery']['pages'],
  ): Promise<EngineMutationResult>;
  addScene(name?: string): Promise<EngineMutationResult>;
  renameScene(
    sceneId: string,
    name: string,
  ): Promise<EngineMutationResult>;
  deleteScene(sceneId: string): Promise<EngineMutationResult>;
  setSceneBackground(
    sceneId: string,
    assetId: string | null,
    scalePercent: number,
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
  updateCharacterEffect(
    params: UpdateCharacterEffectParams,
  ): Promise<EngineMutationResult>;
  moveCharacterEffect(
    params: MoveCharacterEffectParams,
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
  addCgDisplay(
    params: AddCgDisplayParams,
  ): Promise<EngineMutationResult>;
  updateCgDisplay(
    params: UpdateCgDisplayParams,
  ): Promise<EngineMutationResult>;
  deleteCgDisplay(
    params: DeleteCgDisplayParams,
  ): Promise<EngineMutationResult>;
  reorderCgDisplay(
    params: ReorderCgDisplayParams,
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
  addStoryExtension(
    params: AddStoryExtensionParams,
  ): Promise<EngineMutationResult>;
  addVariableSet(
    params: AddVariableSetParams,
  ): Promise<EngineMutationResult>;
  updateVariableSet(
    params: UpdateVariableSetParams,
  ): Promise<EngineMutationResult>;
  addVariableChange(
    params: AddVariableChangeParams,
  ): Promise<EngineMutationResult>;
  updateVariableChange(
    params: UpdateVariableChangeParams,
  ): Promise<EngineMutationResult>;
  addLogicIf(
    params: AddLogicIfParams,
  ): Promise<EngineMutationResult>;
  updateLogicIf(
    params: UpdateLogicIfParams,
  ): Promise<EngineMutationResult>;
  addLogicRepeat(
    params: AddLogicRepeatParams,
  ): Promise<EngineMutationResult>;
  updateLogicRepeat(
    params: UpdateLogicRepeatParams,
  ): Promise<EngineMutationResult>;
  deleteLogicControl(
    params: DeleteLogicControlParams,
  ): Promise<EngineMutationResult>;
  reorderLogicControl(
    params: ReorderLogicControlParams,
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
