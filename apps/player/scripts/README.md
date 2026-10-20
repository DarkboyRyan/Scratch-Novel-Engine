# Player Scripts

[中文](./README.md) | [English](./README.en.md)

[返回 Player](../README.md)

构建与发布脚本负责单游戏嵌入、模板暂存、平台签名和制品校验。桌面流程先验证输入与运行包，再调用 Electron Forge，最后检查、签名并汇总制品；Web 流程单独构建静态模板与哈希清单。

公共路径、安全和平台规则放在 `lib`，顶层脚本负责组织步骤与返回退出状态。输入路径必须规范化并限制范围，不能用宽松 glob 或隐式当前目录扩大读写范围。密钥仅通过 CI 环境和受限临时文件传入，不写入仓库或测试夹具。

发布工具测试无需启动 Electron。修改 Web 模板后，还应运行 `pnpm --dir apps/player prepare:web-template`；修改桌面打包规则后，应验证实际 Forge 产物。

## 验证与运行

```bash
pnpm --dir apps/player test:release-tools
```

## 目录

- [`lib`](./lib/README.md)
- [`tests`](./tests/README.md)

## 主要文件

- [`archiveWindowsBuild.mjs`](./archiveWindowsBuild.mjs)
- [`collectPlayerArtifacts.mjs`](./collectPlayerArtifacts.mjs)
- [`locatePlayerBuild.mjs`](./locatePlayerBuild.mjs)
- [`materializeSecretFile.mjs`](./materializeSecretFile.mjs)
- [`prepareEmbeddedArtifact.mjs`](./prepareEmbeddedArtifact.mjs)
- [`prepareEmbeddedFixture.mjs`](./prepareEmbeddedFixture.mjs)
- [`runEditorWithPlayerTemplate.mjs`](./runEditorWithPlayerTemplate.mjs)
- [`signPlayerBuild.mjs`](./signPlayerBuild.mjs)
- [`stagePlayerTemplate.mjs`](./stagePlayerTemplate.mjs)
- [`stageWebPlayerTemplate.mjs`](./stageWebPlayerTemplate.mjs)
- [`strictVerifyRuntimeBundle.ts`](./strictVerifyRuntimeBundle.ts)
- [`verifyGameBuildInputs.mjs`](./verifyGameBuildInputs.mjs)
- [`verifyPackagedEditorTemplate.mjs`](./verifyPackagedEditorTemplate.mjs)
- [`verifyPlayerBuild.mjs`](./verifyPlayerBuild.mjs)
- [`verifyReleasePrerequisites.mjs`](./verifyReleasePrerequisites.mjs)
- [`verifyReleaseSet.mjs`](./verifyReleaseSet.mjs)
