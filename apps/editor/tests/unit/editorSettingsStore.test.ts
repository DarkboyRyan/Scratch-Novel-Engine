/**
 * 文件主要作用：验证 EditorSettingsStore 的行为。
 * 测试覆盖：`EditorSettingsStore`。
 */

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorSettingsStore } from '../../src/main/settings/EditorSettingsStore';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vn-editor-settings-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

describe('EditorSettingsStore', () => {
  it('round-trips the exact v2 document and keeps the previous value as backup', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    const store = new EditorSettingsStore(root);

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
    });
    await store.write({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    });
    await store.write({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
    });

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
    });
    const persisted = JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    ) as unknown;
    expect(persisted).toEqual({
      format: 'vn-engine-editor-settings',
      settingsVersion: 2,
      settings: { language: 'zh-CN', colorTheme: 'daylight' },
    });
    expect(await readFile(path.join(root, 'settings.json.bak'), 'utf8'))
      .toContain('moonlight');
  });

  it('falls back to the backup for malformed primary data', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    const reportError = vi.fn();
    const store = new EditorSettingsStore(root, reportError);
    await store.write({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    });
    await writeFile(path.join(root, 'settings.json.bak'), await readFile(
      path.join(root, 'settings.json'),
    ));
    await writeFile(path.join(root, 'settings.json'), '{invalid');

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    });
    expect(reportError).toHaveBeenCalledWith('read', expect.any(Error));
  });

  it('lazily migrates an exact v1 language document to Daylight v2', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    await mkdir(root);
    const legacyDocument = {
      format: 'vn-engine-editor-settings',
      settingsVersion: 1,
      settings: { language: 'en-US' },
    };
    await writeFile(
      path.join(root, 'settings.json'),
      `${JSON.stringify(legacyDocument)}\n`,
    );
    const store = new EditorSettingsStore(root);

    const migrated = await store.load();
    expect(migrated).toEqual({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'daylight',
    });
    expect(JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    )).toEqual(legacyDocument);

    await store.write({ ...migrated, colorTheme: 'moonlight' });
    expect(JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    )).toEqual({
      format: 'vn-engine-editor-settings',
      settingsVersion: 2,
      settings: { language: 'en-US', colorTheme: 'moonlight' },
    });
    expect(JSON.parse(
      await readFile(path.join(root, 'settings.json.bak'), 'utf8'),
    )).toEqual(legacyDocument);
  });

  it('migrates a valid v1 backup when the primary document is malformed', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    await mkdir(root);
    await writeFile(path.join(root, 'settings.json'), '{invalid');
    await writeFile(path.join(root, 'settings.json.bak'), JSON.stringify({
      format: 'vn-engine-editor-settings',
      settingsVersion: 1,
      settings: { language: 'en-US' },
    }));

    await expect(new EditorSettingsStore(root).load()).resolves.toEqual({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'daylight',
    });
  });

  it('fails closed when the settings directory is a symbolic link', async () => {
    const parent = await temporaryRoot();
    const target = path.join(parent, 'target');
    const linkedRoot = path.join(parent, 'settings');
    await mkdir(target);
    await symlink(target, linkedRoot);
    const reportError = vi.fn();
    const store = new EditorSettingsStore(linkedRoot, reportError);

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 2,
      language: 'zh-CN',
      colorTheme: 'daylight',
    });
    await expect(store.write({
      settingsVersion: 2,
      language: 'en-US',
      colorTheme: 'moonlight',
    }))
      .rejects.toThrow('not safe');
    expect(reportError).toHaveBeenCalled();
  });
});
