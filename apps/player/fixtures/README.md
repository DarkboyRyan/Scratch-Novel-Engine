# Player Fixtures

[返回 Player](../README.md)

存放自动化验证使用的只读示例数据。

这里的 `game/` 是一份刻意保持最小的严格 Runtime Bundle，用于桌面开发启动、构建校验和发布脚本测试。它不是演示工程，也不用于保存人工测试进度；夹具的目标是让内容加载链路拥有稳定、可重复的输入。

## 使用约束

加载器会核对 `game.json`、`manifest.json`、运行时版本和资源清单。`game/` 内只能出现 Manifest 允许的文件，因此不要在该目录中补 README、截图或临时资源；本说明放在上一级正是为了保持运行包严格合法。若新增资源，必须同时补齐 Manifest 元数据并通过 Player 的运行包验证测试。

运行完整 Player 测试即可验证夹具仍可加载：

```bash
pnpm --dir apps/player test
```

## 数据目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `game` | Runtime JSON | 最小可加载游戏与资源清单 | [浏览文件](./game/) |

## 运行包文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`game/game.json`](./game/game.json) | Runtime JSON | 定义最小游戏、入口场景与剧情节点 | `game`、`scenes`、版本字段 |
| [`game/manifest.json`](./game/manifest.json) | Runtime Manifest | 描述运行包身份与资源清单 | `projectId`、`runtimeVersion`、`assets` |

> `game/` 是严格校验的运行包夹具，只能包含 Manifest 允许的文件，因此不在包内放置 README。
