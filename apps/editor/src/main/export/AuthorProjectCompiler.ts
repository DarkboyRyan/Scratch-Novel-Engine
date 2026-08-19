import path from 'node:path';

import type {
  ChoiceOption,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '@vnengine/runtime';

import type { AssetDocument } from '../../shared/projectTypes';
import {
  previewMimeForAsset,
  type PreviewMime,
} from '../media/MediaFormat';

export const AUTHOR_PROJECT_FORMAT = 'vn-engine-project';
export const AUTHOR_PROJECT_FILE_VERSION = 9;
export const RUNTIME_FORMAT = 'vn-engine-runtime';
export const RUNTIME_VERSION = 1;

export type AuthorAssetRecord = AssetDocument & {
  relativePath: string;
  mime: PreviewMime;
};

export type RuntimeGameDocumentV1 = {
  format: typeof RUNTIME_FORMAT;
  runtimeVersion: typeof RUNTIME_VERSION;
  game: {
    id: string;
    title: string;
    entrySceneId: string;
  };
  scenes: SceneDocument[];
};

export type CompiledAuthorProject = {
  game: RuntimeGameDocumentV1;
  project: ProjectDocument;
  referencedAssets: AuthorAssetRecord[];
  publicAssets: AssetDocument[];
  allAssetCount: number;
};

type JsonObject = Record<string, unknown>;

type ParsedScene = {
  scene: SceneDocument;
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
    throw new Error(`${context} 字段不符合作者项目 v9`);
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

function parseSceneNode(
  input: unknown,
  context: string,
  ids: Set<string>,
  referencedAssetIds: Set<string>,
): SceneNode {
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
      exactFields(value, ['id', 'type', 'assetId'], context);
      return {
        id,
        type,
        assetId: registerOptionalAsset(nullableId(value, 'assetId', context)),
      };
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
        assetId: registerOptionalAsset(nullableId(value, 'assetId', context)),
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
  referencedAssetIds: Set<string>,
): ParsedScene {
  const context = `project.scenes[${index}]`;
  const value = objectValue(input, context);
  exactFields(value, ['schemaVersion', 'id', 'name', 'visuals', 'nodes'], context);
  requireLiteral(value, 'schemaVersion', 1, context);
  const id = idValue(value, 'id', context);
  registerId(ids, id);

  const visuals = objectValue(value.visuals, `${context}.visuals`);
  exactFields(visuals, ['backgroundAssetId', 'characters'], `${context}.visuals`);
  const backgroundAssetId = nullableId(
    visuals,
    'backgroundAssetId',
    `${context}.visuals`,
  );
  if (backgroundAssetId !== null) {
    referencedAssetIds.add(backgroundAssetId);
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
    throw new Error('runtime v1 不支持场景初始人物，请改用人物立绘时间线节点');
  }

  return {
    scene: {
      schemaVersion: 1,
      id,
      name: stringValue(value, 'name', context, { maximum: 4096 }),
      backgroundAssetId,
      nodes: arrayValue(value, 'nodes', context).map((node, nodeIndex) =>
        parseSceneNode(
          node,
          `${context}.nodes[${nodeIndex}]`,
          ids,
          referencedAssetIds,
        ),
      ),
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
  project: ProjectDocument,
  assets: ReadonlyMap<string, AuthorAssetRecord>,
): void {
  const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
  if (!scenes.has(project.entrySceneId)) {
    throw new Error('入口场景不存在');
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

export function compileAuthorProjectV9(contents: string): CompiledAuthorProject {
  const root = objectValue(parseJson(contents), 'document');
  exactFields(root, ['format', 'fileVersion', 'project', 'assets'], 'document');
  requireLiteral(root, 'format', AUTHOR_PROJECT_FORMAT, 'document');
  requireLiteral(root, 'fileVersion', AUTHOR_PROJECT_FILE_VERSION, 'document');

  const ids = new Set<string>();
  const referencedAssetIds = new Set<string>();
  const projectValue = objectValue(root.project, 'project');
  exactFields(
    projectValue,
    ['schemaVersion', 'id', 'name', 'entrySceneId', 'scenes'],
    'project',
  );
  requireLiteral(projectValue, 'schemaVersion', 1, 'project');
  const projectId = idValue(projectValue, 'id', 'project');
  registerId(ids, projectId);
  const projectName = stringValue(projectValue, 'name', 'project', { maximum: 4096 });
  if (trimAsciiWhitespace(projectName) !== projectName) {
    throw new Error('project.name 不能包含首尾空白');
  }
  const scenes = arrayValue(projectValue, 'scenes', 'project').map((scene, index) =>
    parseScene(scene, index, ids, referencedAssetIds).scene,
  );
  if (scenes.length === 0) {
    throw new Error('作者项目至少需要一个场景');
  }

  const project: ProjectDocument = {
    schemaVersion: 1,
    id: projectId,
    name: projectName,
    entrySceneId: idValue(projectValue, 'entrySceneId', 'project'),
    scenes,
  };

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
    project,
    game: {
      format: RUNTIME_FORMAT,
      runtimeVersion: RUNTIME_VERSION,
      game: {
        id: project.id,
        title: project.name,
        entrySceneId: project.entrySceneId,
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
