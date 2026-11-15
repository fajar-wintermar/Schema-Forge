import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PanelLeftOpen } from 'lucide-react';
import { DbmlEditor } from './components/DbmlEditor';
import { DiagramCanvas } from './components/DiagramCanvas';
import { DocsView } from './components/DocsView';
import { InspectorDrawer } from './components/InspectorDrawer';
import {
  ImportExportModal,
  SaveVersionModal,
  ShortcutsModal,
  TableGroupModal,
  WorkspacesModal,
} from './components/Modals';
import { Sidebar, SidebarTab } from './components/Sidebar';
import { GlobalSearchResult, TopBar } from './components/TopBar';
import {
  deleteWorkspace,
  getMetaValue,
  loadAllWorkspaces,
  saveWorkspace,
  setMetaValue,
} from './db/localDb';
import {
  DetailLevel,
  SchemaVersion,
  StickyNote,
  TableGroupDef,
  TablePosition,
  ViewMode,
  WorkspaceProject,
} from './types/schema';
import {
  autoLayoutSingleGroup,
  buildTableInstances,
  computeAutoLayout,
} from './utils/autoLayout';
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
} from './utils/dbmlParser';
import {
  createInitialWorkspace,
  createSaaSTelemetryWorkspace,
} from './utils/sampleSchemas';

export default function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceProject[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('domains');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [docsDetailLevel, setDocsDetailLevel] = useState<DetailLevel>('full');
  const [editorWidth, setEditorWidth] = useState(410);
  const [editorState, setEditorState] = useState<
    'normal' | 'maximized' | 'minimized'
  >('normal');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<{
    tableId: string;
    columnName: string;
  } | null>(null);
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    type: 'table' | 'group' | 'fit';
    id?: string;
    nonce: number;
  } | null>(null);

  // Modals
  const [groupModalState, setGroupModalState] = useState<{
    open: boolean;
    group: TableGroupDef | null;
  }>({ open: false, group: null });
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [workspacesModalOpen, setWorkspacesModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const modKey = useMemo(() => {
    if (typeof navigator === 'undefined') return '⌘';
    const platform = navigator.platform || navigator.userAgent || '';
    return /Mac|iPod|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl+';
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Load initial workspaces & theme from IndexedDB
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
      const target =
        list.find((w) => w.id === lastActive)?.id || list[0].id;

      if (mounted) {
        setWorkspaces(list);
        setActiveId(target);
        setLoading(false);
        setFocusRequest({ type: 'fit', nonce: Date.now() });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Apply dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    setMetaValue('darkMode', darkMode);
  }, [darkMode]);

  // Global keyboard shortcuts for sidebar, editor, maximize/restore, import/export, and save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (groupModalState.open)
          setGroupModalState({ open: false, group: null });
        else if (saveVersionOpen) setSaveVersionOpen(false);
        else if (importExportOpen) setImportExportOpen(false);
        else if (workspacesModalOpen) setWorkspacesModalOpen(false);
        return;
      }

      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;

      const anyModalOpen =
        shortcutsOpen ||
        groupModalState.open ||
        saveVersionOpen ||
        importExportOpen ||
        workspacesModalOpen;

      const key = e.key.toLowerCase();

      // Mod + I: Toggle Import / Export
      if (!e.shiftKey && key === 'i') {
        e.preventDefault();
        if (!anyModalOpen || importExportOpen) {
          setImportExportOpen((o) => !o);
        }
        return;
      }

      // Mod + S: Open Save Version modal
      if (!e.shiftKey && key === 's') {
        e.preventDefault();
        if (!anyModalOpen) {
          setSaveVersionOpen(true);
        }
        return;
      }

      if (anyModalOpen) return;

      // Mod + B: Toggle Left Sidebar (locked hidden in Docs view)
      if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        if (viewMode !== 'docs') {
          setSidebarOpen((o) => !o);
        }
        return;
      }

      // Mod + \: Toggle Code Editor (minimize / restore split)
      if (!e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        if (viewMode !== 'split') {
          setViewMode('split');
          setEditorState('normal');
        } else {
          setEditorState((prev) =>
            prev === 'minimized' ? 'normal' : 'minimized'
          );
        }
        return;
      }

      // Mod + Shift + E: Toggle Maximize / Restore Code Editor
      if (e.shiftKey && key === 'e') {
        e.preventDefault();
        if (viewMode !== 'split') {
          setViewMode('split');
          setEditorState('maximized');
        } else {
          setEditorState((prev) =>
            prev === 'maximized' ? 'normal' : 'maximized'
          );
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewMode,
    shortcutsOpen,
    groupModalState.open,
    saveVersionOpen,
    importExportOpen,
    workspacesModalOpen,
  ]);

  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0] || null,
    [workspaces, activeId]
  );

  // Debounced persist to IndexedDB
  const saveTimerRef = useRef<number | null>(null);
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

  const parsedSchema = useMemo(
    () => parseDbml(activeWorkspace?.dbml || ''),
    [activeWorkspace?.dbml]
  );

  const effectiveSelectedDomains = useMemo(() => {
    if (selectedDomains.length === 0) return [];
    const existing = new Set(parsedSchema.tableGroups.map((g) => g.name));
    return selectedDomains.filter((d) => existing.has(d));
  }, [selectedDomains, parsedSchema.tableGroups]);

  // Ensure any newly typed tables or shared multi-domain instances get non-overlapping coordinates
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

  // Resizable split divider handler
  const startSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const origWidth = editorWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(720, Math.max(260, origWidth + (ev.clientX - startX)));
      setEditorWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (loading || !activeWorkspace) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Loading SchemaForge workspace...
      </div>
    );
  }

  // Handlers
  const handleDbmlChange = (nextDbml: string) => {
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleDetailLevelChange = (level: DetailLevel) => {
    updateActiveWorkspace((ws) => ({ ...ws, detailLevel: level }));
  };

  const handleAutoLayout = () => {
    const nextPositions = computeAutoLayout(
      parsedSchema,
      activeWorkspace.detailLevel
    );
    updateActiveWorkspace((ws) => ({
      ...ws,
      tablePositions: nextPositions,
    }));
    setFocusRequest({ type: 'fit', nonce: Date.now() });
    showToast('Auto-arranged business domains to minimize edge crossings');
  };

  const handleAutoLayoutGroup = (groupName: string) => {
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
    const nextDbml = setTableGroupsForTableInDbml(
      activeWorkspace.dbml,
      tableId,
      groupNames,
      parsedSchema
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
  };

  const handleReorderGroups = (orderedNames: string[]) => {
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
    const g = parsedSchema.tableGroups.find((gr) => gr.name === groupName);
    if (!g) return;
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
    // Preserve memberships in all other groups so tables can belong to multiple domains
    const nextDbml = upsertTableGroupInDbml(
      activeWorkspace.dbml,
      data.name,
      data.tables,
      data.color,
      data.note,
      data.oldName
    );
    updateActiveWorkspace((ws) => ({ ...ws, dbml: nextDbml }));
    setGroupModalState({ open: false, group: null });
    showToast(
      data.oldName
        ? `Updated domain "${data.name}"`
        : `Created domain "${data.name}"`
    );
  };

  const handleDeleteGroup = (groupName: string) => {
    const nextDbml = deleteTableGroupInDbml(activeWorkspace.dbml, groupName);
    setSelectedDomains((prev) => prev.filter((d) => d !== groupName));
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
      title: linkedTarget ? `Note: ${linkedTarget.replace('table:', '')}` : 'Architecture Note',
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
    // Save automatic backup checkpoint before reverting
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
    updateActiveWorkspace((ws) => ({
      ...ws,
      dbml: ver.dbml,
      tablePositions:
        Object.keys(ver.tablePositions).length > 0
          ? ver.tablePositions
          : computeAutoLayout(parseDbml(ver.dbml), ws.detailLevel),
      stickyNotes: ver.stickyNotes || ws.stickyNotes,
      versions: [backup, ...ws.versions],
    }));
    setFocusRequest({ type: 'fit', nonce: Date.now() });
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

  const handleImportDbml = (nextDbml: string) => {
    const nextParsed = parseDbml(nextDbml);
    const nextPos = computeAutoLayout(nextParsed, activeWorkspace.detailLevel);
    updateActiveWorkspace((ws) => ({
      ...ws,
      dbml: nextDbml,
      tablePositions: nextPos,
    }));
    setFocusRequest({ type: 'fit', nonce: Date.now() });
    showToast(
      `Imported ${nextParsed.tables.length} tables and ${nextParsed.refs.length} relationships`
    );
  };

  const handleSelectWorkspace = (id: string) => {
    setActiveId(id);
    setSelectedTableId(null);
    setSelectedDomains([]);
    setMetaValue('activeWorkspaceId', id);
    setFocusRequest({ type: 'fit', nonce: Date.now() });
  };

  const handleCreateBlankWorkspace = async (name: string) => {
    const starterDbml = `Project ${name.replace(/[^a-zA-Z0-9_]/g, '') || 'Schema'} {\n  database_type: 'PostgreSQL'\n}\n\nTable users [headercolor: #1e3a8a] {\n  id uuid [pk, not null]\n  email varchar(255) [unique, not null]\n  created_at timestamptz [default: \`now()\`]\n}\n\nTableGroup "Core Domain" [color: #2563EB] {\n  Note: 'Primary application entities'\n  users\n}\n`;
    const parsed = parseDbml(starterDbml);
    const ws: WorkspaceProject = {
      id: `ws_${Date.now()}`,
      name,
      description: 'Custom database schema workspace',
      dbml: starterDbml,
      tablePositions: computeAutoLayout(parsed, 'full'),
      groupMeta: {},
      stickyNotes: [],
      detailLevel: 'full',
      versions: [
        {
          id: `ver_${Date.now()}`,
          tag: 'v1.0.0',
          title: 'Initial Schema',
          description: 'Workspace initialized',
          dbml: starterDbml,
          tablePositions: computeAutoLayout(parsed, 'full'),
          stickyNotes: [],
          createdAt: new Date().toISOString(),
          isPublished: true,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveWorkspace(ws);
    setWorkspaces((prev) => [ws, ...prev]);
    handleSelectWorkspace(ws.id);
    setWorkspacesModalOpen(false);
    showToast(`Created workspace "${name}"`);
  };

  const handleLoadSampleTelemetry = async () => {
    const ws = createSaaSTelemetryWorkspace();
    await saveWorkspace(ws);
    setWorkspaces((prev) => [ws, ...prev]);
    handleSelectWorkspace(ws.id);
    setWorkspacesModalOpen(false);
    showToast('Loaded Multi-Tenant SaaS Telemetry template');
  };

  const handleDeleteWorkspace = async (id: string) => {
    await deleteWorkspace(id);
    setWorkspaces((prev) => {
      const next = prev.filter((w) => w.id !== id);
      if (id === activeId && next.length > 0) {
        setActiveId(next[0].id);
        setMetaValue('activeWorkspaceId', next[0].id);
      }
      return next;
    });
  };

  const selectedTable =
    parsedSchema.tables.find((t) => t.id === selectedTableId) || null;

  const suggestedVersionTag = (() => {
    const latest = activeWorkspace.versions[0]?.tag;
    const m = latest?.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return 'v1.2.0';
    return `v${m[1]}.${Number(m[2]) + 1}.0`;
  })();

  const handleChangeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'split' && editorState !== 'normal') {
      setEditorState('normal');
    }
  };

  const handleChangeSelectedDomains = (domains: string[]) => {
    setSelectedDomains(domains);
    setFocusRequest({
      type: domains.length === 1 ? 'group' : 'fit',
      id: domains.length === 1 ? domains[0] : undefined,
      nonce: Date.now(),
    });
  };

  const handleSelectSearchResult = (res: GlobalSearchResult) => {
    if (res.kind === 'group' && res.groupName) {
      setHighlightedColumn(null);
      setSelectedTableId(null);
      if (viewMode === 'docs') setViewMode('split');
      if (editorState === 'maximized') setEditorState('normal');
      setSelectedDomains([res.groupName]);
      if (res.line) setScrollToLine(res.line);
      setFocusRequest({ type: 'group', id: res.groupName, nonce: Date.now() });
      showToast(`Showing domain "${res.groupName}"`);
      return;
    }

    if (res.tableId) {
      if (viewMode === 'docs') setViewMode('split');
      if (editorState === 'maximized') setEditorState('normal');
      if (
        effectiveSelectedDomains.length > 0 &&
        !res.domains.some((d) => effectiveSelectedDomains.includes(d))
      ) {
        setSelectedDomains([]);
      }
      setSelectedTableId(res.tableId);

      if (res.kind === 'column' && res.columnName) {
        setHighlightedColumn({
          tableId: res.tableId,
          columnName: res.columnName,
        });
        // Ensure column is visible if currently in names-only or keys-only mode
        if (
          activeWorkspace.detailLevel === 'names' ||
          (activeWorkspace.detailLevel === 'keys' && !res.isPk)
        ) {
          handleDetailLevelChange('columns');
        }
        showToast(`Highlighted ${res.tableId}.${res.columnName}`);
      } else {
        setHighlightedColumn(null);
        showToast(`Focused table ${res.tableId}`);
      }

      if (res.line) setScrollToLine(res.line);
      setFocusRequest({ type: 'table', id: res.tableId, nonce: Date.now() });
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        projectName={activeWorkspace.name}
        schema={parsedSchema}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          if (viewMode !== 'docs') {
            setSidebarOpen((o) => !o);
          }
        }}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        onAutoLayout={handleAutoLayout}
        onSelectSearchResult={handleSelectSearchResult}
        onOpenWorkspaces={() => setWorkspacesModalOpen(true)}
        onOpenImportExport={() => setImportExportOpen(true)}
        onOpenSaveVersion={() => setSaveVersionOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        modKey={modKey}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        errorCount={parsedSchema.errors.length}
      />

      {/* Compact responsive toolbar for narrow viewports */}
      <div className="flex lg:hidden items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs overflow-x-auto">
        <div className="flex items-center gap-1">
          {(['split', 'diagram', 'docs'] as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleChangeViewMode(m)}
              className={`px-2.5 py-1 rounded capitalize font-medium ${
                viewMode === m
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleAutoLayout}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 font-medium"
        >
          Auto Layout
        </button>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && viewMode !== 'docs' && (
          <Sidebar
            activeTab={sidebarTab}
            onChangeTab={setSidebarTab}
            schema={parsedSchema}
            currentDbml={activeWorkspace.dbml}
            versions={activeWorkspace.versions}
            selectedDomains={effectiveSelectedDomains}
            onChangeSelectedDomains={handleChangeSelectedDomains}
            selectedTableId={selectedTableId}
            onSelectTable={(id) => {
              setSelectedTableId(id);
              const t = parsedSchema.tables.find((tb) => tb.id === id);
              if (t?.line) setScrollToLine(t.line);
              setFocusRequest({ type: 'table', id, nonce: Date.now() });
            }}
            onFocusGroupOnCanvas={(g) => {
              setFocusRequest({ type: 'group', id: g, nonce: Date.now() });
            }}
            onCreateGroup={() =>
              setGroupModalState({ open: true, group: null })
            }
            onEditGroup={(group) =>
              setGroupModalState({ open: true, group })
            }
            onDeleteGroup={handleDeleteGroup}
            onAutoLayoutGroup={handleAutoLayoutGroup}
            onMoveTableToGroup={handleMoveTableToGroup}
            onRemoveTableFromGroup={handleRemoveTableFromGroup}
            onReorderGroups={handleReorderGroups}
            onReorderTableInGroup={handleReorderTableInGroup}
            onSaveVersion={() => setSaveVersionOpen(true)}
            onRestoreVersion={handleRestoreVersion}
            onTogglePublishVersion={handleTogglePublishVersion}
          />
        )}

        {/* Center Viewport */}
        <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
          {viewMode === 'docs' ? (
            <DocsView
              schema={parsedSchema}
              detailLevel={docsDetailLevel}
              onChangeDetailLevel={setDocsDetailLevel}
              selectedDomains={effectiveSelectedDomains}
              onClearDomainFilter={() => setSelectedDomains([])}
              onSelectTable={(id) => {
                setSelectedTableId(id);
                setViewMode('split');
                setFocusRequest({ type: 'table', id, nonce: Date.now() });
              }}
            />
          ) : viewMode === 'split' && editorState === 'maximized' ? (
            <div className="flex-1 h-full min-w-0">
              <DbmlEditor
                value={activeWorkspace.dbml}
                onChange={handleDbmlChange}
                errors={parsedSchema.errors}
                scrollToLine={scrollToLine}
                enumNames={parsedSchema.enums.map((e) => e.name)}
                tables={parsedSchema.tables}
                isMaximized={true}
                onToggleMaximize={() => setEditorState('normal')}
                onMinimize={() => setEditorState('minimized')}
                modKey={modKey}
              />
            </div>
          ) : (
            <>
              {viewMode === 'split' && editorState === 'minimized' && (
                <div className="w-10 shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden md:flex flex-col items-center py-2.5 gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setEditorState('normal')}
                    title={`Restore DBML editor (${modKey}\\)`}
                    aria-label="Restore DBML editor"
                    className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorState('maximized')}
                    title={`Maximize DBML editor (${modKey}⇧E)`}
                    aria-label="Maximize DBML editor"
                    className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-4 h-px bg-slate-200 dark:bg-slate-800 my-0.5" />
                  <button
                    type="button"
                    onClick={() => setEditorState('normal')}
                    title={`Click to expand DBML editor (${modKey}\\)`}
                    className="flex-1 flex items-center justify-center text-[11px] font-mono font-medium tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 [writing-mode:vertical-rl] rotate-180"
                  >
                    schema.dbml
                  </button>
                  {parsedSchema.errors.length > 0 && (
                    <span
                      title={`${parsedSchema.errors.length} syntax issue(s)`}
                      className="text-[10px] font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums"
                    >
                      {parsedSchema.errors.length}
                    </span>
                  )}
                </div>
              )}

              {viewMode === 'split' && editorState === 'normal' && (
                <>
                  <div
                    style={{ width: editorWidth }}
                    className="shrink-0 h-full hidden md:block"
                  >
                    <DbmlEditor
                      value={activeWorkspace.dbml}
                      onChange={handleDbmlChange}
                      errors={parsedSchema.errors}
                      scrollToLine={scrollToLine}
                      enumNames={parsedSchema.enums.map((e) => e.name)}
                      tables={parsedSchema.tables}
                      isMaximized={false}
                      onToggleMaximize={() => setEditorState('maximized')}
                      onMinimize={() => setEditorState('minimized')}
                      modKey={modKey}
                    />
                  </div>
                  <div
                    onMouseDown={startSplitResize}
                    title="Drag to resize editor"
                    className="w-1.5 shrink-0 hidden md:block cursor-col-resize bg-transparent hover:bg-blue-500/40 transition-colors"
                  />
                </>
              )}

              <DiagramCanvas
                schema={parsedSchema}
                positions={activeWorkspace.tablePositions}
                onUpdatePositions={(next) =>
                  updateActiveWorkspace((ws) => ({
                    ...ws,
                    tablePositions: next,
                  }))
                }
                detailLevel={activeWorkspace.detailLevel}
                onChangeDetailLevel={handleDetailLevelChange}
                selectedDomains={effectiveSelectedDomains}
                onChangeSelectedDomains={handleChangeSelectedDomains}
                selectedTableId={selectedTableId}
                highlightedColumn={highlightedColumn}
                onSelectTable={(id) => {
                  setSelectedTableId(id);
                  if (!id || id !== highlightedColumn?.tableId) {
                    setHighlightedColumn(null);
                  }
                  if (id) {
                    const t = parsedSchema.tables.find((tb) => tb.id === id);
                    if (t?.line) setScrollToLine(t.line);
                  }
                }}
                onChangeTableHeaderColor={handleChangeTableHeaderColor}
                onAssignTableToGroup={(tId, target, source, keep) =>
                  handleMoveTableToGroup(tId, target, source, keep)
                }
                onEditGroup={(group) =>
                  setGroupModalState({ open: true, group })
                }
                onAutoLayoutGroup={handleAutoLayoutGroup}
                stickyNotes={activeWorkspace.stickyNotes}
                onAddStickyNote={(x, y) => handleAddStickyNote(x, y)}
                onUpdateStickyNote={handleUpdateStickyNote}
                onDeleteStickyNote={handleDeleteStickyNote}
                focusRequest={focusRequest}
                darkMode={darkMode}
              />
            </>
          )}
        </main>

        {/* Contextual Table Inspector */}
        {selectedTable &&
          viewMode !== 'docs' &&
          !(viewMode === 'split' && editorState === 'maximized') && (
            <InspectorDrawer
              table={selectedTable}
              schema={parsedSchema}
              onClose={() => setSelectedTableId(null)}
              onSelectTable={(id) => {
                setSelectedTableId(id);
                setFocusRequest({ type: 'table', id, nonce: Date.now() });
              }}
              onSetTableGroups={handleSetTableGroups}
              onChangeTableHeaderColor={handleChangeTableHeaderColor}
              onJumpToCode={(line) => {
                if (viewMode !== 'split') setViewMode('split');
                if (editorState === 'minimized') setEditorState('normal');
                if (line) setScrollToLine(line);
              }}
              onAddLinkedStickyNote={(tId) => {
                const pos = activeWorkspace.tablePositions[tId] || {
                  x: 200,
                  y: 200,
                };
                handleAddStickyNote(pos.x + 296, pos.y, `table:${tId}`);
                showToast(`Attached sticky note to ${tId}`);
              }}
            />
          )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Modals */}
      {groupModalState.open && (
        <TableGroupModal
          initialGroup={groupModalState.group}
          allTableIds={parsedSchema.tables.map((t) => t.id)}
          onClose={() => setGroupModalState({ open: false, group: null })}
          onSave={handleSaveGroupModal}
        />
      )}

      {saveVersionOpen && (
        <SaveVersionModal
          suggestedTag={suggestedVersionTag}
          onClose={() => setSaveVersionOpen(false)}
          onSave={handleSaveVersion}
        />
      )}

      {importExportOpen && (
        <ImportExportModal
          projectName={activeWorkspace.name}
          dbml={activeWorkspace.dbml}
          schema={parsedSchema}
          positions={activeWorkspace.tablePositions}
          detailLevel={activeWorkspace.detailLevel}
          stickyNotes={activeWorkspace.stickyNotes}
          darkMode={darkMode}
          onImportDbml={handleImportDbml}
          onClose={() => setImportExportOpen(false)}
        />
      )}

      {workspacesModalOpen && (
        <WorkspacesModal
          workspaces={workspaces}
          activeId={activeWorkspace.id}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateBlank={handleCreateBlankWorkspace}
          onLoadSampleTelemetry={handleLoadSampleTelemetry}
          onDeleteWorkspace={handleDeleteWorkspace}
          onClose={() => setWorkspacesModalOpen(false)}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsModal
          modKey={modKey}
          onClose={() => setShortcutsOpen(false)}
        />
      )}
    </div>
  );
}
