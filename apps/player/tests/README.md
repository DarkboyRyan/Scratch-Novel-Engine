# Player Tests

[返回 Player](../README.md)

Player 测试按运行环境分成两组：[`unit`](./unit/README.md) 使用 Vitest 覆盖 TypeScript、React、Electron mock、真实临时文件和浏览器 API；[`../scripts/tests`](../scripts/tests/README.md) 使用 `node:test` 覆盖发布工具与真实制品结构。`pnpm --dir apps/player test` 会依次运行两组。

## 测试原则

安全边界测试优先使用真实文件、目录、符号链接、哈希和流，而不是只断言 mock 调用。Renderer 测试通过注入 `PlayerGateway` 驱动用户可见流程，避免依赖真实 Electron；Web 测试使用内存文档库或浏览器 API mock，仍需保留与桌面相同的协议结果。

新增功能至少需要覆盖成功、取消或拒绝、过期异步结果以及跨游戏/跨窗口隔离中适用的部分。CSS 契约测试用于保护关键可访问性和自适应规则，但不能代替组件交互测试。

常用命令：

```bash
pnpm --dir apps/player test
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player test:release-tools
```

测试数据应创建在测试提供的临时目录并在结束时清理，不要读取用户真实存档、设置、游戏目录或签名密钥。

## 子目录

| 目录 | 框架技术 | 主要作用 | 跳转 |
| --- | --- | --- | --- |
| `unit` | Vitest、jsdom | Player 功能、协议、安全与界面回归测试 | [查看](./unit/README.md) |
