# Player Styles

[中文](./README.md) | [English](./README.en.md)

[Parent directory](../README.en.md)

`player.css` defines the shared desktop and web theme, stage layout, dialogue, choices, media, and modals. Shared components provide stable classes; host styles determine their final appearance.

Container queries, `clamp()`, and low-height media queries adapt the layout. Long text and save lists scroll, notifications respect safe areas, and window presets adjust font scale. Reuse existing colors, spacing, and stacking levels. Preserve `:focus-visible` and respect `prefers-reduced-motion`. Check narrow screens and viewports around `800×500` to keep primary controls visible.

## Run and verify

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/titleModalStyle.test.ts \
  tests/unit/playerTypographyScale.test.ts \
  tests/unit/titleScreenAutoFit.test.ts
```

## Source files

- [`player.css`](./player.css)
