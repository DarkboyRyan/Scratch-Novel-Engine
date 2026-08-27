# 资源管理

项目媒体资源的展示、拖拽和预览能力。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [assetDragTypes.ts](./assetDragTypes.ts) | TypeScript | 声明图片资源拖拽的数据类型与序列化协议 | `VN_IMAGE_ASSET_DRAG_TYPE`、`VN_AUDIO_ASSET_DRAG_TYPE`、`VN_VIDEO_ASSET_DRAG_TYPE` |
| [ResourcePanel.tsx](./ResourcePanel.tsx) | React + TypeScript | 展示项目资源并支持导入、删除、预览和拖拽图片资源 | `ResourcePanel` |
| [useAssetPreviewUrls.ts](./useAssetPreviewUrls.ts) | TypeScript | 解析资源预览 URL 并在依赖变化时释放旧地址 | `useAssetPreviewUrls` |
