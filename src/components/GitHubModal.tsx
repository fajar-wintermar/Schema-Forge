import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCode2,
  FolderGit2,
  GitBranch,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { GithubFileLink, WorkspaceProject } from '../types/schema';
import {
  getGithubAuthStatus,
  getGithubAuthUrl,
  getGithubFile,
  getGithubRepoInfo,
  getGithubTree,
  GithubAuthStatus,
  GithubFileResult,
  GithubPushResult,
  GithubRepoInfo,
  GithubRepoItem,
  GithubTreeFile,
  listGithubRepos,
  logoutGithub,
  parseGithubTargetInput,
  pushGithubFile,
  setStoredGithubSessionToken,
} from '../utils/remoteService';
import { computeSchemaDiff } from '../utils/schemaDiff';

interface GitHubModalProps {
  workspace: WorkspaceProject;
  initialTab?: 'browse' | 'push';
  onLoadGithubFile: (
    file: GithubFileResult,
    openInNewWorkspace: boolean
  ) => void;
  onSyncedGithubFile: (link: GithubFileLink, updatedDbml?: string) => void;
  onClose: () => void;
}

export const GitHubModal: React.FC<GitHubModalProps> = ({
  workspace,
  initialTab,
  onLoadGithubFile,
  onSyncedGithubFile,
  onClose,
}) => {
  const linked = workspace.githubLink;
  const hasLocalChanges = Boolean(
    linked && workspace.dbml !== linked.lastSyncedDbml
  );

  const [tab, setTab] = useState<'browse' | 'push'>(
    initialTab || (linked ? 'push' : 'browse')
  );

  // Auth state
  const [authStatus, setAuthStatus] = useState<GithubAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  // Repo browser state
  const [repos, setRepos] = useState<GithubRepoItem[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [quickRepoInput, setQuickRepoInput] = useState(
    linked ? `${linked.owner}/${linked.repo}` : ''
  );

  const [selectedRepo, setSelectedRepo] = useState<GithubRepoInfo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    linked?.branch || ''
  );
  const [treeFiles, setTreeFiles] = useState<GithubTreeFile[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [onlyDbmlFiles, setOnlyDbmlFiles] = useState(true);
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    linked?.path || ''
  );
  const [openInNewWorkspace, setOpenInNewWorkspace] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);

  // Push state
  const [pushMode, setPushMode] = useState<'linked' | 'new-file'>(
    linked ? 'linked' : 'new-file'
  );
  const [targetPathInput, setTargetPathInput] = useState(
    linked?.path ||
      `${
        workspace.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'schema'
      }.dbml`
  );
  const [commitMessage, setCommitMessage] = useState(
    linked
      ? `Update ${linked.path.split('/').pop() || 'schema.dbml'}`
      : 'Add DBML schema via SchemaForge'
  );
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pullingLatest, setPullingLatest] = useState(false);
  const [shaConflict, setShaConflict] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<GithubPushResult | null>(null);

  const [error, setError] = useState<string | null>(null);

  const refreshAuthAndRepos = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await getGithubAuthStatus();
      setAuthStatus(status);
      if (status.connected) {
        setReposLoading(true);
        try {
          const { repos: loadedRepos } = await listGithubRepos();
          setRepos(loadedRepos);
        } catch {
          // Non-fatal if repo list fails
        } finally {
          setReposLoading(false);
        }
      } else {
        setRepos([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check GitHub status.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuthAndRepos();
  }, [refreshAuthAndRepos]);

  // Listen for OAuth popup completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'github') {
        if (typeof event.data.sessionToken === 'string') {
          setStoredGithubSessionToken(event.data.sessionToken);
        }
        setConnecting(false);
        setError(null);
        refreshAuthAndRepos();
      } else if (
        event.data?.type === 'OAUTH_AUTH_ERROR' &&
        event.data?.provider === 'github'
      ) {
        setConnecting(false);
        setError(event.data.error || 'GitHub authentication failed.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshAuthAndRepos]);

  const loadRepoDetails = useCallback(
    async (owner: string, repo: string, preferredBranch?: string, preferredPath?: string) => {
      setError(null);
      setTreeLoading(true);
      try {
        const info = await getGithubRepoInfo(owner, repo);
        setSelectedRepo(info);
        const branchToUse =
          preferredBranch && info.branches.includes(preferredBranch)
            ? preferredBranch
            : info.default_branch;
        setSelectedBranch(branchToUse);
        const { files } = await getGithubTree(owner, repo, branchToUse);
        setTreeFiles(files);
        if (preferredPath) {
          setSelectedFilePath(preferredPath);
        } else {
          const firstDbml = files.find((f) => f.isDbml);
          setSelectedFilePath(firstDbml?.path || '');
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to inspect repository.'
        );
      } finally {
        setTreeLoading(false);
      }
    },
    []
  );

  // If workspace already linked to GitHub and user opens Browse, pre-select it cleanly
  useEffect(() => {
    if (linked && !selectedRepo) {
      loadRepoDetails(linked.owner, linked.repo, linked.branch, linked.path);
    }
  }, [linked, selectedRepo, loadRepoDetails]);

  const handleBranchChange = async (nextBranch: string) => {
    setSelectedBranch(nextBranch);
    if (!selectedRepo) return;
    setTreeLoading(true);
    setError(null);
    try {
      const { files } = await getGithubTree(
        selectedRepo.owner,
        selectedRepo.repo,
        nextBranch
      );
      setTreeFiles(files);
      if (!files.some((f) => f.path === selectedFilePath)) {
        const firstDbml = files.find((f) => f.isDbml);
        setSelectedFilePath(firstDbml?.path || '');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load branch files.'
      );
    } finally {
      setTreeLoading(false);
    }
  };

  const handleConnectGithub = async () => {
    setError(null);
    setConnecting(true);
    try {
      const { url } = await getGithubAuthUrl();
      const popup = window.open(
        url,
        'github_oauth_popup',
        'width=620,height=720'
      );
      if (!popup) {
        setConnecting(false);
        setError(
          'Popup was blocked by your browser. Allow popups for this site and click Connect GitHub again.'
        );
      }
    } catch (err) {
      setConnecting(false);
      setError(
        err instanceof Error ? err.message : 'Unable to start GitHub OAuth flow.'
      );
    }
  };

  const handleLogout = async () => {
    await logoutGithub();
    setRepos([]);
    setAuthStatus((prev) =>
      prev ? { ...prev, connected: false, user: null } : prev
    );
  };

  const handleQuickLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseGithubTargetInput(quickRepoInput);
    if (!parsed) {
      setError(
        'Enter owner/repo or a full GitHub URL (e.g. https://github.com/org/repo/blob/main/schema.dbml).'
      );
      return;
    }

    // If full path to a file was pasted, load it immediately!
    if (parsed.path && parsed.branch) {
      setLoadingFile(true);
      setError(null);
      try {
        const file = await getGithubFile(
          parsed.owner,
          parsed.repo,
          parsed.path,
          parsed.branch
        );
        onLoadGithubFile(file, openInNewWorkspace);
        onClose();
        return;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load GitHub file.'
        );
      } finally {
        setLoadingFile(false);
      }
    }

    await loadRepoDetails(parsed.owner, parsed.repo, parsed.branch, parsed.path);
  };

  const handleLoadSelectedFile = async () => {
    if (!selectedRepo || !selectedFilePath) return;
    setLoadingFile(true);
    setError(null);
    try {
      const file = await getGithubFile(
        selectedRepo.owner,
        selectedRepo.repo,
        selectedFilePath,
        selectedBranch
      );
      onLoadGithubFile(file, openInNewWorkspace);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load file from GitHub.'
      );
    } finally {
      setLoadingFile(false);
    }
  };

  const handlePullLatest = async () => {
    if (!linked) return;
    setPullingLatest(true);
    setError(null);
    setShaConflict(false);
    try {
      const remote = await getGithubFile(
        linked.owner,
        linked.repo,
        linked.path,
        linked.branch
      );
      onSyncedGithubFile(
        {
          owner: linked.owner,
          repo: linked.repo,
          branch: linked.branch,
          path: linked.path,
          sha: remote.sha,
          htmlUrl: remote.htmlUrl || linked.htmlUrl,
          lastSyncedDbml: remote.content,
          lastSyncedAt: new Date().toISOString(),
        },
        remote.content
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to pull latest file from GitHub.'
      );
    } finally {
      setPullingLatest(false);
    }
  };

  const handlePush = async (forceWithLatestSha = false) => {
    setError(null);
    setShaConflict(false);
    setPushSuccess(null);

    const targetOwner =
      pushMode === 'linked' && linked ? linked.owner : selectedRepo?.owner;
    const targetRepo =
      pushMode === 'linked' && linked ? linked.repo : selectedRepo?.repo;
    const targetBranch =
      pushMode === 'linked' && linked ? linked.branch : selectedBranch;
    const targetPath =
      pushMode === 'linked' && linked
        ? linked.path
        : targetPathInput.trim().replace(/^\/+/, '');
    const expectedSha =
      pushMode === 'linked' && linked
        ? linked.sha
        : treeFiles.find((f) => f.path === targetPath)?.sha;

    if (!targetOwner || !targetRepo || !targetBranch || !targetPath) {
      setError('Select a repository, branch, and file path first.');
      return;
    }
    if (!commitMessage.trim()) {
      setError('Enter a commit message.');
      return;
    }
    if (createNewBranch && !newBranchName.trim()) {
      setError('Enter a name for the new branch.');
      return;
    }

    setPushing(true);
    try {
      const result = await pushGithubFile({
        owner: targetOwner,
        repo: targetRepo,
        path: targetPath,
        branch: targetBranch,
        message: commitMessage.trim(),
        content: workspace.dbml,
        expectedSha,
        createNewBranch,
        newBranchName: createNewBranch ? newBranchName.trim() : undefined,
        forceWithLatestSha,
      });

      onSyncedGithubFile({
        owner: targetOwner,
        repo: targetRepo,
        branch: result.branch,
        path: result.path,
        sha: result.sha,
        htmlUrl: result.htmlUrl,
        lastSyncedDbml: workspace.dbml,
        lastSyncedAt: new Date().toISOString(),
      });
      setPushMode('linked');
      setCreateNewBranch(false);
      setNewBranchName('');
      setPushSuccess(result);
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (e.code === 'SHA_CONFLICT' || e.status === 409) {
        setShaConflict(true);
      }
      setError(e.message || 'Failed to push changes to GitHub.');
    } finally {
      setPushing(false);
    }
  };

  const filteredRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [repos, repoSearch]);

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    return treeFiles.filter((f) => {
      if (onlyDbmlFiles && !f.isDbml) return false;
      if (q && !f.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [treeFiles, fileSearch, onlyDbmlFiles]);

  const diffPreview = useMemo(() => {
    if (!linked || pushMode !== 'linked') return null;
    return computeSchemaDiff(linked.lastSyncedDbml, workspace.dbml);
  }, [linked, pushMode, workspace.dbml]);

  const changedDiffLines = useMemo(() => {
    if (!diffPreview) return [];
    return diffPreview.lineDiff.filter((l) => l.type !== 'context');
  }, [diffPreview]);

  const handleCopyCallback = async () => {
    if (!authStatus?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(authStatus.callbackUrl);
      setCopiedCallback(true);
      window.setTimeout(() => setCopiedCallback(false), 1800);
    } catch {
      // Ignore
    }
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
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FolderGit2 className="w-5 h-5 text-slate-800 dark:text-slate-100" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                GitHub Repository Sync
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Load DBML files from repositories, edit visually, and push commits back
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
                <img
                  src={authStatus.user.avatar_url}
                  alt={authStatus.user.login}
                  className="w-4 h-4 rounded-full"
                />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  @{authStatus.user.login}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
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
                onClick={handleConnectGithub}
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
          </div>

          {linked && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 pb-1.5">
              <GitBranch className="w-3 h-3" />
              <span>
                {linked.owner}/{linked.repo}:{linked.branch}/{linked.path}
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* OAuth configuration notice when env vars aren't set yet */}
          {authStatus && !authStatus.configured && (
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
                  <span className="truncate flex-1">{authStatus.callbackUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopyCallback}
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
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {shaConflict && (
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  <button
                    type="button"
                    onClick={handlePullLatest}
                    disabled={pullingLatest}
                    className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 font-medium hover:bg-rose-50"
                  >
                    Pull Latest Remote Version
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePush(true)}
                    disabled={pushing}
                    className="px-2.5 py-1 rounded bg-rose-600 text-white font-medium hover:bg-rose-700"
                  >
                    Overwrite Remote with My Changes
                  </button>
                </div>
              )}
            </div>
          )}

          {pushSuccess && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Pushed commit <code className="font-mono">{pushSuccess.commitSha.slice(0, 7)}</code> to{' '}
                  <code className="font-mono">{pushSuccess.branch}</code>
                </span>
              </div>
              <a
                href={pushSuccess.commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {tab === 'browse' ? (
            <div className="space-y-4">
              {/* Direct Repo or File URL Lookup */}
              <form onSubmit={handleQuickLookup} className="flex items-center gap-2">
                <input
                  type="text"
                  value={quickRepoInput}
                  onChange={(e) => setQuickRepoInput(e.target.value)}
                  placeholder="owner/repo or https://github.com/owner/repo/blob/main/schema.dbml"
                  className="flex-1 px-3 py-2 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loadingFile || treeLoading}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white whitespace-nowrap"
                >
                  {loadingFile ? 'Loading...' : 'Open / Browse'}
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left Column: Connected Repositories */}
                <div className="md:col-span-5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <span>Repositories</span>
                    {reposLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                  </div>

                  {authStatus?.connected ? (
                    <>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          placeholder="Filter your repositories..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                        />
                      </div>
                      <div className="h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                        {filteredRepos.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            {reposLoading ? 'Loading repositories...' : 'No matching repositories'}
                          </div>
                        ) : (
                          filteredRepos.map((r) => {
                            const active = selectedRepo?.full_name === r.full_name;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  setQuickRepoInput(r.full_name);
                                  loadRepoDetails(r.owner, r.name, r.default_branch);
                                }}
                                className={`w-full px-3 py-2 text-left transition-colors ${
                                  active
                                    ? 'bg-blue-50 dark:bg-blue-950/50'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold font-mono text-slate-800 dark:text-slate-100 truncate">
                                    {r.full_name}
                                  </span>
                                  {r.private && (
                                    <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                                  )}
                                </div>
                                {r.description && (
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {r.description}
                                  </div>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-64 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-4 flex flex-col items-center justify-center text-center space-y-3">
                      <FolderGit2 className="w-7 h-7 text-slate-400" />
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Connect GitHub to browse your private &amp; team repositories and push updates, or enter any public <code className="font-mono">owner/repo</code> above.
                      </div>
                      {authStatus?.configured && (
                        <button
                          type="button"
                          onClick={handleConnectGithub}
                          disabled={connecting}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                        >
                          Connect GitHub Account
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Branch & File Picker */}
                <div className="md:col-span-7 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {selectedRepo ? selectedRepo.full_name : 'Select a repository'}
                    </span>

                    {selectedRepo && (
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={selectedBranch}
                          onChange={(e) => handleBranchChange(e.target.value)}
                          className="px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
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
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        disabled={!selectedRepo}
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                        placeholder="Filter file paths..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 disabled:opacity-50"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyDbmlFiles}
                        onChange={(e) => setOnlyDbmlFiles(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>.dbml only</span>
                    </label>
                  </div>

                  <div className="h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                    {!selectedRepo ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400 p-4 text-center">
                        Pick a repository on the left or enter owner/repo above to inspect its files.
                      </div>
                    ) : treeLoading ? (
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
                        {onlyDbmlFiles && treeFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOnlyDbmlFiles(false)}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >
                            Show all {treeFiles.length} repository files
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
                            onClick={() => setSelectedFilePath(file.path)}
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
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="ghLoadTarget"
                      checked={openInNewWorkspace}
                      onChange={() => setOpenInNewWorkspace(true)}
                      className="text-blue-600"
                    />
                    <span>Open as new workspace</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="ghLoadTarget"
                      checked={!openInNewWorkspace}
                      onChange={() => setOpenInNewWorkspace(false)}
                      className="text-blue-600"
                    />
                    <span>Replace current workspace</span>
                  </label>
                </div>

                <button
                  type="button"
                  disabled={!selectedRepo || !selectedFilePath || loadingFile}
                  onClick={handleLoadSelectedFile}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
                >
                  {loadingFile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{loadingFile ? 'Loading...' : 'Load File'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Tab 2: Commit & Push to GitHub */
            <div className="space-y-4">
              {!authStatus?.connected ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
                  <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Sign in with GitHub to Push Changes
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      Connect your GitHub account to commit modified DBML schemas back to the repository or create a new branch.
                    </p>
                  </div>
                  {authStatus?.configured && (
                    <button
                      type="button"
                      onClick={handleConnectGithub}
                      disabled={connecting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                    >
                      <FolderGit2 className="w-3.5 h-3.5" />
                      <span>{connecting ? 'Connecting...' : 'Connect GitHub'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Target selector if linked vs saving new file */}
                  {linked && (
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
                          onClick={handlePullLatest}
                          disabled={pullingLatest}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${pullingLatest ? 'animate-spin' : ''}`}
                          />
                          <span>Pull Latest</span>
                        </button>
                        {linked.htmlUrl && (
                          <a
                            href={linked.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            title="Open file on GitHub"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {(!linked || pushMode === 'new-file') && (
                    <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Destination Repository &amp; File Path
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-500">
                            Repository
                          </label>
                          <select
                            value={selectedRepo?.full_name || ''}
                            onChange={(e) => {
                              const found = repos.find(
                                (r) => r.full_name === e.target.value
                              );
                              if (found) {
                                loadRepoDetails(
                                  found.owner,
                                  found.name,
                                  found.default_branch
                                );
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="">Select repository...</option>
                            {repos
                              .filter((r) => r.canPush)
                              .map((r) => (
                                <option key={r.id} value={r.full_name}>
                                  {r.full_name}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-medium text-slate-500">
                            Branch
                          </label>
                          <select
                            disabled={!selectedRepo}
                            value={selectedBranch}
                            onChange={(e) => handleBranchChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                          >
                            {(selectedRepo?.branches || ['main']).map((b) => (
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
                            onChange={(e) => setTargetPathInput(e.target.value)}
                            placeholder="docs/schema.dbml"
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Schema & Line Diff Preview when linked */}
                  {diffPreview && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Changes to Commit
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {changedDiffLines.length === 0
                            ? 'No edits since last sync'
                            : `${changedDiffLines.filter((l) => l.type === 'added').length} additions · ${changedDiffLines.filter((l) => l.type === 'removed').length} deletions`}
                        </span>
                      </div>
                      {changedDiffLines.length > 0 ? (
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
                          Your local DBML matches the latest synced GitHub commit.
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
                          onChange={() => setCreateNewBranch(false)}
                          className="text-blue-600"
                        />
                        <span>
                          Commit directly to{' '}
                          <code className="font-mono font-semibold">
                            {(pushMode === 'linked' && linked
                              ? linked.branch
                              : selectedBranch) || 'branch'}
                          </code>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
                        <input
                          type="radio"
                          name="pushBranchOption"
                          checked={createNewBranch}
                          onChange={() => setCreateNewBranch(true)}
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
                          onChange={(e) => setNewBranchName(e.target.value)}
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
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Update database schema in schema.dbml"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {linked ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPushMode((m) => (m === 'linked' ? 'new-file' : 'linked'))
                        }
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {pushMode === 'linked'
                          ? 'Push to a different repo or file path'
                          : 'Back to linked file'}
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      disabled={
                        pushing ||
                        (pushMode === 'linked' &&
                          Boolean(linked) &&
                          !hasLocalChanges &&
                          !createNewBranch)
                      }
                      onClick={() => handlePush(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
                    >
                      {pushing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UploadCloud className="w-3.5 h-3.5" />
                      )}
                      <span>{pushing ? 'Pushing...' : 'Commit & Push to GitHub'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
