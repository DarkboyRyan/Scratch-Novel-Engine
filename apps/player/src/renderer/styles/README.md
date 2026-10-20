# Player Styles

[中文](./README.md) | [English](./README.en.md)

[返回 Player Renderer](../README.md)

`player.css` 定义桌面和 Web Player 的主题、舞台布局、对白、选项、媒体及弹窗样式。共享组件提供稳定 class，最终外观由宿主样式决定。

布局使用容器查询、`clamp()` 和低高度媒体查询适配窗口，长文本和存档列表可滚动，通知避开安全区域。窗口尺寸预设也会调整字体比例。新增样式应沿用现有颜色、间距和层级，保留 `:focus-visible`，并尊重 `prefers-reduced-motion`。检查窄屏及约 `800×500` 的视口，确保主要操作可见。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/titleModalStyle.test.ts \
  tests/unit/playerTypographyScale.test.ts \
  tests/unit/titleScreenAutoFit.test.ts
```

## 主要文件

- [`player.css`](./player.css)
