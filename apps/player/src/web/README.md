# Web Player

[返回 Player Source](../README.md)

使用浏览器原生能力实现与桌面 Player 相同的 Gateway。

Web Player 是随 Web 导出包部署的静态宿主。它复用桌面 Renderer 与 `@vnengine/player-ui`，但不需要 Electron：内容来自同源 HTTP(S)，存档和设置进入当前浏览器的 IndexedDB，全屏使用标准 Fullscreen API。

## 启动与内容加载

`index.tsx` 创建 React 根节点并把 `webPlayerGateway` 注入 `App`。Gateway 首次使用时通过 `WebBundleLoader` 读取根目录的 `web-export.json`，再定位 `game/<build-id>/game.json` 和 `manifest.json`。Loader 限制协议、重定向来源、文档大小和 UTF-8，调用共享 Runtime Schema，并核对描述文件中的版本/build ID；资源 URL 只从已验证清单生成，且不能逃离同源游戏目录。

Web 导出是嵌入式单游戏模式，因此 `openGame` 明确拒绝本地选包，“退出”会重新加载页面。浏览器可用时提供全屏，但 `windowSizeControlsEnabled` 始终为 false，因为网页不能调整操作系统窗口。

## 存储与部署约束

`WebStorage` 以项目 ID、Runtime 版本和 `game.json` 内容指纹隔离存档，恢复时重新校验快照与资源引用。设置支持旧版本迁移；全屏状态以浏览器当前状态为准，并通过串行队列写回 IndexedDB。

Web Player 必须由 HTTP 或 HTTPS 静态服务器提供，直接打开 `file://` 不受支持。部署时需保持 `web-export.json`、带 build ID 的游戏目录和模板资源相对关系，不要把多个导出的 payload 手工混合。验证命令：

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/webBundleLoader.test.ts \
  tests/unit/webPlayerGateway.test.ts \
  tests/unit/webStorage.test.ts
pnpm --dir apps/player prepare:web-template
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`WebBundleLoader.ts`](./WebBundleLoader.ts) | Fetch、Web Crypto | 受限拉取并校验静态运行包 | `loadWebBundle`、大小限制、SHA-256 |
| [`WebPlayerGateway.ts`](./WebPlayerGateway.ts) | Browser APIs | 实现加载、存档、设置、全屏和媒体端口 | `WebPlayerGateway`、`webPlayerGateway` |
| [`WebStorage.ts`](./WebStorage.ts) | IndexedDB | 持久化 Web 设置和版本化存档 | `IndexedDbDocumentStore`、`WebPlayerStorage` |
| [`index.html`](./index.html) | HTML、CSP | Web Player 安全页面容器 | `#root`、模块入口 |
| [`index.tsx`](./index.tsx) | ReactDOM | Web Player 启动入口 | `createRoot`、Web Gateway 注入 |
