import {
  ENGINE_METHODS,
  type EngineInvocation,
} from '../../shared/engineProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCgGalleryPages(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const assetIds = new Set<string>();
  return value.every((page) => {
    if (
      !isObject(page) ||
      Object.keys(page).length !== 1 ||
      !Array.isArray(page.imageAssetIds) ||
      page.imageAssetIds.length !== 9
    ) {
      return false;
    }
    return page.imageAssetIds.every((assetId) => {
      if (assetId === null) {
        return true;
      }
      if (
        typeof assetId !== 'string' ||
        assetId.length === 0 ||
        assetIds.has(assetId)
      ) {
        return false;
      }
      assetIds.add(assetId);
      return true;
    });
  });
}

export function isEngineInvocation(
  value: unknown,
): value is EngineInvocation {
  if (
    !isObject(value) ||
    !ENGINE_METHODS.includes(value.method as never) ||
    !isObject(value.params)
  ) {
    return false;
  }

  const params = value.params;
  const hasString = (key: string) => typeof params[key] === 'string';
  const hasValidOptionalPlacement = (): boolean => {
    const hasAfterNodeId = hasString('afterNodeId');
    const hasBeforeNodeId = hasString('beforeNodeId');

    return (
      (params.afterNodeId === undefined ||
        params.afterNodeId === null ||
        hasAfterNodeId) &&
      (params.beforeNodeId === undefined ||
        params.beforeNodeId === null ||
        hasBeforeNodeId) &&
      !(hasAfterNodeId && hasBeforeNodeId)
    );
  };

  switch (value.method) {
    case 'project.create':
      // 新建项目只能经由专用文件会话 IPC；保留该方法的类型仅供
      // Main→C++ 与 JSONL 集成测试使用。
      return false;
    case 'project.ensure':
    case 'project.get':
      return Object.keys(params).length === 0;
    case 'project.rename':
      return hasString('name');
    case 'startScreen.update':
      return (
        Object.keys(params).length === 3 &&
        hasString('title') &&
        Object.hasOwn(params, 'backgroundAssetId') &&
        Object.hasOwn(params, 'musicAssetId') &&
        (params.backgroundAssetId === null ||
          hasString('backgroundAssetId')) &&
        (params.musicAssetId === null || hasString('musicAssetId'))
      );
    case 'cgGallery.update':
      return (
        Object.keys(params).length === 1 &&
        isCgGalleryPages(params.pages)
      );
    case 'scene.add':
      return params.name === undefined || hasString('name');
    case 'scene.rename':
      return hasString('sceneId') && hasString('name');
    case 'scene.delete':
      return hasString('sceneId');
    case 'scene.setBackground':
      return (
        hasString('sceneId') &&
        (params.assetId === null || hasString('assetId'))
      );
    case 'dialogue.add':
      return (
        hasString('sceneId') &&
        hasValidOptionalPlacement() &&
        (params.speaker === undefined ||
          hasString('speaker')) &&
        (params.text === undefined ||
          hasString('text'))
      );
    case 'background.add':
    case 'bgm.add':
    case 'video.add':
    case 'choice.add':
    case 'storyExtension.add':
      return (
        hasString('sceneId') &&
        params.assetId === undefined &&
        hasValidOptionalPlacement()
      );
    case 'choice.option.add':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('text') &&
        hasString('targetSceneId') &&
        (params.beforeOptionId === undefined ||
          params.beforeOptionId === null ||
          hasString('beforeOptionId'))
      );
    case 'choice.option.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('optionId') &&
        hasString('text') &&
        hasString('targetSceneId')
      );
    case 'choice.option.delete':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('optionId')
      );
    case 'choice.option.reorder':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('optionId') &&
        (params.beforeOptionId === null ||
          hasString('beforeOptionId'))
      );
    case 'background.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.assetId === null || hasString('assetId'))
      );
    case 'background.delete':
      return hasString('sceneId') && hasString('nodeId');
    case 'background.reorder':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.beforeNodeId === null ||
          hasString('beforeNodeId'))
      );
    case 'character.add':
      return (
        hasString('sceneId') &&
        params.assetId === undefined &&
        params.slot === undefined &&
        params.layer === undefined &&
        params.position === undefined &&
        hasValidOptionalPlacement()
      );
    case 'character.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.assetId === null || hasString('assetId')) &&
        (params.slot === 'left' ||
          params.slot === 'center' ||
          params.slot === 'right') &&
        Number.isInteger(params.layer) &&
        (params.layer as number) >= 1 &&
        (params.layer as number) <= 10 &&
        (params.position === null ||
          (isObject(params.position) &&
            Object.keys(params.position).length === 2 &&
            Object.hasOwn(params.position, 'x') &&
            Object.hasOwn(params.position, 'y') &&
            typeof params.position.x === 'number' &&
            Number.isFinite(params.position.x) &&
            params.position.x >= 0 &&
            params.position.x <= 100 &&
            typeof params.position.y === 'number' &&
            Number.isFinite(params.position.y) &&
            params.position.y >= 0 &&
            params.position.y <= 100))
      );
    case 'sceneJump.add':
      return (
        hasString('sceneId') &&
        hasString('targetSceneId') &&
        hasValidOptionalPlacement()
      );
    case 'sceneJump.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('targetSceneId')
      );
    case 'bgm.update':
    case 'video.update':
    case 'dialogue.setVoice':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.assetId === null || hasString('assetId'))
      );
    case 'dialogue.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('speaker') &&
        hasString('text')
      );
    case 'dialogue.delete':
      return hasString('sceneId') && hasString('nodeId');
    case 'dialogue.deleteMany':
    case 'dialogue.reorderMany':
    case 'timeline.deleteMany':
    case 'timeline.reorderMany': {
      const hasValidNodeIds =
        Array.isArray(params.nodeIds) &&
        params.nodeIds.length > 0 &&
        params.nodeIds.every(
          (nodeId) => typeof nodeId === 'string',
        ) &&
        new Set(params.nodeIds).size === params.nodeIds.length;

      return (
        hasString('sceneId') &&
        hasValidNodeIds &&
        (value.method === 'dialogue.deleteMany' ||
          value.method === 'timeline.deleteMany' ||
          params.beforeNodeId === null ||
          hasString('beforeNodeId'))
      );
    }
    case 'dialogue.move':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.direction === -1 || params.direction === 1)
      );
    case 'dialogue.reorder':
    case 'timeline.reorder':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.beforeNodeId === null ||
          hasString('beforeNodeId'))
      );
    default:
      return false;
  }
}
