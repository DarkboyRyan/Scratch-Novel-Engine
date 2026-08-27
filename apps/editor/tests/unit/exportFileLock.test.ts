/**
 * 文件主要作用：验证 export file lock 的行为。
 * 测试覆盖：`export file lock`。
 */

import {
  access,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireExportFileLock } from '../../src/main/export/ExportFileLock';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('export file lock', () => {
  it('blocks a live owner and immediately recovers an unowned carrier', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vn-export-lock-'));
    temporaryDirectories.push(root);
    const lockPath = path.join(root, '.Story.vngame.export.lock');
    const busyMessage = 'another export owns this target';

    const first = await acquireExportFileLock(lockPath, busyMessage);
    await expect(
      acquireExportFileLock(lockPath, busyMessage),
    ).rejects.toThrow(busyMessage);
    await first.release();
    await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });

    await writeFile(lockPath, '', { flag: 'wx', mode: 0o600 });
    const recovered = await acquireExportFileLock(lockPath, busyMessage);
    await recovered.assertOwned();
    await recovered.release();
    await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
