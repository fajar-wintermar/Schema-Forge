import { useCallback, useEffect, useState } from 'react';
import type { SharedWorkspacePayload } from '@shared/domain/schemaTypes';
import { isAbortError } from '../../../services/api/apiClient';
import { fetchPublicShare } from '../../../services/api/cloudService';

interface UsePublicShareLoaderOptions {
  token: string;
  versionTag: string | null;
  onLoaded?: (payload: SharedWorkspacePayload) => void;
}

export function usePublicShareLoader({
  token,
  versionTag,
  onLoaded,
}: UsePublicShareLoaderOptions) {
  const [payload, setPayload] = useState<SharedWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetchPublicShare(token, versionTag, controller.signal);
        if (controller.signal.aborted) return;
        setPayload(res);
        onLoaded?.(res);
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Unable to load shared schema.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [token, versionTag, reloadNonce, onLoaded]);

  return {
    payload,
    loading,
    error,
    reload,
  };
}
