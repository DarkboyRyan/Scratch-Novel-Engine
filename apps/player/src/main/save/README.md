# Player Save

[中文](./README.md) | [English](./README.en.md)

[返回 Player Main](../README.md)

桌面存档由 Main 保存，Renderer 只提交 Runtime 快照和槽位。当前支持三个手动槽和一个快速槽，目录按项目 ID、Runtime 版本与内容指纹隔离。

写入前使用当前项目恢复并规范化快照，校验媒体引用，再通过受限目录、临时文件和原子重命名落盘。读取与列举同样检查字段、大小、游戏身份及快照，损坏内容不会作为部分进度返回。

异步操作完成前再次检查会话代次，防止跨游戏写入。存档不包含界面文案、媒体 URL 或磁盘路径；格式变更需明确版本和迁移或拒绝策略。

## 验证与运行

```bash
pnpm --dir apps/player exec vitest run tests/unit/playerSaveStore.test.ts
```

## 主要文件

- [`PlayerSaveStore.ts`](./PlayerSaveStore.ts)
