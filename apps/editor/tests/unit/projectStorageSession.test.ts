import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalizeProjectFilePath,
  ProjectStorageSession,
  validateProjectFilePath,
} from '../../src/main/project/ProjectStorageSession';

const temporaryDirectories: string[] = [];
const activeSessions: ProjectStorageSession[] = [];

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'vn-storage-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function makeSession(): ProjectStorageSession {
  const session = new ProjectStorageSession();
  activeSessions.push(session);
  return session;
}

afterEach(async () => {
  await Promise.all(activeSessions.splice(0).map((session) => session.dispose()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ProjectStorageSession', () => {
  it('uses a private fixed-name workspace for an unsaved project', async () => {
    const session = makeSession();

    const location = await session.assetImportLocation(null);

    expect(path.basename(location.backendProjectFilePath)).toBe(
      'project.vn.json',
    );
    expect(location.previewProjectFilePath).toBe(
      location.backendProjectFilePath,
    );
    expect(location.isTemporary).toBe(true);
    expect(location.backendProjectFilePath).toContain(
      `${path.sep}vn-engine-project-`,
    );
  });

  it('keeps a custom saved path public while C++ imports by its fixed sibling name', async () => {
    const root = await makeDirectory();
    const canonicalRoot = await realpath(root);
    const customPath = path.join(canonicalRoot, '我的故事.vn.json');
    const session = makeSession();

    await expect(
      session.assetImportLocation(customPath),
    ).resolves.toEqual({
      backendProjectFilePath: path.join(
        canonicalRoot,
        'project.vn.json',
      ),
      previewProjectFilePath: customPath,
      isTemporary: false,
    });
    await expect(session.backendSavePath(customPath)).resolves.toMatch(
      /vn-engine-project-.*\/project\.vn\.json$/,
    );
  });

  it('saves an existing fixed-name project directly when no workspace is pending', async () => {
    const root = await realpath(await makeDirectory());
    const fixedPath = path.join(root, 'project.vn.json');
    const session = makeSession();

    await expect(session.backendSavePath(fixedPath)).resolves.toBe(
      fixedPath,
    );
  });

  it('publishes temporary assets before an arbitrary .vn.json manifest', async () => {
    const targetRoot = await makeDirectory();
    const targetFilePath = path.join(targetRoot, 'first-draft.vn.json');
    const session = makeSession();
    const location = await session.assetImportLocation(null);
    const workspaceRoot = path.dirname(location.backendProjectFilePath);
    await mkdir(path.join(workspaceRoot, 'assets', 'images'), {
      recursive: true,
    });
    await writeFile(
      path.join(workspaceRoot, 'assets', 'images', 'asset-1.png'),
      Buffer.from('image bytes'),
    );
    await writeFile(
      location.backendProjectFilePath,
      '{"format":"vn-engine-project"}\n',
    );

    await session.publishSavedProject(
      location.backendProjectFilePath,
      targetFilePath,
    );

    await expect(readFile(targetFilePath, 'utf8')).resolves.toBe(
      '{"format":"vn-engine-project"}\n',
    );
    await expect(
      readFile(
        path.join(targetRoot, 'assets', 'images', 'asset-1.png'),
      ),
    ).resolves.toEqual(Buffer.from('image bytes'));

    await session.completeSuccessfulSave(location.backendProjectFilePath);
    await expect(access(workspaceRoot)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects save targets inside its private temporary workspace', async () => {
    const session = makeSession();
    const location = await session.assetImportLocation(null);
    const workspaceRoot = path.dirname(location.backendProjectFilePath);
    const nestedDirectory = path.join(workspaceRoot, 'nested');
    await mkdir(nestedDirectory);

    await expect(
      session.backendSavePath(
        path.join(workspaceRoot, 'chosen-name.vn.json'),
      ),
    ).rejects.toThrow('临时工作区');
    await expect(
      session.backendSavePath(
        path.join(nestedDirectory, 'chosen-name.vn.json'),
      ),
    ).rejects.toThrow('临时工作区');

    await writeFile(location.backendProjectFilePath, '{}\n');
    await expect(
      session.publishSavedProject(
        location.backendProjectFilePath,
        path.join(workspaceRoot, 'bypass.vn.json'),
      ),
    ).rejects.toThrow('临时工作区');

    const prefixSibling = await mkdtemp(`${workspaceRoot}-sibling-`);
    temporaryDirectories.push(prefixSibling);
    await expect(
      session.backendSavePath(
        path.join(prefixSibling, 'allowed.vn.json'),
      ),
    ).resolves.toBe(location.backendProjectFilePath);
  });

  it('detaches a discarded workspace before starting another one', async () => {
    const session = makeSession();
    const firstLocation = await session.assetImportLocation(null);
    const firstRoot = path.dirname(firstLocation.backendProjectFilePath);

    await session.discardTemporaryWorkspace();
    const secondLocation = await session.assetImportLocation(null);

    expect(path.dirname(secondLocation.backendProjectFilePath)).not.toBe(
      firstRoot,
    );
  });

  it('never reuses a detached workspace when physical cleanup fails', async () => {
    let failNextRemoval = true;
    const session = new ProjectStorageSession(async (directory) => {
      if (failNextRemoval) {
        failNextRemoval = false;
        throw new Error('simulated cleanup failure');
      }
      await rm(directory, { recursive: true, force: true });
    });
    activeSessions.push(session);
    const firstLocation = await session.assetImportLocation(null);
    const firstRoot = path.dirname(firstLocation.backendProjectFilePath);
    temporaryDirectories.push(firstRoot);

    await expect(session.discardTemporaryWorkspace()).rejects.toThrow(
      'simulated cleanup failure',
    );
    const secondLocation = await session.assetImportLocation(null);

    expect(path.dirname(secondLocation.backendProjectFilePath)).not.toBe(
      firstRoot,
    );
  });

  it('does not overwrite a colliding asset or publish a manifest on failure', async () => {
    const targetRoot = await makeDirectory();
    const targetFilePath = path.join(targetRoot, 'story.vn.json');
    const destinationAsset = path.join(
      targetRoot,
      'assets',
      'images',
      'asset-1.png',
    );
    await mkdir(path.dirname(destinationAsset), { recursive: true });
    await writeFile(destinationAsset, Buffer.from('existing project'));

    const session = makeSession();
    const location = await session.assetImportLocation(null);
    const sourceAsset = path.join(
      path.dirname(location.backendProjectFilePath),
      'assets',
      'images',
      'asset-1.png',
    );
    await mkdir(path.dirname(sourceAsset), { recursive: true });
    await writeFile(sourceAsset, Buffer.from('new project'));
    await writeFile(location.backendProjectFilePath, '{}\n');

    await expect(
      session.publishSavedProject(
        location.backendProjectFilePath,
        targetFilePath,
      ),
    ).rejects.toThrow('内容不同');
    await expect(readFile(destinationAsset)).resolves.toEqual(
      Buffer.from('existing project'),
    );
    await expect(access(targetFilePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(sourceAsset)).resolves.toEqual(
      Buffer.from('new project'),
    );
  });

  it('accepts only a custom basename that preserves the .vn.json suffix', async () => {
    const root = await makeDirectory();
    expect(() =>
      validateProjectFilePath(path.join(root, 'story.vn.json')),
    ).not.toThrow();
    expect(() =>
      validateProjectFilePath(path.join(root, 'story.json')),
    ).toThrow('名称.vn.json');
    expect(() =>
      validateProjectFilePath(path.join(root, '.vn.json')),
    ).toThrow('名称.vn.json');

    await expect(
      canonicalizeProjectFilePath(
        path.join(root, '中文项目.vn.json'),
      ),
    ).resolves.toBe(
      path.join(
        await realpath(root),
        '中文项目.vn.json',
      ),
    );
  });
});
