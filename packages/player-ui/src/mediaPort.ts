/**
 * 主要作用：定义宿主无关的异步媒体 URL 解析端口。
 * 关键函数与实现：`MediaUrlResolver`；以 TypeScript 类型边界和可组合函数实现。
 */
export type MediaUrlResolver = (
  assetId: string,
) => Promise<string | null>;
