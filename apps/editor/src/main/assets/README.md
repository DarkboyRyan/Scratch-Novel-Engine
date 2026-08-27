# 资产预览

[返回 Electron Main](../README.md)

本目录负责把项目内受管媒体安全地提供给 Editor 预览，而不是向 Renderer 暴露真实文件路径。它通过自定义 `vn-asset://` 协议读取资产，并在打开流之前核对项目会话、文件身份、媒体内容和请求范围。

## 架构位置与工作方式

1. 项目工作流把当前项目根和资产清单交给 `AssetPreviewService` 准备会话。
2. Renderer 请求受控协议 URL，服务规范化标识并委托 [`../media/`](../media/README.md) 校验格式和 Range。
3. 校验通过后以流式响应返回媒体字节；项目切换或窗口关闭时旧会话失效。

## 文件

| 文件 | 框架技术 | 主要作用 | 关键函数与实现 |
| --- | --- | --- | --- |
| [`AssetPreviewService.ts`](./AssetPreviewService.ts) | Electron Protocol、Node.js FS/Stream | 将受管项目媒体暴露为 `vn-asset://` 预览。 | `AssetPreviewService`、`prepareProject`、协议处理；校验规范路径、文件身份、魔数、大小与字节范围。 |

## 开发与验证

- 协议处理不得接受任意绝对路径，也不能只依据扩展名信任媒体；范围请求必须保持单段和边界安全。
- 运行 `pnpm --dir apps/editor exec vitest run tests/unit/assetPreviewService.test.ts tests/unit/mediaPolicy.test.ts` 验证协议与媒体策略。
