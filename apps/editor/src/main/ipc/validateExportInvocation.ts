// 主要作用：验证运行包、Web 包和独立应用导出请求的 IPC 结构。
// 关键实现：isExportGameInvocation 检查精确键，复用应用元数据规则。
import type {
  ExportGameInvocation,
  StandaloneApplicationMetadata,
} from '../../shared/exportProtocol';
import { standaloneApplicationMetadataError } from '../../shared/exportProtocol';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

export function isStandaloneApplicationMetadata(
  value: unknown,
): value is StandaloneApplicationMetadata {
  if (!isObject(value) || !hasExactKeys(value, ['name', 'version', 'applicationId'])) {
    return false;
  }
  const { name, version, applicationId } = value;
  return (
    typeof name === 'string' &&
    typeof version === 'string' &&
    typeof applicationId === 'string' &&
    standaloneApplicationMetadataError({ name, version, applicationId }) === null
  );
}

export function isExportGameInvocation(
  value: unknown,
): value is ExportGameInvocation {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ['action', 'params']) ||
    value.action !== 'export' ||
    !isObject(value.params)
  ) {
    return false;
  }
  if (
    hasExactKeys(value.params, ['output']) &&
    (value.params.output === 'runtime-bundle' ||
      value.params.output === 'web-player')
  ) {
    return true;
  }
  return (
    hasExactKeys(value.params, ['output', 'application']) &&
    value.params.output === 'standalone-application' &&
    isStandaloneApplicationMetadata(value.params.application)
  );
}
