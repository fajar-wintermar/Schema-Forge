import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteWorkspace,
  getMetaValue,
  loadAllWorkspaces,
  saveWorkspace,
  setMetaValue,
} from '../../../db/localDb';
import { ViewMode, WorkspaceProject } from '../../../types/schema';
import { computeAutoLayout } from '../../../utils/autoLayout';
import { parseDbml } from '../../../utils/dbmlParser';
import { fetchDbmlFromUrl } from '../../../utils/remoteService';
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

  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const savedTheme = await getMetaValue<boolean>('darkMode');
      if (mounted && typeof savedTheme === 'boolean') {
        setDarkMode(savedTheme);
      }

      let list = await loadAllWorkspaces();
      if (list.length === 0) {
        const seed = createInitialWorkspace();
        await saveWorkspace(seed);
        list = [seed];
      }

      const lastActive = await getMetaValue<string>('activeWorkspaceId');
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
    })();
    return () => {
      mounted = false;
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

  const updateActiveWorkspace = useCallback(
    (updater: (prev: WorkspaceProject) => WorkspaceProject) => {
      setWorkspaces((prevList) =>
        prevList.map((ws) => {
          if (ws.id !== activeId) return ws;
          const next = {
            ...updater(ws),
            updatedAt: new Date().toISOString(),
          };
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            saveWorkspace(next);
          }, 250);
          return next;
        })
      );
    },
    [activeId]
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
      await saveWorkspace(ws);
      setWorkspaces((prev) => [ws, ...prev]);
      selectWorkspace(ws.id);
    },
    [selectWorkspace]
  );

  const removeWorkspace = useCallback(
    async (id: string) => {
      await deleteWorkspace(id);
      setWorkspaces((prev) => {
        const next = prev.filter((w) => w.id !== id);
        if (id === activeId && next.length > 0) {
          setActiveId(next[0].id);
          setMetaValue('activeWorkspaceId', next[0].id);
        }
        return next;
      });
    },
    [activeId]
  );

  return {
    workspaces,
    activeWorkspace,
    loading,
    darkMode,
    setDarkMode,
    updateActiveWorkspace,
    selectWorkspace,
    addAndSelectWorkspace,
    removeWorkspace,
  };
}
