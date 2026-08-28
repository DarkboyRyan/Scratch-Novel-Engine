# Player Release Libraries

[返回 Player Scripts](../README.md)

这里集中存放发布脚本共用的纯校验与平台策略。顶层 CLI 负责取得环境输入和报告结果，本目录负责回答“某个 Bundle、模板、产物或签名配置是否可信”，从而让本地执行和 CI 使用相同规则。

## 设计边界

`releaseTools.mjs` 是跨平台核心，处理 Runtime Bundle、文件哈希、模板所有权、制品收据和发布集一致性；平台文件只封装不可移植的细节。macOS 校验关注 `.app` 结构、架构和签名，Windows 策略以固定参数数组生成 PowerShell 调用，签名策略只返回被允许的 Electron 签名配置。

所有导出函数都应先规范化并约束路径，再读取或写入数据。不要把 shell 字符串拼接、宽松的额外文件容忍或秘密值日志带入这里。新增规则需要同时覆盖成功、篡改和路径逃逸场景。

## 验证

```bash
pnpm --dir apps/player test:release-tools
```

测试会使用临时目录和真实 ASAR/模板结构验证这些库；无需手动调用内部模块。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`macosPlayerTemplate.mjs`](./macosPlayerTemplate.mjs) | Node.js、macOS CLI | 校验 App 包、架构和签名信息 | `verifyGenericMacosPlayerTemplate`、`assertExactMacosArchitecture` |
| [`releaseTools.mjs`](./releaseTools.mjs) | Node.js、ASAR | 共享运行包、模板、制品和发布集校验 | `verifyRuntimeBundle`、`collectArtifacts`、`verifyReleaseSet` |
| [`signingPolicy.mjs`](./signingPolicy.mjs) | Electron Sign | 生成受限平台签名选项 | `macSignOptions`、`windowsSignOptions` |
| [`windowsPowerShellPolicy.mjs`](./windowsPowerShellPolicy.mjs) | PowerShell、Node.js | 固定 Windows 校验与归档命令 | 签名、元数据、兼容归档与标准 ZIP 的 `windows*Invocation` 工厂 |
