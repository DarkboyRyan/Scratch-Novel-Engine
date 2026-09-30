# 资源管理

[返回功能模块](../README.md)

本目录负责在 Renderer 中展示项目图片、音频和视频资源，并提供集中导入、搜索、分类、预览与引用查看。它只处理资产 ID、显示名称和受控预览 URL，真实文件路径、选择、复制和内容校验都由 Main 完成。

## 架构位置与工作方式

1. `AssetManager` 是与剧情流程并列的独立工作区。默认保留项目顺序，可按类型和 Unicode 规范化后的名称搜索，也可切换为名称排序。
2. 详情区可重命名资源；名称会由 Renderer 做非空与 256 UTF-8 字节的长度预检，再交给 C++ 权威规则处理重名冲突。资源卡右键或 `Shift+F10` 会打开同一套重命名和删除操作，重命名直接聚焦详情区现有输入框。
3. 详情区仅允许尝试删除界面中零可见引用的资源。C++ 会再检查完整项目（包括旧版隐藏引用），任一引用都会原子拒绝，不做静默级联修改。
4. 逻辑删除立即进入当前快照，下次保存的 manifest 不再包含该资源。当前版本不执行物理文件删除：底层受管文件会保守留为未引用数据，避免在目录并发移动或旧版路径异常时误删项目外文件。显式的安全垃圾回收属于后续阶段。
5. 详情预览只使用受控媒体 URL：图片优先复用已解析的预览 URL，缺失时才按需解析；音频和视频只在选中后解析。三类媒体都有读取中与不可用状态；音视频提供原生播放控制，切换资源、项目代次或卸载时会暂停并清空旧 `src`，过期的异步结果不会回写。
6. `collectAssetReferences` 纯扫描主界面、CG 槽位、场景初始背景与剧情节点；输出仅包含可显示位置，不暴露项目、场景或节点 ID。
7. 零引用资源只在“使用位置”计数中显示 `0`，不再追加说明段落；有引用时才展示具体位置列表。
8. 导入、重命名和删除都通过平台边界完成。导入重名时由 C++ 依次追加 ` (2)`、` (3)`；重命名与同类型资源精确重名时则明确报错并保留输入。
9. 旧 `ResourcePanel` 在过渡期仅保留为兼容组件；剧情背景缩放控件不属于资源管理页。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [assetDragTypes.ts](./assetDragTypes.ts) | TypeScript | 声明图片资源拖拽的数据类型与序列化协议 | `VN_IMAGE_ASSET_DRAG_TYPE`、`VN_AUDIO_ASSET_DRAG_TYPE`、`VN_VIDEO_ASSET_DRAG_TYPE` |
| [AssetManager.tsx](./AssetManager.tsx) | React + TypeScript | 展示独立资源库，支持分类、搜索、排序、导入、右键菜单、重命名、零引用删除、单选详情和按需预览 | `AssetManager`、`filterAndSortAssets`、`validateAssetDisplayName` |
| [SceneBackgroundSettings.tsx](./SceneBackgroundSettings.tsx) | React + TypeScript | 在 Blockly 剧情页编辑场景初始背景和缩放设置 | `SceneBackgroundSettings` |
| [assetReferences.ts](./assetReferences.ts) | TypeScript | 扫描指定资源的页面与剧情引用 | `collectAssetReferences` |
| [logicalAssetPath.ts](./logicalAssetPath.ts) | TypeScript | 为 Code DSL 与资源详情生成同一份安全逻辑路径 | `logicalAssetPath`、`missingLogicalAssetPath` |
| [ResourcePanel.tsx](./ResourcePanel.tsx) | React + TypeScript | 展示项目资源，支持导入、预览、拖拽及场景初始背景缩放 | `ResourcePanel` |
| [useAssetPreviewUrls.ts](./useAssetPreviewUrls.ts) | TypeScript | 解析资源预览 URL 并在依赖变化时释放旧地址 | `useAssetPreviewUrls` |

## 开发与验证

- 拖拽载荷不得携带绝对路径；不同媒体种类要使用独立 MIME 类型，并在接收端再次检查兼容性。
- Renderer 只能显示公开名称；Code 页面中的 `assets/images|audio|videos/<名称>` 是逻辑路径，不是真实存储路径，不能交给文件系统 API。
- URL 异步解析要防止过期结果覆盖新项目，并在替换时清理可释放地址。
- 右键菜单必须支持鼠标和键盘，关闭时恢复资源卡焦点；删除项继续使用详情区相同的引用保护与确认流程。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/assetManager.test.tsx tests/unit/assetReferences.test.ts`，媒体策略另见 [`../../../main/assets/`](../../../main/assets/README.md)。
