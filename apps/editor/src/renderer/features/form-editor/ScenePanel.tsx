import { useEffect, useRef, useState } from 'react';

import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '../../../shared/projectTypes';

type ScenePanelProps = {
  project: ProjectDocument;
  scene: SceneDocument;
  assets: AssetDocument[];
  selectedNodeId: string | null;
  isBusy: boolean;
  onAddScene: () => Promise<void>;
  onSelectScene: (sceneId: string) => Promise<void>;
  onSelectNode: (node: SceneNode) => Promise<void>;
  onInsertBackground: () => Promise<void>;
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
  onSelectNode,
  onInsertBackground,
  onMoveNode,
  onDeleteNode,
}: ScenePanelProps) {
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const currentSceneNumber =
    project.scenes.findIndex((projectScene) => projectScene.id === scene.id) +
    1;
  const assetName = (assetId: string | null) =>
    assetId === null
      ? '无背景'
      : imageAssets.find((asset) => asset.id === assetId)?.displayName ??
        '缺失图片';

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
        <button
          type="button"
          className="add-button"
          aria-label="新建场景"
          title="新建空场景"
          disabled={isBusy}
          onClick={() => void onAddScene()}
        >
          <span aria-hidden="true">+</span>
        </button>
        <div className="scene-menu" ref={sceneMenuRef}>
          <button
            type="button"
            className="scene-menu-trigger"
            aria-label="选择当前场景"
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
            <span>场景 {currentSceneNumber}</span>
            <span aria-hidden="true" className="scene-menu-chevron">
              ▾
            </span>
          </button>

          {isSceneMenuOpen ? (
            <div className="scene-menu-list" role="listbox">
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
                  <strong>场景 {index + 1}</strong>
                  {projectScene.name !== `场景 ${index + 1}` ? (
                    <span>{projectScene.name}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="scene-status">
        <span>{project.scenes.length} 个场景</span>
        <span>{scene.nodes.length} 个剧情节点</span>
      </div>

      <div className="timeline-add-actions">
        <button
          type="button"
          className="timeline-add-background-button"
          disabled={isBusy}
          onClick={() => void onInsertBackground()}
        >
          <span aria-hidden="true">+</span> 背景
        </button>
      </div>

      <ol className="dialogue-list timeline-list">
        {scene.nodes.map((node, index) => (
          <li
            key={node.id}
            className={`${node.id === selectedNodeId ? 'selected' : ''}${
              node.type === 'background'
                ? ' is-background-node'
                : node.type === 'character'
                  ? ' is-character-node'
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
                    <strong>{node.speaker || '旁白'}</strong>
                    <p>{node.text || '空对白'}</p>
                  </>
                ) : node.type === 'background' ? (
                  <>
                    <strong>背景切换</strong>
                    <p>{assetName(node.assetId)}</p>
                  </>
                ) : (
                  <>
                    <strong>
                      人物立绘 · 第 {node.layer} 层
                    </strong>
                    <p>
                      {assetName(node.assetId).replace('无背景', '无立绘')}
                      {' · '}
                      {node.slot === 'left'
                        ? '左侧'
                        : node.slot === 'center'
                          ? '中间'
                          : '右侧'}
                    </p>
                  </>
                )}
              </div>
            </button>

            <div className="dialogue-item-actions">
              <button
                type="button"
                className="dialogue-move-button"
                disabled={isBusy || index === 0}
                aria-label={`上移第 ${index + 1} 个剧情节点`}
                title="上移"
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
                  isBusy || index === scene.nodes.length - 1
                }
                aria-label={`下移第 ${index + 1} 个剧情节点`}
                title="下移"
                onClick={() =>
                  void onMoveNode(node.id, 1)
                }
              >
                ↓
              </button>

              <button
                type="button"
                className="dialogue-delete-button"
                aria-label={`删除第 ${index + 1} 个剧情节点`}
                title="删除这个剧情节点"
                disabled={isBusy}
                onClick={() =>
                  void onDeleteNode(node.id)
                }
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
