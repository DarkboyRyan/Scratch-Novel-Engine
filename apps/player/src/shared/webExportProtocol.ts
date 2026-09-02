/**
 * 主要作用：定义并严格解析 Web 导出描述文件和运行时兼容范围。
 * 关键函数与实现：`WEB_EXPORT_FORMAT`、`WEB_EXPORT_VERSION`、`WebExportDescriptor`、`playerCompatibilityForRuntime`；以 TypeScript 类型边界和可组合函数实现。
 */
export const WEB_EXPORT_FORMAT = 'vn-engine-web-export' as const;
export const WEB_EXPORT_VERSION = 1 as const;

export type WebExportDescriptor = {
  format: typeof WEB_EXPORT_FORMAT;
  webExportVersion: typeof WEB_EXPORT_VERSION;
  runtimeVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
  playerCompatibility: string;
  gameRoot: `game/${string}`;
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: JsonObject,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

export function playerCompatibilityForRuntime(runtimeVersion: number): string {
  return `>=${runtimeVersion} <${runtimeVersion + 1}`;
}

function isSupportedRuntimeVersion(
  value: unknown,
): value is WebExportDescriptor['runtimeVersion'] {
  return value === 1 || value === 2 || value === 3 ||
    value === 4 || value === 5 || value === 6 || value === 7 || value === 8 ||
    value === 9 || value === 10 || value === 11 || value === 12 ||
    value === 13;
}

function isSafeGameRoot(value: unknown): value is `game/${string}` {
  if (typeof value !== 'string' || value.length > 261) {
    return false;
  }
  const segments = value.split('/');
  return segments.length === 2 &&
    segments[0] === 'game' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(segments[1] ?? '');
}

export function parseWebExportDescriptor(contents: string): WebExportDescriptor {
  let input: unknown;
  try {
    input = JSON.parse(contents) as unknown;
  } catch {
    throw new Error('web-export.json 不是有效 JSON');
  }
  if (!isObject(input) || !hasExactFields(input, [
    'format',
    'webExportVersion',
    'runtimeVersion',
    'playerCompatibility',
    'gameRoot',
  ])) {
    throw new Error('web-export.json 字段不符合 Web 导出约定');
  }
  if (
    input.format !== WEB_EXPORT_FORMAT ||
    input.webExportVersion !== WEB_EXPORT_VERSION ||
    !isSupportedRuntimeVersion(input.runtimeVersion)
  ) {
    throw new Error('web-export.json 版本或格式不受支持');
  }
  if (
    input.playerCompatibility !==
      playerCompatibilityForRuntime(input.runtimeVersion)
  ) {
    throw new Error('web-export.json Player 兼容范围无效');
  }
  if (!isSafeGameRoot(input.gameRoot)) {
    throw new Error('web-export.json.gameRoot 不是安全的游戏路径');
  }
  return input as WebExportDescriptor;
}
