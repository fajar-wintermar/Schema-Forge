import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  Clock,
  Cloud,
  Copy,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  Loader2,
  Lock,
  Pencil,
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
  updateWorkspaceShare,
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

type ExpirationMode = 'never' | '1' | '7' | '30' | '90' | 'custom';

function parseExpirationMode(value: string): ExpirationMode {
  switch (value) {
    case '1':
    case '7':
    case '30':
    case '90':
    case 'custom':
      return value;
    default:
      return 'never';
  }
}

function formatLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultCustomExpirationValue(existingIso?: string | null): string {
  if (existingIso) {
    const parsed = new Date(existingIso);
    if (!Number.isNaN(parsed.getTime())) {
      return formatLocalDateTimeInput(parsed);
    }
  }
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  nextWeek.setSeconds(0, 0);
  return formatLocalDateTimeInput(nextWeek);
}

function getMinDateTimeLocalValue(): string {
  const soon = new Date(Date.now() + 60 * 1000);
  soon.setSeconds(0, 0);
  return formatLocalDateTimeInput(soon);
}

function formatExpirationSummary(expiresAt: string | null): string {
  if (!expiresAt) return 'Never expires';
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return 'Invalid expiration';
  const formatted = new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return ms <= Date.now()
    ? `Expired ${formatted}`
    : `Expires ${formatted}`;
}

function buildExpirationPayload(
  mode: ExpirationMode,
  customDateTime: string
): { expiresInDays?: number | null; expiresAt?: string | null } {
  if (mode === 'never') {
    return { expiresAt: null };
  }
  if (mode === 'custom') {
    if (!customDateTime.trim()) {
      throw new Error('Please choose a custom expiration date and time.');
    }
    const ms = new Date(customDateTime).getTime();
    if (!Number.isFinite(ms)) {
      throw new Error('Invalid custom expiration date and time.');
    }
    if (ms <= Date.now()) {
      throw new Error('Custom expiration date must be in the future.');
    }
    return { expiresAt: new Date(ms).toISOString() };
  }
  const days = Number.parseInt(mode, 10);
  if (!Number.isFinite(days) || days <= 0) {
    return { expiresAt: null };
  }
  return { expiresInDays: days };
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
  const [allowDiagramExport, setAllowDiagramExport] = useState(false);
  const [expiresMode, setExpiresMode] = useState<ExpirationMode>('never');
  const [customExpiresAt, setCustomExpiresAt] = useState<string>(() =>
    getDefaultCustomExpirationValue()
  );

  // Inline edit state for an existing share link
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingExportId, setTogglingExportId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPinnedVersionTag, setEditPinnedVersionTag] =
    useState<string>('live');
  const [editDefaultView, setEditDefaultView] = useState<'docs' | 'diagram'>(
    'docs'
  );
  const [editAllowDiagramExport, setEditAllowDiagramExport] = useState(false);
  const [editExpiresMode, setEditExpiresMode] =
    useState<ExpirationMode>('never');
  const [editCustomExpiresAt, setEditCustomExpiresAt] = useState<string>(() =>
    getDefaultCustomExpirationValue()
  );

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
      setShares(res.shares.filter((s) => !s.revokedAt));
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
      const expirationPayload = buildExpirationPayload(
        expiresMode,
        customExpiresAt
      );

      // Ensure latest workspace & version snapshots are in D1 before issuing the share link
      const synced = await onSyncWorkspaceToCloud();
      if (!synced) {
        throw new Error('Failed to sync workspace to cloud before sharing.');
      }

      const { share } = await createWorkspaceShare(workspace.id, {
        label: label.trim() || `${workspace.name} Read-Only`,
        pinnedVersionTag: pinnedVersionTag === 'live' ? null : pinnedVersionTag,
        defaultView,
        allowDiagramExport,
        ...expirationPayload,
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

  const handleStartEdit = (share: ShareLinkRecord) => {
    setError(null);
    setEditingId(share.id);
    setEditLabel(share.label);
    setEditPinnedVersionTag(share.pinnedVersionTag || 'live');
    setEditDefaultView(share.defaultView);
    setEditAllowDiagramExport(Boolean(share.allowDiagramExport));
    if (share.expiresAt) {
      setEditExpiresMode('custom');
      setEditCustomExpiresAt(getDefaultCustomExpirationValue(share.expiresAt));
    } else {
      setEditExpiresMode('never');
      setEditCustomExpiresAt(getDefaultCustomExpirationValue());
    }
  };

  const handleToggleDiagramExport = async (share: ShareLinkRecord) => {
    if (!cloudAuth?.authenticated || share.revokedAt) return;
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
      if (editingId === share.id) {
        setEditAllowDiagramExport(updated.allowDiagramExport);
      }
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
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent, shareId: string) => {
    e.preventDefault();
    if (!cloudAuth?.authenticated) return;

    setSavingEdit(true);
    setError(null);
    try {
      const expirationPayload = buildExpirationPayload(
        editExpiresMode,
        editCustomExpiresAt
      );

      if (editPinnedVersionTag !== 'live') {
        const synced = await onSyncWorkspaceToCloud();
        if (!synced) {
          throw new Error(
            'Failed to sync latest workspace versions before updating share link.'
          );
        }
      }

      const { share: updated } = await updateWorkspaceShare(
        workspace.id,
        shareId,
        {
          label: editLabel.trim() || `${workspace.name} Read-Only`,
          pinnedVersionTag:
            editPinnedVersionTag === 'live' ? null : editPinnedVersionTag,
          defaultView: editDefaultView,
          allowDiagramExport: editAllowDiagramExport,
          ...expirationPayload,
        }
      );

      setShares((prev) =>
        prev.map((item) => (item.id === shareId ? updated : item))
      );
      setEditingId(null);
      onShowToast('Share link updated');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update share link.'
      );
    } finally {
      setSavingEdit(false);
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
    setDeletingId(shareId);
    setError(null);
    try {
      await revokeWorkspaceShare(workspace.id, shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      if (editingId === shareId) {
        setEditingId(null);
      }
      onShowToast('Share link deleted');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete share link.'
      );
    } finally {
      setDeletingId(null);
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
                      value={expiresMode}
                      onChange={(e) => {
                        const mode = parseExpirationMode(e.target.value);
                        setExpiresMode(mode);
                        if (mode === 'custom' && !customExpiresAt) {
                          setCustomExpiresAt(getDefaultCustomExpirationValue());
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="never">Never expires</option>
                      <option value="1">1 day</option>
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="custom">Custom date &amp; time...</option>
                    </select>
                  </div>

                  {expiresMode === 'custom' && (
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        Custom Expiration Date &amp; Time
                      </label>
                      <input
                        type="datetime-local"
                        value={customExpiresAt}
                        min={getMinDateTimeLocalValue()}
                        onChange={(e) => setCustomExpiresAt(e.target.value)}
                        required
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2 flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          Allow Diagram Export (PNG / SVG)
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Let viewers download PNG or SVG snapshots of the diagram
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowDiagramExport}
                      aria-label="Allow Diagram Export (PNG / SVG)"
                      onClick={() => setAllowDiagramExport((v) => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                        allowDiagramExport
                          ? 'bg-blue-600'
                          : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                          allowDiagramExport ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
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
                      const isEditing = editingId === share.id;
                      const hasPinnedOutsidePublished =
                        Boolean(share.pinnedVersionTag) &&
                        !publishedVersions.some(
                          (v) => v.tag === share.pinnedVersionTag
                        );

                      return (
                        <div
                          key={share.id}
                          className={`p-3 rounded-xl border space-y-2 ${
                            inactive && !isEditing
                              ? 'border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/40 opacity-75'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
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

                            {!isRevoked && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!isExpired && (
                                  <>
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
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing
                                      ? handleCancelEdit()
                                      : handleStartEdit(share)
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                                    isEditing
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                  title="Edit version target & expiration"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>{isEditing ? 'Editing' : 'Edit'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingId === share.id}
                                  onClick={() => handleRevoke(share.id)}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
                                  title="Delete share link"
                                  aria-label="Delete share link"
                                >
                                  {deletingId === share.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>
                                {formatExpirationSummary(share.expiresAt)}
                              </span>
                            </div>

                            {!isRevoked ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                                  <ImageIcon className="w-3 h-3 text-slate-400" />
                                  <span>PNG/SVG Export</span>
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={Boolean(share.allowDiagramExport)}
                                  aria-label={`Toggle PNG/SVG diagram export for ${share.label || 'share link'}`}
                                  disabled={togglingExportId === share.id}
                                  onClick={() => handleToggleDiagramExport(share)}
                                  className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                                    share.allowDiagramExport
                                      ? 'bg-blue-600'
                                      : 'bg-slate-300 dark:bg-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform ${
                                      share.allowDiagramExport
                                        ? 'translate-x-3'
                                        : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {share.allowDiagramExport
                                  ? 'PNG/SVG export was enabled'
                                  : 'PNG/SVG export disabled'}
                              </span>
                            )}
                          </div>

                          {isEditing && (
                            <form
                              onSubmit={(e) => handleSaveEdit(e, share.id)}
                              className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    Link Label
                                  </label>
                                  <input
                                    type="text"
                                    value={editLabel}
                                    onChange={(e) =>
                                      setEditLabel(e.target.value)
                                    }
                                    placeholder="e.g. Product & Backend Team"
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                    Schema Target (Version)
                                  </label>
                                  <select
                                    value={editPinnedVersionTag}
                                    onChange={(e) =>
                                      setEditPinnedVersionTag(e.target.value)
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="live">
                                      Latest Live Workspace (+ Published Versions)
                                    </option>
                                    {hasPinnedOutsidePublished &&
                                      share.pinnedVersionTag && (
                                        <option value={share.pinnedVersionTag}>
                                          Pinned Snapshot:{' '}
                                          {share.pinnedVersionTag}
                                        </option>
                                      )}
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
                                      onClick={() => setEditDefaultView('docs')}
                                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                                        editDefaultView === 'docs'
                                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      <BookOpen className="w-3.5 h-3.5" />
                                      <span>Docs</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditDefaultView('diagram')
                                      }
                                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                                        editDefaultView === 'diagram'
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
                                    value={editExpiresMode}
                                    onChange={(e) => {
                                      const mode = parseExpirationMode(
                                        e.target.value
                                      );
                                      setEditExpiresMode(mode);
                                      if (
                                        mode === 'custom' &&
                                        !editCustomExpiresAt
                                      ) {
                                        setEditCustomExpiresAt(
                                          getDefaultCustomExpirationValue(
                                            share.expiresAt
                                          )
                                        );
                                      }
                                    }}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                  >
                                    <option value="never">Never expires</option>
                                    <option value="1">1 day from now</option>
                                    <option value="7">7 days from now</option>
                                    <option value="30">30 days from now</option>
                                    <option value="90">90 days from now</option>
                                    <option value="custom">
                                      Custom date &amp; time...
                                    </option>
                                  </select>
                                </div>

                                {editExpiresMode === 'custom' && (
                                  <div className="sm:col-span-2 space-y-1">
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                      Custom Expiration Date &amp; Time
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={editCustomExpiresAt}
                                      min={getMinDateTimeLocalValue()}
                                      onChange={(e) =>
                                        setEditCustomExpiresAt(e.target.value)
                                      }
                                      required
                                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                    />
                                  </div>
                                )}

                                <div className="sm:col-span-2 flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                      Allow Diagram Export (PNG / SVG)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={editAllowDiagramExport}
                                    aria-label="Allow Diagram Export (PNG / SVG)"
                                    onClick={() =>
                                      setEditAllowDiagramExport((v) => !v)
                                    }
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                                      editAllowDiagramExport
                                        ? 'bg-blue-600'
                                        : 'bg-slate-300 dark:bg-slate-700'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                                        editAllowDiagramExport
                                          ? 'translate-x-4'
                                          : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  disabled={savingEdit}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={savingEdit}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                                >
                                  {savingEdit && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  )}
                                  <span>
                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                  </span>
                                </button>
                              </div>
                            </form>
                          )}

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
