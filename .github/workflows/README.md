# GitHub Actions 工作流

[返回 GitHub 自动化](../AUTOMATION.md)

这里定义 Scratch Novel Engine 的跨平台质量门禁与正式发布流水线。四个工作流共享同一原则：先验证源码、依赖和输入，再生成制品；内部构建、独立游戏与正式 Player 的签名等级和发布权限彼此隔离。

## 工作流关系

Pull Request、`main` push 或人工调度首先进入 `player-ci.yml`，在 macOS arm64、Windows x64 和 Linux x64 上执行 Runtime、Player、Editor 与 C++ 检查，并验证通用及嵌入式 Player 制品。`editor-ci.yml` 接受人工调度，并为初次交付精确监听 `feature/editor-release` 分支 push；它在 macOS arm64 与 Windows x64 原生 Runner 上重新执行测试、构建 C++ 后端和同平台 Player 模板，再完成 Editor 打包、内部签名分类、ZIP 回读与 SHA-256 校验，最后把已验证候选短期上传为 Actions artifact。

只有 `feature/editor-release` 的 push 提交信息显式包含 `[editor-draft-release]`，且两个原生平台任务全部成功时，工作流才会把同一运行中的候选重新合并校验，并创建内部 Draft Release。该路径要求预先存在一个精确指向该提交的轻量标签 `editor-v<版本>-internal.1`；Draft 同时标记为 Pre-release、明确 `make_latest=false`，上传后重新下载并逐文件核对 SHA-256，永远不会自动改为公开状态。

`player-game-build.yml` 是供受信任调用方复用的独立游戏构建入口，它接收已经上传的 `.vngame`，再次验证后才注入 Player。`player-release.yml` 只响应 `player-v*` 标签，在受保护环境中完成预检、签名、公证、校验和与 GitHub Release 发布。

这些路径会调用 [`../../apps/player/scripts/`](../../apps/player/scripts/README.md) 与 [`../../apps/editor/scripts/`](../../apps/editor/scripts/README.md) 中的安全脚本，而不会在 YAML 中重复实现 Bundle、元数据或制品校验。任何脚本接口变更都应同步检查这里的参数和环境变量。

## 文件索引

| 文件 | 框架 / 技术 | 主要作用 | 关键实现 |
| --- | --- | --- | --- |
| [`player-ci.yml`](./player-ci.yml) | GitHub Actions、pnpm、CMake | PR 与 main 的跨平台内部质量门禁。 | Editor/Player/Runtime 测试、C++ CTest、Win/macOS/Linux 矩阵。 |
| [`editor-ci.yml`](./editor-ci.yml) | GitHub Actions、Electron Forge、CMake、GitHub Releases API | 受控执行的 Editor 双平台内部打包验证。 | macOS arm64 / Windows x64、无 Secrets、ZIP 原生回读、7 天 artifact；一次性提交标记可生成非公开 Draft。 |
| [`player-game-build.yml`](./player-game-build.yml) | Reusable Workflow、Electron Forge | 将已验证 `.vngame` 注入并构建签名游戏应用。 | 输入校验、平台签名、artifact 发布。 |
| [`player-release.yml`](./player-release.yml) | GitHub Actions、GitHub Release | 从 `player-v*` tag 生成正式 Player 安装包。 | protected environment、签名、公证和不可变 Release。 |

## 安全约束

- `permissions` 保持最小化；只有实际发布步骤才能提升内容写入权限。
- 外部 Action 必须固定到完整提交 SHA，不能改成浮动 tag。
- Workflow 输入在进入 Shell、路径或应用元数据前必须由仓库脚本严格校验。
- `editor-ci.yml` 不读取签名 Secrets；macOS ad-hoc 与 Windows unsigned-or-unverified 只代表内部校验分类，不能降级冒充正式签名。
- Editor 工作流只上传经过完整回读的 internal 候选目录。普通运行仅保留 7 天 artifact；显式授权的 `[editor-draft-release]` 提交可创建 Draft，但不得执行 `draft=false`、设为 Latest 或合并 `main`。
- 正式发布缺少证书、公证凭据或 GPG 材料时必须失败，不能生成未签名替代品。
- 临时证书、钥匙串和下载的 Bundle 只能放在 Runner 临时目录，不应写回工作区或上传为普通日志。

## 修改与验证

先按工作流顺序运行 Runtime、Player、Editor 和 C++ 的本地检查；涉及 Editor 打包时还应运行 `pnpm --dir apps/editor test:release-tools`。Pull Request 中至少观察三平台内部矩阵；Editor 原生包边界可运行 `editor-ci.yml`，其成功会留下保留 7 天的 internal artifact，但不代表正式签名发行。Draft Release 只供拥有 push 权限的可信协作者下载；普通测试者仍应使用另行授权的 Pre-release 或具备仓库读取权限的 Actions artifact。正式 Player 发布流程的改动应通过受保护环境中的候选演练验证，而不是直接用正式标签试错。
