import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAbortError } from '../../../services/api/apiClient';
import {
  getGithubAuthStatus,
  getGithubAuthUrl,
  getGithubFile,
  getGithubFolderFiles,
  getGithubRepoInfo,
  getGithubTree,
  GithubAuthStatus,
  GithubFileResult,
  GithubFolderResult,
  GithubRepoInfo,
  GithubTreeFile,
  initGithubBranch,
  logoutGithub,
  setStoredGithubSessionToken,
} from '../../../services/api/remoteService';
import { parseGithubTargetInput } from '@shared/domain/github/githubTargetParser';
import { isTrustedOAuthMessageOrigin } from '../../../utils/urlSafety';
import { WorkspaceProject } from '@shared/domain/schemaTypes';

export interface UseGithubAuthAndRepoParams {
  workspace: WorkspaceProject;
  tab: 'browse' | 'push' | 'migrations';
  onLoadGithubFile: (file: GithubFileResult, openInNewWorkspace: boolean) => void;
  onLoadGithubFolder?: (
    folderResult: GithubFolderResult,
    openInNewWorkspace: boolean
  ) => void;
  onClose: () => void;
  onError: (msg: string | null) => void;
  onClearPushFeedback: () => void;
  onResetPushModeOnRepoChange: () => void;
}

export function useGithubAuthAndRepo({
  workspace,
  tab,
  onLoadGithubFile,
  onLoadGithubFolder,
  onClose,
  onError,
  onClearPushFeedback,
  onResetPushModeOnRepoChange,
}: UseGithubAuthAndRepoParams) {
  const linked = workspace.githubLink;
  const repoLinked = workspace.githubRepoLink;

  const [authStatus, setAuthStatus] = useState<GithubAuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);

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

  const authAbortRef = useRef<AbortController | null>(null);
  const repoAbortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const autoLoadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      authAbortRef.current?.abort();
      repoAbortRef.current?.abort();
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const refreshAuthStatus = useCallback(async () => {
    authAbortRef.current?.abort();
    const controller = new AbortController();
    authAbortRef.current = controller;

    setAuthLoading(true);
    try {
      const status = await getGithubAuthStatus(controller.signal);
      if (controller.signal.aborted) return;
      setAuthStatus(status);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      onError(
        err instanceof Error ? err.message : 'Failed to check GitHub status.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setAuthLoading(false);
      }
    }
  }, [onError]);

  useEffect(() => {
    void refreshAuthStatus();
    return () => {
      authAbortRef.current?.abort();
    };
  }, [refreshAuthStatus]);

  const loadRepoDetails = useCallback(
    async (
      owner: string,
      repo: string,
      preferredBranch?: string,
      preferredPath?: string
    ) => {
      repoAbortRef.current?.abort();
      const controller = new AbortController();
      repoAbortRef.current = controller;

      onError(null);
      setTreeLoading(true);
      try {
        const info = await getGithubRepoInfo(owner, repo, controller.signal);
        if (controller.signal.aborted) return;
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

        const { files } = await getGithubTree(
          owner,
          repo,
          branchToUse,
          controller.signal
        );
        if (controller.signal.aborted) return;
        setTreeFiles(files);
        if (preferredPath) {
          setSelectedFilePath(preferredPath);
        } else {
          const firstDbml = files.find((f) => f.isDbml);
          setSelectedFilePath(firstDbml?.path || '');
        }
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return;
        setSelectedRepo(null);
        setTreeFiles([]);
        onError(
          err instanceof Error ? err.message : 'Failed to inspect repository.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setTreeLoading(false);
        }
      }
    },
    [onError]
  );

  // Listen for OAuth popup completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedOAuthMessageOrigin(event.origin)) {
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
        onError(null);
        void refreshAuthStatus().then(() => {
          if (selectedRepo) {
            void loadRepoDetails(
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
        onError(event.data.error || 'GitHub authentication failed.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refreshAuthStatus, selectedRepo, selectedBranch, loadRepoDetails, onError]);

  useEffect(() => {
    if (authLoading || selectedRepo) return;
    if (repoLinked) {
      const key = `repo:${repoLinked.owner}/${repoLinked.repo}:${repoLinked.branch}`;
      if (autoLoadedKeyRef.current === key) return;
      autoLoadedKeyRef.current = key;
      void loadRepoDetails(repoLinked.owner, repoLinked.repo, repoLinked.branch);
    } else if (linked) {
      const key = `file:${linked.owner}/${linked.repo}:${linked.branch}:${linked.path}`;
      if (autoLoadedKeyRef.current === key) return;
      autoLoadedKeyRef.current = key;
      void loadRepoDetails(
        linked.owner,
        linked.repo,
        linked.branch,
        linked.path
      );
    }
  }, [authLoading, selectedRepo, repoLinked, linked, loadRepoDetails]);

  const handleBranchChange = async (nextBranch: string) => {
    setSelectedBranch(nextBranch);
    if (!selectedRepo) return;
    if (selectedRepo.isEmpty) {
      setTreeFiles([]);
      return;
    }
    repoAbortRef.current?.abort();
    const controller = new AbortController();
    repoAbortRef.current = controller;

    setTreeLoading(true);
    onError(null);
    try {
      const { files } = await getGithubTree(
        selectedRepo.owner,
        selectedRepo.repo,
        nextBranch,
        controller.signal
      );
      if (controller.signal.aborted) return;
      setTreeFiles(files);
      if (!files.some((f) => f.path === selectedFilePath)) {
        const firstDbml = files.find((f) => f.isDbml);
        setSelectedFilePath(firstDbml?.path || '');
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      onError(
        err instanceof Error ? err.message : 'Failed to load branch files.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setTreeLoading(false);
      }
    }
  };

  const handleConnectGithub = async () => {
    onError(null);
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
        onError(
          'Popup was blocked by your browser. Allow popups for this site and click Connect GitHub again.'
        );
      }
    } catch (err) {
      setConnecting(false);
      onError(
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
    onError(null);
    setInitBranchSuccess(null);
    onClearPushFeedback();

    const parsed = parseGithubTargetInput(repoInput);
    if (!parsed) {
      onError(
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
        onError(
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
    onClearPushFeedback();
    onError(null);
    onResetPushModeOnRepoChange();
  };

  const handleCreateMainBranch = async () => {
    if (!selectedRepo) return;
    const cleanBranch = initBranchName.trim() || 'main';
    setInitializingBranch(true);
    onError(null);
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
      onError(
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
    onError(null);
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
      onError(
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

  const effectiveFolderToLoad = useMemo(() => {
    if (dbmlFolders.length === 0) return '';
    if (
      selectedFolderToLoad &&
      dbmlFolders.some((d) => d.folder === selectedFolderToLoad)
    ) {
      return selectedFolderToLoad;
    }
    return dbmlFolders[0].folder;
  }, [dbmlFolders, selectedFolderToLoad]);

  const handleLoadSelectedFolder = async () => {
    if (!selectedRepo || !effectiveFolderToLoad || !onLoadGithubFolder) return;
    setLoadingFolder(true);
    onError(null);
    try {
      const result = await getGithubFolderFiles(
        selectedRepo.owner,
        selectedRepo.repo,
        selectedBranch,
        effectiveFolderToLoad
      );
      onLoadGithubFolder(result, openInNewWorkspace);
      onClose();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : 'Failed to load modular DBML folder from GitHub.'
      );
    } finally {
      setLoadingFolder(false);
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

  const handleCopyCallback = async () => {
    if (!authStatus?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(authStatus.callbackUrl);
      setCopiedCallback(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedCallback(false);
      }, 1800);
    } catch {
      // Ignore clipboard write errors
    }
  };

  return {
    authStatus,
    authLoading,
    connecting,
    copiedCallback,
    repoInput,
    setRepoInput,
    selectedRepo,
    selectedBranch,
    initBranchName,
    setInitBranchName,
    initializingBranch,
    initBranchSuccess,
    treeFiles,
    treeLoading,
    fileSearch,
    setFileSearch,
    onlyDbmlFiles,
    setOnlyDbmlFiles,
    selectedFilePath,
    setSelectedFilePath,
    dbmlFolders,
    selectedFolderToLoad: effectiveFolderToLoad,
    setSelectedFolderToLoad,
    loadingFolder,
    openInNewWorkspace,
    setOpenInNewWorkspace,
    loadingFile,
    filteredFiles,
    loadRepoDetails,
    handleBranchChange,
    handleConnectGithub,
    handleLogout,
    handleSelectRepository,
    handleChangeRepository,
    handleCreateMainBranch,
    handleLoadSelectedFile,
    handleLoadSelectedFolder,
    handleCopyCallback,
  };
}
