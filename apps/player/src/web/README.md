# Web Player

[中文](./README.md) | [English](./README.en.md)

[返回 Player Source](../README.md)

Web Player 是随导出游戏部署的静态宿主，复用 Renderer 和共享 UI，以 Fetch 读取同源内容、IndexedDB 保存进度和设置、Fullscreen API 控制全屏。

启动时读取 `web-export.json`，再加载 `game/<build-id>/` 中的运行包。Loader 校验来源、重定向、大小、UTF-8、版本、构建标识和资源清单，资源 URL 不能逃离同源游戏目录。Web 版仅运行嵌入游戏，不支持本地选包或调整系统窗口；退出会重新加载页面。

存档按项目 ID、Runtime 版本和内容指纹隔离。通用设置全局保存，玩家明确选择的语言按项目 ID 与包默认语言保存；旧全局语言不会覆盖新包默认值。默认语言来源下的全屏或音量更新也不会固化语言。

部署必须使用 HTTP(S)，不能直接打开 `file://`。保持描述文件、游戏目录和模板资源的相对位置，不要混合多个导出包。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/webBundleLoader.test.ts \
  tests/unit/webPlayerGateway.test.ts \
  tests/unit/webStorage.test.ts
pnpm --dir apps/player prepare:web-template
```

## 主要文件

- [`WebBundleLoader.ts`](./WebBundleLoader.ts)
- [`WebPlayerGateway.ts`](./WebPlayerGateway.ts)
- [`WebStorage.ts`](./WebStorage.ts)
- [`index.html`](./index.html)
- [`index.tsx`](./index.tsx)
