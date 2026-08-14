import { useEffect, useRef, useState } from 'react';

import type {
  BackgroundNode,
  CharacterNode,
  CharacterSlot,
  SceneJumpNode,
  SceneNode,
} from '../../../shared/projectTypes';
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
  const selectedDialogue =
    selectedNode?.type === 'dialogue' ? selectedNode : undefined;
  const selectedBackground =
    selectedNode?.type === 'background' ? selectedNode : undefined;
  const selectedCharacter =
    selectedNode?.type === 'character' ? selectedNode : undefined;
  const selectedSceneJump =
    selectedNode?.type === 'sceneJump' ? selectedNode : undefined;

  // 图形化编辑器可能删除表单当前选中的节点。Project 更新后清理
  // 失效选择，避免切回表单时还显示已经删除的对白草稿。
  useEffect(() => {
    if (
      !scene ||
      selectedNodeId === null ||
      scene.nodes.some((node) => node.id === selectedNodeId)
    ) {
      return;
    }

    setSelectedNodeId(null);
    setSpeaker('');
    setText('');
  }, [scene, selectedNodeId]);

  // 如果其他编辑模式更新了当前节点，就用 C++ 最新快照刷新表单草稿。
  // 依赖具体字段值，避免无关的 Project 更新覆盖未提交草稿。
  useEffect(() => {
    if (!selectedDialogue) {
      if (selectedNode && selectedNode.type !== 'dialogue') {
        setSpeaker('');
        setText('');
      }
      return;
    }

    setSpeaker(selectedDialogue.speaker);
    setText(selectedDialogue.text);
  }, [
    selectedDialogue?.id,
    selectedDialogue?.speaker,
    selectedDialogue?.text,
    selectedNode?.type,
  ]);

  function startNewDialogue() {
    setSelectedNodeId(null);
    setSpeaker('');
    setText('');
  }

  function resetEditorState() {
    setSelectedSceneId(null);
    startNewDialogue();
  }

  const draftDirty = selectedDialogue
    ? speaker !== selectedDialogue.speaker ||
      text !== selectedDialogue.text
    : selectedNode
      ? false
      : speaker.length > 0 || text.length > 0;
  const commitInProgressRef = useRef<Promise<boolean> | null>(null);

  async function commitPendingDraft(): Promise<boolean> {
    if (commitInProgressRef.current) {
      return commitInProgressRef.current;
    }

    const commit = async (): Promise<boolean> => {
      if (!draftDirty) {
        return true;
      }

      if (!text.trim()) {
        setEngineMessage(EMPTY_DIALOGUE_MESSAGE);
        return false;
      }

      if (!scene) {
        return false;
      }

      if (selectedDialogue) {
        const result = await runEngineAction(() =>
          window.vnEngine.updateDialogue(
            scene.id,
            selectedDialogue.id,
            speaker,
            text,
          ),
        );

        const savedNode = result?.project.scenes
          .find((projectScene) => projectScene.id === scene.id)
          ?.nodes.find((node) => node.id === selectedDialogue.id);
        if (savedNode?.type === 'dialogue') {
          applyNodeSelection(savedNode);
        }
        return result !== null;
      }

      const result = await runEngineAction(() =>
        window.vnEngine.addDialogue({
          sceneId: scene.id,
          afterNodeId: null,
          speaker,
          text,
        }),
      );
      if (result) {
        startNewDialogue();
      }
      return result !== null;
    };

    const pendingCommit = commit();
    commitInProgressRef.current = pendingCommit;
    try {
      return await pendingCommit;
    } finally {
      commitInProgressRef.current = null;
    }
  }

  function applyNodeSelection(node: SceneNode) {
    setSelectedNodeId(node.id);
    if (node.type === 'dialogue') {
      setSpeaker(node.speaker);
      setText(node.text);
    } else {
      setSpeaker('');
      setText('');
    }
  }

  async function selectNode(node: SceneNode): Promise<void> {
    if (node.id === selectedNodeId) {
      return;
    }

    if (await commitPendingDraft()) {
      applyNodeSelection(node);
    }
  }

  async function addScene() {
    if (!(await commitPendingDraft())) {
      return;
    }

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

  async function selectScene(nextSceneId: string) {
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

    if (!(await commitPendingDraft())) {
      return;
    }

    setSelectedSceneId(nextSceneId);
    startNewDialogue();
  }

  async function insertEmptyDialogue() {
    const anchorNodeId = selectedNodeId;
    if (!scene || !(await commitPendingDraft())) {
      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addDialogue({
        sceneId: scene.id,
        afterNodeId: anchorNodeId,
      }),
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

    if (createdNode?.type === 'dialogue') {
      applyNodeSelection(createdNode);
    }
  }

  async function insertBackground() {
    const anchorNodeId = selectedNodeId;
    if (!scene || !(await commitPendingDraft())) {
      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addBackground({
        sceneId: scene.id,
        afterNodeId: anchorNodeId,
      }),
    );

    if (!result?.nodeId) {
      return;
    }

    const createdNode = result.project.scenes
      .find((projectScene) => projectScene.id === scene.id)
      ?.nodes.find((node) => node.id === result.nodeId);

    if (createdNode?.type === 'background') {
      applyNodeSelection(createdNode);
    }
  }

  async function insertCharacter() {
    const anchorNodeId = selectedNodeId;
    if (!scene || !(await commitPendingDraft())) {
      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addCharacter({
        sceneId: scene.id,
        afterNodeId: anchorNodeId,
      }),
    );

    if (!result?.nodeId) {
      return;
    }

    const createdNode = result.project.scenes
      .find((projectScene) => projectScene.id === scene.id)
      ?.nodes.find((node) => node.id === result.nodeId);

    if (createdNode?.type === 'character') {
      applyNodeSelection(createdNode);
    }
  }

  async function insertSceneJump() {
    const anchorNodeId = selectedNodeId;
    const targetScene = project?.scenes.find(
      (projectScene) => projectScene.id !== scene?.id,
    );
    if (!scene || !targetScene || !(await commitPendingDraft())) {
      return;
    }

    const result = await runEngineAction(() =>
      window.vnEngine.addSceneJump({
        sceneId: scene.id,
        targetSceneId: targetScene.id,
        afterNodeId: anchorNodeId,
      }),
    );
    const createdNode = result?.project.scenes
      .find((projectScene) => projectScene.id === scene.id)
      ?.nodes.find((node) => node.id === result.nodeId);
    if (createdNode?.type === 'sceneJump') {
      applyNodeSelection(createdNode);
    }
  }

  async function updateBackgroundNode(
    node: BackgroundNode,
    assetId: string | null,
  ) {
    if (!scene || node.assetId === assetId) {
      return;
    }

    await runEngineAction(() =>
      window.vnEngine.updateBackground({
        sceneId: scene.id,
        nodeId: node.id,
        assetId,
      }),
    );
  }

  async function updateCharacterNode(
    node: CharacterNode,
    next: {
      assetId: string | null;
      slot: CharacterSlot;
      layer: number;
    },
  ) {
    if (
      !scene ||
      (node.assetId === next.assetId &&
        node.slot === next.slot &&
        node.layer === next.layer)
    ) {
      return;
    }

    await runEngineAction(() =>
      window.vnEngine.updateCharacter({
        sceneId: scene.id,
        nodeId: node.id,
        ...next,
      }),
    );
  }

  async function updateSceneJumpNode(
    node: SceneJumpNode,
    targetSceneId: string,
  ) {
    if (!scene || node.targetSceneId === targetSceneId) {
      return;
    }
    await runEngineAction(() =>
      window.vnEngine.updateSceneJump({
        sceneId: scene.id,
        nodeId: node.id,
        targetSceneId,
      }),
    );
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

    // 点击提交和 Cmd/Ctrl+S 保存前提交共用同一个
    // single-flight Promise。否则“加入剧情”尚未返回时立刻保存，
    // 两条路径可能各自向 C++ 新增一次相同对白。
    await commitPendingDraft();
  }

  async function deleteNode(nodeId: string) {
    if (!scene) {
      return;
    }

    const nodeToDelete = scene.nodes.find(
      (node) => node.id === nodeId,
    );

    if (!nodeToDelete) {
      return;
    }

    const nodeLabel =
      nodeToDelete.type === 'dialogue'
        ? `${nodeToDelete.speaker || '未命名角色'} 的这条对白`
        : nodeToDelete.type === 'background'
          ? '这个背景切换'
          : nodeToDelete.type === 'character'
            ? '这个人物立绘节点'
            : '这个场景跳转节点';
    const shouldDelete = window.confirm(
      `确定删除${nodeLabel}吗？`,
    );

    if (!shouldDelete) {
      return;
    }

    // 删除其他节点也会返回完整 Project 快照。先提交当前对白草稿，
    // 避免这次重投影把正在编辑的内容覆盖掉。删除当前节点本身则是
    // 用户明确确认的丢弃操作，不要求先保存即将删除的草稿。
    if (
      nodeId !== selectedNodeId &&
      !(await commitPendingDraft())
    ) {
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
      window.vnEngine.deleteTimelineNodes({
        sceneId: scene.id,
        nodeIds: [nodeId],
      }),
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
      applyNodeSelection(nextNode);
    } else {
      startNewDialogue();
    }
  }

  async function moveNode(
    nodeId: string,
    direction: -1 | 1,
  ) {
    if (!scene) {
      return;
    }

    const wasCreatingDialogue =
      selectedNodeId === null && draftDirty;
    if (!(await commitPendingDraft())) {
      return;
    }

    // 新对白提交会改变时间线长度，而且新 ID 只存在于返回快照中。
    // 本次点击先完成创建，避免再使用提交前的旧索引错误地跨两格移动；
    // 用户随后可在已经刷新后的时间线中执行明确的移动操作。
    if (wasCreatingDialogue) {
      return;
    }

    const currentIndex = scene.nodes.findIndex(
      (node) => node.id === nodeId,
    );
    if (currentIndex < 0) {
      return;
    }

    const beforeNodeId =
      direction === -1
        ? scene.nodes[currentIndex - 1]?.id
        : scene.nodes[currentIndex + 2]?.id ?? null;

    if (direction === -1 && !beforeNodeId) {
      return;
    }

    await runEngineAction(() =>
      window.vnEngine.reorderTimelineNode({
        sceneId: scene.id,
        nodeId,
        beforeNodeId,
      }),
    );
  }

  return {
    project,
    scene,
    selectedNode,
    selectedDialogue,
    selectedBackground,
    selectedCharacter,
    selectedSceneJump,
    selectedNodeId,
    speaker,
    text,
    previewSpeaker: speaker.trim(),
    previewText: text,
    isBusy,
    engineMessage,
    draftDirty,
    setSpeaker,
    setText,
    addScene,
    selectScene,
    insertEmptyDialogue,
    insertBackground,
    insertCharacter,
    insertSceneJump,
    updateBackgroundNode,
    updateCharacterNode,
    updateSceneJumpNode,
    selectNode,
    submitDialogue,
    deleteNode,
    moveNode,
    resetEditorState,
    commitPendingDraft,
  };
}

export type FormEditorState = ReturnType<typeof useFormEditor>;
