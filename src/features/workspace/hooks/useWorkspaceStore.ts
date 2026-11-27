import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteWorkspace,
  getMetaValue,
  loadAllWorkspaces,
  saveWorkspace,
  setMetaValue,
} from '../../../services/storage/localDb';
import {
  CloudAuthStatusResponse,
  CloudSyncStatus,
  ViewMode,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { ApiClientError, isAbortError } from '../../../services/api/apiClient';
import { computeAutoLayout } from '../../../utils/autoLayout';
import {
  connectWithGithubOAuth,
  deleteCloudWorkspace,
  getCloudAuthStatus,
  listCloudWorkspaces,
  saveCloudWorkspace,
  signOutCloud,
} from '../../../services/api/cloudService';
import { parseDbml } from '@shared/domain/dbml';
import {
  AUTH_CHANGED_EVENT,
  fetchDbmlFromUrl,
} from '../../../services/api/remoteService';
import { createInitialWorkspace } from '../../../utils/sampleSchemas';
import { generateUniqueId } from '../../../utils/id';

interface UseWorkspaceStoreOptions {
  onInitViewMode: (mode: ViewMode) => void;
  onInitSidebarOpen: (open: boolean) => void;
  onFocusFit: () => void;
  onResetSelection: () => void;
  showToast: (msg: string) => void;
}

export function useWorkspaceStore({
  onInitViewMode,
  onInitSidebarOpen,
  onFocusFit,
  onResetSelection,
  showToast,
}: UseWorkspaceStoreOptions) {
  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  const [cloudAuth, setCloudAuth] = useState<CloudAuthStatusResponse | null>(
    null
  );
  const [rawCloudSyncStatus, setRawCloudSyncStatus] =
    useState<CloudSyncStatus>('local');

  const saveTimerRef = useRef<number | null>(null);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);
  const workspacesRef = useRef<WorkspaceProject[]>([]);
  const cloudAuthRef = useRef<CloudAuthStatusResponse | null>(null);

  const onInitViewModeRef = useRef(onInitViewMode);
  const onInitSidebarOpenRef = useRef(onInitSidebarOpen);
  const onFocusFitRef = useRef(onFocusFit);
  const onResetSelectionRef = useRef(onResetSelection);

  onInitViewModeRef.current = onInitViewMode;
  onInitSidebarOpenRef.current = onInitSidebarOpen;
  onFocusFitRef.current = onFocusFit;
  onResetSelectionRef.current = onResetSelection;
  workspacesRef.current = workspaces;
  cloudAuthRef.current = cloudAuth;

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (cloudSaveTimerRef.current !== null) {
        window.clearTimeout(cloudSaveTimerRef.current);
      }
      syncAbortRef.current?.abort();
    };
  }, []);

  const mergeAndReconcileCloud = useCallback(
    async (
      auth: CloudAuthStatusResponse,
      baseLocalList?: WorkspaceProject[],
      signal?: AbortSignal
    ) => {
      if (!auth.cloudEnabled || !auth.authenticated) {
        setRawCloudSyncStatus('local');
        return;
      }

      setRawCloudSyncStatus('syncing');
      try {
        const { workspaces: cloudList } = await listCloudWorkspaces(signal);
        if (signal?.aborted) return;

        const localList = baseLocalList || (await loadAllWorkspaces());
        if (signal?.aborted) return;

        const localById = new Map(localList.map((w) => [w.id, w]));
        const mergedMap = new Map<string, WorkspaceProject>();

        for (const lws of localList) {
          mergedMap.set(lws.id, lws);
        }

        for (const cws of cloudList) {
          if (signal?.aborted) return;
          const existing = localById.get(cws.id);
          if (!existing) {
            await saveWorkspace(cws);
            mergedMap.set(cws.id, cws);
            continue;
          }

          const localTime = new Date(existing.updatedAt).getTime();
          const cloudTime = new Date(cws.updatedAt).getTime();

          if (cloudTime > localTime + 500) {
            await saveWorkspace(cws);
            mergedMap.set(cws.id, cws);
          } else if (
            existing.syncOrigin === 'cloud' &&
            localTime > cloudTime + 500
          ) {
            try {
              const res = await saveCloudWorkspace(existing);
              const synced: WorkspaceProject = {
                ...existing,
                syncOrigin: 'cloud',
                cloudSyncedAt: res.syncedAt,
                cloudRevision: res.revision,
              };
              await saveWorkspace(synced);
              mergedMap.set(cws.id, synced);
            } catch {
              mergedMap.set(cws.id, existing);
            }
          } else {
            const linked: WorkspaceProject = {
              ...existing,
              syncOrigin: 'cloud',
              cloudSyncedAt: cws.cloudSyncedAt || cws.updatedAt,
              cloudRevision: cws.cloudRevision,
            };
            await saveWorkspace(linked);
            mergedMap.set(cws.id, linked);
          }
        }

        if (signal?.aborted) return;
        const sorted = Array.from(mergedMap.values()).sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setWorkspaces(sorted);
        setRawCloudSyncStatus('synced');
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) return;
        setRawCloudSyncStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        );
      }
    },
    []
  );

  const refreshCloudSync = useCallback(async () => {
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      const auth = await getCloudAuthStatus(controller.signal);
      if (controller.signal.aborted) return;
      setCloudAuth(auth);
      cloudAuthRef.current = auth;
      await mergeAndReconcileCloud(auth, undefined, controller.signal);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setRawCloudSyncStatus(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'offline'
          : 'local'
      );
    }
  }, [mergeAndReconcileCloud]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const savedTheme = await getMetaValue(
          'darkMode',
          (value): value is boolean => typeof value === 'boolean'
        );
        if (signal.aborted) return;
        if (savedTheme !== null) {
          setDarkMode(savedTheme);
        }

        let list = await loadAllWorkspaces();
        if (signal.aborted) return;
        if (list.length === 0) {
          const seed = createInitialWorkspace();
          await saveWorkspace(seed);
          list = [seed];
        }

        const lastActive = await getMetaValue(
          'activeWorkspaceId',
          (value): value is string => typeof value === 'string'
        );
        if (signal.aborted) return;

        let target = list.find((w) => w.id === lastActive)?.id || list[0].id;

        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get('view');
        if (
          viewParam === 'split' ||
          viewParam === 'diagram' ||
          viewParam === 'docs'
        ) {
          onInitViewModeRef.current(viewParam);
          onInitSidebarOpenRef.current(viewParam === 'diagram');
        }

        const urlParam = params.get('url')?.trim();
        if (urlParam) {
          try {
            const remote = await fetchDbmlFromUrl(urlParam, signal);
            if (signal.aborted) return;

            const parsedRemote = parseDbml(remote.content);
            const positions = computeAutoLayout(parsedRemote, 'full');
            const now = new Date().toISOString();
            const baseName =
              parsedRemote.project.name ||
              remote.filename.replace(/\.dbml$/i, '') ||
              'Remote DBML';
            const remoteWs: WorkspaceProject = {
              id: generateUniqueId('ws_url'),
              name: baseName,
              description: `Loaded from ${remote.originalUrl}`,
              dbml: remote.content,
              tablePositions: positions,
              groupMeta: {},
              stickyNotes: [],
              detailLevel: 'full',
              versions: [
                {
                  id: generateUniqueId('ver'),
                  tag: 'v1.0.0',
                  title: 'Loaded from URL',
                  description: remote.originalUrl,
                  dbml: remote.content,
                  tablePositions: positions,
                  stickyNotes: [],
                  createdAt: now,
                  isPublished: true,
                },
              ],
              urlLink: {
                url: remote.originalUrl,
                resolvedUrl: remote.resolvedUrl,
                loadedAt: now,
              },
              githubLink:
                remote.githubMeta && remote.githubMeta.sha
                  ? {
                      owner: remote.githubMeta.owner,
                      repo: remote.githubMeta.repo,
                      branch: remote.githubMeta.branch,
                      path: remote.githubMeta.path,
                      sha: remote.githubMeta.sha,
                      htmlUrl: remote.githubMeta.htmlUrl,
                      lastSyncedDbml: remote.content,
                      lastSyncedAt: now,
                    }
                  : undefined,
              createdAt: now,
              updatedAt: now,
              syncOrigin: 'local',
            };
            await saveWorkspace(remoteWs);
            await setMetaValue('activeWorkspaceId', remoteWs.id);
            list = [remoteWs, ...list];
            target = remoteWs.id;
            if (!signal.aborted) {
              showToast(`Loaded ${remote.filename} from URL`);
            }
          } catch (err) {
            if (!isAbortError(err) && !signal.aborted) {
              showToast(
                err instanceof Error
                  ? `Failed to load URL: ${err.message}`
                  : 'Failed to load DBML from URL'
              );
            }
          }
        }

        if (signal.aborted) return;
        setWorkspaces(list);
        setActiveId(target);
        setLoading(false);
        onFocusFitRef.current();

        // Check cloud auth & reconcile in background without blocking local-first render
        try {
          const auth = await getCloudAuthStatus(signal);
          if (signal.aborted) return;
          setCloudAuth(auth);
          cloudAuthRef.current = auth;
          if (auth.cloudEnabled && auth.authenticated) {
            await mergeAndReconcileCloud(auth, list, signal);
          }
        } catch {
          // Keep local IndexedDB mode seamlessly
        }
      } catch (err) {
        if (isAbortError(err) || signal.aborted) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Unable to load local workspaces.'
        );
        setLoading(false);
      }
    })();

    const onAuthChanged = () => {
      void refreshCloudSync();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);

    return () => {
      controller.abort();
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [bootstrapNonce, mergeAndReconcileCloud, refreshCloudSync, showToast]);

  const retryBootstrap = useCallback(() => {
    setBootstrapNonce((n) => n + 1);
  }, []);

  // Apply dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    void setMetaValue('darkMode', darkMode);
  }, [darkMode]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0] || null,
    [workspaces, activeId]
  );

  // Derived sync status avoids redundant setState inside an effect on workspace switch
  const cloudSyncStatus: CloudSyncStatus = useMemo(() => {
    if (
      !activeWorkspace ||
      activeWorkspace.syncOrigin !== 'cloud' ||
      !cloudAuth?.authenticated ||
      !cloudAuth?.cloudEnabled
    ) {
      return 'local';
    }
    return rawCloudSyncStatus === 'local' ? 'synced' : rawCloudSyncStatus;
  }, [
    activeWorkspace,
    cloudAuth?.authenticated,
    cloudAuth?.cloudEnabled,
    rawCloudSyncStatus,
  ]);

  const pushWorkspaceToCloud = useCallback(
    async (ws: WorkspaceProject): Promise<WorkspaceProject | null> => {
      const auth = cloudAuthRef.current;
      if (!auth?.cloudEnabled || !auth?.authenticated) return null;
      setRawCloudSyncStatus('syncing');
      try {
        const res = await saveCloudWorkspace(ws);
        const syncedWs: WorkspaceProject = {
          ...ws,
          syncOrigin: 'cloud',
          cloudSyncedAt: res.syncedAt,
          cloudRevision: res.revision,
        };
        await saveWorkspace(syncedWs);
        setWorkspaces((prev) =>
          prev.map((item) => (item.id === ws.id ? syncedWs : item))
        );
        setRawCloudSyncStatus('synced');
        return syncedWs;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setRawCloudSyncStatus('error');
          showToast(
            'Cloud revision conflict detected — another session saved newer changes.'
          );
          return null;
        }
        setRawCloudSyncStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        );
        return null;
      }
    },
    [showToast]
  );

  const updateActiveWorkspace = useCallback(
    (updater: (prev: WorkspaceProject) => WorkspaceProject) => {
      let updatedSnapshot: WorkspaceProject | null = null;
      setWorkspaces((prevList) =>
        prevList.map((ws) => {
          if (ws.id !== activeId) return ws;
          const next: WorkspaceProject = {
            ...updater(ws),
            updatedAt: new Date().toISOString(),
          };
          updatedSnapshot = next;
          if (saveTimerRef.current !== null) {
            window.clearTimeout(saveTimerRef.current);
          }
          saveTimerRef.current = window.setTimeout(() => {
            saveTimerRef.current = null;
            void saveWorkspace(next);
          }, 250);

          const auth = cloudAuthRef.current;
          if (
            next.syncOrigin === 'cloud' &&
            auth?.cloudEnabled &&
            auth?.authenticated
          ) {
            setRawCloudSyncStatus('syncing');
            if (cloudSaveTimerRef.current !== null) {
              window.clearTimeout(cloudSaveTimerRef.current);
            }
            cloudSaveTimerRef.current = window.setTimeout(() => {
              cloudSaveTimerRef.current = null;
              if (updatedSnapshot) {
                void pushWorkspaceToCloud(updatedSnapshot);
              }
            }, 900);
          }

          return next;
        })
      );
    },
    [activeId, pushWorkspaceToCloud]
  );

  const selectWorkspace = useCallback((id: string) => {
    setActiveId(id);
    onResetSelectionRef.current();
    void setMetaValue('activeWorkspaceId', id);
    onFocusFitRef.current();
  }, []);

  const addAndSelectWorkspace = useCallback(
    async (ws: WorkspaceProject) => {
      const auth = cloudAuthRef.current;
      const shouldAutoCloud = Boolean(auth?.cloudEnabled && auth?.authenticated);
      const initialWs: WorkspaceProject = shouldAutoCloud
        ? { ...ws, syncOrigin: 'cloud' }
        : { ...ws, syncOrigin: ws.syncOrigin || 'local' };
      await saveWorkspace(initialWs);
      setWorkspaces((prev) => [initialWs, ...prev]);
      selectWorkspace(initialWs.id);
      if (shouldAutoCloud) {
        void pushWorkspaceToCloud(initialWs);
      }
    },
    [selectWorkspace, pushWorkspaceToCloud]
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      const target = workspacesRef.current.find((w) => w.id === id);
      await deleteWorkspace(id);
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (id === activeId && next.length > 0) {
          setActiveId(next[0].id);
          void setMetaValue('activeWorkspaceId', next[0].id);
        }
        return next;
      });
      const auth = cloudAuthRef.current;
      if (
        target?.syncOrigin === 'cloud' &&
        auth?.cloudEnabled &&
        auth?.authenticated
      ) {
        void deleteCloudWorkspace(id).catch(() => {});
      }
    },
    [activeId]
  );

  const syncWorkspaceToCloud = useCallback(
    async (workspaceId?: string): Promise<WorkspaceProject | null> => {
      const targetId = workspaceId || activeId;
      const ws = workspacesRef.current.find((w) => w.id === targetId);
      if (!ws) return null;
      const synced = await pushWorkspaceToCloud({
        ...ws,
        syncOrigin: 'cloud',
      });
      if (synced) {
        showToast(`Synced "${synced.name}" to cloud`);
      }
      return synced;
    },
    [activeId, pushWorkspaceToCloud, showToast]
  );

  const syncAllLocalWorkspacesToCloud = useCallback(async () => {
    const locals = workspacesRef.current.filter(
      (w) => w.syncOrigin !== 'cloud'
    );
    let count = 0;
    for (const ws of locals) {
      const synced = await pushWorkspaceToCloud({ ...ws, syncOrigin: 'cloud' });
      if (synced) count++;
    }
    if (count > 0) {
      showToast(
        `Synced ${count} local ${
          count === 1 ? 'workspace' : 'workspaces'
        } to cloud`
      );
    }
    return count;
  }, [pushWorkspaceToCloud, showToast]);

  const connectCloudAccount = useCallback(async () => {
    await connectWithGithubOAuth();
    await refreshCloudSync();
  }, [refreshCloudSync]);

  const logoutCloudAccount = useCallback(async () => {
    await signOutCloud();
    setCloudAuth((prev) =>
      prev ? { ...prev, authenticated: false, user: null } : prev
    );
    setRawCloudSyncStatus('local');
    showToast('Signed out of cloud sync (local IndexedDB kept intact)');
  }, [showToast]);

  return {
    workspaces,
    activeWorkspace,
    loading,
    loadError,
    darkMode,
    setDarkMode,
    cloudAuth,
    cloudSyncStatus,
    updateActiveWorkspace,
    selectWorkspace,
    addAndSelectWorkspace,
    removeWorkspace,
    syncWorkspaceToCloud,
    syncAllLocalWorkspacesToCloud,
    refreshCloudSync,
    connectCloudAccount,
    logoutCloudAccount,
    retryBootstrap,
  };
}
