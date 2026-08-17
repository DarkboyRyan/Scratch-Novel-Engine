export type MediaUrlResolver = (
  assetId: string,
) => Promise<string | null>;

export type AssetPreviewUrlResolver = MediaUrlResolver;
