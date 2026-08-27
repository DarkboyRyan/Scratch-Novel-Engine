# Player Save

[返回 Player Main](../README.md)

桌面存档由 Main 持久化，Renderer 只提交 Runtime 快照和目标槽位。当前支持三个手动槽与一个快速槽；存档目录按项目 ID、Runtime 版本和内容指纹派生，因此名称相同但内容不同的游戏不会互相读取进度。

## 写入与恢复

`PlayerSaveStore` 会先用 Runtime 包提供的项目恢复并重新生成规范快照，检查所有媒体引用仍属于当前游戏，再写入带格式版本、游戏身份、槽位和 ISO 时间的文档。写入使用受限目录、临时文件、同步和原子 rename，避免半写文件成为有效存档。

读取与列举同样执行精确字段、大小、身份、快照和资源类型验证。损坏文档不会作为部分进度返回；不兼容游戏、不可保存状态、存储异常和会话已切换分别使用稳定错误码。异步操作完成前会再次检查 `PlayerBundleSession` generation，防止用户切换游戏后旧请求落盘。

不要把 UI 文案、媒体 URL 或磁盘路径写入存档。格式演进必须保留明确版本与迁移/拒绝策略，并运行：

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerSaveStore.test.ts
```

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`PlayerSaveStore.ts`](./PlayerSaveStore.ts) | Node.js、TypeScript | 原子保存、列举和读取版本化运行快照 | `PlayerSaveStore`、安全目录/备份/哈希校验 |
