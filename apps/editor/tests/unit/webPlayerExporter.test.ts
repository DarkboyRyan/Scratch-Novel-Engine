import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openPromise as openZip } from 'yauzl';
import { ZipFile } from 'yazl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDocument } from '../../src/shared/projectTypes';
import {
  archiveWebPlayerTree,
  exportWebPlayer,
  verifyWebPlayerArchive,
  WEB_EXPORT_FORMAT,
  WEB_EXPORT_README,
  type WebArchiveFileRecord,
} from '../../src/main/export/WebPlayerExporter';
import {
  WEB_PLAYER_TEMPLATE_FORMAT,
  WEB_PLAYER_TEMPLATE_VERSION,
} from '../../src/main/export/WebPlayerTemplate';

const runtimeMocks = vi.hoisted(() => ({
  exportRuntimeBundle: vi.fn(),
}));

vi.mock('../../src/main/export/RuntimeBundleExporter', () => ({
  exportRuntimeBundle: runtimeMocks.exportRuntimeBundle,
  PLAYER_COMPATIBILITY: '>=6 <7',
  RUNTIME_MANIFEST_FORMAT: 'vn-engine-runtime-manifest',
}));

function sha256(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

function crc32(contents: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1
        ? (crc >>> 1) ^ 0xedb88320
        : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function writeUnicodePathDisguiseArchive(
  archivePath: string,
): Promise<void> {
  const rawName = Buffer.from('../x', 'utf8');
  const visibleName = Buffer.from('safe', 'utf8');
  const contents = Buffer.from('ok', 'utf8');
  const unicodeData = Buffer.alloc(5 + visibleName.length);
  unicodeData.writeUInt8(1, 0);
  unicodeData.writeUInt32LE(crc32(rawName), 1);
  visibleName.copy(unicodeData, 5);
  const unicodeExtra = Buffer.alloc(4 + unicodeData.length);
  unicodeExtra.writeUInt16LE(0x7075, 0);
  unicodeExtra.writeUInt16LE(unicodeData.length, 2);
  unicodeData.copy(unicodeExtra, 4);
  const contentsCrc32 = crc32(contents);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(33, 12);
  localHeader.writeUInt32LE(contentsCrc32, 14);
  localHeader.writeUInt32LE(contents.length, 18);
  localHeader.writeUInt32LE(contents.length, 22);
  localHeader.writeUInt16LE(rawName.length, 26);
  localHeader.writeUInt16LE(unicodeExtra.length, 28);
  const localRecord = Buffer.concat([
    localHeader,
    rawName,
    unicodeExtra,
    contents,
  ]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(0x033f, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(33, 14);
  centralHeader.writeUInt32LE(contentsCrc32, 16);
  centralHeader.writeUInt32LE(contents.length, 20);
  centralHeader.writeUInt32LE(contents.length, 24);
  centralHeader.writeUInt16LE(rawName.length, 28);
  centralHeader.writeUInt16LE(unicodeExtra.length, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  centralHeader.writeUInt32LE(0, 42);
  const centralRecord = Buffer.concat([
    centralHeader,
    rawName,
    unicodeExtra,
  ]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  end.writeUInt16LE(0, 20);
  await writeFile(
    archivePath,
    Buffer.concat([localRecord, centralRecord, end]),
  );
}

async function writeZip(
  archivePath: string,
  entries: Array<{ path: string; contents: string; mode?: number }>,
): Promise<void> {
  const zip = new ZipFile();
  for (const entry of entries) {
    zip.addBuffer(Buffer.from(entry.contents), entry.path, {
      mtime: new Date(Date.UTC(1980, 0, 1)),
      mode: entry.mode ?? 0o100644,
      compress: true,
      forceDosTimestamp: true,
    });
  }
  const chunks: Buffer[] = [];
  const completed = new Promise<void>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once('error', reject);
    zip.outputStream.once('end', resolve);
  });
  zip.end({ forceZip64Format: false, comment: '' });
  await completed;
  await writeFile(archivePath, Buffer.concat(chunks));
}

async function injectLocalExtraField(
  archivePath: string,
  extraField: Buffer,
): Promise<void> {
  const archive = await readFile(archivePath);
  const centralOffset = archive.indexOf(
    Buffer.from([0x50, 0x4b, 0x01, 0x02]),
  );
  const endOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const nameLength = archive.readUInt16LE(26);
  const insertionOffset = 30 + nameLength;
  expect(centralOffset).toBeGreaterThan(insertionOffset);
  expect(endOffset).toBeGreaterThan(centralOffset);
  expect(archive.readUInt16LE(28)).toBe(0);
  const patched = Buffer.concat([
    archive.subarray(0, insertionOffset),
    extraField,
    archive.subarray(insertionOffset),
  ]);
  patched.writeUInt16LE(extraField.length, 28);
  patched.writeUInt32LE(
    archive.readUInt32LE(endOffset + 16) + extraField.length,
    endOffset + extraField.length + 16,
  );
  await writeFile(archivePath, patched);
}

describe('Web Player ZIP exporter', () => {
  const roots: string[] = [];

  async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vn-web-export-test-'));
    roots.push(root);
    return root;
  }

  async function createTemplate(root: string): Promise<string> {
    const templateRoot = path.join(root, 'template');
    const index = '<!doctype html><div id="root"></div>\n';
    const script = 'console.log("player");\n';
    const style = 'body{margin:0}\n';
    await mkdir(path.join(templateRoot, 'payload', 'player-assets'), {
      recursive: true,
    });
    await writeFile(path.join(templateRoot, 'payload', 'index.html'), index);
    await writeFile(
      path.join(templateRoot, 'payload', 'player-assets', 'player.js'),
      script,
    );
    await writeFile(
      path.join(templateRoot, 'payload', 'player-assets', 'player.css'),
      style,
    );
    const files = [
      { path: 'index.html', contents: index },
      { path: 'player-assets/player.css', contents: style },
      { path: 'player-assets/player.js', contents: script },
    ].map((file) => ({
      path: file.path,
      bytes: Buffer.byteLength(file.contents),
      sha256: sha256(file.contents),
    }));
    await writeFile(
      path.join(templateRoot, 'web-player-template.json'),
      `${JSON.stringify({
        format: WEB_PLAYER_TEMPLATE_FORMAT,
        templateVersion: WEB_PLAYER_TEMPLATE_VERSION,
        payloadRoot: 'payload',
        entry: 'index.html',
        runtimeCompatibility: '>=1 <7',
        playerVersion: '1.0.0',
        files,
      })}\n`,
    );
    return templateRoot;
  }

  async function options(root: string) {
    const sourceProjectRootPath = path.join(root, 'project');
    const exportsRoot = path.join(root, 'exports');
    await Promise.all([
      mkdir(sourceProjectRootPath),
      mkdir(exportsRoot),
    ]);
    return {
      sourceProjectRootPath,
      targetArtifactPath: path.join(exportsRoot, 'Story-Web.zip'),
      templateRootPath: await createTemplate(root),
      sourceRevision: 7,
      expectedManifestSha256: 'a'.repeat(64),
      expectedProject: {} as ProjectDocument,
      expectedAssets: [],
      buildId: 'build-7',
      createdAt: '2026-08-25T00:00:00.000Z',
    };
  }

  beforeEach(() => {
    runtimeMocks.exportRuntimeBundle.mockImplementation(
      async (runtimeOptions: {
        targetBundlePath: string;
        sourceRevision: number;
        buildId: string;
      }) => {
        await mkdir(path.join(runtimeOptions.targetBundlePath, 'assets', 'images'), {
          recursive: true,
        });
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'game.json'),
          '{"runtimeVersion":6}\n',
        );
        await writeFile(
          path.join(runtimeOptions.targetBundlePath, 'manifest.json'),
          `${JSON.stringify({
            format: 'vn-engine-runtime-manifest',
            manifestVersion: 1,
            buildId: runtimeOptions.buildId,
            projectId: 'project-1',
            sourceRevision: runtimeOptions.sourceRevision,
            runtimeVersion: 6,
            playerCompatibility: '>=6 <7',
            createdAt: '2026-08-25T00:00:00.000Z',
            files: [],
          })}\n`,
        );
        return {
          bundleName: 'runtime.vngame',
          buildId: runtimeOptions.buildId,
          sourceRevision: runtimeOptions.sourceRevision,
          assetCount: 0,
        };
      },
    );
  });

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.clearAllMocks();
  });

  it('creates and reopens an exact deployable ZIP root', async () => {
    const root = await temporaryRoot();
    const exportOptions = await options(root);

    await expect(exportWebPlayer(exportOptions)).resolves.toEqual({
      artifactName: 'Story-Web.zip',
      buildId: 'build-7',
      sourceRevision: 7,
      assetCount: 0,
    });

    const zip = await openZip(exportOptions.targetArtifactPath, {
      lazyEntries: true,
      strictFileNames: true,
    });
    const names: string[] = [];
    let webExport = '';
    let readme = '';
    for await (const entry of zip.eachEntry()) {
      names.push(entry.fileName);
      if (entry.fileName === 'web-export.json' || entry.fileName === 'README.txt') {
        const stream = await zip.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (entry.fileName === 'web-export.json') {
          webExport = Buffer.concat(chunks).toString('utf8');
        } else {
          readme = Buffer.concat(chunks).toString('utf8');
        }
      }
    }

    expect(names).toEqual([
      'README.txt',
      'game/build-7/game.json',
      'game/build-7/manifest.json',
      'index.html',
      'player-assets/player.css',
      'player-assets/player.js',
      'web-export.json',
    ]);
    expect(JSON.parse(webExport)).toEqual({
      format: WEB_EXPORT_FORMAT,
      webExportVersion: 1,
      runtimeVersion: 6,
      playerCompatibility: '>=6 <7',
      gameRoot: 'game/build-7',
    });
    expect(readme).toBe(WEB_EXPORT_README);
  });

  it('keeps archive bytes reproducible for an unchanged tree', async () => {
    const root = await temporaryRoot();
    const tree = path.join(root, 'tree');
    await mkdir(tree);
    await writeFile(path.join(tree, 'index.html'), 'fixed\n');
    const record = {
      path: 'index.html',
      bytes: Buffer.byteLength('fixed\n'),
      sha256: sha256('fixed\n'),
    };
    const first = path.join(root, 'first.zip');
    const second = path.join(root, 'second.zip');

    await archiveWebPlayerTree(tree, first, [record]);
    await archiveWebPlayerTree(tree, second, [record]);

    expect(await readFile(second)).toEqual(await readFile(first));
    await expect(verifyWebPlayerArchive(first, [record])).resolves.toBeUndefined();
  });

  it('stores already-compressed runtime media and deflates JSON', async () => {
    const root = await temporaryRoot();
    const tree = path.join(root, 'compression-tree');
    const mediaPath = 'game/build-1/assets/images/image.png';
    const jsonPath = 'game/build-1/game.json';
    const media = Buffer.from('fake-png-bytes');
    const json = '{"runtimeVersion":6}\n';
    await mkdir(path.join(tree, 'game', 'build-1', 'assets', 'images'), {
      recursive: true,
    });
    await Promise.all([
      writeFile(path.join(tree, ...mediaPath.split('/')), media),
      writeFile(path.join(tree, ...jsonPath.split('/')), json),
    ]);
    const records = [
      { path: mediaPath, bytes: media.length, sha256: sha256(media) },
      {
        path: jsonPath,
        bytes: Buffer.byteLength(json),
        sha256: sha256(json),
      },
    ].sort((left, right) => left.path < right.path ? -1 : 1);
    const archivePath = path.join(root, 'compression.zip');

    await archiveWebPlayerTree(tree, archivePath, records);
    const zip = await openZip(archivePath, {
      lazyEntries: true,
      strictFileNames: true,
    });
    const methods = new Map<string, number>();
    for await (const entry of zip.eachEntry()) {
      methods.set(entry.fileName, entry.compressionMethod);
    }
    expect(methods.get(mediaPath)).toBe(0);
    expect(methods.get(jsonPath)).toBe(8);
    await expect(
      verifyWebPlayerArchive(archivePath, records),
    ).resolves.toBeUndefined();
  });

  it('rejects extra, duplicate, and symbolic-link archive entries', async () => {
    const root = await temporaryRoot();
    const expected: WebArchiveFileRecord = {
      path: 'index.html',
      bytes: 2,
      sha256: sha256('ok'),
    };
    const extra = path.join(root, 'extra.zip');
    await writeZip(extra, [
      { path: 'index.html', contents: 'ok' },
      { path: 'extra.js', contents: 'x' },
    ]);
    await expect(verifyWebPlayerArchive(extra, [expected])).rejects.toThrow(
      'exact 契约',
    );

    const duplicate = path.join(root, 'duplicate.zip');
    await writeZip(duplicate, [
      { path: 'index.html', contents: 'ok' },
      { path: 'index.html', contents: 'ok' },
    ]);
    await expect(
      verifyWebPlayerArchive(duplicate, [expected, expected]),
    ).rejects.toThrow('重复、额外或不安全');

    const linkArchive = path.join(root, 'link.zip');
    await writeZip(linkArchive, [
      { path: 'index.html', contents: 'ok', mode: 0o120777 },
    ]);
    await expect(
      verifyWebPlayerArchive(linkArchive, [expected]),
    ).rejects.toThrow('符号链接或特殊文件');
  });

  it('rejects a central-directory CRC32 that was changed after creation', async () => {
    const root = await temporaryRoot();
    const archivePath = path.join(root, 'changed-crc.zip');
    await writeZip(archivePath, [{ path: 'index.html', contents: 'ok' }]);
    const archive = await readFile(archivePath);
    const centralHeader = archive.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    );
    expect(centralHeader).toBeGreaterThanOrEqual(0);
    archive.writeUInt32LE(
      (archive.readUInt32LE(centralHeader + 16) ^ 1) >>> 0,
      centralHeader + 16,
    );
    await writeFile(archivePath, archive);

    await expect(
      verifyWebPlayerArchive(archivePath, [{
        path: 'index.html',
        bytes: 2,
        sha256: sha256('ok'),
      }]),
    ).rejects.toThrow('校验信息与中央目录不一致');
  });

  it('computes decoded CRC32 instead of trusting forged local and central values', async () => {
    const root = await temporaryRoot();
    const archivePath = path.join(root, 'forged-crc.zip');
    await writeZip(archivePath, [{ path: 'index.html', contents: 'ok' }]);
    const archive = await readFile(archivePath);
    const centralHeader = archive.indexOf(
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
    );
    expect(centralHeader).toBeGreaterThanOrEqual(0);
    const forged = (archive.readUInt32LE(centralHeader + 16) ^ 1) >>> 0;
    archive.writeUInt32LE(forged, centralHeader + 16);
    archive.writeUInt32LE(forged, 14);
    await writeFile(archivePath, archive);

    await expect(
      verifyWebPlayerArchive(archivePath, [{
        path: 'index.html',
        bytes: 2,
        sha256: sha256('ok'),
      }]),
    ).rejects.toThrow('解压后的文件内容不符');
  });

  it('rejects a dangerous raw path disguised by a Unicode Path extra field', async () => {
    const root = await temporaryRoot();
    const archivePath = path.join(root, 'unicode-disguise.zip');
    await writeUnicodePathDisguiseArchive(archivePath);
    const zip = await openZip(archivePath, {
      lazyEntries: true,
      strictFileNames: true,
    });
    const entries = [];
    for await (const entry of zip.eachEntry()) {
      entries.push({
        decoded: entry.fileName,
        raw: entry.fileNameRaw.toString('utf8'),
      });
    }
    expect(entries).toEqual([{ decoded: 'safe', raw: '../x' }]);

    await expect(
      verifyWebPlayerArchive(archivePath, [{
        path: 'safe',
        bytes: 2,
        sha256: sha256('ok'),
      }]),
    ).rejects.toThrow('不允许 Unicode Path extra field');
  });

  it('rejects truncated and duplicate local extra-field TLVs', async () => {
    const root = await temporaryRoot();
    const expected = [{
      path: 'index.html',
      bytes: 2,
      sha256: sha256('ok'),
    }];
    const truncated = path.join(root, 'truncated-local-extra.zip');
    await writeZip(truncated, [{ path: 'index.html', contents: 'ok' }]);
    await injectLocalExtraField(truncated, Buffer.from([0x01, 0x00, 0x00]));
    await expect(
      verifyWebPlayerArchive(truncated, expected),
    ).rejects.toThrow('TLV 被截断');

    const duplicate = path.join(root, 'duplicate-local-extra.zip');
    await writeZip(duplicate, [{ path: 'index.html', contents: 'ok' }]);
    await injectLocalExtraField(
      duplicate,
      Buffer.from([
        0x01, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x00,
      ]),
    );
    await expect(
      verifyWebPlayerArchive(duplicate, expected),
    ).rejects.toThrow('重复的 extra field');
  });

  it('does not overwrite an existing target', async () => {
    const root = await temporaryRoot();
    const exportOptions = await options(root);
    await writeFile(exportOptions.targetArtifactPath, 'existing');

    await expect(exportWebPlayer(exportOptions)).rejects.toThrow('已存在同名');
    await expect(readFile(exportOptions.targetArtifactPath, 'utf8')).resolves.toBe(
      'existing',
    );
    expect(runtimeMocks.exportRuntimeBundle).not.toHaveBeenCalled();
  });

  it('rolls back private and publishing files after a pre-commit failure', async () => {
    const root = await temporaryRoot();
    const exportOptions = await options(root);
    const injected = new Error('injected failure');

    await expect(
      exportWebPlayer({
        ...exportOptions,
        injectFault: (point) => {
          if (point === 'after-published-verification') {
            throw injected;
          }
        },
      }),
    ).rejects.toBe(injected);
    await expect(readFile(exportOptions.targetArtifactPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      (await readdir(path.dirname(exportOptions.targetArtifactPath))).filter(
        (entry) => entry.includes('.publishing'),
      ),
    ).toEqual([]);
  });

  it('loses a racing no-clobber commit without deleting the winner', async () => {
    const root = await temporaryRoot();
    const exportOptions = await options(root);

    await expect(
      exportWebPlayer({
        ...exportOptions,
        injectFault: async (point) => {
          if (point === 'before-commit') {
            await writeFile(exportOptions.targetArtifactPath, 'race winner');
          }
        },
      }),
    ).rejects.toThrow('提交前发生了变化');
    await expect(readFile(exportOptions.targetArtifactPath, 'utf8')).resolves.toBe(
      'race winner',
    );
  });
});
