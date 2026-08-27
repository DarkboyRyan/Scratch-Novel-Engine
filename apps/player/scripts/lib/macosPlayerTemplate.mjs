/**
 * 主要作用：校验 macOS 通用 Player 模板的包结构、架构和签名元数据。
 * 关键函数与实现：`GENERIC_PLAYER_ARTIFACT_ENTRY`、`GENERIC_PLAYER_BUNDLE_ID`、`GENERIC_PLAYER_NAME`、`GAME_RESOURCE_DIRECTORY`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

export const GENERIC_PLAYER_ARTIFACT_ENTRY = 'VN Engine Player.app';
export const GENERIC_PLAYER_BUNDLE_ID = 'com.vnengine.player';
export const GENERIC_PLAYER_NAME = 'VN Engine Player';
export const GAME_RESOURCE_DIRECTORY = 'Contents/Resources/game';
export const APPLICATION_METADATA_FILE = 'Contents/Resources/vn-game-application.json';
export const MACOS_INFO_PLIST_FILE = 'Contents/Info.plist';

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} Player 模板校验失败：${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim()}`,
    );
  }
  return result.stdout.trim();
}

async function requireRegularFile(filePath, context, rejectHardlinks) {
  const status = await lstat(filePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.size <= 0 ||
    (rejectHardlinks && status.nlink !== 1)
  ) {
    throw new Error(
      `${context} 必须是非链接${rejectHardlinks ? '、非硬链接' : ''}普通文件`,
    );
  }
}

function expectedMachOArchitecture(arch) {
  if (arch === 'arm64') {
    return 'arm64';
  }
  if (arch === 'x64') {
    return 'x86_64';
  }
  throw new Error(`不支持的 macOS Player 模板架构：${arch}`);
}

export function assertExactMacosArchitecture(lipoOutput, arch) {
  const expected = expectedMachOArchitecture(arch);
  const actual = lipoOutput.trim().replace(/\s+/gu, ' ');
  if (actual !== expected) {
    throw new Error(
      `Player 模板主可执行文件架构必须为 ${expected}，实际为 ${actual || '空'}`,
    );
  }
}

async function plistValue(plistPath, key) {
  return runChecked('plutil', ['-extract', key, 'raw', plistPath]);
}

export async function verifyGenericMacosPlayerTemplate({
  appPath,
  arch,
  version,
  rejectHardlinks = false,
}) {
  if (path.basename(appPath) !== GENERIC_PLAYER_ARTIFACT_ENTRY) {
    throw new Error(`模板应用必须命名为 ${GENERIC_PLAYER_ARTIFACT_ENTRY}`);
  }

  const resources = path.join(appPath, 'Contents', 'Resources');
  const plistPath = path.join(appPath, ...MACOS_INFO_PLIST_FILE.split('/'));
  await requireRegularFile(
    path.join(resources, 'app.asar'),
    '模板 app.asar',
    rejectHardlinks,
  );
  await requireRegularFile(plistPath, '模板 Info.plist', rejectHardlinks);
  if (existsSync(path.join(appPath, ...GAME_RESOURCE_DIRECTORY.split('/')))) {
    throw new Error('Player 模板不得预先包含 Contents/Resources/game');
  }
  if (existsSync(path.join(appPath, ...APPLICATION_METADATA_FILE.split('/')))) {
    throw new Error('Player 模板不得预先包含 vn-game-application.json');
  }

  const expectedPlist = new Map([
    ['CFBundleIdentifier', GENERIC_PLAYER_BUNDLE_ID],
    ['CFBundleName', GENERIC_PLAYER_NAME],
    ['CFBundleDisplayName', GENERIC_PLAYER_NAME],
    ['CFBundleExecutable', GENERIC_PLAYER_NAME],
    ['CFBundleShortVersionString', version],
    ['CFBundleVersion', version],
  ]);
  for (const [key, expected] of expectedPlist) {
    const actual = await plistValue(plistPath, key);
    if (actual !== expected) {
      throw new Error(`模板 Info.plist ${key} 必须为 ${expected}，实际为 ${actual}`);
    }
  }

  const executablePath = path.join(appPath, 'Contents', 'MacOS', GENERIC_PLAYER_NAME);
  await requireRegularFile(executablePath, '模板主可执行文件', rejectHardlinks);
  assertExactMacosArchitecture(runChecked('lipo', ['-archs', executablePath]), arch);
  runChecked('codesign', ['--verify', '--deep', '--strict', appPath]);
}
