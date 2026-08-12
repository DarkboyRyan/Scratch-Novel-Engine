import type {
  BackendResponse,
  EngineMutationResult,
} from '../../shared/engineProtocol';
import type { AssetDocument } from '../../shared/projectTypes';

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

function toPublicAssetDocument(
  value: Record<string, unknown>,
): AssetDocument {
  return {
    id: value.id as string,
    type: value.type as AssetDocument['type'],
    displayName: value.displayName as string,
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
      !isObject(value.result.project) ||
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
      project: rawResult.project as EngineMutationResult['project'],
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
