import type {
  BackendResponse,
  EngineMutationResult,
} from '../../shared/engineProtocol';
import type {
  AssetDocument,
  CharacterSlot,
  ProjectDocument,
  SceneDocument,
  SceneNode,
} from '../../shared/projectTypes';

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
    value.type !== 'character'
  ) {
    return false;
  }

  if (value.type === 'dialogue') {
    return (
      typeof value.speaker === 'string' &&
      typeof value.text === 'string'
    );
  }

  if (value.type === 'character') {
    return (
      (value.assetId === null || typeof value.assetId === 'string') &&
      (value.slot === 'left' ||
        value.slot === 'center' ||
        value.slot === 'right') &&
      Number.isInteger(value.layer) &&
      (value.layer as number) >= 1 &&
      (value.layer as number) <= 10
    );
  }

  return value.assetId === null || typeof value.assetId === 'string';
}

function isSceneDocument(value: unknown): boolean {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.backgroundAssetId === null ||
      typeof value.backgroundAssetId === 'string') &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isSceneNode)
  );
}

function isProjectDocument(value: unknown): boolean {
  return (
    isObject(value) &&
    value.schemaVersion === 1 &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.entrySceneId === 'string' &&
    Array.isArray(value.scenes) &&
    value.scenes.every(isSceneDocument)
  );
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
  if (value.type === 'background') {
    return {
      id: value.id as string,
      type: 'background',
      assetId: value.assetId as string | null,
    };
  }

  if (value.type === 'character') {
    return {
      id: value.id as string,
      type: 'character',
      assetId: value.assetId as string | null,
      slot: value.slot as CharacterSlot,
      layer: value.layer as number,
    };
  }

  return {
    id: value.id as string,
    type: 'dialogue',
    speaker: value.speaker as string,
    text: value.text as string,
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
