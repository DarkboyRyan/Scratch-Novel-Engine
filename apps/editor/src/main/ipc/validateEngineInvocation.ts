// 主要作用：在进入 C++ 后端前严格验证每一种引擎命令参数。
// 关键实现：isEngineInvocation 按 ENGINE_METHODS 分支校验精确字段与值域。
import {
  ENGINE_METHODS,
  type EngineInvocation,
} from '../../shared/engineProtocol';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isCgGalleryStyleDocument,
  isImageScalePercent,
  isStartScreenStyleDocument,
} from '../../shared/projectTypes';
import { isCharacterEffect } from '@vnengine/runtime';

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

const utf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).length;

function isStartScreenEyebrow(value: unknown): value is string {
  if (typeof value !== 'string' || value.includes('\0')) {
    return false;
  }
  const encoded = new TextEncoder().encode(value);
  return encoded.length <= 256 &&
    new TextDecoder('utf-8', { fatal: true }).decode(encoded) === value;
}

function isLogicValue(value: unknown): boolean {
  return (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' &&
      !value.includes('\0') &&
      utf8ByteLength(value) <= 4096)
  );
}

function isLogicVariableName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '') &&
    !value.includes('\0') &&
    utf8ByteLength(value) <= 64
  );
}

function isLogicOperand(value: unknown): boolean {
  if (!isObject(value) || typeof value.kind !== 'string') {
    return false;
  }
  if (value.kind === 'variable') {
    return (
      Object.keys(value).length === 2 &&
      isLogicVariableName(value.name)
    );
  }
  return (
    value.kind === 'literal' &&
    Object.keys(value).length === 2 &&
    Object.hasOwn(value, 'value') &&
    isLogicValue(value.value)
  );
}

function isLogicCondition(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.keys(value).length === 3 &&
    isLogicOperand(value.left) &&
    (value.operator === 'eq' ||
      value.operator === 'neq' ||
      value.operator === 'gt' ||
      value.operator === 'gte' ||
      value.operator === 'lt' ||
      value.operator === 'lte') &&
    isLogicOperand(value.right)
  );
}

const MAX_SCENE_CONTENT_DRAFT_BYTES = 2 * 1024 * 1024;
const MAX_SCENE_CONTENT_DRAFT_ENTITIES = 10_000;
const MAX_SCENE_CONTENT_NESTING_DEPTH = 16;

type SceneContentDraftBudget = {
  entities: number;
  originIds: Set<string>;
};

function hasExactFields(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableId(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function consumeDraftEntity(
  value: Record<string, unknown>,
  budget: SceneContentDraftBudget,
): boolean {
  budget.entities += 1;
  if (budget.entities > MAX_SCENE_CONTENT_DRAFT_ENTITIES) {
    return false;
  }
  if (!Object.hasOwn(value, 'originId')) {
    return true;
  }
  if (!isNonEmptyString(value.originId) || budget.originIds.has(value.originId)) {
    return false;
  }
  budget.originIds.add(value.originId);
  return true;
}

function hasDraftFields(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  return hasExactFields(value, required, ['originId']);
}

function isCharacterPosition(value: unknown): boolean {
  return value === null ||
    (isObject(value) &&
      hasExactFields(value, ['x', 'y']) &&
      typeof value.x === 'number' &&
      Number.isFinite(value.x) &&
      value.x >= 0 &&
      value.x <= 100 &&
      typeof value.y === 'number' &&
      Number.isFinite(value.y) &&
      value.y >= 0 &&
      value.y <= 100);
}

function isSceneContentDialogueDraft(
  value: unknown,
  budget: SceneContentDraftBudget,
): boolean {
  return isObject(value) &&
    consumeDraftEntity(value, budget) &&
    hasDraftFields(value, ['type', 'speaker', 'text', 'voiceAssetId']) &&
    value.type === 'dialogue' &&
    typeof value.speaker === 'string' &&
    typeof value.text === 'string' &&
    isNullableId(value.voiceAssetId);
}

function isSceneContentChoiceOptionDraft(
  value: unknown,
  budget: SceneContentDraftBudget,
): boolean {
  return isObject(value) &&
    consumeDraftEntity(value, budget) &&
    hasDraftFields(value, ['text', 'targetSceneId']) &&
    typeof value.text === 'string' &&
    isNonEmptyString(value.targetSceneId);
}

function isSceneContentDraftNode(
  value: unknown,
  budget: SceneContentDraftBudget,
  depth: number,
): boolean {
  if (!isObject(value) || !consumeDraftEntity(value, budget)) {
    return false;
  }

  switch (value.type) {
    case 'dialogue':
      // The entity was already consumed above, so validate this shape inline.
      return hasDraftFields(value, ['type', 'speaker', 'text', 'voiceAssetId']) &&
        typeof value.speaker === 'string' &&
        typeof value.text === 'string' &&
        isNullableId(value.voiceAssetId);
    case 'background':
      return hasDraftFields(value, ['type', 'assetId', 'scalePercent']) &&
        isNullableId(value.assetId) &&
        isImageScalePercent(value.scalePercent) &&
        (value.assetId !== null ||
          value.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT);
    case 'character': {
      const isClear = value.mode === 'clear';
      const isShow = value.mode === 'show';
      return hasDraftFields(value, [
        'type',
        'mode',
        'assetId',
        'slot',
        'layer',
        'position',
        'effect',
        'scalePercent',
      ]) &&
        (isClear || isShow) &&
        isNullableId(value.assetId) &&
        (value.slot === 'left' ||
          value.slot === 'center' ||
          value.slot === 'right') &&
        Number.isInteger(value.layer) &&
        (value.layer as number) >= 1 &&
        (value.layer as number) <= 10 &&
        isCharacterPosition(value.position) &&
        (value.effect === null || isCharacterEffect(value.effect)) &&
        isImageScalePercent(value.scalePercent) &&
        (!isClear ||
          (value.assetId === null &&
            value.position === null &&
            value.effect === null &&
            value.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT)) &&
        (value.assetId !== null || value.effect === null);
    }
    case 'sceneJump':
      return hasDraftFields(value, ['type', 'targetSceneId']) &&
        isNonEmptyString(value.targetSceneId);
    case 'bgm':
    case 'video':
      return hasDraftFields(value, ['type', 'assetId']) &&
        isNullableId(value.assetId);
    case 'choice':
      return hasDraftFields(value, ['type', 'options']) &&
        Array.isArray(value.options) &&
        value.options.every((option) =>
          isSceneContentChoiceOptionDraft(option, budget)
        );
    case 'variableSet':
      return hasDraftFields(value, ['type', 'variableName', 'value']) &&
        isLogicVariableName(value.variableName) &&
        isLogicValue(value.value);
    case 'variableChange':
      return hasDraftFields(value, ['type', 'variableName', 'amount']) &&
        isLogicVariableName(value.variableName) &&
        typeof value.amount === 'number' &&
        Number.isFinite(value.amount);
    case 'if':
      return depth < MAX_SCENE_CONTENT_NESTING_DEPTH &&
        hasDraftFields(value, [
          'type',
          'condition',
          'thenNodes',
          'elseNodes',
        ]) &&
        isLogicCondition(value.condition) &&
        Array.isArray(value.thenNodes) &&
        Array.isArray(value.elseNodes) &&
        value.thenNodes.every((node) =>
          isSceneContentDraftNode(node, budget, depth + 1)
        ) &&
        value.elseNodes.every((node) =>
          isSceneContentDraftNode(node, budget, depth + 1)
        );
    case 'repeat':
      return depth < MAX_SCENE_CONTENT_NESTING_DEPTH &&
        hasDraftFields(value, ['type', 'count', 'bodyNodes']) &&
        Number.isInteger(value.count) &&
        (value.count as number) >= 1 &&
        (value.count as number) <= 1000 &&
        Array.isArray(value.bodyNodes) &&
        value.bodyNodes.every((node) =>
          isSceneContentDraftNode(node, budget, depth + 1)
        );
    case 'cg':
      return depth < MAX_SCENE_CONTENT_NESTING_DEPTH &&
        hasDraftFields(value, ['type', 'assetId', 'leadInMs', 'bodyNodes']) &&
        isNonEmptyString(value.assetId) &&
        Number.isInteger(value.leadInMs) &&
        (value.leadInMs as number) >= 0 &&
        (value.leadInMs as number) <= 60_000 &&
        Array.isArray(value.bodyNodes) &&
        value.bodyNodes.every((node) =>
          isSceneContentDialogueDraft(node, budget)
        );
    case 'storyExtension':
      return hasDraftFields(value, ['type']);
    default:
      return false;
  }
}

function isSceneContentDraft(value: unknown): boolean {
  if (!isObject(value) || !hasExactFields(value, [
    'name',
    'initialBackground',
    'nodes',
  ])) {
    return false;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (utf8ByteLength(serialized) > MAX_SCENE_CONTENT_DRAFT_BYTES) {
    return false;
  }
  if (
    typeof value.name !== 'string' ||
    value.name.includes('\0') ||
    utf8ByteLength(value.name) > 4096 ||
    !isObject(value.initialBackground) ||
    !hasExactFields(value.initialBackground, ['assetId', 'scalePercent']) ||
    !isNullableId(value.initialBackground.assetId) ||
    !isImageScalePercent(value.initialBackground.scalePercent) ||
    (value.initialBackground.assetId === null &&
      value.initialBackground.scalePercent !== DEFAULT_IMAGE_SCALE_PERCENT) ||
    !Array.isArray(value.nodes)
  ) {
    return false;
  }
  const budget: SceneContentDraftBudget = {
    entities: 0,
    originIds: new Set(),
  };
  return value.nodes.every((node) =>
    isSceneContentDraftNode(node, budget, 0)
  );
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
  const hasOnly = (keys: readonly string[]): boolean =>
    Object.keys(params).every((key) => keys.includes(key));
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
        Object.keys(params).length === 4 &&
        hasString('title') &&
        isStartScreenEyebrow(params.eyebrow) &&
        Object.hasOwn(params, 'backgroundAssetId') &&
        Object.hasOwn(params, 'musicAssetId') &&
        (params.backgroundAssetId === null ||
          hasString('backgroundAssetId')) &&
        (params.musicAssetId === null || hasString('musicAssetId'))
      );
    case 'startScreen.style.update':
      return (
        Object.keys(params).length === 1 &&
        isStartScreenStyleDocument(params.style)
      );
    case 'cgGallery.update':
      return (
        Object.keys(params).length === 1 &&
        isCgGalleryPages(params.pages)
      );
    case 'cgGallery.style.update':
      return (
        Object.keys(params).length === 1 &&
        isCgGalleryStyleDocument(params.style)
      );
    case 'scene.add':
      return params.name === undefined || hasString('name');
    case 'scene.rename':
      return hasString('sceneId') && hasString('name');
    case 'scene.content.replace':
      return hasString('sceneId') &&
        hasOnly(['sceneId', 'draft']) &&
        isSceneContentDraft(params.draft);
    case 'scene.delete':
      return hasString('sceneId');
    case 'scene.setBackground':
      return (
        hasString('sceneId') &&
        (params.assetId === null || hasString('assetId')) &&
        isImageScalePercent(params.scalePercent) &&
        (params.assetId !== null ||
          params.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT) &&
        hasOnly(['sceneId', 'assetId', 'scalePercent'])
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
    case 'variableSet.add':
      return (
        hasString('sceneId') &&
        isLogicVariableName(params.variableName) &&
        Object.hasOwn(params, 'value') &&
        isLogicValue(params.value) &&
        hasOnly([
          'sceneId',
          'variableName',
          'value',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'variableSet.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        isLogicVariableName(params.variableName) &&
        Object.hasOwn(params, 'value') &&
        isLogicValue(params.value) &&
        hasOnly(['sceneId', 'nodeId', 'variableName', 'value'])
      );
    case 'variableChange.add':
      return (
        hasString('sceneId') &&
        isLogicVariableName(params.variableName) &&
        typeof params.amount === 'number' &&
        Number.isFinite(params.amount) &&
        hasOnly([
          'sceneId',
          'variableName',
          'amount',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'variableChange.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        isLogicVariableName(params.variableName) &&
        typeof params.amount === 'number' &&
        Number.isFinite(params.amount) &&
        hasOnly(['sceneId', 'nodeId', 'variableName', 'amount'])
      );
    case 'logicIf.add':
      return (
        hasString('sceneId') &&
        isLogicCondition(params.condition) &&
        hasOnly([
          'sceneId',
          'condition',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'logicIf.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        isLogicCondition(params.condition) &&
        hasOnly(['sceneId', 'nodeId', 'condition'])
      );
    case 'logicRepeat.add':
      return (
        hasString('sceneId') &&
        Number.isInteger(params.count) &&
        (params.count as number) >= 1 &&
        (params.count as number) <= 1000 &&
        hasOnly([
          'sceneId',
          'count',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'logicRepeat.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        Number.isInteger(params.count) &&
        (params.count as number) >= 1 &&
        (params.count as number) <= 1000 &&
        hasOnly(['sceneId', 'nodeId', 'count'])
      );
    case 'cgDisplay.add':
      return (
        hasString('sceneId') &&
        hasString('assetId') &&
        (params.assetId as string).length > 0 &&
        Number.isInteger(params.leadInMs) &&
        (params.leadInMs as number) >= 0 &&
        (params.leadInMs as number) <= 60000 &&
        hasOnly([
          'sceneId',
          'assetId',
          'leadInMs',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'cgDisplay.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasString('assetId') &&
        (params.assetId as string).length > 0 &&
        Number.isInteger(params.leadInMs) &&
        (params.leadInMs as number) >= 0 &&
        (params.leadInMs as number) <= 60000 &&
        hasOnly(['sceneId', 'nodeId', 'assetId', 'leadInMs'])
      );
    case 'cgDisplay.delete':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasOnly(['sceneId', 'nodeId'])
      );
    case 'cgDisplay.reorder':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.beforeNodeId === null || hasString('beforeNodeId')) &&
        hasOnly(['sceneId', 'nodeId', 'beforeNodeId'])
      );
    case 'logicControl.delete':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        hasOnly(['sceneId', 'nodeId'])
      );
    case 'logicControl.reorder':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.beforeNodeId === null || hasString('beforeNodeId')) &&
        hasOnly(['sceneId', 'nodeId', 'beforeNodeId'])
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
        (params.assetId === null || hasString('assetId')) &&
        isImageScalePercent(params.scalePercent) &&
        (params.assetId !== null ||
          params.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT) &&
        hasOnly(['sceneId', 'nodeId', 'assetId', 'scalePercent'])
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
        (params.mode === undefined ||
          params.mode === 'show' ||
          params.mode === 'clear') &&
        (params.assetId === undefined ||
          params.assetId === null ||
          hasString('assetId')) &&
        (params.mode !== 'clear' ||
          params.assetId === undefined ||
          params.assetId === null) &&
        hasOnly([
          'sceneId',
          'mode',
          'assetId',
          'afterNodeId',
          'beforeNodeId',
        ]) &&
        hasValidOptionalPlacement()
      );
    case 'character.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        (params.mode === undefined ||
          params.mode === 'show' ||
          params.mode === 'clear') &&
        (params.assetId === null || hasString('assetId')) &&
        (params.slot === 'left' ||
          params.slot === 'center' ||
          params.slot === 'right') &&
        Number.isInteger(params.layer) &&
        (params.layer as number) >= 1 &&
        (params.layer as number) <= 10 &&
        isImageScalePercent(params.scalePercent) &&
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
            params.position.y <= 100)) &&
        (params.mode !== 'clear' ||
          params.assetId === null &&
            params.position === null &&
            params.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT) &&
        hasOnly([
          'sceneId',
          'nodeId',
          'mode',
          'assetId',
          'slot',
          'layer',
          'position',
          'scalePercent',
        ])
      );
    case 'characterEffect.update':
      return (
        hasString('sceneId') &&
        hasString('nodeId') &&
        Object.hasOwn(params, 'effect') &&
        (params.effect === null || isCharacterEffect(params.effect)) &&
        hasOnly(['sceneId', 'nodeId', 'effect'])
      );
    case 'characterEffect.move':
      return (
        hasString('sceneId') &&
        hasString('fromNodeId') &&
        hasString('toNodeId') &&
        isCharacterEffect(params.effect) &&
        hasOnly(['sceneId', 'fromNodeId', 'toNodeId', 'effect'])
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
