import { useCallback, useEffect, useMemo } from 'react';
import { SidebarTab } from '../../../components/Sidebar';
import {
  DetailLevel,
  SchemaModuleFile,
  SchemaVersion,
  StickyNote,
  TablePosition,
  WorkspaceProject,
} from '../../../types/schema';
import {
  autoLayoutSingleGroup,
  buildTableInstances,
  computeAutoLayout,
} from '../../../utils/autoLayout';
import {
  assignTableToGroupInDbml,
  deleteTableGroupInDbml,
  moveTableToGroupInDbml,
  parseDbml,
  removeTableFromGroupInDbml,
  reorderTableGroupsInDbml,
  setTableGroupsForTableInDbml,
  setTableHeaderColorInDbml,
  upsertTableGroupInDbml,
} from '../../../utils/dbmlParser';
import {
  cleanFolderPrefix,
  detectSchemaFolder,
  findModuleDefiningTable,
  findModuleDefiningTableGroup,
  mapMergedErrorsToModules,
  mapMergedLineToModule,
  MERGED_SCHEMA_VIEW_ID,
  mergeSchemaFiles,
  normalizeModulePath,
  splitDbmlIntoModuleFiles,
} from '../../../utils/schemaModules';

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

  const isModular = Boolean(
    activeWorkspace?.schemaFiles && activeWorkspace.schemaFiles.length > 0
  );

  const activeSchemaFolder = useMemo(() => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length === 0) {
      return 'schema';
    }
    return cleanFolderPrefix(
      activeWorkspace.schemaFolder ||
        detectSchemaFolder(activeWorkspace.schemaFiles)
    );
  }, [activeWorkspace?.schemaFiles, activeWorkspace?.schemaFolder]);

  const mergeResult = useMemo(() => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length === 0) {
      return null;
    }
    return mergeSchemaFiles(activeWorkspace.schemaFiles, {
      schemaFolder: activeSchemaFolder,
    });
  }, [activeWorkspace?.schemaFiles, activeSchemaFolder]);

  const moduleErrors = useMemo(() => {
    if (!mergeResult) return null;
    return mapMergedErrorsToModules(parsedSchema.errors, mergeResult.segments);
  }, [mergeResult, parsedSchema.errors]);

  const activeSchemaFilePath = useMemo(() => {
    if (!isModular || !activeWorkspace?.schemaFiles) return '';
    const current = activeWorkspace.activeSchemaFile;
    if (current === MERGED_SCHEMA_VIEW_ID) return MERGED_SCHEMA_VIEW_ID;
    if (current && activeWorkspace.schemaFiles.some((f) => f.path === current)) {
      return current;
    }
    const sorted = [...activeWorkspace.schemaFiles].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    return sorted[0]?.path || '';
  }, [isModular, activeWorkspace?.schemaFiles, activeWorkspace?.activeSchemaFile]);

  const editorValue = useMemo(() => {
    if (!activeWorkspace) return '';
    if (!isModular || !activeWorkspace.schemaFiles) return activeWorkspace.dbml;
    if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) {
      return mergeResult?.mergedDbml || activeWorkspace.dbml;
    }
    return (
      activeWorkspace.schemaFiles.find((f) => f.path === activeSchemaFilePath)
        ?.content || ''
    );
  }, [activeWorkspace, isModular, activeSchemaFilePath, mergeResult]);

  const editorErrors = useMemo(() => {
    if (!isModular) return parsedSchema.errors;
    if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) {
      return parsedSchema.errors;
    }
    return moduleErrors?.byFile[activeSchemaFilePath] || [];
  }, [isModular, activeSchemaFilePath, parsedSchema.errors, moduleErrors]);

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

  const suggestedVersionTag = useMemo(() => {
    const latest = activeWorkspace?.versions[0]?.tag;
    const m = latest?.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return 'v1.2.0';
    return `v${m[1]}.${Number(m[2]) + 1}.0`;
  }, [activeWorkspace?.versions]);

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

  const jumpToMergedLine = useCallback(
    (mergedLine?: number) => {
      if (!mergedLine) return;
      if (!isModular || !mergeResult) {
        setScrollToLine(mergedLine);
        return;
      }
      const mapped = mapMergedLineToModule(mergedLine, mergeResult.segments);
      if (mapped) {
        updateActiveWorkspace((ws) => ({
          ...ws,
          activeSchemaFile: mapped.path,
        }));
        setScrollToLine(mapped.localLine);
      } else {
        setScrollToLine(mergedLine);
      }
    },
    [isModular, mergeResult, updateActiveWorkspace, setScrollToLine]
  );

  const updateModularFiles = useCallback(
    (
      updater: (
        files: SchemaModuleFile[],
        ws: WorkspaceProject
      ) => {
        files: SchemaModuleFile[];
        activeSchemaFile?: string;
        schemaFolder?: string;
      }
    ) => {
      updateActiveWorkspace((ws) => {
        const currentFiles = ws.schemaFiles || [];
        const next = updater(currentFiles, ws);
        const folder = cleanFolderPrefix(
          next.schemaFolder ||
            ws.schemaFolder ||
            detectSchemaFolder(next.files)
        );
        const merged = mergeSchemaFiles(next.files, { schemaFolder: folder });
        return {
          ...ws,
          schemaFiles: next.files,
          schemaFolder: folder,
          activeSchemaFile:
            next.activeSchemaFile !== undefined
              ? next.activeSchemaFile
              : ws.activeSchemaFile,
          dbml: merged.mergedDbml,
        };
      });
    },
    [updateActiveWorkspace]
  );

  const handleDbmlChange = (nextDbml: string) => {
    if (isModular) {
      if (activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID) return;
      updateModularFiles((files) => ({
        files: files.map((f) =>
          f.path === activeSchemaFilePath ? { ...f, content: nextDbml } : f
        ),
      }));
      return;
    }
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleSelectSchemaFile = (path: string) => {
    setScrollToLine(null);
    updateActiveWorkspace((ws) => ({
      ...ws,
      activeSchemaFile: path,
    }));
  };

  const handleCreateSchemaFile = (rawPath: string, content: string) => {
    if (!activeWorkspace) return;
    const normalizedPath = normalizeModulePath(rawPath, activeSchemaFolder);
    const existing = activeWorkspace.schemaFiles?.find(
      (f) => f.path === normalizedPath
    );
    if (existing) {
      handleSelectSchemaFile(existing.path);
      showToast(`${normalizedPath} already exists`);
      return;
    }
    const created: SchemaModuleFile = {
      id: `mod_${Date.now()}`,
      path: normalizedPath,
      content,
    };
    updateModularFiles((files) => ({
      files: [...files, created],
      activeSchemaFile: normalizedPath,
    }));
    showToast(`Created ${normalizedPath}`);
  };

  const handleRenameSchemaFile = (oldPath: string, rawNewPath: string) => {
    if (!activeWorkspace) return;
    const nextPath = normalizeModulePath(rawNewPath, activeSchemaFolder);
    if (!nextPath || nextPath === oldPath) return;
    if (activeWorkspace.schemaFiles?.some((f) => f.path === nextPath)) {
      showToast(`${nextPath} already exists`);
      return;
    }
    updateModularFiles((files) => ({
      files: files.map((f) =>
        f.path === oldPath
          ? {
              ...f,
              path: nextPath,
              sha: undefined,
              lastSyncedContent: undefined,
              lastSyncedAt: undefined,
            }
          : f
      ),
      activeSchemaFile: nextPath,
    }));
    showToast(`Renamed ${oldPath} → ${nextPath}`);
  };

  const handleDeleteSchemaFile = (path: string) => {
    if (!activeWorkspace?.schemaFiles || activeWorkspace.schemaFiles.length <= 1) {
      return;
    }
    const remaining = activeWorkspace.schemaFiles
      .filter((f) => f.path !== path)
      .sort((a, b) => a.path.localeCompare(b.path));
    const nextActive = remaining[0]?.path || MERGED_SCHEMA_VIEW_ID;
    updateModularFiles(() => ({
      files: remaining,
      activeSchemaFile: nextActive,
    }));
    showToast(`Deleted ${path}`);
  };

  const handleEnableModularMode = () => {
    if (!activeWorkspace) return;
    const folder = activeWorkspace.schemaFolder || 'schema';
    const splitFiles = splitDbmlIntoModuleFiles(activeWorkspace.dbml, folder);
    const merged = mergeSchemaFiles(splitFiles, { schemaFolder: folder });
    const defaultActive =
      splitFiles.find((f) => !/_project\.dbml$/i.test(f.path))?.path ||
      splitFiles[0]?.path;
    updateActiveWorkspace((ws) => ({
      ...ws,
      schemaFiles: splitFiles,
      schemaFolder: folder,
      activeSchemaFile: defaultActive,
      githubLink: undefined,
      dbml: merged.mergedDbml,
    }));
    setEditorWidth((w) => Math.max(w, 580));
    showToast(`Split into ${splitFiles.length} modular files in ${folder}/`);
  };

  const handleFlattenToSingleFile = () => {
    if (!activeWorkspace) return;
    const flattened = mergeResult?.mergedDbml || activeWorkspace.dbml;
    updateActiveWorkspace((ws) => ({
      ...ws,
      dbml: flattened,
      schemaFiles: undefined,
      activeSchemaFile: undefined,
      githubRepoLink: undefined,
    }));
    showToast('Flattened modular files back into a single schema.dbml');
  };

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

  const handleSaveVersion = (data: {
    tag: string;
    title: string;
    description: string;
    isPublished: boolean;
  }) => {
    if (!activeWorkspace) return;
    const newVer: SchemaVersion = {
      id: `ver_${Date.now()}`,
      tag: data.tag,
      title: data.title,
      description: data.description,
      dbml: activeWorkspace.dbml,
      tablePositions: activeWorkspace.tablePositions,
      stickyNotes: activeWorkspace.stickyNotes,
      createdAt: new Date().toISOString(),
      isPublished: data.isPublished,
    };
    updateActiveWorkspace((ws) => ({
      ...ws,
      versions: [newVer, ...ws.versions],
    }));
    setSaveVersionOpen(false);
    setSidebarTab('versions');
    setSidebarOpen(true);
    showToast(`Saved snapshot ${data.tag}`);
  };

  const handleRestoreVersion = (ver: SchemaVersion) => {
    if (!activeWorkspace) return;
    const backup: SchemaVersion = {
      id: `ver_backup_${Date.now()}`,
      tag: `backup-${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      title: `Pre-revert checkpoint (before ${ver.tag})`,
      description: 'Automatic snapshot created before reverting schema.',
      dbml: activeWorkspace.dbml,
      tablePositions: activeWorkspace.tablePositions,
      stickyNotes: activeWorkspace.stickyNotes,
      createdAt: new Date().toISOString(),
      isPublished: false,
    };
    updateActiveWorkspace((ws) => {
      const nextSchemaFiles =
        ws.schemaFiles && ws.schemaFiles.length > 0
          ? splitDbmlIntoModuleFiles(ver.dbml, ws.schemaFolder || 'schema')
          : undefined;
      return {
        ...ws,
        dbml: ver.dbml,
        schemaFiles: nextSchemaFiles,
        activeSchemaFile:
          nextSchemaFiles && nextSchemaFiles.length > 0
            ? nextSchemaFiles[0].path
            : undefined,
        tablePositions:
          Object.keys(ver.tablePositions).length > 0
            ? ver.tablePositions
            : computeAutoLayout(parseDbml(ver.dbml), ws.detailLevel),
        stickyNotes: ver.stickyNotes || ws.stickyNotes,
        versions: [backup, ...ws.versions],
      };
    });
    setFocusFit();
    showToast(`Reverted schema to ${ver.tag}`);
  };

  const handleTogglePublishVersion = (versionId: string) => {
    updateActiveWorkspace((ws) => ({
      ...ws,
      versions: ws.versions.map((v) =>
        v.id === versionId ? { ...v, isPublished: !v.isPublished } : v
      ),
    }));
  };

  return {
    parsedSchema,
    isModular,
    activeSchemaFolder,
    mergeResult,
    moduleErrors,
    activeSchemaFilePath,
    editorValue,
    editorErrors,
    hasGithubChanges,
    suggestedVersionTag,
    jumpToMergedLine,
    handleDbmlChange,
    handleSelectSchemaFile,
    handleCreateSchemaFile,
    handleRenameSchemaFile,
    handleDeleteSchemaFile,
    handleEnableModularMode,
    handleFlattenToSingleFile,
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
    handleSaveVersion,
    handleRestoreVersion,
    handleTogglePublishVersion,
  };
}
