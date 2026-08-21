import type {
  AddBackgroundParams,
  AddBgmParams,
  AddCharacterParams,
  AddChoiceOptionParams,
  AddChoiceParams,
  AddDialogueParams,
  AddSceneJumpParams,
  AddStoryExtensionParams,
  AddVideoParams,
  DeleteBackgroundParams,
  DeleteDialoguesParams,
  DeleteChoiceOptionParams,
  EngineMutationResult,
  ReorderBackgroundParams,
  ReorderDialogueParams,
  ReorderDialoguesParams,
  ReorderChoiceOptionParams,
  SetDialogueVoiceParams,
  TimelineDeleteManyParams,
  TimelineReorderManyParams,
  TimelineReorderParams,
  UpdateBackgroundParams,
  UpdateBgmParams,
  UpdateCharacterParams,
  UpdateChoiceOptionParams,
  UpdateSceneJumpParams,
  UpdateVideoParams,
  VnEngineApi,
} from '../../shared/engineProtocol';
import type { ProjectDocument } from '../../shared/projectTypes';

// Renderer features depend on these authoring ports instead of the concrete
// useEngineProject hook. App supplies the Electron-backed implementation.
export type AddDialogueAction = (params: AddDialogueParams) => Promise<boolean>;
export type UpdateDialogueAction = (
  sceneId: string,
  nodeId: string,
  speaker: string,
  text: string,
) => Promise<boolean>;
export type SetDialogueVoiceAction = (
  params: SetDialogueVoiceParams,
) => Promise<boolean>;
export type ReorderDialogueAction = (
  params: ReorderDialogueParams,
) => Promise<boolean>;
export type ReorderDialoguesAction = (
  params: ReorderDialoguesParams,
) => Promise<boolean>;
export type DeleteDialoguesAction = (
  params: DeleteDialoguesParams,
) => Promise<boolean>;
export type AddBackgroundAction = (
  params: AddBackgroundParams,
) => Promise<boolean>;
export type UpdateBackgroundAction = (
  params: UpdateBackgroundParams,
) => Promise<boolean>;
export type AddCharacterAction = (
  params: AddCharacterParams,
) => Promise<boolean>;
export type UpdateCharacterAction = (
  params: UpdateCharacterParams,
) => Promise<boolean>;
export type AddSceneJumpAction = (
  params: AddSceneJumpParams,
) => Promise<boolean>;
export type AddStoryExtensionAction = (
  params: AddStoryExtensionParams,
) => Promise<boolean>;
export type UpdateSceneJumpAction = (
  params: UpdateSceneJumpParams,
) => Promise<boolean>;
export type AddBgmAction = (params: AddBgmParams) => Promise<boolean>;
export type UpdateBgmAction = (params: UpdateBgmParams) => Promise<boolean>;
export type AddVideoAction = (params: AddVideoParams) => Promise<boolean>;
export type UpdateVideoAction = (
  params: UpdateVideoParams,
) => Promise<boolean>;
export type AddChoiceAction = (params: AddChoiceParams) => Promise<boolean>;
export type AddChoiceOptionAction = (
  params: AddChoiceOptionParams,
) => Promise<boolean>;
export type UpdateChoiceOptionAction = (
  params: UpdateChoiceOptionParams,
) => Promise<boolean>;
export type DeleteChoiceOptionAction = (
  params: DeleteChoiceOptionParams,
) => Promise<boolean>;
export type ReorderChoiceOptionAction = (
  params: ReorderChoiceOptionParams,
) => Promise<boolean>;
export type DeleteBackgroundAction = (
  params: DeleteBackgroundParams,
) => Promise<boolean>;
export type ReorderBackgroundAction = (
  params: ReorderBackgroundParams,
) => Promise<boolean>;
export type DeleteTimelineNodesAction = (
  params: TimelineDeleteManyParams,
) => Promise<boolean>;
export type ReorderTimelineNodeAction = (
  params: TimelineReorderParams,
) => Promise<boolean>;
export type ReorderTimelineNodesAction = (
  params: TimelineReorderManyParams,
) => Promise<boolean>;

export type EngineMutationRunner = (
  action: () => Promise<EngineMutationResult>,
) => Promise<EngineMutationResult | null>;

// The form controller needs mutation results so it can select IDs allocated by
// C++. It receives this narrow command port plus the serialized runner; it does
// not know whether commands are backed by Electron, HTTP, or an in-memory fake.
export type FormEditorCommands = Pick<
  VnEngineApi,
  | 'addScene'
  | 'addDialogue'
  | 'updateDialogue'
  | 'addBackground'
  | 'updateBackground'
  | 'addCharacter'
  | 'updateCharacter'
  | 'addSceneJump'
  | 'updateSceneJump'
  | 'addBgm'
  | 'updateBgm'
  | 'updateVideo'
  | 'setDialogueVoice'
  | 'deleteTimelineNodes'
  | 'reorderTimelineNode'
>;

export type FormEditorPort = {
  project: ProjectDocument | null;
  isBusy: boolean;
  engineMessage: string;
  setEngineMessage(message: string): void;
  runEngineAction: EngineMutationRunner;
  authoringCommands: FormEditorCommands;
};
