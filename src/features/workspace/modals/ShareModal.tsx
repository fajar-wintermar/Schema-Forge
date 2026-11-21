import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Cloud,
  Copy,
  Eye,
  LayoutGrid,
  Link2,
  Loader2,
  Lock,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import {
  CloudAuthStatusResponse,
  ShareLinkRecord,
  WorkspaceProject,
} from '../../../types/schema';
import {
  buildShareUrl,
  createWorkspaceShare,
  listWorkspaceShares,
  revokeWorkspaceShare,
} from '../../../utils/cloudService';

interface ShareModalProps {
  workspace: WorkspaceProject;
  cloudAuth: CloudAuthStatusResponse | null;
  onConnectCloud: () => Promise<void>;
  onSyncWorkspaceToCloud: () => Promise<WorkspaceProject | null>;
  onOpenPreviewShare: (token: string, pinnedVersionTag?: string | null) => void;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  workspace,
  cloudAuth,
  onConnectCloud,
  onSyncWorkspaceToCloud,
  onOpenPreviewShare,
  onClose,
  onShowToast,
}) => {
  const [shares, setShares] = useState<ShareLinkRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [pinnedVersionTag, setPinnedVersionTag] = useState<string>('live');
  const [defaultView, setDefaultView] = useState<'docs' | 'diagram'>('docs');
  const [expiresInDays, setExpiresInDays] = useState<string>('never');

  const isCloudSynced = workspace.syncOrigin === 'cloud';
  const canLoadShares = Boolean(
    cloudAuth?.cloudEnabled && cloudAuth?.authenticated && isCloudSynced
  );

  const loadShares = useCallback(async () => {
    if (!canLoadShares) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listWorkspaceShares(workspace.id);
      setShares(res.shares);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load share links.'
      );
    } finally {
      setLoading(false);
    }
  }, [canLoadShares, workspace.id]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  const handleConnect = async () => {
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
  };

  const handleSyncNow = async () => {
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
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudAuth?.authenticated) return;

    setCreating(true);
    setError(null);
    try {
      // Ensure latest workspace & version snapshots are in D1 before issuing the share link
      const synced = await onSyncWorkspaceToCloud();
      if (!synced) {
        throw new Error('Failed to sync workspace to cloud before sharing.');
      }

      const daysNum =
        expiresInDays === 'never' ? null : Number.parseInt(expiresInDays, 10);

      const { share } = await createWorkspaceShare(workspace.id, {
        label: label.trim() || `${workspace.name} Read-Only`,
        pinnedVersionTag: pinnedVersionTag === 'live' ? null : pinnedVersionTag,
        defaultView,
        expiresInDays: Number.isFinite(daysNum) ? daysNum : null,
      });

      setShares((prev) => [share, ...prev]);
      setLabel('');

      const url = buildShareUrl(share.token, share.pinnedVersionTag);
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 2000);
      onShowToast('Shareable read-only link created and copied');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create share link.'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (share: ShareLinkRecord) => {
    const url = buildShareUrl(share.token, share.pinnedVersionTag);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(share.id);
      setTimeout(() => setCopiedId(null), 1800);
      onShowToast('Share link copied to clipboard');
    } catch {
      onShowToast('Copy failed — select URL manually');
    }
  };

  const handleRevoke = async (shareId: string) => {
    setError(null);
    try {
      const res = await revokeWorkspaceShare(workspace.id, shareId);
      setShares((prev) =>
        prev.map((s) =>
          s.id === shareId ? { ...s, revokedAt: res.revokedAt } : s
        )
      );
      onShowToast('Share link revoked');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to revoke share link.'
      );
    }
  };

  const publishedVersions = workspace.versions.filter((v) => v.isPublished);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                Share Read-Only Docs &amp; Diagram
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Create clean links for product, data, and backend teams
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!cloudAuth?.cloudEnabled ? (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-2">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Cloud D1 Database Not Bound
              </div>
              <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Shareable links require the Cloudflare D1 <code className="font-mono font-semibold">DB</code> binding in{' '}
                <code className="font-mono font-semibold">wrangler.jsonc</code>. Local IndexedDB editing continues to work offline.
              </p>
            </div>
          ) : !cloudAuth.authenticated ? (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-start gap-3">
                <Lock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Sign in to publish shareable links
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Sign in with GitHub to sync <strong>{workspace.name}</strong> to your Cloudflare D1 cloud workspace and generate shareable read-only links. Your local IndexedDB workspaces remain intact.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || !cloudAuth.githubConfigured}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50"
              >
                {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {cloudAuth.githubConfigured
                    ? connecting
                      ? 'Connecting GitHub...'
                      : 'Sign in with GitHub'
                    : 'Configure GITHUB_CLIENT_ID & SECRET first'}
                </span>
              </button>
            </div>
          ) : (
            <>
              {!isCloudSynced && (
                <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-900 dark:text-blue-100">
                      <span className="font-semibold">Local-only workspace:</span>{' '}
                      Sync this workspace to cloud before or while generating a share link.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 shrink-0"
                  >
                    {syncing && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Sync to Cloud</span>
                  </button>
                </div>
              )}

              {/* Create New Share Link */}
              <form
                onSubmit={handleCreateShare}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Create New Share Link
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Viewers get read-only Docs &amp; Diagram access
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Link Label
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Product & Backend Team"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Schema Target
                    </label>
                    <select
                      value={pinnedVersionTag}
                      onChange={(e) => setPinnedVersionTag(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="live">
                        Latest Live Workspace (+ Published Versions)
                      </option>
                      {publishedVersions.map((v) => (
                        <option key={v.id} value={v.tag}>
                          Pinned Snapshot: {v.tag} — {v.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Landing View
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDefaultView('docs')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                          defaultView === 'docs'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Docs</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultView('diagram')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                          defaultView === 'diagram'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Diagram</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Expiration
                    </label>
                    <select
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="never">Never expires</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                  >
                    {creating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {creating
                        ? 'Creating Link...'
                        : 'Generate & Copy Share Link'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Existing Links */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Share Links ({shares.length})
                  </h3>
                  {loading && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading...
                    </span>
                  )}
                </div>

                {shares.length === 0 && !loading ? (
                  <div className="py-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    No share links created yet for this workspace.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {shares.map((share) => {
                      const shareUrl = buildShareUrl(
                        share.token,
                        share.pinnedVersionTag
                      );
                      const isRevoked = Boolean(share.revokedAt);
                      const isExpired = Boolean(
                        share.expiresAt &&
                          new Date(share.expiresAt).getTime() <= Date.now()
                      );
                      const inactive = isRevoked || isExpired;

                      return (
                        <div
                          key={share.id}
                          className={`p-3 rounded-xl border space-y-2 ${
                            inactive
                              ? 'border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/40 opacity-65'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {share.label || 'Read-Only Share Link'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                                {share.pinnedVersionTag || 'Live'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-[10px] font-medium text-blue-700 dark:text-blue-300 capitalize">
                                {share.defaultView}
                              </span>
                              {isRevoked ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                                  Revoked
                                </span>
                              ) : isExpired ? (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  Expired
                                </span>
                              ) : null}
                            </div>

                            {!inactive && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(share)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  {copiedId === share.id ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                  <span>
                                    {copiedId === share.id ? 'Copied' : 'Copy'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenPreviewShare(
                                      share.token,
                                      share.pinnedVersionTag
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                                  title="Open read-only viewer"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Preview</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevoke(share.id)}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Revoke share link"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-200/70 dark:border-slate-700/60 truncate">
                            {shareUrl}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
