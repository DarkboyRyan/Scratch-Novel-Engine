import type { VnEngineApi } from '../../shared/engineProtocol';
import type {
  AddBackgroundAction,
  AddBgmAction,
  AddCharacterAction,
  AddChoiceAction,
  AddChoiceOptionAction,
  AddDialogueAction,
  AddSceneJumpAction,
  AddVideoAction,
  DeleteBackgroundAction,
  DeleteChoiceOptionAction,
  DeleteDialoguesAction,
  DeleteTimelineNodesAction,
  EngineMutationRunner,
  ReorderBackgroundAction,
  ReorderChoiceOptionAction,
  ReorderDialogueAction,
  ReorderDialoguesAction,
  ReorderTimelineNodeAction,
  ReorderTimelineNodesAction,
  SetDialogueVoiceAction,
  UpdateBackgroundAction,
  UpdateBgmAction,
  UpdateCharacterAction,
  UpdateChoiceOptionAction,
  UpdateDialogueAction,
  UpdateSceneJumpAction,
  UpdateVideoAction,
} from './authoringPorts';

export type AuthoringActions = {
  addDialogue: AddDialogueAction;
  updateDialogue: UpdateDialogueAction;
  setDialogueVoice: SetDialogueVoiceAction;
  reorderDialogue: ReorderDialogueAction;
  reorderDialogues: ReorderDialoguesAction;
  deleteDialogues: DeleteDialoguesAction;
  addBackground: AddBackgroundAction;
  updateBackground: UpdateBackgroundAction;
  deleteBackground: DeleteBackgroundAction;
  reorderBackground: ReorderBackgroundAction;
  addCharacter: AddCharacterAction;
  updateCharacter: UpdateCharacterAction;
  addSceneJump: AddSceneJumpAction;
  updateSceneJump: UpdateSceneJumpAction;
  addBgm: AddBgmAction;
  updateBgm: UpdateBgmAction;
  addVideo: AddVideoAction;
  updateVideo: UpdateVideoAction;
  addChoice: AddChoiceAction;
  addChoiceOption: AddChoiceOptionAction;
  updateChoiceOption: UpdateChoiceOptionAction;
  deleteChoiceOption: DeleteChoiceOptionAction;
  reorderChoiceOption: ReorderChoiceOptionAction;
  deleteTimelineNodes: DeleteTimelineNodesAction;
  reorderTimelineNode: ReorderTimelineNodeAction;
  reorderTimelineNodes: ReorderTimelineNodesAction;
};

type CreateAuthoringActionsOptions = {
  commands: VnEngineApi;
  run: EngineMutationRunner;
  onSceneJumpUnavailable(): void;
};

// Maps feature-facing boolean actions onto the result-returning engine port.
// Queueing, snapshot application, and error translation remain owned by the
// injected runner, so this mapping is deterministic and easy to fake in tests.
export function createAuthoringActions({
  commands,
  run,
  onSceneJumpUnavailable,
}: CreateAuthoringActionsOptions): AuthoringActions {
  const succeeds = async (
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> => (await run(action)) !== null;

  return {
    addDialogue: (params) =>
      succeeds(() => commands.addDialogue(params)),
    updateDialogue: (sceneId, nodeId, speaker, text) =>
      succeeds(() =>
        commands.updateDialogue(sceneId, nodeId, speaker, text),
      ),
    setDialogueVoice: (params) =>
      succeeds(() => commands.setDialogueVoice(params)),
    reorderDialogue: (params) =>
      succeeds(() => commands.reorderDialogue(params)),
    reorderDialogues: (params) =>
      succeeds(() => commands.reorderDialogues(params)),
    deleteDialogues: (params) =>
      succeeds(() => commands.deleteDialogues(params)),
    addBackground: (params) =>
      succeeds(() => commands.addBackground(params)),
    updateBackground: (params) =>
      succeeds(() => commands.updateBackground(params)),
    deleteBackground: (params) =>
      succeeds(() => commands.deleteBackground(params)),
    reorderBackground: (params) =>
      succeeds(() => commands.reorderBackground(params)),
    addCharacter: (params) =>
      succeeds(() => commands.addCharacter(params)),
    updateCharacter: (params) =>
      succeeds(() => commands.updateCharacter(params)),
    addSceneJump: (params) => {
      if (typeof commands.addSceneJump !== 'function') {
        onSceneJumpUnavailable();
        return Promise.resolve(false);
      }
      return succeeds(() => commands.addSceneJump(params));
    },
    updateSceneJump: (params) => {
      if (typeof commands.updateSceneJump !== 'function') {
        onSceneJumpUnavailable();
        return Promise.resolve(false);
      }
      return succeeds(() => commands.updateSceneJump(params));
    },
    addBgm: (params) => succeeds(() => commands.addBgm(params)),
    updateBgm: (params) => succeeds(() => commands.updateBgm(params)),
    addVideo: (params) => succeeds(() => commands.addVideo(params)),
    updateVideo: (params) =>
      succeeds(() => commands.updateVideo(params)),
    addChoice: (params) => succeeds(() => commands.addChoice(params)),
    addChoiceOption: (params) =>
      succeeds(() => commands.addChoiceOption(params)),
    updateChoiceOption: (params) =>
      succeeds(() => commands.updateChoiceOption(params)),
    deleteChoiceOption: (params) =>
      succeeds(() => commands.deleteChoiceOption(params)),
    reorderChoiceOption: (params) =>
      succeeds(() => commands.reorderChoiceOption(params)),
    deleteTimelineNodes: (params) =>
      succeeds(() => commands.deleteTimelineNodes(params)),
    reorderTimelineNode: (params) =>
      succeeds(() => commands.reorderTimelineNode(params)),
    reorderTimelineNodes: (params) =>
      succeeds(() => commands.reorderTimelineNodes(params)),
  };
}
