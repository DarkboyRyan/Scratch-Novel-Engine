// 主要作用：把 C++ JSONL 响应验证并转换成 Editor 公共项目模型。
// 关键实现：parseBackendResponse 严格校验结构和图片缩放，formatBackendError 统一错误文案。
import type {
  BackendResponse,
  EngineMutationResult,
} from '../../shared/engineProtocol';
import type {
  AssetDocument,
  CharacterEffect,
  CharacterSlot,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '../../shared/projectTypes';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  isImageScalePercent,
} from '../../shared/projectTypes';
import {
  isCharacterEffect,
  isLogicCondition,
  isLogicValue,
  isLogicVariableName,
  MAX_CG_LEAD_IN_MS,
  MAX_REPEAT_COUNT,
  MAX_RUNTIME_VARIABLES,
} from '@vnengine/runtime';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAssetDocument(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    (value.type === 'image' ||
      value.type === 'video' ||
      value.type === 'audio') &&
    typeof value.displayName === 'string'
  );
}

function isSceneNode(value: unknown): boolean {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    value.type !== 'dialogue' &&
    value.type !== 'background' &&
    value.type !== 'character' &&
    value.type !== 'sceneJump' &&
    value.type !== 'bgm' &&
    value.type !== 'video' &&
    value.type !== 'cgDisplay' &&
    value.type !== 'cgEndDisplay' &&
    value.type !== 'choice' &&
    value.type !== 'storyExtension' &&
    value.type !== 'variableSet' &&
    value.type !== 'variableChange' &&
    value.type !== 'logicIf' &&
    value.type !== 'logicElse' &&
    value.type !== 'logicEndIf' &&
    value.type !== 'logicRepeat' &&
    value.type !== 'logicEndRepeat'
  ) {
    return false;
  }

  if (value.type === 'dialogue') {
    return (
      typeof value.speaker === 'string' &&
      typeof value.text === 'string' &&
      (value.voiceAssetId === null ||
        typeof value.voiceAssetId === 'string')
    );
  }

  if (value.type === 'background') {
    return (
      (value.assetId === null || typeof value.assetId === 'string') &&
      isImageScalePercent(value.scalePercent) &&
      (value.assetId !== null ||
        value.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT)
    );
  }

  if (value.type === 'character') {
    return (
      (value.mode === 'show' || value.mode === 'clear') &&
      (value.assetId === null || typeof value.assetId === 'string') &&
      (value.slot === 'left' ||
        value.slot === 'center' ||
        value.slot === 'right') &&
      Number.isInteger(value.layer) &&
      (value.layer as number) >= 1 &&
      (value.layer as number) <= 10 &&
      isImageScalePercent(value.scalePercent) &&
      (value.position === null ||
        (isObject(value.position) &&
          Object.keys(value.position).length === 2 &&
          Object.hasOwn(value.position, 'x') &&
          Object.hasOwn(value.position, 'y') &&
          typeof value.position.x === 'number' &&
          Number.isFinite(value.position.x) &&
          value.position.x >= 0 &&
          value.position.x <= 100 &&
          typeof value.position.y === 'number' &&
          Number.isFinite(value.position.y) &&
          value.position.y >= 0 &&
          value.position.y <= 100)) &&
      Object.hasOwn(value, 'effect') &&
      (value.effect === null || isCharacterEffect(value.effect)) &&
      (value.mode === 'show'
        ? value.assetId !== null || value.effect === null
        : value.assetId === null &&
          value.position === null &&
          value.effect === null &&
          value.scalePercent === DEFAULT_IMAGE_SCALE_PERCENT)
    );
  }

  if (value.type === 'sceneJump') {
    return typeof value.targetSceneId === 'string';
  }

  if (value.type === 'choice') {
    return (
      Array.isArray(value.options) &&
      value.options.every((option) =>
        isObject(option) &&
        typeof option.id === 'string' &&
        typeof option.text === 'string' &&
        typeof option.targetSceneId === 'string')
    );
  }

  if (value.type === 'cgDisplay') {
    return (
      typeof value.assetId === 'string' &&
      value.assetId.length > 0 &&
      Number.isSafeInteger(value.leadInMs) &&
      (value.leadInMs as number) >= 0 &&
      (value.leadInMs as number) <= MAX_CG_LEAD_IN_MS
    );
  }

  if (value.type === 'cgEndDisplay') {
    return typeof value.cgDisplayNodeId === 'string';
  }

  if (value.type === 'storyExtension') {
    return true;
  }

  if (value.type === 'variableSet') {
    return (
      isLogicVariableName(value.variableName) &&
      isLogicValue(value.value)
    );
  }

  if (value.type === 'variableChange') {
    return (
      isLogicVariableName(value.variableName) &&
      typeof value.amount === 'number' &&
      Number.isFinite(value.amount)
    );
  }

  if (value.type === 'logicIf') {
    return isLogicCondition(value.condition);
  }

  if (value.type === 'logicElse' || value.type === 'logicEndIf') {
    return typeof value.ifNodeId === 'string';
  }

  if (value.type === 'logicRepeat') {
    return (
      Number.isInteger(value.count) &&
      (value.count as number) >= 1 &&
      (value.count as number) <= MAX_REPEAT_COUNT
    );
  }

  if (value.type === 'logicEndRepeat') {
    return typeof value.repeatNodeId === 'string';
  }

  return value.assetId === null || typeof value.assetId === 'string';
}

function hasValidLogicStructure(nodes: unknown[]): boolean {
  const stack: Array<{
    kind: 'if' | 'repeat';
    rootId: string;
    sawElse: boolean;
  }> = [];
  let openCgDisplayId: string | null = null;
  for (const rawNode of nodes) {
    const node = rawNode as Record<string, unknown>;
    if (openCgDisplayId !== null) {
      if (node.type === 'dialogue') {
        continue;
      }
      if (
        node.type === 'cgEndDisplay' &&
        node.cgDisplayNodeId === openCgDisplayId
      ) {
        openCgDisplayId = null;
        continue;
      }
      return false;
    }
    if (node.type === 'cgDisplay') {
      openCgDisplayId = node.id as string;
      continue;
    }
    if (node.type === 'cgEndDisplay') {
      return false;
    }
    if (node.type === 'storyExtension' && stack.length > 0) {
      return false;
    }
    if (node.type === 'logicIf') {
      if (stack.length >= 16) {
        return false;
      }
      stack.push({ kind: 'if', rootId: node.id as string, sawElse: false });
    } else if (node.type === 'logicElse') {
      const frame = stack.at(-1);
      if (
        !frame ||
        frame.kind !== 'if' ||
        frame.rootId !== node.ifNodeId ||
        frame.sawElse
      ) {
        return false;
      }
      frame.sawElse = true;
    } else if (node.type === 'logicEndIf') {
      const frame = stack.at(-1);
      if (
        !frame ||
        frame.kind !== 'if' ||
        frame.rootId !== node.ifNodeId ||
        !frame.sawElse
      ) {
        return false;
      }
      stack.pop();
    } else if (node.type === 'logicRepeat') {
      if (stack.length >= 16) {
        return false;
      }
      stack.push({
        kind: 'repeat',
        rootId: node.id as string,
        sawElse: false,
      });
    } else if (node.type === 'logicEndRepeat') {
      const frame = stack.at(-1);
      if (
        !frame ||
        frame.kind !== 'repeat' ||
        frame.rootId !== node.repeatNodeId
      ) {
        return false;
      }
      stack.pop();
    }
  }
  return stack.length === 0 && openCgDisplayId === null;
}

function isSceneDocument(value: unknown): boolean {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.backgroundAssetId === null ||
      typeof value.backgroundAssetId === 'string') &&
    isImageScalePercent(value.backgroundScalePercent) &&
    (value.backgroundAssetId !== null ||
      value.backgroundScalePercent === DEFAULT_IMAGE_SCALE_PERCENT) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isSceneNode) &&
    hasValidLogicStructure(value.nodes)
  );
}

function isStartScreenDocument(value: unknown): boolean {
  return (
    isObject(value) &&
    typeof value.title === 'string' &&
    typeof value.eyebrow === 'string' &&
    (value.backgroundAssetId === null ||
      typeof value.backgroundAssetId === 'string') &&
    (value.musicAssetId === null ||
      typeof value.musicAssetId === 'string')
  );
}

function isCgGalleryDocument(value: unknown): boolean {
  if (!isObject(value) || !Array.isArray(value.pages) || value.pages.length === 0) {
    return false;
  }

  const assetIds = new Set<string>();
  return value.pages.every((page) => {
    if (
      !isObject(page) ||
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

function isProjectDocument(value: unknown): boolean {
  if (!(
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.entrySceneId === 'string' &&
    isStartScreenDocument(value.startScreen) &&
    isCgGalleryDocument(value.cgGallery) &&
    Array.isArray(value.scenes) &&
    value.scenes.every(isSceneDocument)
  )) {
    return false;
  }
  const variableNames = new Set<string>();
  for (const scene of value.scenes as Array<Record<string, unknown>>) {
    for (const node of scene.nodes as Array<Record<string, unknown>>) {
      if (node.type === 'variableSet' || node.type === 'variableChange') {
        variableNames.add(node.variableName as string);
      } else if (node.type === 'logicIf') {
        const condition = node.condition as Record<string, unknown>;
        for (const operand of [condition.left, condition.right]) {
          const candidate = operand as Record<string, unknown>;
          if (candidate.kind === 'variable') {
            variableNames.add(candidate.name as string);
          }
        }
      }
    }
  }
  return variableNames.size <= MAX_RUNTIME_VARIABLES;
}

function toPublicAssetDocument(
  value: Record<string, unknown>,
): AssetDocument {
  return {
    id: value.id as string,
    type: value.type as AssetDocument['type'],
    displayName: value.displayName as string,
  };
}

function toPublicSceneNode(
  value: Record<string, unknown>,
): SceneNode {
  if (value.type === 'storyExtension') {
    return {
      id: value.id as string,
      type: 'storyExtension',
    };
  }

  if (value.type === 'background') {
    return {
      id: value.id as string,
      type: 'background',
      assetId: value.assetId as string | null,
      scalePercent: value.scalePercent as number,
    };
  }

  if (value.type === 'character') {
    if (value.mode === 'clear') {
      return {
        id: value.id as string,
        type: 'character',
        mode: 'clear',
        assetId: null,
        slot: value.slot as CharacterSlot,
        layer: value.layer as number,
        position: null,
        effect: null,
        scalePercent: value.scalePercent as number,
      };
    }
    if (value.assetId === null) {
      return {
        id: value.id as string,
        type: 'character',
        mode: 'show',
        assetId: null,
        slot: value.slot as CharacterSlot,
        layer: value.layer as number,
        position: value.position as { x: number; y: number } | null,
        effect: null,
        scalePercent: value.scalePercent as number,
      };
    }
    return {
      id: value.id as string,
      type: 'character',
      mode: 'show',
      assetId: value.assetId as string,
      slot: value.slot as CharacterSlot,
      layer: value.layer as number,
      position: value.position as { x: number; y: number } | null,
      effect: value.effect as CharacterEffect | null,
      scalePercent: value.scalePercent as number,
    };
  }

  if (value.type === 'sceneJump') {
    return {
      id: value.id as string,
      type: 'sceneJump',
      targetSceneId: value.targetSceneId as string,
    };
  }

  if (value.type === 'bgm') {
    return {
      id: value.id as string,
      type: 'bgm',
      assetId: value.assetId as string | null,
    };
  }

  if (value.type === 'video') {
    return {
      id: value.id as string,
      type: 'video',
      assetId: value.assetId as string | null,
    };
  }

  if (value.type === 'cgDisplay') {
    return {
      id: value.id as string,
      type: 'cgDisplay',
      assetId: value.assetId as string,
      leadInMs: value.leadInMs as number,
    };
  }

  if (value.type === 'cgEndDisplay') {
    return {
      id: value.id as string,
      type: 'cgEndDisplay',
      cgDisplayNodeId: value.cgDisplayNodeId as string,
    };
  }

  if (value.type === 'choice') {
    return {
      id: value.id as string,
      type: 'choice',
      options: (value.options as Record<string, unknown>[]).map(
        (option) => ({
          id: option.id as string,
          text: option.text as string,
          targetSceneId: option.targetSceneId as string,
        }),
      ),
    };
  }

  if (value.type === 'variableSet') {
    return {
      id: value.id as string,
      type: 'variableSet',
      variableName: value.variableName as string,
      value: value.value as boolean | number | string,
    };
  }

  if (value.type === 'variableChange') {
    return {
      id: value.id as string,
      type: 'variableChange',
      variableName: value.variableName as string,
      amount: value.amount as number,
    };
  }

  if (value.type === 'logicIf') {
    return {
      id: value.id as string,
      type: 'logicIf',
      condition: value.condition as Extract<
        SceneNode,
        { type: 'logicIf' }
      >['condition'],
    };
  }

  if (value.type === 'logicElse') {
    return {
      id: value.id as string,
      type: 'logicElse',
      ifNodeId: value.ifNodeId as string,
    };
  }

  if (value.type === 'logicEndIf') {
    return {
      id: value.id as string,
      type: 'logicEndIf',
      ifNodeId: value.ifNodeId as string,
    };
  }

  if (value.type === 'logicRepeat') {
    return {
      id: value.id as string,
      type: 'logicRepeat',
      count: value.count as number,
    };
  }

  if (value.type === 'logicEndRepeat') {
    return {
      id: value.id as string,
      type: 'logicEndRepeat',
      repeatNodeId: value.repeatNodeId as string,
    };
  }

  return {
    id: value.id as string,
    type: 'dialogue',
    speaker: value.speaker as string,
    text: value.text as string,
    voiceAssetId: value.voiceAssetId as string | null,
  };
}

function toPublicSceneDocument(
  value: Record<string, unknown>,
): SceneDocument {
  return {
    schemaVersion: 1,
    id: value.id as string,
    name: value.name as string,
    backgroundAssetId: value.backgroundAssetId as string | null,
    backgroundScalePercent: value.backgroundScalePercent as number,
    nodes: (value.nodes as Record<string, unknown>[]).map(
      toPublicSceneNode,
    ),
  };
}

function toPublicProjectDocument(
  value: Record<string, unknown>,
): ProjectDocument {
  return {
    schemaVersion: 1,
    id: value.id as string,
    name: value.name as string,
    entrySceneId: value.entrySceneId as string,
    startScreen: {
      title: (value.startScreen as Record<string, unknown>).title as string,
      eyebrow: (value.startScreen as Record<string, unknown>).eyebrow as string,
      backgroundAssetId: (value.startScreen as Record<string, unknown>)
        .backgroundAssetId as string | null,
      musicAssetId: (value.startScreen as Record<string, unknown>)
        .musicAssetId as string | null,
    },
    cgGallery: {
      pages: ((value.cgGallery as Record<string, unknown>)
        .pages as Record<string, unknown>[]).map((page) => ({
          imageAssetIds: [
            ...(page.imageAssetIds as Array<string | null>),
          ],
        })),
    },
    scenes: (value.scenes as Record<string, unknown>[]).map(
      toPublicSceneDocument,
    ),
  };
}

export function parseBackendResponse(line: string): BackendResponse {
  let value: unknown;

  try {
    value = JSON.parse(line) as unknown;
  } catch {
    throw new Error(`C++ 后端输出了无效 JSON：${line}`);
  }

  if (
    !isObject(value) ||
    !Number.isInteger(value.id) ||
    typeof value.ok !== 'boolean'
  ) {
    throw new Error(`C++ 后端响应格式不正确：${line}`);
  }

  if (value.ok) {
    if (
      !isObject(value.result) ||
      !isProjectDocument(value.result.project) ||
      !Array.isArray(value.result.assets) ||
      !value.result.assets.every(isAssetDocument) ||
      !isObject(value.result.session) ||
      !Number.isInteger(value.result.session.revision) ||
      (value.result.session.revision as number) < 0 ||
      !(
        value.result.session.savedRevision === null ||
        (Number.isInteger(value.result.session.savedRevision) &&
          (value.result.session.savedRevision as number) >= 0)
      ) ||
      typeof value.result.session.isDirty !== 'boolean' ||
      (value.result.sceneId !== undefined &&
        typeof value.result.sceneId !== 'string') ||
      (value.result.nodeId !== undefined &&
        typeof value.result.nodeId !== 'string') ||
      (value.result.optionId !== undefined &&
        typeof value.result.optionId !== 'string') ||
      (value.result.assetId !== undefined &&
        typeof value.result.assetId !== 'string')
    ) {
      throw new Error(
        `C++ 后端响应缺少有效的 project、assets 或 session：${line}`,
      );
    }

    const rawResult = value.result;
    const rawAssets = rawResult.assets as Record<string, unknown>[];
    const rawSession = rawResult.session as Record<string, unknown>;
    const result: EngineMutationResult = {
      project: toPublicProjectDocument(
        rawResult.project as Record<string, unknown>,
      ),
      assets: rawAssets.map(toPublicAssetDocument),
      session: {
        revision: rawSession.revision as number,
        savedRevision: rawSession.savedRevision as number | null,
        isDirty: rawSession.isDirty as boolean,
      },
    };

    if (typeof rawResult.sceneId === 'string') {
      result.sceneId = rawResult.sceneId;
    }
    if (typeof rawResult.nodeId === 'string') {
      result.nodeId = rawResult.nodeId;
    }
    if (typeof rawResult.optionId === 'string') {
      result.optionId = rawResult.optionId;
    }
    if (typeof rawResult.assetId === 'string') {
      result.assetId = rawResult.assetId;
    }

    // Rebuild the public response so backend-only metadata cannot cross the
    // Main -> Renderer boundary merely by appearing as an extra JSON field.
    return {
      id: value.id as number,
      ok: true,
      result,
    };
  } else if (
    !isObject(value.error) ||
    typeof value.error.code !== 'string' ||
    typeof value.error.message !== 'string'
  ) {
    throw new Error(`C++ 后端错误响应格式不正确：${line}`);
  }

  return value as BackendResponse;
}

export function formatBackendError(
  response: Extract<BackendResponse, { ok: false }>,
): Error {
  const error = new Error(response.error.message);
  error.name = `VnEngineError:${response.error.code}`;
  return error;
}
