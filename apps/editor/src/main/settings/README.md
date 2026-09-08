# Editor 设置

[返回 Electron Main](../README.md)

本目录维护独立于游戏项目的 Editor 偏好，目前包括界面语言和编辑器颜色主题。Manager 提供进程内一致视图和订阅，Store 负责跨启动持久化，损坏文件则安全回退到默认值。

## 架构位置与工作方式

1. 应用启动时 `EditorSettingsStore` 从用户数据目录读取并验证版本化文档；exact v1 文档会保留原语言并自动迁移为 v2，新增主题使用默认 `daylight`。
2. `EditorSettingsManager` 缓存有效设置，验证更新补丁后写回 Store，并向订阅者广播克隆值。
3. Settings IPC 把读取、更新和跨窗口变化通知暴露给 Renderer；语言供原生菜单本地化，`colorTheme` 驱动 Renderer 的编辑器外壳。
4. 游戏导出在 Main 内读取同一权威语言，写入 Runtime v13
   `game.defaultLanguage`；Renderer 不能在导出请求中另行指定。颜色主题只作用于 Editor chrome，不进入 Author、Runtime 或任何导出游戏包。

## 数据合同与默认值

当前设置合同是 exact `settingsVersion: 2`：

```ts
type EditorSettings = {
  settingsVersion: 2;
  language: 'zh-CN' | 'en-US';
  colorTheme: 'daylight' | 'moonlight';
};
```

首次启动、设置文件缺失或无法恢复时使用 `language: 'zh-CN'` 与
`colorTheme: 'daylight'`。Renderer 每次只能提交精确的 `{ language }` 或
`{ colorTheme }` 窄 patch，不能同时提交两个字段，也不能携带版本、路径或未知字段。
Store 读取 exact v1 `{ language }` 文档时会在内存中补上 Daylight；下次成功写入任一设置后
以 v2 文档发布，备份与原子写入规则保持不变。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`EditorSettingsManager.ts`](./EditorSettingsManager.ts) | TypeScript | 负责设置缓存、更新和订阅。 | `EditorSettingsManager.getSettings/updateSettings/subscribe`；验证补丁并广播克隆值。 |
| [`EditorSettingsStore.ts`](./EditorSettingsStore.ts) | Node.js FS | 持久化版本化 Editor 设置。 | `EditorSettingsStore.load/write`；v1→v2 迁移、损坏文件回退、临时文件同步与原子重命名。 |

## 开发与验证

- 设置补丁必须经过 [`../../shared/editorSettingsProtocol.ts`](../../shared/editorSettingsProtocol.ts) 校验；写入继续使用临时文件、同步和原子重命名。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/editorSettingsProtocol.test.ts tests/unit/editorSettingsManager.test.ts tests/unit/editorSettingsStore.test.ts tests/unit/registerEditorSettingsIpc.test.ts`。
