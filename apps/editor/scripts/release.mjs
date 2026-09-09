#!/usr/bin/env node
// Editor platform-tag validation, packaged-resource smoke test and asset collection.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const editorRoot = fileURLToPath(new URL('../', import.meta.url));
const targets = {
  mac: { platform: 'darwin', arch: 'arm64', runner: 'macos-15' },
  windows: { platform: 'win32', arch: 'x64', runner: 'windows-2025' },
};

export function releaseMetadata(tag, version) {
  const match = /^editor-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-(mac|windows)$/u.exec(tag);
  if (!match || match[1] !== version) {
    throw new Error('Tag must be editor-v<package version>-mac or -windows');
  }
  return { tag, version, target: match[2], ...targets[match[2]] };
}

async function requireFile(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
    throw new Error(`Missing or invalid file: ${file}`);
  }
  return stat;
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else if (entry.isFile()) files.push(file);
    else throw new Error(`Unsupported artifact entry: ${file}`);
  }
  return files.sort();
}

function exactlyOne(values, description) {
  if (values.length !== 1) throw new Error(`Expected one ${description}, found ${values.length}`);
  return values[0];
}

export async function verifyPackage(out, metadata, productName) {
  if (process.platform !== metadata.platform || process.arch !== metadata.arch) {
    throw new Error('Packaged Editor must be verified on its native platform and architecture');
  }
  const packageDirectory = path.join(out, `${productName}-${metadata.platform}-${metadata.arch}`);
  const resources = metadata.target === 'mac'
    ? path.join(packageDirectory, `${productName}.app`, 'Contents', 'Resources')
    : path.join(packageDirectory, 'resources');
  await requireFile(path.join(resources, 'app.asar'));
  const backend = path.join(resources, 'backend', metadata.target === 'mac'
    ? 'vn_engine_backend' : 'vn_engine_backend.exe');
  await requireFile(backend);
  const result = spawnSync(backend, [], {
    input: `${JSON.stringify({ id: 1, method: 'ping', params: {} })}\n`,
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Packaged backend failed to start: ${result.error ?? result.stderr}`);
  }
  const response = JSON.parse(result.stdout.trim());
  if (response.id !== 1 || response.ok !== true) throw new Error('Packaged backend ping failed');
  const web = path.join(resources, 'web-player-template');
  await requireFile(path.join(web, 'payload', 'index.html'));
  const manifest = await readFile(path.join(web, 'web-player-template.json'));
  const stagedManifest = await readFile(path.resolve(editorRoot, '../../engine/stage/web-player-template/web-player-template.json'));
  if (!manifest.equals(stagedManifest)) throw new Error('Packaged Web template differs from staged template');
  // Compare every payload byte, including assets referenced by index.html.
  const stagedPayload = path.resolve(editorRoot, '../../engine/stage/web-player-template/payload');
  for (const file of await walk(stagedPayload)) {
    const packaged = path.join(web, 'payload', path.relative(stagedPayload, file));
    await requireFile(packaged);
    if (!(await readFile(file)).equals(await readFile(packaged))) {
      throw new Error(`Packaged Web payload differs: ${packaged}`);
    }
  }
  if (metadata.target === 'windows') {
    await requireFile(path.join(packageDirectory, `${productName}.exe`));
  }
}

export async function collectArtifacts({ input, output, metadata, commit, workingTreeDirty = false }) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('Expected a full Git commit SHA');
  const files = await walk(input);
  let copies;
  if (metadata.target === 'mac') {
    const zip = exactlyOne(files.filter(file => file.endsWith('.zip')), 'macOS ZIP');
    if (files.length !== 1) throw new Error('Unexpected macOS maker artifacts');
    copies = [[zip, `${metadata.tag}.zip`]];
  } else {
    const exe = exactlyOne(files.filter(file => file.endsWith('.exe')), 'Windows installer');
    const nupkg = exactlyOne(files.filter(file => file.endsWith('-full.nupkg')), 'Squirrel package');
    const releases = exactlyOne(files.filter(file => path.basename(file) === 'RELEASES'), 'Squirrel RELEASES');
    if (files.length !== 3) throw new Error('Unexpected Windows maker artifacts');
    // Keep the NuGet filename intact: RELEASES references it by name.
    copies = [[exe, `${metadata.tag}.exe`], [nupkg, path.basename(nupkg)], [releases, 'RELEASES']];
  }
  for (const [file] of copies) await requireFile(file);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Artifact output directory must be empty');
  for (const [source, name] of copies) await copyFile(source, path.join(output, name));
  const receipt = {
    ...metadata, commit, workingTreeDirty,
    signing: metadata.target === 'mac' ? 'ad-hoc; not notarized' : 'unsigned',
  };
  await writeFile(path.join(output, 'build-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  const names = [...copies.map(([, name]) => name), 'build-receipt.json'].sort();
  const checksums = [];
  for (const name of names) {
    const digest = createHash('sha256').update(await readFile(path.join(output, name))).digest('hex');
    checksums.push(`${digest}  ${name}`);
  }
  await writeFile(path.join(output, 'SHA256SUMS'), `${checksums.join('\n')}\n`);
  const install = metadata.target === 'mac'
    ? `Download **${metadata.tag}.zip**, extract it, and move VN Engine Editor.app to Applications. Supports Apple Silicon (arm64); Intel Macs are not included.\n\nThis build is ad-hoc signed and has not been signed with an Apple Developer ID or notarized. Gatekeeper may block the first launch.`
    : `Download and run **${metadata.tag}.exe**. Supports Windows x64 (Intel/AMD). No separate installation of Node.js, CMake, or the Visual C++ Runtime is required.\n\nThe installer is unsigned, so Windows may display an unknown publisher or SmartScreen prompt. RELEASES and .nupkg are companion files; most users only need the .exe installer.`;
  await writeFile(path.join(output, 'RELEASE_NOTES.md'), `# ${metadata.tag}\n\nScratch Novel Engine Editor ${metadata.version} public preview.\n\n## Download and installation\n\n${install}\n\n## Default language\n\nA fresh installation starts in English, including the menus, editor interface, and initial project names. Chinese is available in Settings. Existing language preferences are preserved when upgrading.\n\n## Features\n\n- Form, Blockly, and Code editing, asset management, and story previews.\n- Save and load projects; export .vngame bundles and Web game ZIPs.\n- Export standalone games locally on macOS. Standalone Windows games currently require the CI build workflow.\n\n## Verification and feedback\n\nRelease builds run automated checks, tests, packaging, and smoke checks of the bundled backend and Web template. The macOS build also verifies signature integrity and the bundled Player template. These checks do not replace manual installation testing on each supported operating system.\n\nSHA256SUMS contains SHA-256 checksums. build-receipt.json records the source commit, platform, architecture, and signing status. Please report problems through this repository's Issues page.\n\nSource commit: \`${commit}\`\n`);
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: 'string' }, tag: { type: 'string' }, target: { type: 'string' },
    out: { type: 'string' }, output: { type: 'string' }, commit: { type: 'string' },
  } });
  const pkg = JSON.parse(await readFile(path.join(editorRoot, 'package.json'), 'utf8'));
  if (values.mode === 'matrix') {
    const matrix = { include: Object.keys(targets).map(target =>
      releaseMetadata(`editor-v${pkg.version}-${target}`, pkg.version)) };
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
    }
    process.stdout.write(`${JSON.stringify(matrix)}\n`);
    return;
  }
  const tag = values.tag ?? `editor-v${pkg.version}-${values.target}`;
  const metadata = releaseMetadata(tag, pkg.version);
  if (values.mode === 'metadata') {
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: [metadata] })}\n`);
      for (const [key, value] of Object.entries(metadata)) {
        await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
    }
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
  } else if (values.mode === 'collect' && values.out && values.output) {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: editorRoot, encoding: 'utf8' });
    if (status.error || status.status !== 0) throw new Error('Cannot determine build working-tree state');
    const workingTreeDirty = status.stdout.trim() !== '';
    if (process.env.CI === 'true' && workingTreeDirty) throw new Error('CI release requires a clean working tree');
    await verifyPackage(values.out, metadata, pkg.productName);
    await collectArtifacts({ input: path.join(values.out, 'make'), output: values.output, metadata, commit: values.commit, workingTreeDirty });
    process.stdout.write(`Verified and collected ${metadata.tag}\n`);
  } else {
    throw new Error('Use --mode metadata or --mode collect --out <Forge output> --output <assets> --commit <SHA>');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
