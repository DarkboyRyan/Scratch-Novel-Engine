import {
  appendFile,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetPreviewService } from '../../src/main/assets/AssetPreviewService';
import type { EngineMutationResult } from '../../src/shared/engineProtocol';

const temporaryDirectories: string[] = [];

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00,
]);

function resultFor(assetId = 'asset-1'): EngineMutationResult {
  return {
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: 'Story',
      entrySceneId: 'scene-1',
      scenes: [
        {
          schemaVersion: 1,
          id: 'scene-1',
          name: 'Scene 1',
          backgroundAssetId: null,
          nodes: [],
        },
      ],
    },
    assets: [
      {
        id: assetId,
        type: 'image',
        displayName: 'Background',
      },
    ],
    session: {
      revision: 1,
      savedRevision: 1,
      isDirty: false,
    },
  };
}

async function makeProject(
  relativePath = 'assets/images/asset-1.png',
): Promise<{
  root: string;
  projectFilePath: string;
  assetFilePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-preview-test-'));
  temporaryDirectories.push(root);
  const projectFilePath = path.join(root, 'project.vn.json');
  const assetFilePath = path.join(root, relativePath);
  await mkdir(path.dirname(assetFilePath), { recursive: true });
  await writeFile(assetFilePath, PNG);
  await writeFile(
    projectFilePath,
    JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 2,
      project: { id: 'project-1' },
      assets: [
        {
          id: 'asset-1',
          type: 'image',
          relativePath,
          displayName: 'Background',
        },
      ],
    }),
  );

  return { root, projectFilePath, assetFilePath };
}

function makeService() {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const protocol = {
    handle: vi.fn(
      (
        _scheme: string,
        callback: (request: Request) => Promise<Response>,
      ) => {
        handler = callback;
      },
    ),
    unhandle: vi.fn(),
  };
  const service = new AssetPreviewService(
    protocol as unknown as Electron.Protocol,
  );

  return {
    service,
    protocol,
    request: (url: string, method = 'GET') => {
      if (!handler) {
        throw new Error('protocol handler was not installed');
      }
      return handler(new Request(url, { method }));
    },
  };
}

afterEach(async () => {
  const directories = temporaryDirectories.splice(0);
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('AssetPreviewService', () => {
  it('serves a manifest-known image by opaque ID without exposing a path', async () => {
    const { projectFilePath, assetFilePath } = await makeProject();
    const { service, request } = makeService();

    await expect(
      service.activateProjectFile(projectFilePath, resultFor()),
    ).resolves.toBe(true);
    const url = service.getPreviewUrl('asset-1');

    expect(url).toMatch(
      /^vn-asset:\/\/image\/[a-f0-9]{32}\/[a-f0-9]{32}$/,
    );
    expect(url).not.toContain(projectFilePath);
    expect(service.getPreviewUrl('missing')).toBeNull();

    const response = await request(url as string);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('X-Content-Type-Options')).toBe(
      'nosniff',
    );
    // Response 创建后同一 inode 即使增长，也只能读取 stat 时验证过的
    // 字节范围，不能突破 Content-Length 或 128 MiB 安全上限。
    await appendFile(assetFilePath, Buffer.from('late bytes'));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  });

  it('revokes the old project generation when a different project activates', async () => {
    const first = await makeProject();
    const second = await makeProject();
    await writeFile(
      second.projectFilePath,
      JSON.stringify({
        format: 'vn-engine-project',
        fileVersion: 2,
        project: { id: 'project-2' },
        assets: [],
      }),
    );
    const { service, request } = makeService();
    await service.activateProjectFile(first.projectFilePath, resultFor());
    const oldUrl = service.getPreviewUrl('asset-1') as string;

    await service.activateProjectFile(second.projectFilePath, {
      ...resultFor(),
      project: { ...resultFor().project, id: 'project-2' },
      assets: [],
    });

    await expect(request(oldUrl)).resolves.toMatchObject({ status: 404 });
  });

  it('isolates capability URLs between window-local protocol services', async () => {
    const { projectFilePath } = await makeProject();
    const firstWindow = makeService();
    const secondWindow = makeService();
    await firstWindow.service.activateProjectFile(
      projectFilePath,
      resultFor(),
    );
    await secondWindow.service.activateProjectFile(
      projectFilePath,
      resultFor(),
    );
    const firstUrl = firstWindow.service.getPreviewUrl(
      'asset-1',
    ) as string;

    expect(
      secondWindow.service.getPreviewUrl('asset-1'),
    ).not.toBe(firstUrl);
    await expect(secondWindow.request(firstUrl)).resolves.toMatchObject({
      status: 404,
    });
  });

  it('rotates same-project URLs on open but preserves them across save refreshes', async () => {
    const { projectFilePath } = await makeProject();
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, resultFor());
    const beforeSave = service.getPreviewUrl('asset-1') as string;

    await service.activateProjectFile(projectFilePath, resultFor());
    expect(service.getPreviewUrl('asset-1')).toBe(beforeSave);

    await service.activateProjectFile(
      projectFilePath,
      resultFor(),
      undefined,
      true,
    );
    expect(service.getPreviewUrl('asset-1')).not.toBe(beforeSave);
    await expect(request(beforeSave)).resolves.toMatchObject({
      status: 404,
    });
  });

  it('rejects path traversal, unknown assets, wrong magic, and non-GET methods', async () => {
    const unsafe = await makeProject();
    await writeFile(
      unsafe.projectFilePath,
      JSON.stringify({
        format: 'vn-engine-project',
        fileVersion: 2,
        project: { id: 'project-1' },
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            relativePath: 'assets/images/../../outside.png',
            displayName: 'Background',
          },
        ],
      }),
    );
    const { service } = makeService();
    await expect(
      service.prepareProjectFile(unsafe.projectFilePath),
    ).rejects.toThrow('不安全的相对路径');

    const valid = await makeProject();
    const instance = makeService();
    await instance.service.activateProjectFile(
      valid.projectFilePath,
      resultFor(),
    );
    const url = instance.service.getPreviewUrl('asset-1') as string;
    await writeFile(valid.assetFilePath, Buffer.from('not a png'));

    await expect(instance.request(url)).resolves.toMatchObject({
      status: 404,
    });
    await expect(instance.request(url, 'POST')).resolves.toMatchObject({
      status: 405,
    });
    await expect(
      instance.request(`${url.slice(0, -32)}${'0'.repeat(32)}`),
    ).resolves.toMatchObject({ status: 404 });
    await expect(instance.request(`${url}?path=/tmp/secret`)).resolves.toMatchObject({
      status: 404,
    });
    await expect(instance.request(`${url}/extra`)).resolves.toMatchObject({
      status: 404,
    });
  });

  it('previews a newly imported image before its manifest is saved', async () => {
    const { root, projectFilePath } = await makeProject();
    await writeFile(
      projectFilePath,
      JSON.stringify({
        format: 'vn-engine-project',
        fileVersion: 2,
        project: { id: 'project-1' },
        assets: [],
      }),
    );
    const importedFile = path.join(
      root,
      'assets',
      'images',
      'asset-new.jpg',
    );
    await writeFile(
      importedFile,
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    );
    const importedResult = resultFor('asset-new');
    importedResult.assetId = 'asset-new';
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, {
      ...importedResult,
      assets: [],
    });

    expect(
      service.registerImportedImage(
        projectFilePath,
        '/native/source/photo.jpeg',
        importedResult,
      ),
    ).toBe(true);
    const url = service.getPreviewUrl('asset-new');
    expect(url).not.toContain('asset-new');
    await expect(request(url as string)).resolves.toMatchObject({
      status: 200,
    });
  });

  it('refuses a symlink anywhere in the asset path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vn-preview-link-'));
    temporaryDirectories.push(root);
    const realImages = path.join(root, 'real-images');
    await mkdir(realImages, { recursive: true });
    await writeFile(path.join(realImages, 'asset-1.png'), PNG);
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await symlink(realImages, path.join(root, 'assets', 'images'));
    const projectFilePath = path.join(root, 'project.vn.json');
    await writeFile(
      projectFilePath,
      JSON.stringify({
        format: 'vn-engine-project',
        fileVersion: 2,
        project: { id: 'project-1' },
        assets: [
          {
            id: 'asset-1',
            type: 'image',
            relativePath: 'assets/images/asset-1.png',
            displayName: 'Background',
          },
        ],
      }),
    );
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, resultFor());

    const response = await request(
      service.getPreviewUrl('asset-1') as string,
    );
    expect(response.status).toBe(404);
  });

  it('supports metadata-only HEAD requests and revokes all URLs on dispose', async () => {
    const { projectFilePath } = await makeProject();
    const { service, protocol, request } = makeService();
    await service.activateProjectFile(projectFilePath, resultFor());
    const url = service.getPreviewUrl('asset-1') as string;

    const response = await request(url, 'HEAD');
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('Content-Length')).toBe(String(PNG.length));

    service.dispose();
    expect(protocol.unhandle).toHaveBeenCalledWith('vn-asset');
    await expect(request(url)).resolves.toMatchObject({ status: 404 });
  });
});
