# Player Scripts

[返回 Player](../README.md)

构建与发布 CLI；所有路径、制品和签名数据在写入前经过严格校验。

这些脚本连接 Player 构建、单游戏嵌入、模板暂存、平台签名和发布集汇总。它们面向 CI 和可复现发布流程，不是通用文件操作工具：输入目录、目标平台、架构、哈希和签名材料都需要满足明确契约，异常输入应立即失败。

## 发布流程

单游戏桌面构建通常先验证环境与 Runtime Bundle，再准备嵌入资源并调用 Electron Forge。产物随后经过平台结构检查、可选签名、定位与归档，最后由收集和发布集脚本核对跨平台文件及收据。Web 流程独立构建静态 Player，将允许的 payload 和哈希清单暂存成模板，再由 Editor 写入游戏内容。

脚本应保持可组合：公共的路径、安全和发布规则放在 [`lib`](./lib/README.md)，顶层文件只负责解析当前命令的环境、组织步骤并设置退出状态。禁止通过宽松 glob、隐式当前目录或未经规范化的外部路径扩大读写范围。

## 开发与验证

发布工具有独立的 Node 测试，无需启动 Electron：

```bash
pnpm --dir apps/player test:release-tools
```

修改 Web 模板时还应运行 `pnpm --dir apps/player prepare:web-template`；修改桌面打包规则时，应配合相应 CI 验证命令检查真实 Forge 产物。密钥只通过 CI 环境和受限临时文件进入流程，不得写入仓库或测试夹具。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `lib` | Node.js ESM | 脚本共享验证、签名和平台策略 | [查看](./lib/README.md) |
| `tests` | node:test | 发布工具端到端测试 | [查看](./tests/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`archiveWindowsBuild.mjs`](./archiveWindowsBuild.mjs) | Node.js、PowerShell | 归档 Windows 构建 | `windowsArchiveInvocation`、`main` |
| [`collectPlayerArtifacts.mjs`](./collectPlayerArtifacts.mjs) | Node.js | 汇总平台制品和收据 | `collectArtifacts`、`main` |
| [`locatePlayerBuild.mjs`](./locatePlayerBuild.mjs) | Node.js | 定位唯一目标构建 | `locatePlayerBuild`、`main` |
| [`materializeSecretFile.mjs`](./materializeSecretFile.mjs) | Node.js | 安全还原 CI Base64 密钥 | `decodeCanonicalBase64`、`main` |
| [`prepareEmbeddedArtifact.mjs`](./prepareEmbeddedArtifact.mjs) | Node.js | 从制品准备嵌入游戏包 | `discoverBundles`、`main` |
| [`prepareEmbeddedFixture.mjs`](./prepareEmbeddedFixture.mjs) | Node.js | 准备嵌入式 CI 夹具 | `copyVerifiedDirectory`、`main` |
| [`runEditorWithPlayerTemplate.mjs`](./runEditorWithPlayerTemplate.mjs) | Node.js | 用模板启动 Editor 验证导出 | `runChecked`、`main` |
| [`signPlayerBuild.mjs`](./signPlayerBuild.mjs) | Electron 签名工具 | 平台 Player 签名 | `canonicalAppDirectory`、`main` |
| [`stagePlayerTemplate.mjs`](./stagePlayerTemplate.mjs) | Node.js | 暂存桌面 Player 模板 | `runChecked`、`main` |
| [`stageWebPlayerTemplate.mjs`](./stageWebPlayerTemplate.mjs) | Node.js、Vite | 暂存带哈希清单的 Web 模板 | `collectFiles`、`validatePayloadFiles`、`main` |
| [`strictVerifyRuntimeBundle.ts`](./strictVerifyRuntimeBundle.ts) | TypeScript、vite-node | 严格验证运行包 | `loadRuntimeBundle`、`main` |
| [`verifyGameBuildInputs.mjs`](./verifyGameBuildInputs.mjs) | Node.js | 校验单游戏构建输入 | `fail`、环境契约 |
| [`verifyPackagedEditorTemplate.mjs`](./verifyPackagedEditorTemplate.mjs) | Node.js | 检查 Editor 内置模板 | `oneEditorApp`、`requireRegularFile` |
| [`verifyPlayerBuild.mjs`](./verifyPlayerBuild.mjs) | Node.js | 验证 Player 构建 | `verifyPlayerBuild`、`main` |
| [`verifyReleasePrerequisites.mjs`](./verifyReleasePrerequisites.mjs) | Node.js | 检查发布工具和密钥 | `REQUIRED_SECRETS`、`main` |
| [`verifyReleaseSet.mjs`](./verifyReleaseSet.mjs) | Node.js | 验证跨平台发布集 | `verifyReleaseSet`、`main` |
