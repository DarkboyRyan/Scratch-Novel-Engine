#!/usr/bin/env node

import filenamify from 'filenamify';

const productName = process.env.GAME_PRODUCT_NAME;
const version = process.env.GAME_VERSION;
const appBundleId = process.env.GAME_APP_BUNDLE_ID;
const artifactPrefix = process.env.GAME_ARTIFACT_PREFIX;

function fail(message) {
  throw new Error(message);
}

if (
  productName === undefined ||
  productName.length === 0 ||
  productName !== productName.normalize('NFC') ||
  productName !== productName.trim() ||
  Array.from(productName).length > 80 ||
  filenamify(productName, { replacement: '-' }) !== productName ||
  /[\u0000-\u001f\u007f<>:"/\\|?*]/u.test(productName) ||
  productName === '.' ||
  productName === '..' ||
  /[. ]$/u.test(productName) ||
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(productName)
) {
  fail('GAME_PRODUCT_NAME 不是安全的跨平台应用名称');
}
if (
  version === undefined ||
  version.length > 32 ||
  !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)
) {
  fail('GAME_VERSION 必须是 x.y.z 数字版本');
}
if (
  appBundleId === undefined ||
  appBundleId.length > 155 ||
  !/^[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*){2,}$/u.test(appBundleId)
) {
  fail('GAME_APP_BUNDLE_ID 必须是安全 reverse-DNS ID');
}
if (
  artifactPrefix === undefined ||
  !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(artifactPrefix)
) {
  fail('GAME_ARTIFACT_PREFIX 只能包含 1 到 64 个字母、数字、点、下划线或连字符');
}
process.stdout.write('独立游戏构建 metadata 输入有效\n');
