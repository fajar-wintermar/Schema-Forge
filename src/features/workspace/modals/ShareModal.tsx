import React, { useState } from 'react';
import {
  AlertCircle,
  Cloud,
  Loader2,
  Lock,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import type {
  CloudAuthStatusResponse,
  ShareLinkRecord,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { useWorkspaceShares } from '../hooks/useWorkspaceShares';
import {
  type ExpirationMode,
  getDefaultCustomExpirationValue,
} from '../share/shareExpirationForm';
import { CreateShareForm } from './share/CreateShareForm';
import { ShareLinkCard } from './share/ShareLinkCard';

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
  const isCloudSynced = workspace.syncOrigin === 'cloud';
  const isAuthenticated = Boolean(cloudAuth?.authenticated);
  const canLoadShares = Boolean(
    cloudAuth?.cloudEnabled && isAuthenticated && isCloudSynced
  );

  const {
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
    getShareUrl,
  } = useWorkspaceShares({
    workspace,
    canLoadShares,
    isAuthenticated,
    onConnectCloud,
    onSyncWorkspaceToCloud,
    onShowToast,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
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

  const handleStartEdit = (share: ShareLinkRecord) => {
    clearError();
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

  const handleCancelEdit = () => {
    setEditingId(null);
    clearError();
  };

  const handleSaveEdit = async (e: React.FormEvent, shareId: string) => {
    e.preventDefault();
    const ok = await saveShareEdit({
      shareId,
      label: editLabel,
      pinnedVersionTag: editPinnedVersionTag,
      defaultView: editDefaultView,
      allowDiagramExport: editAllowDiagramExport,
      expiresMode: editExpiresMode,
      customExpiresAt: editCustomExpiresAt,
    });
    if (ok) {
      setEditingId(null);
    }
  };

  const handleRevoke = async (shareId: string) => {
    const ok = await revokeShare(shareId);
    if (ok && editingId === shareId) {
      setEditingId(null);
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
            <div
              role="alert"
              className="p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {canLoadShares && (
                <button
                  type="button"
                  onClick={reload}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-300 dark:border-rose-700 bg-white/80 dark:bg-slate-900 text-[11px] font-semibold hover:bg-white dark:hover:bg-slate-800 shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {!cloudAuth?.cloudEnabled ? (
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-xs space-y-2">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Cloud D1 Database Not Bound
              </div>
              <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Shareable links require the Cloudflare D1{' '}
                <code className="font-mono font-semibold">DB</code> binding in{' '}
                <code className="font-mono font-semibold">wrangler.jsonc</code>.
                Local IndexedDB editing continues to work offline.
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
                    Sign in with GitHub to sync{' '}
                    <strong>{workspace.name}</strong> to your Cloudflare D1
                    cloud workspace and generate shareable read-only links. Your
                    local IndexedDB workspaces remain intact.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={connect}
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
                      <span className="font-semibold">
                        Local-only workspace:
                      </span>{' '}
                      Sync this workspace to cloud before or while generating a
                      share link.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={syncNow}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 shrink-0"
                  >
                    {syncing && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Sync to Cloud</span>
                  </button>
                </div>
              )}

              <CreateShareForm
                publishedVersions={publishedVersions}
                creating={creating}
                onCreateShare={createShare}
              />

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
                    {shares.map((share) => (
                      <ShareLinkCard
                        key={share.id}
                        share={share}
                        shareUrl={getShareUrl(
                          share.token,
                          share.pinnedVersionTag
                        )}
                        publishedVersions={publishedVersions}
                        isCopied={copiedId === share.id}
                        isEditing={editingId === share.id}
                        isTogglingExport={togglingExportId === share.id}
                        isDeleting={deletingId === share.id}
                        savingEdit={savingEdit}
                        editLabel={editLabel}
                        editPinnedVersionTag={editPinnedVersionTag}
                        editDefaultView={editDefaultView}
                        editAllowDiagramExport={editAllowDiagramExport}
                        editExpiresMode={editExpiresMode}
                        editCustomExpiresAt={editCustomExpiresAt}
                        onCopy={() => void copyShareUrl(share)}
                        onPreview={() =>
                          onOpenPreviewShare(share.token, share.pinnedVersionTag)
                        }
                        onStartEdit={() => handleStartEdit(share)}
                        onCancelEdit={handleCancelEdit}
                        onToggleDiagramExport={() =>
                          void toggleDiagramExport(share, (updated) => {
                            if (editingId === share.id) {
                              setEditAllowDiagramExport(
                                updated.allowDiagramExport
                              );
                            }
                          })
                        }
                        onRevoke={() => void handleRevoke(share.id)}
                        onChangeEditLabel={setEditLabel}
                        onChangeEditPinnedVersionTag={setEditPinnedVersionTag}
                        onChangeEditDefaultView={setEditDefaultView}
                        onToggleEditAllowDiagramExport={() =>
                          setEditAllowDiagramExport((v) => !v)
                        }
                        onChangeEditExpiresMode={setEditExpiresMode}
                        onChangeEditCustomExpiresAt={setEditCustomExpiresAt}
                        onSubmitEdit={(e) => void handleSaveEdit(e, share.id)}
                      />
                    ))}
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
