// 主要作用：验证项目文件 IPC 的动作、名称和无路径参数约束。
// 关键实现：isProjectFileInvocation 按 create/open/save/get-session 精确分支判断。
import type { ProjectFileInvocation } from '../../shared/projectFileProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function isProjectFileInvocation(
  value: unknown,
): value is ProjectFileInvocation {
  if (
    !isObject(value) ||
    !isObject(value.params) ||
    !hasOnlyKeys(value, ['action', 'params'])
  ) {
    return false;
  }

  if (value.action === 'open' || value.action === 'save') {
    // 特别禁止 filePath 等字段穿过 Renderer -> Main 边界。
    return Object.keys(value.params).length === 0;
  }

  if (value.action === 'get-session') {
    return Object.keys(value.params).length === 0;
  }

  if (value.action === 'create') {
    return (
      hasOnlyKeys(value.params, ['name']) &&
      (value.params.name === undefined ||
        typeof value.params.name === 'string')
    );
  }

  return false;
}
