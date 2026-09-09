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
    ? `下载 **${metadata.tag}.zip**，解压后将 VN Engine Editor.app 放入 Applications。仅支持 Apple Silicon（arm64），不包含 Intel Mac 版本。\n\n此构建使用 ad-hoc 签名，尚未经过 Apple Developer ID 签名和公证，首次打开可能被 Gatekeeper 拦截。`
    : `下载并运行 **${metadata.tag}.exe**。支持 Windows x64（Intel/AMD）；无需单独安装 Node.js、CMake 或 Visual C++ Runtime。\n\n此安装程序尚未进行代码签名，Windows 可能显示未知发布者或 SmartScreen 提示。RELEASES 和 .nupkg 是安装器配套文件，普通用户下载 .exe 即可。`;
  await writeFile(path.join(output, 'RELEASE_NOTES.md'), `# ${metadata.tag}\n\nScratch Novel Engine Editor ${metadata.version} 首次双平台发布系列。\n\n${install}\n\n## 功能\n\n- 表单、Blockly 与 Code 编辑，资源管理及剧情预览。\n- 工程保存与加载，导出 .vngame 和 Web 游戏 ZIP。\n- macOS 可在本机导出独立游戏；Windows 独立游戏需要通过 CI 构建。\n\n## 验证与反馈\n\n此 Release 自动创建为预发布草稿，请维护者完成真实下载安装和导出验证后再发布。\n附件 SHA256SUMS 提供 SHA-256 校验值，build-receipt.json 记录构建来源与签名状态。\n\n源码提交：\`${commit}\`\n`);
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
