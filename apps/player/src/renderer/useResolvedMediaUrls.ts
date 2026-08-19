import { useEffect, useMemo, useState } from 'react';
import type { MediaUrlResolver } from '@vnengine/player-ui';

type ResolutionState = {
  key: string;
  urls: Readonly<Record<string, string>>;
};

export function useResolvedMediaUrls(
  assetIds: readonly (string | null)[],
  resolveMediaUrl: MediaUrlResolver,
): Readonly<Record<string, string>> {
  const ids = useMemo(
    () => [...new Set(assetIds.filter((id): id is string => id !== null))],
    // The joined primitive key avoids restarting requests for equivalent lists.
    // Asset IDs cannot contain NUL because Main validates the runtime bundle.
    [assetIds.join('\0')],
  );
  const key = ids.join('\0');
  const [resolution, setResolution] = useState<ResolutionState>({
    key: '',
    urls: {},
  });

  useEffect(() => {
    let cancelled = false;
    setResolution({ key, urls: {} });

    void Promise.all(
      ids.map(async (assetId) => {
        try {
          return [assetId, await resolveMediaUrl(assetId)] as const;
        } catch {
          return [assetId, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const urls: Record<string, string> = {};
      for (const [assetId, url] of entries) {
        if (url !== null) {
          urls[assetId] = url;
        }
      }
      setResolution({ key, urls });
    });

    return () => {
      cancelled = true;
    };
  }, [ids, key, resolveMediaUrl]);

  return resolution.key === key ? resolution.urls : {};
}
