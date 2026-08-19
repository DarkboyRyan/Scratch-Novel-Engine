import { createPackage as createAsarPackage } from '@electron/asar';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectArtifacts,
  copyVerifiedDirectory,
  expectedPackageDirectoryName,
  verifyPackagedAsarMetadata,
  verifyReleaseSet,
  verifyRuntimeBundle,
} from '../lib/releaseTools.mjs';
import {
  macSignOptions,
  windowsSignOptions,
} from '../lib/signingPolicy.mjs';
import {
  windowsArchiveInvocation,
  windowsMetadataVerificationInvocation,
  windowsSignatureVerificationInvocation,
} from '../lib/windowsPowerShellPolicy.mjs';
import { assertExactMacosArchitecture } from '../lib/macosPlayerTemplate.mjs';

const temporaryDirectories = [];
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const playerDirectory = path.resolve(testDirectory, '..', '..');
const repositoryDirectory = path.resolve(playerDirectory, '..', '..');
const fixtureDirectory = path.join(playerDirectory, 'fixtures', 'game');
const gameInputValidator = path.join(playerDirectory, 'scripts', 'verifyGameBuildInputs.mjs');
const embeddedArtifactPreparer = path.join(
  playerDirectory,
  'scripts',
  'prepareEmbeddedArtifact.mjs',
);
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const VERSION = '0.1.0';

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vn-player-release-tools-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeMediaBundle(root) {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  await mkdir(path.join(root, 'assets', 'images'), { recursive: true });
  await mkdir(path.join(root, 'assets', 'audio'), { recursive: true });
  await mkdir(path.join(root, 'assets', 'videos'), { recursive: true });
  await writeFile(path.join(root, 'assets', 'images', 'background.png'), png);
  await writeFile(
    path.join(root, 'game.json'),
    `${JSON.stringify({
      format: 'vn-engine-runtime',
      runtimeVersion: 1,
      game: { id: 'project', title: 'Test', entrySceneId: 'scene' },
      scenes: [{
        schemaVersion: 1,
        id: 'scene',
        name: 'Scene',
        backgroundAssetId: 'background',
        nodes: [],
      }],
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'manifest.json'),
    `${JSON.stringify({
      format: 'vn-engine-runtime-manifest',
      manifestVersion: 1,
      buildId: randomUUID(),
      projectId: 'project',
      sourceRevision: 1,
      runtimeVersion: 1,
      playerCompatibility: '>=1 <2',
      createdAt: '2026-08-18T00:00:00.000Z',
      files: [{
        assetId: 'background',
        type: 'image',
        displayName: 'Background',
        path: 'assets/images/background.png',
        mime: 'image/png',
        bytes: png.length,
        sha256: sha256(png),
      }],
    }, null, 2)}\n`,
  );
}

test('verifies a runtime bundle and rejects post-manifest tampering', async () => {
  const root = await temporaryDirectory();
  await writeMediaBundle(root);

  const result = await verifyRuntimeBundle(root);
  assert.equal(result.projectId, 'project');
  assert.equal(result.assetCount, 1);

  await writeFile(path.join(root, 'assets', 'images', 'background.png'), Buffer.alloc(12));
  await assert.rejects(
    verifyRuntimeBundle(root),
    /内容与声明类型不一致|文件头与 MIME 不一致|SHA-256 与 manifest 不一致/u,
  );
});

test('uses the production Player schema for scenes and references', async () => {
  const root = await temporaryDirectory();
  await writeMediaBundle(root);
  const gamePath = path.join(root, 'game.json');
  const game = JSON.parse(await readFile(gamePath, 'utf8'));
  delete game.scenes[0].nodes;
  await writeFile(gamePath, `${JSON.stringify(game, null, 2)}\n`);
  await assert.rejects(
    verifyRuntimeBundle(root),
    /Player 严格内容包校验失败/u,
  );
});

test('invokes Forge through Node instead of relying on package bin execute bits', async () => {
  const playerPackage = JSON.parse(
    await readFile(path.join(playerDirectory, 'package.json'), 'utf8'),
  );
  for (const scriptName of ['start', 'package', 'make']) {
    assert.match(
      playerPackage.scripts[scriptName],
      /^node \.\.\/\.\.\/node_modules\/@electron-forge\/cli\/dist\/electron-forge\.js /u,
    );
  }

  const editorTemplateRunner = await readFile(
    path.join(playerDirectory, 'scripts', 'runEditorWithPlayerTemplate.mjs'),
    'utf8',
  );
  assert.match(editorTemplateRunner, /runChecked\(process\.execPath, editorForgeArguments/u);
  assert.doesNotMatch(editorTemplateRunner, /exec['"],\s*['"]electron-forge/u);
});

test('copies only a verified bundle into a new directory named game', async () => {
  const parent = await temporaryDirectory();
  const target = path.join(parent, 'game');
  await copyVerifiedDirectory(fixtureDirectory, target);

  assert.equal(
    (await readFile(path.join(target, 'game.json'), 'utf8')).includes('development-player-fixture'),
    true,
  );
  await assert.rejects(
    copyVerifiedDirectory(fixtureDirectory, target),
    /必须不存在/u,
  );
  await assert.rejects(
    copyVerifiedDirectory(fixtureDirectory, path.join(parent, 'wrong-name')),
    /目录名为 game/u,
  );
});

test('accepts exactly one downloaded .vngame artifact and stages it as game', async () => {
  const root = await temporaryDirectory();
  const artifact = path.join(root, 'artifact');
  const targetParent = path.join(root, 'embedded');
  await mkdir(artifact);
  await mkdir(targetParent);
  await cp(fixtureDirectory, path.join(artifact, 'Demo.vngame'), { recursive: true });

  const result = spawnSync(
    process.execPath,
    [
      embeddedArtifactPreparer,
      '--input',
      artifact,
      '--target',
      path.join(targetParent, 'game'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    (await readFile(path.join(targetParent, 'game', 'manifest.json'), 'utf8')).includes(
      'vn-engine-runtime-manifest',
    ),
    true,
  );
});

test('keeps hardened runtime in the osx-sign 1.3.3 per-file policy', () => {
  const options = macSignOptions({
    app: '/tmp/Player.app',
    identity: 'Developer ID Application: Example (TEAMID)',
    keychain: '/tmp/signing.keychain-db',
  });
  assert.equal(Object.hasOwn(options, 'hardenedRuntime'), false);
  assert.deepEqual(options.optionsForFile('/tmp/Player.app'), {
    hardenedRuntime: true,
  });

  const windows = windowsSignOptions({
    appDirectory: 'C:\\Player',
    certificateFile: 'C:\\certificate.pfx',
    certificatePassword: 'secret',
  });
  assert.deepEqual(windows.hashes, ['sha256']);
});

test('keeps callable game metadata aligned with the final cross-platform contract', () => {
  const baseEnvironment = {
    ...process.env,
    GAME_PRODUCT_NAME: '星光 Game',
    GAME_VERSION: '1.2.3',
    GAME_APP_BUNDLE_ID: 'com.example.9game',
    GAME_ARTIFACT_PREFIX: 'starlight-game',
  };
  assert.equal(
    spawnSync(process.execPath, [gameInputValidator], { env: baseEnvironment }).status,
    0,
  );
  assert.equal(
    spawnSync(process.execPath, [gameInputValidator], {
      env: {
        ...baseEnvironment,
        GAME_PRODUCT_NAME: 'Game$(printf injected)`whoami`',
      },
    }).status,
    0,
    '合法文件名中的 shell 元字符应由 workflow env 边界安全传递，而不是靠拒绝名称规避',
  );
  assert.notEqual(
    spawnSync(process.execPath, [gameInputValidator], {
      env: { ...baseEnvironment, GAME_PRODUCT_NAME: '-Game' },
    }).status,
    0,
  );

  for (const invalidEnvironment of [
    { GAME_APP_BUNDLE_ID: 'example.game' },
    { GAME_PRODUCT_NAME: 'Cafe\u0301' },
    { GAME_PRODUCT_NAME: 'CON' },
    { GAME_PRODUCT_NAME: 'Trailing ' },
    { GAME_VERSION: `${'1'.repeat(30)}.1.1` },
  ]) {
    const result = spawnSync(process.execPath, [gameInputValidator], {
      env: { ...baseEnvironment, ...invalidEnvironment },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, result.stdout);
  }
});

function workflowRunBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)run:\s*(.*)$/u.exec(lines[index]);
    if (match === null) {
      continue;
    }
    const indent = match[1].length;
    const marker = match[2].trim();
    if (!/^[>|][+-]?$/u.test(marker)) {
      blocks.push(marker);
      continue;
    }
    const content = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() !== '' && line.length - line.trimStart().length <= indent) {
        index -= 1;
        break;
      }
      content.push(line);
    }
    blocks.push(content.join('\n'));
  }
  return blocks;
}

test('never interpolates untrusted workflow expressions into shell source', async () => {
  const workflowDirectory = path.join(repositoryDirectory, '.github', 'workflows');
  const workflowNames = [
    'player-ci.yml',
    'player-game-build.yml',
    'player-release.yml',
  ];
  const unsafeExpression = /\$\{\{\s*(?:inputs\.|github\.ref_name\b|secrets\.|steps\.[^.\s]+\.outputs\.|needs\.[^.\s]+\.outputs\.)/u;
  const approvedActions = new Set([
    'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
    'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86',
  ]);
  for (const workflowName of workflowNames) {
    const source = await readFile(path.join(workflowDirectory, workflowName), 'utf8');
    for (const runBlock of workflowRunBlocks(source)) {
      assert.doesNotMatch(
        runBlock,
        unsafeExpression,
        `${workflowName} 必须先把不可信 expression 放入 env，再由 shell 引用环境变量`,
      );
    }
    for (const line of source.split(/\r?\n/u)) {
      const uses = /^\s*uses:\s+([^\s#]+)(?:\s+#\s+v\d+(?:\.\d+){0,2})?\s*$/u.exec(line);
      if (uses !== null && !uses[1].startsWith('./')) {
        assert.match(
          uses[1],
          /@[a-f0-9]{40}$/u,
          `${workflowName} 的第三方 Action 必须固定到完整 commit SHA`,
        );
        assert.equal(
          approvedActions.has(uses[1]),
          true,
          `${workflowName} 使用了未经审核的 Action commit`,
        );
        assert.match(
          line,
          /#\s+v\d+(?:\.\d+){0,2}\s*$/u,
          '固定 SHA 后必须注释维护用版本',
        );
      }
    }
    const checkoutCount = (source.match(/uses:\s+actions\/checkout@/gu) ?? []).length;
    const safeCheckoutCount = (
      source.match(
        /uses:\s+actions\/checkout@[a-f0-9]{40}\s+#\s+v\d+(?:\.\d+){0,2}\n\s+with:\n\s+persist-credentials:\s+false/gu,
      ) ?? []
    ).length;
    assert.equal(safeCheckoutCount, checkoutCount, `${workflowName} checkout 不得持久化 token`);
  }

  const gameWorkflow = await readFile(
    path.join(workflowDirectory, 'player-game-build.yml'),
    'utf8',
  );
  assert.match(gameWorkflow, /"--product=\$GAME_PRODUCT_NAME"/u);
  assert.match(gameWorkflow, /"\.\/\$APP_NAME"/u);
  assert.match(gameWorkflow, /environment: game-release/u);
  assert.match(gameWorkflow, /icon_file: vn-player-icon\.png/u);
  assert.doesNotMatch(
    gameWorkflow,
    /^\s{4}secrets:\s*$[\s\S]*?^permissions:/mu,
    'reusable game build must obtain signing secrets only from game-release Environment',
  );

  const releaseWorkflow = await readFile(
    path.join(workflowDirectory, 'player-release.yml'),
    'utf8',
  );
  assert.match(releaseWorkflow, /trap rollback_draft EXIT/u);
  assert.match(releaseWorkflow, /--method DELETE "repos\/\$\{GITHUB_REPOSITORY\}\/releases\/\$\{CREATED_RELEASE_ID\}"/u);
  assert.equal((releaseWorkflow.match(/verify_remote_tag_commit\n/gu) ?? []).length, 3);
  assert.match(releaseWorkflow, /gh release download "\$TAG" --dir "\$REMOTE_DIR"/u);
  assert.match(releaseWorkflow, /sha256sum --strict --check SHA256SUMS/u);
  assert.match(
    releaseWorkflow,
    /EXPECTED_TAG_OBJECT_TYPE: \$\{\{ needs\.preflight\.outputs\.tag_object_type \}\}/u,
  );
  assert.match(
    releaseWorkflow,
    /EXPECTED_TAG_OBJECT_SHA: \$\{\{ needs\.preflight\.outputs\.tag_object_sha \}\}/u,
  );
  assert.equal((releaseWorkflow.match(/environment: player-release/gu) ?? []).length, 3);
  assert.ok(
    releaseWorkflow.indexOf('Remove signing material before third-party artifact upload') <
      releaseWorkflow.indexOf('Upload verified release candidate'),
  );
});

test('passes Windows paths only through environment variables, never PowerShell command text', () => {
  const source = "C:\\Build Root\\Player'; Write-Error injected; #";
  const destination = 'C:\\Artifact Root\\Player Output.zip';
  const verification = windowsSignatureVerificationInvocation(source, {});
  const archive = windowsArchiveInvocation(source, destination, {});
  const metadata = windowsMetadataVerificationInvocation(
    source,
    "Game$(injected)`whoami`",
    VERSION,
    {},
  );

  for (const invocation of [verification, archive, metadata]) {
    assert.equal(invocation.command, 'powershell.exe');
    assert.equal(invocation.args.includes(source), false);
    assert.equal(invocation.args.includes(destination), false);
    assert.equal(invocation.args.at(-2), '-Command');
    assert.equal(invocation.args.at(-1).includes('$args'), false);
  }
  assert.equal(verification.environment.VN_PLAYER_WINDOWS_VERIFY_ROOT, source);
  assert.equal(archive.environment.VN_PLAYER_WINDOWS_ARCHIVE_SOURCE, source);
  assert.equal(
    archive.environment.VN_PLAYER_WINDOWS_ARCHIVE_DESTINATION,
    destination,
  );
  assert.equal(
    metadata.environment.VN_PLAYER_WINDOWS_METADATA_PRODUCT,
    "Game$(injected)`whoami`",
  );
});

test('reads product, version, and app ID back from the packaged asar', async () => {
  const root = await temporaryDirectory();
  const source = path.join(root, 'source');
  const appAsar = path.join(root, 'app.asar');
  await mkdir(source);
  await writeFile(
    path.join(source, 'package.json'),
    `${JSON.stringify({
      name: 'player',
      productName: 'Metadata Game',
      version: VERSION,
      vnEnginePlayerBuild: {
        schemaVersion: 1,
        appBundleId: 'com.example.metadata',
      },
    })}\n`,
  );
  await createAsarPackage(source, appAsar);

  assert.doesNotThrow(() => verifyPackagedAsarMetadata(appAsar, {
    productName: 'Metadata Game',
    version: VERSION,
    appBundleId: 'com.example.metadata',
  }));
  assert.throws(
    () => verifyPackagedAsarMetadata(appAsar, {
      productName: 'Metadata Game',
      version: '9.9.9',
      appBundleId: 'com.example.metadata',
    }),
    /构建元数据与预期不一致/u,
  );
  assert.equal(
    expectedPackageDirectoryName('Metadata Game', 'linux', 'x64'),
    'Metadata Game-linux-x64',
  );
});

test('rejects a Player template whose real Mach-O architecture disagrees with its manifest', () => {
  assert.doesNotThrow(() => assertExactMacosArchitecture('arm64\n', 'arm64'));
  assert.doesNotThrow(() => assertExactMacosArchitecture('x86_64\n', 'x64'));
  assert.throws(
    () => assertExactMacosArchitecture('arm64\n', 'x64'),
    /架构必须为 x86_64.*arm64/u,
  );
  assert.throws(
    () => assertExactMacosArchitecture('x86_64 arm64\n', 'arm64'),
    /架构必须为 arm64.*x86_64 arm64/u,
  );
});

function receipt(platform, arch, signature) {
  return {
    schemaVersion: 1,
    classification: 'release',
    platform,
    arch,
    mode: 'generic',
    productName: 'VN Engine Player',
    version: VERSION,
    appBundleId: 'com.vnengine.player',
    gitCommit: COMMIT,
    signature,
    content: { mode: 'generic', assetCount: 0, projectId: null },
    createdAt: '2026-08-18T00:00:00.000Z',
  };
}

test('publishes no release set until all three signed platform artifacts match', async () => {
  const root = await temporaryDirectory();
  const merged = path.join(root, 'merged');
  await mkdir(merged);
  const targets = [
    ['darwin', 'arm64', 'developer-id-notarized'],
    ['win32', 'x64', 'authenticode'],
    ['linux', 'x64', 'not-applicable'],
  ];

  for (const [platform, arch, signature] of targets) {
    const input = path.join(root, `input-${platform}`);
    const output = path.join(root, `output-${platform}`);
    const receiptPath = path.join(root, `receipt-${platform}.json`);
    await mkdir(input);
    await writeFile(
      path.join(input, `VN-Engine-Player-${platform}-${arch}-${VERSION}.zip`),
      `artifact-${platform}`,
    );
    await writeFile(receiptPath, `${JSON.stringify(receipt(platform, arch, signature))}\n`);
    await collectArtifacts({
      inputDirectory: input,
      outputDirectory: output,
      receiptPath,
      classification: 'release',
      platform,
      arch,
      version: VERSION,
      gitCommit: COMMIT,
    });
    for (const entry of await readdir(output)) {
      await cp(
        path.join(output, entry),
        path.join(merged, entry),
        { recursive: true, force: false, errorOnExist: true },
      );
    }
  }

  const publish = path.join(root, 'publish');
  const result = await verifyReleaseSet({
    inputDirectory: merged,
    outputDirectory: publish,
    version: VERSION,
    gitCommit: COMMIT,
  });
  assert.equal(result.targets.length, 3);
  assert.deepEqual(
    (await readdir(publish)).sort(),
    [
      'SHA256SUMS',
      `VN-Engine-Player-darwin-arm64-${VERSION}.zip`,
      `VN-Engine-Player-linux-x64-${VERSION}.zip`,
      `VN-Engine-Player-win32-x64-${VERSION}.zip`,
      'release-set.json',
    ],
  );
  const checksumLines = (await readFile(path.join(publish, 'SHA256SUMS'), 'utf8'))
    .trim()
    .split('\n');
  assert.equal(checksumLines.length, 4);
  const releaseSetBytes = await readFile(path.join(publish, 'release-set.json'));
  assert.equal(
    checksumLines.includes(`${sha256(releaseSetBytes)}  release-set.json`),
    true,
  );

  await rm(path.join(merged, 'artifact-manifest-linux-x64.json'));
  await assert.rejects(
    verifyReleaseSet({
      inputDirectory: merged,
      outputDirectory: path.join(root, 'incomplete'),
      version: VERSION,
      gitCommit: COMMIT,
    }),
    /三个平台清单/u,
  );
});
