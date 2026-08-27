/**
 * 文件主要作用：验证 AssetPreviewService 的行为。
 * 测试覆盖：`AssetPreviewService`。
 */

import {
  appendFile,
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  truncate,
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

const MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x02, 0x00,
  0x69, 0x73, 0x6f, 0x6d,
  0x6d, 0x70, 0x34, 0x32,
]);

const MP3 = Buffer.alloc(417);
MP3.set([0xff, 0xfb, 0x90, 0x64]);

const WAV = Buffer.alloc(48);
WAV.write('RIFF', 0, 'ascii');
WAV.writeUInt32LE(WAV.length - 8, 4);
WAV.write('WAVE', 8, 'ascii');
WAV.write('fmt ', 12, 'ascii');
WAV.writeUInt32LE(16, 16);
WAV.writeUInt16LE(1, 20);
WAV.writeUInt16LE(1, 22);
WAV.writeUInt32LE(8_000, 24);
WAV.writeUInt32LE(16_000, 28);
WAV.writeUInt16LE(2, 32);
WAV.writeUInt16LE(16, 34);
WAV.write('data', 36, 'ascii');
WAV.writeUInt32LE(4, 40);

const OPUS_PACKET = Buffer.alloc(19);
OPUS_PACKET.write('OpusHead', 0, 'ascii');
OPUS_PACKET[8] = 1;
OPUS_PACKET[9] = 2;
OPUS_PACKET.writeUInt32LE(48_000, 12);
const OGG_OPUS = Buffer.alloc(27 + 1 + OPUS_PACKET.length);
OGG_OPUS.write('OggS', 0, 'ascii');
OGG_OPUS[4] = 0;
OGG_OPUS[5] = 0x02;
OGG_OPUS[14] = 1;
OGG_OPUS[26] = 1;
OGG_OPUS[27] = OPUS_PACKET.length;
OPUS_PACKET.copy(OGG_OPUS, 28);

function resultFor(assetId = 'asset-1'): EngineMutationResult {
  return {
    project: {
      schemaVersion: 1,
      id: 'project-1',
      name: 'Story',
      entrySceneId: 'scene-1',
      startScreen: {
        title: 'Story',
        eyebrow: 'A VN ENGINE STORY',
        backgroundAssetId: null,
        musicAssetId: null,
      },
      cgGallery: {
        pages: [{ imageAssetIds: Array<string | null>(9).fill(null) }],
      },
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

function audioResultFor(assetId = 'audio-1'): EngineMutationResult {
  return {
    ...resultFor(),
    assets: [
      {
        id: assetId,
        type: 'audio',
        displayName: 'Theme',
      },
    ],
  };
}

function videoResultFor(assetId = 'video-1'): EngineMutationResult {
  return {
    ...resultFor(),
    assets: [
      {
        id: assetId,
        type: 'video',
        displayName: 'Opening',
      },
    ],
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

async function makeAudioProject(
  extension: 'mp3' | 'ogg' | 'wav',
  contents: Buffer,
): Promise<{
  root: string;
  projectFilePath: string;
  assetFilePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-audio-test-'));
  temporaryDirectories.push(root);
  const projectFilePath = path.join(root, 'project.vn.json');
  const relativePath = `assets/audio/audio-1.${extension}`;
  const assetFilePath = path.join(root, relativePath);
  await mkdir(path.dirname(assetFilePath), { recursive: true });
  await writeFile(assetFilePath, contents);
  await writeFile(
    projectFilePath,
    JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 7,
      project: { id: 'project-1' },
      assets: [
        {
          id: 'audio-1',
          type: 'audio',
          relativePath,
          displayName: 'Theme',
        },
      ],
    }),
  );
  return { root, projectFilePath, assetFilePath };
}

async function makeVideoProject(): Promise<{
  root: string;
  projectFilePath: string;
  assetFilePath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'vn-video-test-'));
  temporaryDirectories.push(root);
  const projectFilePath = path.join(root, 'project.vn.json');
  const relativePath = 'assets/videos/video-1.mp4';
  const assetFilePath = path.join(root, relativePath);
  await mkdir(path.dirname(assetFilePath), { recursive: true });
  await writeFile(assetFilePath, MP4);
  await writeFile(
    projectFilePath,
    JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 7,
      project: { id: 'project-1' },
      assets: [
        {
          id: 'video-1',
          type: 'video',
          relativePath,
          displayName: 'Opening',
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
    request: (
      url: string,
      method = 'GET',
      headers?: HeadersInit,
    ) => {
      if (!handler) {
        throw new Error('protocol handler was not installed');
      }
      return handler(new Request(url, { method, headers }));
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
    expect(service.getMediaUrl('asset-1')).toBe(url);

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
      service.registerImportedAsset(
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

  it('serves a newly imported video before the temporary manifest is saved', async () => {
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
    const importedResult = resultFor();
    importedResult.assets = [
      {
        id: 'video-new',
        type: 'video',
        displayName: 'opening.mp4',
      },
    ];
    importedResult.assetId = 'video-new';
    const importedFile = path.join(
      root,
      'assets',
      'videos',
      'video-new.mp4',
    );
    await mkdir(path.dirname(importedFile), { recursive: true });
    await writeFile(importedFile, MP4);
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, {
      ...importedResult,
      assets: [],
    });

    expect(
      service.registerImportedAsset(
        projectFilePath,
        '/native/source/opening.MP4',
        importedResult,
      ),
    ).toBe(true);
    expect(service.getPreviewUrl('video-new')).toBeNull();

    const url = service.getMediaUrl('video-new');
    expect(url).toMatch(
      /^vn-asset:\/\/video\/[a-f0-9]{32}\/[a-f0-9]{32}$/,
    );
    await expect(request(url as string)).resolves.toMatchObject({
      status: 200,
    });

    // A following unsaved import can verify the private manifest still agrees
    // with C++ while preserving the issued media capability.
    await expect(
      service.activateTemporaryProject(projectFilePath, importedResult),
    ).resolves.toBe(true);
  });

  it('serves video through a path-free capability with bounded GET and HEAD ranges', async () => {
    const { projectFilePath, assetFilePath } = await makeVideoProject();
    const { service, request } = makeService();
    await expect(
      service.activateProjectFile(projectFilePath, videoResultFor()),
    ).resolves.toBe(true);

    expect(service.getPreviewUrl('video-1')).toBeNull();
    const url = service.getMediaUrl('video-1');
    expect(url).toMatch(
      /^vn-asset:\/\/video\/[a-f0-9]{32}\/[a-f0-9]{32}$/,
    );
    expect(url).not.toContain(projectFilePath);
    expect(url).not.toContain('video-1');

    const partial = await request(url as string, 'GET', {
      Range: 'bytes=4-11',
    });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('Content-Type')).toBe('video/mp4');
    expect(partial.headers.get('Accept-Ranges')).toBe('bytes');
    expect(partial.headers.get('Content-Range')).toBe(
      `bytes 4-11/${MP4.length}`,
    );
    expect(partial.headers.get('Content-Length')).toBe('8');
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(
      MP4.subarray(4, 12),
    );

    const head = await request(url as string, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(head.headers.get('Content-Length')).toBe(String(MP4.length));
    expect(head.headers.get('Accept-Ranges')).toBe('bytes');

    await expect(
      request((url as string).replace('://video/', '://audio/')),
    ).resolves.toMatchObject({ status: 404 });
    await writeFile(assetFilePath, Buffer.from('not video'));
    await expect(request(url as string)).resolves.toMatchObject({
      status: 404,
    });
  });

  it('revokes temporary capabilities when the authoritative Asset set shrinks', async () => {
    const { projectFilePath } = await makeProject();
    const activeResult = resultFor();
    const { service, request } = makeService();
    await expect(
      service.activateProjectFile(projectFilePath, activeResult),
    ).resolves.toBe(true);
    const oldUrl = service.getPreviewUrl('asset-1');
    expect(oldUrl).not.toBeNull();

    await expect(
      service.activateTemporaryProject(projectFilePath, {
        ...activeResult,
        assets: [],
      }),
    ).resolves.toBe(false);
    expect(service.getPreviewUrl('asset-1')).toBeNull();
    await expect(request(oldUrl as string)).resolves.toMatchObject({
      status: 404,
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
    const { service } = makeService();
    await expect(
      service.prepareProjectFile(projectFilePath),
    ).rejects.toThrow('符号链接');
    await expect(
      service.activateProjectFile(projectFilePath, resultFor()),
    ).resolves.toBe(false);
    expect(service.getPreviewUrl('asset-1')).toBeNull();
  });

  it('validates every persisted video before opening the project', async () => {
    const { root, projectFilePath, assetFilePath } = await makeProject(
      'assets/videos/video-1.mp4',
    );
    const manifest = JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 3,
      project: { id: 'project-1' },
      assets: [
        {
          id: 'video-1',
          type: 'video',
          relativePath: 'assets/videos/video-1.mp4',
          displayName: 'Opening',
        },
      ],
    });
    await writeFile(assetFilePath, MP4);
    await writeFile(projectFilePath, manifest);
    const { service } = makeService();

    const prepared = await service.prepareProjectFile(projectFilePath);
    expect(prepared).toMatchObject({
      projectId: 'project-1',
      manifestContents: manifest,
    });
    expect(await realpath(root)).toBe(prepared.projectRootPath);

    // `ftyp` plus a HEIF brand is not an MP4 video.
    await writeFile(
      assetFilePath,
      Buffer.from([
        0x00, 0x00, 0x00, 0x10,
        0x66, 0x74, 0x79, 0x70,
        0x68, 0x65, 0x69, 0x63,
        0x00, 0x00, 0x00, 0x00,
      ]),
    );
    await expect(
      service.prepareProjectFile(projectFilePath),
    ).rejects.toThrow('类型与文件内容不一致');

    // A recognized major brand does not excuse a malformed, non-aligned
    // compatible-brand tail.
    await writeFile(
      assetFilePath,
      Buffer.from([
        0x00, 0x00, 0x00, 0x11,
        0x66, 0x74, 0x79, 0x70,
        0x69, 0x73, 0x6f, 0x6d,
        0x00, 0x00, 0x00, 0x00,
        0xff,
      ]),
    );
    await expect(
      service.prepareProjectFile(projectFilePath),
    ).rejects.toThrow('类型与文件内容不一致');

    const webmManifest = JSON.stringify({
      format: 'vn-engine-project',
      fileVersion: 3,
      project: { id: 'project-1' },
      assets: [
        {
          id: 'video-1',
          type: 'video',
          relativePath: 'assets/videos/video-1.webm',
          displayName: 'Opening',
        },
      ],
    });
    const webmPath = path.join(root, 'assets', 'videos', 'video-1.webm');
    await writeFile(projectFilePath, webmManifest);
    await rm(assetFilePath);
    // A valid DocType followed by malformed bytes inside the declared EBML
    // header must not be accepted early.
    await writeFile(
      webmPath,
      Buffer.from([
        0x1a, 0x45, 0xdf, 0xa3, 0x94,
        0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
      ]),
    );
    await expect(
      service.prepareProjectFile(projectFilePath),
    ).rejects.toThrow('类型与文件内容不一致');
  });

  it.each([
    { extension: 'mp3' as const, contents: MP3, mime: 'audio/mpeg' },
    { extension: 'wav' as const, contents: WAV, mime: 'audio/wav' },
    { extension: 'ogg' as const, contents: OGG_OPUS, mime: 'audio/ogg' },
  ])(
    'validates and serves .$extension audio as $mime',
    async ({ extension, contents, mime }) => {
      const { projectFilePath, assetFilePath } = await makeAudioProject(
        extension,
        contents,
      );
      const { service, request } = makeService();

      await expect(
        service.activateProjectFile(
          projectFilePath,
          audioResultFor(),
        ),
      ).resolves.toBe(true);
      expect(service.getPreviewUrl('audio-1')).toBeNull();
      const url = service.getMediaUrl('audio-1');
      expect(url).toMatch(
        /^vn-asset:\/\/audio\/[a-f0-9]{32}\/[a-f0-9]{32}$/,
      );
      expect(url).not.toContain(projectFilePath);
      expect(url).not.toContain('audio-1');

      const response = await request(url as string);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(mime);
      expect(response.headers.get('Accept-Ranges')).toBe('bytes');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Content-Type-Options')).toBe(
        'nosniff',
      );
      expect(Buffer.from(await response.arrayBuffer())).toEqual(contents);

      await writeFile(assetFilePath, Buffer.from('not audio'));
      await expect(request(url as string)).resolves.toMatchObject({
        status: 404,
      });
    },
  );

  it('supports bounded audio GET and HEAD ranges and rejects invalid ranges', async () => {
    const { projectFilePath } = await makeAudioProject('wav', WAV);
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, audioResultFor());
    const url = service.getMediaUrl('audio-1') as string;

    const partial = await request(url, 'GET', { Range: 'bytes=4-11' });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('Content-Range')).toBe(
      `bytes 4-11/${WAV.length}`,
    );
    expect(partial.headers.get('Content-Length')).toBe('8');
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(
      WAV.subarray(4, 12),
    );

    const suffix = await request(url, 'GET', { Range: 'bytes=-4' });
    expect(suffix.status).toBe(206);
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(
      WAV.subarray(-4),
    );

    const head = await request(url, 'HEAD', { Range: 'bytes=0-3' });
    expect(head.status).toBe(206);
    expect(head.body).toBeNull();
    expect(head.headers.get('Content-Length')).toBe('4');
    expect(head.headers.get('Content-Range')).toBe(
      `bytes 0-3/${WAV.length}`,
    );

    for (const range of [
      'bytes=0-1,4-5',
      `bytes=${WAV.length}-`,
      'bytes=9-2',
      'bytes=-0',
      'bytes=999999999999999999999-',
    ]) {
      const response = await request(url, 'GET', { Range: range });
      expect(response.status).toBe(416);
      expect(response.headers.get('Content-Range')).toBe(
        `bytes */${WAV.length}`,
      );
      expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    }
  });

  it('rejects audio extension spoofing, ID3-only files, and oversized audio', async () => {
    const spoofed = await makeAudioProject('wav', MP3);
    const { service } = makeService();
    await expect(
      service.prepareProjectFile(spoofed.projectFilePath),
    ).rejects.toThrow('类型与文件内容不一致');

    const id3Only = await makeAudioProject(
      'mp3',
      Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0, 0, 0, 0]),
    );
    await expect(
      service.prepareProjectFile(id3Only.projectFilePath),
    ).rejects.toThrow('类型与文件内容不一致');

    const oversized = await makeAudioProject('mp3', MP3);
    await truncate(oversized.assetFilePath, 512 * 1024 * 1024 + 1);
    await expect(
      service.prepareProjectFile(oversized.projectFilePath),
    ).rejects.toThrow('有效的常规文件');
  });

  it('keeps audio capabilities type-bound, window-local, and path-free', async () => {
    const { projectFilePath } = await makeAudioProject('mp3', MP3);
    const firstWindow = makeService();
    const secondWindow = makeService();
    await firstWindow.service.activateProjectFile(
      projectFilePath,
      audioResultFor(),
    );
    await secondWindow.service.activateProjectFile(
      projectFilePath,
      audioResultFor(),
    );
    const url = firstWindow.service.getMediaUrl('audio-1') as string;

    expect(secondWindow.service.getMediaUrl('audio-1')).not.toBe(url);
    await expect(secondWindow.request(url)).resolves.toMatchObject({
      status: 404,
    });
    await expect(
      firstWindow.request(url.replace('://audio/', '://image/')),
    ).resolves.toMatchObject({ status: 404 });
    expect(firstWindow.service.getMediaUrl('../opaque-id')).toBeNull();
  });

  it('serves newly imported audio before the temporary manifest is saved', async () => {
    const { root, projectFilePath } = await makeProject();
    await writeFile(
      projectFilePath,
      JSON.stringify({
        format: 'vn-engine-project',
        fileVersion: 7,
        project: { id: 'project-1' },
        assets: [],
      }),
    );
    const importedFile = path.join(
      root,
      'assets',
      'audio',
      'audio-new.mp3',
    );
    await mkdir(path.dirname(importedFile), { recursive: true });
    await writeFile(importedFile, MP3);
    const importedResult = audioResultFor('audio-new');
    importedResult.assetId = 'audio-new';
    const { service, request } = makeService();
    await service.activateProjectFile(projectFilePath, {
      ...importedResult,
      assets: [],
    });

    expect(
      service.registerImportedAsset(
        projectFilePath,
        '/native/source/theme.MP3',
        importedResult,
      ),
    ).toBe(true);
    const url = service.getMediaUrl('audio-new');
    expect(url).not.toContain('audio-new');
    await expect(request(url as string)).resolves.toMatchObject({
      status: 200,
    });
  });

  it('rejects a project when a manifest resource is missing', async () => {
    const { projectFilePath, assetFilePath } = await makeProject();
    await rm(assetFilePath);
    const { service } = makeService();

    await expect(
      service.prepareProjectFile(projectFilePath),
    ).rejects.toThrow();
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
