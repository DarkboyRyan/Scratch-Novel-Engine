/**
 * 文件主要作用：管理故事 Blockly 工作区生命周期、投影、拖拽事件与引擎命令同步。
 * 包含实现：`BlocklyWorkspaceHandle`、`BlocklyWorkspace`。
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as Blockly from 'blockly';

import type {
  AssetDocument,
  SceneDocument,
} from '../../../shared/projectTypes';
import type {
  AddBackgroundAction,
  AddDialogueAction,
  AddCharacterAction,
  AddSceneJumpAction,
  AddBgmAction,
  AddVideoAction,
  AddChoiceAction,
  AddChoiceOptionAction,
  AddStoryExtensionAction,
  DeleteTimelineNodesAction,
  DeleteChoiceOptionAction,
  ReorderTimelineNodeAction,
  ReorderTimelineNodesAction,
  UpdateBackgroundAction,
  UpdateDialogueAction,
  UpdateCharacterAction,
  UpdateCharacterEffectAction,
  MoveCharacterEffectAction,
  UpdateSceneJumpAction,
  UpdateBgmAction,
  UpdateVideoAction,
  UpdateChoiceOptionAction,
  ReorderChoiceOptionAction,
  SetDialogueVoiceAction,
  AddVariableSetAction,
  UpdateVariableSetAction,
  AddVariableChangeAction,
  UpdateVariableChangeAction,
  AddLogicIfAction,
  UpdateLogicIfAction,
  AddLogicRepeatAction,
  UpdateLogicRepeatAction,
  DeleteLogicControlAction,
  ReorderLogicControlAction,
  AddCgDisplayAction,
  UpdateCgDisplayAction,
  DeleteCgDisplayAction,
  ReorderCgDisplayAction,
} from '../../application/authoringPorts';
import {
  VN_AUDIO_ASSET_DRAG_TYPE,
  VN_IMAGE_ASSET_DRAG_TYPE,
  VN_VIDEO_ASSET_DRAG_TYPE,
} from '../assets/assetDragTypes';
import {
  applyBackgroundBlockLocalization,
  BACKGROUND_BLOCK_TYPE,
  registerBackgroundBlock,
} from './blocks/backgroundBlock';
import {
  applyCharacterBlockLocalization,
  CHARACTER_BLOCK_FIELDS,
  CHARACTER_BLOCK_TYPE,
  CLEAR_CHARACTER_BLOCK_TYPE,
  getCharacterBlockLayer,
  getCharacterBlockSlot,
  isCharacterBlockType,
  registerCharacterBlock,
} from './blocks/characterBlock';
import {
  applyDialogueBlockLocalization,
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  registerDialogueBlock,
} from './blocks/dialogueBlock';
import {
  applyBgmBlockLocalization,
  BGM_BLOCK_FIELDS,
  BGM_BLOCK_TYPE,
  registerBgmBlock,
} from './blocks/bgmBlock';
import {
  applyVideoBlockLocalization,
  VIDEO_BLOCK_FIELDS,
  VIDEO_BLOCK_TYPE,
  registerVideoBlock,
} from './blocks/videoBlock';
import {
  applyChoiceBlockLocalization,
  CHOICE_BLOCK_TYPE,
  CHOICE_OPTION_BLOCK_TYPE,
  registerChoiceBlocks,
  setChoiceOptionSceneOptions,
} from './blocks/choiceBlock';
import {
  collectChoiceOptionFieldDrafts,
  findChoiceOption,
  getChoiceOptionFieldUpdate,
  getNewChoiceOptionDropResolution,
  getReorderedChoiceOptionBlock,
  isChoiceOptionOutsideOwningChoice,
} from './choiceBlockEvents';
import {
  collectDialogueFieldDrafts,
  getDialogueFieldUpdate,
  getDroppedNewDialogueBlock,
  getNewStoryExtensionDropResolution,
  getTimelineBeforeNodeIdForBlock,
  getTimelineReorderDropResolution,
} from './dialogueBlockEvents';
import {
  createBlockSelectionController,
  getBlockClientRectangle,
  type BlockSelectionController,
} from './blockSelection';
import {
  createBlockGroupDragController,
  type BlockGroupDragController,
} from './blockGroupDrag';
import {
  captureSceneWorkspaceLayout,
  type BlockEditorLayoutStore,
  restoreSceneWorkspaceViewport,
} from './blockEditorLayout';
import { EngineTrashcan } from './EngineTrashcan';
import { projectSceneToWorkspace } from './projectSceneToWorkspace';
import { createBlockEditorToolbox } from './toolbox';
import {
  collectBackgroundFieldDrafts,
  getBackgroundFieldUpdate,
} from './backgroundBlockEvents';
import {
  collectCharacterFieldDrafts,
  getCharacterFieldUpdate,
  resolveNewCharacterPlacement,
} from './characterBlockEvents';
import {
  applySceneJumpBlockLocalization,
  SCENE_JUMP_BLOCK_FIELDS,
  SCENE_JUMP_BLOCK_TYPE,
  registerSceneJumpBlock,
  setSceneJumpBlockOptions,
} from './blocks/sceneJumpBlock';
import {
  applyStoryContinuationBlockLocalization,
  registerStoryContinuationBlock,
  STORY_CONTINUATION_BLOCK_TYPE,
} from './blocks/storyContinuationBlock';
import {
  applySceneStartBlockLocalization,
  getSceneStartBlockId,
  registerSceneStartBlock,
  SCENE_START_BLOCK_TYPE,
} from './blocks/sceneStartBlock';
import {
  collectStoryContinuationSequenceDraft,
  getStoryContinuationSequenceUpdate,
} from './storyContinuationBlockEvents';
import { getSceneJumpFieldUpdate } from './sceneJumpBlockEvents';
import { STORY_BLOCK_TYPES } from './storyBlockTypes';
import { paginateStoryNodes } from './storyBlockPagination';
import { installInlineZoomControlIcons } from './zoomControlIcons';
import { useEditorLabels } from '../../i18n/editorLocalization';
import {
  applyLogicControlBlockLocalization,
  LOGIC_IF_BLOCK_TYPE,
  LOGIC_REPEAT_BLOCK_TYPE,
  registerLogicControlBlocks,
} from './blocks/logicControlBlock';
import {
  applyVariableBlockLocalization,
  registerVariableBlocks,
  setVariableBlockProjectScenes,
  VARIABLE_CHANGE_BLOCK_TYPE,
  VARIABLE_SET_BLOCK_TYPE,
} from './blocks/variableBlock';
import {
  collectLogicFieldDrafts,
  getLogicControlDeleteResolution,
  getLogicControlReorderResolution,
  getLogicFieldUpdate,
  getNewLogicBlockDrop,
  type LogicFieldDraft,
} from './logicBlockEvents';
import {
  applyCgDisplayBlockLocalization,
  CG_DISPLAY_BLOCK_TYPE,
  registerCgDisplayBlock,
  setCgDisplayImageOptions,
} from './blocks/cgDisplayBlock';
import {
  collectCgDisplayFieldDrafts,
  getCgDisplayDeleteResolution,
  getCgDisplayFieldUpdate,
  getCgDisplayReorderResolution,
  getNewCgDisplayDrop,
  isInvalidCgDisplayBodyDrop,
  type CgDisplayFieldDraft,
} from './cgDisplayBlockEvents';
import {
  CharacterEffectConnectionChecker,
  applyCharacterEffectBlockLocalization,
  CHARACTER_EFFECT_BLOCK_TYPES,
  isCharacterEffectBlockType,
  registerCharacterEffectBlocks,
} from './blocks/characterEffectBlock';
import {
  collectCharacterEffectFieldDrafts,
  getCharacterEffectMutation,
  getCharacterEffectOwnerForDelete,
} from './characterEffectBlockEvents';

// Blockly 默认值是 28，连接预览会在积木还离得较远时出现。
// 12 个工作区单位要求连接口真正靠近后才进入吸附候选。
const DIALOGUE_CONNECTION_SNAP_RADIUS = 12;

function isPointInsideField(
  block: Blockly.BlockSvg,
  fieldName: string,
  clientX: number,
  clientY: number,
): boolean {
  const fieldRoot = block.getField(fieldName)?.getSvgRoot();
  if (!fieldRoot) {
    return false;
  }
  const rectangle = fieldRoot.getBoundingClientRect();
  return (
    clientX >= rectangle.left &&
    clientX <= rectangle.right &&
    clientY >= rectangle.top &&
    clientY <= rectangle.bottom
  );
}

type BlocklyWorkspaceProps = {
  scene: SceneDocument;
  scenes: SceneDocument[];
  assets: AssetDocument[];
  layoutKey: string;
  layoutStore: BlockEditorLayoutStore;
  isBusy: boolean;
  onDialogueAdd: AddDialogueAction;
  onBackgroundAdd: AddBackgroundAction;
  onBackgroundUpdate: UpdateBackgroundAction;
  onCharacterAdd: AddCharacterAction;
  onCharacterUpdate: UpdateCharacterAction;
  onCharacterEffectUpdate: UpdateCharacterEffectAction;
  onCharacterEffectMove: MoveCharacterEffectAction;
  onSceneJumpAdd: AddSceneJumpAction;
  onSceneJumpUpdate: UpdateSceneJumpAction;
  onBgmAdd: AddBgmAction;
  onBgmUpdate: UpdateBgmAction;
  onVideoAdd: AddVideoAction;
  onVideoUpdate: UpdateVideoAction;
  onChoiceAdd: AddChoiceAction;
  onChoiceOptionAdd: AddChoiceOptionAction;
  onStoryExtensionAdd: AddStoryExtensionAction;
  onVariableSetAdd: AddVariableSetAction;
  onVariableSetUpdate: UpdateVariableSetAction;
  onVariableChangeAdd: AddVariableChangeAction;
  onVariableChangeUpdate: UpdateVariableChangeAction;
  onLogicIfAdd: AddLogicIfAction;
  onLogicIfUpdate: UpdateLogicIfAction;
  onLogicRepeatAdd: AddLogicRepeatAction;
  onLogicRepeatUpdate: UpdateLogicRepeatAction;
  onLogicControlDelete: DeleteLogicControlAction;
  onLogicControlReorder: ReorderLogicControlAction;
  onCgDisplayAdd: AddCgDisplayAction;
  onCgDisplayUpdate: UpdateCgDisplayAction;
  onCgDisplayDelete: DeleteCgDisplayAction;
  onCgDisplayReorder: ReorderCgDisplayAction;
  onChoiceOptionUpdate: UpdateChoiceOptionAction;
  onChoiceOptionDelete: DeleteChoiceOptionAction;
  onChoiceOptionReorder: ReorderChoiceOptionAction;
  onDialogueVoiceUpdate: SetDialogueVoiceAction;
  onTimelineNodesDelete: DeleteTimelineNodesAction;
  onTimelineReorder: ReorderTimelineNodeAction;
  onTimelineNodesReorder: ReorderTimelineNodesAction;
  onDialogueUpdate: UpdateDialogueAction;
  onDraftDirtyChange: (isDirty: boolean) => void;
};

export type BlocklyWorkspaceHandle = {
  flushPendingDraft(): Promise<boolean>;
};

function setStoryBlocksInteractive(
  workspace: Blockly.WorkspaceSvg,
  interactive: boolean,
): void {
  // 锁定整个 workspace，才能同时阻止字段编辑、已有积木拖动，
  // 以及保存期间继续从 toolbox 拉出新积木。
  workspace.setIsReadOnly(!interactive);
  if (!interactive) {
    workspace.getToolbox()?.clearSelection();
  }

  const storyBlocks = [
    ...STORY_BLOCK_TYPES.flatMap((type) =>
      workspace.getBlocksByType(type, false),
    ),
    ...workspace.getBlocksByType(CHOICE_OPTION_BLOCK_TYPE, false),
    ...Object.values(CHARACTER_EFFECT_BLOCK_TYPES).flatMap((type) =>
      workspace.getBlocksByType(type, false),
    ),
  ];

  for (const block of storyBlocks) {
    block.setEditable(interactive);
    block.setMovable(
      interactive && block.type !== STORY_CONTINUATION_BLOCK_TYPE,
    );
    // 原生删除会先改画布；本项目统一由 C++ 成功后再重绘。
    block.setDeletable(false);
  }
}

export const BlocklyWorkspace = forwardRef<
  BlocklyWorkspaceHandle,
  BlocklyWorkspaceProps
>(function BlocklyWorkspace(
  {
    scene,
    scenes,
    assets,
    layoutKey,
    layoutStore,
    isBusy,
    onDialogueAdd,
    onBackgroundAdd,
    onBackgroundUpdate,
    onCharacterAdd,
    onCharacterUpdate,
    onCharacterEffectUpdate,
    onCharacterEffectMove,
    onSceneJumpAdd,
    onSceneJumpUpdate,
    onBgmAdd,
    onBgmUpdate,
    onVideoAdd,
    onVideoUpdate,
    onChoiceAdd,
    onChoiceOptionAdd,
    onStoryExtensionAdd,
    onVariableSetAdd,
    onVariableSetUpdate,
    onVariableChangeAdd,
    onVariableChangeUpdate,
    onLogicIfAdd,
    onLogicIfUpdate,
    onLogicRepeatAdd,
    onLogicRepeatUpdate,
    onLogicControlDelete,
    onLogicControlReorder,
    onCgDisplayAdd,
    onCgDisplayUpdate,
    onCgDisplayDelete,
    onCgDisplayReorder,
    onChoiceOptionUpdate,
    onChoiceOptionDelete,
    onChoiceOptionReorder,
    onDialogueVoiceUpdate,
    onTimelineNodesDelete,
    onTimelineReorder,
    onTimelineNodesReorder,
    onDialogueUpdate,
    onDraftDirtyChange,
  },
  ref,
) {
  const labels = useEditorLabels();
  const initialLabelsRef = useRef(labels);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const selectionRef = useRef<BlockSelectionController | null>(null);
  const groupDragRef = useRef<BlockGroupDragController | null>(null);
  const projectedSceneRef = useRef<{
    layoutKey: string;
    scene: SceneDocument;
  } | null>(null);

  // Listener 只注册一次，但始终需要读取最新 props。
  const sceneRef = useRef(scene);
  const assetsRef = useRef(assets);
  const scenesRef = useRef(scenes);
  const layoutKeyRef = useRef(layoutKey);
  const addDialogueRef = useRef(onDialogueAdd);
  const addBackgroundRef = useRef(onBackgroundAdd);
  const updateBackgroundRef = useRef(onBackgroundUpdate);
  const addCharacterRef = useRef(onCharacterAdd);
  const updateCharacterRef = useRef(onCharacterUpdate);
  const updateCharacterEffectRef = useRef(onCharacterEffectUpdate);
  const moveCharacterEffectRef = useRef(onCharacterEffectMove);
  const addSceneJumpRef = useRef(onSceneJumpAdd);
  const updateSceneJumpRef = useRef(onSceneJumpUpdate);
  const addBgmRef = useRef(onBgmAdd);
  const updateBgmRef = useRef(onBgmUpdate);
  const addVideoRef = useRef(onVideoAdd);
  const updateVideoRef = useRef(onVideoUpdate);
  const addChoiceRef = useRef(onChoiceAdd);
  const addChoiceOptionRef = useRef(onChoiceOptionAdd);
  const addStoryExtensionRef = useRef(onStoryExtensionAdd);
  const addVariableSetRef = useRef(onVariableSetAdd);
  const updateVariableSetRef = useRef(onVariableSetUpdate);
  const addVariableChangeRef = useRef(onVariableChangeAdd);
  const updateVariableChangeRef = useRef(onVariableChangeUpdate);
  const addLogicIfRef = useRef(onLogicIfAdd);
  const updateLogicIfRef = useRef(onLogicIfUpdate);
  const addLogicRepeatRef = useRef(onLogicRepeatAdd);
  const updateLogicRepeatRef = useRef(onLogicRepeatUpdate);
  const deleteLogicControlRef = useRef(onLogicControlDelete);
  const reorderLogicControlRef = useRef(onLogicControlReorder);
  const addCgDisplayRef = useRef(onCgDisplayAdd);
  const updateCgDisplayRef = useRef(onCgDisplayUpdate);
  const deleteCgDisplayRef = useRef(onCgDisplayDelete);
  const reorderCgDisplayRef = useRef(onCgDisplayReorder);
  const updateChoiceOptionRef = useRef(onChoiceOptionUpdate);
  const deleteChoiceOptionRef = useRef(onChoiceOptionDelete);
  const reorderChoiceOptionRef = useRef(onChoiceOptionReorder);
  const updateDialogueVoiceRef = useRef(onDialogueVoiceUpdate);
  const deleteTimelineNodesRef = useRef(onTimelineNodesDelete);
  const reorderTimelineRef = useRef(onTimelineReorder);
  const reorderTimelineNodesRef = useRef(onTimelineNodesReorder);
  const updateDialogueRef = useRef(onDialogueUpdate);
  const draftDirtyChangeRef = useRef(onDraftDirtyChange);
  const externalBusyRef = useRef(isBusy);
  const isSavingRef = useRef(false);
  const flushPendingDraftRef = useRef<() => Promise<boolean>>(async () => true);

  sceneRef.current = scene;
  assetsRef.current = assets;
  scenesRef.current = scenes;
  layoutKeyRef.current = layoutKey;
  addDialogueRef.current = onDialogueAdd;
  addBackgroundRef.current = onBackgroundAdd;
  updateBackgroundRef.current = onBackgroundUpdate;
  addCharacterRef.current = onCharacterAdd;
  updateCharacterRef.current = onCharacterUpdate;
  updateCharacterEffectRef.current = onCharacterEffectUpdate;
  moveCharacterEffectRef.current = onCharacterEffectMove;
  addSceneJumpRef.current = onSceneJumpAdd;
  updateSceneJumpRef.current = onSceneJumpUpdate;
  addBgmRef.current = onBgmAdd;
  updateBgmRef.current = onBgmUpdate;
  addVideoRef.current = onVideoAdd;
  updateVideoRef.current = onVideoUpdate;
  addChoiceRef.current = onChoiceAdd;
  addChoiceOptionRef.current = onChoiceOptionAdd;
  addStoryExtensionRef.current = onStoryExtensionAdd;
  addVariableSetRef.current = onVariableSetAdd;
  updateVariableSetRef.current = onVariableSetUpdate;
  addVariableChangeRef.current = onVariableChangeAdd;
  updateVariableChangeRef.current = onVariableChangeUpdate;
  addLogicIfRef.current = onLogicIfAdd;
  updateLogicIfRef.current = onLogicIfUpdate;
  addLogicRepeatRef.current = onLogicRepeatAdd;
  updateLogicRepeatRef.current = onLogicRepeatUpdate;
  deleteLogicControlRef.current = onLogicControlDelete;
  reorderLogicControlRef.current = onLogicControlReorder;
  addCgDisplayRef.current = onCgDisplayAdd;
  updateCgDisplayRef.current = onCgDisplayUpdate;
  deleteCgDisplayRef.current = onCgDisplayDelete;
  reorderCgDisplayRef.current = onCgDisplayReorder;
  updateChoiceOptionRef.current = onChoiceOptionUpdate;
  deleteChoiceOptionRef.current = onChoiceOptionDelete;
  reorderChoiceOptionRef.current = onChoiceOptionReorder;
  updateDialogueVoiceRef.current = onDialogueVoiceUpdate;
  deleteTimelineNodesRef.current = onTimelineNodesDelete;
  reorderTimelineRef.current = onTimelineReorder;
  reorderTimelineNodesRef.current = onTimelineNodesReorder;
  updateDialogueRef.current = onDialogueUpdate;
  draftDirtyChangeRef.current = onDraftDirtyChange;
  externalBusyRef.current = isBusy;

  useImperativeHandle(
    ref,
    () => ({
      flushPendingDraft: () => flushPendingDraftRef.current(),
    }),
    [],
  );

  function rememberProjectedLayout({
    updateRootPosition = true,
    preferredRoot,
  }: {
    updateRootPosition?: boolean;
    preferredRoot?: Blockly.BlockSvg;
  } = {}): void {
    const workspace = workspaceRef.current;
    const projected = projectedSceneRef.current;

    if (!workspace || !projected) {
      return;
    }

    const previousLayout = layoutStore.get(projected.layoutKey);
    layoutStore.set(
      projected.layoutKey,
      captureSceneWorkspaceLayout(projected.scene, workspace, previousLayout, {
        updateRootPosition,
        preferredRoot,
      }),
    );
  }

  function renderSceneSnapshot(
    nextScene: SceneDocument,
    nextLayoutKey: string,
    captureCurrentLayout = true,
  ): void {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const projected = projectedSceneRef.current;

    if (projected && captureCurrentLayout) {
      const captureScene =
        projected.layoutKey === nextLayoutKey ? nextScene : projected.scene;
      const previousLayout = layoutStore.get(projected.layoutKey);

      layoutStore.set(
        projected.layoutKey,
        captureSceneWorkspaceLayout(captureScene, workspace, previousLayout),
      );
    }

    const targetLayout = layoutStore.get(nextLayoutKey);
    setCgDisplayImageOptions(assetsRef.current, labelsRef.current);
    setVariableBlockProjectScenes(scenesRef.current, labelsRef.current);
    projectSceneToWorkspace(
      nextScene,
      workspace,
      targetLayout?.rootPosition,
      assetsRef.current,
      labelsRef.current,
    );
    restoreSceneWorkspaceViewport(workspace, targetLayout);
    selectionRef.current?.syncScene(nextScene);

    projectedSceneRef.current = {
      layoutKey: nextLayoutKey,
      scene: nextScene,
    };
    const logicDrafts = collectLogicFieldDrafts(workspace, nextScene);
    const backgroundDrafts = collectBackgroundFieldDrafts(
      workspace,
      nextScene,
    );
    const characterDrafts = collectCharacterFieldDrafts(workspace, nextScene);
    const cgDisplayDrafts = collectCgDisplayFieldDrafts(workspace, nextScene);
    const characterEffectDrafts = collectCharacterEffectFieldDrafts(
      workspace,
      nextScene,
    );
    draftDirtyChangeRef.current(
      collectDialogueFieldDrafts(workspace, nextScene).length > 0 ||
        collectChoiceOptionFieldDrafts(workspace, nextScene).length > 0 ||
        collectStoryContinuationSequenceDraft(workspace, nextScene) !== null ||
        logicDrafts.drafts.length > 0 ||
        logicDrafts.invalidNodeId !== null ||
        backgroundDrafts.drafts.length > 0 ||
        backgroundDrafts.invalidNodeId !== null ||
        characterDrafts.drafts.length > 0 ||
        characterDrafts.invalidNodeId !== null ||
        cgDisplayDrafts.drafts.length > 0 ||
        cgDisplayDrafts.invalidNodeId !== null ||
        characterEffectDrafts.drafts.length > 0 ||
        characterEffectDrafts.invalidNodeId !== null,
    );

    // 保存经过内容边界夹紧后的实际视角值。
    layoutStore.set(
      nextLayoutKey,
      captureSceneWorkspaceLayout(nextScene, workspace, targetLayout),
    );
  }

  // Effect 1：Blockly 生命周期和事件监听。
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const initialLabels = initialLabelsRef.current;
    registerDialogueBlock(initialLabels);
    registerBackgroundBlock(initialLabels);
    registerCharacterBlock(initialLabels);
    registerCharacterEffectBlocks(initialLabels);
    registerBgmBlock(initialLabels);
    registerVideoBlock(initialLabels);
    registerStoryContinuationBlock(initialLabels);
    setVariableBlockProjectScenes(scenesRef.current, initialLabels);
    registerVariableBlocks(initialLabels);
    registerLogicControlBlocks(initialLabels);
    setCgDisplayImageOptions(assetsRef.current, initialLabels);
    registerCgDisplayBlock(initialLabels);
    registerSceneStartBlock(initialLabels);
    setChoiceOptionSceneOptions(scenesRef.current, initialLabels);
    registerChoiceBlocks(initialLabels);
    setSceneJumpBlockOptions(
      scenesRef.current,
      sceneRef.current.id,
      initialLabels,
    );
    registerSceneJumpBlock(initialLabels);
    Blockly.config.snapRadius = DIALOGUE_CONNECTION_SNAP_RADIUS;
    Blockly.config.connectingSnapRadius = DIALOGUE_CONNECTION_SNAP_RADIUS;

    let requestDeleteFromTrash: (
      draggedNodeId: string | null,
    ) => void = () => {};
    const originalTrashcanFactory = Blockly.WorkspaceSvg.newTrashcan;

    // inject 会同步创建垃圾桶，因此只在这一小段替换工厂，随后立刻恢复。
    Blockly.WorkspaceSvg.newTrashcan = (trashcanWorkspace) =>
      new EngineTrashcan(
        trashcanWorkspace,
        (draggedNodeId) => requestDeleteFromTrash(draggedNodeId),
        (nodeId) =>
          sceneRef.current.nodes.some((node) => node.id === nodeId) ||
          findChoiceOption(sceneRef.current, nodeId) !== null ||
          getCharacterEffectOwnerForDelete(
            trashcanWorkspace,
            sceneRef.current,
            nodeId,
          ) !== null,
      );

    const workspace = (() => {
      try {
        return Blockly.inject(container, {
          toolbox: createBlockEditorToolbox(
            scenesRef.current.length > 1,
            initialLabels,
          ),
          trashcan: true,
          maxTrashcanContents: 0,
          readOnly: false,
          move: {
            scrollbars: true,
            drag: false,
            wheel: false,
          },
          renderer: 'zelos',
          plugins: {
            connectionChecker: CharacterEffectConnectionChecker,
          },
          sounds: false,
          zoom: {
            controls: true,
            wheel: true,
            startScale: 0.9,
            minScale: 0.5,
            maxScale: 1.4,
            scaleSpeed: 1.1,
          },
        });
      } finally {
        Blockly.WorkspaceSvg.newTrashcan = originalTrashcanFactory;
      }
    })();

    workspaceRef.current = workspace;
    installInlineZoomControlIcons(workspace.getParentSvg());

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });

    let isActive = true;

    let activeMutation: Promise<boolean> | null = null;

    const saveLogicDraft = (
      draft: LogicFieldDraft,
      currentScene: SceneDocument,
    ): Promise<boolean> => {
      const base = {
        sceneId: currentScene.id,
        nodeId: draft.nodeId,
      };
      if (draft.kind === 'variableSet') {
        return updateVariableSetRef.current({
          ...base,
          variableName: draft.variableName,
          value: draft.value,
        });
      }
      if (draft.kind === 'variableChange') {
        return updateVariableChangeRef.current({
          ...base,
          variableName: draft.variableName,
          amount: draft.amount,
        });
      }
      if (draft.kind === 'logicIf') {
        return updateLogicIfRef.current({
          ...base,
          condition: draft.condition,
        });
      }
      return updateLogicRepeatRef.current({
        ...base,
        count: draft.count,
      });
    };

    const saveCgDisplayDraft = (
      draft: CgDisplayFieldDraft,
      currentScene: SceneDocument,
    ): Promise<boolean> =>
      updateCgDisplayRef.current({
        sceneId: currentScene.id,
        nodeId: draft.nodeId,
        assetId: draft.assetId,
        leadInMs: draft.leadInMs,
      });

    const saveWorkspaceMutation = (
      action: () => Promise<boolean>,
      options: {
        keepLockedOnSuccess?: boolean;
        allowExternalBusy?: boolean;
      } = {},
    ): Promise<boolean> => {
      if (activeMutation) {
        return activeMutation;
      }
      if (externalBusyRef.current && !options.allowExternalBusy) {
        return Promise.resolve(false);
      }

      // 保存请求期间根坐标不应被临时拖拽改变，但要记住最新缩放和滚动。
      rememberProjectedLayout({ updateRootPosition: false });
      isSavingRef.current = true;
      setStoryBlocksInteractive(workspace, false);
      workspace.clearUndo();

      const mutation = (async () => {
        let saved = false;

        try {
          saved = await action();
        } catch (error: unknown) {
          console.error('同步 Blockly 操作失败', error);
        }

        // 组件可能已被卸载，不能继续访问已销毁的 workspace。
        if (!isActive) {
          return saved;
        }

        if (!saved) {
          // C++ 拒绝操作时，用最后一次成功快照恢复。
          renderSceneSnapshot(sceneRef.current, layoutKeyRef.current, false);
        }

        isSavingRef.current = false;
        setStoryBlocksInteractive(
          workspace,
          saved && options.keepLockedOnSuccess
            ? false
            : !externalBusyRef.current,
        );
        workspace.clearUndo();

        return saved;
      })();

      activeMutation = mutation;
      void mutation.finally(() => {
        if (activeMutation === mutation) {
          activeMutation = null;
        }
      });
      return mutation;
    };

    const handleAssetDragOver = (event: DragEvent) => {
      if (
        !event.dataTransfer?.types.some(
          (type) =>
            type === VN_IMAGE_ASSET_DRAG_TYPE ||
            type === VN_AUDIO_ASSET_DRAG_TYPE ||
            type === VN_VIDEO_ASSET_DRAG_TYPE,
        ) ||
        isSavingRef.current ||
        externalBusyRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };

    const handleAssetDrop = (event: DragEvent) => {
      const imageAssetId = event.dataTransfer?.getData(
        VN_IMAGE_ASSET_DRAG_TYPE,
      );
      const audioAssetId = event.dataTransfer?.getData(
        VN_AUDIO_ASSET_DRAG_TYPE,
      );
      const videoAssetId = event.dataTransfer?.getData(
        VN_VIDEO_ASSET_DRAG_TYPE,
      );
      const assetId = imageAssetId || audioAssetId || videoAssetId;
      const assetType: AssetDocument['type'] | null = imageAssetId
        ? 'image'
        : audioAssetId
          ? 'audio'
          : videoAssetId
            ? 'video'
            : null;
      if (
        !assetId ||
        !assetType ||
        isSavingRef.current ||
        externalBusyRef.current ||
        !assetsRef.current.some(
          (asset) => asset.id === assetId && asset.type === assetType,
        )
      ) {
        return;
      }

      const blockTypes =
        assetType === 'image'
          ? [
              BACKGROUND_BLOCK_TYPE,
              CHARACTER_BLOCK_TYPE,
              CLEAR_CHARACTER_BLOCK_TYPE,
              CG_DISPLAY_BLOCK_TYPE,
            ]
          : assetType === 'audio'
            ? [DIALOGUE_BLOCK_TYPE, BGM_BLOCK_TYPE]
            : [VIDEO_BLOCK_TYPE];
      const block = blockTypes
        .flatMap((type) => workspace.getBlocksByType(type, false))
        .find((candidate) => {
          if (!(candidate instanceof Blockly.BlockSvg)) {
            return false;
          }
          if (assetType === 'audio') {
            return isPointInsideField(
              candidate,
              candidate.type === DIALOGUE_BLOCK_TYPE
                ? DIALOGUE_BLOCK_FIELDS.voiceAssetName
                : BGM_BLOCK_FIELDS.assetName,
              event.clientX,
              event.clientY,
            );
          }
          if (assetType === 'video') {
            return isPointInsideField(
              candidate,
              VIDEO_BLOCK_FIELDS.assetName,
              event.clientX,
              event.clientY,
            );
          }
          const rectangle = getBlockClientRectangle(candidate, workspace);
          return (
            event.clientX >= rectangle.left &&
            event.clientX <= rectangle.right &&
            event.clientY >= rectangle.top &&
            event.clientY <= rectangle.bottom
          );
        });
      const node = block
        ? sceneRef.current.nodes.find((candidate) => candidate.id === block.id)
        : undefined;

      if (
        !block ||
        !node ||
        (assetType === 'image'
          ? node.type !== 'background' &&
            node.type !== 'character' &&
            node.type !== 'cgDisplay'
          : assetType === 'audio'
            ? node.type !== 'dialogue' && node.type !== 'bgm'
            : node.type !== 'video')
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selection.selectOnly(node.id);

      const currentAssetId =
        node.type === 'dialogue'
          ? node.voiceAssetId
          : node.type === 'bgm' ||
              node.type === 'background' ||
              node.type === 'character' ||
              node.type === 'cgDisplay' ||
              node.type === 'video'
            ? node.assetId
            : null;
      if (currentAssetId === assetId) {
        return;
      }

      void saveWorkspaceMutation(() =>
        node.type === 'background'
          ? updateBackgroundRef.current({
              sceneId: sceneRef.current.id,
              nodeId: node.id,
              assetId,
              scalePercent: node.scalePercent,
            })
          : node.type === 'character'
            ? updateCharacterRef.current({
                sceneId: sceneRef.current.id,
                nodeId: node.id,
                mode: 'show',
                assetId,
                slot:
                  block.getFieldValue(CHARACTER_BLOCK_FIELDS.slot) === 'custom'
                    ? node.slot
                    : getCharacterBlockSlot(block),
                layer: getCharacterBlockLayer(block),
                position: node.position,
                scalePercent: node.scalePercent,
              })
            : node.type === 'cgDisplay'
              ? updateCgDisplayRef.current({
                  sceneId: sceneRef.current.id,
                  nodeId: node.id,
                  assetId,
                  leadInMs: node.leadInMs,
                })
              : node.type === 'dialogue'
                ? updateDialogueVoiceRef.current({
                    sceneId: sceneRef.current.id,
                    nodeId: node.id,
                    assetId,
                  })
                : node.type === 'bgm'
                  ? updateBgmRef.current({
                      sceneId: sceneRef.current.id,
                      nodeId: node.id,
                      assetId,
                    })
                  : node.type === 'video'
                    ? updateVideoRef.current({
                        sceneId: sceneRef.current.id,
                        nodeId: node.id,
                        assetId,
                      })
                    : Promise.resolve(false),
      );
    };

    flushPendingDraftRef.current = async () => {
      // 已经在同步某个 Blockly 动作时，先等它的成败结果。
      // 失败必须阻止后续项目文件保存。
      if (activeMutation) {
        return activeMutation;
      }

      const currentScene = sceneRef.current;
      const drafts = collectDialogueFieldDrafts(workspace, currentScene);
      const choiceDrafts = collectChoiceOptionFieldDrafts(
        workspace,
        currentScene,
      );
      const storyContinuationDraft = collectStoryContinuationSequenceDraft(
        workspace,
        currentScene,
      );
      const logicDrafts = collectLogicFieldDrafts(workspace, currentScene);
      const backgroundDrafts = collectBackgroundFieldDrafts(
        workspace,
        currentScene,
      );
      const characterDrafts = collectCharacterFieldDrafts(
        workspace,
        currentScene,
      );
      const cgDisplayDrafts = collectCgDisplayFieldDrafts(
        workspace,
        currentScene,
      );
      const characterEffectDrafts = collectCharacterEffectFieldDrafts(
        workspace,
        currentScene,
      );
      draftDirtyChangeRef.current(
        drafts.length > 0 ||
          choiceDrafts.length > 0 ||
          storyContinuationDraft !== null ||
          logicDrafts.drafts.length > 0 ||
          logicDrafts.invalidNodeId !== null ||
          backgroundDrafts.drafts.length > 0 ||
          backgroundDrafts.invalidNodeId !== null ||
          characterDrafts.drafts.length > 0 ||
          characterDrafts.invalidNodeId !== null ||
          cgDisplayDrafts.drafts.length > 0 ||
          cgDisplayDrafts.invalidNodeId !== null ||
          characterEffectDrafts.drafts.length > 0 ||
          characterEffectDrafts.invalidNodeId !== null,
      );

      return saveWorkspaceMutation(
        async () => {
          // 字段值已在上方同步采集。关闭 WidgetDiv 时禁用事件，
          // 避免同一次输入再排队一个重复的最终 BLOCK_CHANGE。
          Blockly.Events.disable();
          try {
            Blockly.WidgetDiv.hideIfOwnerIsInWorkspace(workspace);
          } finally {
            Blockly.Events.enable();
          }

          for (const draft of drafts) {
            const saved = await updateDialogueRef.current(
              currentScene.id,
              draft.nodeId,
              draft.speaker,
              draft.text,
            );

            if (!saved) {
              return false;
            }
          }

          for (const draft of choiceDrafts) {
            const saved = await updateChoiceOptionRef.current({
              sceneId: currentScene.id,
              ...draft,
            });

            if (!saved) {
              return false;
            }
          }

          if (backgroundDrafts.invalidNodeId !== null) {
            return false;
          }
          for (const draft of backgroundDrafts.drafts) {
            const saved = await updateBackgroundRef.current({
              sceneId: currentScene.id,
              ...draft,
            });
            if (!saved) {
              return false;
            }
          }

          if (characterDrafts.invalidNodeId !== null) {
            return false;
          }
          for (const draft of characterDrafts.drafts) {
            const saved = await updateCharacterRef.current({
              sceneId: currentScene.id,
              ...draft,
            });
            if (!saved) {
              return false;
            }
          }

          if (logicDrafts.invalidNodeId !== null) {
            return false;
          }
          for (const draft of logicDrafts.drafts) {
            const saved = await saveLogicDraft(draft, currentScene);
            if (!saved) {
              return false;
            }
          }

          if (cgDisplayDrafts.invalidNodeId !== null) {
            return false;
          }
          for (const draft of cgDisplayDrafts.drafts) {
            const saved = await saveCgDisplayDraft(draft, currentScene);
            if (!saved) {
              return false;
            }
          }

          if (characterEffectDrafts.invalidNodeId !== null) {
            return false;
          }
          for (const draft of characterEffectDrafts.drafts) {
            const saved = await updateCharacterEffectRef.current({
              sceneId: currentScene.id,
              nodeId: draft.nodeId,
              effect: draft.effect,
            });
            if (!saved) {
              return false;
            }
          }

          if (storyContinuationDraft) {
            if (storyContinuationDraft.kind === 'restore-projection') {
              return false;
            }
            const saved = await reorderTimelineNodesRef.current(
              storyContinuationDraft.params,
            );
            if (!saved) {
              return false;
            }
          }

          return true;
        },
        {
          keepLockedOnSuccess: true,
          allowExternalBusy: true,
        },
      );
    };

    const selection = createBlockSelectionController(
      container,
      workspace,
      sceneRef.current,
    );
    selectionRef.current = selection;
    let selectedChoiceOptionId: string | null = null;
    let selectedCharacterEffectId: string | null = null;

    const requestDelete = (draggedNodeId: string | null) => {
      if (isSavingRef.current || externalBusyRef.current) {
        return;
      }

      const currentScene = sceneRef.current;
      const effectOwnerNodeId = getCharacterEffectOwnerForDelete(
        workspace,
        currentScene,
        draggedNodeId ?? selectedCharacterEffectId,
      );
      if (effectOwnerNodeId) {
        selectedCharacterEffectId = null;
        void saveWorkspaceMutation(() =>
          updateCharacterEffectRef.current({
            sceneId: currentScene.id,
            nodeId: effectOwnerNodeId,
            effect: null,
          }),
        );
        return;
      }
      const draggedOption = draggedNodeId
        ? findChoiceOption(currentScene, draggedNodeId)
        : null;

      if (
        draggedNodeId &&
        !currentScene.nodes.some((node) => node.id === draggedNodeId) &&
        draggedOption === null
      ) {
        // 工具箱刚生成的临时 ID 不属于 C++ Project。
        return;
      }

      const selectedNodeIds = selection.getSelectedNodeIds();

      const optionToDelete =
        draggedOption ??
        (draggedNodeId === null &&
        selectedNodeIds.length === 0 &&
        selectedChoiceOptionId
          ? findChoiceOption(currentScene, selectedChoiceOptionId)
          : null);
      if (optionToDelete) {
        selectedChoiceOptionId = null;
        selectedCharacterEffectId = null;
        void saveWorkspaceMutation(() =>
          deleteChoiceOptionRef.current({
            sceneId: currentScene.id,
            nodeId: optionToDelete.node.id,
            optionId: optionToDelete.option.id,
          }),
        );
        return;
      }

      const nodeIds = draggedNodeId
        ? selectedNodeIds.includes(draggedNodeId)
          ? selectedNodeIds
          : [draggedNodeId]
        : selectedNodeIds;

      if (nodeIds.length === 0) {
        return;
      }

      const logicControlDelete = getLogicControlDeleteResolution(
        currentScene,
        nodeIds,
      );
      if (logicControlDelete?.kind === 'reject-mixed-selection') {
        // There is no atomic command for deleting an unrelated mixed
        // selection. Never partially delete the first control and silently
        // leave the rest behind.
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (logicControlDelete?.kind === 'delete') {
        // Deleting a C block means deleting its complete paired structure and
        // nested body. Keeping the body would turn Else content unconditional.
        selection.selectOnly();
        void saveWorkspaceMutation(() =>
          deleteLogicControlRef.current({
            sceneId: currentScene.id,
            nodeId: logicControlDelete.nodeId,
          }),
        );
        return;
      }

      // A CG range may itself live inside an If/Repeat. Resolve the owning
      // logic range first so deleting a complete outer C block remains atomic.
      const cgDisplayDelete = getCgDisplayDeleteResolution(
        currentScene,
        nodeIds,
      );
      if (cgDisplayDelete?.kind === 'reject-mixed-selection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (cgDisplayDelete?.kind === 'delete') {
        selection.selectOnly();
        void saveWorkspaceMutation(() =>
          deleteCgDisplayRef.current({
            sceneId: currentScene.id,
            nodeId: cgDisplayDelete.nodeId,
          }),
        );
        return;
      }

      void saveWorkspaceMutation(() =>
        deleteTimelineNodesRef.current({
          sceneId: currentScene.id,
          nodeIds,
        }),
      );
    };

    requestDeleteFromTrash = requestDelete;

    const groupDrag = createBlockGroupDragController(
      container,
      workspace,
      () => sceneRef.current,
      selection,
      {
        canStart: () => !isSavingRef.current && !externalBusyRef.current,
        onDelete: () => requestDelete(null),
        onMoveAll: (deltaX, deltaY) => {
          const startBlock = workspace.getBlockById(
            getSceneStartBlockId(sceneRef.current.id),
          );
          const projectedPageRoots = paginateStoryNodes(
            sceneRef.current.nodes,
          ).flatMap((page) => {
            const firstNodeId = page.continuation?.node.id ?? page.nodes[0]?.id;
            const firstBlock = firstNodeId
              ? workspace.getBlockById(firstNodeId)
              : null;
            const rootBlock =
              firstBlock instanceof Blockly.BlockSvg
                ? firstBlock.getRootBlock()
                : null;
            return rootBlock instanceof Blockly.BlockSvg ? [rootBlock] : [];
          });
          const pageRoots = [
            ...(startBlock instanceof Blockly.BlockSvg
              ? [startBlock.getRootBlock()]
              : []),
            ...projectedPageRoots,
          ].filter(
            (root, index, roots): root is Blockly.BlockSvg =>
              root instanceof Blockly.BlockSvg &&
              roots.findIndex((candidate) => candidate.id === root.id) ===
                index,
          );

          if (pageRoots.length === 0) {
            return;
          }

          // 全选时没有剧情上的插入锚点，同步移动所有手动分段列。
          // 禁用事件，避免这次纯布局移动被误判成对白重排。
          Blockly.Events.disable();
          try {
            for (const pageRoot of pageRoots) {
              pageRoot.moveBy(deltaX, deltaY, ['vn-group-layout']);
            }
          } finally {
            Blockly.Events.enable();
          }

          workspace.resizeContents();
          rememberProjectedLayout({
            preferredRoot: pageRoots[0],
          });
        },
        onReorder: (params) => {
          if (isSavingRef.current || externalBusyRef.current) {
            return;
          }

          void saveWorkspaceMutation(() =>
            reorderTimelineNodesRef.current(params),
          );
        },
      },
      () => labelsRef.current,
    );
    groupDragRef.current = groupDrag;

    const deleteShortcutName = `vn-delete-dialogues-${workspace.id}`;
    Blockly.ShortcutRegistry.registry.register({
      name: deleteShortcutName,
      keyCodes: [
        Blockly.utils.KeyCodes.DELETE,
        Blockly.utils.KeyCodes.BACKSPACE,
      ],
      allowCollision: true,
      preconditionFn: (shortcutWorkspace) =>
        shortcutWorkspace.id === workspace.id &&
        !isSavingRef.current &&
        !externalBusyRef.current &&
        !workspace.isDragging() &&
        !groupDrag.isActive() &&
        !Blockly.getFocusManager().ephemeralFocusTaken() &&
        (selection.getSelectedNodeIds().length > 0 ||
          selectedChoiceOptionId !== null ||
          selectedCharacterEffectId !== null),
      callback: (_shortcutWorkspace, event) => {
        event.preventDefault();
        requestDelete(null);
        return true;
      },
      displayText: () => labelsRef.current.blockEditor.deleteSelection,
    });

    const handleWorkspaceChange = (event: Blockly.Events.Abstract) => {
      const currentScene = sceneRef.current;

      if (event.type === Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE) {
        const logicDrafts = collectLogicFieldDrafts(workspace, currentScene);
        const backgroundDrafts = collectBackgroundFieldDrafts(
          workspace,
          currentScene,
        );
        const characterDrafts = collectCharacterFieldDrafts(
          workspace,
          currentScene,
        );
        const cgDisplayDrafts = collectCgDisplayFieldDrafts(
          workspace,
          currentScene,
        );
        const characterEffectDrafts = collectCharacterEffectFieldDrafts(
          workspace,
          currentScene,
        );
        // Blockly 输入框尚未失焦时也要立即更新“未保存”。
        // 这个事件不写 C++，只报告 Renderer 草稿状态。
        draftDirtyChangeRef.current(
          collectDialogueFieldDrafts(workspace, currentScene).length > 0 ||
            collectChoiceOptionFieldDrafts(workspace, currentScene).length >
              0 ||
            collectStoryContinuationSequenceDraft(workspace, currentScene) !==
              null ||
            logicDrafts.drafts.length > 0 ||
            logicDrafts.invalidNodeId !== null ||
            backgroundDrafts.drafts.length > 0 ||
            backgroundDrafts.invalidNodeId !== null ||
            characterDrafts.drafts.length > 0 ||
            characterDrafts.invalidNodeId !== null ||
            cgDisplayDrafts.drafts.length > 0 ||
            cgDisplayDrafts.invalidNodeId !== null ||
            characterEffectDrafts.drafts.length > 0 ||
            characterEffectDrafts.invalidNodeId !== null,
        );
        return;
      }

      if (event.type === Blockly.Events.SELECTED) {
        const selectedEvent = event as Blockly.Events.Selected;
        const selectedNodeId = selectedEvent.newElementId;
        const selectedOption = selectedNodeId
          ? findChoiceOption(currentScene, selectedNodeId)
          : null;
        const selectedBlock = selectedNodeId
          ? workspace.getBlockById(selectedNodeId)
          : null;

        if (selectedBlock && isCharacterEffectBlockType(selectedBlock.type)) {
          selection.selectOnly();
          selectedChoiceOptionId = null;
          selectedCharacterEffectId = selectedBlock.id;
          return;
        }

        if (selectedOption) {
          selection.selectOnly();
          selectedChoiceOptionId = selectedOption.option.id;
          selectedCharacterEffectId = null;
          return;
        }

        // 只让正式对白改变业务选择。垃圾桶/工具箱获得焦点时可能
        // 发出 SELECTED(null)，但不应该把准备删除的多选清空。
        if (
          selectedNodeId &&
          currentScene.nodes.some((node) => node.id === selectedNodeId)
        ) {
          selectedChoiceOptionId = null;
          selectedCharacterEffectId = null;
          selection.selectOnly(selectedNodeId);
        }
        return;
      }

      if (isSavingRef.current || externalBusyRef.current) {
        return;
      }

      if (event.type === Blockly.Events.BLOCK_MOVE) {
        const moveEvent = event as Blockly.Events.BlockMove;
        const movedPersistedDialogue =
          moveEvent.blockId &&
          moveEvent.reason?.includes('drag') &&
          currentScene.nodes.some((node) => node.id === moveEvent.blockId);

        if (movedPersistedDialogue) {
          // 单块场景移动、或重新吸附成完整链后，记录用户选择的新位置。
          rememberProjectedLayout();
        }
      }

      const characterEffectMutation = getCharacterEffectMutation(
        event,
        workspace,
        currentScene,
      );
      if (characterEffectMutation?.kind === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (characterEffectMutation?.kind === 'update') {
        void saveWorkspaceMutation(() =>
          updateCharacterEffectRef.current({
            sceneId: currentScene.id,
            nodeId: characterEffectMutation.nodeId,
            effect: characterEffectMutation.effect,
          }),
        );
        return;
      }
      if (characterEffectMutation?.kind === 'move') {
        void saveWorkspaceMutation(() =>
          moveCharacterEffectRef.current({
            sceneId: currentScene.id,
            fromNodeId: characterEffectMutation.fromNodeId,
            toNodeId: characterEffectMutation.toNodeId,
            effect: characterEffectMutation.effect,
          }),
        );
        return;
      }

      if (isInvalidCgDisplayBodyDrop(event, workspace, currentScene)) {
        // CG BODY v1 is a dialogue-only scope. Reject every other block before
        // any generic add/reorder action can reach the backend.
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }

      const cgDisplayReorder = getCgDisplayReorderResolution(
        event,
        workspace,
        currentScene,
      );
      if (cgDisplayReorder?.kind === 'reorder') {
        void saveWorkspaceMutation(() =>
          reorderCgDisplayRef.current({
            sceneId: currentScene.id,
            nodeId: cgDisplayReorder.nodeId,
            beforeNodeId: cgDisplayReorder.beforeNodeId,
          }),
        );
        return;
      }
      if (cgDisplayReorder?.kind === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }

      const logicControlReorder = getLogicControlReorderResolution(
        event,
        workspace,
        currentScene,
      );
      if (logicControlReorder?.kind === 'reorder') {
        void saveWorkspaceMutation(() =>
          reorderLogicControlRef.current({
            sceneId: currentScene.id,
            nodeId: logicControlReorder.nodeId,
            beforeNodeId: logicControlReorder.beforeNodeId,
          }),
        );
        return;
      }
      if (logicControlReorder?.kind === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }

      const reorderResolution = getTimelineReorderDropResolution(
        event,
        workspace,
        currentScene,
      );

      if (reorderResolution?.kind === 'reorder') {
        const { drop } = reorderResolution;
        void saveWorkspaceMutation(() =>
          reorderTimelineRef.current({
            sceneId: currentScene.id,
            nodeId: drop.nodeId,
            beforeNodeId: drop.beforeNodeId,
          }),
        );

        return;
      }

      if (reorderResolution?.kind === 'restore-projection') {
        // 节点顺序虽然未变，但 Blockly 的手动分段链已被跨段拖放拆开。
        // 走既有失败恢复路径，用最后一次权威 Scene 快照重新投影。
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }

      const optionReorder = getReorderedChoiceOptionBlock(
        event,
        workspace,
        currentScene,
      );
      if (optionReorder) {
        void saveWorkspaceMutation(() =>
          reorderChoiceOptionRef.current({
            sceneId: currentScene.id,
            ...optionReorder,
          }),
        );
        return;
      }

      if (isChoiceOptionOutsideOwningChoice(event, workspace, currentScene)) {
        // ChoiceOption 的稳定 ID 属于一个 ChoiceNode，不能通过画布拖动
        // 偷偷换父节点。恢复权威快照，避免 UI 与 C++ 分叉。
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }

      const newChoiceOptionDropResolution = getNewChoiceOptionDropResolution(
        event,
        workspace,
        currentScene,
      );
      if (newChoiceOptionDropResolution?.kind === 'rollback') {
        // 清除落在画布空白、顶层剧情链或临时 Choice 容器中的新选项，
        // 同时把可能被它拆开的正式剧情链恢复为 C++ 快照中的顺序。
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (newChoiceOptionDropResolution?.kind === 'add') {
        const { block, nodeId, text, targetSceneId, beforeOptionId } =
          newChoiceOptionDropResolution.drop;
        block.setMovable(false);
        block.setDeletable(false);
        block.setEditable(false);
        block.contextMenu = false;

        void saveWorkspaceMutation(() =>
          targetSceneId
            ? addChoiceOptionRef.current({
                sceneId: currentScene.id,
                nodeId,
                text,
                targetSceneId,
                beforeOptionId,
              })
            : Promise.resolve(false),
        );
        return;
      }

      const newStoryExtensionDropResolution =
        getNewStoryExtensionDropResolution(event, workspace, currentScene);
      if (newStoryExtensionDropResolution?.kind === 'rollback') {
        // 页首延伸只能向下连到已有正式节点，或者作为
        // 孤立顶层块追加成末尾空页；其他临时连接需恢复快照。
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (newStoryExtensionDropResolution?.kind === 'add') {
        const { block, beforeNodeId } = newStoryExtensionDropResolution.drop;
        block.setMovable(false);
        block.setDeletable(false);
        block.setEditable(false);
        block.contextMenu = false;

        void saveWorkspaceMutation(() =>
          addStoryExtensionRef.current({
            sceneId: currentScene.id,
            beforeNodeId,
          }),
        );
        return;
      }

      const storyContinuationSequenceUpdate =
        getStoryContinuationSequenceUpdate(event, workspace, currentScene);
      if (storyContinuationSequenceUpdate) {
        void saveWorkspaceMutation(() =>
          storyContinuationSequenceUpdate.kind === 'reorder-page'
            ? reorderTimelineNodesRef.current(
                storyContinuationSequenceUpdate.params,
              )
            : Promise.resolve(false),
        );
        return;
      }

      const newCgDisplayDrop = getNewCgDisplayDrop(
        event,
        workspace,
        currentScene,
      );
      if (newCgDisplayDrop === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (newCgDisplayDrop) {
        const { block, assetId, leadInMs, afterNodeId, beforeNodeId } =
          newCgDisplayDrop;
        block.setMovable(false);
        block.setDeletable(false);
        block.setEditable(false);
        block.contextMenu = false;
        void saveWorkspaceMutation(() =>
          addCgDisplayRef.current({
            sceneId: currentScene.id,
            assetId,
            leadInMs,
            afterNodeId,
            beforeNodeId,
          }),
        );
        return;
      }

      const newLogicBlockDrop = getNewLogicBlockDrop(
        event,
        workspace,
        currentScene,
      );
      if (newLogicBlockDrop === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (newLogicBlockDrop) {
        const { block, beforeNodeId } = newLogicBlockDrop;
        block.setMovable(false);
        block.setDeletable(false);
        block.setEditable(false);
        block.contextMenu = false;
        void saveWorkspaceMutation(() => {
          const placement = {
            sceneId: currentScene.id,
            beforeNodeId,
          };
          if (newLogicBlockDrop.kind === 'variableSet') {
            return addVariableSetRef.current({
              ...placement,
              variableName: newLogicBlockDrop.variableName,
              value: newLogicBlockDrop.value,
            });
          }
          if (newLogicBlockDrop.kind === 'variableChange') {
            return addVariableChangeRef.current({
              ...placement,
              variableName: newLogicBlockDrop.variableName,
              amount: newLogicBlockDrop.amount,
            });
          }
          if (newLogicBlockDrop.kind === 'logicIf') {
            return addLogicIfRef.current({
              ...placement,
              condition: newLogicBlockDrop.condition,
            });
          }
          return addLogicRepeatRef.current({
            ...placement,
            count: newLogicBlockDrop.count,
          });
        });
        return;
      }

      const newDialogueDrop = getDroppedNewDialogueBlock(
        event,
        workspace,
        currentScene,
      );

      if (newDialogueDrop) {
        const { block, beforeNodeId } = newDialogueDrop;

        // 这里只锁定 Blockly 的临时积木；正式 ID 仍由 C++ 生成。
        block.setMovable(false);
        block.setDeletable(false);
        block.setEditable(false);
        block.contextMenu = false;

        void saveWorkspaceMutation(() =>
          addDialogueRef.current({
            sceneId: currentScene.id,
            beforeNodeId,
            ...(String(
              block.getFieldValue(DIALOGUE_BLOCK_FIELDS.speaker) ?? '',
            ).trim()
              ? {
                  speaker: String(
                    block.getFieldValue(DIALOGUE_BLOCK_FIELDS.speaker) ?? '',
                  ),
                }
              : {}),
            ...(String(
              block.getFieldValue(DIALOGUE_BLOCK_FIELDS.text) ?? '',
            ).trim()
              ? {
                  text: String(
                    block.getFieldValue(DIALOGUE_BLOCK_FIELDS.text) ?? '',
                  ),
                }
              : {}),
          }),
        );

        return;
      }

      if (event.type === Blockly.Events.BLOCK_MOVE) {
        const moveEvent = event as Blockly.Events.BlockMove;
        const block = moveEvent.blockId
          ? workspace.getBlockById(moveEvent.blockId)
          : null;
        const alreadyExists = Boolean(
          moveEvent.blockId &&
          currentScene.nodes.some((node) => node.id === moveEvent.blockId),
        );

        if (
          (block?.type === BACKGROUND_BLOCK_TYPE ||
            (block !== null && isCharacterBlockType(block.type)) ||
            block?.type === SCENE_JUMP_BLOCK_TYPE ||
            block?.type === BGM_BLOCK_TYPE ||
            block?.type === VIDEO_BLOCK_TYPE ||
            block?.type === CHOICE_BLOCK_TYPE) &&
          !alreadyExists &&
          moveEvent.reason?.includes('drag')
        ) {
          const previousBlock = block.getPreviousBlock();
          const beforeNodeId = getTimelineBeforeNodeIdForBlock(
            block,
            currentScene,
          );
          const connected =
            beforeNodeId !== null ||
            (previousBlock !== null &&
              currentScene.nodes.some((node) => node.id === previousBlock.id));

          if (currentScene.nodes.length === 0 || connected) {
            const initialCharacterPlacement = isCharacterBlockType(block.type)
              ? resolveNewCharacterPlacement(block.type)
              : undefined;
            block.setMovable(false);
            block.setDeletable(false);
            block.setEditable(false);
            void saveWorkspaceMutation(() =>
              block.type === BACKGROUND_BLOCK_TYPE
                ? addBackgroundRef.current({
                    sceneId: currentScene.id,
                    beforeNodeId,
                  })
                : isCharacterBlockType(block.type)
                  ? initialCharacterPlacement === undefined
                    ? Promise.resolve(false)
                    : addCharacterRef.current({
                        sceneId: currentScene.id,
                        beforeNodeId,
                        ...initialCharacterPlacement,
                      })
                  : block.type === BGM_BLOCK_TYPE
                    ? addBgmRef.current({
                        sceneId: currentScene.id,
                        beforeNodeId,
                      })
                    : block.type === VIDEO_BLOCK_TYPE
                      ? addVideoRef.current({
                          sceneId: currentScene.id,
                          beforeNodeId,
                        })
                      : block.type === CHOICE_BLOCK_TYPE
                        ? addChoiceRef.current({
                            sceneId: currentScene.id,
                            beforeNodeId,
                          })
                        : (() => {
                            const targetSceneId = String(
                              block.getFieldValue(
                                SCENE_JUMP_BLOCK_FIELDS.targetScene,
                              ) ?? '',
                            );
                            return targetSceneId
                              ? addSceneJumpRef.current({
                                  sceneId: currentScene.id,
                                  targetSceneId,
                                  beforeNodeId,
                                })
                              : Promise.resolve(false);
                          })(),
            );
            return;
          }
        }
      }

      const cgDisplayFieldUpdate = getCgDisplayFieldUpdate(
        event,
        workspace,
        currentScene,
      );
      if (cgDisplayFieldUpdate === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (cgDisplayFieldUpdate) {
        void saveWorkspaceMutation(() =>
          saveCgDisplayDraft(cgDisplayFieldUpdate, currentScene),
        );
        return;
      }

      const logicFieldUpdate = getLogicFieldUpdate(
        event,
        workspace,
        currentScene,
      );
      if (logicFieldUpdate === 'restore-projection') {
        void saveWorkspaceMutation(() => Promise.resolve(false));
        return;
      }
      if (logicFieldUpdate) {
        void saveWorkspaceMutation(() =>
          saveLogicDraft(logicFieldUpdate, currentScene),
        );
        return;
      }

      const backgroundUpdate = getBackgroundFieldUpdate(
        event,
        workspace,
        currentScene,
      );
      if (backgroundUpdate) {
        void saveWorkspaceMutation(() =>
          updateBackgroundRef.current({
            sceneId: currentScene.id,
            ...backgroundUpdate,
          }),
        );
        return;
      }

      const characterUpdate = getCharacterFieldUpdate(
        event,
        workspace,
        currentScene,
      );

      if (characterUpdate) {
        void saveWorkspaceMutation(() =>
          updateCharacterRef.current({
            sceneId: currentScene.id,
            ...characterUpdate,
          }),
        );
        return;
      }

      const sceneJumpUpdate = getSceneJumpFieldUpdate(
        event,
        workspace,
        currentScene,
      );
      if (sceneJumpUpdate) {
        void saveWorkspaceMutation(() =>
          updateSceneJumpRef.current({
            sceneId: currentScene.id,
            ...sceneJumpUpdate,
          }),
        );
        return;
      }

      const choiceOptionUpdate = getChoiceOptionFieldUpdate(
        event,
        workspace,
        currentScene,
      );
      if (choiceOptionUpdate) {
        void saveWorkspaceMutation(() =>
          updateChoiceOptionRef.current({
            sceneId: currentScene.id,
            ...choiceOptionUpdate,
          }),
        );
        return;
      }

      const update = getDialogueFieldUpdate(event, workspace, currentScene);

      if (!update) {
        return;
      }

      void saveWorkspaceMutation(() =>
        updateDialogueRef.current(
          currentScene.id,
          update.nodeId,
          update.speaker,
          update.text,
        ),
      );
    };

    resizeObserver.observe(container);
    container.addEventListener('dragover', handleAssetDragOver);
    container.addEventListener('drop', handleAssetDrop);
    Blockly.svgResize(workspace);
    workspace.addChangeListener(handleWorkspaceChange);

    return () => {
      isActive = false;
      flushPendingDraftRef.current = async () => true;
      draftDirtyChangeRef.current(false);
      rememberProjectedLayout();
      requestDeleteFromTrash = () => {};
      Blockly.ShortcutRegistry.registry.unregister(deleteShortcutName);
      groupDrag.dispose();
      groupDragRef.current = null;
      selection.dispose();
      selectionRef.current = null;
      workspace.removeChangeListener(handleWorkspaceChange);
      resizeObserver.disconnect();
      container.removeEventListener('dragover', handleAssetDragOver);
      container.removeEventListener('drop', handleAssetDrop);
      projectedSceneRef.current = null;
      workspaceRef.current = null;
      workspace.dispose();
    };
  }, []);

  // Effect 2：C++ Scene 快照改变时重新投影。
  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    // 场景切换或后端快照到达时，旧指针手势不能继续作用于新数据。
    groupDragRef.current?.cancel();
    setSceneJumpBlockOptions(scenes, scene.id, labelsRef.current);
    setChoiceOptionSceneOptions(scenes, labelsRef.current);
    renderSceneSnapshot(scene, layoutKey);

    // 如果旧场景仍在保存，新投影也暂时不能编辑。
    setStoryBlocksInteractive(workspace, !isSavingRef.current);
  }, [assets, layoutKey, scene, scenes]);

  useEffect(() => {
    workspaceRef.current?.updateToolbox(
      createBlockEditorToolbox(scenes.length > 1, labelsRef.current),
    );
  }, [assets, scenes]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    registerDialogueBlock(labels);
    registerBackgroundBlock(labels);
    registerCharacterBlock(labels);
    registerCharacterEffectBlocks(labels);
    registerBgmBlock(labels);
    registerVideoBlock(labels);
    registerStoryContinuationBlock(labels);
    setVariableBlockProjectScenes(scenesRef.current, labels);
    registerVariableBlocks(labels);
    registerLogicControlBlocks(labels);
    setCgDisplayImageOptions(assetsRef.current, labels);
    registerCgDisplayBlock(labels);
    registerSceneStartBlock(labels);
    setChoiceOptionSceneOptions(scenesRef.current, labels);
    registerChoiceBlocks(labels);
    setSceneJumpBlockOptions(scenesRef.current, sceneRef.current.id, labels);
    registerSceneJumpBlock(labels);

    Blockly.Events.disable();
    try {
      for (const block of workspace.getAllBlocks(false)) {
        switch (block.type) {
          case DIALOGUE_BLOCK_TYPE:
            applyDialogueBlockLocalization(block, labels);
            break;
          case BACKGROUND_BLOCK_TYPE:
            applyBackgroundBlockLocalization(block, labels);
            break;
          case CHARACTER_BLOCK_TYPE:
          case CLEAR_CHARACTER_BLOCK_TYPE:
            applyCharacterBlockLocalization(block, labels);
            break;
          case CHARACTER_EFFECT_BLOCK_TYPES.shake:
          case CHARACTER_EFFECT_BLOCK_TYPES.jump:
          case CHARACTER_EFFECT_BLOCK_TYPES.fadeIn:
          case CHARACTER_EFFECT_BLOCK_TYPES.fadeOut:
          case CHARACTER_EFFECT_BLOCK_TYPES.slideIn:
          case CHARACTER_EFFECT_BLOCK_TYPES.breathe:
          case CHARACTER_EFFECT_BLOCK_TYPES.flash:
            applyCharacterEffectBlockLocalization(block, labels);
            break;
          case BGM_BLOCK_TYPE:
            applyBgmBlockLocalization(block, labels);
            break;
          case VIDEO_BLOCK_TYPE:
            applyVideoBlockLocalization(block, labels);
            break;
          case STORY_CONTINUATION_BLOCK_TYPE:
            applyStoryContinuationBlockLocalization(block, labels);
            break;
          case VARIABLE_SET_BLOCK_TYPE:
          case VARIABLE_CHANGE_BLOCK_TYPE:
            applyVariableBlockLocalization(block, labels);
            break;
          case LOGIC_IF_BLOCK_TYPE:
          case LOGIC_REPEAT_BLOCK_TYPE:
            applyLogicControlBlockLocalization(block, labels);
            break;
          case CG_DISPLAY_BLOCK_TYPE:
            applyCgDisplayBlockLocalization(block, labels);
            break;
          case SCENE_START_BLOCK_TYPE:
            applySceneStartBlockLocalization(block, labels);
            break;
          case CHOICE_BLOCK_TYPE:
          case CHOICE_OPTION_BLOCK_TYPE:
            applyChoiceBlockLocalization(block, labels);
            break;
          case SCENE_JUMP_BLOCK_TYPE:
            applySceneJumpBlockLocalization(block, labels);
            break;
        }
        if (block instanceof Blockly.BlockSvg) {
          block.render();
        }
      }
      workspace.updateToolbox(
        createBlockEditorToolbox(scenesRef.current.length > 1, labels),
      );
      Blockly.renderManagement.triggerQueuedRenders(workspace);
    } finally {
      Blockly.Events.enable();
    }
  }, [labels]);

  // 项目文件保存期间也要锁住 Blockly。否则草稿刚 flush
  // 完，用户又能在磁盘写入结束前继续修改字段。
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    setStoryBlocksInteractive(workspace, !isBusy && !isSavingRef.current);
  }, [isBusy]);

  return <div ref={containerRef} className="blockly-workspace" />;
});
