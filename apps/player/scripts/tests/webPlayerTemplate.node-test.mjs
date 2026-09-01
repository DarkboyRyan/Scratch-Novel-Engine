/**
 * 主要作用：验证 Web Player 模板暂存、哈希、目录所有权与失败回滚。
 * 关键函数与实现：测试套件“stages an exact, hashed Web Player template payload”、`temporaryDirectories`、`testDirectory`、`stageScript`；使用 node:test、临时目录与真实文件制品覆盖发布工具。
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const temporaryDirectories = [];
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const stageScript = path.resolve(testDirectory, '..', 'stageWebPlayerTemplate.mjs');

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vn-web-template-test-'));
  temporaryDirectories.push(root);
  const source = path.join(root, 'source');
  const output = path.join(root, 'web-player-template');
  await mkdir(path.join(source, 'player-assets'), { recursive: true });
  await writeFile(
    path.join(source, 'index.html'),
    '<!doctype html><html lang="zh-CN"><script></script></html>',
  );
  await writeFile(path.join(source, 'player-assets', 'player-test.js'), 'safe();');
  await writeFile(path.join(source, 'player-assets', 'index-test.css'), 'body{}');
  return { root, source, output };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

test('stages an exact, hashed Web Player template payload', async () => {
  const { source, output } = await fixture();
  const result = spawnSync(process.execPath, [
    stageScript,
    '--source',
    source,
    '--output',
    output,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(await readFile(
    path.join(output, 'web-player-template.json'),
    'utf8',
  ));
  assert.deepEqual(Object.keys(manifest).sort(), [
    'entry',
    'files',
    'format',
    'payloadRoot',
    'playerVersion',
    'runtimeCompatibility',
    'templateVersion',
  ]);
  assert.equal(manifest.format, 'vn-engine-web-player-template');
  assert.equal(manifest.templateVersion, 1);
  assert.equal(manifest.payloadRoot, 'payload');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.runtimeCompatibility, '>=1 <13');
  assert.match(manifest.playerVersion, /^\d+\.\d+\.\d+$/u);
  assert.deepEqual(
    manifest.files.map((file) => file.path),
    [
      'index.html',
      'player-assets/index-test.css',
      'player-assets/player-test.js',
    ],
  );
  for (const file of manifest.files) {
    assert.deepEqual(Object.keys(file).sort(), ['bytes', 'path', 'sha256']);
    const contents = await readFile(path.join(output, 'payload', ...file.path.split('/')));
    assert.equal(file.bytes, contents.length);
    assert.equal(file.sha256, createHash('sha256').update(contents).digest('hex'));
  }
});

test('rejects unexpected root files and linked payload entries', async () => {
  const unexpected = await fixture();
  await writeFile(path.join(unexpected.source, 'private.json'), '{}');
  const unexpectedResult = spawnSync(process.execPath, [
    stageScript,
    '--source',
    unexpected.source,
    '--output',
    unexpected.output,
  ], { encoding: 'utf8' });
  assert.notEqual(unexpectedResult.status, 0);
  assert.match(unexpectedResult.stderr, /未约定的根文件/u);

  if (process.platform !== 'win32') {
    const linked = await fixture();
    await symlink(
      path.join(linked.source, 'index.html'),
      path.join(linked.source, 'player-assets', 'linked.js'),
    );
    const linkedResult = spawnSync(process.execPath, [
      stageScript,
      '--source',
      linked.source,
      '--output',
      linked.output,
    ], { encoding: 'utf8' });
    assert.notEqual(linkedResult.status, 0);
    assert.match(linkedResult.stderr, /不能包含符号链接/u);
  }
});

test('rejects an entry without one supported html language attribute', async () => {
  const missing = await fixture();
  await writeFile(
    path.join(missing.source, 'index.html'),
    '<!doctype html><html data-lang="zh-CN"></html>',
  );
  const missingResult = spawnSync(process.execPath, [
    stageScript,
    '--source',
    missing.source,
    '--output',
    missing.output,
  ], { encoding: 'utf8' });
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /语言属性不符合模板契约/u);

  const duplicate = await fixture();
  await writeFile(
    path.join(duplicate.source, 'index.html'),
    '<!doctype html><html lang="zh-CN" lang=en-US></html>',
  );
  const duplicateResult = spawnSync(process.execPath, [
    stageScript,
    '--source',
    duplicate.source,
    '--output',
    duplicate.output,
  ], { encoding: 'utf8' });
  assert.notEqual(duplicateResult.status, 0);
  assert.match(duplicateResult.stderr, /语言属性不符合模板契约/u);
});

test('rejects a broad output name and preserves an existing template on failure', async () => {
  const unsafe = await fixture();
  const unsafeResult = spawnSync(process.execPath, [
    stageScript,
    '--source',
    unsafe.source,
    '--output',
    path.join(unsafe.root, 'output'),
  ], { encoding: 'utf8' });
  assert.notEqual(unsafeResult.status, 0);
  assert.match(unsafeResult.stderr, /输出目录不安全/u);

  const failed = await fixture();
  await mkdir(failed.output);
  await writeFile(path.join(failed.output, 'sentinel.txt'), 'previous-template');
  await writeFile(path.join(failed.source, 'unexpected.json'), '{}');
  const failedResult = spawnSync(process.execPath, [
    stageScript,
    '--source',
    failed.source,
    '--output',
    failed.output,
  ], { encoding: 'utf8' });
  assert.notEqual(failedResult.status, 0);
  assert.equal(
    await readFile(path.join(failed.output, 'sentinel.txt'), 'utf8'),
    'previous-template',
  );
});
