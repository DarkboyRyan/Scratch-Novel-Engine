import { useEffect, useRef, useState } from 'react';

import type {
  AssetDocument,
  ProjectDocument,
  SceneDocument,
  SemanticSceneNode,
} from '../../../shared/projectTypes';
import { semanticSceneNodes } from '../../../shared/projectTypes';
import {
  CG_GALLERY_SCENE_ID,
  START_SCREEN_SCENE_ID,
} from '../start-screen/startScreenScene';

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
  onSelectNode: (node: SemanticSceneNode) => Promise<void>;
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
  const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);
  const sceneMenuRef = useRef<HTMLDivElement>(null);
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const audioAssets = assets.filter((asset) => asset.type === 'audio');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const storyNodes = semanticSceneNodes(scene);
  const currentSceneNumber =
    project.scenes.findIndex((projectScene) => projectScene.id === scene.id) +
    1;
  const assetName = (assetId: string | null) =>
    assetId === null
      ? '无背景'
      : imageAssets.find((asset) => asset.id === assetId)?.displayName ??
        '缺失图片';
  const audioName = (assetId: string | null) =>
    assetId === null
      ? '停止背景音乐'
      : audioAssets.find((asset) => asset.id === assetId)?.displayName ??
        '缺失音频';
  const videoName = (assetId: string | null) =>
    assetId === null
      ? '未选择视频'
      : videoAssets.find((asset) => asset.id === assetId)?.displayName ??
        '缺失视频';

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
                  <strong>主界面</strong>
                  <span>软件托管的开始游戏界面</span>
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
                  <strong>CG 画廊</strong>
                  <span>九宫格浏览与大图查看页面</span>
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
                  <strong>场景 {index + 1}</strong>
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
          aria-label="新建场景"
          title="新建空场景"
          disabled={isBusy}
          onClick={() => void onAddScene()}
        >
          <span aria-hidden="true">+</span> 场景
        </button>
        <button
          type="button"
          className="scene-inline-action scene-jump-inline-action"
          aria-label="在当前节点后插入场景跳转"
          disabled={isBusy || project.scenes.length < 2}
          title={
            project.scenes.length < 2
              ? '至少需要两个场景'
              : '在当前节点后插入场景跳转'
          }
          onClick={() => void onInsertSceneJump()}
        >
          <span aria-hidden="true">+</span> 跳转
        </button>
      </div>

      <div className="scene-status">
        <span>{project.scenes.length} 个场景</span>
        <span>{storyNodes.length} 个剧情节点</span>
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
        {storyNodes.map((node, index) => (
          <li
            key={node.id}
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
                ) : node.type === 'character' ? (
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
                ) : node.type === 'sceneJump' ? (
                  <>
                    <strong>跳转场景</strong>
                    <p>
                      {(() => {
                        const targetIndex = project.scenes.findIndex(
                          (projectScene) =>
                            projectScene.id === node.targetSceneId,
                        );
                        return targetIndex >= 0
                          ? `场景 ${targetIndex + 1}`
                          : '目标场景缺失';
                      })()}
                    </p>
                  </>
                ) : node.type === 'bgm' ? (
                  <>
                    <strong>背景音乐</strong>
                    <p>{audioName(node.assetId)}</p>
                  </>
                ) : node.type === 'video' ? (
                  <>
                    <strong>播放视频</strong>
                    <p>{videoName(node.assetId)}</p>
                  </>
                ) : (
                  <>
                    <strong>场景选项</strong>
                    <p>
                      {node.options.length > 0
                        ? `${node.options.length} 个选项`
                        : '未添加选项（预览时跳过）'}
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
                  isBusy || index === storyNodes.length - 1
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
