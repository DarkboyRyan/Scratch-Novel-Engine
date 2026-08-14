# Scratch Novel Engine
一个使用 Electron + React 构建编辑器界面、使用 C++20 构建业务核心的视觉小说引擎。

- [当前架构说明](./docs/architecture.md)
- [C++ Core 构建与协议](./engine/README.md)

```sh
fnm exec --using=24 pnpm --dir apps/editor start
```

启动命令会先使用 CMake 构建 `engine/` 中的 C++ 后端，再打开 Electron 编辑器。
