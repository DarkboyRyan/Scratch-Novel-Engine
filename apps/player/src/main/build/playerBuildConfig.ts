/**
 * 主要作用：解析并验证 Player 单游戏构建环境及嵌入资源位置。
 * 关键函数与实现：`PLAYER_BUILD_ENV`、`PlayerBuildConfig`、`resolvePlayerBuildConfig`、`resolveCopiedEmbeddedGameRoot`；基于 Electron Main 与 Node.js 安全文件/协议边界实现。
 */
import filenamify from 'filenamify';
import { lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { loadRuntimeBundle } from '../content/PlayerBundleLoader';

export const PLAYER_BUILD_ENV = {
  productName: 'VN_PLAYER_PRODUCT_NAME',
  version: 'VN_PLAYER_VERSION',
  appBundleId: 'VN_PLAYER_APP_BUNDLE_ID',
  iconPath: 'VN_PLAYER_ICON_PATH',
  embeddedGameDirectory: 'VN_PLAYER_EMBEDDED_GAME_DIR',
  outDir: 'VN_PLAYER_OUT_DIR',
} as const;

const DEFAULT_PRODUCT_NAME = 'VN Engine Player';
const DEFAULT_VERSION = '0.1.0';
const DEFAULT_APP_BUNDLE_ID = 'com.vnengine.player';
const DEFAULT_OUT_DIR = 'out';
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

type BuildEnvironment = Readonly<Record<string, string | undefined>>;

export type PlayerBuildConfig = {
  productName: string;
  version: string;
  appBundleId: string;
  iconPath: string | null;
  embeddedGameDirectory: string | null;
  outDir: string;
};

function readOptional(
  environment: BuildEnvironment,
  variableName: string,
): string | null {
  const value = environment[variableName];
  if (value === undefined || value === '') {
    return null;
  }
  if (value.trim() !== value) {
    throw new Error(`${variableName} 不能包含首尾空白`);
  }
  return value;
}

function validateProductName(value: string): string {
  const containsUnsafeCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint < 32 ||
      codePoint === 127 ||
      '<>:"/\\|?*'.includes(character)
    );
  });
  if (
    value !== value.normalize('NFC') ||
    Array.from(value).length > 80 ||
    filenamify(value, { replacement: '-' }) !== value ||
    containsUnsafeCharacter ||
    value === '.' ||
    value === '..' ||
    value.endsWith('.') ||
    WINDOWS_RESERVED_NAME.test(value)
  ) {
    throw new Error(`${PLAYER_BUILD_ENV.productName} 不是安全的应用名称`);
  }
  return value;
}

function validateVersion(value: string): string {
  if (
    value.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value)
  ) {
    throw new Error(`${PLAYER_BUILD_ENV.version} 必须是 x.y.z 数字版本`);
  }
  return value;
}

function validateBundleId(value: string): string {
  if (
    value.length > 155 ||
    !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/u.test(value)
  ) {
    throw new Error(
      `${PLAYER_BUILD_ENV.appBundleId} 必须是安全的 reverse-DNS ID`,
    );
  }
  return value;
}

function canonicalRegularFile(value: string, variableName: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${variableName} 必须是绝对路径`);
  }
  const status = lstatSync(value);
  if (status.isSymbolicLink() || !status.isFile() || status.nlink !== 1) {
    throw new Error(`${variableName} 必须指向非链接普通文件`);
  }
  return realpathSync.native(value);
}

function canonicalGameDirectory(value: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${PLAYER_BUILD_ENV.embeddedGameDirectory} 必须是绝对路径`);
  }
  const status = lstatSync(value);
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new Error(
      `${PLAYER_BUILD_ENV.embeddedGameDirectory} 必须指向非链接普通目录`,
    );
  }
  const canonical = realpathSync.native(value);
  if (path.basename(canonical) !== 'game') {
    throw new Error(
      `${PLAYER_BUILD_ENV.embeddedGameDirectory} 目录名必须是 game`,
    );
  }
  return canonical;
}

function absoluteOutputDirectory(value: string | null): string {
  if (value === null) {
    return DEFAULT_OUT_DIR;
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${PLAYER_BUILD_ENV.outDir} 必须是绝对路径`);
  }
  return path.normalize(value);
}

/**
 * Reads the build-only contract. These values are consumed by Forge/Main and
 * are intentionally never referenced by Preload or Renderer code.
 */
export function resolvePlayerBuildConfig(
  environment: BuildEnvironment = process.env,
): PlayerBuildConfig {
  const embeddedSource = readOptional(
    environment,
    PLAYER_BUILD_ENV.embeddedGameDirectory,
  );
  const productNameValue = readOptional(environment, PLAYER_BUILD_ENV.productName);
  const versionValue = readOptional(environment, PLAYER_BUILD_ENV.version);
  const bundleIdValue = readOptional(environment, PLAYER_BUILD_ENV.appBundleId);
  const iconValue = readOptional(environment, PLAYER_BUILD_ENV.iconPath);

  if (
    embeddedSource !== null &&
    (productNameValue === null || versionValue === null || bundleIdValue === null)
  ) {
    throw new Error(
      '单游戏构建必须同时提供 productName、version 和 appBundleId',
    );
  }

  const iconPath = iconValue === null
    ? null
    : canonicalRegularFile(iconValue, PLAYER_BUILD_ENV.iconPath);
  if (
    iconPath !== null &&
    !['.icns', '.ico', '.png'].includes(path.extname(iconPath).toLowerCase())
  ) {
    throw new Error(`${PLAYER_BUILD_ENV.iconPath} 只支持 .icns、.ico 或 .png`);
  }
  if (
    process.platform === 'linux' &&
    iconPath !== null &&
    path.basename(iconPath) !== 'vn-player-icon.png'
  ) {
    throw new Error(
      `${PLAYER_BUILD_ENV.iconPath} 在 Linux 必须命名为 vn-player-icon.png`,
    );
  }

  return {
    productName: validateProductName(productNameValue ?? DEFAULT_PRODUCT_NAME),
    version: validateVersion(versionValue ?? DEFAULT_VERSION),
    appBundleId: validateBundleId(bundleIdValue ?? DEFAULT_APP_BUNDLE_ID),
    iconPath,
    embeddedGameDirectory:
      embeddedSource === null ? null : canonicalGameDirectory(embeddedSource),
    outDir: absoluteOutputDirectory(
      readOptional(environment, PLAYER_BUILD_ENV.outDir),
    ),
  };
}

export function resolveCopiedEmbeddedGameRoot(
  buildPath: string,
  platform: string,
  productName: string,
): string {
  const resourcesDirectory = platform === 'darwin' || platform === 'mas'
    ? path.join(buildPath, `${productName}.app`, 'Contents', 'Resources')
    : path.join(buildPath, 'resources');
  return path.join(resourcesDirectory, 'game');
}

/**
 * Electron Packager invokes this after extraResource has been copied and
 * before platform signing. Verifying the copied bytes prevents signing a
 * bundle that became invalid between export and packaging.
 */
export async function verifyCopiedEmbeddedGame(
  buildPath: string,
  platform: string,
  productName: string,
): Promise<void> {
  await loadRuntimeBundle(
    resolveCopiedEmbeddedGameRoot(buildPath, platform, productName),
  );
}
