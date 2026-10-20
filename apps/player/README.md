# Scratch Novel Engine Player

[中文](./README.md) | [English](./README.en.md)

[返回应用目录](../README.md)

Scratch Novel Engine Player 包含 Electron 桌面宿主和 Web Player，用于加载导出游戏、播放剧情、保存进度和制作发布模板。桌面版支持打开外部 `.vngame` 目录或嵌入单个游戏；Web 版从同源静态站点读取游戏。两者共用 React 界面、Runtime 和组件库。

桌面版由 Main、Preload 和 Renderer 组成：Main 管理文件、窗口、存档和媒体，Preload 仅暴露白名单 API，Renderer 通过 `PlayerGateway` 使用这些能力。Web 使用同一接口，改由 Fetch、IndexedDB 和 Fullscreen API 实现，不支持本地选包或调整系统窗口尺寸。

当前支持 Runtime v1–v13。旧包会补齐图片缩放、默认语言及标题页/CG 样式；有玩家语言偏好时按宿主的存储规则应用，否则使用包默认语言。语言设置只影响播放器界面，作者文本保持原文。媒体使用受控 URL，存档使用版本化 Runtime 快照。

以下命令均从仓库根目录运行。`start` 使用 `fixtures/game` 开发夹具；`prepare:web-template` 构建供 Editor 导出使用的 Web 模板。`.vite/`、`dist/`、`out/` 和 `node_modules/` 由工具生成，无需手工维护。

## 验证与运行

```bash
pnpm --dir apps/player start
pnpm --dir apps/player test
pnpm --dir apps/player typecheck
pnpm --dir apps/player lint
pnpm --dir apps/player prepare:web-template
```

## 目录

- [`src`](./src/README.md)
- [`scripts`](./scripts/README.md)
- [`tests`](./tests/README.md)
- [`fixtures`](./fixtures/README.md)

## 主要文件

- [`fixtures/game`](./fixtures/game/)
- [`.eslintrc.json`](./.eslintrc.json)
- [`forge.config.ts`](./forge.config.ts)
- [`forge.env.d.ts`](./forge.env.d.ts)
- [`index.html`](./index.html)
- [`package.json`](./package.json)
- [`tsconfig.json`](./tsconfig.json)
- [`vite.main.config.ts`](./vite.main.config.ts)
- [`vite.preload.config.ts`](./vite.preload.config.ts)
- [`vite.renderer.config.ts`](./vite.renderer.config.ts)
- [`vite.web.config.ts`](./vite.web.config.ts)
