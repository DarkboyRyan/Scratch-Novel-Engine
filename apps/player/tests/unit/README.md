# Player Unit Tests

[中文](./README.md) | [English](./README.en.md)

[返回 Player Tests](../README.md)

这里使用 Vitest 和 jsdom 测试运行包加载、IPC 与媒体安全、存档和设置、React 界面以及 Web 宿主。

文件安全测试使用真实临时目录；Electron 和浏览器能力通过窄接口模拟。界面测试以可访问名称、键盘事件和可见结果断言，CSS 测试补充检查响应式布局与可访问性规则。避免依赖内部调用次数、随机令牌值或机器上的绝对路径。

下面示例可运行全部用例或指定文件。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run
pnpm --dir apps/player exec vitest run tests/unit/playerRenderer.test.tsx
```
