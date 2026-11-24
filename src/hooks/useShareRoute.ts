import { useCallback, useEffect, useState } from 'react';

export interface ShareRouteParams {
  token: string;
  versionTag: string | null;
}

function parseShareRouteFromLocation(): ShareRouteParams | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(
    /^\/share\/([a-zA-Z0-9_-]+)(?:\/([^/]+))?\/?$/
  );
  if (!match) return null;
  return {
    token: decodeURIComponent(match[1]),
    versionTag: match[2] ? decodeURIComponent(match[2]) : null,
  };
}

export function useShareRoute() {
  const [shareRoute, setShareRoute] = useState<ShareRouteParams | null>(() =>
    parseShareRouteFromLocation()
  );

  useEffect(() => {
    const onPopState = () => {
      setShareRoute(parseShareRouteFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openSharePreview = useCallback(
    (token: string, pinnedVersionTag?: string | null) => {
      const path = pinnedVersionTag
        ? `/share/${encodeURIComponent(token)}/${encodeURIComponent(
            pinnedVersionTag
          )}`
        : `/share/${encodeURIComponent(token)}`;
      window.history.pushState(null, '', path);
      setShareRoute({ token, versionTag: pinnedVersionTag || null });
    },
    []
  );

  const exitSharePreview = useCallback(() => {
    window.history.pushState(null, '', '/');
    setShareRoute(null);
    window.location.reload();
  }, []);

  return { shareRoute, openSharePreview, exitSharePreview };
}
