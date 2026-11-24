import React from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FolderGit2,
  Loader2,
  LogOut,
  X,
} from 'lucide-react';
import { GithubAuthStatus } from '../../../utils/remoteService';
import { sanitizeExternalUrl } from '../../../utils/urlSafety';

interface AuthStatusHeaderProps {
  authStatus: GithubAuthStatus | null;
  authLoading: boolean;
  connecting: boolean;
  onConnect: () => void;
  onLogout: () => void;
  onClose: () => void;
}

export const AuthStatusHeader: React.FC<AuthStatusHeaderProps> = ({
  authStatus,
  authLoading,
  connecting,
  onConnect,
  onLogout,
  onClose,
}) => {
  return (
    <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <FolderGit2 className="w-5 h-5 text-slate-800 dark:text-slate-100" />
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
            GitHub Repository Sync
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Choose a specific repository first, then load or commit DBML files
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {authLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Checking auth...
          </span>
        ) : authStatus?.connected && authStatus.user ? (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
            {(() => {
              const safeAvatar = sanitizeExternalUrl(authStatus.user.avatar_url);
              return safeAvatar ? (
                <img
                  src={safeAvatar}
                  alt={authStatus.user.login}
                  className="w-4 h-4 rounded-full"
                />
              ) : null;
            })()}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              @{authStatus.user.login}
            </span>
            <button
              type="button"
              onClick={onLogout}
              title="Disconnect GitHub"
              className="p-0.5 rounded text-slate-400 hover:text-rose-600"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={connecting || !authStatus?.configured}
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50"
          >
            {connecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FolderGit2 className="w-3.5 h-3.5" />
            )}
            <span>{connecting ? 'Connecting...' : 'Connect GitHub'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

interface OAuthConfigNoticeProps {
  callbackUrl: string;
  copiedCallback: boolean;
  onCopyCallback: () => void;
}

export const OAuthConfigNotice: React.FC<OAuthConfigNoticeProps> = ({
  callbackUrl,
  copiedCallback,
  onCopyCallback,
}) => {
  return (
    <div className="p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 text-xs space-y-2">
      <div className="flex items-start gap-2 font-semibold text-amber-800 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          GitHub OAuth credentials are not configured yet. You can still load public repositories and files below; to sign in and push commits, configure a GitHub OAuth App.
        </span>
      </div>
      <div className="pl-6 space-y-1 text-[11px] text-amber-800/90 dark:text-amber-300/90">
        <div>
          Set <code className="font-mono font-semibold">GITHUB_CLIENT_ID</code> and{' '}
          <code className="font-mono font-semibold">GITHUB_CLIENT_SECRET</code> in Secrets, and register this callback URL:
        </div>
        <div className="flex items-center gap-2 bg-white/80 dark:bg-slate-950/60 px-2.5 py-1.5 rounded border border-amber-200/80 dark:border-amber-800/60 font-mono">
          <span className="truncate flex-1">{callbackUrl}</span>
          <button
            type="button"
            onClick={onCopyCallback}
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            {copiedCallback ? (
              <Check className="w-3 h-3" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{copiedCallback ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
