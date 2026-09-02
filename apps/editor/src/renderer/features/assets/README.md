# 资源管理

[返回功能模块](../README.md)

本目录负责在 Renderer 中展示项目图片、音频和视频资源，并提供导入、删除、预览与拖拽入口。它只处理资产 ID、显示名称和受控预览 URL，真实文件选择、复制和内容校验都由 Main 完成。

## 架构位置与工作方式

1. `ResourcePanel` 从当前作者工程取得资产清单，并通过平台/创作动作发起导入或删除；同类资源沿用导入文件的显示名，重名时由 C++ 依次追加 ` (2)`、` (3)`；普通场景可在同一入口设置初始背景及 10%–300% 缩放，标题页和 CG 资源面不显示该控件。
2. `useAssetPreviewUrls` 按资产标识解析预览地址，在依赖变化或卸载时释放旧 URL。
3. 拖拽时 `assetDragTypes.ts` 写入受控类型和资产 ID，表单或 Blockly 接收方再提交对应节点更新。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [assetDragTypes.ts](./assetDragTypes.ts) | TypeScript | 声明图片资源拖拽的数据类型与序列化协议 | `VN_IMAGE_ASSET_DRAG_TYPE`、`VN_AUDIO_ASSET_DRAG_TYPE`、`VN_VIDEO_ASSET_DRAG_TYPE` |
| [ResourcePanel.tsx](./ResourcePanel.tsx) | React + TypeScript | 展示项目资源，支持导入、预览、拖拽及场景初始背景缩放 | `ResourcePanel` |
| [useAssetPreviewUrls.ts](./useAssetPreviewUrls.ts) | TypeScript | 解析资源预览 URL 并在依赖变化时释放旧地址 | `useAssetPreviewUrls` |

## 开发与验证

- 拖拽载荷不得携带绝对路径；不同媒体种类要使用独立 MIME 类型，并在接收端再次检查兼容性。
- Renderer 只能显示公开名称；Code 页面中的 `assets/images|audio|videos/<名称>` 是逻辑路径，不是真实存储路径，不能交给文件系统 API。
- URL 异步解析要防止过期结果覆盖新项目，并在替换时清理可释放地址。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/useEngineProject.test.tsx tests/unit/formCharacterInsertion.test.tsx`，媒体策略另见 [`../../../main/assets/`](../../../main/assets/README.md)。
