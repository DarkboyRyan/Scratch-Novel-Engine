/**
 * 文件主要作用：声明与平台无关的媒体地址解析端口类型。
 * 包含实现：`MediaUrlResolver`、`AssetPreviewUrlResolver`。
 */

export type MediaUrlResolver = (
  assetId: string,
) => Promise<string | null>;

export type AssetPreviewUrlResolver = MediaUrlResolver;
