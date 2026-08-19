// Use filenamify's browser entry here. This shared contract is imported by the
// sandboxed Electron Preload, where the package's default Node entry would
// eagerly load `node:path` and prevent the entire contextBridge from starting.
import filenamify from 'filenamify/browser';

export { EXPORT_GAME_IPC_CHANNEL } from './exportIpcChannel';

// Renderer 只能表达“导出当前游戏”的意图及不含路径的应用元数据。
// 输出位置和模板位置必须由 Electron Main 决定，不能作为 IPC 参数
// 从 Renderer 传入或在结果中返回。
export type RuntimeBundleExportRequest = {
  output: 'runtime-bundle';
};

export type StandaloneApplicationMetadata = {
  name: string;
  version: string;
  applicationId: string;
};

const MAX_MACOS_APPLICATION_BASENAME_UTF8_BYTES = 251;

export function standaloneApplicationMetadataError(
  metadata: StandaloneApplicationMetadata,
): string | null {
  if (
    metadata.name !== metadata.name.normalize('NFC') ||
    metadata.name !== metadata.name.trim() ||
    metadata.name.length < 1 ||
    Array.from(metadata.name).length > 80 ||
    new TextEncoder().encode(metadata.name).byteLength >
      MAX_MACOS_APPLICATION_BASENAME_UTF8_BYTES ||
    filenamify(metadata.name, { replacement: '-' }) !== metadata.name ||
    [...metadata.name].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    }) ||
    /[<>:"/\\|?*]/u.test(metadata.name) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(metadata.name) ||
    /[. ]$/u.test(metadata.name)
  ) {
    return '应用名称需为 1–80 个字符、不能过长，且不能包含系统保留字符';
  }
  if (
    metadata.version.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
      metadata.version,
    )
  ) {
    return '版本号需使用 1.0.0 这样的三段数字';
  }
  if (
    metadata.applicationId.length > 155 ||
    !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/u.test(
      metadata.applicationId,
    )
  ) {
    return 'Application ID 需使用 com.example.game 这样的反向域名';
  }
  return null;
}

export type StandaloneApplicationExportRequest = {
  output: 'standalone-application';
  application: StandaloneApplicationMetadata;
};

export type GameExportRequest =
  | RuntimeBundleExportRequest
  | StandaloneApplicationExportRequest;

export type ExportGameInvocation = {
  action: 'export';
  params: GameExportRequest;
};

export type ExportGameCompletedResult = {
  cancelled: false;
  output: GameExportRequest['output'];
  // 只返回面向用户的产物名称，不公开输出目录、模板目录或绝对路径。
  artifactName: string;
  sourceRevision: number;
  assetCount: number;
};

export type ExportGameCancelledResult = {
  cancelled: true;
};

export type ExportGameResult =
  | ExportGameCompletedResult
  | ExportGameCancelledResult;

export type VnGameExportApi = {
  exportGame(request: GameExportRequest): Promise<ExportGameResult>;
};
