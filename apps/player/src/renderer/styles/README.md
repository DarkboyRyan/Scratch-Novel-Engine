# Player Styles

[返回 Player Renderer](../README.md)

`player.css` 是桌面与 Web Player 共用的视觉入口，覆盖启动状态、标题页、剧情舞台、对白/选项、CG、视频、操作栏、存读档与选项 Modal。共享 UI 组件只输出稳定 class，最终主题和宿主布局在这里统一，Editor 预览可在自己的样式作用域内复用组件而不继承整份 Player 外壳。

## 响应式策略

页面以深色中性主题和固定舞台层级为基础，通过 viewport、container query、`clamp()` 与低高度媒体查询适配桌面窗口和浏览器。标题页会等比缩放，长对白、长选项和存档列表使用可达滚动区域；顶部通知使用 safe-area，避免遮挡正文和暂停按钮。窗口尺寸预设同时设置字体缩放变量，使界面在不同 Player 尺寸中保持比例。

新增样式应复用现有颜色、圆角、间距和 z-index 层级，避免为单个组件重新引入主题。交互元素必须保留 `:focus-visible`，动画需要尊重 `prefers-reduced-motion`；窄屏和约 `800×500` 的低高度视口都应保持主要操作可见。

CSS 契约测试会保护关键 selector 和响应式规则：

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/titleModalStyle.test.ts \
  tests/unit/playerTypographyScale.test.ts \
  tests/unit/titleScreenAutoFit.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`player.css`](./player.css) | CSS、Container Queries | Player 全界面视觉与自适应 | 标题/舞台/对话框/存档/选项/CG、动画、reduced-motion |
