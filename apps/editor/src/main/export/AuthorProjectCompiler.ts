// 主要作用：校验作者工程并编译为 Player 可执行的运行时项目文档。
// 关键实现：compileAuthorProjectV15 迁移版本、过滤编辑标记并校验逻辑、缩放和资产。
import path from 'node:path';

import type {
  CharacterEffect,
  ChoiceOption,
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument as RuntimeProjectDocument,
  SceneDocument as RuntimeSceneDocument,
} from '@vnengine/runtime';
import {
  isCharacterEffect,
  isLogicValue,
  isLogicVariableName,
  MAX_CG_LEAD_IN_MS,
  MAX_REPEAT_COUNT,
  validateProjectLogicVariableBudget,
  validateSceneControlFlow,
} from '@vnengine/runtime';

import type { EditorLanguage } from '../../shared/editorSettingsProtocol';
import {
  DEFAULT_IMAGE_SCALE_PERCENT,
  MAX_IMAGE_SCALE_PERCENT,
  MIN_IMAGE_SCALE_PERCENT,
  toRuntimeProjectDocument,
  isSemanticSceneNode,
  type AssetDocument,
  type ProjectDocument as AuthorProjectDocument,
  type SceneDocument as AuthorSceneDocument,
  type SceneNode as AuthorSceneNode,
} from '../../shared/projectTypes';
import {
  previewMimeForAsset,
  type PreviewMime,
} from '../media/MediaFormat';

export const AUTHOR_PROJECT_FORMAT = 'vn-engine-project';
export const AUTHOR_PROJECT_FILE_VERSION = 21;
export const RUNTIME_FORMAT = 'vn-engine-runtime';
export const RUNTIME_VERSION = 12;

export const AUTHOR_PROJECT_COMPILE_ERROR_CODES = {
  unresolvedCharacterAsset: 'character-image-required',
} as const;

export type AuthorProjectCompileErrorCode =
  (typeof AUTHOR_PROJECT_COMPILE_ERROR_CODES)[keyof typeof AUTHOR_PROJECT_COMPILE_ERROR_CODES];

export class AuthorProjectCompileError extends Error {
  readonly code: AuthorProjectCompileErrorCode;
  readonly nodeId: string;

  constructor(
    code: AuthorProjectCompileErrorCode,
    message: string,
    nodeId: string,
  ) {
    super(message);
    this.name = 'AuthorProjectCompileError';
    this.code = code;
    this.nodeId = nodeId;
  }
}

export type AuthorAssetRecord = AssetDocument & {
  relativePath: string;
  mime: PreviewMime;
};

export type RuntimeGameDocumentV12 = {
  format: typeof RUNTIME_FORMAT;
  runtimeVersion: typeof RUNTIME_VERSION;
  game: {
    id: string;
    title: string;
    entrySceneId: string;
    defaultLanguage: EditorLanguage;
    startScreen: {
      title: string;
      eyebrow: string;
      backgroundAssetId: string | null;
      musicAssetId: string | null;
    };
    cgGallery: {
      pages: Array<{
        imageAssetIds: Array<string | null>;
      }>;
    };
  };
  scenes: RuntimeSceneDocument[];
};

export type CompiledAuthorProject = {
  game: RuntimeGameDocumentV12;
  sourceProject: AuthorProjectDocument;
  project: RuntimeProjectDocument;
  referencedAssets: AuthorAssetRecord[];
  publicAssets: AssetDocument[];
  allAssetCount: number;
};

type JsonObject = Record<string, unknown>;

type ParsedScene = {
  scene: AuthorSceneDocument;
  initialCharacterAssetIds: string[];
};

function trimAsciiWhitespace(value: string): string {
  return value.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, '');
}

function objectValue(value: unknown, context: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} 必须是对象`);
  }
  return value as JsonObject;
}

function exactFields(
  value: JsonObject,
  expected: readonly string[],
  context: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((field, index) => field !== wanted[index])
  ) {
    throw new Error(`${context} 字段不符合作者项目 v21`);
  }
}

function stringValue(
  value: JsonObject,
  field: string,
  context: string,
  options: { allowEmpty?: boolean; maximum?: number } = {},
): string {
  const candidate = value[field];
  const maximum = options.maximum ?? 4096;
  if (
    typeof candidate !== 'string' ||
    (!options.allowEmpty && candidate.length === 0) ||
    candidate.length > maximum ||
    candidate.includes('\0')
  ) {
    throw new Error(`${context}.${field} 不是有效字符串`);
  }
  return candidate;
}

function idValue(value: JsonObject, field: string, context: string): string {
  return stringValue(value, field, context, { maximum: 256 });
}

function nullableId(
  value: JsonObject,
  field: string,
  context: string,
): string | null {
  if (value[field] === null) {
    return null;
  }
  return idValue(value, field, context);
}

function arrayValue(value: JsonObject, field: string, context: string): unknown[] {
  const candidate = value[field];
  if (!Array.isArray(candidate)) {
    throw new Error(`${context}.${field} 必须是数组`);
  }
  return candidate;
}

function requireLiteral(
  value: JsonObject,
  field: string,
  expected: string | number,
  context: string,
): void {
  if (value[field] !== expected) {
    throw new Error(`${context}.${field} 版本或格式不受支持`);
  }
}

function registerId(ids: Set<string>, id: string): void {
  if (ids.has(id)) {
    throw new Error('作者项目包含重复的实体或资源 ID');
  }
  ids.add(id);
}

function parseChoiceOption(
  input: unknown,
  context: string,
  ids: Set<string>,
): ChoiceOption {
  const value = objectValue(input, context);
  exactFields(value, ['id', 'text', 'targetSceneId'], context);
  const option = {
    id: idValue(value, 'id', context),
    text: stringValue(value, 'text', context, { maximum: 64 * 1024 }),
    targetSceneId: idValue(value, 'targetSceneId', context),
  };
  if (trimAsciiWhitespace(option.text) !== option.text) {
    throw new Error(`${context}.text 不能包含首尾空白`);
  }
  registerId(ids, option.id);
  return option;
}

function parseLogicValue(input: unknown, context: string): LogicValue {
  if (!isLogicValue(input)) {
    throw new Error(`${context} 不是有效的逻辑值`);
  }
  return input;
}

function parseLogicOperand(input: unknown, context: string): LogicOperand {
  const value = objectValue(input, context);
  if (value.kind === 'variable') {
    exactFields(value, ['kind', 'name'], context);
    if (!isLogicVariableName(value.name)) {
      throw new Error(`${context}.name 不是有效变量名`);
    }
    return { kind: 'variable', name: value.name };
  }
  if (value.kind === 'literal') {
    exactFields(value, ['kind', 'value'], context);
    return {
      kind: 'literal',
      value: parseLogicValue(value.value, `${context}.value`),
    };
  }
  throw new Error(`${context}.kind 无效`);
}

function parseLogicCondition(input: unknown, context: string): LogicCondition {
  const value = objectValue(input, context);
  exactFields(value, ['left', 'operator', 'right'], context);
  const operator = value.operator;
  if (
    operator !== 'eq' &&
    operator !== 'neq' &&
    operator !== 'gt' &&
    operator !== 'gte' &&
    operator !== 'lt' &&
    operator !== 'lte'
  ) {
    throw new Error(`${context}.operator 无效`);
  }
  return {
    left: parseLogicOperand(value.left, `${context}.left`),
    operator,
    right: parseLogicOperand(value.right, `${context}.right`),
  };
}

function imageScalePercent(
  value: JsonObject,
  context: string,
  sourceFileVersion: number,
): number {
  if (sourceFileVersion < 21) {
    return DEFAULT_IMAGE_SCALE_PERCENT;
  }
  if (
    !Number.isSafeInteger(value.scalePercent) ||
    (value.scalePercent as number) < MIN_IMAGE_SCALE_PERCENT ||
    (value.scalePercent as number) > MAX_IMAGE_SCALE_PERCENT
  ) {
    throw new Error(
      `${context}.scalePercent 必须是 ${MIN_IMAGE_SCALE_PERCENT} 到 ${MAX_IMAGE_SCALE_PERCENT} 的整数`,
    );
  }
  return value.scalePercent as number;
}

function parseSceneNode(
  input: unknown,
  context: string,
  ids: Set<string>,
  referencedAssetIds: Set<string>,
  sourceFileVersion: number,
): AuthorSceneNode {
  const value = objectValue(input, context);
  const type = stringValue(value, 'type', context, { maximum: 32 });
  const id = idValue(value, 'id', context);
  registerId(ids, id);

  const registerOptionalAsset = (assetId: string | null): string | null => {
    if (assetId !== null) {
      referencedAssetIds.add(assetId);
    }
    return assetId;
  };
  const registerRequiredAsset = (assetId: string): string => {
    referencedAssetIds.add(assetId);
    return assetId;
  };

  switch (type) {
    case 'dialogue':
      exactFields(
        value,
        ['id', 'type', 'speaker', 'text', 'voiceAssetId'],
        context,
      );
      return {
        id,
        type,
        speaker: stringValue(value, 'speaker', context, {
          allowEmpty: true,
          maximum: 4096,
        }),
        text: stringValue(value, 'text', context, {
          allowEmpty: true,
          maximum: 1024 * 1024,
        }),
        voiceAssetId: registerOptionalAsset(
          nullableId(value, 'voiceAssetId', context),
        ),
      };
    case 'background':
      exactFields(
        value,
        sourceFileVersion >= 21
          ? ['id', 'type', 'assetId', 'scalePercent']
          : ['id', 'type', 'assetId'],
        context,
      );
      {
        const assetId = registerOptionalAsset(
          nullableId(value, 'assetId', context),
        );
        const scalePercent = imageScalePercent(
          value,
          context,
          sourceFileVersion,
        );
        if (
          assetId === null &&
          scalePercent !== DEFAULT_IMAGE_SCALE_PERCENT
        ) {
          throw new Error(`${context}.assetId 为 null 时 scalePercent 必须是 100`);
        }
        return {
          id,
          type,
          assetId,
          scalePercent,
        };
      }
    case 'character': {
      exactFields(
        value,
        sourceFileVersion >= 21
          ? [
              'id',
              'type',
              'mode',
              'assetId',
              'slot',
              'layer',
              'position',
              'effect',
              'scalePercent',
            ]
          : sourceFileVersion >= 19
          ? [
              'id',
              'type',
              'mode',
              'assetId',
              'slot',
              'layer',
              'position',
              'effect',
            ]
          : sourceFileVersion >= 18
          ? ['id', 'type', 'assetId', 'slot', 'layer', 'position', 'effect']
          : ['id', 'type', 'assetId', 'slot', 'layer', 'position'],
        context,
      );
      const slot = value.slot;
      const layer = value.layer;
      if (slot !== 'left' && slot !== 'center' && slot !== 'right') {
        throw new Error(`${context}.slot 无效`);
      }
      if (!Number.isSafeInteger(layer) || (layer as number) < 1 || (layer as number) > 10) {
        throw new Error(`${context}.layer 必须是 1 到 10 的整数`);
      }
      let position: { x: number; y: number } | null = null;
      if (value.position !== null) {
        const positionValue = objectValue(value.position, `${context}.position`);
        exactFields(positionValue, ['x', 'y'], `${context}.position`);
        const { x, y } = positionValue;
        if (
          typeof x !== 'number' ||
          typeof y !== 'number' ||
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          x < 0 ||
          x > 100 ||
          y < 0 ||
          y > 100
        ) {
          throw new Error(`${context}.position 坐标必须在 0 到 100 之间`);
        }
        position = { x, y };
      }
      let effect: CharacterEffect | null = null;
      if (sourceFileVersion >= 18) {
        if (value.effect !== null && !isCharacterEffect(value.effect)) {
          throw new Error(`${context}.effect 不是有效的立绘特效`);
        }
        effect = value.effect as CharacterEffect | null;
      }
      const assetId = registerOptionalAsset(
        nullableId(value, 'assetId', context),
      );
      const scalePercent = imageScalePercent(
        value,
        context,
        sourceFileVersion,
      );
      let mode: 'show' | 'clear';
      if (sourceFileVersion >= 19) {
        if (value.mode !== 'show' && value.mode !== 'clear') {
          throw new Error(`${context}.mode 必须是 show 或 clear`);
        }
        mode = value.mode;
      } else {
        mode = assetId === null ? 'clear' : 'show';
      }

      if (mode === 'clear') {
        if (sourceFileVersion >= 19 && assetId !== null) {
          throw new Error(`${context}.assetId 在 clear 模式下必须是 null`);
        }
        if (sourceFileVersion >= 19 && position !== null) {
          throw new Error(`${context}.position 在 clear 模式下必须是 null`);
        }
        if (effect !== null) {
          throw new Error(
            sourceFileVersion >= 19
              ? `${context}.effect 在 clear 模式下必须是 null`
              : `${context}.effect 不能用于清除立绘节点`,
          );
        }
        if (scalePercent !== DEFAULT_IMAGE_SCALE_PERCENT) {
          throw new Error(`${context}.scalePercent 在 clear 模式下必须是 100`);
        }
        return {
          id,
          type,
          mode,
          assetId: null,
          slot,
          layer: layer as number,
          position: null,
          effect: null,
          scalePercent: DEFAULT_IMAGE_SCALE_PERCENT,
        };
      }

      if (assetId === null) {
        if (effect !== null) {
          throw new Error(
            `${context}.effect 不能用于尚未选择图片的立绘节点`,
          );
        }
        throw new AuthorProjectCompileError(
          AUTHOR_PROJECT_COMPILE_ERROR_CODES.unresolvedCharacterAsset,
          `${context} 尚未选择人物立绘图片，无法导出`,
          id,
        );
      }
      return {
        id,
        type,
        mode: 'show',
        assetId,
        slot,
        layer: layer as number,
        position,
        effect,
        scalePercent,
      };
    }
    case 'sceneJump':
      exactFields(value, ['id', 'type', 'targetSceneId'], context);
      return {
        id,
        type,
        targetSceneId: idValue(value, 'targetSceneId', context),
      };
    case 'bgm':
      exactFields(value, ['id', 'type', 'assetId'], context);
      return {
        id,
        type,
        assetId: registerOptionalAsset(nullableId(value, 'assetId', context)),
      };
    case 'video':
      exactFields(value, ['id', 'type', 'assetId'], context);
      return {
        id,
        type,
        assetId: registerOptionalAsset(nullableId(value, 'assetId', context)),
      };
    case 'cgDisplay':
      if (sourceFileVersion < 17) {
        throw new Error(`${context}.type 仅受作者项目 v17 支持`);
      }
      exactFields(value, ['id', 'type', 'assetId', 'leadInMs'], context);
      if (
        !Number.isSafeInteger(value.leadInMs) ||
        (value.leadInMs as number) < 0 ||
        (value.leadInMs as number) > MAX_CG_LEAD_IN_MS
      ) {
        throw new Error(
          `${context}.leadInMs 必须是 0 到 ${MAX_CG_LEAD_IN_MS} 的整数`,
        );
      }
      return {
        id,
        type,
        assetId: registerRequiredAsset(idValue(value, 'assetId', context)),
        leadInMs: value.leadInMs as number,
      };
    case 'cgEndDisplay':
      if (sourceFileVersion < 17) {
        throw new Error(`${context}.type 仅受作者项目 v17 支持`);
      }
      exactFields(value, ['id', 'type', 'cgDisplayNodeId'], context);
      return {
        id,
        type,
        cgDisplayNodeId: idValue(value, 'cgDisplayNodeId', context),
      };
    case 'choice':
      exactFields(value, ['id', 'type', 'options'], context);
      return {
        id,
        type,
        options: arrayValue(value, 'options', context).map((option, index) =>
          parseChoiceOption(option, `${context}.options[${index}]`, ids),
        ),
      };
    case 'storyExtension':
      exactFields(value, ['id', 'type'], context);
      return { id, type };
    case 'variableSet':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'variableName', 'value'], context);
      if (!isLogicVariableName(value.variableName)) {
        throw new Error(`${context}.variableName 不是有效变量名`);
      }
      return {
        id,
        type,
        variableName: value.variableName,
        value: parseLogicValue(value.value, `${context}.value`),
      };
    case 'variableChange':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'variableName', 'amount'], context);
      if (!isLogicVariableName(value.variableName)) {
        throw new Error(`${context}.variableName 不是有效变量名`);
      }
      if (typeof value.amount !== 'number' || !Number.isFinite(value.amount)) {
        throw new Error(`${context}.amount 必须是有限数值`);
      }
      return { id, type, variableName: value.variableName, amount: value.amount };
    case 'logicIf':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'condition'], context);
      return {
        id,
        type,
        condition: parseLogicCondition(value.condition, `${context}.condition`),
      };
    case 'logicElse':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'ifNodeId'], context);
      return { id, type, ifNodeId: idValue(value, 'ifNodeId', context) };
    case 'logicEndIf':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'ifNodeId'], context);
      return { id, type, ifNodeId: idValue(value, 'ifNodeId', context) };
    case 'logicRepeat':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'count'], context);
      if (
        !Number.isSafeInteger(value.count) ||
        (value.count as number) < 1 ||
        (value.count as number) > MAX_REPEAT_COUNT
      ) {
        throw new Error(`${context}.count 必须是 1 到 ${MAX_REPEAT_COUNT} 的整数`);
      }
      return { id, type, count: value.count as number };
    case 'logicEndRepeat':
      if (sourceFileVersion < 16) {
        throw new Error(`${context}.type 仅受作者项目 v16 支持`);
      }
      exactFields(value, ['id', 'type', 'repeatNodeId'], context);
      return {
        id,
        type,
        repeatNodeId: idValue(value, 'repeatNodeId', context),
      };
    default:
      throw new Error(`${context}.type 不受作者项目 v21 支持`);
  }
}

function parseScene(
  input: unknown,
  index: number,
  ids: Set<string>,
  referencedAssetIds: Set<string>,
  sourceFileVersion: number,
): ParsedScene {
  const context = `project.scenes[${index}]`;
  const value = objectValue(input, context);
  exactFields(value, ['schemaVersion', 'id', 'name', 'visuals', 'nodes'], context);
  requireLiteral(value, 'schemaVersion', 1, context);
  const id = idValue(value, 'id', context);
  registerId(ids, id);

  const visuals = objectValue(value.visuals, `${context}.visuals`);
  exactFields(
    visuals,
    sourceFileVersion >= 21
      ? ['backgroundAssetId', 'backgroundScalePercent', 'characters']
      : ['backgroundAssetId', 'characters'],
    `${context}.visuals`,
  );
  const backgroundAssetId = nullableId(
    visuals,
    'backgroundAssetId',
    `${context}.visuals`,
  );
  if (backgroundAssetId !== null) {
    referencedAssetIds.add(backgroundAssetId);
  }
  const backgroundScalePercent = sourceFileVersion >= 21
    ? (() => {
        const scalePercent = visuals.backgroundScalePercent;
        if (
          !Number.isSafeInteger(scalePercent) ||
          (scalePercent as number) < MIN_IMAGE_SCALE_PERCENT ||
          (scalePercent as number) > MAX_IMAGE_SCALE_PERCENT
        ) {
          throw new Error(
            `${context}.visuals.backgroundScalePercent 必须是 ${MIN_IMAGE_SCALE_PERCENT} 到 ${MAX_IMAGE_SCALE_PERCENT} 的整数`,
          );
        }
        return scalePercent as number;
      })()
    : DEFAULT_IMAGE_SCALE_PERCENT;
  if (
    backgroundAssetId === null &&
    backgroundScalePercent !== DEFAULT_IMAGE_SCALE_PERCENT
  ) {
    throw new Error(
      `${context}.visuals.backgroundAssetId 为 null 时 backgroundScalePercent 必须是 100`,
    );
  }

  const initialCharacterAssetIds = arrayValue(
    visuals,
    'characters',
    `${context}.visuals`,
  ).map((characterInput, characterIndex) => {
    const characterContext = `${context}.visuals.characters[${characterIndex}]`;
    const character = objectValue(characterInput, characterContext);
    exactFields(character, ['id', 'assetId', 'slot'], characterContext);
    const characterId = idValue(character, 'id', characterContext);
    registerId(ids, characterId);
    const slot = character.slot;
    if (slot !== 'left' && slot !== 'center' && slot !== 'right') {
      throw new Error(`${characterContext}.slot 无效`);
    }
    return idValue(character, 'assetId', characterContext);
  });

  if (initialCharacterAssetIds.length > 0) {
    throw new Error('runtime v12 不支持场景初始人物，请改用人物立绘时间线节点');
  }

  const nodes = arrayValue(value, 'nodes', context).map((node, nodeIndex) =>
    parseSceneNode(
      node,
      `${context}.nodes[${nodeIndex}]`,
      ids,
      referencedAssetIds,
      sourceFileVersion,
    ),
  );
  let authorLogicDepth = 0;
  let authorCgDepth = 0;
  for (const node of nodes) {
    if (node.type === 'storyExtension' && authorCgDepth !== 0) {
      throw new Error(`${context}.nodes 延伸节点不能位于 CG 显示结构内部`);
    }
    if (node.type === 'storyExtension' && authorLogicDepth !== 0) {
      throw new Error(`${context}.nodes 延伸节点不能位于逻辑控制结构内部`);
    }
    if (node.type === 'logicIf' || node.type === 'logicRepeat') {
      authorLogicDepth += 1;
    } else if (node.type === 'logicEndIf' || node.type === 'logicEndRepeat') {
      authorLogicDepth -= 1;
    } else if (node.type === 'cgDisplay') {
      authorCgDepth += 1;
    } else if (node.type === 'cgEndDisplay') {
      authorCgDepth -= 1;
    }
  }
  const controlError = validateSceneControlFlow(nodes.filter(isSemanticSceneNode));
  if (controlError !== null) {
    throw new Error(`${context}.nodes ${controlError}`);
  }

  return {
    scene: {
      schemaVersion: 1,
      id,
      name: stringValue(value, 'name', context, { maximum: 4096 }),
      backgroundAssetId,
      backgroundScalePercent,
      nodes,
    },
    initialCharacterAssetIds,
  };
}

function expectedAssetDirectory(type: AssetDocument['type']): string {
  if (type === 'image') {
    return 'images';
  }
  return type === 'audio' ? 'audio' : 'videos';
}

function parseAssetType(value: unknown, context: string): AssetDocument['type'] {
  if (value !== 'image' && value !== 'audio' && value !== 'video') {
    throw new Error(`${context}.type 无效`);
  }
  return value;
}

function validateRelativeAssetPath(
  type: AssetDocument['type'],
  relativePath: string,
): void {
  const prefix = `assets/${expectedAssetDirectory(type)}/`;
  const components = relativePath.split('/');
  if (
    !relativePath.startsWith(prefix) ||
    relativePath.length <= prefix.length ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    components.some(
      (component) => component.length === 0 || component === '.' || component === '..',
    )
  ) {
    throw new Error('作者项目包含不安全的资源相对路径');
  }
}

function parseAsset(
  input: unknown,
  index: number,
  ids: Set<string>,
): AuthorAssetRecord {
  const context = `assets[${index}]`;
  const value = objectValue(input, context);
  exactFields(value, ['id', 'type', 'relativePath', 'displayName'], context);
  const id = idValue(value, 'id', context);
  registerId(ids, id);
  const type = parseAssetType(value.type, context);
  const relativePath = stringValue(value, 'relativePath', context, {
    maximum: 4096,
  });
  validateRelativeAssetPath(type, relativePath);
  const mime = previewMimeForAsset(type, relativePath);
  if (mime === null) {
    throw new Error(`${context} 的资源类型与扩展名不一致`);
  }
  return {
    id,
    type,
    relativePath,
    displayName: stringValue(value, 'displayName', context, { maximum: 4096 }),
    mime,
  };
}

function requireAssetType(
  assets: ReadonlyMap<string, AuthorAssetRecord>,
  assetId: string | null,
  expectedType: AssetDocument['type'],
  context: string,
): void {
  if (assetId === null) {
    return;
  }
  const asset = assets.get(assetId);
  if (asset === undefined || asset.type !== expectedType) {
    throw new Error(`${context} 引用了缺失或类型错误的资源`);
  }
}

function validateReferences(
  project: RuntimeProjectDocument,
  assets: ReadonlyMap<string, AuthorAssetRecord>,
): void {
  const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
  if (!scenes.has(project.entrySceneId)) {
    throw new Error('入口场景不存在');
  }

  requireAssetType(
    assets,
    project.startScreen.backgroundAssetId,
    'image',
    '主界面背景',
  );
  requireAssetType(
    assets,
    project.startScreen.musicAssetId,
    'audio',
    '主界面音乐',
  );
  for (const page of project.cgGallery.pages) {
    for (const assetId of page.imageAssetIds) {
      requireAssetType(assets, assetId, 'image', 'CG 画廊');
    }
  }

  for (const scene of project.scenes) {
    requireAssetType(assets, scene.backgroundAssetId, 'image', `场景 ${scene.id} 的初始背景`);
    for (const node of scene.nodes) {
      switch (node.type) {
        case 'dialogue':
          requireAssetType(assets, node.voiceAssetId, 'audio', `对白 ${node.id}`);
          break;
        case 'background':
          requireAssetType(assets, node.assetId, 'image', `背景 ${node.id}`);
          break;
        case 'character':
          requireAssetType(assets, node.assetId, 'image', `立绘 ${node.id}`);
          break;
        case 'bgm':
          requireAssetType(assets, node.assetId, 'audio', `背景音乐 ${node.id}`);
          break;
        case 'video':
          requireAssetType(assets, node.assetId, 'video', `视频 ${node.id}`);
          break;
        case 'cgDisplay':
          requireAssetType(assets, node.assetId, 'image', `CG ${node.id}`);
          break;
        case 'sceneJump':
          if (node.targetSceneId === scene.id || !scenes.has(node.targetSceneId)) {
            throw new Error(`场景跳转 ${node.id} 的目标无效`);
          }
          break;
        case 'choice':
          for (const option of node.options) {
            if (!scenes.has(option.targetSceneId)) {
              throw new Error(`选项 ${option.id} 的目标场景不存在`);
            }
          }
          break;
      }
    }
  }
}

function parseJson(contents: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error('project.vn.json 不是有效 JSON');
  }
}

export function compileAuthorProjectV15(
  contents: string,
  defaultLanguage: EditorLanguage = 'zh-CN',
): CompiledAuthorProject {
  const root = objectValue(parseJson(contents), 'document');
  exactFields(root, ['format', 'fileVersion', 'project', 'assets'], 'document');
  requireLiteral(root, 'format', AUTHOR_PROJECT_FORMAT, 'document');
  if (
    root.fileVersion !== 14 &&
    root.fileVersion !== 15 &&
    root.fileVersion !== 16 &&
    root.fileVersion !== 17 &&
    root.fileVersion !== 18 &&
    root.fileVersion !== 19 &&
    root.fileVersion !== 20 &&
    root.fileVersion !== AUTHOR_PROJECT_FILE_VERSION
  ) {
    throw new Error('document.fileVersion 版本或格式不受支持');
  }
  const sourceFileVersion = root.fileVersion;

  const ids = new Set<string>();
  const referencedAssetIds = new Set<string>();
  const projectValue = objectValue(root.project, 'project');
  exactFields(
    projectValue,
    [
      'schemaVersion',
      'id',
      'name',
      'entrySceneId',
      'startScreen',
      'cgGallery',
      'scenes',
    ],
    'project',
  );
  requireLiteral(projectValue, 'schemaVersion', 1, 'project');
  const projectId = idValue(projectValue, 'id', 'project');
  registerId(ids, projectId);
  const projectName = stringValue(projectValue, 'name', 'project', { maximum: 4096 });
  if (trimAsciiWhitespace(projectName) !== projectName) {
    throw new Error('project.name 不能包含首尾空白');
  }
  const startScreenValue = objectValue(projectValue.startScreen, 'project.startScreen');
  exactFields(
    startScreenValue,
    sourceFileVersion >= 20
      ? ['title', 'eyebrow', 'backgroundAssetId', 'musicAssetId']
      : ['title', 'backgroundAssetId', 'musicAssetId'],
    'project.startScreen',
  );
  const startScreen = {
    title: stringValue(startScreenValue, 'title', 'project.startScreen', {
      maximum: 4096,
    }),
    eyebrow: sourceFileVersion >= 20
      ? stringValue(startScreenValue, 'eyebrow', 'project.startScreen', {
          allowEmpty: true,
          maximum: 256,
        })
      : 'A VN ENGINE STORY',
    backgroundAssetId: nullableId(
      startScreenValue,
      'backgroundAssetId',
      'project.startScreen',
    ),
    musicAssetId: nullableId(
      startScreenValue,
      'musicAssetId',
      'project.startScreen',
    ),
  };
  if (trimAsciiWhitespace(startScreen.title) !== startScreen.title) {
    throw new Error('project.startScreen.title 不能包含首尾空白');
  }
  if (
    trimAsciiWhitespace(startScreen.eyebrow) !== startScreen.eyebrow ||
    Buffer.byteLength(startScreen.eyebrow, 'utf8') > 256 ||
    Buffer.from(startScreen.eyebrow, 'utf8').toString('utf8') !==
      startScreen.eyebrow
  ) {
    throw new Error(
      'project.startScreen.eyebrow 必须是无首尾空白的有效 UTF-8，且最多为 256 字节',
    );
  }
  if (startScreen.backgroundAssetId !== null) {
    referencedAssetIds.add(startScreen.backgroundAssetId);
  }
  if (startScreen.musicAssetId !== null) {
    referencedAssetIds.add(startScreen.musicAssetId);
  }
  const cgGalleryValue = objectValue(projectValue.cgGallery, 'project.cgGallery');
  const seenCgAssetIds = new Set<string>();
  const parseCgAssetId = (
    assetId: unknown,
    context: string,
  ): string | null => {
    if (assetId === null && sourceFileVersion >= 15) {
      return null;
    }
    if (typeof assetId !== 'string') {
      throw new Error(`${context} 不是有效资源 ID${
        sourceFileVersion >= 15 ? ' 或 null' : ''
      }`);
    }
    const parsed = idValue({ assetId }, 'assetId', context);
    if (seenCgAssetIds.has(parsed)) {
      throw new Error('project.cgGallery 不能包含重复资源 ID');
    }
    seenCgAssetIds.add(parsed);
    referencedAssetIds.add(parsed);
    return parsed;
  };
  let cgGallery: RuntimeProjectDocument['cgGallery'];
  if (sourceFileVersion === 14) {
    exactFields(cgGalleryValue, ['imageAssetIds'], 'project.cgGallery');
    const packedAssetIds = arrayValue(
      cgGalleryValue,
      'imageAssetIds',
      'project.cgGallery',
    ).map((assetId, index) =>
      parseCgAssetId(
        assetId,
        `project.cgGallery.imageAssetIds[${index}]`,
      ) as string,
    );
    cgGallery = {
      pages: packedAssetIds.length === 0
        ? [{ imageAssetIds: Array<string | null>(9).fill(null) }]
        : Array.from(
            { length: Math.ceil(packedAssetIds.length / 9) },
            (_, pageIndex) => ({
              imageAssetIds: Array.from(
                { length: 9 },
                (_, slotIndex) =>
                  packedAssetIds[(pageIndex * 9) + slotIndex] ?? null,
              ),
            }),
          ),
    };
  } else {
    exactFields(cgGalleryValue, ['pages'], 'project.cgGallery');
    const cgGalleryPages = arrayValue(
      cgGalleryValue,
      'pages',
      'project.cgGallery',
    );
    if (cgGalleryPages.length === 0) {
      throw new Error('project.cgGallery.pages 至少需要一页');
    }
    cgGallery = {
      pages: cgGalleryPages.map((page, pageIndex) => {
        const context = `project.cgGallery.pages[${pageIndex}]`;
        const pageValue = objectValue(page, context);
        exactFields(pageValue, ['imageAssetIds'], context);
        const slots = arrayValue(pageValue, 'imageAssetIds', context);
        if (slots.length !== 9) {
          throw new Error(`${context}.imageAssetIds 必须精确包含 9 个槽位`);
        }
        return {
          imageAssetIds: slots.map((assetId, slotIndex) =>
            parseCgAssetId(
              assetId,
              `${context}.imageAssetIds[${slotIndex}]`,
            ),
          ),
        };
      }),
    };
  }
  const scenes = arrayValue(projectValue, 'scenes', 'project').map((scene, index) =>
    parseScene(scene, index, ids, referencedAssetIds, sourceFileVersion).scene,
  );
  if (scenes.length === 0) {
    throw new Error('作者项目至少需要一个场景');
  }

  const sourceProject: AuthorProjectDocument = {
    schemaVersion: 1,
    id: projectId,
    name: projectName,
    entrySceneId: idValue(projectValue, 'entrySceneId', 'project'),
    startScreen,
    cgGallery,
    scenes,
  };
  const project = toRuntimeProjectDocument(sourceProject);
  const variableBudgetError = validateProjectLogicVariableBudget(project);
  if (variableBudgetError !== null) {
    throw new Error(`project.scenes ${variableBudgetError}`);
  }

  const allAssets = arrayValue(root, 'assets', 'document').map((asset, index) =>
    parseAsset(asset, index, ids),
  );
  const assetPaths = new Set<string>();
  for (const asset of allAssets) {
    if (assetPaths.has(asset.relativePath)) {
      throw new Error('作者项目包含重复的资源相对路径');
    }
    assetPaths.add(asset.relativePath);
  }
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));
  validateReferences(project, assetsById);

  const referencedAssets = allAssets.filter((asset) =>
    referencedAssetIds.has(asset.id),
  );
  if (referencedAssets.length !== referencedAssetIds.size) {
    throw new Error('剧情引用了资源清单中不存在的资源');
  }

  return {
    sourceProject,
    project,
    game: {
      format: RUNTIME_FORMAT,
      runtimeVersion: RUNTIME_VERSION,
      game: {
        id: project.id,
        title: project.name,
        entrySceneId: project.entrySceneId,
        defaultLanguage,
        startScreen: project.startScreen,
        cgGallery: project.cgGallery,
      },
      scenes: project.scenes,
    },
    referencedAssets,
    publicAssets: allAssets.map(({ id, type, displayName }) => ({
      id,
      type,
      displayName,
    })),
    allAssetCount: allAssets.length,
  };
}
