/**
 * 文件主要作用：收集某个资源在作者项目中的全部语义引用。
 * 关键实现：`collectAssetReferences`；返回的 UI DTO 只包含位置和用途，不暴露资源、场景或节点 ID。
 */

import {
  formVisibleSceneNodes,
  type ProjectDocument,
  type SceneNode,
} from '../../../shared/projectTypes';

export type AssetReferenceSceneNameFormatter = (
  sceneName: string,
  sceneIndex: number,
) => string;

export type AssetReference =
  | {
      surface: 'start-screen';
      usage: 'background' | 'music';
    }
  | {
      surface: 'cg-gallery';
      usage: 'image';
      pageNumber: number;
      slotNumber: number;
    }
  | {
      surface: 'scene';
      usage:
        | 'initial-background'
        | 'dialogue-voice'
        | 'timeline-background'
        | 'character'
        | 'bgm'
        | 'video'
        | 'cg-display';
      sceneName: string;
      nodeNumber?: number;
    };

function referencedAssetId(node: SceneNode): string | null {
  switch (node.type) {
    case 'dialogue':
      return node.voiceAssetId;
    case 'background':
    case 'character':
    case 'bgm':
    case 'video':
    case 'cgDisplay':
      return node.assetId;
    default:
      return null;
  }
}

function sceneNodeUsage(
  node: SceneNode,
): Extract<AssetReference, { surface: 'scene' }>['usage'] | null {
  switch (node.type) {
    case 'dialogue':
      return 'dialogue-voice';
    case 'background':
      return 'timeline-background';
    case 'character':
      return 'character';
    case 'bgm':
      return 'bgm';
    case 'video':
      return 'video';
    case 'cgDisplay':
      return 'cg-display';
    default:
      return null;
  }
}

export function collectAssetReferences(
  project: ProjectDocument,
  assetId: string,
  formatSceneName: AssetReferenceSceneNameFormatter = (sceneName) => sceneName,
): AssetReference[] {
  const references: AssetReference[] = [];

  if (project.startScreen.backgroundAssetId === assetId) {
    references.push({ surface: 'start-screen', usage: 'background' });
  }
  if (project.startScreen.musicAssetId === assetId) {
    references.push({ surface: 'start-screen', usage: 'music' });
  }

  project.cgGallery.pages.forEach((page, pageIndex) => {
    page.imageAssetIds.forEach((imageAssetId, slotIndex) => {
      if (imageAssetId === assetId) {
        references.push({
          surface: 'cg-gallery',
          usage: 'image',
          pageNumber: pageIndex + 1,
          slotNumber: slotIndex + 1,
        });
      }
    });
  });

  project.scenes.forEach((scene, sceneIndex) => {
    const sceneName = formatSceneName(scene.name, sceneIndex);
    if (scene.backgroundAssetId === assetId) {
      references.push({
        surface: 'scene',
        usage: 'initial-background',
        sceneName,
      });
    }

    formVisibleSceneNodes(scene).forEach((node, nodeIndex) => {
      if (referencedAssetId(node) !== assetId) {
        return;
      }
      const usage = sceneNodeUsage(node);
      if (usage === null) {
        return;
      }
      references.push({
        surface: 'scene',
        usage,
        sceneName,
        nodeNumber: nodeIndex + 1,
      });
    });
  });

  return references;
}
