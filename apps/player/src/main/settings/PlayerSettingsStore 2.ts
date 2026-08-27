import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

import {
  createDefaultPlayerSettings,
  isPlayerSettings,
  isPlayerSettingsV1,
  LEGACY_PLAYER_SETTINGS_VERSION,
  PLAYER_SETTINGS_VERSION,
  type PlayerSettings,
} from '../../shared/playerProtocol';

const SETTINGS_FORMAT = 'vn-engine-player-settings';
const SETTINGS_FILE_NAME = 'settings.json';
const SETTINGS_BACKUP_FILE_NAME = 'settings.json.bak';
const MAX_SETTINGS_BYTES = 16 * 1024;

type SettingsErrorReporter = (
  operation: 'read' | 'write',
  error: unknown,
) => void;

type SettingsDocumentV2 = {
  format: typeof SETTINGS_FORMAT;
  settingsVersion: typeof PLAYER_SETTINGS_VERSION;
  settings: Omit<PlayerSettings, 'settingsVersion'>;
};

class InvalidSettingsError extends Error {}

function errnoCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((field, index) => field === wanted[index]);
}

function validateRootPath(rootPath: string): string {
  if (
    !path.isAbsolute(rootPath) ||
    rootPath.includes('\0') ||
    path.normalize(rootPath) !== rootPath
  ) {
    throw new Error('Player settings root must be a normalized absolute path');
  }
  return rootPath;
}

async function inspectSafeDirectory(directoryPath: string): Promise<boolean> {
  let status;
  try {
    status = await lstat(directoryPath);
  } catch (error) {
    if (errnoCode(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
  if (status.isSymbolicLink() || !status.isDirectory()) {
    throw new InvalidSettingsError('settings directory is not safe');
  }
  return true;
}

async function ensureSafeDirectory(directoryPath: string): Promise<void> {
  try {
    await mkdir(directoryPath, { mode: 0o700 });
    return;
  } catch (error) {
    if (errnoCode(error) !== 'EEXIST') {
      throw error;
    }
  }
  if (!await inspectSafeDirectory(directoryPath)) {
    throw new InvalidSettingsError('settings directory is not safe');
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  const directory = await open(directoryPath, constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

function canonicalizeSettings(settings: PlayerSettings): PlayerSettings {
  return {
    settingsVersion: PLAYER_SETTINGS_VERSION,
    language: settings.language,
    masterVolume: Object.is(settings.masterVolume, -0) ? 0 : settings.masterVolume,
    bgmVolume: Object.is(settings.bgmVolume, -0) ? 0 : settings.bgmVolume,
    voiceVolume: Object.is(settings.voiceVolume, -0) ? 0 : settings.voiceVolume,
    videoVolume: Object.is(settings.videoVolume, -0) ? 0 : settings.videoVolume,
    windowMode: settings.windowMode,
    windowSizePreset: settings.windowSizePreset,
  };
}

function parseDocument(input: unknown): PlayerSettings {
  if (!isObject(input) || !hasExactFields(input, [
    'format',
    'settingsVersion',
    'settings',
  ])) {
    throw new InvalidSettingsError('settings document fields are invalid');
  }
  if (
    input.format !== SETTINGS_FORMAT ||
    !isObject(input.settings)
  ) {
    throw new InvalidSettingsError('settings document version is invalid');
  }
  const v1Fields = [
    'masterVolume',
    'bgmVolume',
    'voiceVolume',
    'videoVolume',
    'windowMode',
    'windowSizePreset',
  ] as const;
  if (input.settingsVersion === LEGACY_PLAYER_SETTINGS_VERSION) {
    if (!hasExactFields(input.settings, v1Fields)) {
      throw new InvalidSettingsError('settings document fields are invalid');
    }
    const legacy: unknown = {
      settingsVersion: LEGACY_PLAYER_SETTINGS_VERSION,
      ...input.settings,
    };
    if (!isPlayerSettingsV1(legacy)) {
      throw new InvalidSettingsError('settings values are invalid');
    }
    return canonicalizeSettings({
      ...legacy,
      settingsVersion: PLAYER_SETTINGS_VERSION,
      language: 'zh-CN',
    });
  }
  if (
    input.settingsVersion !== PLAYER_SETTINGS_VERSION ||
    !hasExactFields(input.settings, ['language', ...v1Fields])
  ) {
    throw new InvalidSettingsError('settings document version is invalid');
  }
  const current: unknown = {
    settingsVersion: PLAYER_SETTINGS_VERSION,
    ...input.settings,
  };
  if (!isPlayerSettings(current)) {
    throw new InvalidSettingsError('settings values are invalid');
  }
  return canonicalizeSettings(current);
}

function createDocument(settings: PlayerSettings): SettingsDocumentV2 {
  return {
    format: SETTINGS_FORMAT,
    settingsVersion: PLAYER_SETTINGS_VERSION,
    settings: {
      language: settings.language,
      masterVolume: settings.masterVolume,
      bgmVolume: settings.bgmVolume,
      voiceVolume: settings.voiceVolume,
      videoVolume: settings.videoVolume,
      windowMode: settings.windowMode,
      windowSizePreset: settings.windowSizePreset,
    },
  };
}

export class PlayerSettingsStore {
  private readonly rootPath: string;

  constructor(
    rootPath: string,
    private readonly reportError: SettingsErrorReporter = () => {},
  ) {
    this.rootPath = validateRootPath(rootPath);
  }

  async load(): Promise<PlayerSettings> {
    try {
      if (!await inspectSafeDirectory(this.rootPath)) {
        return createDefaultPlayerSettings();
      }
    } catch (error) {
      this.reportError('read', error);
      return createDefaultPlayerSettings();
    }

    const primaryPath = path.join(this.rootPath, SETTINGS_FILE_NAME);
    const backupPath = path.join(this.rootPath, SETTINGS_BACKUP_FILE_NAME);
    try {
      const primary = await this.readDocument(primaryPath);
      if (primary !== null) {
        return primary;
      }
    } catch (error) {
      this.reportError('read', error);
    }
    try {
      const backup = await this.readDocument(backupPath);
      if (backup !== null) {
        return backup;
      }
    } catch (error) {
      this.reportError('read', error);
    }
    return createDefaultPlayerSettings();
  }

  async write(settings: PlayerSettings): Promise<PlayerSettings> {
    if (!isPlayerSettings(settings)) {
      throw new InvalidSettingsError('settings values are invalid');
    }
    const canonical = canonicalizeSettings(settings);
    try {
      await this.writeDocument(canonical);
      return canonical;
    } catch (error) {
      this.reportError('write', error);
      throw error;
    }
  }

  private async readDocument(filePath: string): Promise<PlayerSettings | null> {
    let status;
    try {
      status = await lstat(filePath);
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        return null;
      }
      throw error;
    }
    if (
      status.isSymbolicLink() ||
      !status.isFile() ||
      status.nlink !== 1 ||
      status.size <= 0 ||
      status.size > MAX_SETTINGS_BYTES
    ) {
      throw new InvalidSettingsError('settings file is not safe');
    }

    const noFollow = constants.O_NOFOLLOW ?? 0;
    const file = await open(filePath, constants.O_RDONLY | noFollow);
    try {
      const before = await file.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size !== status.size) {
        throw new InvalidSettingsError('settings file changed before read');
      }
      const contents = await file.readFile({ encoding: 'utf8' });
      const after = await file.stat();
      if (
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      ) {
        throw new InvalidSettingsError('settings file changed while reading');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents) as unknown;
      } catch {
        throw new InvalidSettingsError('settings file is not JSON');
      }
      return parseDocument(parsed);
    } finally {
      await file.close();
    }
  }

  private async writeDocument(settings: PlayerSettings): Promise<void> {
    await ensureSafeDirectory(this.rootPath);
    const destinationPath = path.join(this.rootPath, SETTINGS_FILE_NAME);
    const backupPath = path.join(this.rootPath, SETTINGS_BACKUP_FILE_NAME);
    const temporaryPath = path.join(
      this.rootPath,
      `.${SETTINGS_FILE_NAME}.${randomUUID()}.tmp`,
    );
    const contents = `${JSON.stringify(createDocument(settings))}\n`;
    if (Buffer.byteLength(contents, 'utf8') > MAX_SETTINGS_BYTES) {
      throw new InvalidSettingsError('settings document is too large');
    }

    const noFollow = constants.O_NOFOLLOW ?? 0;
    let temporaryFile: Awaited<ReturnType<typeof open>> | null = null;
    let movedExistingDestination = false;
    let published = false;
    try {
      temporaryFile = await open(
        temporaryPath,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          noFollow,
        0o600,
      );
      await temporaryFile.writeFile(contents, { encoding: 'utf8' });
      await temporaryFile.sync();
      await temporaryFile.close();
      temporaryFile = null;

      let destinationExists = false;
      try {
        const destination = await lstat(destinationPath);
        if (
          destination.isSymbolicLink() ||
          !destination.isFile() ||
          destination.nlink !== 1
        ) {
          throw new InvalidSettingsError('settings destination is not safe');
        }
        destinationExists = true;
      } catch (error) {
        if (errnoCode(error) !== 'ENOENT') {
          throw error;
        }
      }

      if (destinationExists) {
        try {
          const backup = await lstat(backupPath);
          if (
            backup.isSymbolicLink() ||
            !backup.isFile() ||
            backup.nlink !== 1
          ) {
            throw new InvalidSettingsError('settings backup is not safe');
          }
          await unlink(backupPath);
        } catch (error) {
          if (errnoCode(error) !== 'ENOENT') {
            throw error;
          }
        }
        await rename(destinationPath, backupPath);
        movedExistingDestination = true;
      }
      await rename(temporaryPath, destinationPath);
      published = true;
      await syncDirectory(this.rootPath).catch(() => undefined);
    } catch (error) {
      await temporaryFile?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      if (movedExistingDestination && !published) {
        await rename(backupPath, destinationPath).catch(() => undefined);
      }
      throw error;
    }
  }
}
