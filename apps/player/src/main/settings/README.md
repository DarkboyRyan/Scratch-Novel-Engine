# Player Settings

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

设置模块负责持久化语言、音量、窗口模式与尺寸预设，并将设置应用到原生窗口。`PlayerSettingsStore` 校验版本化 JSON，通过临时文件与原子重命名写入，并在主文件不可用时尝试备份。

缺失、损坏或不带语言字段的 V1 设置返回 `default` 语言来源，V2 返回 `stored`；旧版数值设置仍会保留。Renderer 在默认来源下使用当前包语言，并在首次显式设置更新时持久化有效语言。系统窗口事件不会把默认语言误记为玩家偏好。

`PlayerSettingsManager` 串行应用变更，以原生窗口状态为准；新窗口先恢复尺寸，加载页面后恢复全屏，再显示。退出协调器合并并发退出请求，等待写入完成后只退出一次。新增字段需同步协议、迁移、存储、消费端和测试。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run \
  tests/unit/playerSettingsProtocol.test.ts \
  tests/unit/playerSettingsStore.test.ts \
  tests/unit/playerSettingsManager.test.ts \
  tests/unit/playerSettingsQuitCoordinator.test.ts
```

## 主要文件

- [`PlayerSettingsManager.ts`](./PlayerSettingsManager.ts)
- [`PlayerSettingsQuitCoordinator.ts`](./PlayerSettingsQuitCoordinator.ts)
- [`PlayerSettingsStore.ts`](./PlayerSettingsStore.ts)
