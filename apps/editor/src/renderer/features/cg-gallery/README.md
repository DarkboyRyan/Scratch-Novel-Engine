# CG 画廊

CG 画廊的表单、Blockly 编辑和项目投影。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [cgGalleryBlockEvents.ts](./cgGalleryBlockEvents.ts) | TypeScript + Blockly | 把 CG 画廊积木字段变化解析为页面槽位更新 | `getCgGalleryFieldUpdate`、`getNewCgGalleryPageDrop`、`getDeletedCgGalleryPageUpdate` |
| [CgGalleryBlocklyWorkspace.tsx](./CgGalleryBlocklyWorkspace.tsx) | React + TypeScript + Blockly | 管理 CG 画廊 Blockly 工作区、投影与字段事件同步 | `CgGalleryEditorHandle`、`CgGalleryBlocklyWorkspace` |
| [cgGalleryBlocks.ts](./cgGalleryBlocks.ts) | TypeScript + Blockly | 注册 CG 画廊根积木、分页积木和九个图片槽位 | `CG_GALLERY_PAGE_BLOCK_TYPE`、`CG_GALLERY_PAGE_BLOCK_ID_PREFIX`、`CG_GALLERY_IMAGE_FIELD_PREFIX`、`CgGalleryAssetOption`、`cgGalleryPageBlockId`、`cgGalleryImageFieldName` 等 12 项 |
| [CgGalleryEditor.tsx](./CgGalleryEditor.tsx) | React + TypeScript | 在表单与积木模式间切换并统一提交 CG 画廊变更 | `CgGalleryEditor` |
| [CgGalleryFormEditor.tsx](./CgGalleryFormEditor.tsx) | React + TypeScript | 提供每页九图的 CG 画廊表单编辑与翻页操作 | `CgGalleryFormEditor` |
| [cgGalleryProjection.ts](./cgGalleryProjection.ts) | TypeScript | 生成 CG 画廊页面投影并解析资源选项和显示标签 | `CG_GALLERY_PAGE_SIZE`、`CgGalleryPages`、`CgGalleryPageDocument`、`CgGalleryPage`、`createEmptyCgGalleryPage`、`cgGalleryPageCount` 等 12 项 |
