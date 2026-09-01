/**
 * 主要作用：验证 Editor 发布工具的版本门禁、元数据、架构、ZIP 与双平台发布集 exact 契约。
 * 关键函数与实现：syntheticReceipt、writeArchive；使用 node:test、真实 ASAR/ZIP 和临时目录覆盖防篡改路径。
 */
import { createPackage as createAsarPackage } from '@electron/asar';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { ZipFile } from 'yazl';

import {
  assertPeArchitecture,
  collectEditorArtifacts,
  expectedEditorArtifactName,
  locatePackagedEditor,
  snapshotApplicationTree,
  validateEditorReceipt,
  verifyEditorArchive,
  verifyEditorAsarMetadata,
  verifyEditorReleaseSet,
} from '../lib/editorReleaseTools.mjs';
import {
  EDITOR_RELEASE_REQUIRED_SECRETS,
  validateEditorReleasePrerequisites,
} from '../verifyEditorReleasePrerequisites.mjs';
import {
  EDITOR_ARCHIVE_FAILURE_CODES,
  EDITOR_ARCHIVE_PHASES,
  recordEditorArchivePhase,
} from '../lib/archivePhaseReporter.mjs';
import { windowsSignOptions } from '../../../player/scripts/lib/signingPolicy.mjs';

const VERSION = '1.0.0';
const PLAYER_VERSION = '0.1.0';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const temporaryDirectories = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vn-editor-release-tools-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })),
  );
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function targetPaths(platform, arch) {
  const resources = platform === 'darwin' ? 'Contents/Resources' : 'resources';
  return {
    main: platform === 'darwin'
      ? 'Contents/MacOS/VN Engine Editor'
      : 'VN Engine Editor.exe',
    asar: `${resources}/app.asar`,
    backend: `${resources}/backend/${platform === 'win32' ? 'vn_engine_backend.exe' : 'vn_engine_backend'}`,
    web: `${resources}/web-player-template/web-player-template.json`,
    player: `${resources}/player-templates/${platform}-${arch}/player-template.json`,
  };
}

function syntheticReceipt(platform, arch, classification = 'internal') {
  const paths = targetPaths(platform, arch);
  const contents = new Map([
    [paths.main, Buffer.from(`${platform}-main`)],
    [paths.asar, Buffer.from(`${platform}-asar`)],
    [paths.backend, Buffer.from(`${platform}-backend`)],
    [paths.web, Buffer.from(`${platform}-web-manifest`)],
    [paths.player, Buffer.from(`${platform}-player-manifest`)],
    [
      `${platform === 'darwin' ? 'Contents/Resources' : 'resources'}/licenses/NOTICE.txt`,
      Buffer.from(`${platform}-non-critical-notice`),
    ],
  ]);
  const criticalPaths = new Set(Object.values(paths));
  const criticalFiles = [...contents]
    .filter(([filePath]) => criticalPaths.has(filePath))
    .map(([filePath, bytes]) => ({
    path: filePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const applicationEntries = [...contents].map(([filePath, bytes]) => ({
    path: filePath,
    type: 'file',
    bytes: bytes.length,
    sha256: sha256(bytes),
    mode: platform === 'darwin' ? 0o600 : 0,
    linkTarget: null,
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const critical = new Map(criticalFiles.map((record) => [record.path, record]));
  const expectedArtifactEntry = platform === 'darwin'
    ? 'VN Engine Player.app'
    : 'VN Engine Player-win32-x64';
  return {
    receipt: {
      schemaVersion: 1,
      classification,
      platform,
      arch,
      productName: 'VN Engine Editor',
      version: VERSION,
      appBundleId: 'com.vnengine.editor',
      playerVersion: PLAYER_VERSION,
      gitCommit: COMMIT,
      signature: classification === 'release'
        ? platform === 'darwin' ? 'developer-id-notarized' : 'authenticode'
        : platform === 'darwin' ? 'adhoc' : 'unsigned-or-unverified',
      applicationRootName: platform === 'darwin'
        ? 'VN Engine Editor.app'
        : 'VN Engine Editor-win32-x64',
      content: {
        backend: {
          bytes: critical.get(paths.backend).bytes,
          sha256: critical.get(paths.backend).sha256,
        },
        webTemplate: {
          playerVersion: PLAYER_VERSION,
          fileCount: 2,
          bytes: critical.get(paths.web).bytes,
          sha256: critical.get(paths.web).sha256,
        },
        playerTemplate: {
          playerVersion: PLAYER_VERSION,
          artifactEntry: expectedArtifactEntry,
          bytes: critical.get(paths.player).bytes,
          sha256: critical.get(paths.player).sha256,
        },
      },
      criticalFiles,
      applicationEntries,
      createdAt: '2026-08-28T00:00:00.000Z',
    },
    contents,
  };
}

function addApplicationEntries(receipt, entries) {
  receipt.applicationEntries.push(...entries);
  receipt.applicationEntries.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function directoryEntry(entryPath, mode = 0o755) {
  return {
    path: entryPath,
    type: 'directory',
    bytes: 0,
    sha256: null,
    mode,
    linkTarget: null,
  };
}

function fileEntry(entryPath, bytes, mode = 0o600) {
  return {
    path: entryPath,
    type: 'file',
    bytes: bytes.length,
    sha256: sha256(bytes),
    mode,
    linkTarget: null,
  };
}

function symlinkEntry(entryPath, target) {
  const bytes = Buffer.from(target, 'utf8');
  return {
    path: entryPath,
    type: 'symlink',
    bytes: bytes.length,
    sha256: sha256(bytes),
    mode: 0o777,
    linkTarget: target,
  };
}

async function writeArchive(output, rootName, contents) {
  await mkdir(path.dirname(output), { recursive: true });
  const zip = new ZipFile();
  for (const [relativePath, bytes] of contents) {
    zip.addBuffer(bytes, `${rootName}/${relativePath}`, {
      mtime: new Date(0),
      mode: 0o100600,
    });
  }
  await new Promise((resolve, reject) => {
    const destination = createWriteStream(output, { flags: 'wx' });
    zip.outputStream.on('error', reject);
    destination.on('error', reject);
    destination.on('close', resolve);
    zip.outputStream.pipe(destination);
    zip.end();
  });
}

async function rewriteZipEntryWithBackslashes(output, entryName) {
  const bytes = await readFile(output);
  const original = Buffer.from(entryName, 'utf8');
  const replacement = Buffer.from(entryName.replaceAll('/', '\\'), 'utf8');
  assert.equal(replacement.length, original.length);
  let cursor = 0;
  let replacements = 0;
  while ((cursor = bytes.indexOf(original, cursor)) !== -1) {
    replacement.copy(bytes, cursor);
    cursor += original.length;
    replacements += 1;
  }
  assert.equal(replacements, 2);
  await writeFile(output, bytes);
}

test('sorts the complete application tree across directory and file prefixes', async () => {
  const root = await temporaryDirectory();
  await mkdir(path.join(root, 'resources'));
  await writeFile(path.join(root, 'resources', 'app.asar'), 'asar');
  await writeFile(path.join(root, 'resources.pak'), 'pak');

  const records = await snapshotApplicationTree(root, 'win32');
  assert.deepEqual(records.map((record) => record.path), [
    'resources',
    'resources.pak',
    'resources/app.asar',
  ]);
});

test('reports only fixed Editor archive phases and failure codes to GitHub output', async () => {
  const root = await temporaryDirectory();
  const output = path.join(root, 'github-output');
  const environment = {
    VN_EDITOR_ARCHIVE_PHASE_REPORT: 'github-output',
    GITHUB_ACTIONS: 'true',
    GITHUB_OUTPUT: output,
  };
  assert.deepEqual(EDITOR_ARCHIVE_PHASES, [
    'input',
    'create',
    'zip-verify',
    'extract-verify',
    'cleanup',
  ]);
  assert.deepEqual(EDITOR_ARCHIVE_FAILURE_CODES, [
    'zip-open',
    'limits',
    'path',
    'duplicate',
    'unexpected',
    'type',
    'mode',
    'content',
    'missing',
    'finalize',
  ]);
  const allowedDiagnostics = [
    ...EDITOR_ARCHIVE_PHASES,
    ...EDITOR_ARCHIVE_FAILURE_CODES,
  ];
  for (const phase of allowedDiagnostics) {
    assert.equal(recordEditorArchivePhase(phase, environment), true);
  }
  assert.equal(
    await readFile(output, 'utf8'),
    allowedDiagnostics
      .map((phase) => `editor_archive_phase=${phase}\n`)
      .join(''),
  );
  assert.throws(
    () => recordEditorArchivePhase('C:\\private\\build: raw failure', environment),
    /\u65E0\u6548的 Editor 归档阶段/u,
  );
  assert.equal(
    recordEditorArchivePhase('input', {
      ...environment,
      GITHUB_OUTPUT: path.join(root, 'missing', 'github-output'),
    }),
    false,
  );
});

test('keeps Editor archive phase reporting disabled outside the internal workflow', async () => {
  const root = await temporaryDirectory();
  const output = path.join(root, 'github-output');
  assert.equal(recordEditorArchivePhase('input', {
    VN_EDITOR_ARCHIVE_PHASE_REPORT: 'github-output',
    GITHUB_ACTIONS: 'false',
    GITHUB_OUTPUT: output,
  }), false);
  await assert.rejects(readFile(output, 'utf8'), { code: 'ENOENT' });
});

test('records each fixed Editor archive operation before it can fail', async () => {
  const runnerSource = await readFile(
    new URL('../archiveEditorBuild.mjs', import.meta.url),
    'utf8',
  );
  const releaseToolsSource = await readFile(
    new URL('../lib/editorReleaseTools.mjs', import.meta.url),
    'utf8',
  );
  assert.match(runnerSource, /recordEditorArchivePhase\('input'\)/u);
  assert.match(
    runnerSource,
    /recordPhase:\s+recordEditorArchivePhase/u,
  );
  const orderedMarkers = [
    "recordPhase('create')",
    "recordPhase('zip-verify')",
    "recordPhase('extract-verify')",
  ];
  let previousIndex = -1;
  for (const marker of orderedMarkers) {
    const markerIndex = releaseToolsSource.indexOf(marker);
    assert.ok(markerIndex > previousIndex, `${marker} 必须按归档顺序记录`);
    previousIndex = markerIndex;
  }
  assert.match(
    releaseToolsSource,
    /if \(verificationSucceeded\) \{\s+recordPhase\('cleanup'\);/u,
  );
});

test('allows internal builds without secrets and rejects unsigned release preflight', () => {
  const packageDocument = {
    name: 'editor',
    productName: 'VN Engine Editor',
    version: VERSION,
  };
  assert.deepEqual(
    validateEditorReleasePrerequisites({
      packageDocument,
      classification: 'internal',
      commit: 'local',
      environment: {},
    }),
    { version: VERSION, classification: 'internal', commit: 'local', tag: '' },
  );
  assert.throws(
    () => validateEditorReleasePrerequisites({
      packageDocument,
      classification: 'release',
      commit: COMMIT,
      tag: `editor-v${VERSION}`,
      environment: {},
    }),
    /禁止无签名回退/u,
  );
  const environment = Object.fromEntries(
    EDITOR_RELEASE_REQUIRED_SECRETS.map((name) => [name, 'configured']),
  );
  assert.equal(
    validateEditorReleasePrerequisites({
      packageDocument,
      classification: 'release',
      commit: COMMIT,
      tag: `editor-v${VERSION}`,
      environment,
    }).version,
    VERSION,
  );
});

test('reads Editor identity and version from packaged app.asar metadata', async () => {
  const root = await temporaryDirectory();
  const source = path.join(root, 'source');
  const appAsar = path.join(root, 'app.asar');
  await mkdir(source);
  await writeFile(path.join(source, 'package.json'), `${JSON.stringify({
    name: 'editor',
    productName: 'VN Engine Editor',
    version: VERSION,
    vnEngineEditorBuild: {
      schemaVersion: 1,
      appBundleId: 'com.vnengine.editor',
    },
  })}\n`);
  await createAsarPackage(source, appAsar);
  assert.doesNotThrow(() => verifyEditorAsarMetadata(appAsar, {
    productName: 'VN Engine Editor',
    version: VERSION,
    appBundleId: 'com.vnengine.editor',
  }));
  assert.throws(() => verifyEditorAsarMetadata(appAsar, {
    productName: 'VN Engine Editor',
    version: '9.9.9',
    appBundleId: 'com.vnengine.editor',
  }), /构建元数据与预期不一致/u);
});

test('checks PE architecture from the real machine field', () => {
  const pe = Buffer.alloc(512);
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(128, 0x3c);
  pe.write('PE\0\0', 128, 'binary');
  pe.writeUInt16LE(0x8664, 132);
  assert.doesNotThrow(() => assertPeArchitecture(pe, 'x64'));
  assert.throws(() => assertPeArchitecture(pe, 'arm64'), /架构与 arm64 不一致/u);
});

test('locates exactly one packaged Editor and refuses ambiguous output', async () => {
  const root = await temporaryDirectory();
  const first = path.join(root, 'VN Engine Editor-win32-x64');
  await mkdir(path.join(first, 'resources'), { recursive: true });
  assert.equal(
    await locatePackagedEditor(root, 'win32'),
    await realpath(first),
  );
  await mkdir(path.join(root, 'copy-win32-x64', 'resources'), { recursive: true });
  await assert.rejects(locatePackagedEditor(root, 'win32'), /实际为 2 个/u);
});

test('uses an Editor-specific Windows signing description', () => {
  const options = windowsSignOptions({
    appDirectory: 'C:\\Editor',
    certificateFile: 'C:\\certificate.pfx',
    certificatePassword: 'secret',
    description: 'VN Engine Editor',
  });
  assert.equal(options.description, 'VN Engine Editor');
  assert.deepEqual(options.hashes, ['sha256']);
});

test('verifies the complete ZIP tree and rejects non-critical tampering', async () => {
  const root = await temporaryDirectory();
  const { receipt, contents } = syntheticReceipt('win32', 'x64');
  const archive = path.join(
    root,
    expectedEditorArtifactName('win32', 'x64', VERSION),
  );
  await writeArchive(archive, receipt.applicationRootName, contents);
  const successfulFailureCodes = [];
  const verified = await verifyEditorArchive(
    archive,
    receipt,
    (code) => successfulFailureCodes.push(code),
  );
  assert.equal(verified.name, path.basename(archive));
  assert.equal(verified.entryCount, 6);
  assert.deepEqual(successfulFailureCodes, []);

  const tampered = new Map(contents);
  tampered.set('resources/licenses/NOTICE.txt', Buffer.from('tampered'));
  const tamperedArchive = path.join(root, 'tampered.zip');
  await writeArchive(tamperedArchive, receipt.applicationRootName, tampered);
  await assert.rejects(
    verifyEditorArchive(tamperedArchive, receipt),
    /必须命名/u,
  );
  const expectedTamperedName = path.join(root, path.basename(archive));
  await rm(archive);
  await cp(tamperedArchive, expectedTamperedName);
  const tamperedFailureCodes = [];
  await assert.rejects(
    verifyEditorArchive(
      expectedTamperedName,
      receipt,
      (code) => tamperedFailureCodes.push(code),
    ),
    /文件与完整树回执不一致/u,
  );
  assert.deepEqual(tamperedFailureCodes, ['content']);

  await rm(expectedTamperedName);
  const withUnexpectedFile = new Map(contents);
  withUnexpectedFile.set('resources/injected.dll', Buffer.from('injected'));
  await writeArchive(
    expectedTamperedName,
    receipt.applicationRootName,
    withUnexpectedFile,
  );
  const unexpectedFailureCodes = [];
  await assert.rejects(
    verifyEditorArchive(
      expectedTamperedName,
      receipt,
      (code) => unexpectedFailureCodes.push(code),
    ),
    /回执未声明的条目/u,
  );
  assert.deepEqual(unexpectedFailureCodes, ['unexpected']);

  await rm(expectedTamperedName);
  const missingFile = new Map(contents);
  missingFile.delete('resources/licenses/NOTICE.txt');
  await writeArchive(
    expectedTamperedName,
    receipt.applicationRootName,
    missingFile,
  );
  const missingFailureCodes = [];
  await assert.rejects(
    verifyEditorArchive(
      expectedTamperedName,
      receipt,
      (code) => missingFailureCodes.push(code),
    ),
    /缺少完整应用树/u,
  );
  assert.deepEqual(missingFailureCodes, ['missing']);

  await rm(expectedTamperedName);
  await writeFile(expectedTamperedName, 'not-a-zip');
  const openFailureCodes = [];
  await assert.rejects(verifyEditorArchive(
    expectedTamperedName,
    receipt,
    (code) => openFailureCodes.push(code),
  ));
  assert.deepEqual(openFailureCodes, ['zip-open']);

  await rm(expectedTamperedName);
  await writeArchive(expectedTamperedName, receipt.applicationRootName, contents);
  await rewriteZipEntryWithBackslashes(
    expectedTamperedName,
    `${receipt.applicationRootName}/VN Engine Editor.exe`,
  );
  const pathFailureCodes = [];
  await assert.rejects(verifyEditorArchive(
    expectedTamperedName,
    receipt,
    (code) => pathFailureCodes.push(code),
  ), /invalid characters in fileName/u);
  assert.deepEqual(pathFailureCodes, ['path']);
});

test('rejects a symlink whose normalized target is exactly the parent root', async () => {
  const root = await temporaryDirectory();
  const { receipt } = syntheticReceipt('darwin', 'arm64');
  const target = Buffer.from('..');
  receipt.applicationEntries.push({
    path: 'escape',
    type: 'symlink',
    bytes: target.length,
    sha256: sha256(target),
    mode: 0o777,
    linkTarget: '..',
  });
  await assert.rejects(
    verifyEditorArchive(
      path.join(root, expectedEditorArtifactName('darwin', 'arm64', VERSION)),
      receipt,
    ),
    /符号链接目标无效或逃逸/u,
  );
});

test('accepts a standard macOS framework symlink chain', () => {
  const { receipt } = syntheticReceipt('darwin', 'arm64');
  const framework = 'Contents/Frameworks/Electron Framework.framework';
  const binary = Buffer.from('framework-binary');
  addApplicationEntries(receipt, [
    directoryEntry(`${framework}`),
    symlinkEntry(`${framework}/Electron Framework`, 'Versions/Current/Electron Framework'),
    directoryEntry(`${framework}/Versions`),
    directoryEntry(`${framework}/Versions/A`),
    fileEntry(`${framework}/Versions/A/Electron Framework`, binary, 0o700),
    symlinkEntry(`${framework}/Versions/Current`, 'A'),
  ]);
  assert.doesNotThrow(() => validateEditorReceipt(receipt));
});

test('rejects dangling and cyclic declared symlink chains', () => {
  const dangling = syntheticReceipt('darwin', 'arm64').receipt;
  addApplicationEntries(dangling, [symlinkEntry('dangling', 'missing')]);
  assert.throws(
    () => validateEditorReceipt(dangling),
    /目标未被完整应用树声明/u,
  );

  const cyclic = syntheticReceipt('darwin', 'arm64').receipt;
  addApplicationEntries(cyclic, [
    symlinkEntry('cycle-a', 'cycle-b'),
    symlinkEntry('cycle-b', 'cycle-a'),
  ]);
  assert.throws(
    () => validateEditorReceipt(cyclic),
    /符号链接包含循环/u,
  );
});

test('collects exactly two platform candidates into a four-file release directory', async () => {
  const root = await temporaryDirectory();
  const combined = path.join(root, 'combined');
  await mkdir(combined);
  for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64']]) {
    const platformRoot = path.join(root, `${platform}-input`);
    const candidate = path.join(root, `${platform}-candidate`);
    await mkdir(platformRoot);
    const { receipt, contents } = syntheticReceipt(platform, arch);
    const receiptPath = path.join(root, `${platform}-receipt.json`);
    const artifactName = expectedEditorArtifactName(platform, arch, VERSION);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await writeArchive(
      path.join(platformRoot, artifactName),
      receipt.applicationRootName,
      contents,
    );
    await collectEditorArtifacts({
      inputDirectory: platformRoot,
      outputDirectory: candidate,
      receiptPath,
      classification: 'internal',
      platform,
      arch,
      version: VERSION,
      gitCommit: COMMIT,
    });
    for (const entry of await readdir(candidate)) {
      await cp(path.join(candidate, entry), path.join(combined, entry));
    }
  }
  const output = path.join(root, 'release');
  const releaseSet = await verifyEditorReleaseSet({
    inputDirectory: combined,
    outputDirectory: output,
    classification: 'internal',
    version: VERSION,
    gitCommit: COMMIT,
  });
  assert.equal(releaseSet.files.length, 2);
  assert.deepEqual((await readdir(output)).sort(), [
    'SHA256SUMS',
    `VN-Engine-Editor-darwin-arm64-${VERSION}.zip`,
    `VN-Engine-Editor-win32-x64-${VERSION}.zip`,
    'release-set.json',
  ]);
  const sums = await readFile(path.join(output, 'SHA256SUMS'), 'utf8');
  assert.match(sums, /VN-Engine-Editor-darwin-arm64-1\.0\.0\.zip/u);
  assert.match(sums, /release-set\.json/u);
});
