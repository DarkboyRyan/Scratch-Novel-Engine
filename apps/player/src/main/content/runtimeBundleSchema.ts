import type {
  ChoiceOption,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '@vnengine/runtime';

import type {
  PlayerAsset,
  PlayerAssetType,
  PlayerGameData,
} from '../../shared/playerProtocol';
import {
  expectedAssetDirectory,
  mimeForPlayerAsset,
  mimeMatchesAssetType,
  type PlayerMediaMime,
} from '../media/mediaPolicy';

export type RuntimeManifestAsset = PlayerAsset & {
  path: string;
  mime: PlayerMediaMime;
  bytes: number;
  sha256: string;
};

export type ParsedRuntimeBundle = {
  game: PlayerGameData;
  files: RuntimeManifestAsset[];
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
    throw new Error(`${context} 字段不符合 runtime v1`);
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

function registerId(ids: Set<string>, id: string): void {
  if (ids.has(id)) {
    throw new Error('runtime v1 包含重复的实体或资源 ID');
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

function parseSceneNode(
  input: unknown,
  context: string,
  ids: Set<string>,
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
      exactFields(value, ['id', 'type', 'assetId', 'slot', 'layer'], context);
      const slot = value.slot;
      const layer = value.layer;
      if (slot !== 'left' && slot !== 'center' && slot !== 'right') {
        throw new Error(`${context}.slot 无效`);
      }
      if (!Number.isSafeInteger(layer) || (layer as number) < 1 || (layer as number) > 10) {
        throw new Error(`${context}.layer 必须是 1 到 10 的整数`);
      }
      return {
        id,
        type,
        assetId: nullableId(value, 'assetId', context),
        slot,
        layer: layer as number,
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
    default:
      throw new Error(`${context}.type 不受 runtime v1 支持`);
  }
}

function parseScene(
  input: unknown,
  index: number,
  ids: Set<string>,
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
  return {
    schemaVersion: 1,
    id,
    name: stringValue(value, 'name', context, { maximum: 4096 }),
    backgroundAssetId: nullableId(value, 'backgroundAssetId', context),
    nodes: arrayValue(value, 'nodes', context).map((node, nodeIndex) =>
      parseSceneNode(node, `${context}.nodes[${nodeIndex}]`, ids),
    ),
  };
}

function parseRuntimeGame(input: unknown, ids: Set<string>): ProjectDocument {
  const root = objectValue(input, 'game.json');
  exactFields(root, ['format', 'runtimeVersion', 'game', 'scenes'], 'game.json');
  requireLiteral(root, 'format', 'vn-engine-runtime', 'game.json');
  requireLiteral(root, 'runtimeVersion', 1, 'game.json');

  const metadata = objectValue(root.game, 'game.json.game');
  exactFields(metadata, ['id', 'title', 'entrySceneId'], 'game.json.game');
  const projectId = idValue(metadata, 'id', 'game.json.game');
  registerId(ids, projectId);
  const scenes = arrayValue(root, 'scenes', 'game.json').map(
    (scene, index) => parseScene(scene, index, ids),
  );
  if (scenes.length === 0) {
    throw new Error('runtime v1 至少需要一个场景');
  }

  return {
    schemaVersion: 1,
    id: projectId,
    name: stringValue(metadata, 'title', 'game.json.game', { maximum: 4096 }),
    entrySceneId: idValue(metadata, 'entrySceneId', 'game.json.game'),
    scenes,
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
): RuntimeManifestAsset[] {
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
  requireLiteral(root, 'runtimeVersion', 1, 'manifest.json');
  requireLiteral(root, 'playerCompatibility', '>=1 <2', 'manifest.json');
  idValue(root, 'buildId', 'manifest.json');
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
  return arrayValue(root, 'files', 'manifest.json').map((file, index) => {
    const parsed = parseManifestAsset(file, index, ids);
    if (paths.has(parsed.path)) {
      throw new Error('manifest.json 包含重复的资源路径');
    }
    paths.add(parsed.path);
    return parsed;
  });
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
  const project = parseRuntimeGame(parseJson(gameContents, 'game.json'), ids);
  const files = parseManifest(
    parseJson(manifestContents, 'manifest.json'),
    project.id,
    ids,
  );
  validateProjectReferences(project, files);
  return {
    game: {
      project,
      assets: files.map(({ id, type, displayName }) => ({
        id,
        type,
        displayName,
      })),
    },
    files,
  };
}
