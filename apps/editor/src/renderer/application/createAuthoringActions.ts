/**
 * 文件主要作用：把 Engine API 封装成带错误处理和项目刷新的创作动作。
 * 包含实现：`AuthoringActions`、`createAuthoringActions`。
 */

import type { VnEngineApi } from '../../shared/engineProtocol';
import type {
  AddBackgroundAction,
  AddBgmAction,
  AddCharacterAction,
  AddChoiceAction,
  AddChoiceOptionAction,
  AddCgDisplayAction,
  AddDialogueAction,
  AddLogicIfAction,
  AddLogicRepeatAction,
  AddSceneJumpAction,
  AddStoryExtensionAction,
  AddVariableChangeAction,
  AddVariableSetAction,
  AddVideoAction,
  DeleteBackgroundAction,
  DeleteChoiceOptionAction,
  DeleteCgDisplayAction,
  DeleteDialoguesAction,
  DeleteTimelineNodesAction,
  DeleteLogicControlAction,
  EngineMutationRunner,
  MoveCharacterEffectAction,
  ReorderBackgroundAction,
  ReorderChoiceOptionAction,
  ReorderCgDisplayAction,
  ReorderDialogueAction,
  ReorderDialoguesAction,
  ReorderTimelineNodeAction,
  ReorderTimelineNodesAction,
  ReorderLogicControlAction,
  SetDialogueVoiceAction,
  UpdateBackgroundAction,
  UpdateBgmAction,
  UpdateCharacterAction,
  UpdateCharacterEffectAction,
  UpdateChoiceOptionAction,
  UpdateCgDisplayAction,
  UpdateDialogueAction,
  UpdateLogicIfAction,
  UpdateLogicRepeatAction,
  UpdateSceneJumpAction,
  UpdateVideoAction,
  UpdateVariableChangeAction,
  UpdateVariableSetAction,
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
  updateCharacterEffect: UpdateCharacterEffectAction;
  moveCharacterEffect: MoveCharacterEffectAction;
  addSceneJump: AddSceneJumpAction;
  addStoryExtension: AddStoryExtensionAction;
  addVariableSet: AddVariableSetAction;
  updateVariableSet: UpdateVariableSetAction;
  addVariableChange: AddVariableChangeAction;
  updateVariableChange: UpdateVariableChangeAction;
  addLogicIf: AddLogicIfAction;
  updateLogicIf: UpdateLogicIfAction;
  addLogicRepeat: AddLogicRepeatAction;
  updateLogicRepeat: UpdateLogicRepeatAction;
  deleteLogicControl: DeleteLogicControlAction;
  reorderLogicControl: ReorderLogicControlAction;
  addCgDisplay: AddCgDisplayAction;
  updateCgDisplay: UpdateCgDisplayAction;
  deleteCgDisplay: DeleteCgDisplayAction;
  reorderCgDisplay: ReorderCgDisplayAction;
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
  onStoryExtensionUnavailable(): void;
  onLogicModuleUnavailable(): void;
  onCgDisplayModuleUnavailable?(): void;
  onCharacterEffectModuleUnavailable?(): void;
};

// Maps feature-facing boolean actions onto the result-returning engine port.
// Queueing, snapshot application, and error translation remain owned by the
// injected runner, so this mapping is deterministic and easy to fake in tests.
export function createAuthoringActions({
  commands,
  run,
  onSceneJumpUnavailable,
  onStoryExtensionUnavailable,
  onLogicModuleUnavailable,
  onCgDisplayModuleUnavailable,
  onCharacterEffectModuleUnavailable,
}: CreateAuthoringActionsOptions): AuthoringActions {
  const succeeds = async (
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> => (await run(action)) !== null;
  const succeedsWithCharacterModeCommand = (
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> =>
    succeeds(async () => {
      try {
        return await action();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.toLowerCase();
        const isStaleModule =
          normalizedMessage.includes('invalid engine invocation') ||
          normalizedMessage.includes('invalid engine request') ||
          normalizedMessage.includes('unknown params') ||
          normalizedMessage.includes('unknown parameter') ||
          normalizedMessage.includes('unknown field') ||
          normalizedMessage.includes('unknown property') ||
          normalizedMessage.includes('unexpected field') ||
          normalizedMessage.includes('unexpected property') ||
          message.includes('无效的引擎请求');
        if (isStaleModule) {
          throw new Error(`[character-mode-module] ${message}`, {
            cause: error,
          });
        }
        throw error;
      }
    });
  const succeedsWithLogicCommand = (
    command: unknown,
    method: string,
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> => {
    if (typeof command !== 'function') {
      onLogicModuleUnavailable();
      return Promise.resolve(false);
    }
    return succeeds(async () => {
      try {
        return await action();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const isStaleModule =
          message.includes('No handler registered') ||
          message.includes(`unknown method: ${method}`) ||
          message.includes('invalid engine invocation') ||
          message.includes('invalid engine request') ||
          message.includes('无效的引擎请求');
        if (isStaleModule) {
          throw new Error(`[logic-module] ${message}`, { cause: error });
        }
        throw error;
      }
    });
  };
  const succeedsWithCgDisplayCommand = (
    command: unknown,
    method: string,
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> => {
    if (typeof command !== 'function') {
      onCgDisplayModuleUnavailable?.();
      return Promise.resolve(false);
    }
    return succeeds(async () => {
      try {
        return await action();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const isStaleModule =
          message.includes('No handler registered') ||
          message.includes(`unknown method: ${method}`) ||
          message.includes('invalid engine invocation') ||
          message.includes('invalid engine request') ||
          message.includes('无效的引擎请求');
        if (isStaleModule) {
          throw new Error(`[cg-display-module] ${message}`, { cause: error });
        }
        throw error;
      }
    });
  };
  const succeedsWithCharacterEffectCommand = (
    command: unknown,
    method: string,
    action: Parameters<EngineMutationRunner>[0],
  ): Promise<boolean> => {
    if (typeof command !== 'function') {
      onCharacterEffectModuleUnavailable?.();
      return Promise.resolve(false);
    }
    return succeeds(async () => {
      try {
        return await action();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const isStaleModule =
          message.includes('No handler registered') ||
          message.includes(`unknown method: ${method}`) ||
          message.includes('invalid engine invocation') ||
          message.includes('invalid engine request') ||
          message.includes('无效的引擎请求');
        if (isStaleModule) {
          throw new Error(`[character-effect-module] ${message}`, {
            cause: error,
          });
        }
        throw error;
      }
    });
  };

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
      succeedsWithCharacterModeCommand(() => commands.addCharacter(params)),
    updateCharacter: (params) =>
      succeedsWithCharacterModeCommand(() =>
        commands.updateCharacter(params)),
    updateCharacterEffect: (params) =>
      succeedsWithCharacterEffectCommand(
        commands.updateCharacterEffect,
        'characterEffect.update',
        () => commands.updateCharacterEffect(params),
      ),
    moveCharacterEffect: (params) =>
      succeedsWithCharacterEffectCommand(
        commands.moveCharacterEffect,
        'characterEffect.move',
        () => commands.moveCharacterEffect(params),
      ),
    addSceneJump: (params) => {
      if (typeof commands.addSceneJump !== 'function') {
        onSceneJumpUnavailable();
        return Promise.resolve(false);
      }
      return succeeds(() => commands.addSceneJump(params));
    },
    addStoryExtension: (params) => {
      if (typeof commands.addStoryExtension !== 'function') {
        onStoryExtensionUnavailable();
        return Promise.resolve(false);
      }
      return succeeds(() => commands.addStoryExtension(params));
    },
    addVariableSet: (params) =>
      succeedsWithLogicCommand(commands.addVariableSet, 'variableSet.add', () =>
        commands.addVariableSet(params)),
    updateVariableSet: (params) =>
      succeedsWithLogicCommand(commands.updateVariableSet, 'variableSet.update', () =>
        commands.updateVariableSet(params)),
    addVariableChange: (params) =>
      succeedsWithLogicCommand(commands.addVariableChange, 'variableChange.add', () =>
        commands.addVariableChange(params)),
    updateVariableChange: (params) =>
      succeedsWithLogicCommand(commands.updateVariableChange, 'variableChange.update', () =>
        commands.updateVariableChange(params)),
    addLogicIf: (params) =>
      succeedsWithLogicCommand(commands.addLogicIf, 'logicIf.add', () =>
        commands.addLogicIf(params)),
    updateLogicIf: (params) =>
      succeedsWithLogicCommand(commands.updateLogicIf, 'logicIf.update', () =>
        commands.updateLogicIf(params)),
    addLogicRepeat: (params) =>
      succeedsWithLogicCommand(commands.addLogicRepeat, 'logicRepeat.add', () =>
        commands.addLogicRepeat(params)),
    updateLogicRepeat: (params) =>
      succeedsWithLogicCommand(commands.updateLogicRepeat, 'logicRepeat.update', () =>
        commands.updateLogicRepeat(params)),
    deleteLogicControl: (params) =>
      succeedsWithLogicCommand(commands.deleteLogicControl, 'logicControl.delete', () =>
        commands.deleteLogicControl(params)),
    reorderLogicControl: (params) =>
      succeedsWithLogicCommand(commands.reorderLogicControl, 'logicControl.reorder', () =>
        commands.reorderLogicControl(params)),
    addCgDisplay: (params) =>
      succeedsWithCgDisplayCommand(commands.addCgDisplay, 'cgDisplay.add', () =>
        commands.addCgDisplay(params)),
    updateCgDisplay: (params) =>
      succeedsWithCgDisplayCommand(commands.updateCgDisplay, 'cgDisplay.update', () =>
        commands.updateCgDisplay(params)),
    deleteCgDisplay: (params) =>
      succeedsWithCgDisplayCommand(commands.deleteCgDisplay, 'cgDisplay.delete', () =>
        commands.deleteCgDisplay(params)),
    reorderCgDisplay: (params) =>
      succeedsWithCgDisplayCommand(commands.reorderCgDisplay, 'cgDisplay.reorder', () =>
        commands.reorderCgDisplay(params)),
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
    reorderTimelineNodes: (params) => {
      if (typeof commands.reorderTimelineNodes !== 'function') {
        onStoryExtensionUnavailable();
        return Promise.resolve(false);
      }
      return succeeds(() => commands.reorderTimelineNodes(params));
    },
  };
}
