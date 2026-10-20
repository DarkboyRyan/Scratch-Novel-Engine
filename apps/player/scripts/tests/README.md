# Player Script Tests

[中文](./README.md) | [English](./README.en.md)

[返回 Player Scripts](../README.md)

这些 `node:test` 用例使用临时目录和小型制品，验证发布工具的文件行为，无需 Electron 或 jsdom。`releaseTools.node-test.mjs` 覆盖桌面模板、运行包、ASAR 和发布集；`webPlayerTemplate.node-test.mjs` 覆盖 Web 文件白名单、哈希和暂存目录所有权。

新增规则应同时覆盖成功和拒绝路径，包括内容篡改、重复暂存、回滚及平台元数据不一致。测试数据只写入临时目录，不使用本机真实构建或签名材料。

## 验证与运行

```bash
pnpm --dir apps/player test:release-tools
```

## 主要文件

- [`releaseTools.node-test.mjs`](./releaseTools.node-test.mjs)
- [`webPlayerTemplate.node-test.mjs`](./webPlayerTemplate.node-test.mjs)
