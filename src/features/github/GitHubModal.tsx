import React, { useCallback, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import {
  AuthStatusHeader,
  OAuthConfigNotice,
} from './components/AuthStatusHeader';
import { GitCommitsMigrationTab } from './components/GitCommitsMigrationTab';
import { LoadFromGithubTab } from './components/LoadFromGithubTab';
import { PushToGithubTab } from './components/PushToGithubTab';
import { RepoSelectorCard } from './components/RepoSelectorCard';
import { useGithubAuthAndRepo } from './hooks/useGithubAuthAndRepo';
import { useGithubPushSync } from './hooks/useGithubPushSync';
import { GitHubModalProps } from './types';
import { sanitizeExternalUrl } from '../../utils/urlSafety';

export const GitHubModal: React.FC<GitHubModalProps> = ({
  workspace,
  initialTab,
  onLoadGithubFile,
  onSyncedGithubFile,
  onLoadGithubFolder,
  onSyncedGithubFolder,
  onClose,
}) => {
  const isModularWorkspace = Boolean(
    workspace.schemaFiles && workspace.schemaFiles.length > 0
  );
  const linked = workspace.githubLink;
  const repoLinked = workspace.githubRepoLink;
  const hasModularLocalChanges = Boolean(
    isModularWorkspace &&
      workspace.schemaFiles?.some(
        (f) => f.lastSyncedContent === undefined || f.content !== f.lastSyncedContent
      )
  );
  const hasLocalChanges = isModularWorkspace
    ? hasModularLocalChanges
    : Boolean(linked && workspace.dbml !== linked.lastSyncedDbml);

  const [tab, setTab] = useState<'browse' | 'push' | 'migrations'>(
    initialTab || (linked || repoLinked ? 'push' : 'browse')
  );
  const [error, setError] = useState<string | null>(null);

  const clearFeedbackRef = React.useRef<() => void>(() => {});
  const resetModeRef = React.useRef<() => void>(() => {});

  const handleClearFeedback = useCallback(() => {
    clearFeedbackRef.current();
  }, []);

  const handleResetMode = useCallback(() => {
    resetModeRef.current();
  }, []);

  const repo = useGithubAuthAndRepo({
    workspace,
    tab,
    onLoadGithubFile,
    onLoadGithubFolder,
    onClose,
    onError: setError,
    onClearPushFeedback: handleClearFeedback,
    onResetPushModeOnRepoChange: handleResetMode,
  });

  const push = useGithubPushSync({
    workspace,
    isModularWorkspace,
    selectedRepo: repo.selectedRepo,
    selectedBranch: repo.selectedBranch,
    treeFiles: repo.treeFiles,
    loadRepoDetails: repo.loadRepoDetails,
    onSyncedGithubFile,
    onSyncedGithubFolder,
    onError: setError,
  });

  clearFeedbackRef.current = push.clearPushFeedback;
  resetModeRef.current = () => {
    if (linked || repoLinked) push.setPushMode('new-file');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <AuthStatusHeader
          authStatus={repo.authStatus}
          authLoading={repo.authLoading}
          connecting={repo.connecting}
          onConnect={repo.handleConnectGithub}
          onLogout={repo.handleLogout}
          onClose={onClose}
        />

        {/* Mode Tabs */}
        <div className="shrink-0 px-5 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setTab('browse');
                setError(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === 'browse'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Load from GitHub
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('push');
                setError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === 'push'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>Commit &amp; Push</span>
              {hasLocalChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('migrations');
                setError(null);
              }}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === 'migrations'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              SQL Migrations
            </button>
          </div>

          {(repoLinked || linked) && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 pb-1.5">
              <GitBranch className="w-3 h-3" />
              <span>
                {repoLinked
                  ? `${repoLinked.owner}/${repoLinked.repo}:${repoLinked.branch}/${repoLinked.schemaFolder}/`
                  : `${linked!.owner}/${linked!.repo}:${linked!.branch}/${linked!.path}`}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {repo.authStatus && !repo.authStatus.configured && (
            <OAuthConfigNotice
              callbackUrl={repo.authStatus.callbackUrl}
              copiedCallback={repo.copiedCallback}
              onCopyCallback={repo.handleCopyCallback}
            />
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {push.shaConflict && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <button
                    type="button"
                    onClick={push.handlePullLatest}
                    disabled={push.pullingLatest}
                    className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 font-medium hover:bg-rose-50"
                  >
                    Pull Latest Remote Version
                  </button>
                  <button
                    type="button"
                    onClick={() => push.handlePush(true)}
                    disabled={push.pushing}
                    className="px-2.5 py-1 rounded bg-rose-600 text-white font-medium hover:bg-rose-700"
                  >
                    Overwrite Remote with My Changes
                  </button>
                </div>
              )}
            </div>
          )}

          {repo.initBranchSuccess && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{repo.initBranchSuccess}</span>
            </div>
          )}

          {push.pushSuccess && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Pushed commit{' '}
                  <code className="font-mono">
                    {push.pushSuccess.commitSha.slice(0, 7)}
                  </code>{' '}
                  to <code className="font-mono">{push.pushSuccess.branch}</code>
                </span>
              </div>
              {(() => {
                const safeCommitUrl = sanitizeExternalUrl(push.pushSuccess.commitUrl);
                return safeCommitUrl ? (
                  <a
                    href={safeCommitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null;
              })()}
            </div>
          )}

          {push.batchPushSummary && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Pushed {push.batchPushSummary.fileCount} modular{' '}
                  {push.batchPushSummary.fileCount === 1 ? 'file' : 'files'} in
                  commit{' '}
                  <code className="font-mono">
                    {push.batchPushSummary.commitSha.slice(0, 7)}
                  </code>{' '}
                  to{' '}
                  <code className="font-mono">{push.batchPushSummary.branch}</code>{' '}
                  (<code className="font-mono">schema.dbml</code> kept local)
                </span>
              </div>
              {(() => {
                const safeCommitUrl = sanitizeExternalUrl(
                  push.batchPushSummary.commitUrl
                );
                return safeCommitUrl ? (
                  <a
                    href={safeCommitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
                  >
                    <span>View Commit</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null;
              })()}
            </div>
          )}

          <RepoSelectorCard
            repoInput={repo.repoInput}
            onRepoInputChange={repo.setRepoInput}
            selectedRepo={repo.selectedRepo}
            treeLoading={repo.treeLoading}
            loadingFile={repo.loadingFile}
            authStatus={repo.authStatus}
            connecting={repo.connecting}
            initBranchName={repo.initBranchName}
            onInitBranchNameChange={repo.setInitBranchName}
            initializingBranch={repo.initializingBranch}
            onSelectRepository={repo.handleSelectRepository}
            onChangeRepository={repo.handleChangeRepository}
            onCreateMainBranch={repo.handleCreateMainBranch}
            onConnectGithub={repo.handleConnectGithub}
          />

          {tab === 'browse' ? (
            <LoadFromGithubTab
              selectedRepo={repo.selectedRepo}
              selectedBranch={repo.selectedBranch}
              onBranchChange={repo.handleBranchChange}
              fileSearch={repo.fileSearch}
              onFileSearchChange={repo.setFileSearch}
              onlyDbmlFiles={repo.onlyDbmlFiles}
              onToggleOnlyDbml={repo.setOnlyDbmlFiles}
              treeLoading={repo.treeLoading}
              treeFilesCount={repo.treeFiles.length}
              filteredFiles={repo.filteredFiles}
              selectedFilePath={repo.selectedFilePath}
              onSelectFilePath={repo.setSelectedFilePath}
              canLoadFolder={Boolean(onLoadGithubFolder)}
              dbmlFolders={repo.dbmlFolders}
              selectedFolderToLoad={repo.selectedFolderToLoad}
              onSelectFolderToLoad={repo.setSelectedFolderToLoad}
              loadingFolder={repo.loadingFolder}
              onLoadFolder={repo.handleLoadSelectedFolder}
              openInNewWorkspace={repo.openInNewWorkspace}
              onChangeOpenInNewWorkspace={repo.setOpenInNewWorkspace}
              loadingFile={repo.loadingFile}
              onLoadFile={repo.handleLoadSelectedFile}
              onSwitchToPushTab={() => {
                setTab('push');
                setError(null);
              }}
            />
          ) : tab === 'push' ? (
            <PushToGithubTab
              workspace={workspace}
              isModularWorkspace={isModularWorkspace}
              linked={linked}
              repoLinked={repoLinked}
              hasLocalChanges={hasLocalChanges}
              hasModularLocalChanges={hasModularLocalChanges}
              authStatus={repo.authStatus}
              connecting={repo.connecting}
              onConnectGithub={repo.handleConnectGithub}
              selectedRepo={repo.selectedRepo}
              selectedBranch={repo.selectedBranch}
              onBranchChange={repo.handleBranchChange}
              pushMode={push.pushMode}
              onChangePushMode={push.setPushMode}
              targetFolderInput={push.targetFolderInput}
              onTargetFolderChange={push.setTargetFolderInput}
              targetPathInput={push.targetPathInput}
              onTargetPathChange={push.setTargetPathInput}
              selectedPushPaths={push.selectedPushPaths}
              setSelectedPushPaths={push.setSelectedPushPaths}
              previewDiffPath={push.previewDiffPath}
              onSelectPreviewDiffPath={push.setPreviewDiffPath}
              resolveModularPushPath={push.resolveModularPushPath}
              diffPreview={push.diffPreview}
              fullSchemaDiff={push.fullSchemaDiff}
              changedDiffLines={push.changedDiffLines}
              createNewBranch={push.createNewBranch}
              onChangeCreateNewBranch={push.setCreateNewBranch}
              newBranchName={push.newBranchName}
              onNewBranchNameChange={push.setNewBranchName}
              commitMessage={push.commitMessage}
              onCommitMessageChange={push.setCommitMessage}
              pullingLatest={push.pullingLatest}
              onPullLatest={push.handlePullLatest}
              pushing={push.pushing}
              hasVerifiedPushTarget={push.hasVerifiedPushTarget}
              onPush={() => push.handlePush(false)}
            />
          ) : (
            <GitCommitsMigrationTab
              workspace={workspace}
              isModularWorkspace={isModularWorkspace}
              linked={linked}
              repoLinked={repoLinked}
              hasLocalChanges={hasLocalChanges}
              selectedRepo={repo.selectedRepo}
              selectedBranch={repo.selectedBranch}
              onBranchChange={repo.handleBranchChange}
              treeFiles={repo.treeFiles}
              dbmlFolders={repo.dbmlFolders}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
};
