# 资产预览

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`AssetPreviewService.ts`](./AssetPreviewService.ts) | Electron Protocol、Node.js FS/Stream | 将受管项目媒体暴露为 `vn-asset://` 预览。 | `AssetPreviewService`、`prepareProject`、协议处理；校验规范路径、文件身份、魔数、大小与字节范围。 |
