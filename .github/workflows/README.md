# GitHub Actions 工作流

**中文** | [English](./README.en.md)

这里定义跨平台检查、独立游戏构建和应用发布流程。

| 工作流 | 用途 |
| --- | --- |
| [editor-release.yml](./editor-release.yml) | 根据 `editor-v*-mac` / `editor-v*-windows` 标签构建 Editor，校验资源并创建预发布草稿；支持手动构建 |
| [player-ci.yml](./player-ci.yml) | 在 PR、main 推送或手动触发时，执行 macOS、Windows、Linux 的 Runtime、Player、Editor 与 C++ 检查 |
| [player-game-build.yml](./player-game-build.yml) | 供受信任调用方复用，校验 `.vngame` 后将其注入 Player 并构建独立游戏 |
| [player-release.yml](./player-release.yml) | 根据 `player-v*` 标签，在受保护环境中签名、公证并发布 Player |

内容包与制品校验统一使用 [Player 脚本](../../apps/player/scripts/README.md)。修改脚本接口时，同步检查工作流参数和环境变量。

## 修改与验证

- 权限按需授予；外部 Action 固定到完整提交 SHA。
- 工作流输入须经仓库脚本校验后才能用于 Shell、路径或应用元数据。
- 正式发布缺少签名、公证或 GPG 材料时应失败；临时证书、钥匙串和内容包仅保存在 Runner 临时目录。
- 先运行相关模块的本地检查，再验证三平台 CI。发布改动通过手动构建或候选演练验证。

[自动化说明](../AUTOMATION.md) · [Editor 发布步骤](../../docs/editor-release.md)
