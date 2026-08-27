/**
 * 文件主要作用：解析资源预览 URL 并在依赖变化时释放旧地址。
 * 包含实现：`useAssetPreviewUrls`。
 */

import { useEffect, useState } from 'react';

import type { AssetDocument } from '../../../shared/projectTypes';
import type { AssetPreviewUrlResolver } from '../../application/mediaPort';

export function useAssetPreviewUrls(
  projectId: string | null,
  projectGeneration: number,
  assets: AssetDocument[],
  resolvePreviewUrl: AssetPreviewUrlResolver,
): Readonly<Record<string, string>> {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>(
    {},
  );
  const imageAssetIdsKey = JSON.stringify(
    assets
      .filter((asset) => asset.type === 'image')
      .map((asset) => asset.id),
  );

  useEffect(() => {
    let isActive = true;
    const assetIds = JSON.parse(imageAssetIdsKey) as string[];

    void Promise.all(
      assetIds.map(async (assetId) => {
        const previewUrl = await resolvePreviewUrl(assetId);
        return [assetId, previewUrl] as const;
      }),
    )
      .then((entries) => {
        if (!isActive) {
          return;
        }

        setPreviewUrls(
          Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, string] =>
                entry[1] !== null,
            ),
          ),
        );
      })
      .catch(() => {
        // 单张素材缺失不应让编辑器崩溃。受控协议会拒绝无效路径，
        // UI 只显示占位符，并允许用户继续保存/编辑项目。
        if (isActive) {
          setPreviewUrls({});
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    imageAssetIdsKey,
    projectGeneration,
    projectId,
    resolvePreviewUrl,
  ]);

  return previewUrls;
}
