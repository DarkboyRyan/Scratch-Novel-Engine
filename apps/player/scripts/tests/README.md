# Player Script Tests

[返回 Player Scripts](../README.md)

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`releaseTools.node-test.mjs`](./releaseTools.node-test.mjs) | node:test、ASAR | 覆盖运行包、模板、制品、发布集和防篡改规则 | 临时目录、真实文件与打包夹具 |
| [`webPlayerTemplate.node-test.mjs`](./webPlayerTemplate.node-test.mjs) | node:test | 覆盖 Web 模板暂存、哈希和目录所有权 | Vite 输出夹具、重复暂存与失败回滚 |
