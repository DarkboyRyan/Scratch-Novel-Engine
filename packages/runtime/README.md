# Runtime

[返回 Shared Packages](../README.md)

平台无关的视觉小说执行核心；不依赖 Electron、DOM 或具体存储。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `src` | TypeScript | 项目类型、剧情执行、逻辑和快照 | [查看](./src/README.md) |
| `tests` | Vitest | Runtime 合同和版本兼容测试 | [查看](./tests/README.md) |

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`package.json`](./package.json) | pnpm Workspace | Runtime 包入口和测试命令 | `exports`、`typecheck`、`test` |
| [`tsconfig.json`](./tsconfig.json) | TypeScript | Runtime 源码编译设置 | 严格模式、源码边界 |
| [`tsconfig.test.json`](./tsconfig.test.json) | TypeScript | Runtime 测试编译设置 | 测试类型与文件范围 |
