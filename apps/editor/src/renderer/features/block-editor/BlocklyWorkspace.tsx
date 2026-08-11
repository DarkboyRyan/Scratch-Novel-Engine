import { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';

import type { SceneDocument } from '../../../shared/projectTypes';
import type {
  AddDialogueAction,
  UpdateDialogueAction,
} from '../../hooks/useEngineProject';
import {
  DIALOGUE_BLOCK_TYPE,
  registerDialogueBlock,
} from './blocks/dialogueBlock';
import {
  getDialogueFieldUpdate,
  getDroppedNewDialogueBlock,
} from './dialogueBlockEvents';
import { projectSceneToWorkspace } from './projectSceneToWorkspace';
import { blockEditorToolbox } from './toolbox';

type BlocklyWorkspaceProps = {
  scene: SceneDocument;
  onDialogueAdd: AddDialogueAction;
  onDialogueUpdate: UpdateDialogueAction;
};

function setDialogueBlocksEditable(
  workspace: Blockly.WorkspaceSvg,
  editable: boolean,
): void {
  const dialogueBlocks = workspace.getBlocksByType(
    DIALOGUE_BLOCK_TYPE,
    false,
  );

  for (const block of dialogueBlocks) {
    block.setEditable(editable);
  }
}

export function BlocklyWorkspace({
  scene,
  onDialogueAdd,
  onDialogueUpdate,
}: BlocklyWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef =
    useRef<Blockly.WorkspaceSvg | null>(null);

  // Listener 只注册一次，但始终需要读取最新 props。
  const sceneRef = useRef(scene);
  const addDialogueRef = useRef(onDialogueAdd);
  const updateDialogueRef = useRef(onDialogueUpdate);
  const isSavingRef = useRef(false);

  sceneRef.current = scene;
  addDialogueRef.current = onDialogueAdd;
  updateDialogueRef.current = onDialogueUpdate;

  // Effect 1：Blockly 生命周期和事件监听。
  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    registerDialogueBlock();

    const workspace = Blockly.inject(container, {
      toolbox: blockEditorToolbox,
      readOnly: false,
      scrollbars: true,
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

    workspaceRef.current = workspace;

    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });

    let isActive = true;

    const saveWorkspaceMutation = (
      action: () => Promise<boolean>,
    ) => {
      isSavingRef.current = true;
      setDialogueBlocksEditable(workspace, false);
      workspace.clearUndo();

      void (async () => {
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
          return;
        }

        if (!saved) {
          // C++ 拒绝操作时，用最后一次成功快照恢复。
          projectSceneToWorkspace(
            sceneRef.current,
            workspace,
          );
        }

        isSavingRef.current = false;
        setDialogueBlocksEditable(workspace, true);
        workspace.clearUndo();
      })();
    };

    const handleWorkspaceChange = (
      event: Blockly.Events.Abstract,
    ) => {
      if (isSavingRef.current) {
        return;
      }

      const currentScene = sceneRef.current;
      const newBlock = getDroppedNewDialogueBlock(
        event,
        workspace,
        currentScene,
      );

      if (newBlock) {
        // 这里只锁定 Blockly 的临时积木；正式 ID 仍由 C++ 生成。
        newBlock.setMovable(false);
        newBlock.setDeletable(false);
        newBlock.setEditable(false);
        newBlock.contextMenu = false;

        saveWorkspaceMutation(() =>
          addDialogueRef.current(currentScene.id),
        );

        return;
      }

      const update = getDialogueFieldUpdate(
        event,
        workspace,
      );

      if (!update) {
        return;
      }

      saveWorkspaceMutation(() =>
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
      workspace.removeChangeListener(
        handleWorkspaceChange,
      );
      resizeObserver.disconnect();
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

    projectSceneToWorkspace(scene, workspace);

    // 如果旧场景仍在保存，新投影也暂时不能编辑。
    setDialogueBlocksEditable(
      workspace,
      !isSavingRef.current,
    );
  }, [scene]);

  return (
    <div
      ref={containerRef}
      className="blockly-workspace"
    />
  );
}
