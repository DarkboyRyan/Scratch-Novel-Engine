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
import { readFileSync } from 'node:fs';
import path from 'node:path';

const editorPackageDocument: unknown = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
);
if (
  typeof editorPackageDocument !== 'object' ||
  editorPackageDocument === null ||
  !('name' in editorPackageDocument) ||
  editorPackageDocument.name !== 'editor' ||
  !('productName' in editorPackageDocument) ||
  editorPackageDocument.productName !== 'VN Engine Editor' ||
  !('version' in editorPackageDocument) ||
  typeof editorPackageDocument.version !== 'string' ||
  !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
    editorPackageDocument.version,
  )
) {
  throw new Error('Editor package.json 名称、产品名或版本无效');
}
const editorVersion = editorPackageDocument.version;

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
const configuredMacSigningIdentity =
  process.env.VN_EDITOR_MACOS_SIGNING_IDENTITY;
const configuredMacSigningKeychain =
  process.env.VN_EDITOR_MACOS_SIGNING_KEYCHAIN;
if (
  (configuredMacSigningIdentity === undefined) !==
    (configuredMacSigningKeychain === undefined)
) {
  throw new Error(
    '正式 macOS 签名必须同时配置 identity 与 keychain',
  );
}
if (
  configuredMacSigningIdentity !== undefined &&
  (
    configuredMacSigningIdentity.length === 0 ||
    configuredMacSigningIdentity.length > 512 ||
    configuredMacSigningIdentity.includes('\0') ||
    !configuredMacSigningIdentity.startsWith('Developer ID Application:')
  )
) {
  throw new Error('VN_EDITOR_MACOS_SIGNING_IDENTITY 不是 Developer ID Application');
}
if (
  configuredMacSigningKeychain !== undefined &&
  (
    !path.isAbsolute(configuredMacSigningKeychain) ||
    configuredMacSigningKeychain.includes('\0')
  )
) {
  throw new Error('VN_EDITOR_MACOS_SIGNING_KEYCHAIN 必须是安全的绝对路径');
}

const formalMacSigning =
  configuredMacSigningIdentity !== undefined &&
  configuredMacSigningKeychain !== undefined;

const config: ForgeConfig = {
  ...(configuredEditorOutDirectory === undefined ||
  configuredEditorOutDirectory === ''
    ? {}
    : { outDir: path.normalize(configuredEditorOutDirectory) }),
  packagerConfig: {
    asar: true,
    name: 'VN Engine Editor',
    appVersion: editorVersion,
    buildVersion: editorVersion,
    appBundleId: 'com.vnengine.editor',
    ...(process.platform === 'darwin'
      ? {
          // Internal packages use a final ad-hoc signature. Formal builds can
          // opt in to Developer ID without placing certificate material in the
          // repository; CI imports it into an ephemeral keychain first.
          osxSign: formalMacSigning
            ? {
                identity: configuredMacSigningIdentity,
                keychain: configuredMacSigningKeychain,
                identityValidation: true,
                optionsForFile: () => ({ hardenedRuntime: true }),
              }
            : {
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
      // macOS and Windows Editor packages embed only their same-platform
      // standalone-export template. Cross-platform public signing remains a
      // release-CI responsibility, and Linux has no local template yet.
      ...(process.platform === 'darwin' || process.platform === 'win32'
        ? [playerTemplateResourceDirectory]
        : []),
    ],
  },
  rebuildConfig: {},
  hooks: {
    readPackageJson: async (_forgeConfig, packageJson) => ({
      ...packageJson,
      productName: 'VN Engine Editor',
      version: editorVersion,
      vnEngineEditorBuild: {
        schemaVersion: 1,
        appBundleId: 'com.vnengine.editor',
      },
    }),
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin', 'win32']),
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
