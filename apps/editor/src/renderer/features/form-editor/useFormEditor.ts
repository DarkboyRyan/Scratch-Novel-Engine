import { useEffect, useState } from 'react';

import type { DialogueNode } from '../../../shared/projectTypes';
import { EMPTY_DIALOGUE_MESSAGE } from '../../editorMessages';
import type { EngineProjectState } from '../../hooks/useEngineProject';

// Controller hook 负责 Renderer 状态、选择规则以及调用 C++。
// 组件只接收数据和事件，不直接知道 IPC 协议。
export function useFormEditor({
  project,
  isBusy,
  engineMessage,
  setEngineMessage,
  runEngineAction,
}: EngineProjectState) {
  const [selectedSceneId, setSelectedSceneId] =
    useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);

  // 输入框草稿仍属于界面状态：输入时无需为每个按键都调用 C++。
  const [speaker, setSpeaker] = useState('');
  const [text, setText] = useState('');

  // 后端操作可能删除当前场景；Project 快照改变后修正失效的 UI 选择。
  useEffect(() => {
    if (!project) {
      return;
    }

    setSelectedSceneId((currentSceneId) => {
      const currentSceneStillExists =
        currentSceneId !== null &&
        project.scenes.some(
          (projectScene) => projectScene.id === currentSceneId,
        );

      return currentSceneStillExists
        ? currentSceneId
        : project.entrySceneId;
    });
  }, [project]);

  const scene = project
    ? (project.scenes.find(
        (projectScene) => projectScene.id === selectedSceneId,
      ) ?? project.scenes[0])
    : null;

  const selectedNode = scene?.nodes.find(
    (node) => node.id === selectedNodeId,
  );

  // 如果其他编辑模式更新了当前节点，就用 C++ 最新快照刷新表单草稿。
  // 依赖具体字段值，避免无关的 Project 更新覆盖未提交草稿。
  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    setSpeaker(selectedNode.speaker);
    setText(selectedNode.text);
  }, [
    selectedNode?.id,
    selectedNode?.speaker,
    selectedNode?.text,
  ]);

  function startNewDialogue() {
    setSelectedNodeId(null);
    setSpeaker('');
    setText('');
  }

  function selectNode(node: DialogueNode) {
    setSelectedNodeId(node.id);
    setSpeaker(node.speaker);
    setText(node.text);
  }

  async function addScene() {
    // 不再由 React 计算“场景 N”或生成 ID；C++ 统一负责这些规则。
    const result = await runEngineAction(() =>
      window.vnEngine.addScene(),
    );

    if (!result?.sceneId) {
      return;
    }

    setSelectedSceneId(result.sceneId);
    startNewDialogue();
  }

  function selectScene(nextSceneId: string) {
    if (
      !project ||
      !scene ||
      nextSceneId === scene.id ||
      !project.scenes.some(
        (projectScene) => projectScene.id === nextSceneId,
      )
    ) {
      return;
    }

    setSelectedSceneId(nextSceneId);
    startNewDialogue();
  }

  async function insertEmptyDialogue() {
    if (!scene) {
      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addDialogue(scene.id, selectedNodeId),
    );

    if (!result?.nodeId) {
      return;
    }

    const updatedScene = result.project.scenes.find(
      (projectScene) => projectScene.id === scene.id,
    );
    const createdNode = updatedScene?.nodes.find(
      (node) => node.id === result.nodeId,
    );

    if (createdNode) {
      selectNode(createdNode);
    }
  }

  async function submitDialogue() {
    if (!scene) {
      return;
    }

    // 这是为了即时提示；C++ 也会执行同样的最终校验。
    if (!text.trim()) {
      setEngineMessage(EMPTY_DIALOGUE_MESSAGE);
      return;
    }

    if (selectedNode) {
      const result = await runEngineAction(() =>
        window.vnEngine.updateDialogue(
          scene.id,
          selectedNode.id,
          speaker,
          text,
        ),
      );

      const savedNode = result?.project.scenes
        .find((projectScene) => projectScene.id === scene.id)
        ?.nodes.find((node) => node.id === selectedNode.id);

      if (savedNode) {
        // 使用 C++ 规范化后的值，例如空角色名会变成“旁白”。
        selectNode(savedNode);
      }

      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addDialogue(
        scene.id,
        null,
        speaker,
        text,
      ),
    );

    if (result) {
      // 保持原有连续录入体验：加入后回到空的新建表单。
      startNewDialogue();
    }
  }

  async function deleteDialogue(nodeId: string) {
    if (!scene) {
      return;
    }

    const nodeToDelete = scene.nodes.find(
      (node) => node.id === nodeId,
    );

    if (!nodeToDelete) {
      return;
    }

    const speakerLabel = nodeToDelete.speaker || '未命名角色';
    const shouldDelete = window.confirm(
      `确定删除 ${speakerLabel} 的这条对白吗？`,
    );

    if (!shouldDelete) {
      return;
    }

    // “删除哪条”由 C++ 决定；“删除后界面选中谁”仍是 UI 导航规则。
    const selectedIndex = scene.nodes.findIndex(
      (node) => node.id === nodeId,
    );
    const remainingNodeIds = scene.nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => node.id);
    const nextNodeId =
      remainingNodeIds[selectedIndex] ??
      remainingNodeIds[selectedIndex - 1];

    const result = await runEngineAction(() =>
      window.vnEngine.deleteDialogue(scene.id, nodeId),
    );

    if (!result || nodeId !== selectedNodeId) {
      return;
    }

    const updatedScene = result.project.scenes.find(
      (projectScene) => projectScene.id === scene.id,
    );
    const nextNode = updatedScene?.nodes.find(
      (node) => node.id === nextNodeId,
    );

    if (nextNode) {
      selectNode(nextNode);
    } else {
      startNewDialogue();
    }
  }

  async function moveDialogue(
    nodeId: string,
    direction: -1 | 1,
  ) {
    if (!scene) {
      return;
    }

    await runEngineAction(() =>
      window.vnEngine.moveDialogue(
        scene.id,
        nodeId,
        direction,
      ),
    );
  }

  return {
    project,
    scene,
    selectedNode,
    selectedNodeId,
    speaker,
    text,
    previewSpeaker: speaker.trim(),
    previewText: text,
    isBusy,
    engineMessage,
    setSpeaker,
    setText,
    addScene,
    selectScene,
    insertEmptyDialogue,
    selectNode,
    submitDialogue,
    deleteDialogue,
    moveDialogue,
  };
}

export type FormEditorState = ReturnType<typeof useFormEditor>;
