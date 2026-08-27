# CG 画廊

[返回功能模块](../README.md)

本目录提供 CG 画廊的表单和 Blockly 两种编辑方式，并将它们统一映射到作者工程的分页槽位结构。每页固定九个图片槽位，空槽与具体资产 ID 都是显式数据，因此切换编辑模式不会丢失排序或分页信息。

## 架构位置与工作方式

1. `cgGalleryProjection.ts` 从项目资产和画廊配置生成页面、槽位及下拉选项。
2. 表单编辑器直接提交页面/槽位变更；Blockly 工作区通过积木投影和 `cgGalleryBlockEvents.ts` 转换相同操作。
3. Engine 返回更新项目后，两种界面都从新投影重建，Player 导出阶段读取同一画廊数据。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [cgGalleryBlockEvents.ts](./cgGalleryBlockEvents.ts) | TypeScript + Blockly | 把 CG 画廊积木字段变化解析为页面槽位更新 | `getCgGalleryFieldUpdate`、`getNewCgGalleryPageDrop`、`getDeletedCgGalleryPageUpdate` |
| [CgGalleryBlocklyWorkspace.tsx](./CgGalleryBlocklyWorkspace.tsx) | React + TypeScript + Blockly | 管理 CG 画廊 Blockly 工作区、投影与字段事件同步 | `CgGalleryEditorHandle`、`CgGalleryBlocklyWorkspace` |
| [cgGalleryBlocks.ts](./cgGalleryBlocks.ts) | TypeScript + Blockly | 注册 CG 画廊根积木、分页积木和九个图片槽位 | `CG_GALLERY_PAGE_BLOCK_TYPE`、`CG_GALLERY_PAGE_BLOCK_ID_PREFIX`、`CG_GALLERY_IMAGE_FIELD_PREFIX`、`CgGalleryAssetOption`、`cgGalleryPageBlockId`、`cgGalleryImageFieldName` 等 12 项 |
| [CgGalleryEditor.tsx](./CgGalleryEditor.tsx) | React + TypeScript | 在表单与积木模式间切换并统一提交 CG 画廊变更 | `CgGalleryEditor` |
| [CgGalleryFormEditor.tsx](./CgGalleryFormEditor.tsx) | React + TypeScript | 提供每页九图的 CG 画廊表单编辑与翻页操作 | `CgGalleryFormEditor` |
| [cgGalleryProjection.ts](./cgGalleryProjection.ts) | TypeScript | 生成 CG 画廊页面投影并解析资源选项和显示标签 | `CG_GALLERY_PAGE_SIZE`、`CgGalleryPages`、`CgGalleryPageDocument`、`CgGalleryPage`、`createEmptyCgGalleryPage`、`cgGalleryPageCount` 等 12 项 |

## 开发与验证

- 保持每页九槽、稳定页序和显式空值；表单与 Blockly 必须产生等价的作者工程更新。
- 资产显示名可以变化，但持久化与事件解析必须使用资产 ID。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/cgGalleryEditor.test.tsx`，并检查表单与 Blockly 模式切换后的投影一致性。
