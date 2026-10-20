# Editor 单元测试

[中文](./README.md) | [English](./README.en.md)

[返回 Editor 测试](../README.md)

本目录收录 Editor 的 Vitest 单元测试和基于 JSDOM 的轻量交互测试，覆盖 Renderer、Main、Preload、导出、Blockly 与 Shared 协议边界。用例尽量直接针对一个模块或一条用户交互，外部进程与真实跨应用链路留给 [`../integration/`](../integration/README.md)。

## 工作方式

1. 纯 TypeScript 测试直接验证转换、校验器、状态机与文件服务，并为不可信输入覆盖拒绝路径。
2. `*.test.tsx` 使用 Testing Library/JSDOM 渲染组件或工作区，检查用户可观察行为和回调。
3. 导出与 Main 测试在临时目录或受控替身上执行，保证快速、可重复且不依赖用户环境。

## 覆盖范围

- Main、Preload 与 Shared：IPC 校验、可信页面、项目存储、设置、媒体和导出。
- Renderer：表单、Blockly、Code、资源管理、预览、本地化与响应式样式。
- 测试文件按被测模块命名；可直接搜索模块名定位用例，无需维护逐文件清单。

## 开发与验证

- 测试文件尽量与被测模块同名，并断言公开行为；不要依赖用例顺序、固定用户目录或其他测试遗留状态。
- 定向运行示例：`pnpm --dir apps/editor exec vitest run tests/unit/timelinePreview.test.ts`；React/Blockly 用例可在文件名后追加 `-t "用例名称"` 缩小范围。
- 提交前结合改动范围运行全部 Vitest、`pnpm --dir apps/editor typecheck` 和 `pnpm --dir apps/editor lint`；真实后端链路使用上层 Integration 测试。
