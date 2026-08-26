import type {
  ChoiceOption,
  LogicCondition,
  LogicOperand,
  LogicValue,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '@vnengine/runtime';
import {
  isLogicValue,
  isLogicVariableName,
  MAX_REPEAT_COUNT,
  validateProjectLogicVariableBudget,
  validateSceneControlFlow,
} from '@vnengine/runtime';

import type {
  PlayerAsset,
  PlayerAssetType,
  PlayerGameData,
} from './playerProtocol';
import {
  expectedAssetDirectory,
  mimeForPlayerAsset,
  mimeMatchesAssetType,
  type PlayerMediaMime,
} from './playerMediaContract';

export type RuntimeManifestAsset = PlayerAsset & {
  path: string;
  mime: PlayerMediaMime;
  bytes: number;
  sha256: string;
};

export type ParsedRuntimeBundle = {
  game: PlayerGameData;
  files: RuntimeManifestAsset[];
  runtimeVersion: SupportedRuntimeVersion;
  buildId: string;
};

type SupportedRuntimeVersion = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type ParsedRuntimeGame = {
  project: ProjectDocument;
  runtimeVersion: SupportedRuntimeVersion;
};

type JsonObject = Record<string, unknown>;

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
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${context} 字段不符合 runtime 约定`);
  }
}

function stringValue(
  value: JsonObject,
  field: string,
  context: string,
  options: { empty?: boolean; maximum?: number } = {},
): string {
  const candidate = value[field];
  const allowEmpty = options.empty ?? false;
  const maximum = options.maximum ?? 4096;
  if (
    typeof candidate !== 'string' ||
    (!allowEmpty && candidate.length === 0) ||
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

function playerCompatibilityForRuntime(
  runtimeVersion: SupportedRuntimeVersion,
): string {
  switch (runtimeVersion) {
    case 1:
      return '>=1 <2';
    case 2:
      return '>=2 <3';
    case 3:
      return '>=3 <4';
    case 4:
      return '>=4 <5';
    case 5:
      return '>=5 <6';
    case 6:
      return '>=6 <7';
    case 7:
      return '>=7 <8';
  }
}

function registerId(ids: Set<string>, id: string): void {
  if (ids.has(id)) {
    throw new Error('runtime 包含重复的实体或资源 ID');
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

function parseSceneNode(
  input: unknown,
  context: string,
  ids: Set<string>,
  runtimeVersion: SupportedRuntimeVersion,
): SceneNode {
  const value = objectValue(input, context);
  const type = stringValue(value, 'type', context);
  const id = idValue(value, 'id', context);
  registerId(ids, id);

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
          empty: true,
          maximum: 4096,
        }),
        text: stringValue(value, 'text', context, {
          empty: true,
          maximum: 1024 * 1024,
        }),
        voiceAssetId: nullableId(value, 'voiceAssetId', context),
      };
    case 'background':
      exactFields(value, ['id', 'type', 'assetId'], context);
      return { id, type, assetId: nullableId(value, 'assetId', context) };
    case 'character': {
      exactFields(
        value,
        runtimeVersion >= 4
          ? ['id', 'type', 'assetId', 'slot', 'layer', 'position']
          : ['id', 'type', 'assetId', 'slot', 'layer'],
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
      if (runtimeVersion >= 4 && value.position !== null) {
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
      return {
        id,
        type,
        assetId: nullableId(value, 'assetId', context),
        slot,
        layer: layer as number,
        position,
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
      return { id, type, assetId: nullableId(value, 'assetId', context) };
    case 'video':
      exactFields(value, ['id', 'type', 'assetId'], context);
      return { id, type, assetId: nullableId(value, 'assetId', context) };
    case 'choice':
      exactFields(value, ['id', 'type', 'options'], context);
      return {
        id,
        type,
        options: arrayValue(value, 'options', context).map((option, index) =>
          parseChoiceOption(option, `${context}.options[${index}]`, ids),
        ),
      };
    case 'variableSet':
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
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
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
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
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
      }
      exactFields(value, ['id', 'type', 'condition'], context);
      return {
        id,
        type,
        condition: parseLogicCondition(value.condition, `${context}.condition`),
      };
    case 'logicElse':
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
      }
      exactFields(value, ['id', 'type', 'ifNodeId'], context);
      return { id, type, ifNodeId: idValue(value, 'ifNodeId', context) };
    case 'logicEndIf':
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
      }
      exactFields(value, ['id', 'type', 'ifNodeId'], context);
      return { id, type, ifNodeId: idValue(value, 'ifNodeId', context) };
    case 'logicRepeat':
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
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
      if (runtimeVersion < 7) {
        throw new Error(`${context}.type 不受 runtime v${runtimeVersion} 支持`);
      }
      exactFields(value, ['id', 'type', 'repeatNodeId'], context);
      return {
        id,
        type,
        repeatNodeId: idValue(value, 'repeatNodeId', context),
      };
    default:
      throw new Error(`${context}.type 不受 runtime 支持`);
  }
}

function parseScene(
  input: unknown,
  index: number,
  ids: Set<string>,
  runtimeVersion: SupportedRuntimeVersion,
): SceneDocument {
  const context = `game.json.scenes[${index}]`;
  const value = objectValue(input, context);
  exactFields(
    value,
    ['schemaVersion', 'id', 'name', 'backgroundAssetId', 'nodes'],
    context,
  );
  requireLiteral(value, 'schemaVersion', 1, context);
  const id = idValue(value, 'id', context);
  registerId(ids, id);
  const nodes = arrayValue(value, 'nodes', context).map((node, nodeIndex) =>
    parseSceneNode(node, `${context}.nodes[${nodeIndex}]`, ids, runtimeVersion),
  );
  const controlError = validateSceneControlFlow(nodes);
  if (controlError !== null) {
    throw new Error(`${context}.nodes ${controlError}`);
  }
  return {
    schemaVersion: 1,
    id,
    name: stringValue(value, 'name', context, { maximum: 4096 }),
    backgroundAssetId: nullableId(value, 'backgroundAssetId', context),
    nodes,
  };
}

function parseRuntimeGame(input: unknown, ids: Set<string>): ParsedRuntimeGame {
  const root = objectValue(input, 'game.json');
  exactFields(root, ['format', 'runtimeVersion', 'game', 'scenes'], 'game.json');
  requireLiteral(root, 'format', 'vn-engine-runtime', 'game.json');
  if (
    root.runtimeVersion !== 1 &&
    root.runtimeVersion !== 2 &&
    root.runtimeVersion !== 3 &&
    root.runtimeVersion !== 4 &&
    root.runtimeVersion !== 5 &&
    root.runtimeVersion !== 6 &&
    root.runtimeVersion !== 7
  ) {
    throw new Error('game.json.runtimeVersion 版本或格式不受支持');
  }
  const runtimeVersion = root.runtimeVersion;

  const metadata = objectValue(root.game, 'game.json.game');
  exactFields(
    metadata,
    runtimeVersion === 1
      ? ['id', 'title', 'entrySceneId']
      : runtimeVersion < 5
        ? ['id', 'title', 'entrySceneId', 'startScreen']
        : ['id', 'title', 'entrySceneId', 'startScreen', 'cgGallery'],
    'game.json.game',
  );
  const projectId = idValue(metadata, 'id', 'game.json.game');
  registerId(ids, projectId);
  const scenes = arrayValue(root, 'scenes', 'game.json').map(
    (scene, index) => parseScene(scene, index, ids, runtimeVersion),
  );
  if (scenes.length === 0) {
    throw new Error('runtime 至少需要一个场景');
  }

  const projectName = stringValue(metadata, 'title', 'game.json.game', {
    maximum: 4096,
  });
  let startScreen = {
    title: projectName,
    backgroundAssetId: null as string | null,
    musicAssetId: null as string | null,
  };
  if (runtimeVersion >= 2) {
    const startScreenValue = objectValue(
      metadata.startScreen,
      'game.json.game.startScreen',
    );
    exactFields(
      startScreenValue,
      runtimeVersion === 2
        ? ['backgroundAssetId', 'musicAssetId']
        : ['title', 'backgroundAssetId', 'musicAssetId'],
      'game.json.game.startScreen',
    );
    startScreen = {
      title: runtimeVersion === 2
        ? projectName
        : stringValue(
            startScreenValue,
            'title',
            'game.json.game.startScreen',
            { maximum: 4096 },
          ),
      backgroundAssetId: nullableId(
        startScreenValue,
        'backgroundAssetId',
        'game.json.game.startScreen',
      ),
      musicAssetId: nullableId(
        startScreenValue,
        'musicAssetId',
        'game.json.game.startScreen',
      ),
    };
  }

  let cgGallery = {
    pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
  };
  if (runtimeVersion === 5) {
    const cgGalleryValue = objectValue(
      metadata.cgGallery,
      'game.json.game.cgGallery',
    );
    exactFields(
      cgGalleryValue,
      ['imageAssetIds'],
      'game.json.game.cgGallery',
    );
    const imageAssetIds = arrayValue(
      cgGalleryValue,
      'imageAssetIds',
      'game.json.game.cgGallery',
    ).map((assetId, index) => {
      if (typeof assetId !== 'string') {
        throw new Error(
          `game.json.game.cgGallery.imageAssetIds[${index}] 不是有效资源 ID`,
        );
      }
      return idValue(
        { assetId },
        'assetId',
        `game.json.game.cgGallery.imageAssetIds[${index}]`,
      );
    });
    if (new Set(imageAssetIds).size !== imageAssetIds.length) {
      throw new Error('game.json.game.cgGallery.imageAssetIds 不能包含重复资源 ID');
    }
    cgGallery = {
      pages: imageAssetIds.length === 0
        ? [{ imageAssetIds: Array<string | null>(9).fill(null) }]
        : Array.from(
            { length: Math.ceil(imageAssetIds.length / 9) },
            (_, pageIndex) => ({
              imageAssetIds: Array.from(
                { length: 9 },
                (_, slotIndex) =>
                  imageAssetIds[(pageIndex * 9) + slotIndex] ?? null,
              ),
            }),
          ),
    };
  } else if (runtimeVersion >= 6) {
    const cgGalleryValue = objectValue(
      metadata.cgGallery,
      'game.json.game.cgGallery',
    );
    exactFields(cgGalleryValue, ['pages'], 'game.json.game.cgGallery');
    const pageValues = arrayValue(
      cgGalleryValue,
      'pages',
      'game.json.game.cgGallery',
    );
    if (pageValues.length === 0) {
      throw new Error('game.json.game.cgGallery.pages 至少需要一页');
    }
    const seenAssetIds = new Set<string>();
    cgGallery = {
      pages: pageValues.map((page, pageIndex) => {
        const context = `game.json.game.cgGallery.pages[${pageIndex}]`;
        const pageValue = objectValue(page, context);
        exactFields(pageValue, ['imageAssetIds'], context);
        const slots = arrayValue(pageValue, 'imageAssetIds', context);
        if (slots.length !== 9) {
          throw new Error(`${context}.imageAssetIds 必须精确包含 9 个槽位`);
        }
        return {
          imageAssetIds: slots.map((assetId, slotIndex) => {
            if (assetId === null) {
              return null;
            }
            if (typeof assetId !== 'string') {
              throw new Error(
                `${context}.imageAssetIds[${slotIndex}] 不是有效资源 ID 或 null`,
              );
            }
            const parsed = idValue(
              { assetId },
              'assetId',
              `${context}.imageAssetIds[${slotIndex}]`,
            );
            if (seenAssetIds.has(parsed)) {
              throw new Error('game.json.game.cgGallery.pages 不能包含重复资源 ID');
            }
            seenAssetIds.add(parsed);
            return parsed;
          }),
        };
      }),
    };
  }

  const project: ProjectDocument = {
    schemaVersion: 1,
    id: projectId,
    name: projectName,
    entrySceneId: idValue(metadata, 'entrySceneId', 'game.json.game'),
    startScreen,
    cgGallery,
    scenes,
  };
  const variableBudgetError = validateProjectLogicVariableBudget(project);
  if (variableBudgetError !== null) {
    throw new Error(`game.json.scenes ${variableBudgetError}`);
  }
  return {
    runtimeVersion,
    project,
  };
}

function parseAssetType(value: unknown, context: string): PlayerAssetType {
  if (value !== 'image' && value !== 'audio' && value !== 'video') {
    throw new Error(`${context}.type 无效`);
  }
  return value;
}

function validateAssetPath(type: PlayerAssetType, relativePath: string): void {
  const prefix = `assets/${expectedAssetDirectory(type)}/`;
  const components = relativePath.split('/');
  if (
    !relativePath.startsWith(prefix) ||
    relativePath.length <= prefix.length ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    components.some(
      (component) => component === '' || component === '.' || component === '..',
    )
  ) {
    throw new Error('manifest.json 包含不安全的资源相对路径');
  }
}

function parseManifestAsset(
  input: unknown,
  index: number,
  ids: Set<string>,
): RuntimeManifestAsset {
  const context = `manifest.json.files[${index}]`;
  const value = objectValue(input, context);
  exactFields(
    value,
    ['assetId', 'type', 'displayName', 'path', 'mime', 'bytes', 'sha256'],
    context,
  );
  const type = parseAssetType(value.type, context);
  const assetId = idValue(value, 'assetId', context);
  registerId(ids, assetId);
  const relativePath = stringValue(value, 'path', context, { maximum: 4096 });
  validateAssetPath(type, relativePath);

  const mime = stringValue(value, 'mime', context, { maximum: 128 });
  if (
    !mimeMatchesAssetType(type, mime) ||
    mimeForPlayerAsset(type, relativePath) !== mime
  ) {
    throw new Error(`${context} 的 type、MIME 与扩展名不一致`);
  }
  if (!Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0) {
    throw new Error(`${context}.bytes 必须是正整数`);
  }
  const sha256 = stringValue(value, 'sha256', context, { maximum: 64 });
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error(`${context}.sha256 无效`);
  }

  return {
    id: assetId,
    type,
    displayName: stringValue(value, 'displayName', context, { maximum: 4096 }),
    path: relativePath,
    mime,
    bytes: value.bytes as number,
    sha256,
  };
}

function parseManifest(
  input: unknown,
  projectId: string,
  ids: Set<string>,
  runtimeVersion: SupportedRuntimeVersion,
): { buildId: string; files: RuntimeManifestAsset[] } {
  const root = objectValue(input, 'manifest.json');
  exactFields(
    root,
    [
      'format',
      'manifestVersion',
      'buildId',
      'projectId',
      'sourceRevision',
      'runtimeVersion',
      'playerCompatibility',
      'createdAt',
      'files',
    ],
    'manifest.json',
  );
  requireLiteral(root, 'format', 'vn-engine-runtime-manifest', 'manifest.json');
  requireLiteral(root, 'manifestVersion', 1, 'manifest.json');
  requireLiteral(root, 'runtimeVersion', runtimeVersion, 'manifest.json');
  requireLiteral(
    root,
    'playerCompatibility',
    playerCompatibilityForRuntime(runtimeVersion),
    'manifest.json',
  );
  const buildId = idValue(root, 'buildId', 'manifest.json');
  if (idValue(root, 'projectId', 'manifest.json') !== projectId) {
    throw new Error('game.json 与 manifest.json 的 Project ID 不一致');
  }
  if (
    !Number.isSafeInteger(root.sourceRevision) ||
    (root.sourceRevision as number) < 0
  ) {
    throw new Error('manifest.json.sourceRevision 必须是非负整数');
  }
  const createdAt = stringValue(root, 'createdAt', 'manifest.json', {
    maximum: 64,
  });
  if (
    Number.isNaN(Date.parse(createdAt)) ||
    new Date(createdAt).toISOString() !== createdAt
  ) {
    throw new Error('manifest.json.createdAt 必须是规范 UTC 时间');
  }

  const paths = new Set<string>();
  const files = arrayValue(root, 'files', 'manifest.json').map((file, index) => {
    const parsed = parseManifestAsset(file, index, ids);
    if (paths.has(parsed.path)) {
      throw new Error('manifest.json 包含重复的资源路径');
    }
    paths.add(parsed.path);
    return parsed;
  });
  return { buildId, files };
}

function requireAssetType(
  assets: ReadonlyMap<string, RuntimeManifestAsset>,
  assetId: string | null,
  expectedType: PlayerAssetType,
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

function validateProjectReferences(
  project: ProjectDocument,
  files: RuntimeManifestAsset[],
): void {
  const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
  if (!scenes.has(project.entrySceneId)) {
    throw new Error('入口场景不存在');
  }
  const assets = new Map(files.map((asset) => [asset.id, asset]));

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
    requireAssetType(
      assets,
      scene.backgroundAssetId,
      'image',
      `场景 ${scene.id} 的初始背景`,
    );
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

function parseJson(contents: string, fileName: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error(`${fileName} 不是有效 JSON`);
  }
}

export function parseRuntimeBundleDocuments(
  gameContents: string,
  manifestContents: string,
): ParsedRuntimeBundle {
  const ids = new Set<string>();
  const parsedGame = parseRuntimeGame(parseJson(gameContents, 'game.json'), ids);
  const manifest = parseManifest(
    parseJson(manifestContents, 'manifest.json'),
    parsedGame.project.id,
    ids,
    parsedGame.runtimeVersion,
  );
  validateProjectReferences(parsedGame.project, manifest.files);
  return {
    game: {
      project: parsedGame.project,
      assets: manifest.files.map(({ id, type, displayName }) => ({
        id,
        type,
        displayName,
      })),
    },
    files: manifest.files,
    runtimeVersion: parsedGame.runtimeVersion,
    buildId: manifest.buildId,
  };
}
