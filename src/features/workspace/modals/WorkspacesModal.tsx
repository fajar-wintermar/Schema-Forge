import React, { useState } from 'react';
import {
  Cloud,
  CloudUpload,
  FolderPlus,
  HardDrive,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  CloudAuthStatusResponse,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { sanitizeExternalUrl } from '../../../utils/urlSafety';

interface WorkspacesModalProps {
  workspaces: WorkspaceProject[];
  activeId: string;
  cloudAuth: CloudAuthStatusResponse | null;
  onSelectWorkspace: (id: string) => void;
  onCreateBlank: (name: string) => void;
  onLoadSampleTelemetry: () => void;
  onCreateModularProject?: () => void;
  onDeleteWorkspace: (id: string) => void;
  onConnectCloud: () => Promise<void>;
  onLogoutCloud: () => Promise<void>;
  onSyncWorkspace: (id: string) => Promise<WorkspaceProject | null>;
  onSyncAllLocal: () => Promise<number>;
  onClose: () => void;
}

export const WorkspacesModal: React.FC<WorkspacesModalProps> = ({
  workspaces,
  activeId,
  cloudAuth,
  onSelectWorkspace,
  onCreateBlank,
  onLoadSampleTelemetry,
  onCreateModularProject,
  onDeleteWorkspace,
  onConnectCloud,
  onLogoutCloud,
  onSyncWorkspace,
  onSyncAllLocal,
  onClose,
}) => {
  const [newName, setNewName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const localOnlyCount = workspaces.filter(
    (w) => w.syncOrigin !== 'cloud'
  ).length;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateBlank(newName.trim());
    setNewName('');
  };

  const handleConnect = async () => {
    setConnecting(true);
    setAuthError(null);
    try {
      await onConnectCloud();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'GitHub sign-in failed.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncOne = async (id: string) => {
    setSyncingId(id);
    setSyncError(null);
    try {
      const synced = await onSyncWorkspace(id);
      if (!synced) {
        setSyncError('Failed to sync workspace to cloud. Please try again.');
      }
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Failed to sync workspace to cloud.'
      );
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncError(null);
    try {
      await onSyncAllLocal();
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Failed to sync local workspaces.'
      );
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Schema Workspaces
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Offline IndexedDB storage with optional Cloudflare D1 sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Cloud Account Strip */}
          {cloudAuth?.cloudEnabled && (
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
              {cloudAuth.authenticated && cloudAuth.user ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const safeAvatar = sanitizeExternalUrl(
                        cloudAuth.user.avatar_url
                      );
                      return safeAvatar ? (
                        <img
                          src={safeAvatar}
                          alt={cloudAuth.user.login}
                          className="w-6 h-6 rounded-full border border-slate-200 dark:border-slate-700"
                        />
                      ) : null;
                    })()}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        Cloud Sync · @{cloudAuth.user.login}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Syncing workspaces, layouts, sticky notes &amp; versions
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {localOnlyCount > 0 && (
                      <button
                        type="button"
                        onClick={handleSyncAll}
                        disabled={syncingAll}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                      >
                        {syncingAll ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <CloudUpload className="w-3 h-3" />
                        )}
                        <span>Sync Local ({localOnlyCount})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void onLogoutCloud()}
                      title="Sign out of cloud sync"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Sign in with GitHub to sync workspaces across devices
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !cloudAuth.githubConfigured}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50 shrink-0"
                  >
                    {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>
                      {cloudAuth.githubConfigured
                        ? connecting
                          ? 'Connecting...'
                          : 'Sign in with GitHub'
                        : 'OAuth Not Configured'}
                    </span>
                  </button>
                </div>
              )}

              {authError && (
                <div className="text-[11px] text-rose-600 dark:text-rose-400">
                  {authError}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New project name..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </form>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onLoadSampleTelemetry}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span>Create from Template: Multi-Tenant SaaS Telemetry</span>
              </span>
              <span className="text-blue-600 dark:text-blue-400">Load</span>
            </button>

            {onCreateModularProject && (
              <button
                type="button"
                onClick={onCreateModularProject}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <span className="flex items-center gap-2 text-left">
                  <FolderPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Create Modular Project (<code className="font-mono">schema/*.dbml</code> → merged{' '}
                    <code className="font-mono">schema.dbml</code>)
                  </span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 shrink-0">Create</span>
              </button>
            )}
          </div>

          {syncError && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-700 dark:text-rose-300"
            >
              {syncError}
            </div>
          )}

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {workspaces.length === 0 ? (
              <div className="py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                No workspaces yet. Create a project above to get started.
              </div>
            ) : (
            workspaces.map((ws) => {
              const isActive = ws.id === activeId;
              const isCloud = ws.syncOrigin === 'cloud';
              return (
                <div
                  key={ws.id}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {ws.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                          isCloud
                            ? 'bg-blue-100/80 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isCloud ? (
                          <Cloud className="w-2.5 h-2.5" />
                        ) : (
                          <HardDrive className="w-2.5 h-2.5" />
                        )}
                        <span>{isCloud ? 'Cloud' : 'Local'}</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                      {ws.versions.length} versions · Updated{' '}
                      {new Date(ws.updatedAt).toLocaleDateString()}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCloud &&
                      cloudAuth?.cloudEnabled &&
                      cloudAuth?.authenticated && (
                        <button
                          type="button"
                          onClick={() => void handleSyncOne(ws.id)}
                          disabled={syncingId === ws.id}
                          title="Sync this local workspace to Cloud D1"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-60"
                        >
                          {syncingId === ws.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <CloudUpload className="w-3 h-3" />
                          )}
                          <span>Sync</span>
                        </button>
                      )}

                    {workspaces.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onDeleteWorkspace(ws.id)}
                        title="Delete workspace"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      </div>
    </div>
  );
};
