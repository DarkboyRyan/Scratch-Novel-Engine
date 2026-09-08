/**
 * 文件主要作用：集中管理表单编辑器选择状态、草稿和创作命令。
 * 包含实现：`useFormEditor`、`moveNode`、`FormEditorState`。
 */

import { useEffect, useRef, useState } from 'react';

import type {
  BackgroundNode,
  BgmNode,
  CharacterMode,
  CharacterNode,
  CharacterSlot,
  CharacterPosition,
  DialogueNode,
  FormVisibleSceneNode,
  SceneJumpNode,
  VideoNode,
} from '../../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  formVisibleSceneNodes,
  isImageScalePercent,
  isSemanticSceneNode,
} from '../../../shared/projectTypes';
import type { FormEditorPort } from '../../application/authoringPorts';
import { useEditorLabels } from '../../i18n/editorLocalization';
import {
  getCharacterInsertionPlan,
  getFormNodeMovePlan,
} from './formLogicTree';
import {
  localizeGeneratedSceneName,
  nextLocalizedGeneratedSceneName,
} from '../start-screen/startScreenScene';

function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[\t-\r ]+|[\t-\r ]+$/gu, '');
}

type ImageScaleDraft = {
  projectId: string;
  sceneId: string;
  nodeId: string;
  value: string;
};

function parseImageScaleDraft(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const scalePercent = Number(value);
  return isImageScalePercent(scalePercent) ? scalePercent : null;
}

// Controller hook 负责 Renderer 状态、选择规则以及调用 C++。
// 组件只接收数据和事件，不直接知道 IPC 协议。
export function useFormEditor({
  project,
  isBusy,
  engineMessage,
  runEngineAction,
  authoringCommands,
}: FormEditorPort) {
  const labels = useEditorLabels();
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // 输入框草稿仍属于界面状态：输入时无需为每个按键都调用 C++。
  const [speaker, setSpeaker] = useState('');
  const [text, setText] = useState('');
  const [imageScaleDraft, setImageScaleDraftState] =
    useState<ImageScaleDraft | null>(null);
  const imageScaleDraftRef = useRef<ImageScaleDraft | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [sceneNameDraft, setSceneNameDraftState] = useState('');
  const sceneNameDraftTouchedRef = useRef(false);
  const [sceneRenameErrorKind, setSceneRenameErrorKind] = useState<
    'required' | 'failed' | null
  >(null);
  const [isRenamingScene, setIsRenamingScene] = useState(false);
  const sceneRenameCommitRef = useRef<Promise<boolean> | null>(null);
  const sceneRenameGenerationRef = useRef(0);
  const imageScaleCommitRef = useRef<Promise<boolean> | null>(null);

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

      return currentSceneStillExists ? currentSceneId : project.entrySceneId;
    });
  }, [project]);

  const scene = project
    ? (project.scenes.find(
        (projectScene) => projectScene.id === selectedSceneId,
      ) ?? project.scenes[0])
    : null;

  // Paired Else/End markers are an author-file implementation detail. The
  // form editor exposes only real selectable nodes; its tree view supplies
  // branch labels and indentation separately.
  const storyNodes = scene ? formVisibleSceneNodes(scene) : [];

  // A scene-name draft belongs to the selected form surface. Project or scene
  // replacement discards that transient state; language changes retain the
  // author's text and only retranslate surrounding labels and errors.
  useEffect(() => {
    sceneRenameGenerationRef.current += 1;
    sceneNameDraftTouchedRef.current = false;
    setEditingSceneId(null);
    setSceneNameDraftState('');
    setSceneRenameErrorKind(null);
    setIsRenamingScene(false);
    imageScaleDraftRef.current = null;
    setImageScaleDraftState(null);
  }, [project?.id, scene?.id]);

  const selectedNode = storyNodes.find((node) => node.id === selectedNodeId);
  const selectedDialogue =
    selectedNode?.type === 'dialogue' ? selectedNode : undefined;
  const selectedBackground =
    selectedNode?.type === 'background' ? selectedNode : undefined;
  const selectedCharacter =
    selectedNode?.type === 'character' ? selectedNode : undefined;
  const selectedSceneJump =
    selectedNode?.type === 'sceneJump' ? selectedNode : undefined;
  const selectedBgm = selectedNode?.type === 'bgm' ? selectedNode : undefined;
  const selectedVideo =
    selectedNode?.type === 'video' ? selectedNode : undefined;
  const selectedChoice =
    selectedNode?.type === 'choice' ? selectedNode : undefined;
  const selectedScalableImageNode = selectedBackground ??
    (selectedCharacter?.mode === 'show' ? selectedCharacter : undefined);
  const activeImageScaleDraft =
    project && scene && selectedScalableImageNode &&
      imageScaleDraft?.projectId === project.id &&
      imageScaleDraft.sceneId === scene.id &&
      imageScaleDraft.nodeId === selectedScalableImageNode.id
      ? imageScaleDraft
      : null;
  const selectedImageScaleDraft = activeImageScaleDraft?.value ??
    String(selectedScalableImageNode?.scalePercent ?? DEFAULT_IMAGE_SCALE_PERCENT);
  const selectedImageScalePercent = parseImageScaleDraft(
    selectedImageScaleDraft,
  );
  const imageScaleDraftDirty = Boolean(
    selectedScalableImageNode &&
      activeImageScaleDraft &&
      activeImageScaleDraft.value !==
        String(selectedScalableImageNode.scalePercent),
  );

  // 图形化编辑器可能删除表单当前选中的节点。Project 更新后清理
  // 失效选择，避免切回表单时还显示已经删除的对白草稿。
  useEffect(() => {
    if (
      !scene ||
      selectedNodeId === null ||
      storyNodes.some((node) => node.id === selectedNodeId)
    ) {
      return;
    }

    setSelectedNodeId(null);
    setSpeaker('');
    setText('');
    imageScaleDraftRef.current = null;
    setImageScaleDraftState(null);
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
    imageScaleDraftRef.current = null;
    setImageScaleDraftState(null);
  }

  function resetEditorState() {
    setSelectedSceneId(null);
    cancelSceneRename();
    startNewDialogue();
  }

  const dialogueDraftDirty = selectedDialogue
    ? speaker !== selectedDialogue.speaker || text !== selectedDialogue.text
    : selectedNode
      ? false
      : speaker.length > 0 || text.length > 0;
  const editingScene = project?.scenes.find(
    (projectScene) => projectScene.id === editingSceneId,
  );
  const sceneRenameDraftDirty = Boolean(
    editingScene && sceneNameDraft !== editingScene.name,
  );
  const sceneRenameError = sceneRenameErrorKind === 'required'
    ? labels.scenes.sceneNameRequired
    : sceneRenameErrorKind === 'failed'
      ? labels.scenes.renameSceneFailed
      : null;
  const draftDirty =
    dialogueDraftDirty || sceneRenameDraftDirty || imageScaleDraftDirty;
  const commitInProgressRef = useRef<Promise<boolean> | null>(null);
  // “+立绘”也可以提交尚未创建的对白。保留该次 C++ 分配的 ID，
  // 让紧接着创建的人物节点放到这条对白之后。
  const lastCreatedDialogueIdRef = useRef<string | null>(null);

  async function commitDialogueDraft(forceCreate = false): Promise<boolean> {
    if (commitInProgressRef.current) {
      return commitInProgressRef.current;
    }

    const commit = async (): Promise<boolean> => {
      if (!dialogueDraftDirty && !forceCreate) {
        return true;
      }

      if (!scene) {
        return false;
      }

      if (selectedDialogue) {
        const result = await runEngineAction(() =>
          authoringCommands.updateDialogue(
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
        authoringCommands.addDialogue({
          sceneId: scene.id,
          afterNodeId: null,
          speaker,
          text,
        }),
      );
      lastCreatedDialogueIdRef.current = result?.nodeId ?? null;
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

  function setSelectedImageScaleDraft(value: string): void {
    if (!project || !scene || !selectedScalableImageNode) {
      return;
    }
    const nextDraft: ImageScaleDraft = {
      projectId: project.id,
      sceneId: scene.id,
      nodeId: selectedScalableImageNode.id,
      value,
    };
    imageScaleDraftRef.current = nextDraft;
    setImageScaleDraftState(nextDraft);
  }

  function currentImageScaleDraftValue(
    node: BackgroundNode | CharacterNode,
  ): string {
    const current = imageScaleDraftRef.current;
    return project && scene &&
        current?.projectId === project.id &&
        current.sceneId === scene.id &&
        current.nodeId === node.id
      ? current.value
      : String(node.scalePercent);
  }

  function clearCommittedImageScaleDraft(
    owner: Pick<ImageScaleDraft, 'projectId' | 'sceneId' | 'nodeId'>,
    committedValue: string,
  ): void {
    const matches = (candidate: ImageScaleDraft | null) =>
      candidate?.projectId === owner.projectId &&
      candidate.sceneId === owner.sceneId &&
      candidate.nodeId === owner.nodeId &&
      candidate.value === committedValue;
    if (matches(imageScaleDraftRef.current)) {
      imageScaleDraftRef.current = null;
    }
    setImageScaleDraftState((current) => matches(current) ? null : current);
  }

  async function commitSelectedImageScaleDraft(): Promise<boolean> {
    if (imageScaleCommitRef.current) {
      return imageScaleCommitRef.current;
    }
    if (!project || !scene || !selectedScalableImageNode) {
      return true;
    }

    const owner = {
      projectId: project.id,
      sceneId: scene.id,
      nodeId: selectedScalableImageNode.id,
    };
    const rawValue = currentImageScaleDraftValue(selectedScalableImageNode);
    const scalePercent = parseImageScaleDraft(rawValue);
    if (scalePercent === null) {
      return false;
    }
    if (scalePercent === selectedScalableImageNode.scalePercent) {
      clearCommittedImageScaleDraft(owner, rawValue);
      return true;
    }

    const commit = (async (): Promise<boolean> => {
      const result = selectedScalableImageNode.type === 'background'
        ? await runEngineAction(() =>
            authoringCommands.updateBackground({
              sceneId: scene.id,
              nodeId: selectedScalableImageNode.id,
              assetId: selectedScalableImageNode.assetId,
              scalePercent,
            }))
        : await runEngineAction(() =>
            authoringCommands.updateCharacter({
              sceneId: scene.id,
              nodeId: selectedScalableImageNode.id,
              mode: selectedScalableImageNode.mode,
              assetId: selectedScalableImageNode.assetId,
              slot: selectedScalableImageNode.slot,
              layer: selectedScalableImageNode.layer,
              position: selectedScalableImageNode.position,
              scalePercent,
            }));
      if (result === null) {
        return false;
      }
      clearCommittedImageScaleDraft(owner, rawValue);
      return true;
    })();
    imageScaleCommitRef.current = commit;
    try {
      return await commit;
    } finally {
      if (imageScaleCommitRef.current === commit) {
        imageScaleCommitRef.current = null;
      }
    }
  }

  function beginSceneRename(sceneId: string): void {
    const targetSceneIndex =
      project?.scenes.findIndex(
        (projectScene) => projectScene.id === sceneId,
      ) ?? -1;
    const targetScene =
      targetSceneIndex < 0 ? undefined : project?.scenes[targetSceneIndex];
    if (
      !targetScene ||
      targetScene.id !== scene?.id ||
      isBusy ||
      sceneRenameCommitRef.current
    ) {
      return;
    }

    sceneRenameGenerationRef.current += 1;
    sceneNameDraftTouchedRef.current = false;
    setEditingSceneId(targetScene.id);
    setSceneNameDraftState(
      localizeGeneratedSceneName(targetScene.name, targetSceneIndex, labels),
    );
    setSceneRenameErrorKind(null);
  }

  function setSceneNameDraft(name: string): void {
    sceneNameDraftTouchedRef.current = true;
    setSceneNameDraftState(name);
    if (sceneRenameErrorKind) {
      setSceneRenameErrorKind(null);
    }
  }

  function cancelSceneRename(): void {
    sceneRenameGenerationRef.current += 1;
    sceneNameDraftTouchedRef.current = false;
    setEditingSceneId(null);
    setSceneNameDraftState('');
    setSceneRenameErrorKind(null);
    setIsRenamingScene(false);
  }

  async function commitSceneRenameDraft(): Promise<boolean> {
    if (sceneRenameCommitRef.current) {
      return sceneRenameCommitRef.current;
    }

    const commit = async (): Promise<boolean> => {
      if (editingSceneId === null) {
        return true;
      }

      const targetScene = project?.scenes.find(
        (projectScene) => projectScene.id === editingSceneId,
      );
      if (!targetScene) {
        return false;
      }

      // A localized generated name is presentation text. Opening and closing
      // the field without typing must not rename the authoritative scene or
      // mark the project dirty.
      if (!sceneNameDraftTouchedRef.current) {
        cancelSceneRename();
        return true;
      }

      // Keep Renderer and C++ normalization identical. JavaScript's trim()
      // also removes Unicode spacing characters that the Engine deliberately
      // preserves as authored content.
      const normalizedName = trimAsciiWhitespace(sceneNameDraft);
      if (!normalizedName) {
        setSceneRenameErrorKind('required');
        return false;
      }
      if (normalizedName === targetScene.name) {
        cancelSceneRename();
        return true;
      }

      const generation = sceneRenameGenerationRef.current;
      setSceneRenameErrorKind(null);
      setIsRenamingScene(true);
      const result = await runEngineAction(() =>
        authoringCommands.renameScene(targetScene.id, normalizedName),
      );

      // Project/scene navigation may have replaced this form surface while
      // the serialized engine command was in flight. Its authoritative result
      // may still update the project, but it must not restore stale UI state.
      if (generation !== sceneRenameGenerationRef.current) {
        return result !== null;
      }

      setIsRenamingScene(false);
      if (result) {
        cancelSceneRename();
        return true;
      }

      setSceneRenameErrorKind('failed');
      return false;
    };

    const pendingCommit = commit();
    sceneRenameCommitRef.current = pendingCommit;
    try {
      return await pendingCommit;
    } finally {
      if (sceneRenameCommitRef.current === pendingCommit) {
        sceneRenameCommitRef.current = null;
      }
    }
  }

  async function commitPendingDraft(forceCreate = false): Promise<boolean> {
    // Keep the explicit empty-dialogue force-create flag scoped exclusively to
    // the dialogue commit. Scene rename flushing must never create a dialogue.
    if (!(await commitDialogueDraft(forceCreate))) {
      return false;
    }
    if (!(await commitSelectedImageScaleDraft())) {
      return false;
    }
    return commitSceneRenameDraft();
  }

  async function commitSceneRename(): Promise<boolean> {
    return commitPendingDraft();
  }

  function applyNodeSelection(node: FormVisibleSceneNode) {
    imageScaleDraftRef.current = null;
    setImageScaleDraftState(null);
    setSelectedNodeId(node.id);
    if (node.type === 'dialogue') {
      setSpeaker(node.speaker);
      setText(node.text);
    } else {
      setSpeaker('');
      setText('');
    }
  }

  async function selectNode(node: FormVisibleSceneNode): Promise<void> {
    if (node.id === selectedNodeId) {
      return;
    }

    if (await commitPendingDraft()) {
      applyNodeSelection(node);
    }
  }

  async function addScene() {
    if (!project || !(await commitPendingDraft())) {
      return;
    }

    // IDs remain C++-owned. The generated display name follows the active
    // Editor language so an English session never creates a Chinese scene.
    const nextSceneName = nextLocalizedGeneratedSceneName(project, labels);
    const result = await runEngineAction(() =>
      authoringCommands.addScene(nextSceneName),
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
      !project.scenes.some((projectScene) => projectScene.id === nextSceneId)
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
      authoringCommands.addDialogue({
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
      authoringCommands.addBackground({
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
    // 选中对白时，人物节点按表单中的视觉顺序插入到它下方。
    // 选中已有立绘时仍保留连续立绘组；CG 内部则以隐藏结束标记
    // 为 after anchor，避免把立绘塞进只允许对白的 CG body。
    const wasCreatingDialogue =
      selectedNodeId === null &&
      (dialogueDraftDirty || commitInProgressRef.current !== null);
    let insertionPlan = scene
      ? getCharacterInsertionPlan(scene, selectedNodeId)
      : null;

    if (wasCreatingDialogue) {
      lastCreatedDialogueIdRef.current = null;
    }
    if (!scene || !insertionPlan || !(await commitPendingDraft())) {
      return;
    }

    if (wasCreatingDialogue) {
      insertionPlan = {
        afterNodeId: lastCreatedDialogueIdRef.current,
      };
      lastCreatedDialogueIdRef.current = null;
    }

    const result = await runEngineAction(() =>
      authoringCommands.addCharacter({
        sceneId: scene.id,
        mode: 'show',
        assetId: null,
        afterNodeId: insertionPlan.afterNodeId,
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
      authoringCommands.addSceneJump({
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

  async function insertBgm() {
    const anchorNodeId = selectedNodeId;
    if (!scene || !(await commitPendingDraft())) {
      return;
    }

    const result = await runEngineAction(() =>
      authoringCommands.addBgm({
        sceneId: scene.id,
        afterNodeId: anchorNodeId,
      }),
    );
    const createdNode = result?.project.scenes
      .find((projectScene) => projectScene.id === scene.id)
      ?.nodes.find((node) => node.id === result.nodeId);
    if (createdNode?.type === 'bgm') {
      applyNodeSelection(createdNode);
    }
  }

  async function updateBackgroundNode(
    node: BackgroundNode,
    next: {
      assetId: string | null;
      scalePercent: number;
    },
  ): Promise<boolean> {
    if (!scene) {
      return false;
    }
    const draft = imageScaleDraftRef.current;
    const draftBelongsToNode = Boolean(
      project && scene &&
        draft?.projectId === project.id &&
        draft.sceneId === scene.id &&
        draft.nodeId === node.id,
    );
    const draftValue = draftBelongsToNode && draft
      ? draft.value
      : String(next.scalePercent);
    const draftScalePercent = parseImageScaleDraft(draftValue);
    if (draftBelongsToNode && draftScalePercent === null) {
      return false;
    }
    const scalePercent = next.assetId === null
      ? DEFAULT_IMAGE_SCALE_PERCENT
      : (draftScalePercent ?? next.scalePercent);
    if (
      (node.assetId === next.assetId && node.scalePercent === scalePercent)
    ) {
      if (project && draftBelongsToNode) {
        clearCommittedImageScaleDraft(
          { projectId: project.id, sceneId: scene.id, nodeId: node.id },
          draftValue,
        );
      }
      return true;
    }

    const result = await runEngineAction(() =>
      authoringCommands.updateBackground({
        sceneId: scene.id,
        nodeId: node.id,
        assetId: next.assetId,
        scalePercent,
      }),
    );
    if (result === null) {
      return false;
    }
    if (project && draftBelongsToNode) {
      clearCommittedImageScaleDraft(
        { projectId: project.id, sceneId: scene.id, nodeId: node.id },
        draftValue,
      );
    }
    return true;
  }

  async function updateCharacterNode(
    node: CharacterNode,
    next: {
      mode?: CharacterMode;
      assetId: string | null;
      slot: CharacterSlot;
      layer: number;
      position: CharacterPosition | null;
      scalePercent: number;
    },
  ): Promise<boolean> {
    if (!scene) {
      return false;
    }
    const draft = imageScaleDraftRef.current;
    const draftBelongsToNode = Boolean(
      project && scene &&
        draft?.projectId === project.id &&
        draft.sceneId === scene.id &&
        draft.nodeId === node.id,
    );
    const draftValue = draftBelongsToNode && draft
      ? draft.value
      : String(next.scalePercent);
    const draftScalePercent = parseImageScaleDraft(draftValue);
    if (draftBelongsToNode && draftScalePercent === null) {
      return false;
    }
    const scalePercent = next.mode === 'clear'
      ? DEFAULT_IMAGE_SCALE_PERCENT
      : (draftScalePercent ?? next.scalePercent);
    if (
      (next.mode === undefined || node.mode === next.mode) &&
        node.assetId === next.assetId &&
        node.slot === next.slot &&
        node.layer === next.layer &&
        node.scalePercent === scalePercent &&
        ((node.position === null && next.position === null) ||
          (node.position !== null &&
            next.position !== null &&
            node.position.x === next.position.x &&
            node.position.y === next.position.y))
    ) {
      if (project && draftBelongsToNode) {
        clearCommittedImageScaleDraft(
          { projectId: project.id, sceneId: scene.id, nodeId: node.id },
          draftValue,
        );
      }
      return true;
    }

    const result = await runEngineAction(() =>
      authoringCommands.updateCharacter({
        sceneId: scene.id,
        nodeId: node.id,
        ...next,
        scalePercent,
      }),
    );
    if (result === null) {
      return false;
    }
    if (project && draftBelongsToNode) {
      clearCommittedImageScaleDraft(
        { projectId: project.id, sceneId: scene.id, nodeId: node.id },
        draftValue,
      );
    }
    return true;
  }

  async function updateSceneJumpNode(
    node: SceneJumpNode,
    targetSceneId: string,
  ) {
    if (!scene || node.targetSceneId === targetSceneId) {
      return;
    }
    await runEngineAction(() =>
      authoringCommands.updateSceneJump({
        sceneId: scene.id,
        nodeId: node.id,
        targetSceneId,
      }),
    );
  }

  async function updateBgmNode(node: BgmNode, assetId: string | null) {
    if (!scene || node.assetId === assetId) {
      return;
    }
    await runEngineAction(() =>
      authoringCommands.updateBgm({
        sceneId: scene.id,
        nodeId: node.id,
        assetId,
      }),
    );
  }

  async function updateVideoNode(node: VideoNode, assetId: string | null) {
    if (!scene || node.assetId === assetId) {
      return;
    }
    await runEngineAction(() =>
      authoringCommands.updateVideo({
        sceneId: scene.id,
        nodeId: node.id,
        assetId,
      }),
    );
  }

  async function updateDialogueVoice(
    node: DialogueNode,
    voiceAssetId: string | null,
  ) {
    if (!scene || node.voiceAssetId === voiceAssetId) {
      return;
    }
    await runEngineAction(() =>
      authoringCommands.setDialogueVoice({
        sceneId: scene.id,
        nodeId: node.id,
        assetId: voiceAssetId,
      }),
    );
  }

  async function submitDialogue() {
    if (!scene) {
      return;
    }

    // 普通保存、切换和预览不应凭空新建节点；但用户明确
    // 点击“加入剧情”时，全空的说话人和对白也是一条合法剧情节点。
    // 点击提交和 Cmd/Ctrl+S 保存前提交共用同一个
    // single-flight Promise。否则“加入剧情”尚未返回时立刻保存，
    // 两条路径可能各自向 C++ 新增一次相同对白。
    await commitPendingDraft(!selectedDialogue && !dialogueDraftDirty);
  }

  async function deleteNode(nodeId: string) {
    if (!scene) {
      return;
    }

    const nodeToDelete = storyNodes.find((node) => node.id === nodeId);

    if (!nodeToDelete) {
      return;
    }

    const nodeLabel =
      nodeToDelete.type === 'dialogue'
        ? `${nodeToDelete.speaker || labels.messages.unnamedCharacter}${labels.messages.deleteDialogueSuffix}`
        : nodeToDelete.type === 'background'
          ? labels.messages.deleteBackground
          : nodeToDelete.type === 'character'
            ? labels.messages.deleteCharacter
            : nodeToDelete.type === 'sceneJump'
              ? labels.messages.deleteSceneJump
              : nodeToDelete.type === 'bgm'
                ? labels.messages.deleteBgm
                : nodeToDelete.type === 'video'
                  ? labels.messages.deleteVideo
                  : nodeToDelete.type === 'variableSet' ||
                      nodeToDelete.type === 'variableChange'
                    ? labels.messages.deleteVariableOperation
                    : labels.messages.deleteChoice;
    const shouldDelete = window.confirm(
      `${labels.messages.deleteConfirmPrefix}${nodeLabel}${labels.messages.deleteConfirmSuffix}`,
    );

    if (!shouldDelete) {
      return;
    }

    // 删除其他节点也会返回完整 Project 快照。先提交当前对白草稿，
    // 避免这次重投影把正在编辑的内容覆盖掉。删除当前节点本身则是
    // 用户明确确认的丢弃操作，不要求先保存即将删除的草稿。
    if (nodeId !== selectedNodeId && !(await commitPendingDraft())) {
      return;
    }

    // “删除哪条”由 C++ 决定；“删除后界面选中谁”仍是 UI 导航规则。
    const selectedIndex = storyNodes.findIndex((node) => node.id === nodeId);
    const remainingNodeIds = storyNodes
      .filter((node) => node.id !== nodeId)
      .map((node) => node.id);
    const nextNodeId =
      remainingNodeIds[selectedIndex] ?? remainingNodeIds[selectedIndex - 1];

    const result = await runEngineAction(() =>
      authoringCommands.deleteTimelineNodes({
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
    const nextNode = updatedScene?.nodes.find((node) => node.id === nextNodeId);

    if (
      nextNode &&
      isSemanticSceneNode(nextNode) &&
      nextNode.type !== 'logicElse' &&
      nextNode.type !== 'logicEndIf' &&
      nextNode.type !== 'logicEndRepeat' &&
      nextNode.type !== 'cgEndDisplay'
    ) {
      applyNodeSelection(nextNode);
    } else {
      startNewDialogue();
    }
  }

  async function moveNode(nodeId: string, direction: -1 | 1) {
    if (!scene) {
      return;
    }

    const wasCreatingDialogue =
      selectedNodeId === null &&
      (dialogueDraftDirty || commitInProgressRef.current !== null);
    if (!(await commitPendingDraft())) {
      return;
    }

    // 新对白提交会改变时间线长度，而且新 ID 只存在于返回快照中。
    // 本次点击先完成创建，避免再使用提交前的旧索引错误地跨两格移动；
    // 用户随后可在已经刷新后的时间线中执行明确的移动操作。
    if (wasCreatingDialogue) {
      return;
    }

    const movePlan = getFormNodeMovePlan(scene, nodeId, direction);
    if (!movePlan) {
      return;
    }
    // Logic controls keep their existing Form limitation. Their plans are
    // still structure-aware so nested CG boundaries remain analyzable, but
    // only the Blockly surface currently exposes logic-control reordering.
    if (movePlan.kind === 'logicControl') {
      return;
    }

    const params = {
      sceneId: scene.id,
      nodeId,
      beforeNodeId: movePlan.beforeNodeId,
    };
    await runEngineAction(() => {
      if (movePlan.kind === 'cgDisplay') {
        return authoringCommands.reorderCgDisplay(params);
      }
      return authoringCommands.reorderTimelineNode(params);
    });
  }

  return {
    project,
    scene,
    selectedNode,
    selectedDialogue,
    selectedBackground,
    selectedCharacter,
    selectedSceneJump,
    selectedBgm,
    selectedVideo,
    selectedChoice,
    selectedNodeId,
    selectedImageScaleDraft,
    selectedImageScaleDraftInvalid:
      selectedScalableImageNode !== undefined &&
      selectedImageScalePercent === null,
    speaker,
    text,
    previewSpeaker: speaker.trim(),
    previewText: text,
    isBusy,
    engineMessage,
    draftDirty,
    editingSceneId,
    sceneNameDraft,
    sceneRenameError,
    isRenamingScene,
    setSpeaker,
    setText,
    setSelectedImageScaleDraft,
    addScene,
    beginSceneRename,
    setSceneNameDraft,
    cancelSceneRename,
    commitSceneRename,
    selectScene,
    insertEmptyDialogue,
    insertBackground,
    insertCharacter,
    insertSceneJump,
    insertBgm,
    updateBackgroundNode,
    updateCharacterNode,
    updateSceneJumpNode,
    updateBgmNode,
    updateVideoNode,
    updateDialogueVoice,
    selectNode,
    submitDialogue,
    deleteNode,
    moveNode,
    resetEditorState,
    commitSelectedImageScaleDraft,
    commitPendingDraft,
  };
}

export type FormEditorState = ReturnType<typeof useFormEditor>;
