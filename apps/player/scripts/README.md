# Player Scripts

[返回 Player](../README.md)

构建与发布 CLI；所有路径、制品和签名数据在写入前经过严格校验。

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
