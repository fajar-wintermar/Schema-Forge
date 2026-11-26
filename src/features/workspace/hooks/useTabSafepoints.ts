import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ViewMode, WorkspaceProject } from '@shared/domain/schemaTypes';
import { getMetaValue, setMetaValue } from '../../../services/storage/localDb';
import {
  buildTabSafepoint,
  extractWorkspaceSnapshot,
  formatSafepointBadge,
  isTabSafepointList,
  MAX_SAFEPOINTS_PER_WORKSPACE,
  SafepointReason,
  SafepointViewState,
  SafepointWorkspaceSnapshot,
  summarizeSafepointDelta,
  TabSafepoint,
  tabSafepointMetaKey,
} from '../../../utils/tabSafepoints';

interface UseTabSafepointsOptions {
  activeWorkspace: WorkspaceProject | null;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  onRestoreViewState: (tab: ViewMode, viewState: SafepointViewState) => void;
  showToast: (msg: string) => void;
}

export function useTabSafepoints({
  activeWorkspace,
  updateActiveWorkspace,
  onRestoreViewState,
  showToast,
}: UseTabSafepointsOptions) {
  const [safepoints, setSafepoints] = useState<TabSafepoint[]>([]);
  const [baselineVersion, setBaselineVersion] = useState(0);

  const baselineByWorkspaceRef = useRef<
    Map<string, SafepointWorkspaceSnapshot>
  >(new Map());
  const safepointsRef = useRef<TabSafepoint[]>(safepoints);
  safepointsRef.current = safepoints;

  const activeWorkspaceId = activeWorkspace?.id || '';

  useEffect(() => {
    if (!activeWorkspace) {
      setSafepoints([]);
      return;
    }

    const wsId = activeWorkspace.id;
    if (!baselineByWorkspaceRef.current.has(wsId)) {
      baselineByWorkspaceRef.current.set(
        wsId,
        extractWorkspaceSnapshot(activeWorkspace)
      );
      setBaselineVersion((v) => v + 1);
    }

    let cancelled = false;
    void (async () => {
      const stored = await getMetaValue(
        tabSafepointMetaKey(wsId),
        isTabSafepointList
      );
      if (cancelled) return;
      setSafepoints(stored || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistSafepoints = useCallback(
    (workspaceId: string, nextList: TabSafepoint[]) => {
      setSafepoints(nextList);
      safepointsRef.current = nextList;
      void setMetaValue(tabSafepointMetaKey(workspaceId), nextList);
    },
    []
  );

  const hasPendingChanges = useMemo(() => {
    if (!activeWorkspace) return false;
    const baseline = baselineByWorkspaceRef.current.get(activeWorkspace.id);
    if (!baseline) return false;
    return (
      baseline.dbml !== activeWorkspace.dbml ||
      baseline.detailLevel !== activeWorkspace.detailLevel ||
      baseline.activeSchemaFile !== activeWorkspace.activeSchemaFile ||
      baseline.tablePositions !== activeWorkspace.tablePositions ||
      baseline.groupMeta !== activeWorkspace.groupMeta ||
      baseline.stickyNotes !== activeWorkspace.stickyNotes
    );
    // baselineVersion invalidates when baselineByWorkspaceRef updates
  }, [activeWorkspace, baselineVersion]);

  const captureSafepoint = useCallback(
    (options: {
      fromTab: ViewMode;
      toTab: ViewMode;
      reason: SafepointReason;
      viewState?: SafepointViewState;
      silent?: boolean;
    }): TabSafepoint | null => {
      if (!activeWorkspace) return null;
      const wsId = activeWorkspace.id;
      const baseline = baselineByWorkspaceRef.current.get(wsId) || null;

      if (options.reason === 'tab-switch' && baseline) {
        const delta = summarizeSafepointDelta(baseline, activeWorkspace);
        if (!delta.hasChanges) {
          return null;
        }
      }

      const sp = buildTabSafepoint({
        workspace: activeWorkspace,
        fromTab: options.fromTab,
        toTab: options.toTab,
        reason: options.reason,
        previousSnapshot: baseline,
        viewState: options.viewState,
      });

      baselineByWorkspaceRef.current.set(wsId, sp.snapshot);
      setBaselineVersion((v) => v + 1);

      const nextList = [sp, ...safepointsRef.current].slice(
        0,
        MAX_SAFEPOINTS_PER_WORKSPACE
      );
      persistSafepoints(wsId, nextList);

      if (!options.silent) {
        if (options.reason === 'tab-switch') {
          showToast(`Safepoint saved (${formatSafepointBadge(sp)})`);
        } else if (options.reason === 'manual') {
          showToast('Pinned manual safepoint');
        }
      }

      return sp;
    },
    [activeWorkspace, persistSafepoints, showToast]
  );

  const restoreSafepoint = useCallback(
    (
      safepointId: string,
      currentTab: ViewMode,
      currentViewState?: SafepointViewState
    ) => {
      if (!activeWorkspace) return;
      const target = safepointsRef.current.find((s) => s.id === safepointId);
      if (!target) return;

      const wsId = activeWorkspace.id;
      const baseline = baselineByWorkspaceRef.current.get(wsId) || null;
      const hasCurrentEdits =
        !baseline ||
        summarizeSafepointDelta(baseline, activeWorkspace).hasChanges ||
        summarizeSafepointDelta(target.snapshot, activeWorkspace).hasChanges;

      let nextList = safepointsRef.current;
      if (hasCurrentEdits) {
        const guard = buildTabSafepoint({
          workspace: activeWorkspace,
          fromTab: currentTab,
          toTab: target.fromTab,
          reason: 'pre-restore',
          previousSnapshot: baseline,
          viewState: currentViewState,
        });
        nextList = [guard, ...nextList].slice(0, MAX_SAFEPOINTS_PER_WORKSPACE);
      }

      const snap = target.snapshot;
      updateActiveWorkspace((ws) => ({
        ...ws,
        dbml: snap.dbml,
        schemaFiles: snap.schemaFiles
          ? snap.schemaFiles.map((f) => ({ ...f }))
          : undefined,
        activeSchemaFile: snap.activeSchemaFile,
        tablePositions: { ...snap.tablePositions },
        groupMeta: { ...snap.groupMeta },
        stickyNotes: snap.stickyNotes.map((n) => ({ ...n })),
        detailLevel: snap.detailLevel,
      }));

      baselineByWorkspaceRef.current.set(wsId, {
        ...snap,
        schemaFiles: snap.schemaFiles
          ? snap.schemaFiles.map((f) => ({ ...f }))
          : undefined,
        tablePositions: { ...snap.tablePositions },
        groupMeta: { ...snap.groupMeta },
        stickyNotes: snap.stickyNotes.map((n) => ({ ...n })),
      });
      setBaselineVersion((v) => v + 1);
      persistSafepoints(wsId, nextList);

      onRestoreViewState(target.fromTab, target.viewState);
      showToast(`Restored safepoint (${formatSafepointBadge(target)})`);
    },
    [
      activeWorkspace,
      onRestoreViewState,
      persistSafepoints,
      showToast,
      updateActiveWorkspace,
    ]
  );

  const deleteSafepoint = useCallback(
    (safepointId: string) => {
      if (!activeWorkspace) return;
      const nextList = safepointsRef.current.filter(
        (sp) => sp.id !== safepointId
      );
      persistSafepoints(activeWorkspace.id, nextList);
    },
    [activeWorkspace, persistSafepoints]
  );

  const clearSafepoints = useCallback(() => {
    if (!activeWorkspace) return;
    persistSafepoints(activeWorkspace.id, []);
    showToast('Cleared tab safepoints');
  }, [activeWorkspace, persistSafepoints, showToast]);

  return {
    safepoints,
    hasPendingChanges,
    captureSafepoint,
    restoreSafepoint,
    deleteSafepoint,
    clearSafepoints,
  };
}
