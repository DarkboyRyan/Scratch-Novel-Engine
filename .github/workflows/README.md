# GitHub Actions 工作流

| 文件 | 框架 / 技术 | 主要作用 | 关键实现 |
| --- | --- | --- | --- |
| [`player-ci.yml`](./player-ci.yml) | GitHub Actions、pnpm、CMake | PR 与 main 的跨平台内部质量门禁。 | Editor/Player/Runtime 测试、C++ CTest、Win/macOS/Linux 矩阵。 |
| [`player-game-build.yml`](./player-game-build.yml) | Reusable Workflow、Electron Forge | 将已验证 `.vngame` 注入并构建签名游戏应用。 | 输入校验、平台签名、artifact 发布。 |
| [`player-release.yml`](./player-release.yml) | GitHub Actions、GitHub Release | 从 `player-v*` tag 生成正式 Player 安装包。 | protected environment、签名、公证和不可变 Release。 |

