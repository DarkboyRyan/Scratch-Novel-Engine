export type MediaUrlResolver = (
  assetId: string,
) => Promise<string | null>;
