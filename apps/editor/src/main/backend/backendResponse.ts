import type { BackendResponse } from '../../shared/engineProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
      !isObject(value.result.session) ||
      !Number.isInteger(value.result.session.revision) ||
      (value.result.session.revision as number) < 0 ||
      !(
        value.result.session.savedRevision === null ||
        (Number.isInteger(value.result.session.savedRevision) &&
          (value.result.session.savedRevision as number) >= 0)
      ) ||
      typeof value.result.session.isDirty !== 'boolean'
    ) {
      throw new Error(
        `C++ 后端响应缺少有效的 project 或 session：${line}`,
      );
    }
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
