import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/unused',
  },
}));

import { resolvePlayerStartupContent } from '../../src/main/content/resolvePlayerStartupContent';

const temporaryDirectories: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-player-startup-'));
  temporaryDirectories.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('Player startup content mode', () => {
  it('keeps the repository fixture only in development mode', async () => {
    await expect(resolvePlayerStartupContent({
      isPackaged: false,
      appPath: '/workspace/apps/player',
      resourcesPath: '/packaged/resources',
    })).resolves.toEqual({
      kind: 'development',
      bundleRoot: path.join('/workspace/apps/player', 'fixtures', 'game'),
    });
  });

  it('leaves a packaged generic Player empty when Resources/game is absent', async () => {
    const resourcesPath = await temporaryRoot();
    await expect(resolvePlayerStartupContent({
      isPackaged: true,
      appPath: '/packaged/app.asar',
      resourcesPath,
    })).resolves.toEqual({ kind: 'generic', bundleRoot: null });
  });

  it('selects embedded mode for any Resources/game candidate, including a symlink', async () => {
    const resourcesPath = await temporaryRoot();
    const external = await temporaryRoot();
    await mkdir(path.join(external, 'bundle'));
    await symlink(path.join(external, 'bundle'), path.join(resourcesPath, 'game'));

    await expect(resolvePlayerStartupContent({
      isPackaged: true,
      appPath: '/packaged/app.asar',
      resourcesPath,
    })).resolves.toEqual({
      kind: 'embedded',
      bundleRoot: path.join(resourcesPath, 'game'),
    });
  });
});
