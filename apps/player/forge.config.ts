/**
 * 主要作用：配置 Electron Forge 打包、平台产物、应用熔断与嵌入游戏校验。
 * 关键函数与实现：verifyEmbeddedResource、config；以 TypeScript 类型边界和可组合函数实现。
 */
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';
import type { HookFunction } from '@electron/packager';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerZIP } from '@electron-forge/maker-zip';

import {
  resolvePlayerBuildConfig,
  verifyCopiedEmbeddedGame,
} from './src/main/build/playerBuildConfig';

const playerBuild = resolvePlayerBuildConfig();
const extraResources = [
  ...(playerBuild.embeddedGameDirectory === null
    ? []
    : [playerBuild.embeddedGameDirectory]),
  ...(process.platform === 'linux' && playerBuild.iconPath !== null
    ? [playerBuild.iconPath]
    : []),
];

const verifyEmbeddedResource: HookFunction = (
  buildPath,
  _electronVersion,
  platform,
  _arch,
  callback,
) => {
  void verifyCopiedEmbeddedGame(
    buildPath,
    platform,
    playerBuild.productName,
  ).then(
    () => callback(),
    (error: unknown) => callback(
      error instanceof Error ? error : new Error('内嵌游戏校验失败'),
    ),
  );
};

const config: ForgeConfig = {
  // CI and local signing checks can redirect output outside synchronized
  // folders, whose Finder/FileProvider xattrs would invalidate a signature.
  outDir: playerBuild.outDir,
  packagerConfig: {
    asar: true,
    name: playerBuild.productName,
    appVersion: playerBuild.version,
    buildVersion: playerBuild.version,
    appBundleId: playerBuild.appBundleId,
    ...(playerBuild.iconPath === null || process.platform === 'linux'
      ? {}
      : { icon: playerBuild.iconPath }),
    ...(extraResources.length === 0 ? {} : { extraResource: extraResources }),
    ...(playerBuild.embeddedGameDirectory === null
      ? {}
      : {
          // Electron Packager copies extraResource before signAppIfSpecified.
          // Validate the copied Resources/game bytes in that exact interval.
          afterCopyExtraResources: [verifyEmbeddedResource],
        }),
    // Internal macOS test builds receive a final ad-hoc signature after Forge
    // has copied resources and flipped fuses. Public releases must replace
    // this with a Developer ID identity plus notarization in CI.
    osxSign: {
      identity: '-',
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
    },
  },
  rebuildConfig: {},
  hooks: {
    readPackageJson: async (_forgeConfig, packageJson) => ({
      ...packageJson,
      productName: playerBuild.productName,
      version: playerBuild.version,
      vnEnginePlayerBuild: {
        schemaVersion: 1,
        appBundleId: playerBuild.appBundleId,
      },
    }),
  },
  makers: [new MakerZIP({}, ['darwin', 'win32', 'linux'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
