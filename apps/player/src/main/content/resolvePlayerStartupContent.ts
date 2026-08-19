import { app } from 'electron';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

export type PlayerStartupContent =
  | { kind: 'development'; bundleRoot: string }
  | { kind: 'generic'; bundleRoot: null }
  | { kind: 'embedded'; bundleRoot: string };

export type PlayerStartupEnvironment = {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
};

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

/**
 * Determines startup mode without trusting build-time environment variables.
 * A packaged application is embedded whenever Resources/game exists in any
 * form. The strict bundle reader decides whether that candidate is valid, so
 * a damaged or symlinked embedded game cannot silently fall back to a generic
 * file picker.
 */
export async function resolvePlayerStartupContent(
  environment: PlayerStartupEnvironment = {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  },
): Promise<PlayerStartupContent> {
  if (!environment.isPackaged) {
    return {
      kind: 'development',
      bundleRoot: path.join(environment.appPath, 'fixtures', 'game'),
    };
  }

  const embeddedRoot = path.join(environment.resourcesPath, 'game');
  try {
    await lstat(embeddedRoot);
    return { kind: 'embedded', bundleRoot: embeddedRoot };
  } catch (error) {
    if (isMissing(error)) {
      return { kind: 'generic', bundleRoot: null };
    }
    // Permission and I/O failures still represent an intended embedded game.
    // The strict loader will turn the problem into a path-free error screen.
    return { kind: 'embedded', bundleRoot: embeddedRoot };
  }
}
