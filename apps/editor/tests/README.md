# Editor 测试

[返回 Editor](../README.md)

Editor 测试按运行边界分为快速的单元/轻量交互测试和需要真实 C++ 后端的集成测试。大部分用例由 Vitest 执行，React 交互使用 Testing Library 与 JSDOM，跨语言和导出兼容性则保留在 Integration 层。

## 测试流向

1. [`unit/`](./unit/README.md) 直接导入 Main、Preload、Renderer 或 Blockly 模块，隔离验证成功、失败与边界场景。
2. [`integration/`](./integration/README.md) 构建并启动真实后端，或把 Editor 产物交给 Player Loader 回读。
3. CI 先完成静态检查和 C++ 构建，再组合执行这些测试，确保局部行为与跨组件契约同时成立。

| 目录 | 框架技术 | 主要作用 |
| --- | --- | --- |
| [`unit/`](./unit/README.md) | Vitest、Testing Library、JSDOM | 覆盖 Main、Preload、Renderer 和 Blockly 的局部行为。 |
| [`integration/`](./integration/README.md) | Vitest、C++ 子进程 | 验证跨语言协议与 Editor → Player 兼容性。 |

## 开发与验证

- 修复缺陷时优先在最小层增加回归用例；只有依赖真实进程、文件发布或跨应用契约时才放入 Integration。
- `pnpm --dir apps/editor exec vitest run tests/unit/<file>.test.ts` 可定向运行，`pnpm --dir apps/editor test:watch` 适合本地迭代。
- 完整 `pnpm --dir apps/editor test` 会先构建并测试 C++ 后端，再运行所有 Vitest；仅集成层可用 `pnpm --dir apps/editor test:integration`。
