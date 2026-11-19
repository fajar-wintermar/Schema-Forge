import {
  DetailLevel,
  ParsedSchema,
  SchemaModuleFile,
  StickyNote,
  WorkspaceProject,
} from '../../../types/schema';
import {
  autoLayoutSingleGroup,
  computeAutoLayout,
} from '../../../utils/autoLayout';
import {
  assignTableToGroupInDbml,
  deleteTableGroupInDbml,
  moveTableToGroupInDbml,
  removeTableFromGroupInDbml,
  reorderTableGroupsInDbml,
  setTableGroupsForTableInDbml,
  setTableHeaderColorInDbml,
  upsertTableGroupInDbml,
} from '../../../utils/dbmlParser';
import {
  findModuleDefiningTable,
  findModuleDefiningTableGroup,
} from '../../../utils/schemaModules';

interface UseDiagramSchemaActionsOptions {
  activeWorkspace: WorkspaceProject | null;
  parsedSchema: ParsedSchema;
  isModular: boolean;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  updateModularFiles: (
    updater: (
      files: SchemaModuleFile[],
      ws: WorkspaceProject
    ) => {
      files: SchemaModuleFile[];
      activeSchemaFile?: string;
      schemaFolder?: string;
    }
  ) => void;
  setFocusFit: () => void;
  closeGroupModal: () => void;
  setSelectedDomains: React.Dispatch<React.SetStateAction<string[]>>;
  showToast: (msg: string) => void;
}

export function useDiagramSchemaActions({
  activeWorkspace,
  parsedSchema,
  isModular,
  updateActiveWorkspace,
  updateModularFiles,
  setFocusFit,
  closeGroupModal,
  setSelectedDomains,
  showToast,
}: UseDiagramSchemaActionsOptions) {
  const handleDetailLevelChange = (level: DetailLevel) => {
    updateActiveWorkspace((ws) => ({ ...ws, detailLevel: level }));
  };

  const handleAutoLayout = () => {
    if (!activeWorkspace) return;
    const nextPositions = computeAutoLayout(
      parsedSchema,
      activeWorkspace.detailLevel
    );
    updateActiveWorkspace((ws) => ({
      ...ws,
      tablePositions: nextPositions,
    }));
    setFocusFit();
    showToast('Auto-arranged business domains to minimize edge crossings');
  };

  const handleAutoLayoutGroup = (groupName: string) => {
    if (!activeWorkspace) return;
    const nextPositions = autoLayoutSingleGroup(
      groupName,
      parsedSchema,
      activeWorkspace.tablePositions,
      activeWorkspace.detailLevel
    );
    updateActiveWorkspace((ws) => ({
      ...ws,
      tablePositions: nextPositions,
    }));
    showToast(`Re-arranged tables in "${groupName}"`);
  };

  const handleChangeTableHeaderColor = (
    tableId: string,
    color: string | null
  ) => {
    if (!activeWorkspace) return;
    if (isModular) {
      updateModularFiles((files) => {
        const ownerMod = findModuleDefiningTable(files, tableId);
        if (!ownerMod) return { files };
        return {
          files: files.map((f) =>
            f.path === ownerMod.path
              ? {
                  ...f,
                  content: setTableHeaderColorInDbml(f.content, tableId, color),
                }
              : f
          ),
        };
      });
      return;
    }
    const nextDbml = setTableHeaderColorInDbml(
      activeWorkspace.dbml,
      tableId,
      color
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleMoveTableToGroup = (
    tableId: string,
    targetGroup: string | null,
    sourceGroup?: string | null,
    keepInSource?: boolean
  ) => {
    if (!activeWorkspace) return;
    if (isModular) {
      updateModularFiles((files) => {
        let nextFiles = [...files];
        if (targetGroup && keepInSource) {
          const targetMod = findModuleDefiningTableGroup(nextFiles, targetGroup);
          if (targetMod) {
            nextFiles = nextFiles.map((f) =>
              f.path === targetMod.path
                ? {
                    ...f,
                    content: assignTableToGroupInDbml(
                      f.content,
                      tableId,
                      targetGroup,
                      parsedSchema
                    ),
                  }
                : f
            );
          }
        } else if (targetGroup) {
          if (sourceGroup !== undefined) {
            if (sourceGroup && sourceGroup !== targetGroup) {
              const srcMod = findModuleDefiningTableGroup(nextFiles, sourceGroup);
              if (srcMod) {
                nextFiles = nextFiles.map((f) =>
                  f.path === srcMod.path
                    ? {
                        ...f,
                        content: removeTableFromGroupInDbml(
                          f.content,
                          tableId,
                          sourceGroup,
                          parsedSchema
                        ),
                      }
                    : f
                );
              }
            }
          } else {
            nextFiles = nextFiles.map((f) => ({
              ...f,
              content: removeTableFromGroupInDbml(
                f.content,
                tableId,
                null,
                parsedSchema
              ),
            }));
          }
          const targetMod = findModuleDefiningTableGroup(nextFiles, targetGroup);
          if (targetMod) {
            nextFiles = nextFiles.map((f) =>
              f.path === targetMod.path
                ? {
                    ...f,
                    content: assignTableToGroupInDbml(
                      f.content,
                      tableId,
                      targetGroup,
                      parsedSchema
                    ),
                  }
                : f
            );
          }
        } else {
          nextFiles = nextFiles.map((f) => ({
            ...f,
            content: removeTableFromGroupInDbml(
              f.content,
              tableId,
              sourceGroup ?? null,
              parsedSchema
            ),
          }));
        }
        return { files: nextFiles };
      });
      if (targetGroup && keepInSource) {
        showToast(`Shared ${tableId} into "${targetGroup}"`);
      } else if (targetGroup) {
        showToast(`Moved ${tableId} to "${targetGroup}"`);
      } else {
        showToast(`Removed ${tableId} from domain`);
      }
      return;
    }

    let nextDbml: string;
    if (targetGroup && keepInSource) {
      nextDbml = assignTableToGroupInDbml(
        activeWorkspace.dbml,
        tableId,
        targetGroup,
        parsedSchema
      );
      showToast(`Shared ${tableId} into "${targetGroup}"`);
    } else if (targetGroup) {
      nextDbml = moveTableToGroupInDbml(
        activeWorkspace.dbml,
        tableId,
        targetGroup,
        parsedSchema,
        sourceGroup
      );
      showToast(`Moved ${tableId} to "${targetGroup}"`);
    } else {
      nextDbml = removeTableFromGroupInDbml(
        activeWorkspace.dbml,
        tableId,
        sourceGroup ?? null,
        parsedSchema
      );
      showToast(`Removed ${tableId} from domain`);
    }
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleRemoveTableFromGroup = (tableId: string, groupName: string) => {
    if (!activeWorkspace) return;
    if (isModular) {
      updateModularFiles((files) => {
        const mod = findModuleDefiningTableGroup(files, groupName);
        if (!mod) return { files };
        return {
          files: files.map((f) =>
            f.path === mod.path
              ? {
                  ...f,
                  content: removeTableFromGroupInDbml(
                    f.content,
                    tableId,
                    groupName,
                    parsedSchema
                  ),
                }
              : f
          ),
        };
      });
      showToast(`Removed ${tableId} from "${groupName}"`);
      return;
    }

    const nextDbml = removeTableFromGroupInDbml(
      activeWorkspace.dbml,
      tableId,
      groupName,
      parsedSchema
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
    showToast(`Removed ${tableId} from "${groupName}"`);
  };

  const handleSetTableGroups = (tableId: string, groupNames: string[]) => {
    if (!activeWorkspace) return;
    if (isModular) {
      const targetSet = new Set(groupNames);
      updateModularFiles((files) => {
        let nextFiles = [...files];
        for (const g of parsedSchema.tableGroups) {
          const hasTable = g.tables.includes(tableId);
          const shouldHave = targetSet.has(g.name);
          if (hasTable === shouldHave) continue;
          const mod = findModuleDefiningTableGroup(nextFiles, g.name);
          if (!mod) continue;
          const nextTables = shouldHave
            ? [...g.tables, tableId]
            : g.tables.filter((t) => t !== tableId);
          nextFiles = nextFiles.map((f) =>
            f.path === mod.path
              ? {
                  ...f,
                  content: upsertTableGroupInDbml(
                    f.content,
                    g.name,
                    nextTables,
                    g.color,
                    g.note
                  ),
                }
              : f
          );
        }
        return { files: nextFiles };
      });
      return;
    }

    const nextDbml = setTableGroupsForTableInDbml(
      activeWorkspace.dbml,
      tableId,
      groupNames,
      parsedSchema
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleReorderGroups = (orderedNames: string[]) => {
    if (!activeWorkspace) return;
    if (isModular) {
      updateModularFiles((files) => {
        const groupMap = new Map(
          parsedSchema.tableGroups.map((g) => [g.name, g])
        );
        const cleaned = files.map((f) => {
          let c = f.content;
          for (const g of parsedSchema.tableGroups) {
            c = deleteTableGroupInDbml(c, g.name);
          }
          return { ...f, content: c };
        });
        const targetMod =
          cleaned.find((f) => /_project\.dbml$/i.test(f.path)) || cleaned[0];
        if (!targetMod) return { files: cleaned };
        let c = targetMod.content;
        for (const name of orderedNames) {
          const g = groupMap.get(name);
          if (!g) continue;
          c = upsertTableGroupInDbml(c, g.name, g.tables, g.color, g.note);
        }
        return {
          files: cleaned.map((f) =>
            f.path === targetMod.path ? { ...f, content: c } : f
          ),
        };
      });
      return;
    }

    const nextDbml = reorderTableGroupsInDbml(
      activeWorkspace.dbml,
      orderedNames,
      parsedSchema
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleReorderTableInGroup = (
    groupName: string,
    orderedTables: string[]
  ) => {
    if (!activeWorkspace) return;
    const g = parsedSchema.tableGroups.find((gr) => gr.name === groupName);
    if (!g) return;
    if (isModular) {
      updateModularFiles((files) => {
        const mod = findModuleDefiningTableGroup(files, groupName);
        if (!mod) return { files };
        return {
          files: files.map((f) =>
            f.path === mod.path
              ? {
                  ...f,
                  content: upsertTableGroupInDbml(
                    f.content,
                    g.name,
                    orderedTables,
                    g.color,
                    g.note
                  ),
                }
              : f
          ),
        };
      });
      return;
    }
    const nextDbml = upsertTableGroupInDbml(
      activeWorkspace.dbml,
      g.name,
      orderedTables,
      g.color,
      g.note
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleSaveGroupModal = (data: {
    name: string;
    color: string;
    note: string;
    tables: string[];
    oldName?: string;
  }) => {
    if (!activeWorkspace) return;
    if (isModular) {
      updateModularFiles((files) => {
        const mod = findModuleDefiningTableGroup(
          files,
          data.oldName || data.name
        );
        if (!mod) return { files };
        return {
          files: files.map((f) =>
            f.path === mod.path
              ? {
                  ...f,
                  content: upsertTableGroupInDbml(
                    f.content,
                    data.name,
                    data.tables,
                    data.color,
                    data.note,
                    data.oldName
                  ),
                }
              : f
          ),
        };
      });
      closeGroupModal();
      showToast(
        data.oldName
          ? `Updated domain "${data.name}"`
          : `Created domain "${data.name}"`
      );
      return;
    }

    const nextDbml = upsertTableGroupInDbml(
      activeWorkspace.dbml,
      data.name,
      data.tables,
      data.color,
      data.note,
      data.oldName
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
    closeGroupModal();
    showToast(
      data.oldName
        ? `Updated domain "${data.name}"`
        : `Created domain "${data.name}"`
    );
  };

  const handleDeleteGroup = (groupName: string) => {
    if (!activeWorkspace) return;
    setSelectedDomains((prev) => prev.filter((d) => d !== groupName));
    if (isModular) {
      updateModularFiles((files) => {
        const mod = findModuleDefiningTableGroup(files, groupName);
        if (!mod) return { files };
        return {
          files: files.map((f) =>
            f.path === mod.path
              ? { ...f, content: deleteTableGroupInDbml(f.content, groupName) }
              : f
          ),
        };
      });
      showToast(`Removed domain grouping "${groupName}"`);
      return;
    }
    const nextDbml = deleteTableGroupInDbml(activeWorkspace.dbml, groupName);
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
    showToast(`Removed domain grouping "${groupName}"`);
  };

  const handleAddStickyNote = (x: number, y: number, linkedTarget?: string) => {
    const note: StickyNote = {
      id: `note_${Date.now()}`,
      x,
      y,
      width: 240,
      color: 'amber',
      title: linkedTarget
        ? `Note: ${linkedTarget.replace('table:', '')}`
        : 'Architecture Note',
      content: '',
      author: 'Team',
      updatedAt: new Date().toISOString(),
      linkedTarget,
    };
    updateActiveWorkspace((ws) => ({
      ...ws,
      stickyNotes: [...ws.stickyNotes, note],
    }));
  };

  const handleUpdateStickyNote = (id: string, patch: Partial<StickyNote>) => {
    updateActiveWorkspace((ws) => ({
      ...ws,
      stickyNotes: ws.stickyNotes.map((n) =>
        n.id === id ? { ...n, ...patch } : n
      ),
    }));
  };

  const handleDeleteStickyNote = (id: string) => {
    updateActiveWorkspace((ws) => ({
      ...ws,
      stickyNotes: ws.stickyNotes.filter((n) => n.id !== id),
    }));
  };

  return {
    handleDetailLevelChange,
    handleAutoLayout,
    handleAutoLayoutGroup,
    handleChangeTableHeaderColor,
    handleMoveTableToGroup,
    handleRemoveTableFromGroup,
    handleSetTableGroups,
    handleReorderGroups,
    handleReorderTableInGroup,
    handleSaveGroupModal,
    handleDeleteGroup,
    handleAddStickyNote,
    handleUpdateStickyNote,
    handleDeleteStickyNote,
  };
}
