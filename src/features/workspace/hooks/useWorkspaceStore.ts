import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteWorkspace,
  getMetaValue,
  loadAllWorkspaces,
  saveWorkspace,
  setMetaValue,
} from '../../../db/localDb';
import {
  CloudAuthStatusResponse,
  CloudSyncStatus,
  ViewMode,
  WorkspaceProject,
} from '../../../types/schema';
import { computeAutoLayout } from '../../../utils/autoLayout';
import {
  connectWithGithubOAuth,
  deleteCloudWorkspace,
  getCloudAuthStatus,
  listCloudWorkspaces,
  saveCloudWorkspace,
  signOutCloud,
} from '../../../utils/cloudService';
import { parseDbml } from '../../../utils/dbmlParser';
import {
  AUTH_CHANGED_EVENT,
  fetchDbmlFromUrl,
} from '../../../utils/remoteService';
import { createInitialWorkspace } from '../../../utils/sampleSchemas';

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
  const [darkMode, setDarkMode] = useState(false);

  const [cloudAuth, setCloudAuth] = useState<CloudAuthStatusResponse | null>(
    null
  );
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>('local');

  const saveTimerRef = useRef<number | null>(null);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const workspacesRef = useRef<WorkspaceProject[]>([]);
  const cloudAuthRef = useRef<CloudAuthStatusResponse | null>(null);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    cloudAuthRef.current = cloudAuth;
  }, [cloudAuth]);

  const mergeAndReconcileCloud = useCallback(
    async (
      auth: CloudAuthStatusResponse,
      baseLocalList?: WorkspaceProject[]
    ) => {
      if (!auth.cloudEnabled || !auth.authenticated) {
        setCloudSyncStatus('local');
        return;
      }

      setCloudSyncStatus('syncing');
      try {
        const { workspaces: cloudList } = await listCloudWorkspaces();
        const localList = baseLocalList || (await loadAllWorkspaces());
        const localById = new Map(localList.map((w) => [w.id, w]));
        const mergedMap = new Map<string, WorkspaceProject>();

        for (const lws of localList) {
          mergedMap.set(lws.id, lws);
        }

        for (const cws of cloudList) {
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
          } else if (existing.syncOrigin === 'cloud' && localTime > cloudTime + 500) {
            // Local cloud workspace has newer offline edits; push to cloud
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

        const sorted = Array.from(mergedMap.values()).sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setWorkspaces(sorted);
        setCloudSyncStatus('synced');
      } catch {
        setCloudSyncStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        );
      }
    },
    []
  );

  const refreshCloudSync = useCallback(async () => {
    try {
      const auth = await getCloudAuthStatus();
      setCloudAuth(auth);
      cloudAuthRef.current = auth;
      await mergeAndReconcileCloud(auth);
    } catch {
      setCloudSyncStatus(
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'offline'
          : 'local'
      );
    }
  }, [mergeAndReconcileCloud]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const savedTheme = await getMetaValue(
        'darkMode',
        (value): value is boolean => typeof value === 'boolean'
      );
      if (mounted && savedTheme !== null) {
        setDarkMode(savedTheme);
      }

      let list = await loadAllWorkspaces();
      if (list.length === 0) {
        const seed = createInitialWorkspace();
        await saveWorkspace(seed);
        list = [seed];
      }

      const lastActive = await getMetaValue(
        'activeWorkspaceId',
        (value): value is string => typeof value === 'string'
      );
      let target = list.find((w) => w.id === lastActive)?.id || list[0].id;

      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      if (
        mounted &&
        (viewParam === 'split' || viewParam === 'diagram' || viewParam === 'docs')
      ) {
        onInitViewMode(viewParam);
        onInitSidebarOpen(viewParam === 'diagram');
      }

      const urlParam = params.get('url')?.trim();
      if (urlParam) {
        try {
          const remote = await fetchDbmlFromUrl(urlParam);
          const parsedRemote = parseDbml(remote.content);
          const positions = computeAutoLayout(parsedRemote, 'full');
          const now = new Date().toISOString();
          const baseName =
            parsedRemote.project.name ||
            remote.filename.replace(/\.dbml$/i, '') ||
            'Remote DBML';
          const remoteWs: WorkspaceProject = {
            id: `ws_url_${Date.now()}`,
            name: baseName,
            description: `Loaded from ${remote.originalUrl}`,
            dbml: remote.content,
            tablePositions: positions,
            groupMeta: {},
            stickyNotes: [],
            detailLevel: 'full',
            versions: [
              {
                id: `ver_${Date.now()}`,
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
          if (mounted) {
            showToast(`Loaded ${remote.filename} from URL`);
          }
        } catch (err) {
          if (mounted) {
            showToast(
              err instanceof Error
                ? `Failed to load URL: ${err.message}`
                : 'Failed to load DBML from URL'
            );
          }
        }
      }

      if (mounted) {
        setWorkspaces(list);
        setActiveId(target);
        setLoading(false);
        onFocusFit();
      }

      // Check cloud auth & reconcile in background without blocking local-first render
      try {
        const auth = await getCloudAuthStatus();
        if (!mounted) return;
        setCloudAuth(auth);
        cloudAuthRef.current = auth;
        if (auth.cloudEnabled && auth.authenticated) {
          await mergeAndReconcileCloud(auth, list);
        }
      } catch {
        // Keep local IndexedDB mode seamlessly
      }
    })();

    const onAuthChanged = () => {
      void refreshCloudSync();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);

    return () => {
      mounted = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
    // Initial bootstrap runs once cleanly on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // Apply dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    setMetaValue('darkMode', darkMode);
  }, [darkMode]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0] || null,
    [workspaces, activeId]
  );

  // Sync active status indicator when switching between local and cloud workspaces
  useEffect(() => {
    if (!activeWorkspace) return;
    if (
      activeWorkspace.syncOrigin === 'cloud' &&
      cloudAuth?.authenticated &&
      cloudAuth?.cloudEnabled
    ) {
      setCloudSyncStatus((prev) =>
        prev === 'syncing' || prev === 'error' || prev === 'offline'
          ? prev
          : 'synced'
      );
    } else {
      setCloudSyncStatus('local');
    }
  }, [activeWorkspace, cloudAuth?.authenticated, cloudAuth?.cloudEnabled]);

  const pushWorkspaceToCloud = useCallback(
    async (ws: WorkspaceProject): Promise<WorkspaceProject | null> => {
      const auth = cloudAuthRef.current;
      if (!auth?.cloudEnabled || !auth?.authenticated) return null;
      setCloudSyncStatus('syncing');
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
        setCloudSyncStatus('synced');
        return syncedWs;
      } catch {
        setCloudSyncStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        );
        return null;
      }
    },
    []
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
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            saveWorkspace(next);
          }, 250);

          const auth = cloudAuthRef.current;
          if (
            next.syncOrigin === 'cloud' &&
            auth?.cloudEnabled &&
            auth?.authenticated
          ) {
            setCloudSyncStatus('syncing');
            if (cloudSaveTimerRef.current) {
              window.clearTimeout(cloudSaveTimerRef.current);
            }
            cloudSaveTimerRef.current = window.setTimeout(() => {
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

  const selectWorkspace = useCallback(
    (id: string) => {
      setActiveId(id);
      onResetSelection();
      setMetaValue('activeWorkspaceId', id);
      onFocusFit();
    },
    [onResetSelection, onFocusFit]
  );

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
          setMetaValue('activeWorkspaceId', next[0].id);
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
        `Synced ${count} local ${count === 1 ? 'workspace' : 'workspaces'} to cloud`
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
    setCloudSyncStatus('local');
    showToast('Signed out of cloud sync (local IndexedDB kept intact)');
  }, [showToast]);

  return {
    workspaces,
    activeWorkspace,
    loading,
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
  };
}
