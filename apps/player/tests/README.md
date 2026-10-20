# Player Tests

[中文](./README.md) | [English](./README.en.md)

[返回 Player](../README.md)

Player 测试分为两组：`unit` 使用 Vitest 覆盖应用代码，`scripts/tests` 使用 `node:test` 验证发布工具。`test` 命令依次运行两组。

安全测试优先使用临时目录、真实文件、哈希和流；界面测试通过注入 `PlayerGateway` 检查可见行为。新增用例应覆盖适用的成功、取消、拒绝、过期异步结果和跨游戏隔离场景。不要访问用户的真实存档、设置或签名密钥。

## 验证与运行

```bash
pnpm --dir apps/player test
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player test:release-tools
```

## 目录

- [`unit`](./unit/README.md)
- [`tests`](../scripts/tests/README.md)
