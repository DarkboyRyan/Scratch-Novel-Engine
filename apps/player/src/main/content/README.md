# Player Content

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

Content 将磁盘上的 `.vngame` 目录转换为只读游戏视图，并管理每个窗口的当前运行包。启动来源包括开发夹具、通用 Player 和嵌入式单游戏；通用模式允许选择本地包，嵌入模式拒绝替换游戏。

`PlayerBundleLoader` 通过安全文件接口读取文档和资源，检查结构、大小、哈希、类型、链接及路径逃逸。候选包全部通过后，`PlayerBundleSession` 才切换游戏并轮换媒体代次；取消或失败保留原状态，旧会话不能继续写入存档。

这里的 `runtimeBundleSchema.ts` 仅保留兼容导入，真正解析器位于 `src/shared`。不要在会话层复制解析规则，或为非标准目录放宽文件安全检查。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerBundleLoader.test.ts \
  tests/unit/playerBundleSession.test.ts \
  tests/unit/playerStartupContent.test.ts
```

## 主要文件

- [`PlayerBundleLoader.ts`](./PlayerBundleLoader.ts)
- [`PlayerBundleSession.ts`](./PlayerBundleSession.ts)
- [`resolvePlayerStartupContent.ts`](./resolvePlayerStartupContent.ts)
- [`runtimeBundleSchema.ts`](./runtimeBundleSchema.ts)
- [`safeFiles.ts`](./safeFiles.ts)
- [`selectPlayerBundleDirectory.ts`](./selectPlayerBundleDirectory.ts)
