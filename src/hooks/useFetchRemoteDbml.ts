import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '../services/api/apiClient';
import {
  fetchDbmlFromUrl,
  type RemoteFetchResult,
} from '../services/api/remoteService';

export function useFetchRemoteDbml() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const fetchUrl = useCallback(
    async (rawUrl: string): Promise<RemoteFetchResult | null> => {
      const target = rawUrl.trim();
      if (!target) {
        setError('Enter a DBML URL to load.');
        return null;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const result = await fetchDbmlFromUrl(target, controller.signal);
        if (controller.signal.aborted) return null;
        return result;
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) {
          return null;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load DBML from URL.'
        );
        return null;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  return {
    loading,
    error,
    setError,
    clearError,
    fetchUrl,
    cancel,
  };
}
