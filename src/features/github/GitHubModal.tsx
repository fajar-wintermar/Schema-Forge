import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { SchemaModuleFile } from '../../types/schema';
import {
  getGithubAuthStatus,
  getGithubAuthUrl,
  getGithubFile,
  getGithubFolderFiles,
  getGithubRepoInfo,
  getGithubTree,
  GithubAuthStatus,
  GithubPushResult,
  GithubRepoInfo,
  GithubTreeFile,
  initGithubBranch,
  logoutGithub,
  parseGithubTargetInput,
  pushGithubBatch,
  pushGithubFile,
  setStoredGithubSessionToken,
} from '../../utils/remoteService';
import { computeSchemaDiff } from '../../utils/schemaDiff';
import { cleanFolderPrefix } from '../../utils/schemaModules';
import {
  AuthStatusHeader,
  OAuthConfigNotice,
} from './components/AuthStatusHeader';
import { LoadFromGithubTab } from './components/LoadFromGithubTab';
import { PushToGithubTab } from './components/PushToGithubTab';
import { RepoSelectorCard } from './components/RepoSelectorCard';
import { BatchPushSummary, GitHubModalProps } from './types';

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

  const [tab, setTab] = useState<'browse' | 'push'>(
    initialTab || (linked || repoLinked ? 'push' : 'browse')
  );

  // Auth state
  const [authStatus, setAuthStatus] = useState<GithubAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

  // Explicit single-repository selection state
  const [repoInput, setRepoInput] = useState(
    repoLinked
      ? `${repoLinked.owner}/${repoLinked.repo}`
      : linked
      ? `${linked.owner}/${linked.repo}`
      : ''
  );
  const [selectedRepo, setSelectedRepo] = useState<GithubRepoInfo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    repoLinked?.branch || linked?.branch || 'main'
  );
  const [initBranchName, setInitBranchName] = useState('main');
  const [initializingBranch, setInitializingBranch] = useState(false);
  const [initBranchSuccess, setInitBranchSuccess] = useState<string | null>(null);

  // File & folder browser state
  const [treeFiles, setTreeFiles] = useState<GithubTreeFile[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [onlyDbmlFiles, setOnlyDbmlFiles] = useState(true);
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    linked?.path || ''
  );
  const [selectedFolderToLoad, setSelectedFolderToLoad] = useState<string>(
    repoLinked?.schemaFolder || ''
  );
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [openInNewWorkspace, setOpenInNewWorkspace] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);

  // Push state
  const [pushMode, setPushMode] = useState<'linked' | 'new-file'>(
    linked || repoLinked ? 'linked' : 'new-file'
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
  const [targetFolderInput, setTargetFolderInput] = useState(
    repoLinked?.schemaFolder || workspace.schemaFolder || 'schema'
  );
  const [selectedPushPaths, setSelectedPushPaths] = useState<string[]>(() => {
    const files = workspace.schemaFiles || [];
    const dirty = files
      .filter(
        (f) => f.lastSyncedContent === undefined || f.content !== f.lastSyncedContent
      )
      .map((f) => f.path);
    return dirty.length > 0 ? dirty : files.map((f) => f.path);
  });
  const [previewDiffPath, setPreviewDiffPath] = useState<string>(() => {
    const files = workspace.schemaFiles || [];
    const firstDirty = files.find(
      (f) => f.lastSyncedContent === undefined || f.content !== f.lastSyncedContent
    );
    return firstDirty?.path || files[0]?.path || '';
  });
  const [commitMessage, setCommitMessage] = useState(
    isModularWorkspace
      ? `Update ${repoLinked?.schemaFolder || workspace.schemaFolder || 'schema'}/ DBML modules`
      : linked
      ? `Update ${linked.path.split('/').pop() || 'schema.dbml'}`
      : 'Add DBML schema via SchemaForge'
  );
  const [createNewBranch, setCreateNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pullingLatest, setPullingLatest] = useState(false);
  const [shaConflict, setShaConflict] = useState(false);
  const [pushSuccess, setPushSuccess] = useState<GithubPushResult | null>(null);
  const [batchPushSummary, setBatchPushSummary] = useState<BatchPushSummary | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refreshAuthStatus = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await getGithubAuthStatus();
      setAuthStatus(status);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check GitHub status.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuthStatus();
  }, [refreshAuthStatus]);

  const loadRepoDetails = useCallback(
    async (
      owner: string,
      repo: string,
      preferredBranch?: string,
      preferredPath?: string
    ) => {
      setError(null);
      setTreeLoading(true);
      try {
        const info = await getGithubRepoInfo(owner, repo);
        setSelectedRepo(info);
        setRepoInput(info.full_name);

        const branchToUse = info.isEmpty
          ? preferredBranch || info.default_branch || 'main'
          : preferredBranch && info.branches.includes(preferredBranch)
          ? preferredBranch
          : info.branches.includes(info.default_branch)
          ? info.default_branch
          : info.branches[0] || 'main';
        setSelectedBranch(branchToUse);

        if (info.isEmpty) {
          setTreeFiles([]);
          setSelectedFilePath('');
          return;
        }

        const { files } = await getGithubTree(owner, repo, branchToUse);
        setTreeFiles(files);
        if (preferredPath) {
          setSelectedFilePath(preferredPath);
        } else {
          const firstDbml = files.find((f) => f.isDbml);
          setSelectedFilePath(firstDbml?.path || '');
        }
      } catch (err) {
        setSelectedRepo(null);
        setTreeFiles([]);
        setError(
          err instanceof Error ? err.message : 'Failed to inspect repository.'
        );
      } finally {
        setTreeLoading(false);
      }
    },
    []
  );

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
      if (
        event.data?.type === 'OAUTH_AUTH_SUCCESS' &&
        event.data?.provider === 'github'
      ) {
        if (typeof event.data.sessionToken === 'string') {
          setStoredGithubSessionToken(event.data.sessionToken);
        }
        setConnecting(false);
        setError(null);
        refreshAuthStatus().then(() => {
          if (selectedRepo) {
            loadRepoDetails(
              selectedRepo.owner,
              selectedRepo.repo,
              selectedBranch
            );
          }
        });
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
  }, [refreshAuthStatus, selectedRepo, selectedBranch, loadRepoDetails]);

  useEffect(() => {
    if (authLoading) return;
    if (repoLinked && !selectedRepo) {
      loadRepoDetails(repoLinked.owner, repoLinked.repo, repoLinked.branch);
    } else if (linked && !selectedRepo) {
      loadRepoDetails(linked.owner, linked.repo, linked.branch, linked.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, repoLinked?.owner, repoLinked?.repo, linked?.owner, linked?.repo]);

  const handleBranchChange = async (nextBranch: string) => {
    setSelectedBranch(nextBranch);
    if (!selectedRepo) return;
    if (selectedRepo.isEmpty) {
      setTreeFiles([]);
      return;
    }
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
    setSelectedRepo(null);
    setTreeFiles([]);
    setInitBranchSuccess(null);
    setAuthStatus((prev) =>
      prev ? { ...prev, connected: false, user: null } : prev
    );
  };

  const handleSelectRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInitBranchSuccess(null);
    setPushSuccess(null);
    setBatchPushSummary(null);

    const parsed = parseGithubTargetInput(repoInput);
    if (!parsed) {
      setError(
        'Enter owner/repo (e.g. acme/database-schema) or a GitHub URL (e.g. https://github.com/acme/database-schema).'
      );
      return;
    }

    if (tab === 'browse' && parsed.path && parsed.branch) {
      setLoadingFile(true);
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

  const handleChangeRepository = () => {
    setSelectedRepo(null);
    setTreeFiles([]);
    setSelectedFilePath('');
    setInitBranchSuccess(null);
    setPushSuccess(null);
    setBatchPushSummary(null);
    setError(null);
    if (linked || repoLinked) {
      setPushMode('new-file');
    }
  };

  const handleCreateMainBranch = async () => {
    if (!selectedRepo) return;
    const cleanBranch = initBranchName.trim() || 'main';
    setInitializingBranch(true);
    setError(null);
    setInitBranchSuccess(null);
    try {
      const res = await initGithubBranch(
        selectedRepo.owner,
        selectedRepo.repo,
        cleanBranch
      );
      setInitBranchSuccess(
        res.alreadyExists
          ? `Branch "${res.branch}" already exists.`
          : `Created "${res.branch}" branch in ${selectedRepo.full_name}.`
      );
      await loadRepoDetails(selectedRepo.owner, selectedRepo.repo, res.branch);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to create "${cleanBranch}" branch.`
      );
    } finally {
      setInitializingBranch(false);
    }
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

  const dbmlFolders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of treeFiles) {
      if (!f.isDbml) continue;
      const slash = f.path.lastIndexOf('/');
      if (slash <= 0) continue;
      const dir = f.path.slice(0, slash);
      counts.set(dir, (counts.get(dir) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([folder, count]) => ({ folder, count }))
      .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
  }, [treeFiles]);

  useEffect(() => {
    if (dbmlFolders.length === 0) {
      setSelectedFolderToLoad('');
    } else if (
      !selectedFolderToLoad ||
      !dbmlFolders.some((d) => d.folder === selectedFolderToLoad)
    ) {
      setSelectedFolderToLoad(dbmlFolders[0].folder);
    }
  }, [dbmlFolders, selectedFolderToLoad]);

  const handleLoadSelectedFolder = async () => {
    if (!selectedRepo || !selectedFolderToLoad || !onLoadGithubFolder) return;
    setLoadingFolder(true);
    setError(null);
    try {
      const result = await getGithubFolderFiles(
        selectedRepo.owner,
        selectedRepo.repo,
        selectedBranch,
        selectedFolderToLoad
      );
      onLoadGithubFolder(result, openInNewWorkspace);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load modular DBML folder from GitHub.'
      );
    } finally {
      setLoadingFolder(false);
    }
  };

  const handlePullLatest = async () => {
    if (isModularWorkspace && repoLinked && onSyncedGithubFolder) {
      setPullingLatest(true);
      setError(null);
      setShaConflict(false);
      try {
        const res = await getGithubFolderFiles(
          repoLinked.owner,
          repoLinked.repo,
          repoLinked.branch,
          repoLinked.schemaFolder
        );
        const now = new Date().toISOString();
        const nextFiles: SchemaModuleFile[] = res.files.map((f, idx) => ({
          id: `mod_gh_${Date.now()}_${idx}`,
          path: f.path,
          content: f.content,
          sha: f.sha,
          lastSyncedContent: f.content,
          lastSyncedAt: now,
        }));
        onSyncedGithubFolder(
          {
            owner: res.owner,
            repo: res.repo,
            branch: res.branch,
            schemaFolder: res.folder,
            lastSyncedAt: now,
          },
          nextFiles,
          true
        );
        setSelectedPushPaths([]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to pull latest folder from GitHub.'
        );
      } finally {
        setPullingLatest(false);
      }
      return;
    }

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

  const resolveModularPushPath = useCallback(
    (filePath: string, destinationFolder: string): string => {
      const cleanDest = cleanFolderPrefix(destinationFolder);
      const sourceFolder = cleanFolderPrefix(
        repoLinked?.schemaFolder || workspace.schemaFolder || 'schema'
      );
      if (filePath.startsWith(`${sourceFolder}/`)) {
        return `${cleanDest}/${filePath.slice(sourceFolder.length + 1)}`;
      }
      const base = filePath.split('/').pop() || filePath;
      return `${cleanDest}/${base}`;
    },
    [repoLinked?.schemaFolder, workspace.schemaFolder]
  );

  const handlePushModularBatch = async (forceWithLatestSha = false) => {
    setError(null);
    setShaConflict(false);
    setPushSuccess(null);
    setBatchPushSummary(null);

    const targetOwner =
      pushMode === 'linked' && repoLinked ? repoLinked.owner : selectedRepo?.owner;
    const targetRepo =
      pushMode === 'linked' && repoLinked ? repoLinked.repo : selectedRepo?.repo;
    const targetBranch =
      pushMode === 'linked' && repoLinked ? repoLinked.branch : selectedBranch;
    const destFolder = cleanFolderPrefix(
      pushMode === 'linked' && repoLinked
        ? repoLinked.schemaFolder
        : targetFolderInput
    );

    if (!targetOwner || !targetRepo || !targetBranch) {
      setError('Choose and verify a repository first.');
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

    const allFiles = workspace.schemaFiles || [];
    const chosenFiles = allFiles.filter((f) => selectedPushPaths.includes(f.path));
    if (chosenFiles.length === 0) {
      setError('Select at least one modular .dbml file to push.');
      return;
    }

    const payloadFiles = chosenFiles.map((f) => {
      const resolvedPath =
        pushMode === 'linked' && repoLinked
          ? f.path
          : resolveModularPushPath(f.path, destFolder);
      const matchingTreeSha =
        pushMode === 'linked' && repoLinked
          ? f.sha
          : treeFiles.find((tf) => tf.path === resolvedPath)?.sha;
      return {
        originalPath: f.path,
        path: resolvedPath,
        content: f.content,
        expectedSha: matchingTreeSha,
      };
    });

    setPushing(true);
    try {
      const result = await pushGithubBatch({
        owner: targetOwner,
        repo: targetRepo,
        branch: targetBranch,
        message: commitMessage.trim(),
        files: payloadFiles.map(({ path, content, expectedSha }) => ({
          path,
          content,
          expectedSha,
        })),
        createNewBranch,
        newBranchName: createNewBranch ? newBranchName.trim() : undefined,
        forceWithLatestSha,
      });

      const now = new Date().toISOString();
      const returnedByPath = new Map(result.files.map((rf) => [rf.path, rf]));
      const pushedByOriginal = new Map(
        payloadFiles.map((pf) => [pf.originalPath, pf.path])
      );

      const updatedModules: SchemaModuleFile[] = allFiles.map((f) => {
        const pushedPath = pushedByOriginal.get(f.path);
        if (!pushedPath) return f;
        const pushedMeta = returnedByPath.get(pushedPath);
        return {
          ...f,
          path: pushedPath,
          sha: pushedMeta?.sha || f.sha,
          lastSyncedContent: f.content,
          lastSyncedAt: now,
        };
      });

      onSyncedGithubFolder?.(
        {
          owner: targetOwner,
          repo: targetRepo,
          branch: result.branch,
          schemaFolder: destFolder,
          lastSyncedAt: now,
        },
        updatedModules,
        false
      );

      setPushMode('linked');
      setCreateNewBranch(false);
      setNewBranchName('');
      setSelectedPushPaths([]);
      setBatchPushSummary({
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
        branch: result.branch,
        fileCount: result.files.length,
      });

      loadRepoDetails(targetOwner, targetRepo, result.branch);
    } catch (err) {
      const e = err as Error & { code?: string; status?: number };
      if (e.code === 'SHA_CONFLICT' || e.status === 409) {
        setShaConflict(true);
      }
      setError(e.message || 'Failed to push modular files to GitHub.');
    } finally {
      setPushing(false);
    }
  };

  const handlePush = async (forceWithLatestSha = false) => {
    if (isModularWorkspace) {
      await handlePushModularBatch(forceWithLatestSha);
      return;
    }

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
      setError('Choose a repository, branch, and file path first.');
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

      loadRepoDetails(targetOwner, targetRepo, result.branch, result.path);
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

  const filteredFiles = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    return treeFiles.filter((f) => {
      if (onlyDbmlFiles && !f.isDbml) return false;
      if (q && !f.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [treeFiles, fileSearch, onlyDbmlFiles]);

  const diffPreview = useMemo(() => {
    if (isModularWorkspace) {
      const file = workspace.schemaFiles?.find((f) => f.path === previewDiffPath);
      if (!file) return null;
      return computeSchemaDiff(file.lastSyncedContent || '', file.content);
    }
    if (!linked || pushMode !== 'linked') return null;
    return computeSchemaDiff(linked.lastSyncedDbml, workspace.dbml);
  }, [
    isModularWorkspace,
    workspace.schemaFiles,
    previewDiffPath,
    linked,
    pushMode,
    workspace.dbml,
  ]);

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

  const hasVerifiedPushTarget = Boolean(
    (pushMode === 'linked' && (isModularWorkspace ? repoLinked : linked)) ||
      (selectedRepo && selectedRepo.canPush)
  );

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
          authStatus={authStatus}
          authLoading={authLoading}
          connecting={connecting}
          onConnect={handleConnectGithub}
          onLogout={handleLogout}
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
          {authStatus && !authStatus.configured && (
            <OAuthConfigNotice
              callbackUrl={authStatus.callbackUrl}
              copiedCallback={copiedCallback}
              onCopyCallback={handleCopyCallback}
            />
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

          {initBranchSuccess && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{initBranchSuccess}</span>
            </div>
          )}

          {pushSuccess && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Pushed commit{' '}
                  <code className="font-mono">{pushSuccess.commitSha.slice(0, 7)}</code>{' '}
                  to <code className="font-mono">{pushSuccess.branch}</code>
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

          {batchPushSummary && (
            <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Pushed {batchPushSummary.fileCount} modular{' '}
                  {batchPushSummary.fileCount === 1 ? 'file' : 'files'} in commit{' '}
                  <code className="font-mono">
                    {batchPushSummary.commitSha.slice(0, 7)}
                  </code>{' '}
                  to <code className="font-mono">{batchPushSummary.branch}</code> (
                  <code className="font-mono">schema.dbml</code> kept local)
                </span>
              </div>
              <a
                href={batchPushSummary.commitUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
              >
                <span>View Commit</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          <RepoSelectorCard
            repoInput={repoInput}
            onRepoInputChange={setRepoInput}
            selectedRepo={selectedRepo}
            treeLoading={treeLoading}
            loadingFile={loadingFile}
            authStatus={authStatus}
            connecting={connecting}
            initBranchName={initBranchName}
            onInitBranchNameChange={setInitBranchName}
            initializingBranch={initializingBranch}
            onSelectRepository={handleSelectRepository}
            onChangeRepository={handleChangeRepository}
            onCreateMainBranch={handleCreateMainBranch}
            onConnectGithub={handleConnectGithub}
          />

          {tab === 'browse' ? (
            <LoadFromGithubTab
              selectedRepo={selectedRepo}
              selectedBranch={selectedBranch}
              onBranchChange={handleBranchChange}
              fileSearch={fileSearch}
              onFileSearchChange={setFileSearch}
              onlyDbmlFiles={onlyDbmlFiles}
              onToggleOnlyDbml={setOnlyDbmlFiles}
              treeLoading={treeLoading}
              treeFilesCount={treeFiles.length}
              filteredFiles={filteredFiles}
              selectedFilePath={selectedFilePath}
              onSelectFilePath={setSelectedFilePath}
              canLoadFolder={Boolean(onLoadGithubFolder)}
              dbmlFolders={dbmlFolders}
              selectedFolderToLoad={selectedFolderToLoad}
              onSelectFolderToLoad={setSelectedFolderToLoad}
              loadingFolder={loadingFolder}
              onLoadFolder={handleLoadSelectedFolder}
              openInNewWorkspace={openInNewWorkspace}
              onChangeOpenInNewWorkspace={setOpenInNewWorkspace}
              loadingFile={loadingFile}
              onLoadFile={handleLoadSelectedFile}
              onSwitchToPushTab={() => {
                setTab('push');
                setError(null);
              }}
            />
          ) : (
            <PushToGithubTab
              workspace={workspace}
              isModularWorkspace={isModularWorkspace}
              linked={linked}
              repoLinked={repoLinked}
              hasLocalChanges={hasLocalChanges}
              hasModularLocalChanges={hasModularLocalChanges}
              authStatus={authStatus}
              connecting={connecting}
              onConnectGithub={handleConnectGithub}
              selectedRepo={selectedRepo}
              selectedBranch={selectedBranch}
              onBranchChange={handleBranchChange}
              pushMode={pushMode}
              onChangePushMode={setPushMode}
              targetFolderInput={targetFolderInput}
              onTargetFolderChange={setTargetFolderInput}
              targetPathInput={targetPathInput}
              onTargetPathChange={setTargetPathInput}
              selectedPushPaths={selectedPushPaths}
              setSelectedPushPaths={setSelectedPushPaths}
              previewDiffPath={previewDiffPath}
              onSelectPreviewDiffPath={setPreviewDiffPath}
              resolveModularPushPath={resolveModularPushPath}
              diffPreview={diffPreview}
              changedDiffLines={changedDiffLines}
              createNewBranch={createNewBranch}
              onChangeCreateNewBranch={setCreateNewBranch}
              newBranchName={newBranchName}
              onNewBranchNameChange={setNewBranchName}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              pullingLatest={pullingLatest}
              onPullLatest={handlePullLatest}
              pushing={pushing}
              hasVerifiedPushTarget={hasVerifiedPushTarget}
              onPush={() => handlePush(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
