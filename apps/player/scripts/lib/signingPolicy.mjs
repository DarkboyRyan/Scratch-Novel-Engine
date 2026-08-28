/**
 * 主要作用：集中生成 macOS 与 Windows 的受限签名参数。
 * 关键函数与实现：`macSignOptions`、`windowsSignOptions`；基于 Node.js ESM、文件系统和受限子进程完成确定性 CLI 流程。
 */
export function macSignOptions({ app, identity, keychain }) {
  return {
    app,
    identity,
    keychain,
    platform: 'darwin',
    type: 'distribution',
    identityValidation: true,
    // @electron/osx-sign 1.3.3 applies hardenedRuntime through the per-file
    // options callback. A top-level hardenedRuntime property is ignored.
    optionsForFile: () => ({ hardenedRuntime: true }),
  };
}

export function windowsSignOptions({
  appDirectory,
  certificateFile,
  certificatePassword,
  description = 'VN Engine Player',
}) {
  return {
    appDirectory,
    certificateFile,
    certificatePassword,
    hashes: ['sha256'],
    description,
  };
}
