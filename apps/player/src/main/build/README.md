# Player Build

[返回 Player Main](../README.md)

本目录定义单游戏桌面 Player 在 Electron Forge 构建时接受的元数据和嵌入内容边界。它把环境变量转换为规范化的产品名、语义版本、应用标识、图标路径和 Runtime Bundle 路径，并拒绝缺失、越界或平台不兼容的输入。

## 构建流程

[`playerBuildConfig.ts`](./playerBuildConfig.ts) 由 [`forge.config.ts`](../../../forge.config.ts) 使用。准备阶段先解析并校验配置，Forge 复制嵌入游戏后再调用 `verifyCopiedEmbeddedGame` 检查目标位置，确保发布包中的 `Resources/game` 与预期 Bundle 一致。通用 Player 没有嵌入内容时仍使用同一份基础 Forge 配置。

这里不负责生成游戏数据，也不自行修正非法配置。Editor/CI 应先产出通过严格验证的 Bundle，再把明确路径交给构建。修改规则后运行：

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerBuildConfig.test.ts
pnpm --dir apps/player typecheck
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`playerBuildConfig.ts`](./playerBuildConfig.ts) | TypeScript、Electron Forge | 校验产品名、版本、Bundle ID、图标和嵌入包 | `resolvePlayerBuildConfig`、`verifyCopiedEmbeddedGame` |
