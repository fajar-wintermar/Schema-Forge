import { useCallback, useMemo, useState } from 'react';
import {
  GithubFileLink,
  GithubRepoLink,
  SchemaModuleFile,
  WorkspaceProject,
} from '../../../types/schema';
import {
  getGithubFile,
  getGithubFolderFiles,
  GithubPushResult,
  GithubRepoInfo,
  GithubTreeFile,
  pushGithubBatch,
  pushGithubFile,
} from '../../../utils/remoteService';
import { computeSchemaDiff } from '../../../utils/schemaDiff';
import { cleanFolderPrefix, mergeSchemaFiles } from '../../../utils/schemaModules';
import { BatchPushSummary } from '../types';

export interface UseGithubPushSyncParams {
  workspace: WorkspaceProject;
  isModularWorkspace: boolean;
  selectedRepo: GithubRepoInfo | null;
  selectedBranch: string;
  treeFiles: GithubTreeFile[];
  loadRepoDetails: (
    owner: string,
    repo: string,
    preferredBranch?: string,
    preferredPath?: string
  ) => Promise<void>;
  onSyncedGithubFile: (meta: GithubFileLink, dbml?: string) => void;
  onSyncedGithubFolder?: (
    repoLink: GithubRepoLink,
    files: SchemaModuleFile[],
    replaceWorkspaceContent?: boolean
  ) => void;
  onError: (msg: string | null) => void;
}

export function useGithubPushSync({
  workspace,
  isModularWorkspace,
  selectedRepo,
  selectedBranch,
  treeFiles,
  loadRepoDetails,
  onSyncedGithubFile,
  onSyncedGithubFolder,
  onError,
}: UseGithubPushSyncParams) {
  const linked = workspace.githubLink;
  const repoLinked = workspace.githubRepoLink;

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

  const clearPushFeedback = useCallback(() => {
    setPushSuccess(null);
    setBatchPushSummary(null);
    setShaConflict(false);
  }, []);

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

  const handlePullLatest = async () => {
    if (isModularWorkspace && repoLinked && onSyncedGithubFolder) {
      setPullingLatest(true);
      onError(null);
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
        onError(
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
    onError(null);
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
      onError(
        err instanceof Error
          ? err.message
          : 'Failed to pull latest file from GitHub.'
      );
    } finally {
      setPullingLatest(false);
    }
  };

  const handlePushModularBatch = async (forceWithLatestSha = false) => {
    onError(null);
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
      onError('Choose and verify a repository first.');
      return;
    }
    if (!commitMessage.trim()) {
      onError('Enter a commit message.');
      return;
    }
    if (createNewBranch && !newBranchName.trim()) {
      onError('Enter a name for the new branch.');
      return;
    }

    const allFiles = workspace.schemaFiles || [];
    const chosenFiles = allFiles.filter((f) => selectedPushPaths.includes(f.path));
    if (chosenFiles.length === 0) {
      onError('Select at least one modular .dbml file to push.');
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
      onError(e.message || 'Failed to push modular files to GitHub.');
    } finally {
      setPushing(false);
    }
  };

  const handlePush = async (forceWithLatestSha = false) => {
    if (isModularWorkspace) {
      await handlePushModularBatch(forceWithLatestSha);
      return;
    }

    onError(null);
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
      onError('Choose a repository, branch, and file path first.');
      return;
    }
    if (!commitMessage.trim()) {
      onError('Enter a commit message.');
      return;
    }
    if (createNewBranch && !newBranchName.trim()) {
      onError('Enter a name for the new branch.');
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
      onError(e.message || 'Failed to push changes to GitHub.');
    } finally {
      setPushing(false);
    }
  };

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

  const fullSchemaDiff = useMemo(() => {
    if (isModularWorkspace) {
      const files = workspace.schemaFiles || [];
      if (files.length === 0) return null;
      const folder = repoLinked?.schemaFolder || workspace.schemaFolder || 'schema';
      const baseFiles = files
        .filter((f) => f.lastSyncedContent !== undefined)
        .map((f) => ({ ...f, content: f.lastSyncedContent || '' }));
      const baseDbml =
        baseFiles.length > 0
          ? mergeSchemaFiles(baseFiles, { schemaFolder: folder }).mergedDbml
          : '';
      const targetDbml = mergeSchemaFiles(files, {
        schemaFolder: folder,
      }).mergedDbml;
      return computeSchemaDiff(baseDbml, targetDbml);
    }
    if (!linked || pushMode !== 'linked') return null;
    return computeSchemaDiff(linked.lastSyncedDbml, workspace.dbml);
  }, [
    isModularWorkspace,
    workspace.schemaFiles,
    workspace.schemaFolder,
    repoLinked?.schemaFolder,
    linked,
    pushMode,
    workspace.dbml,
  ]);

  const changedDiffLines = useMemo(() => {
    if (!diffPreview) return [];
    return diffPreview.lineDiff.filter((l) => l.type !== 'context');
  }, [diffPreview]);

  const hasVerifiedPushTarget = Boolean(
    (pushMode === 'linked' && (isModularWorkspace ? repoLinked : linked)) ||
      (selectedRepo && selectedRepo.canPush)
  );

  return {
    pushMode,
    setPushMode,
    targetPathInput,
    setTargetPathInput,
    targetFolderInput,
    setTargetFolderInput,
    selectedPushPaths,
    setSelectedPushPaths,
    previewDiffPath,
    setPreviewDiffPath,
    commitMessage,
    setCommitMessage,
    createNewBranch,
    setCreateNewBranch,
    newBranchName,
    setNewBranchName,
    pushing,
    pullingLatest,
    shaConflict,
    pushSuccess,
    batchPushSummary,
    diffPreview,
    fullSchemaDiff,
    changedDiffLines,
    hasVerifiedPushTarget,
    resolveModularPushPath,
    clearPushFeedback,
    handlePullLatest,
    handlePush,
  };
}
