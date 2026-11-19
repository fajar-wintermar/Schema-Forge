import { useEffect, useMemo } from 'react';
import { SidebarTab } from '../../sidebar/types';
import { TablePosition, WorkspaceProject } from '../../../types/schema';
import { buildTableInstances } from '../../../utils/autoLayout';
import { parseDbml } from '../../../utils/dbmlParser';
import { useModularSchemaFiles } from './useModularSchemaFiles';
import { useDiagramSchemaActions } from './useDiagramSchemaActions';
import { useSchemaVersions } from './useSchemaVersions';

interface UseSchemaActionsOptions {
  activeWorkspace: WorkspaceProject | null;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  setScrollToLine: React.Dispatch<React.SetStateAction<number | null>>;
  setFocusFit: () => void;
  setSidebarTab: React.Dispatch<React.SetStateAction<SidebarTab>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSaveVersionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeGroupModal: () => void;
  setSelectedDomains: React.Dispatch<React.SetStateAction<string[]>>;
  setEditorWidth: React.Dispatch<React.SetStateAction<number>>;
  showToast: (msg: string) => void;
}

export function useSchemaActions({
  activeWorkspace,
  updateActiveWorkspace,
  setScrollToLine,
  setFocusFit,
  setSidebarTab,
  setSidebarOpen,
  setSaveVersionOpen,
  closeGroupModal,
  setSelectedDomains,
  setEditorWidth,
  showToast,
}: UseSchemaActionsOptions) {
  const parsedSchema = useMemo(
    () => parseDbml(activeWorkspace?.dbml || ''),
    [activeWorkspace?.dbml]
  );

  const hasGithubChanges = useMemo(() => {
    if (!activeWorkspace) return false;
    if (activeWorkspace.githubRepoLink && activeWorkspace.schemaFiles) {
      return activeWorkspace.schemaFiles.some(
        (f) =>
          f.lastSyncedContent === undefined || f.content !== f.lastSyncedContent
      );
    }
    return Boolean(
      activeWorkspace.githubLink &&
        activeWorkspace.dbml !== activeWorkspace.githubLink.lastSyncedDbml
    );
  }, [activeWorkspace]);

  // Ensure newly typed tables or multi-domain instances get non-overlapping coordinates
  useEffect(() => {
    if (!activeWorkspace) return;
    const { instances } = buildTableInstances(parsedSchema);
    const missing = instances.filter(
      (inst) => !activeWorkspace.tablePositions[inst.posKey]
    );
    if (missing.length === 0) return;

    const patch: Record<string, TablePosition> = {};
    const existingCoords = Object.values(activeWorkspace.tablePositions);
    let fallbackY = 80;
    let fallbackX = 80;
    for (const p of existingCoords) {
      fallbackY = Math.max(fallbackY, p.y + 220);
      fallbackX = Math.min(fallbackX, p.x);
    }

    missing.forEach((inst, idx) => {
      if (inst.groupName) {
        const siblings = instances.filter(
          (other) =>
            other.groupName === inst.groupName &&
            other.posKey !== inst.posKey &&
            activeWorkspace.tablePositions[other.posKey]
        );
        if (siblings.length > 0) {
          let maxRight = -Infinity;
          let avgY = 0;
          for (const sib of siblings) {
            const sp = activeWorkspace.tablePositions[sib.posKey];
            maxRight = Math.max(maxRight, sp.x + 276);
            avgY += sp.y;
          }
          patch[inst.posKey] = {
            x: maxRight + 56,
            y: Math.round(avgY / siblings.length),
          };
          return;
        }
      }
      patch[inst.posKey] = {
        x: fallbackX + (idx % 3) * 320,
        y: fallbackY + Math.floor(idx / 3) * 260,
      };
    });

    updateActiveWorkspace((ws) => ({
      ...ws,
      tablePositions: { ...ws.tablePositions, ...patch },
    }));
  }, [parsedSchema, activeWorkspace, updateActiveWorkspace]);

  const modular = useModularSchemaFiles({
    activeWorkspace,
    parsedSchema,
    updateActiveWorkspace,
    setScrollToLine,
    setEditorWidth,
    showToast,
  });

  const diagram = useDiagramSchemaActions({
    activeWorkspace,
    parsedSchema,
    isModular: modular.isModular,
    updateActiveWorkspace,
    updateModularFiles: modular.updateModularFiles,
    setFocusFit,
    closeGroupModal,
    setSelectedDomains,
    showToast,
  });

  const versions = useSchemaVersions({
    activeWorkspace,
    updateActiveWorkspace,
    setFocusFit,
    setSaveVersionOpen,
    setSidebarTab,
    setSidebarOpen,
    showToast,
  });

  return {
    parsedSchema,
    hasGithubChanges,
    ...modular,
    ...diagram,
    ...versions,
  };
}
