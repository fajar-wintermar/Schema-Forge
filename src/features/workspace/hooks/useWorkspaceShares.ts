import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ShareLinkRecord,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { isAbortError } from '../../../services/api/apiClient';
import {
  buildShareUrl,
  createWorkspaceShare,
  listWorkspaceShares,
  revokeWorkspaceShare,
  updateWorkspaceShare,
} from '../../../services/api/cloudService';
import {
  buildExpirationPayload,
  type ExpirationMode,
} from '../share/shareExpirationForm';

interface UseWorkspaceSharesOptions {
  workspace: WorkspaceProject;
  canLoadShares: boolean;
  isAuthenticated: boolean;
  onConnectCloud: () => Promise<void>;
  onSyncWorkspaceToCloud: () => Promise<WorkspaceProject | null>;
  onShowToast: (msg: string) => void;
}

export interface CreateShareInput {
  label: string;
  pinnedVersionTag: string;
  defaultView: 'docs' | 'diagram';
  allowDiagramExport: boolean;
  expiresMode: ExpirationMode;
  customExpiresAt: string;
}

export interface UpdateShareInput extends CreateShareInput {
  shareId: string;
}

export function useWorkspaceShares({
  workspace,
  canLoadShares,
  isAuthenticated,
  onConnectCloud,
  onSyncWorkspaceToCloud,
  onShowToast,
}: UseWorkspaceSharesOptions) {
  const [shares, setShares] = useState<ShareLinkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingExportId, setTogglingExportId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const markCopied = useCallback((shareId: string, durationMs: number) => {
    setCopiedId(shareId);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedId(null);
    }, durationMs);
  }, []);

  useEffect(() => {
    if (!canLoadShares) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await listWorkspaceShares(workspace.id, controller.signal);
        if (controller.signal.aborted) return;
        setShares(res.shares.filter((s) => !s.revokedAt));
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load share links.'
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
  }, [canLoadShares, workspace.id, loadNonce]);

  const reload = useCallback(() => {
    setLoadNonce((n) => n + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      await onConnectCloud();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'GitHub authentication failed.'
      );
    } finally {
      setConnecting(false);
    }
  }, [onConnectCloud]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const synced = await onSyncWorkspaceToCloud();
      if (!synced) {
        setError('Could not sync workspace to cloud. Please try again.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sync workspace.'
      );
    } finally {
      setSyncing(false);
    }
  }, [onSyncWorkspaceToCloud]);

  const createShare = useCallback(
    async (input: CreateShareInput): Promise<boolean> => {
      if (!isAuthenticated) return false;

      setCreating(true);
      setError(null);
      try {
        const expirationPayload = buildExpirationPayload(
          input.expiresMode,
          input.customExpiresAt
        );

        const synced = await onSyncWorkspaceToCloud();
        if (!synced) {
          throw new Error('Failed to sync workspace to cloud before sharing.');
        }

        const { share } = await createWorkspaceShare(workspace.id, {
          label: input.label.trim() || `${workspace.name} Read-Only`,
          pinnedVersionTag:
            input.pinnedVersionTag === 'live' ? null : input.pinnedVersionTag,
          defaultView: input.defaultView,
          allowDiagramExport: input.allowDiagramExport,
          ...expirationPayload,
        });

        setShares((prev) => [share, ...prev]);

        const url = buildShareUrl(share.token, share.pinnedVersionTag);
        await navigator.clipboard?.writeText(url).catch(() => {});
        markCopied(share.id, 2000);
        onShowToast('Shareable read-only link created and copied');
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to create share link.'
        );
        return false;
      } finally {
        setCreating(false);
      }
    },
    [
      isAuthenticated,
      workspace.id,
      workspace.name,
      onSyncWorkspaceToCloud,
      markCopied,
      onShowToast,
    ]
  );

  const toggleDiagramExport = useCallback(
    async (
      share: ShareLinkRecord,
      onUpdated?: (updated: ShareLinkRecord) => void
    ) => {
      if (!isAuthenticated || share.revokedAt) return;
      const nextValue = !share.allowDiagramExport;
      setTogglingExportId(share.id);
      setError(null);
      try {
        const { share: updated } = await updateWorkspaceShare(
          workspace.id,
          share.id,
          { allowDiagramExport: nextValue }
        );
        setShares((prev) =>
          prev.map((item) => (item.id === share.id ? updated : item))
        );
        onUpdated?.(updated);
        onShowToast(
          updated.allowDiagramExport
            ? 'PNG/SVG diagram export enabled for link'
            : 'PNG/SVG diagram export disabled for link'
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to update diagram export setting.'
        );
      } finally {
        setTogglingExportId(null);
      }
    },
    [isAuthenticated, workspace.id, onShowToast]
  );

  const saveShareEdit = useCallback(
    async (input: UpdateShareInput): Promise<boolean> => {
      if (!isAuthenticated) return false;

      setSavingEdit(true);
      setError(null);
      try {
        const expirationPayload = buildExpirationPayload(
          input.expiresMode,
          input.customExpiresAt
        );

        if (input.pinnedVersionTag !== 'live') {
          const synced = await onSyncWorkspaceToCloud();
          if (!synced) {
            throw new Error(
              'Failed to sync latest workspace versions before updating share link.'
            );
          }
        }

        const { share: updated } = await updateWorkspaceShare(
          workspace.id,
          input.shareId,
          {
            label: input.label.trim() || `${workspace.name} Read-Only`,
            pinnedVersionTag:
              input.pinnedVersionTag === 'live'
                ? null
                : input.pinnedVersionTag,
            defaultView: input.defaultView,
            allowDiagramExport: input.allowDiagramExport,
            ...expirationPayload,
          }
        );

        setShares((prev) =>
          prev.map((item) => (item.id === input.shareId ? updated : item))
        );
        onShowToast('Share link updated');
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to update share link.'
        );
        return false;
      } finally {
        setSavingEdit(false);
      }
    },
    [
      isAuthenticated,
      workspace.id,
      workspace.name,
      onSyncWorkspaceToCloud,
      onShowToast,
    ]
  );

  const copyShareUrl = useCallback(
    async (share: ShareLinkRecord) => {
      const url = buildShareUrl(share.token, share.pinnedVersionTag);
      try {
        await navigator.clipboard.writeText(url);
        markCopied(share.id, 1800);
        onShowToast('Share link copied to clipboard');
      } catch {
        onShowToast('Copy failed — select URL manually');
      }
    },
    [markCopied, onShowToast]
  );

  const revokeShare = useCallback(
    async (shareId: string): Promise<boolean> => {
      setDeletingId(shareId);
      setError(null);
      try {
        await revokeWorkspaceShare(workspace.id, shareId);
        setShares((prev) => prev.filter((s) => s.id !== shareId));
        onShowToast('Share link deleted');
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to delete share link.'
        );
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [workspace.id, onShowToast]
  );

  return {
    shares,
    loading,
    creating,
    connecting,
    syncing,
    savingEdit,
    togglingExportId,
    deletingId,
    copiedId,
    error,
    clearError,
    reload,
    connect,
    syncNow,
    createShare,
    toggleDiagramExport,
    saveShareEdit,
    copyShareUrl,
    revokeShare,
    getShareUrl: buildShareUrl,
  };
}
