// 主要作用：定义 Electron Forge 的打包、平台安装包与运行资源配置。
// 关键实现：校验模板路径，装配 Vite、Maker 与 Electron Fuses。
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';

const backendResourceDirectory = path.resolve(
  __dirname,
  '../../engine/stage/backend',
);
const configuredPlayerTemplateDirectory =
  process.env.VN_EDITOR_PLAYER_TEMPLATES_DIR;
if (
  configuredPlayerTemplateDirectory !== undefined &&
  (!path.isAbsolute(configuredPlayerTemplateDirectory) ||
    configuredPlayerTemplateDirectory.includes('\0'))
) {
  throw new Error('VN_EDITOR_PLAYER_TEMPLATES_DIR 必须是安全的绝对路径');
}
const playerTemplateResourceDirectory =
  configuredPlayerTemplateDirectory ?? path.resolve(
    __dirname,
    '../../engine/stage/player-templates',
  );
const configuredWebPlayerTemplateDirectory =
  process.env.VN_EDITOR_WEB_PLAYER_TEMPLATE_DIR;
if (
  configuredWebPlayerTemplateDirectory !== undefined &&
  (!path.isAbsolute(configuredWebPlayerTemplateDirectory) ||
    configuredWebPlayerTemplateDirectory.includes('\0'))
) {
  throw new Error('VN_EDITOR_WEB_PLAYER_TEMPLATE_DIR 必须是安全的绝对路径');
}
const webPlayerTemplateResourceDirectory =
  configuredWebPlayerTemplateDirectory ?? path.resolve(
    __dirname,
    '../../engine/stage/web-player-template',
  );
const configuredEditorOutDirectory = process.env.VN_EDITOR_OUT_DIR;
if (
  configuredEditorOutDirectory !== undefined &&
  configuredEditorOutDirectory !== '' &&
  !path.isAbsolute(configuredEditorOutDirectory)
) {
  throw new Error('VN_EDITOR_OUT_DIR 必须是绝对路径');
}

const config: ForgeConfig = {
  ...(configuredEditorOutDirectory === undefined ||
  configuredEditorOutDirectory === ''
    ? {}
    : { outDir: path.normalize(configuredEditorOutDirectory) }),
  packagerConfig: {
    asar: true,
    ...(process.platform === 'darwin'
      ? {
          // Forge flips Electron fuses after the upstream Electron archive
          // has been unpacked, so the archive's original ad-hoc signature is
          // no longer valid. Re-sign internal Editor packages after resources
          // and fuses are final. A public Editor release must replace this
          // with Developer ID signing, hardened runtime and notarization.
          osxSign: {
            identity: '-',
            identityValidation: false,
            optionsForFile: () => ({ hardenedRuntime: false }),
          },
        }
      : {}),
    // Forge copies this directory to Resources/backend. The executable must
    // live outside app.asar so Electron Main can start it as a child process.
    extraResource: [
      backendResourceDirectory,
      // The prebuilt browser Player is platform-independent and is consumed
      // verbatim by Main when it creates a Web game ZIP. Export never runs
      // Vite or package-manager commands from a user's project.
      webPlayerTemplateResourceDirectory,
      // Only macOS Editor packages embed the local standalone-export
      // template. Windows/Linux standalone games are built on their native CI
      // runners and never consume this macOS payload.
      ...(process.platform === 'darwin'
        ? [playerTemplateResourceDirectory]
        : []),
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
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
