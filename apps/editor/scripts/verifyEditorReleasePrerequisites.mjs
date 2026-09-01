#!/usr/bin/env node
/**
 * 主要作用：在 Editor 双平台构建前验证版本、标签、提交及正式签名凭据。
 * 关键函数与实现：validateEditorReleasePrerequisites、main；internal 明确不要求证书，release 禁止无签名回退。
 */
import { constants as fsConstants } from 'node:fs';
import { access, appendFile, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

function commandOptions() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      package: { type: 'string' },
      classification: { type: 'string' },
      commit: { type: 'string' },
      tag: { type: 'string' },
      'github-output': { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  if (positionals.length !== 0) {
    throw new Error('不接受位置参数');
  }
  return values;
}

function requiredOption(values, name) {
  const value = values[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`缺少 --${name}`);
  }
  return value;
}

function enumOption(values, name, allowed) {
  const value = requiredOption(values, name);
  if (!allowed.includes(value)) {
    throw new Error(`--${name} 必须是 ${allowed.join('、')}`);
  }
  return value;
}

function validateVersion(value, context) {
  if (
    typeof value !== 'string' ||
    value.length > 32 ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value)
  ) {
    throw new Error(`${context} 必须是 x.y.z 数字版本`);
  }
  return value;
}

function validateCommit(value, classification) {
  if (
    !/^[a-f0-9]{40}$/u.test(value) &&
    !(classification === 'internal' && value === 'local')
  ) {
    throw new Error('提交必须是 40 位小写 Git SHA；internal 可使用 local');
  }
}

async function assertReadablePackage(filePath) {
  await access(filePath, fsConstants.R_OK);
  const status = await lstat(filePath);
  if (
    status.isSymbolicLink() ||
    !status.isFile() ||
    status.nlink !== 1 ||
    status.size <= 0 ||
    status.size > 1024 * 1024
  ) {
    throw new Error('Editor package.json 必须是非链接普通文件');
  }
}

export const EDITOR_RELEASE_REQUIRED_SECRETS = [
  'MACOS_CERTIFICATE_BASE64',
  'MACOS_CERTIFICATE_PASSWORD',
  'MACOS_SIGNING_IDENTITY',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID',
  'WINDOWS_CERTIFICATE_BASE64',
  'WINDOWS_CERTIFICATE_PASSWORD',
];

export function validateEditorReleasePrerequisites({
  packageDocument,
  classification,
  commit,
  tag,
  environment = process.env,
}) {
  if (
    !packageDocument ||
    packageDocument.name !== 'editor' ||
    packageDocument.productName !== 'VN Engine Editor'
  ) {
    throw new Error('Editor package.json 的名称或产品名无效');
  }
  const version = validateVersion(packageDocument.version, 'Editor package 版本');
  validateCommit(commit, classification);
  const expectedTag = `editor-v${version}`;
  if (classification === 'release' && tag !== expectedTag) {
    throw new Error(`正式 Editor 发布标签必须精确为 ${expectedTag}`);
  }
  if (tag !== undefined && tag !== '' && tag !== expectedTag) {
    throw new Error(`Editor 发布标签必须精确为 ${expectedTag}`);
  }
  if (classification === 'release') {
    const missing = EDITOR_RELEASE_REQUIRED_SECRETS.filter((name) => {
      const value = environment[name];
      return value === undefined || value.trim() === '';
    });
    if (missing.length !== 0) {
      throw new Error(
        `未创建正式 Editor 发布：缺少 ${missing.join(', ')}；禁止无签名回退`,
      );
    }
  }
  return { version, classification, commit, tag: tag ?? '' };
}

async function main() {
  const values = commandOptions();
  const packagePath = path.resolve(requiredOption(values, 'package'));
  await assertReadablePackage(packagePath);
  const result = validateEditorReleasePrerequisites({
    packageDocument: JSON.parse(await readFile(packagePath, 'utf8')),
    classification: enumOption(
      values,
      'classification',
      ['internal', 'release'],
    ),
    commit: requiredOption(values, 'commit'),
    tag: values.tag,
  });
  if (typeof values['github-output'] === 'string' && values['github-output'] !== '') {
    await appendFile(
      values['github-output'],
      `version=${result.version}\nclassification=${result.classification}\ncommit=${result.commit}\ntag=${result.tag}\n`,
      'utf8',
    );
  }
  process.stdout.write(
    `Editor ${result.classification} 构建预检通过：${result.version}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
