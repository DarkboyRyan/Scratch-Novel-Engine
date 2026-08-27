# Editor 设置

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`EditorSettingsManager.ts`](./EditorSettingsManager.ts) | TypeScript | 负责设置缓存、更新和订阅。 | `EditorSettingsManager.getSettings/updateSettings/subscribe`；验证补丁并广播克隆值。 |
| [`EditorSettingsStore.ts`](./EditorSettingsStore.ts) | Node.js FS | 持久化版本化 Editor 设置。 | `EditorSettingsStore.load/write`；损坏文件回退、临时文件同步与原子重命名。 |
