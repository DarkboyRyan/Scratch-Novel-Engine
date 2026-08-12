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
      !isObject(value.result.project)
    ) {
      throw new Error(`C++ 后端响应缺少 project：${line}`);
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
