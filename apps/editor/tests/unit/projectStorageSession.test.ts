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
  canonicalizeProjectRootPath,
  createProjectRootInParent,
  projectManifestPath,
  resolveProjectManifestPath,
  validateProjectRootPath,
} from '../../src/main/project/ProjectPathPolicy';
import { ProjectStorageSession } from '../../src/main/project/ProjectStorageSession';

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

  it('uses the fixed manifest inside a saved project directory', async () => {
    const root = await makeDirectory();
    const canonicalRoot = await realpath(root);
    const session = makeSession();

    await expect(
      session.assetImportLocation(canonicalRoot),
    ).resolves.toEqual({
      backendProjectFilePath: path.join(canonicalRoot, 'project.vn.json'),
      previewProjectFilePath: path.join(canonicalRoot, 'project.vn.json'),
      isTemporary: false,
    });
    await expect(session.backendSavePath(canonicalRoot)).resolves.toMatch(
      /vn-engine-project-.*\/project\.vn\.json$/,
    );
  });

  it('saves an existing project through a private manifest', async () => {
    const root = await realpath(await makeDirectory());
    const fixedPath = path.join(root, 'project.vn.json');
    const session = makeSession();

    await expect(session.backendSavePath(root)).resolves.not.toBe(
      fixedPath,
    );
  });

  it('publishes temporary assets before the fixed project manifest', async () => {
    const targetRoot = await makeDirectory();
    const targetFilePath = path.join(targetRoot, 'project.vn.json');
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

    const publishedManifest = await session.publishSavedProject(
      location.backendProjectFilePath,
      targetRoot,
    );

    expect(publishedManifest).toBe(
      '{"format":"vn-engine-project"}\n',
    );

    await expect(readFile(targetFilePath, 'utf8')).resolves.toBe(
      '{"format":"vn-engine-project"}\n',
    );
    await expect(
      readFile(
        path.join(targetRoot, 'assets', 'images', 'asset-1.png'),
      ),
    ).resolves.toEqual(Buffer.from('image bytes'));
    await expect(
      access(path.join(targetRoot, 'assets', 'videos')),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(targetRoot, 'assets', 'audio')),
    ).resolves.toBeUndefined();

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
        workspaceRoot,
      ),
    ).rejects.toThrow('临时工作区');
    await expect(
      session.backendSavePath(
        nestedDirectory,
      ),
    ).rejects.toThrow('临时工作区');

    await writeFile(location.backendProjectFilePath, '{}\n');
    await expect(
      session.publishSavedProject(
        location.backendProjectFilePath,
        workspaceRoot,
      ),
    ).rejects.toThrow('临时工作区');

    const prefixSibling = await mkdtemp(`${workspaceRoot}-sibling-`);
    temporaryDirectories.push(prefixSibling);
    await expect(
      session.backendSavePath(
        prefixSibling,
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
    const targetFilePath = path.join(targetRoot, 'project.vn.json');
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
        targetRoot,
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

  it('validates final target resources before replacing the old manifest', async () => {
    const targetRoot = await makeDirectory();
    const targetFilePath = path.join(targetRoot, 'project.vn.json');
    const oldManifest = '{"version":"old"}\n';
    await writeFile(targetFilePath, oldManifest);

    const session = makeSession();
    const backendPath = await session.backendSavePath(targetRoot);
    await writeFile(backendPath, '{"version":"new"}\n');
    const validate = async () => {
      throw new Error('referenced Asset is missing');
    };

    await expect(
      session.publishSavedProject(backendPath, targetRoot, validate),
    ).rejects.toThrow('referenced Asset is missing');
    await expect(readFile(targetFilePath, 'utf8')).resolves.toBe(
      oldManifest,
    );
  });

  it('validates a project root and resolves only its fixed manifest', async () => {
    const root = await makeDirectory();
    expect(() =>
      validateProjectRootPath(root),
    ).not.toThrow();
    expect(() =>
      validateProjectRootPath('relative/project'),
    ).toThrow('绝对文件夹路径');

    await expect(
      canonicalizeProjectRootPath(root),
    ).resolves.toBe(await realpath(root));
    await expect(resolveProjectManifestPath(root)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await writeFile(projectManifestPath(root), '{}\n');
    await expect(resolveProjectManifestPath(root)).resolves.toEqual({
      projectRootPath: await realpath(root),
      projectFilePath: path.join(await realpath(root), 'project.vn.json'),
    });
  });

  it('creates a named project directory and rejects collisions', async () => {
    const parent = await makeDirectory();

    const root = await createProjectRootInParent(
      parent,
      '  My / Story  ',
    );

    expect(root).toBe(path.join(await realpath(parent), 'My - Story'));
    await expect(
      createProjectRootInParent(parent, 'My / Story'),
    ).rejects.toThrow('同名文件夹');
  });
});
