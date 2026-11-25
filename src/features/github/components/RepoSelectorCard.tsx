import React from 'react';
import {
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { GithubAuthStatus, GithubRepoInfo } from '../../../services/api/remoteService';
import { sanitizeExternalUrl } from '../../../utils/urlSafety';

interface RepoSelectorCardProps {
  repoInput: string;
  onRepoInputChange: (val: string) => void;
  selectedRepo: GithubRepoInfo | null;
  treeLoading: boolean;
  loadingFile: boolean;
  authStatus: GithubAuthStatus | null;
  connecting: boolean;
  initBranchName: string;
  onInitBranchNameChange: (val: string) => void;
  initializingBranch: boolean;
  onSelectRepository: (e: React.FormEvent) => void;
  onChangeRepository: () => void;
  onCreateMainBranch: () => void;
  onConnectGithub: () => void;
}

export const RepoSelectorCard: React.FC<RepoSelectorCardProps> = ({
  repoInput,
  onRepoInputChange,
  selectedRepo,
  treeLoading,
  loadingFile,
  authStatus,
  connecting,
  initBranchName,
  onInitBranchNameChange,
  initializingBranch,
  onSelectRepository,
  onChangeRepository,
  onCreateMainBranch,
  onConnectGithub,
}) => {
  return (
    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Step 1 · Target Repository</span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Only the exact repository you specify is accessed
        </span>
      </div>

      {!selectedRepo ? (
        <form
          onSubmit={onSelectRepository}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
        >
          <input
            type="text"
            value={repoInput}
            onChange={(e) => onRepoInputChange(e.target.value)}
            placeholder="owner/repo or https://github.com/owner/repo"
            className="flex-1 px-3 py-2 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loadingFile || treeLoading || !repoInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 disabled:opacity-50 whitespace-nowrap"
          >
            {(treeLoading || loadingFile) && (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            )}
            <span>
              {treeLoading
                ? 'Inspecting...'
                : loadingFile
                ? 'Loading...'
                : 'Select Repository'}
            </span>
          </button>
        </form>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {selectedRepo.private ? (
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              )}
              <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                {selectedRepo.full_name}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {selectedRepo.private ? 'Private' : 'Public'}
              </span>
              {authStatus?.connected && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    selectedRepo.canPush
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}
                >
                  {selectedRepo.canPush ? 'Push access' : 'Read-only'}
                </span>
              )}
              {(() => {
                const safeRepoUrl = sanitizeExternalUrl(selectedRepo.html_url);
                return safeRepoUrl ? (
                  <a
                    href={safeRepoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open repository on GitHub"
                    className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : null;
              })()}
            </div>

            <button
              type="button"
              onClick={onChangeRepository}
              className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Change Repository
            </button>
          </div>

          {selectedRepo.isEmpty && (
            <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-blue-900 dark:text-blue-100">
                <GitBranch className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    Empty repository — no branches exist yet
                  </div>
                  <div className="text-[11px] text-blue-800/90 dark:text-blue-200/80">
                    Create the initial <code className="font-mono font-semibold">main</code> branch now, or switch to{' '}
                    <span className="font-semibold">Commit &amp; Push</span> to push your DBML schema and initialize{' '}
                    <code className="font-mono font-semibold">main</code> in one commit.
                  </div>
                </div>
              </div>

              {authStatus?.connected ? (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <input
                    type="text"
                    value={initBranchName}
                    onChange={(e) => onInitBranchNameChange(e.target.value)}
                    placeholder="main"
                    className="w-32 px-2.5 py-1 text-xs font-mono rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={onCreateMainBranch}
                    disabled={initializingBranch || !selectedRepo.canPush}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
                  >
                    {initializingBranch ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <GitBranch className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {initializingBranch
                        ? 'Creating branch...'
                        : `Create ${initBranchName.trim() || 'main'} branch`}
                    </span>
                  </button>
                </div>
              ) : (
                authStatus?.configured && (
                  <div className="pl-6">
                    <button
                      type="button"
                      onClick={onConnectGithub}
                      disabled={connecting}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                    >
                      <FolderGit2 className="w-3.5 h-3.5" />
                      <span>Connect GitHub to Create Branch</span>
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
