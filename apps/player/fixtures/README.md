# Player Fixtures

[返回 Player](../README.md)

存放自动化验证使用的只读示例数据。

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
