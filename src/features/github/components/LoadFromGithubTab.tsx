import React from 'react';
import {
  FileCode2,
  FolderGit2,
  FolderTree,
  GitBranch,
  Loader2,
  Search,
  UploadCloud,
} from 'lucide-react';
import { GithubRepoInfo, GithubTreeFile } from '../../../services/api/remoteService';

interface LoadFromGithubTabProps {
  selectedRepo: GithubRepoInfo | null;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
  fileSearch: string;
  onFileSearchChange: (q: string) => void;
  onlyDbmlFiles: boolean;
  onToggleOnlyDbml: (val: boolean) => void;
  treeLoading: boolean;
  treeFilesCount: number;
  filteredFiles: GithubTreeFile[];
  selectedFilePath: string;
  onSelectFilePath: (path: string) => void;
  canLoadFolder: boolean;
  dbmlFolders: Array<{ folder: string; count: number }>;
  selectedFolderToLoad: string;
  onSelectFolderToLoad: (folder: string) => void;
  loadingFolder: boolean;
  onLoadFolder: () => void;
  openInNewWorkspace: boolean;
  onChangeOpenInNewWorkspace: (val: boolean) => void;
  loadingFile: boolean;
  onLoadFile: () => void;
  onSwitchToPushTab: () => void;
}

export const LoadFromGithubTab: React.FC<LoadFromGithubTabProps> = ({
  selectedRepo,
  selectedBranch,
  onBranchChange,
  fileSearch,
  onFileSearchChange,
  onlyDbmlFiles,
  onToggleOnlyDbml,
  treeLoading,
  treeFilesCount,
  filteredFiles,
  selectedFilePath,
  onSelectFilePath,
  canLoadFolder,
  dbmlFolders,
  selectedFolderToLoad,
  onSelectFolderToLoad,
  loadingFolder,
  onLoadFolder,
  openInNewWorkspace,
  onChangeOpenInNewWorkspace,
  loadingFile,
  onLoadFile,
  onSwitchToPushTab,
}) => {
  return (
    <div className="space-y-4">
      {!selectedRepo ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          <FolderGit2 className="w-7 h-7 text-slate-400 mx-auto" />
          <div className="font-semibold text-slate-700 dark:text-slate-200">
            Select a repository in Step 1 to browse and load DBML files
          </div>
          <div>
            Enter <code className="font-mono">owner/repo</code> or paste a GitHub repository or file URL above.
          </div>
        </div>
      ) : selectedRepo.isEmpty ? (
        <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
          <div>
            Repository <code className="font-mono font-semibold">{selectedRepo.full_name}</code> has no commits or branches to load yet.
          </div>
          <button
            type="button"
            onClick={onSwitchToPushTab}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Push Current Project to Initialize</span>
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Step 2 · Load File or Modular Folder
              </span>
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedBranch}
                  onChange={(e) => onBranchChange(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {(selectedRepo.branches.length > 0
                    ? selectedRepo.branches
                    : [selectedRepo.default_branch]
                  ).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => onFileSearchChange(e.target.value)}
                  placeholder="Filter file paths..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyDbmlFiles}
                  onChange={(e) => onToggleOnlyDbml(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>.dbml only</span>
              </label>
            </div>

            <div className="h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
              {treeLoading ? (
                <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading files...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 p-4 text-center gap-2">
                  <span>
                    {onlyDbmlFiles
                      ? 'No .dbml files found on this branch.'
                      : 'No matching files found.'}
                  </span>
                  {onlyDbmlFiles && treeFilesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onToggleOnlyDbml(false)}
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Show all {treeFilesCount} repository files
                    </button>
                  )}
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const active = selectedFilePath === file.path;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => onSelectFilePath(file.path)}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            file.isDbml
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-400'
                          }`}
                        />
                        <span className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate">
                          {file.path}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
                        {file.size > 1024
                          ? `${(file.size / 1024).toFixed(1)} KB`
                          : `${file.size} B`}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {canLoadFolder && dbmlFolders.length > 0 && (
            <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <FolderTree className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    Load Modular Schema Folder
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Loads all <code className="font-mono">.dbml</code> files in the folder and merges{' '}
                    <code className="font-mono">schema.dbml</code> locally on the fly
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedFolderToLoad}
                  onChange={(e) => onSelectFolderToLoad(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100"
                >
                  {dbmlFolders.map((d) => (
                    <option key={d.folder} value={d.folder}>
                      {d.folder}/ ({d.count} files)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={loadingFolder || !selectedFolderToLoad}
                  onClick={onLoadFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white whitespace-nowrap"
                >
                  {loadingFolder && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  <span>
                    {loadingFolder ? 'Loading Folder...' : 'Load Folder'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="ghLoadTarget"
                  checked={openInNewWorkspace}
                  onChange={() => onChangeOpenInNewWorkspace(true)}
                  className="text-blue-600"
                />
                <span>Open as new workspace</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                <input
                  type="radio"
                  name="ghLoadTarget"
                  checked={!openInNewWorkspace}
                  onChange={() => onChangeOpenInNewWorkspace(false)}
                  className="text-blue-600"
                />
                <span>Replace current workspace</span>
              </label>
            </div>

            <button
              type="button"
              disabled={!selectedRepo || !selectedFilePath || loadingFile}
              onClick={onLoadFile}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
            >
              {loadingFile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loadingFile ? 'Loading...' : 'Load Single File'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
