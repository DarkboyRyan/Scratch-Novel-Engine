# GitHub Actions 工作流

[返回 GitHub 自动化](../AUTOMATION.md)

这里定义 Scratch Novel Engine 的跨平台质量门禁与正式发布流水线。三个工作流共享同一原则：先验证源码、依赖和输入，再生成制品；内部构建、独立游戏与正式 Player 的签名等级和发布权限彼此隔离。

## 工作流关系

Pull Request、`main` push 或人工调度首先进入 `player-ci.yml`，在 macOS arm64、Windows x64 和 Linux x64 上执行 Runtime、Player、Editor 与 C++ 检查，并验证通用及嵌入式 Player 制品。`player-game-build.yml` 是供受信任调用方复用的独立游戏构建入口，它接收已经上传的 `.vngame`，再次验证后才注入 Player。`player-release.yml` 只响应 `player-v*` 标签，在受保护环境中完成预检、签名、公证、校验和与 GitHub Release 发布。

这三条路径会调用 [`../../apps/player/scripts/`](../../apps/player/scripts/README.md) 中的安全脚本，而不会在 YAML 中重复实现 Bundle、元数据或制品校验。任何脚本接口变更都应同步检查这里的参数和环境变量。

## 文件索引

| 文件 | 框架 / 技术 | 主要作用 | 关键实现 |
| --- | --- | --- | --- |
| [`player-ci.yml`](./player-ci.yml) | GitHub Actions、pnpm、CMake | PR 与 main 的跨平台内部质量门禁。 | Editor/Player/Runtime 测试、C++ CTest、Win/macOS/Linux 矩阵。 |
| [`player-game-build.yml`](./player-game-build.yml) | Reusable Workflow、Electron Forge | 将已验证 `.vngame` 注入并构建签名游戏应用。 | 输入校验、平台签名、artifact 发布。 |
| [`player-release.yml`](./player-release.yml) | GitHub Actions、GitHub Release | 从 `player-v*` tag 生成正式 Player 安装包。 | protected environment、签名、公证和不可变 Release。 |

## 安全约束

- `permissions` 保持最小化；只有实际发布步骤才能提升内容写入权限。
- 外部 Action 必须固定到完整提交 SHA，不能改成浮动 tag。
- Workflow 输入在进入 Shell、路径或应用元数据前必须由仓库脚本严格校验。
- 正式发布缺少证书、公证凭据或 GPG 材料时必须失败，不能生成未签名替代品。
- 临时证书、钥匙串和下载的 Bundle 只能放在 Runner 临时目录，不应写回工作区或上传为普通日志。

## 修改与验证

先按工作流顺序运行 Runtime、Player、Editor 和 C++ 的本地检查；涉及打包时再运行对应的 `package`、`make` 或脚本测试。Pull Request 中至少观察三平台内部矩阵，发布流程的改动还应通过人工触发或受保护环境中的候选演练验证，而不是直接用正式标签试错。
