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
  it('round-trips the exact v1 document and keeps the previous value as backup', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    const store = new EditorSettingsStore(root);

    await expect(store.load()).resolves.toMatchObject({ language: 'zh-CN' });
    await store.write({ settingsVersion: 1, language: 'en-US' });
    await store.write({ settingsVersion: 1, language: 'zh-CN' });

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 1,
      language: 'zh-CN',
    });
    const persisted = JSON.parse(
      await readFile(path.join(root, 'settings.json'), 'utf8'),
    ) as unknown;
    expect(persisted).toEqual({
      format: 'vn-engine-editor-settings',
      settingsVersion: 1,
      settings: { language: 'zh-CN' },
    });
    expect(await readFile(path.join(root, 'settings.json.bak'), 'utf8'))
      .toContain('en-US');
  });

  it('falls back to the backup for malformed primary data', async () => {
    const parent = await temporaryRoot();
    const root = path.join(parent, 'settings');
    const reportError = vi.fn();
    const store = new EditorSettingsStore(root, reportError);
    await store.write({ settingsVersion: 1, language: 'en-US' });
    await writeFile(path.join(root, 'settings.json.bak'), await readFile(
      path.join(root, 'settings.json'),
    ));
    await writeFile(path.join(root, 'settings.json'), '{invalid');

    await expect(store.load()).resolves.toEqual({
      settingsVersion: 1,
      language: 'en-US',
    });
    expect(reportError).toHaveBeenCalledWith('read', expect.any(Error));
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
      settingsVersion: 1,
      language: 'zh-CN',
    });
    await expect(store.write({ settingsVersion: 1, language: 'en-US' }))
      .rejects.toThrow('not safe');
    expect(reportError).toHaveBeenCalled();
  });
});

