import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectArtifacts, releaseMetadata } from '../release.mjs';

const commit = 'a'.repeat(40);
async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'editor-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'make');
  await mkdir(input);
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(input, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  return { input, output: path.join(root, 'assets'), commit };
}

test('platform suffixes select the native architecture without changing app version', () => {
  assert.deepEqual(releaseMetadata('editor-v1.0.0-mac', '1.0.0'), {
    tag: 'editor-v1.0.0-mac', version: '1.0.0', target: 'mac',
    platform: 'darwin', arch: 'arm64', runner: 'macos-15',
  });
  assert.equal(releaseMetadata('editor-v1.0.0-windows', '1.0.0').arch, 'x64');
  for (const tag of ['editor-v1.0.1-mac', 'player-v1.0.0', 'editor-v1.0.0-linux',
    'editor-v1.0.0-internal.1', 'editor-v01.0.0-mac', 'editor-v1.0.0-mac\n']) {
    assert.throws(() => releaseMetadata(tag, '1.0.0'));
  }
});

test('collects the mac ZIP with requested name and checksums of the actual bytes', async t => {
  const options = await fixture(t, { 'zip/darwin/arm64/Editor.zip': 'zip fixture' });
  await collectArtifacts({ ...options, metadata: releaseMetadata('editor-v1.0.0-mac', '1.0.0') });
  assert.equal(await readFile(path.join(options.output, 'editor-v1.0.0-mac.zip'), 'utf8'), 'zip fixture');
  const lines = (await readFile(path.join(options.output, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    const [digest, name] = line.split('  ');
    assert.equal(digest, createHash('sha256').update(await readFile(path.join(options.output, name))).digest('hex'));
  }
  assert.match(await readFile(path.join(options.output, 'RELEASE_NOTES.md'), 'utf8'), /Apple Silicon/u);
  await assert.rejects(collectArtifacts({ ...options, metadata: releaseMetadata('editor-v1.0.0-mac', '1.0.0') }), /empty/u);
});

test('renames Windows installer but retains Squirrel package references', async t => {
  const options = await fixture(t, {
    'squirrel.windows/x64/Editor Setup.exe': 'exe fixture',
    'squirrel.windows/x64/editor-1.0.0-full.nupkg': 'nuget fixture',
    'squirrel.windows/x64/RELEASES': 'hash editor-1.0.0-full.nupkg 13',
  });
  await collectArtifacts({ ...options, metadata: releaseMetadata('editor-v1.0.0-windows', '1.0.0') });
  assert.equal(await readFile(path.join(options.output, 'editor-v1.0.0-windows.exe'), 'utf8'), 'exe fixture');
  assert.match(await readFile(path.join(options.output, 'RELEASES'), 'utf8'), /editor-1.0.0-full.nupkg/u);
  assert.ok((await readdir(options.output)).includes('editor-1.0.0-full.nupkg'));
  assert.equal(JSON.parse(await readFile(path.join(options.output, 'build-receipt.json'), 'utf8')).signing, 'unsigned');
});

test('rejects incomplete, duplicate and foreign platform artifacts', async t => {
  for (const files of [{}, { 'one.zip': 'one', 'two.zip': 'two' }, { 'one.zip': 'one', 'Setup.exe': 'exe' }, { 'one.zip': '' }]) {
    const options = await fixture(t, files);
    await assert.rejects(collectArtifacts({ ...options, metadata: releaseMetadata('editor-v1.0.0-mac', '1.0.0') }));
  }
  const options = await fixture(t, { 'Setup.exe': 'exe' });
  await assert.rejects(collectArtifacts({ ...options, metadata: releaseMetadata('editor-v1.0.0-windows', '1.0.0') }), /Squirrel/u);
});

test('rejects symbolic links and invalid provenance', async t => {
  const options = await fixture(t, { 'source.zip': 'zip' });
  // Directory junctions can be created on Windows without symlink privileges.
  await symlink(options.input, path.join(options.input, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const metadata = releaseMetadata('editor-v1.0.0-mac', '1.0.0');
  await assert.rejects(collectArtifacts({ ...options, metadata }), /Unsupported artifact/u);
  await assert.rejects(collectArtifacts({ ...options, metadata, commit: 'main' }), /commit SHA/u);
});
