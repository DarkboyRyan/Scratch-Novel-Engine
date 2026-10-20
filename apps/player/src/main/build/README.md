# Player Build

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

本目录将单游戏桌面构建的环境变量转换为产品名、版本、应用标识、图标及运行包路径，拒绝缺失、越界或平台不兼容的输入。

Electron Forge 使用 `playerBuildConfig.ts` 解析配置，并在复制嵌入游戏后校验 `Resources/game` 与预期一致。通用 Player 复用同一基础配置。这里不生成游戏数据或自动修正非法输入；Editor 或 CI 应先提供通过验证的运行包。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerBuildConfig.test.ts
pnpm --dir apps/player typecheck
```

## 主要文件

- [`playerBuildConfig.ts`](./playerBuildConfig.ts)
