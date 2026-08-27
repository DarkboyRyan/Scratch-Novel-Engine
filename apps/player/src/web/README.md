# Web Player

[返回 Player Source](../README.md)

使用浏览器原生能力实现与桌面 Player 相同的 Gateway。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`WebBundleLoader.ts`](./WebBundleLoader.ts) | Fetch、Web Crypto | 受限拉取并校验静态运行包 | `loadWebBundle`、大小限制、SHA-256 |
| [`WebPlayerGateway.ts`](./WebPlayerGateway.ts) | Browser APIs | 实现加载、存档、设置、全屏和媒体端口 | `WebPlayerGateway`、`webPlayerGateway` |
| [`WebStorage.ts`](./WebStorage.ts) | IndexedDB | 持久化 Web 设置和版本化存档 | `IndexedDbDocumentStore`、`WebPlayerStorage` |
| [`index.html`](./index.html) | HTML、CSP | Web Player 安全页面容器 | `#root`、模块入口 |
| [`index.tsx`](./index.tsx) | ReactDOM | Web Player 启动入口 | `createRoot`、Web Gateway 注入 |
