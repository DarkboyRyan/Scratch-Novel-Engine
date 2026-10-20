# Player Fixtures

[中文](./README.md) | [English](./README.en.md)

[返回 Player](../README.md)

`game/` 是桌面开发启动、构建验证和发布工具测试共用的最小运行包。它提供稳定的测试输入，不作为演示工程或人工存档目录。

加载器严格检查 `game.json`、`manifest.json`、版本和资源清单。包内只能包含 Manifest 允许的文件，因此 README、截图和临时文件应留在包外。新增资源时必须同步清单元数据，并运行 Player 测试。

## 验证与运行

```bash
pnpm --dir apps/player test
```

## 主要文件

- [浏览文件](./game/)
- [`game/game.json`](./game/game.json)
- [`game/manifest.json`](./game/manifest.json)
