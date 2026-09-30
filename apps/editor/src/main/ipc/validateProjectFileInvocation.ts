// 主要作用：验证项目文件 IPC 的动作、名称和无路径参数约束。
// 关键实现：isProjectFileInvocation 按 create/open/save/get-session 精确分支判断。
import type { ProjectFileInvocation, RecoveryDrafts } from '../../shared/projectFileProtocol';

export function isRecoveryDrafts(value: unknown): value is RecoveryDrafts {
  if (!isObject(value) || !hasOnlyKeys(value, ['projectId', 'code', 'form', 'projectName']) ||
      typeof value.projectId !== 'string' || value.projectId.length > 256 ||
      !Array.isArray(value.code) || value.code.length > 100) return false;
  if (!value.code.every((draft) => isObject(draft) &&
      hasOnlyKeys(draft, ['key', 'source', 'baseSource']) &&
      typeof draft.key === 'string' && draft.key.length <= 1024 &&
      typeof draft.source === 'string' && typeof draft.baseSource === 'string')) return false;
  if (value.projectName !== undefined && typeof value.projectName !== 'string') return false;
  const form = value.form;
  const validForm = form === undefined || (isObject(form) &&
    hasOnlyKeys(form, ['sceneId', 'nodeId', 'speaker', 'text']) &&
    typeof form.sceneId === 'string' && (form.nodeId === null || typeof form.nodeId === 'string') &&
    typeof form.speaker === 'string' && typeof form.text === 'string');
  return validForm && Buffer.byteLength(JSON.stringify(value), 'utf8') <= 2 * 1024 * 1024;
}

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

  if (value.action === 'recover' || value.action === 'get-recovery-drafts') {
    return Object.keys(value.params).length === 0;
  }
  if (value.action === 'checkpoint-drafts') {
    return hasOnlyKeys(value.params, ['drafts']) && isRecoveryDrafts(value.params.drafts);
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
