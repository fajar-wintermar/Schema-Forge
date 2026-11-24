import React, { useState } from 'react';
import {
  ExternalLink,
  FolderGit2,
  FolderTree,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import {
  GithubFileLink,
  GithubRepoLink,
  LineDiffEntry,
  SchemaDiffResult,
  SchemaModuleFile,
  SqlDialect,
  WorkspaceProject,
} from '../../../types/schema';
import { GithubAuthStatus, GithubRepoInfo } from '../../../utils/remoteService';
import { cleanFolderPrefix } from '../../../utils/schemaModules';
import { SqlMigrationViewer } from '../../../components/SqlMigrationViewer';
import { sanitizeExternalUrl } from '../../../utils/urlSafety';

interface PushToGithubTabProps {
  workspace: WorkspaceProject;
  isModularWorkspace: boolean;
  linked?: GithubFileLink;
  repoLinked?: GithubRepoLink;
  hasLocalChanges: boolean;
  hasModularLocalChanges: boolean;
  authStatus: GithubAuthStatus | null;
  connecting: boolean;
  onConnectGithub: () => void;
  selectedRepo: GithubRepoInfo | null;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
  pushMode: 'linked' | 'new-file';
  onChangePushMode: React.Dispatch<React.SetStateAction<'linked' | 'new-file'>>;
  targetFolderInput: string;
  onTargetFolderChange: (val: string) => void;
  targetPathInput: string;
  onTargetPathChange: (val: string) => void;
  selectedPushPaths: string[];
  setSelectedPushPaths: React.Dispatch<React.SetStateAction<string[]>>;
  previewDiffPath: string;
  onSelectPreviewDiffPath: (path: string) => void;
  resolveModularPushPath: (filePath: string, destinationFolder: string) => string;
  diffPreview: { lineDiff: LineDiffEntry[] } | null;
  fullSchemaDiff: SchemaDiffResult | null;
  changedDiffLines: LineDiffEntry[];
  createNewBranch: boolean;
  onChangeCreateNewBranch: (val: boolean) => void;
  newBranchName: string;
  onNewBranchNameChange: (val: string) => void;
  commitMessage: string;
  onCommitMessageChange: (val: string) => void;
  pullingLatest: boolean;
  onPullLatest: () => void;
  pushing: boolean;
  hasVerifiedPushTarget: boolean;
  onPush: () => void;
}

export const PushToGithubTab: React.FC<PushToGithubTabProps> = ({
  workspace,
  isModularWorkspace,
  linked,
  repoLinked,
  hasLocalChanges,
  hasModularLocalChanges,
  authStatus,
  connecting,
  onConnectGithub,
  selectedRepo,
  selectedBranch,
  onBranchChange,
  pushMode,
  onChangePushMode,
  targetFolderInput,
  onTargetFolderChange,
  targetPathInput,
  onTargetPathChange,
  selectedPushPaths,
  setSelectedPushPaths,
  previewDiffPath,
  onSelectPreviewDiffPath,
  resolveModularPushPath,
  diffPreview,
  fullSchemaDiff,
  changedDiffLines,
  createNewBranch,
  onChangeCreateNewBranch,
  newBranchName,
  onNewBranchNameChange,
  commitMessage,
  onCommitMessageChange,
  pullingLatest,
  onPullLatest,
  pushing,
  hasVerifiedPushTarget,
  onPush,
}) => {
  const schemaFiles: SchemaModuleFile[] = workspace.schemaFiles || [];
  const [previewTab, setPreviewTab] = useState<'diff' | 'sql'>('diff');
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgres');

  if (!authStatus?.connected) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
        <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Sign in with GitHub to Push Changes
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Connect your GitHub account, then choose the target repository above before committing DBML changes.
          </p>
        </div>
        {authStatus?.configured && (
          <button
            type="button"
            onClick={onConnectGithub}
            disabled={connecting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>{connecting ? 'Connecting...' : 'Connect GitHub'}</span>
          </button>
        )}
      </div>
    );
  }

  if (
    !selectedRepo &&
    !(pushMode === 'linked' && (isModularWorkspace ? repoLinked : linked))
  ) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <ShieldCheck className="w-7 h-7 text-slate-400 mx-auto" />
        <div className="font-semibold text-slate-700 dark:text-slate-200">
          Choose your destination repository in Step 1 first
        </div>
        <div>
          Enter <code className="font-mono">owner/repo</code> above and click{' '}
          <span className="font-semibold">Select Repository</span> to configure branch, folder path, and push.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isModularWorkspace ? (
        <>
          <div className="px-3.5 py-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
            <FolderTree className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <span className="font-semibold">
                Modular Folder Sync (
                {repoLinked && pushMode === 'linked'
                  ? repoLinked.schemaFolder
                  : cleanFolderPrefix(targetFolderInput)}
                /):
              </span>{' '}
              Auto-generated <code className="font-mono font-semibold">schema.dbml</code> stays local for full-project viewing and is{' '}
              <span className="font-semibold">never pushed to GitHub</span> — only the checked per-table files below are committed.
            </div>
          </div>

          {repoLinked && pushMode === 'linked' && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span className="font-mono truncate">
                    {repoLinked.owner}/{repoLinked.repo}/{repoLinked.schemaFolder}/
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      hasModularLocalChanges
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {hasModularLocalChanges ? 'Modified' : 'In sync'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Branch: {repoLinked.branch} · Last synced{' '}
                  {new Date(repoLinked.lastSyncedAt).toLocaleString()}
                </div>
              </div>

              <button
                type="button"
                onClick={onPullLatest}
                disabled={pullingLatest}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${pullingLatest ? 'animate-spin' : ''}`}
                />
                <span>Pull Latest Folder</span>
              </button>
            </div>
          )}

          {(!repoLinked || pushMode === 'new-file') && selectedRepo && (
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Step 2 · Destination Branch &amp; Schema Folder
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    Branch
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => onBranchChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {(selectedRepo.branches.length > 0
                      ? selectedRepo.branches
                      : [selectedBranch || selectedRepo.default_branch || 'main']
                    ).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    Schema Folder
                  </label>
                  <input
                    type="text"
                    value={targetFolderInput}
                    onChange={(e) => onTargetFolderChange(e.target.value)}
                    placeholder="db/schema"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
          )}

          {/* File Checklist */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Modular Files to Commit ({selectedPushPaths.length}/{schemaFiles.length})
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPushPaths(
                      schemaFiles
                        .filter(
                          (f) =>
                            f.lastSyncedContent === undefined ||
                            f.content !== f.lastSyncedContent
                        )
                        .map((f) => f.path)
                    )
                  }
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Select Changed
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPushPaths(schemaFiles.map((f) => f.path))}
                  className="text-slate-600 dark:text-slate-400 hover:underline font-medium"
                >
                  Select All
                </button>
              </div>
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
              {[...schemaFiles]
                .sort((a, b) => a.path.localeCompare(b.path))
                .map((file) => {
                  const checked = selectedPushPaths.includes(file.path);
                  const isNew =
                    file.sha === undefined && file.lastSyncedContent === undefined;
                  const isModified =
                    file.lastSyncedContent !== undefined &&
                    file.content !== file.lastSyncedContent;
                  const destPath =
                    pushMode === 'linked' && repoLinked
                      ? file.path
                      : resolveModularPushPath(file.path, targetFolderInput);
                  const isPreview = previewDiffPath === file.path;

                  return (
                    <div
                      key={file.path}
                      className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                        isPreview
                          ? 'bg-blue-50/50 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPushPaths((prev) =>
                                prev.includes(file.path) ? prev : [...prev, file.path]
                              );
                            } else {
                              setSelectedPushPaths((prev) =>
                                prev.filter((p) => p !== file.path)
                              );
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onSelectPreviewDiffPath(file.path);
                          }}
                          className="font-mono text-slate-800 dark:text-slate-100 truncate hover:text-blue-600 dark:hover:text-blue-400 text-left"
                          title="Click to inspect line diff"
                        >
                          {destPath}
                        </button>
                      </label>

                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          isNew
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : isModified
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {isNew ? 'New' : isModified ? 'Modified' : 'In sync'}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      ) : (
        <>
          {linked && pushMode === 'linked' && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span className="font-mono truncate">
                    {linked.owner}/{linked.repo}/{linked.path}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      hasLocalChanges
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {hasLocalChanges ? 'Modified' : 'In sync'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  Branch: {linked.branch} · Last synced{' '}
                  {new Date(linked.lastSyncedAt).toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onPullLatest}
                  disabled={pullingLatest}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${pullingLatest ? 'animate-spin' : ''}`}
                  />
                  <span>Pull Latest</span>
                </button>
                {(() => {
                  const safeFileUrl = sanitizeExternalUrl(linked.htmlUrl);
                  return safeFileUrl ? (
                    <a
                      href={safeFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                      title="Open file on GitHub"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : null;
                })()}
              </div>
            </div>
          )}

          {(!linked || pushMode === 'new-file') && selectedRepo && (
            <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Step 2 · Destination Branch &amp; File Path
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    Branch
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => onBranchChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {(selectedRepo.branches.length > 0
                      ? selectedRepo.branches
                      : [selectedBranch || selectedRepo.default_branch || 'main']
                    ).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-500">
                    File Path
                  </label>
                  <input
                    type="text"
                    value={targetPathInput}
                    onChange={(e) => onTargetPathChange(e.target.value)}
                    placeholder="docs/schema.dbml"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Schema & Line Diff / SQL Migration Preview */}
      {(diffPreview || fullSchemaDiff) && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                {previewTab === 'sql'
                  ? 'SQL Migration (Last Synced → Working Draft)'
                  : isModularWorkspace
                  ? `Diff: ${previewDiffPath}`
                  : 'Changes to Commit'}
              </span>
              {fullSchemaDiff && (
                <div className="inline-flex items-center p-0.5 rounded bg-slate-200/70 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('diff')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      previewTab === 'diff'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    DBML Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('sql')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      previewTab === 'sql'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    SQL (ALTER)
                  </button>
                </div>
              )}
            </div>
            <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
              {previewTab === 'sql' && fullSchemaDiff
                ? `+${fullSchemaDiff.summary.tablesAdded} ~${fullSchemaDiff.summary.tablesModified} -${fullSchemaDiff.summary.tablesRemoved} tables · ${fullSchemaDiff.summary.indexesChanged} idx · ${fullSchemaDiff.summary.refsChanged} FK`
                : changedDiffLines.length === 0
                ? 'No edits since last sync'
                : `${changedDiffLines.filter((l) => l.type === 'added').length} additions · ${changedDiffLines.filter((l) => l.type === 'removed').length} deletions`}
            </span>
          </div>
          {previewTab === 'sql' && fullSchemaDiff ? (
            <div className="p-3 bg-white dark:bg-slate-950/60">
              <SqlMigrationViewer
                diff={fullSchemaDiff}
                dialect={sqlDialect}
                onChangeDialect={setSqlDialect}
                options={{
                  baseLabel: 'Last Synced Git Commit',
                  targetLabel: 'Working Draft',
                }}
                maxHeightClass="max-h-52"
              />
            </div>
          ) : changedDiffLines.length > 0 && diffPreview ? (
            <div className="max-h-40 overflow-y-auto font-mono text-[11px] divide-y divide-slate-100/60 dark:divide-slate-800/50 bg-white dark:bg-slate-950/60">
              {diffPreview.lineDiff
                .filter((l) => l.type !== 'context')
                .slice(0, 120)
                .map((entry, idx) => (
                  <div
                    key={idx}
                    className={`px-3 py-0.5 whitespace-pre ${
                      entry.type === 'added'
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/35 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50/80 dark:bg-rose-950/35 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    <span className="inline-block w-4 select-none opacity-70">
                      {entry.type === 'added' ? '+' : '-'}
                    </span>
                    {entry.text}
                  </div>
                ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
              Matches the last synced GitHub state.
            </div>
          )}
        </div>
      )}

      {/* Branch & Commit Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="radio"
              name="pushBranchOption"
              checked={!createNewBranch}
              onChange={() => onChangeCreateNewBranch(false)}
              className="text-blue-600"
            />
            <span>
              Commit directly to{' '}
              <code className="font-mono font-semibold">
                {(pushMode === 'linked' && (repoLinked || linked)
                  ? (repoLinked || linked)!.branch
                  : selectedBranch) || 'branch'}
              </code>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
            <input
              type="radio"
              name="pushBranchOption"
              checked={createNewBranch}
              onChange={() => onChangeCreateNewBranch(true)}
              className="text-blue-600"
            />
            <span>Create &amp; push to new branch</span>
          </label>
        </div>

        {createNewBranch && (
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              New Branch Name
            </label>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => onNewBranchNameChange(e.target.value)}
              placeholder="schema/update-tables"
              className="w-full px-3 py-2 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Commit Message
          </label>
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            placeholder="Update database schema modules"
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {(isModularWorkspace ? repoLinked : linked) ? (
          <button
            type="button"
            onClick={() =>
              onChangePushMode((m) => (m === 'linked' ? 'new-file' : 'linked'))
            }
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {pushMode === 'linked'
              ? isModularWorkspace
                ? 'Push to a different repo or folder'
                : 'Push to a different repo or file path'
              : 'Back to linked target'}
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          disabled={
            pushing ||
            !hasVerifiedPushTarget ||
            (isModularWorkspace
              ? selectedPushPaths.length === 0
              : pushMode === 'linked' &&
                Boolean(linked) &&
                !hasLocalChanges &&
                !createNewBranch)
          }
          onClick={onPush}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
        >
          {pushing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UploadCloud className="w-3.5 h-3.5" />
          )}
          <span>
            {pushing
              ? 'Pushing...'
              : isModularWorkspace
              ? `Commit & Push ${selectedPushPaths.length} ${
                  selectedPushPaths.length === 1 ? 'File' : 'Files'
                }`
              : 'Commit & Push to GitHub'}
          </span>
        </button>
      </div>
    </div>
  );
};
