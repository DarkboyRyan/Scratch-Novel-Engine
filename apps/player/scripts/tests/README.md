# Player Script Tests

[返回 Player Scripts](../README.md)

本目录验证发布工具的真实文件行为。测试使用 Node 内置测试运行器、临时目录和小型制品结构，覆盖正常发布、内容篡改、重复暂存、失败回滚以及平台元数据不一致，不依赖 Electron Renderer 或 jsdom。

`releaseTools.node-test.mjs` 关注桌面模板、Runtime Bundle、ASAR、制品与发布集；`webPlayerTemplate.node-test.mjs` 关注 Web payload 白名单、哈希清单和暂存目录所有权。新增发布规则时，应在对应文件中同时加入成功与拒绝路径，避免只验证 happy path。

从仓库根目录运行：

```bash
pnpm --dir apps/player test:release-tools
```

测试只能在系统临时目录创建数据，不应读取开发者本机的真实构建或签名材料。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`releaseTools.node-test.mjs`](./releaseTools.node-test.mjs) | node:test、ASAR | 覆盖运行包、模板、制品、发布集和防篡改规则 | 临时目录、真实文件与打包夹具 |
| [`webPlayerTemplate.node-test.mjs`](./webPlayerTemplate.node-test.mjs) | node:test | 覆盖 Web 模板暂存、哈希和目录所有权 | Vite 输出夹具、重复暂存与失败回滚 |
