import { useCallback, useEffect, useRef, useState } from 'react';
import type { SchemaModuleFile } from '@shared/domain/schemaTypes';
import { isAbortError } from '../../../services/api/apiClient';
import {
  getGithubCommits,
  getGithubFile,
  getGithubFolderFiles,
  type GithubCommitInfo,
} from '../../../services/api/remoteService';
import { cleanFolderPrefix, mergeSchemaFiles } from '../../../utils/schemaModules';

interface UseGithubCommitsDiffOptions {
  owner: string;
  repo: string;
  branch: string;
  isRepoEmpty?: boolean;
  targetKind: 'folder' | 'file';
  targetFolder: string;
  targetFilePath: string;
  activePathFilter: string;
  localWorkingDbml: string;
  localLastSyncedDbml: string | null;
  hasLinkedRepo: boolean;
  hasLocalChanges: boolean;
  onError: (msg: string | null) => void;
}

export function useGithubCommitsDiff({
  owner,
  repo,
  branch,
  isRepoEmpty,
  targetKind,
  targetFolder,
  targetFilePath,
  activePathFilter,
  localWorkingDbml,
  localLastSyncedDbml,
  hasLinkedRepo,
  hasLocalChanges,
  onError,
}: UseGithubCommitsDiffOptions) {
  const [commits, setCommits] = useState<GithubCommitInfo[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [baseRef, setBaseRef] = useState<string>(() =>
    hasLinkedRepo ? 'last-synced' : ''
  );
  const [targetRef, setTargetRef] = useState<string>('working');

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

  const fetchCommits = useCallback(async () => {
    if (!owner || !repo) return;
    commitsAbortRef.current?.abort();
    const controller = new AbortController();
    commitsAbortRef.current = controller;

    setLoadingCommits(true);
    onError(null);
    try {
      const res = await getGithubCommits({
        owner,
        repo,
        branch,
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
        err instanceof Error
          ? err.message
          : 'Failed to load Git commit history.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingCommits(false);
      }
    }
  }, [owner, repo, branch, activePathFilter, hasLocalChanges, onError]);

  useEffect(() => {
    if (owner && repo && !isRepoEmpty) {
      void fetchCommits();
    }
    return () => {
      commitsAbortRef.current?.abort();
    };
  }, [owner, repo, branch, activePathFilter, isRepoEmpty, fetchCommits]);

  const resolveSnapshotDbml = useCallback(
    async (refKey: string, signal?: AbortSignal): Promise<string> => {
      if (!refKey) return '';
      if (refKey === 'working') return localWorkingDbml;
      if (refKey === 'last-synced') return localLastSyncedDbml || '';

      const cacheKey = `${owner}/${repo}:${refKey}:${targetKind}:${activePathFilter}`;
      const cached = snapshotCacheRef.current.get(cacheKey);
      if (cached !== undefined) return cached;

      if (targetKind === 'folder') {
        const res = await getGithubFolderFiles(
          owner,
          repo,
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
        owner,
        repo,
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
      owner,
      repo,
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

  const swapRefs = useCallback(() => {
    setBaseRef(targetRef);
    setTargetRef(baseRef);
  }, [baseRef, targetRef]);

  return {
    commits,
    loadingCommits,
    baseRef,
    setBaseRef,
    targetRef,
    setTargetRef,
    swapRefs,
    baseDbml,
    targetDbml,
    loadingSql,
    fetchCommits,
  };
}
