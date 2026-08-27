# Player Release Libraries

[返回 Player Scripts](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`macosPlayerTemplate.mjs`](./macosPlayerTemplate.mjs) | Node.js、macOS CLI | 校验 App 包、架构和签名信息 | `verifyGenericMacosPlayerTemplate`、`assertExactMacosArchitecture` |
| [`releaseTools.mjs`](./releaseTools.mjs) | Node.js、ASAR | 共享运行包、模板、制品和发布集校验 | `verifyRuntimeBundle`、`collectArtifacts`、`verifyReleaseSet` |
| [`signingPolicy.mjs`](./signingPolicy.mjs) | Electron Sign | 生成受限平台签名选项 | `macSignOptions`、`windowsSignOptions` |
| [`windowsPowerShellPolicy.mjs`](./windowsPowerShellPolicy.mjs) | PowerShell、Node.js | 固定 Windows 校验与归档命令 | 三个 `windows*Invocation` 工厂 |
