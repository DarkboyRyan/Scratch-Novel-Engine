import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import type {
  AddDialogueAction,
  DeleteDialoguesAction,
  ReorderDialogueAction,
  ReorderDialoguesAction,
  UpdateDialogueAction,
} from '../../hooks/useEngineProject';
import {
  DIALOGUE_BLOCK_FIELDS,
  DIALOGUE_BLOCK_TYPE,
  registerDialogueBlock,
} from './blocks/dialogueBlock';
import {
  collectDialogueFieldDrafts,
  getDialogueFieldUpdate,
  getDroppedNewDialogueBlock,
  getReorderedDialogueBlock,
} from './dialogueBlockEvents';
import {
  createBlockSelectionController,
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
import { blockEditorToolbox } from './toolbox';

// Blockly 默认值是 28，连接预览会在积木还离得较远时出现。
// 12 个工作区单位要求连接口真正靠近后才进入吸附候选。
const DIALOGUE_CONNECTION_SNAP_RADIUS = 12;

type BlocklyWorkspaceProps = {
  scene: SceneDocument;
  layoutKey: string;
  layoutStore: BlockEditorLayoutStore;
  isBusy: boolean;
  onDialogueAdd: AddDialogueAction;
  onDialogueDelete: DeleteDialoguesAction;
  onDialogueReorder: ReorderDialogueAction;
  onDialoguesReorder: ReorderDialoguesAction;
  onDialogueUpdate: UpdateDialogueAction;
  onDraftDirtyChange: (isDirty: boolean) => void;
};

export type BlocklyWorkspaceHandle = {
  flushPendingDraft(): Promise<boolean>;
};

function setDialogueBlocksInteractive(
  workspace: Blockly.WorkspaceSvg,
  interactive: boolean,
): void {
  // 锁定整个 workspace，才能同时阻止字段编辑、已有积木拖动，
  // 以及保存期间继续从 toolbox 拉出新积木。
  workspace.setIsReadOnly(!interactive);
  if (!interactive) {
    workspace.getToolbox()?.clearSelection();
  }

  const dialogueBlocks = workspace.getBlocksByType(
    DIALOGUE_BLOCK_TYPE,
    false,
  );

  for (const block of dialogueBlocks) {
    block.setEditable(interactive);
    block.setMovable(interactive);
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
    layoutKey,
    layoutStore,
    isBusy,
    onDialogueAdd,
    onDialogueDelete,
    onDialogueReorder,
    onDialoguesReorder,
    onDialogueUpdate,
    onDraftDirtyChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef =
    useRef<Blockly.WorkspaceSvg | null>(null);
  const selectionRef =
    useRef<BlockSelectionController | null>(null);
  const groupDragRef =
    useRef<BlockGroupDragController | null>(null);
  const projectedSceneRef = useRef<{
    layoutKey: string;
    scene: SceneDocument;
  } | null>(null);

  // Listener 只注册一次，但始终需要读取最新 props。
  const sceneRef = useRef(scene);
  const layoutKeyRef = useRef(layoutKey);
  const addDialogueRef = useRef(onDialogueAdd);
  const deleteDialogueRef = useRef(onDialogueDelete);
  const reorderDialogueRef = useRef(onDialogueReorder);
  const reorderDialoguesRef = useRef(onDialoguesReorder);
  const updateDialogueRef = useRef(onDialogueUpdate);
  const draftDirtyChangeRef = useRef(onDraftDirtyChange);
  const externalBusyRef = useRef(isBusy);
  const isSavingRef = useRef(false);
  const flushPendingDraftRef = useRef<
    () => Promise<boolean>
  >(async () => true);

  sceneRef.current = scene;
  layoutKeyRef.current = layoutKey;
  addDialogueRef.current = onDialogueAdd;
  deleteDialogueRef.current = onDialogueDelete;
  reorderDialogueRef.current = onDialogueReorder;
  reorderDialoguesRef.current = onDialoguesReorder;
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

    const previousLayout = layoutStore.get(
      projected.layoutKey,
    );
    layoutStore.set(
      projected.layoutKey,
      captureSceneWorkspaceLayout(
        projected.scene,
        workspace,
        previousLayout,
        { updateRootPosition, preferredRoot },
      ),
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
        projected.layoutKey === nextLayoutKey
          ? nextScene
          : projected.scene;
      const previousLayout = layoutStore.get(
        projected.layoutKey,
      );

      layoutStore.set(
        projected.layoutKey,
        captureSceneWorkspaceLayout(
          captureScene,
          workspace,
          previousLayout,
        ),
      );
    }

    const targetLayout = layoutStore.get(nextLayoutKey);
    projectSceneToWorkspace(
      nextScene,
      workspace,
      targetLayout?.rootPosition,
    );
    restoreSceneWorkspaceViewport(workspace, targetLayout);
    selectionRef.current?.syncScene(nextScene);

    projectedSceneRef.current = {
      layoutKey: nextLayoutKey,
      scene: nextScene,
    };
    draftDirtyChangeRef.current(
      collectDialogueFieldDrafts(workspace, nextScene).length > 0,
    );

    // 保存经过内容边界夹紧后的实际视角值。
    layoutStore.set(
      nextLayoutKey,
      captureSceneWorkspaceLayout(
        nextScene,
        workspace,
        targetLayout,
      ),
    );
  }

  // Effect 1：Blockly 生命周期和事件监听。
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    registerDialogueBlock();
    Blockly.config.snapRadius = DIALOGUE_CONNECTION_SNAP_RADIUS;
    Blockly.config.connectingSnapRadius =
      DIALOGUE_CONNECTION_SNAP_RADIUS;

    let requestDeleteFromTrash: (
      draggedNodeId: string | null,
    ) => void = () => {};
    const originalTrashcanFactory =
      Blockly.WorkspaceSvg.newTrashcan;

    // inject 会同步创建垃圾桶，因此只在这一小段替换工厂，随后立刻恢复。
    Blockly.WorkspaceSvg.newTrashcan = (trashcanWorkspace) =>
      new EngineTrashcan(
        trashcanWorkspace,
        (draggedNodeId) =>
          requestDeleteFromTrash(draggedNodeId),
        (nodeId) =>
          sceneRef.current.nodes.some(
            (node) => node.id === nodeId,
          ),
      );

    const workspace = (() => {
      try {
        return Blockly.inject(container, {
          toolbox: blockEditorToolbox,
          trashcan: true,
          maxTrashcanContents: 0,
          readOnly: false,
          move: {
            scrollbars: true,
            drag: false,
            wheel: false,
          },
          renderer: 'zelos',
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
        Blockly.WorkspaceSvg.newTrashcan =
          originalTrashcanFactory;
      }
    })();

    workspaceRef.current = workspace;

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });

    let isActive = true;

    let activeMutation: Promise<boolean> | null = null;

    const saveWorkspaceMutation = (
      action: () => Promise<boolean>,
      options: { keepLockedOnSuccess?: boolean } = {},
    ): Promise<boolean> => {
      if (activeMutation) {
        return activeMutation;
      }

      // 保存请求期间根坐标不应被临时拖拽改变，但要记住最新缩放和滚动。
      rememberProjectedLayout({ updateRootPosition: false });
      isSavingRef.current = true;
      setDialogueBlocksInteractive(workspace, false);
      workspace.clearUndo();

      const mutation = (async () => {
        let saved = false;

        try {
          saved = await action();
        } catch (error: unknown) {
          console.error(
            '同步 Blockly 操作失败',
            error,
          );
        }

        // 组件可能已被卸载，不能继续访问已销毁的 workspace。
        if (!isActive) {
          return saved;
        }

        if (!saved) {
          // C++ 拒绝操作时，用最后一次成功快照恢复。
          renderSceneSnapshot(
            sceneRef.current,
            layoutKeyRef.current,
            false,
          );
        }

        isSavingRef.current = false;
        setDialogueBlocksInteractive(
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

    flushPendingDraftRef.current = async () => {
      // 已经在同步某个 Blockly 动作时，先等它的成败结果。
      // 失败必须阻止后续项目文件保存。
      if (activeMutation) {
        return activeMutation;
      }

      const currentScene = sceneRef.current;
      const drafts = collectDialogueFieldDrafts(
        workspace,
        currentScene,
      );
      draftDirtyChangeRef.current(drafts.length > 0);

      return saveWorkspaceMutation(async () => {
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

        return true;
      }, { keepLockedOnSuccess: true });
    };

    const selection = createBlockSelectionController(
      container,
      workspace,
      sceneRef.current,
    );
    selectionRef.current = selection;

    const requestDelete = (draggedNodeId: string | null) => {
      if (isSavingRef.current) {
        return;
      }

      const currentScene = sceneRef.current;

      if (
        draggedNodeId &&
        !currentScene.nodes.some(
          (node) => node.id === draggedNodeId,
        )
      ) {
        // 工具箱刚生成的临时 ID 不属于 C++ Project。
        return;
      }

      const selectedNodeIds = selection.getSelectedNodeIds();
      const nodeIds = draggedNodeId
        ? selectedNodeIds.includes(draggedNodeId)
          ? selectedNodeIds
          : [draggedNodeId]
        : selectedNodeIds;

      if (nodeIds.length === 0) {
        return;
      }

      void saveWorkspaceMutation(() =>
        deleteDialogueRef.current({
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
        canStart: () => !isSavingRef.current,
        onDelete: () => requestDelete(null),
        onMoveAll: (deltaX, deltaY) => {
          const firstNodeId = sceneRef.current.nodes[0]?.id;
          const firstBlock = firstNodeId
            ? workspace.getBlockById(firstNodeId)
            : null;

          if (!(firstBlock instanceof Blockly.BlockSvg)) {
            return;
          }

          const rootBlock = firstBlock.getRootBlock();
          if (!(rootBlock instanceof Blockly.BlockSvg)) {
            return;
          }

          // 全选时没有剧情上的插入锚点，只移动整条链的画布位置。
          // 禁用事件，避免这次纯布局移动被误判成对白重排。
          Blockly.Events.disable();
          try {
            rootBlock.moveBy(deltaX, deltaY, [
              'vn-group-layout',
            ]);
          } finally {
            Blockly.Events.enable();
          }

          workspace.resizeContents();
          rememberProjectedLayout({
            preferredRoot: rootBlock,
          });
        },
        onReorder: (params) => {
          if (isSavingRef.current) {
            return;
          }

          void saveWorkspaceMutation(() =>
            reorderDialoguesRef.current(params),
          );
        },
      },
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
        !workspace.isDragging() &&
        !groupDrag.isActive() &&
        !Blockly.getFocusManager().ephemeralFocusTaken() &&
        selection.getSelectedNodeIds().length > 0,
      callback: (_shortcutWorkspace, event) => {
        event.preventDefault();
        requestDelete(null);
        return true;
      },
      displayText: '删除选中的对白',
    });

    const handleWorkspaceChange = (
      event: Blockly.Events.Abstract,
    ) => {
      const currentScene = sceneRef.current;

      if (
        event.type ===
        Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE
      ) {
        // Blockly 输入框尚未失焦时也要立即更新“未保存”。
        // 这个事件不写 C++，只报告 Renderer 草稿状态。
        draftDirtyChangeRef.current(
          collectDialogueFieldDrafts(workspace, currentScene)
            .length > 0,
        );
        return;
      }

      if (event.type === Blockly.Events.SELECTED) {
        const selectedEvent = event as Blockly.Events.Selected;
        const selectedNodeId = selectedEvent.newElementId;

        // 只让正式对白改变业务选择。垃圾桶/工具箱获得焦点时可能
        // 发出 SELECTED(null)，但不应该把准备删除的多选清空。
        if (
          selectedNodeId &&
          currentScene.nodes.some(
            (node) => node.id === selectedNodeId,
          )
        ) {
          selection.selectOnly(selectedNodeId);
        }
        return;
      }

      if (isSavingRef.current) {
        return;
      }

      if (event.type === Blockly.Events.BLOCK_MOVE) {
        const moveEvent = event as Blockly.Events.BlockMove;
        const movedPersistedDialogue =
          moveEvent.blockId &&
          moveEvent.reason?.includes('drag') &&
          currentScene.nodes.some(
            (node) => node.id === moveEvent.blockId,
          );

        if (movedPersistedDialogue) {
          // 单块场景移动、或重新吸附成完整链后，记录用户选择的新位置。
          rememberProjectedLayout();
        }
      }

      const reorder = getReorderedDialogueBlock(
        event,
        workspace,
        currentScene,
      );

      if (reorder) {
        void saveWorkspaceMutation(() =>
          reorderDialogueRef.current({
            sceneId: currentScene.id,
            nodeId: reorder.nodeId,
            beforeNodeId: reorder.beforeNodeId,
          }),
        );

        return;
      }

      const newDialogueDrop = getDroppedNewDialogueBlock(
        event,
        workspace,
        currentScene,
      );

      if (newDialogueDrop) {
        const { block, beforeNodeId } = newDialogueDrop;

        if (currentScene.nodes.length === 0) {
          // 空场景第一块使用用户实际放下的位置，而不是默认左上角。
          rememberProjectedLayout({ preferredRoot: block });
        }

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
              block.getFieldValue(
                DIALOGUE_BLOCK_FIELDS.speaker,
              ) ?? '',
            ).trim()
              ? {
                  speaker: String(
                    block.getFieldValue(
                      DIALOGUE_BLOCK_FIELDS.speaker,
                    ) ?? '',
                  ),
                }
              : {}),
            ...(String(
              block.getFieldValue(
                DIALOGUE_BLOCK_FIELDS.text,
              ) ?? '',
            ).trim()
              ? {
                  text: String(
                    block.getFieldValue(
                      DIALOGUE_BLOCK_FIELDS.text,
                    ) ?? '',
                  ),
                }
              : {}),
          }),
        );

        return;
      }

      const update = getDialogueFieldUpdate(
        event,
        workspace,
        currentScene,
      );

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
    Blockly.svgResize(workspace);
    workspace.addChangeListener(
      handleWorkspaceChange,
    );

    return () => {
      isActive = false;
      flushPendingDraftRef.current = async () => true;
      draftDirtyChangeRef.current(false);
      rememberProjectedLayout();
      requestDeleteFromTrash = () => {};
      Blockly.ShortcutRegistry.registry.unregister(
        deleteShortcutName,
      );
      groupDrag.dispose();
      groupDragRef.current = null;
      selection.dispose();
      selectionRef.current = null;
      workspace.removeChangeListener(
        handleWorkspaceChange,
      );
      resizeObserver.disconnect();
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
    renderSceneSnapshot(scene, layoutKey);

    // 如果旧场景仍在保存，新投影也暂时不能编辑。
    setDialogueBlocksInteractive(
      workspace,
      !isSavingRef.current,
    );
  }, [layoutKey, scene]);

  // 项目文件保存期间也要锁住 Blockly。否则草稿刚 flush
  // 完，用户又能在磁盘写入结束前继续修改字段。
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    setDialogueBlocksInteractive(
      workspace,
      !isBusy && !isSavingRef.current,
    );
  }, [isBusy]);

  return (
    <div
      ref={containerRef}
      className="blockly-workspace"
    />
  );
});
