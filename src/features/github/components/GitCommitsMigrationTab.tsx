import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  GithubFileLink,
  GithubRepoLink,
  SchemaModuleFile,
  SqlDialect,
  WorkspaceProject,
} from '../../../types/schema';
import { isAbortError } from '../../../utils/apiClient';
import {
  getGithubCommits,
  getGithubFile,
  getGithubFolderFiles,
  GithubCommitInfo,
  GithubRepoInfo,
  GithubTreeFile,
} from '../../../utils/remoteService';
import { computeSchemaDiff } from '../../../utils/schemaDiff';
import { cleanFolderPrefix, mergeSchemaFiles } from '../../../utils/schemaModules';
import { SqlMigrationViewer } from '../../../components/SqlMigrationViewer';

export interface GitCommitsMigrationTabProps {
  workspace: WorkspaceProject;
  isModularWorkspace: boolean;
  linked?: GithubFileLink;
  repoLinked?: GithubRepoLink;
  hasLocalChanges: boolean;
  selectedRepo: GithubRepoInfo | null;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
  treeFiles: GithubTreeFile[];
  dbmlFolders: Array<{ folder: string; count: number }>;
  onError: (msg: string | null) => void;
}

export const GitCommitsMigrationTab: React.FC<GitCommitsMigrationTabProps> = ({
  workspace,
  isModularWorkspace,
  linked,
  repoLinked,
  hasLocalChanges,
  selectedRepo,
  selectedBranch,
  onBranchChange,
  treeFiles,
  dbmlFolders,
  onError,
}) => {
  const effectiveOwner =
    selectedRepo?.owner || repoLinked?.owner || linked?.owner || '';
  const effectiveRepo =
    selectedRepo?.repo || repoLinked?.repo || linked?.repo || '';
  const effectiveBranch =
    selectedBranch || repoLinked?.branch || linked?.branch || 'main';

  const dbmlFilesInTree = useMemo(
    () => treeFiles.filter((f) => f.isDbml),
    [treeFiles]
  );

  const [targetKind, setTargetKind] = useState<'folder' | 'file'>(() =>
    isModularWorkspace || repoLinked ? 'folder' : 'file'
  );
  const [targetFolder, setTargetFolder] = useState<string>(
    repoLinked?.schemaFolder ||
      workspace.schemaFolder ||
      dbmlFolders[0]?.folder ||
      'schema'
  );
  const [targetFilePath, setTargetFilePath] = useState<string>(
    linked?.path || dbmlFilesInTree[0]?.path || ''
  );

  useEffect(() => {
    if (!targetFilePath && dbmlFilesInTree.length > 0) {
      setTargetFilePath(dbmlFilesInTree[0].path);
    }
  }, [dbmlFilesInTree, targetFilePath]);

  useEffect(() => {
    if (
      !repoLinked &&
      dbmlFolders.length > 0 &&
      !dbmlFolders.some((f) => f.folder === targetFolder)
    ) {
      setTargetFolder(dbmlFolders[0].folder);
    }
  }, [dbmlFolders, repoLinked, targetFolder]);

  const [commits, setCommits] = useState<GithubCommitInfo[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [baseRef, setBaseRef] = useState<string>(() =>
    linked || repoLinked ? 'last-synced' : ''
  );
  const [targetRef, setTargetRef] = useState<string>('working');
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgres');

  const [baseDbml, setBaseDbml] = useState<string>('');
  const [targetDbml, setTargetDbml] = useState<string>('');
  const [loadingSql, setLoadingSql] = useState(false);

  const snapshotCacheRef = useRef<Map<string, string>>(new Map());
  const commitsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      commitsAbortRef.current?.abort();
    };
  }, []);

  const activePathFilter =
    targetKind === 'folder'
      ? cleanFolderPrefix(targetFolder)
      : targetFilePath.trim();

  const localWorkingDbml = useMemo(() => {
    if (isModularWorkspace && workspace.schemaFiles?.length) {
      return mergeSchemaFiles(workspace.schemaFiles, {
        schemaFolder: workspace.schemaFolder || targetFolder,
      }).mergedDbml;
    }
    return workspace.dbml;
  }, [
    isModularWorkspace,
    workspace.schemaFiles,
    workspace.schemaFolder,
    workspace.dbml,
    targetFolder,
  ]);

  const localLastSyncedDbml = useMemo(() => {
    if (isModularWorkspace && workspace.schemaFiles?.length) {
      const folder = repoLinked?.schemaFolder || workspace.schemaFolder || 'schema';
      const syncedFiles: SchemaModuleFile[] = workspace.schemaFiles
        .filter((f) => f.lastSyncedContent !== undefined)
        .map((f) => ({ ...f, content: f.lastSyncedContent || '' }));
      if (syncedFiles.length === 0) return null;
      return mergeSchemaFiles(syncedFiles, { schemaFolder: folder }).mergedDbml;
    }
    return linked?.lastSyncedDbml ?? null;
  }, [
    isModularWorkspace,
    workspace.schemaFiles,
    workspace.schemaFolder,
    repoLinked?.schemaFolder,
    linked?.lastSyncedDbml,
  ]);

  const fetchCommits = useCallback(async () => {
    if (!effectiveOwner || !effectiveRepo) return;
    commitsAbortRef.current?.abort();
    const controller = new AbortController();
    commitsAbortRef.current = controller;

    setLoadingCommits(true);
    onError(null);
    try {
      const res = await getGithubCommits({
        owner: effectiveOwner,
        repo: effectiveRepo,
        branch: effectiveBranch,
        path: activePathFilter || undefined,
        perPage: 25,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setCommits(res.commits);

      if (res.commits.length >= 2 && !hasLocalChanges) {
        setBaseRef((prev) =>
          prev && prev !== 'last-synced' ? prev : res.commits[1].sha
        );
        setTargetRef((prev) =>
          prev && prev !== 'working' ? prev : res.commits[0].sha
        );
      } else if (res.commits.length >= 1) {
        setBaseRef((prev) =>
          prev && prev !== 'last-synced' ? prev : res.commits[0].sha
        );
        setTargetRef('working');
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      onError(
        err instanceof Error ? err.message : 'Failed to load Git commit history.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingCommits(false);
      }
    }
  }, [
    effectiveOwner,
    effectiveRepo,
    effectiveBranch,
    activePathFilter,
    hasLocalChanges,
    onError,
  ]);

  useEffect(() => {
    if (effectiveOwner && effectiveRepo && !selectedRepo?.isEmpty) {
      void fetchCommits();
    }
    return () => {
      commitsAbortRef.current?.abort();
    };
  }, [effectiveOwner, effectiveRepo, effectiveBranch, activePathFilter, selectedRepo?.isEmpty, fetchCommits]);

  const resolveSnapshotDbml = useCallback(
    async (refKey: string, signal?: AbortSignal): Promise<string> => {
      if (!refKey) return '';
      if (refKey === 'working') return localWorkingDbml;
      if (refKey === 'last-synced') return localLastSyncedDbml || '';

      const cacheKey = `${effectiveOwner}/${effectiveRepo}:${refKey}:${targetKind}:${activePathFilter}`;
      const cached = snapshotCacheRef.current.get(cacheKey);
      if (cached !== undefined) return cached;

      if (targetKind === 'folder') {
        const res = await getGithubFolderFiles(
          effectiveOwner,
          effectiveRepo,
          refKey,
          cleanFolderPrefix(targetFolder),
          signal
        );
        const modFiles: SchemaModuleFile[] = res.files.map((f, i) => ({
          id: `cmp_${i}`,
          path: f.path,
          content: f.content,
          sha: f.sha,
        }));
        const merged = mergeSchemaFiles(modFiles, {
          schemaFolder: res.folder,
        }).mergedDbml;
        snapshotCacheRef.current.set(cacheKey, merged);
        return merged;
      }

      if (!targetFilePath.trim()) {
        throw new Error('Select a .dbml file path first.');
      }
      const file = await getGithubFile(
        effectiveOwner,
        effectiveRepo,
        targetFilePath.trim(),
        refKey,
        signal
      );
      snapshotCacheRef.current.set(cacheKey, file.content);
      return file.content;
    },
    [
      localWorkingDbml,
      localLastSyncedDbml,
      effectiveOwner,
      effectiveRepo,
      targetKind,
      activePathFilter,
      targetFolder,
      targetFilePath,
    ]
  );

  useEffect(() => {
    if (!baseRef || !targetRef) {
      setBaseDbml('');
      setTargetDbml('');
      return;
    }

    const controller = new AbortController();

    const loadSnapshots = async () => {
      setLoadingSql(true);
      onError(null);
      try {
        const [a, b] = await Promise.all([
          resolveSnapshotDbml(baseRef, controller.signal),
          resolveSnapshotDbml(targetRef, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setBaseDbml(a);
          setTargetDbml(b);
        }
      } catch (err) {
        if (!isAbortError(err) && !controller.signal.aborted) {
          onError(
            err instanceof Error
              ? err.message
              : 'Failed to load commit schema snapshots.'
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSql(false);
      }
    };

    void loadSnapshots();
    return () => {
      controller.abort();
    };
  }, [baseRef, targetRef, resolveSnapshotDbml, onError]);

  const diffResult = useMemo(
    () => computeSchemaDiff(baseDbml, targetDbml),
    [baseDbml, targetDbml]
  );

  const formatCommitOption = (c: GithubCommitInfo) => {
    const dateLabel = c.date ? new Date(c.date).toLocaleDateString() : '';
    const msg = c.message.length > 52 ? `${c.message.slice(0, 52)}…` : c.message;
    return `${c.shortSha} · ${msg}${dateLabel ? ` (${dateLabel})` : ''}`;
  };

  const formatRefLabel = (refKey: string) => {
    if (refKey === 'working') return 'Working Draft';
    if (refKey === 'last-synced') return 'Last Synced Commit';
    const commit = commits.find((c) => c.sha === refKey);
    return commit ? `git:${commit.shortSha}` : refKey.slice(0, 7);
  };

  if (!effectiveOwner || !effectiveRepo) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <FolderGit2 className="w-7 h-7 text-slate-400 mx-auto" />
        <div className="font-semibold text-slate-700 dark:text-slate-200">
          Select a repository in Step 1 first
        </div>
        <div>
          Enter <code className="font-mono">owner/repo</code> above to inspect Git commit history and generate incremental PostgreSQL or MySQL <code className="font-mono">ALTER</code> migrations.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Target Scope & Branch */}
      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
            <GitCommitHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Compare Git Commits → Incremental SQL (ALTER)</span>
          </div>

          <button
            type="button"
            onClick={fetchCommits}
            disabled={loadingCommits}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCommits ? 'animate-spin' : ''}`} />
            <span>Refresh Commits</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <GitBranch className="w-3 h-3" />
              <span>Branch</span>
            </label>
            <select
              value={effectiveBranch}
              onChange={(e) => onBranchChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {(selectedRepo?.branches.length
                ? selectedRepo.branches
                : [effectiveBranch]
              ).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              Schema Source
            </label>
            <select
              value={targetKind}
              onChange={(e) =>
                setTargetKind(e.target.value === 'folder' ? 'folder' : 'file')
              }
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="file">Single .dbml File</option>
              <option value="folder">Modular schema/ Folder</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-slate-500">
              {targetKind === 'folder' ? 'Folder Path' : 'File Path'}
            </label>
            {targetKind === 'folder' ? (
              <input
                type="text"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                placeholder="schema"
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            ) : dbmlFilesInTree.length > 0 ? (
              <select
                value={targetFilePath}
                onChange={(e) => setTargetFilePath(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {dbmlFilesInTree.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={targetFilePath}
                onChange={(e) => setTargetFilePath(e.target.value)}
                placeholder="schema.dbml"
                className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            )}
          </div>
        </div>

        {/* Commit Pair Pickers */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
          <div className="flex-1 space-y-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-500">
              Base Snapshot / Commit (Before)
            </label>
            <select
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="">Select base commit...</option>
              {localLastSyncedDbml !== null && (
                <option value="last-synced">
                  Last Synced Local Baseline
                </option>
              )}
              {commits.map((c) => (
                <option key={c.sha} value={c.sha}>
                  {formatCommitOption(c)}
                </option>
              ))}
              <option value="working">Working Draft (Local)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setBaseRef(targetRef);
              setTargetRef(baseRef);
            }}
            disabled={!baseRef || !targetRef}
            className="self-center sm:self-end p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            title="Swap base and target"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex-1 space-y-1 min-w-0">
            <label className="block text-[11px] font-medium text-slate-500">
              Target Snapshot / Commit (After)
            </label>
            <select
              value={targetRef}
              onChange={(e) => setTargetRef(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="working">Working Draft (Local)</option>
              {localLastSyncedDbml !== null && (
                <option value="last-synced">
                  Last Synced Local Baseline
                </option>
              )}
              {commits.map((c) => (
                <option key={c.sha} value={c.sha}>
                  {formatCommitOption(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!loadingCommits && commits.length === 0 && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          No commit history found for{' '}
          <code className="font-mono">{activePathFilter || 'this repository'}</code> on{' '}
          <code className="font-mono">{effectiveBranch}</code>.
        </div>
      )}

      {/* Generated Migration Script */}
      {loadingCommits || loadingSql ? (
        <div className="h-52 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {loadingCommits
              ? 'Loading Git commit history...'
              : 'Fetching commit snapshots & generating SQL migration...'}
          </span>
        </div>
      ) : !baseRef || !targetRef ? (
        <div className="p-6 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
          Choose both a Base commit and Target commit (or Working Draft) to generate incremental <code className="font-mono">ALTER</code> SQL statements.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                +{diffResult.summary.tablesAdded} tables
              </span>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ~{diffResult.summary.tablesModified} modified
              </span>
              <span>·</span>
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                -{diffResult.summary.tablesRemoved} removed
              </span>
              <span>·</span>
              <span>{diffResult.summary.indexesChanged} idx</span>
              <span>·</span>
              <span>{diffResult.summary.refsChanged} FK</span>
            </div>
            <span className="font-mono text-slate-500">
              {formatRefLabel(baseRef)} → {formatRefLabel(targetRef)}
            </span>
          </div>

          <SqlMigrationViewer
            diff={diffResult}
            dialect={sqlDialect}
            onChangeDialect={setSqlDialect}
            options={{
              baseLabel: formatRefLabel(baseRef),
              targetLabel: formatRefLabel(targetRef),
            }}
            maxHeightClass="max-h-72"
          />
        </div>
      )}
    </div>
  );
};
