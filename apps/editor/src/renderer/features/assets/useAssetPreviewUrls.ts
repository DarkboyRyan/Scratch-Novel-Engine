/**
 * 文件主要作用：解析资源预览 URL 并在依赖变化时释放旧地址。
 * 包含实现：`useAssetPreviewUrls`。
 */

import { useEffect, useState } from 'react';

import type { AssetDocument } from '../../../shared/projectTypes';
import type { AssetPreviewUrlResolver } from '../../application/mediaPort';

const EMPTY_PREVIEW_URLS: Readonly<Record<string, string>> = Object.freeze({});

type ResolvedPreviewUrls = {
  identityKey: string | null;
  urls: Readonly<Record<string, string>>;
};

export function useAssetPreviewUrls(
  projectId: string | null,
  projectGeneration: number,
  assets: AssetDocument[],
  resolvePreviewUrl: AssetPreviewUrlResolver,
): Readonly<Record<string, string>> {
  const identityKey = JSON.stringify([
    projectId,
    projectGeneration,
    assets
      .filter((asset) => asset.type === 'image')
      .map((asset) => asset.id),
  ]);
  const [resolvedPreviewUrls, setResolvedPreviewUrls] =
    useState<ResolvedPreviewUrls>({
      identityKey: null,
      urls: EMPTY_PREVIEW_URLS,
    });

  useEffect(() => {
    let isActive = true;
    const [, , imageAssetIds] = JSON.parse(identityKey) as [
      string | null,
      number,
      string[],
    ];

    void Promise.all(
      imageAssetIds.map(async (assetId) => {
        const previewUrl = await resolvePreviewUrl(assetId);
        return [assetId, previewUrl] as const;
      }),
    )
      .then((entries) => {
        if (!isActive) {
          return;
        }

        setResolvedPreviewUrls({
          identityKey,
          urls: Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, string] =>
                entry[1] !== null,
            ),
          ),
        });
      })
      .catch(() => {
        // 单张素材缺失不应让编辑器崩溃。受控协议会拒绝无效路径，
        // UI 只显示占位符，并允许用户继续保存/编辑项目。
        if (isActive) {
          setResolvedPreviewUrls({
            identityKey,
            urls: EMPTY_PREVIEW_URLS,
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, [
    identityKey,
    resolvePreviewUrl,
  ]);

  return resolvedPreviewUrls.identityKey === identityKey
    ? resolvedPreviewUrls.urls
    : EMPTY_PREVIEW_URLS;
}
