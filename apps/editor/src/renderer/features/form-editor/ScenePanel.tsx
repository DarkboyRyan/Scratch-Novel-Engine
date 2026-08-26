import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
  FormVisibleSceneNode,
} from '../../../shared/projectTypes';
import {
  CG_GALLERY_SCENE_ID,
  START_SCREEN_SCENE_ID,
} from '../start-screen/startScreenScene';
import { useEditorLabels } from '../../i18n/editorLocalization';
import { createFormLogicTree } from './formLogicTree';

type ScenePanelProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  assets: AssetDocument[];
  selectedNodeId: string | null;
  isBusy: boolean;
  onAddScene: () => Promise<void>;
  onSelectScene: (sceneId: string) => Promise<void>;
  onSelectStartScreen?: () => Promise<void>;
  onSelectCgGallery?: () => Promise<void>;
  onSelectNode: (node: FormVisibleSceneNode) => Promise<void>;
  onInsertBackground: () => Promise<void>;
  onInsertSceneJump: () => Promise<void>;
  onMoveNode: (
    nodeId: string,
    direction: -1 | 1,
  ) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
};

export function ScenePanel({
  project,
  scene,
  assets,
  selectedNodeId,
  isBusy,
  onAddScene,
  onSelectScene,
  onSelectStartScreen,
  onSelectCgGallery,
  onSelectNode,
  onInsertBackground,
  onInsertSceneJump,
  onMoveNode,
  onDeleteNode,
}: ScenePanelProps) {
  const labels = useEditorLabels();
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const treeEntries = createFormLogicTree(scene);
  const storyNodes = treeEntries.flatMap((entry) =>
    entry.kind === 'node' ? [entry.node] : [],
  );
  const nodeNumbers = new Map(
    storyNodes.map((node, index) => [node.id, index + 1]),
  );
  const hasLogicControls = storyNodes.some(
    (node) => node.type === 'logicIf' || node.type === 'logicRepeat',
  );
  const currentSceneNumber =
    project.scenes.findIndex((projectScene) => projectScene.id === scene.id) +
    1;
  const assetName = (assetId: string | null) =>
    assetId === null
      ? labels.resource.noBackground
      : imageAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingImage;
  const audioName = (assetId: string | null) =>
    assetId === null
      ? labels.scenes.stopBackgroundMusic
      : audioAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingAudio;
  const videoName = (assetId: string | null) =>
    assetId === null
      ? labels.scenes.noVideo
      : videoAssets.find((asset) => asset.id === assetId)?.displayName ??
        labels.common.missingVideo;

  useEffect(() => {
    setIsSceneMenuOpen(false);
  }, [scene.id]);

  useEffect(() => {
    if (!isSceneMenuOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !sceneMenuRef.current?.contains(event.target)
      ) {
        setIsSceneMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeOnOutsideClick, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick, true);
    };
  }, [isSceneMenuOpen]);

  return (
    <aside className="panel scene-panel">
      <div className="scene-switcher">
        <div className="scene-menu" ref={sceneMenuRef}>
          <button
            type="button"
            className="scene-menu-trigger"
            aria-label={labels.scenes.selectCurrentScene}
            aria-haspopup="listbox"
            aria-expanded={isSceneMenuOpen}
            disabled={isBusy}
            onClick={() => setIsSceneMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsSceneMenuOpen(false);
              }
            }}
          >
            <span>{labels.common.scene} {currentSceneNumber}</span>
            <span aria-hidden="true" className="scene-menu-chevron">
              ▾
            </span>
          </button>

          {isSceneMenuOpen ? (
            <div className="scene-menu-list" role="listbox">
              {onSelectStartScreen ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-scene-id={START_SCREEN_SCENE_ID}
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectStartScreen();
                  }}
                >
                  <strong>{labels.common.mainMenu}</strong>
                  <span>{labels.scenes.managedStartScreen}</span>
                </button>
              ) : null}
              {onSelectCgGallery ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  data-scene-id={CG_GALLERY_SCENE_ID}
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectCgGallery();
                  }}
                >
                  <strong>{labels.common.cgGallery}</strong>
                  <span>{labels.scenes.cgGalleryHelp}</span>
                </button>
              ) : null}
              {project.scenes.map((projectScene, index) => (
                <button
                  key={projectScene.id}
                  type="button"
                  role="option"
                  aria-selected={projectScene.id === scene.id}
                  className={
                    projectScene.id === scene.id ? 'selected' : undefined
                  }
                  onClick={() => {
                    setIsSceneMenuOpen(false);
                    void onSelectScene(projectScene.id);
                  }}
                >
                  <strong>{labels.common.scene} {index + 1}</strong>
                  {projectScene.name !== `场景 ${index + 1}` ? (
                    <span>{projectScene.name}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="scene-inline-action"
          aria-label={labels.scenes.addScene}
          title={labels.scenes.addEmptyScene}
          disabled={isBusy}
          onClick={() => void onAddScene()}
        >
          <span aria-hidden="true">+</span> {labels.common.scene}
        </button>
        <button
          type="button"
          className="scene-inline-action scene-jump-inline-action"
          aria-label={labels.scenes.insertJump}
          disabled={isBusy || project.scenes.length < 2}
          title={
            project.scenes.length < 2
              ? labels.scenes.needsTwoScenes
              : labels.scenes.insertJump
          }
          onClick={() => void onInsertSceneJump()}
        >
          <span aria-hidden="true">+</span> {labels.scenes.jump}
        </button>
      </div>

      <div className="scene-status">
        <span>{project.scenes.length} {labels.scenes.sceneUnit}</span>
        <span>{storyNodes.length} {labels.scenes.storyNodeUnit}</span>
      </div>

      <div className="timeline-add-actions">
        <button
          type="button"
          className="timeline-add-background-button"
          disabled={isBusy}
          onClick={() => void onInsertBackground()}
        >
          <span aria-hidden="true">+</span> {labels.scenes.background}
        </button>
      </div>

      <ol className="dialogue-list timeline-list">
        {treeEntries.map((entry) => {
          if (entry.kind === 'branch') {
            return (
              <li
                key={entry.id}
                className="logic-branch-row"
                style={{
                  '--logic-depth': entry.depth,
                } as CSSProperties}
              >
                <span aria-hidden="true" className="logic-branch-line" />
                <strong>
                  {entry.branch === 'then'
                    ? labels.blockly.logicThen
                    : entry.branch === 'else'
                      ? labels.blockly.logicElse
                      : labels.blockly.logicRepeatBody}
                </strong>
              </li>
            );
          }

          const { node } = entry;
          const index = (nodeNumbers.get(node.id) ?? 1) - 1;
          const isLogicControl =
            node.type === 'logicIf' || node.type === 'logicRepeat';
          const logicStyle = {
            '--logic-depth': entry.depth,
          } as CSSProperties;
          return (
            <li
            key={node.id}
            style={logicStyle}
            className={`${node.id === selectedNodeId ? 'selected' : ''}${
              node.type === 'background'
                ? ' is-background-node'
                : node.type === 'character'
                  ? ' is-character-node'
                  : node.type === 'sceneJump'
                    ? ' is-scene-jump-node'
                    : node.type === 'bgm'
                      ? ' is-bgm-node'
                      : node.type === 'video'
                        ? ' is-video-node'
                        : node.type === 'choice'
                          ? ' is-choice-node'
                        : node.type === 'variableSet' ||
                            node.type === 'variableChange'
                          ? ' is-variable-node'
                          : isLogicControl
                            ? ' is-logic-node'
                            : ''
            }`}
          >
            <button
              type="button"
              className="dialogue-list-item"
              onClick={() => void onSelectNode(node)}
            >
              <span className="dialogue-number">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div>
                {node.type === 'dialogue' ? (
                  <>
                    <strong>{node.speaker || labels.scenes.narrator}</strong>
                    <p>{node.text || labels.scenes.emptyDialogue}</p>
                  </>
                ) : node.type === 'background' ? (
                  <>
                    <strong>{labels.scenes.backgroundChange}</strong>
                    <p>{assetName(node.assetId)}</p>
                  </>
                ) : node.type === 'character' ? (
                  <>
                    <strong>
                      {labels.scenes.character} · {node.layer} {labels.scenes.layer}
                    </strong>
                    <p>
                      {node.assetId === null
                        ? labels.scenes.noPortrait
                        : assetName(node.assetId)}
                      {' · '}
                      {node.slot === 'left'
                        ? labels.scenes.left
                        : node.slot === 'center'
                          ? labels.scenes.center
                          : labels.scenes.right}
                    </p>
                  </>
                ) : node.type === 'sceneJump' ? (
                  <>
                    <strong>{labels.scenes.jumpScene}</strong>
                    <p>
                      {(() => {
                        const targetIndex = project.scenes.findIndex(
                          (projectScene) =>
                            projectScene.id === node.targetSceneId,
                        );
                        return targetIndex >= 0
                          ? `${labels.common.scene} ${targetIndex + 1}`
                          : labels.scenes.missingTargetScene;
                      })()}
                    </p>
                  </>
                ) : node.type === 'bgm' ? (
                  <>
                    <strong>{labels.scenes.backgroundMusic}</strong>
                    <p>{audioName(node.assetId)}</p>
                  </>
                ) : node.type === 'video' ? (
                  <>
                    <strong>{labels.scenes.playVideo}</strong>
                    <p>{videoName(node.assetId)}</p>
                  </>
                ) : node.type === 'choice' ? (
                  <>
                    <strong>{labels.scenes.sceneOptions}</strong>
                    <p>
                      {node.options.length > 0
                        ? `${node.options.length} ${labels.scenes.optionUnit}`
                        : labels.scenes.noOptionsSkip}
                    </p>
                  </>
                ) : node.type === 'variableSet' ? (
                  <>
                    <strong>{labels.blockly.setVariable}</strong>
                    <p>
                      {node.variableName} = {String(node.value)}
                    </p>
                  </>
                ) : node.type === 'variableChange' ? (
                  <>
                    <strong>{labels.blockly.changeVariable}</strong>
                    <p>
                      {node.variableName} {node.amount >= 0 ? '+' : '−'}= {
                        Math.abs(node.amount)
                      }
                    </p>
                  </>
                ) : node.type === 'logicIf' ? (
                  <>
                    <strong>{labels.blockly.logicIf}</strong>
                    <p>{formatLogicCondition(node.condition)}</p>
                  </>
                ) : (
                  <>
                    <strong>{labels.blockly.logicRepeat}</strong>
                    <p>{node.count} {labels.blockly.logicTimes}</p>
                  </>
                )}
              </div>
            </button>

            <div className="dialogue-item-actions">
              <button
                type="button"
                className="dialogue-move-button"
                disabled={isBusy || index === 0 || hasLogicControls}
                aria-label={`${labels.scenes.moveUp}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                title={labels.scenes.moveUp}
                onClick={() =>
                  void onMoveNode(node.id, -1)
                }
              >
                ↑
              </button>

              <button
                type="button"
                className="dialogue-move-button"
                disabled={
                  isBusy ||
                  index === storyNodes.length - 1 ||
                  hasLogicControls
                }
                aria-label={`${labels.scenes.moveDown}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                title={labels.scenes.moveDown}
                onClick={() =>
                  void onMoveNode(node.id, 1)
                }
              >
                ↓
              </button>

              <button
                type="button"
                className="dialogue-delete-button"
                aria-label={`${labels.scenes.delete}${labels.common.wordSeparator}${labels.scenes.nodeAriaPrefix}${index + 1}${labels.scenes.nodeAriaSuffix}`}
                title={labels.scenes.deleteNode}
                disabled={isBusy || isLogicControl}
                onClick={() =>
                  void onDeleteNode(node.id)
                }
              >
                {labels.scenes.delete}
              </button>
            </div>
          </li>
          );
        })}
      </ol>
    </aside>
  );
}

function formatLogicOperand(
  operand: Extract<
    FormVisibleSceneNode,
    { type: 'logicIf' }
  >['condition']['left'],
): string {
  if (operand.kind === 'variable') {
    return operand.name;
  }
  return typeof operand.value === 'string'
    ? `“${operand.value}”`
    : String(operand.value);
}

function formatLogicCondition(
  condition: Extract<
    FormVisibleSceneNode,
    { type: 'logicIf' }
  >['condition'],
): string {
  const symbols = {
    eq: '=',
    neq: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
  } as const;
  return `${formatLogicOperand(condition.left)} ${symbols[condition.operator]} ${formatLogicOperand(condition.right)}`;
}
