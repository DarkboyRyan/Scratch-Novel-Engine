# Editor 测试

Vitest 测试按运行边界分层：单元测试快速验证模块行为，集成测试验证真实后端和 Player 契约。

| 目录 | 框架技术 | 主要作用 |
| --- | --- | --- |
| [`unit/`](./unit/README.md) | Vitest、Testing Library、JSDOM | 覆盖 Main、Preload、Renderer 和 Blockly 的局部行为。 |
| [`integration/`](./integration/README.md) | Vitest、C++ 子进程 | 验证跨语言协议与 Editor → Player 兼容性。 |
