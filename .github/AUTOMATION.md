# GitHub 自动化

[返回项目首页](../README.md)

本目录集中维护仓库在 GitHub 上执行的持续集成与发布自动化。它不参与 Editor 或 Player 的运行时逻辑，而是在代码进入主分支、生成正式安装包或构建独立游戏时，重新建立一条可审计的质量与供应链边界。

## 自动化边界

工作流以仓库中的锁定依赖、测试和发布脚本为唯一实现来源。Pull Request 与 `main` 使用跨平台内部质量门禁；Editor 1.0.1 另有一个无密钥、可人工调度并精确监听对应 release 分支与标签的 macOS arm64 / Windows x64 打包验证入口；正式 Player 只由受保护的 `player-v*` 标签触发；独立游戏则复用签名构建工作流，并在使用证书前验证调用方提供的 Runtime Bundle 与应用元数据。

Editor release 分支的普通运行会生成并回读平台 ZIP，再把精确候选目录作为 Actions artifact 保留 7 天。只有精确的 `editor-v1.0.1-internal.1` 标签运行会在双平台全绿后创建临时 Draft，重新下载并校验全部资产，最后发布为可见的 Pre-release 且不设为 Latest。macOS 内部包仅为 ad-hoc 签名，Windows 内部包未正式签名，两者仅供内测，不能冒充正式签名发行包。

GitHub Actions 中的第三方 Action 均固定到提交 SHA，签名材料只从受保护环境的 Secrets 注入。修改这里的文件时，应把它视为发布代码：避免宽泛权限、未校验的输入、可变版本标签和任何未签名的降级路径。

## 目录导航

| 子目录 | 框架 / 技术 | 主要作用 |
| --- | --- | --- |
| [`workflows/`](./workflows/README.md) | GitHub Actions | 持续集成、Editor 内部打包验证、签名游戏构建与 Player 正式发布。 |

## 修改与验证

- 先在对应应用目录运行工作流将执行的本地命令，避免把 CI 当作第一轮调试环境。
- 调整矩阵、权限、环境或签名步骤后，应检查 macOS、Windows 与 Linux 的路径和 Shell 差异；Editor 内部矩阵必须保持 macOS arm64 与 Windows x64 两个目标。
- 提交前运行 `git diff --check`，并在 Pull Request 中确认所有 `Internal <platform>-<arch>` 检查通过。
