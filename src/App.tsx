import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Maximize2, PanelLeftOpen } from 'lucide-react';
import { InspectorDrawer } from './components/InspectorDrawer';
import { Sidebar, SidebarTab } from './features/sidebar/Sidebar';
import { TopBar } from './components/TopBar';
import { useGlobalShortcuts } from './features/app/hooks/useGlobalShortcuts';
import {
  CommandItem,
  CommandTargetView,
} from './features/command/commandSearch';
import { DiagramCanvas } from './features/diagram/DiagramCanvas';
import type { DocsSection } from './features/docs/types';
import { DbmlEditor } from './features/editor/DbmlEditor';
import { useRemoteWorkspaceSync } from './features/workspace/hooks/useRemoteWorkspaceSync';
import { useSchemaActions } from './features/workspace/hooks/useSchemaActions';
import { useWorkspaceStore } from './features/workspace/hooks/useWorkspaceStore';
import { OfflineIndicator } from './features/pwa/OfflineIndicator';
import { TableGroupDef, UNGROUPED_DOMAIN_ID, ViewMode } from './types/schema';
import { MERGED_SCHEMA_VIEW_ID } from './utils/schemaModules';
import { lintSchemaQuality, SchemaLintIssue } from './utils/schemaLinter';

const CommandPaletteModal = lazy(() =>
  import('./features/command/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal,
  }))
);
const DocsView = lazy(() =>
  import('./features/docs/DocsView').then((m) => ({ default: m.DocsView }))
);
const GitHubModal = lazy(() =>
  import('./features/github/GitHubModal').then((m) => ({
    default: m.GitHubModal,
  }))
);
const OpenUrlModal = lazy(() =>
  import('./components/OpenUrlModal').then((m) => ({ default: m.OpenUrlModal }))
);
const TableGroupModal = lazy(() =>
  import('./features/workspace/modals/TableGroupModal').then((m) => ({
    default: m.TableGroupModal,
  }))
);
const SaveVersionModal = lazy(() =>
  import('./features/workspace/modals/SaveVersionModal').then((m) => ({
    default: m.SaveVersionModal,
  }))
);
const ImportExportModal = lazy(() =>
  import('./features/workspace/modals/ImportExportModal').then((m) => ({
    default: m.ImportExportModal,
  }))
);
const WorkspacesModal = lazy(() =>
  import('./features/workspace/modals/WorkspacesModal').then((m) => ({
    default: m.WorkspacesModal,
  }))
);
const ShortcutsModal = lazy(() =>
  import('./features/workspace/modals/ShortcutsModal').then((m) => ({
    default: m.ShortcutsModal,
  }))
);
const ShareModal = lazy(() =>
  import('./features/workspace/modals/ShareModal').then((m) => ({
    default: m.ShareModal,
  }))
);
const SharedViewerPage = lazy(() =>
  import('./features/share/SharedViewerPage').then((m) => ({
    default: m.SharedViewerPage,
  }))
);

function parseShareRouteFromLocation(): {
  token: string;
  versionTag: string | null;
} | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(
    /^\/share\/([a-zA-Z0-9_-]+)(?:\/([^/]+))?\/?$/
  );
  if (!match) return null;
  return {
    token: decodeURIComponent(match[1]),
    versionTag: match[2] ? decodeURIComponent(match[2]) : null,
  };
}

export default function App() {
  // Layout & navigation UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('domains');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [docsNavOpen, setDocsNavOpen] = useState(true);
  const [editorWidth, setEditorWidth] = useState(460);
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

  const [docsSectionRequest, setDocsSectionRequest] = useState<{
    section: DocsSection;
    nonce: number;
  } | null>(null);

  // Modal & share route state
  const [shareRoute, setShareRoute] = useState<{
    token: string;
    versionTag: string | null;
  } | null>(() => parseShareRouteFromLocation());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [groupModalState, setGroupModalState] = useState<{
    open: boolean;
    group: TableGroupDef | null;
  }>({ open: false, group: null });
  const [saveVersionOpen, setSaveVersionOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [workspacesModalOpen, setWorkspacesModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [openUrlOpen, setOpenUrlOpen] = useState(false);
  const [githubModalOpen, setGithubModalOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setShareRoute(parseShareRouteFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  const setFocusFit = useCallback(() => {
    setFocusRequest({ type: 'fit', nonce: Date.now() });
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedTableId(null);
    setSelectedDomains([]);
  }, []);

  const closeGroupModal = useCallback(() => {
    setGroupModalState({ open: false, group: null });
  }, []);

  const {
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
  } = useWorkspaceStore({
    onInitViewMode: setViewMode,
    onInitSidebarOpen: setSidebarOpen,
    onFocusFit: setFocusFit,
    onResetSelection: resetSelection,
    showToast,
  });

  useGlobalShortcuts({
    viewMode,
    setViewMode,
    setSidebarOpen,
    setDocsNavOpen,
    setEditorState,
    shortcutsOpen,
    setShortcutsOpen,
    openUrlOpen,
    setOpenUrlOpen,
    githubModalOpen,
    setGithubModalOpen,
    groupModalOpen: groupModalState.open,
    closeGroupModal,
    saveVersionOpen,
    setSaveVersionOpen,
    importExportOpen,
    setImportExportOpen,
    workspacesModalOpen,
    setWorkspacesModalOpen,
    shareModalOpen,
    setShareModalOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
  });

  const schemaActions = useSchemaActions({
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
  });

  const remoteSync = useRemoteWorkspaceSync({
    activeWorkspace,
    updateActiveWorkspace,
    addAndSelectWorkspace,
    setFocusFit,
    setEditorWidth,
    setWorkspacesModalOpen,
    showToast,
  });

  const { parsedSchema, isModular, activeSchemaFilePath } = schemaActions;
  const lintResult = useMemo(
    () => lintSchemaQuality(parsedSchema),
    [parsedSchema]
  );

  const handleJumpToLintIssue = useCallback(
    (issue: SchemaLintIssue) => {
      if (issue.line) {
        schemaActions.jumpToMergedLine(issue.line);
      }
      if (issue.tableId) {
        setSelectedTableId(issue.tableId);
        if (issue.columnName) {
          setHighlightedColumn({
            tableId: issue.tableId,
            columnName: issue.columnName,
          });
        } else {
          setHighlightedColumn(null);
        }
        setFocusRequest({ type: 'table', id: issue.tableId, nonce: Date.now() });
      }
    },
    [schemaActions]
  );

  const effectiveSelectedDomains = useMemo(() => {
    if (selectedDomains.length === 0) return [];
    const existing = new Set(parsedSchema.tableGroups.map((g) => g.name));
    const groupedTableIds = new Set<string>();
    for (const g of parsedSchema.tableGroups) {
      for (const t of g.tables) groupedTableIds.add(t);
    }
    if (parsedSchema.tables.some((t) => !groupedTableIds.has(t.id))) {
      existing.add(UNGROUPED_DOMAIN_ID);
    }
    return selectedDomains.filter((d) => existing.has(d));
  }, [selectedDomains, parsedSchema.tableGroups, parsedSchema.tables]);

  const startSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const origWidth = editorWidth;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(
        900,
        Math.max(280, origWidth + (ev.clientX - startX))
      );
      setEditorWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (shareRoute) {
    return (
      <Suspense
        fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
            Loading shared SchemaForge view...
          </div>
        }
      >
        <SharedViewerPage
          token={shareRoute.token}
          initialVersionTag={shareRoute.versionTag}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onForkToStudio={() => {
            window.history.pushState(null, '', '/');
            setShareRoute(null);
            window.location.reload();
          }}
        />
      </Suspense>
    );
  }

  if (loading || !activeWorkspace) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Loading SchemaForge workspace...
      </div>
    );
  }

  const selectedTable =
    parsedSchema.tables.find((t) => t.id === selectedTableId) || null;

  const handleChangeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'split') {
      setSidebarOpen(false);
      if (editorState !== 'normal') {
        setEditorState('normal');
      }
    } else if (mode === 'diagram') {
      setSidebarOpen(true);
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

  const handleExecuteCommand = (
    item: CommandItem,
    target: CommandTargetView = 'auto'
  ) => {
    if (item.kind === 'action' && item.actionId) {
      switch (item.actionId) {
        case 'view-split':
          handleChangeViewMode('split');
          break;
        case 'view-diagram':
          handleChangeViewMode('diagram');
          break;
        case 'view-docs':
          handleChangeViewMode('docs');
          break;
        case 'auto-layout':
          if (viewMode === 'docs') setViewMode('split');
          schemaActions.handleAutoLayout();
          break;
        case 'toggle-theme':
          setDarkMode((d) => !d);
          break;
        case 'import-export':
          setImportExportOpen(true);
          break;
        case 'save-version':
          setSaveVersionOpen(true);
          break;
        case 'github':
          setGithubModalOpen(true);
          break;
        case 'shortcuts':
          setShortcutsOpen(true);
          break;
      }
      return;
    }

    if (item.kind === 'file' || target === 'editor') {
      if (viewMode !== 'split') setViewMode('split');
      if (editorState === 'minimized') setEditorState('normal');
      if (item.filePath) {
        schemaActions.handleSelectSchemaFile(item.filePath);
        showToast(`Opened ${item.title}`);
        return;
      }
      if (item.line) {
        schemaActions.jumpToMergedLine(item.line);
        showToast(`Jumped to ${item.title} (Ln ${item.line})`);
      }
      return;
    }

    if (
      (target === 'docs' || (target === 'auto' && viewMode === 'docs')) &&
      item.docsSection
    ) {
      setViewMode('docs');
      setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
      showToast(`Opened ${item.title} in Docs`);
      return;
    }

    if (item.kind === 'partial') {
      if (viewMode === 'split' && item.line) {
        if (editorState === 'minimized') setEditorState('normal');
        schemaActions.jumpToMergedLine(item.line);
        showToast(`Jumped to ${item.title}`);
      } else if (item.docsSection) {
        setViewMode('docs');
        setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
        showToast(`Opened ${item.title} in Docs`);
      }
      return;
    }

    if (item.kind === 'note' && !item.tableId && !item.groupName) {
      if (item.docsSection && (viewMode === 'docs' || !item.line)) {
        setViewMode('docs');
        setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
        showToast(`Opened note "${item.title}"`);
      } else if (item.line) {
        if (viewMode === 'diagram') setViewMode('split');
        if (editorState === 'minimized') setEditorState('normal');
        schemaActions.jumpToMergedLine(item.line);
        showToast(`Jumped to note "${item.title}"`);
      }
      return;
    }

    if (item.kind === 'group' && item.groupName) {
      setHighlightedColumn(null);
      setSelectedTableId(null);
      if (viewMode === 'docs') setViewMode('split');
      if (editorState === 'maximized') setEditorState('normal');
      setSelectedDomains([item.groupName]);
      if (item.line) schemaActions.jumpToMergedLine(item.line);
      setFocusRequest({ type: 'group', id: item.groupName, nonce: Date.now() });
      showToast(`Showing domain "${item.groupName}"`);
      return;
    }

    if (item.tableId) {
      if (viewMode === 'docs') setViewMode('split');
      if (editorState === 'maximized') setEditorState('normal');
      if (
        effectiveSelectedDomains.length > 0 &&
        !item.domains.some((d) => effectiveSelectedDomains.includes(d))
      ) {
        setSelectedDomains([]);
      }
      setSelectedTableId(item.tableId);

      if (item.kind === 'column' && item.columnName) {
        setHighlightedColumn({
          tableId: item.tableId,
          columnName: item.columnName,
        });
        if (
          activeWorkspace.detailLevel === 'names' ||
          (activeWorkspace.detailLevel === 'keys' && !item.isPk)
        ) {
          schemaActions.handleDetailLevelChange('columns');
        }
        showToast(`Highlighted ${item.tableId}.${item.columnName}`);
      } else {
        setHighlightedColumn(null);
        showToast(`Focused table ${item.tableId}`);
      }

      if (item.line) schemaActions.jumpToMergedLine(item.line);
      setFocusRequest({ type: 'table', id: item.tableId, nonce: Date.now() });
    }
  };

  const editorElementProps = {
    value: schemaActions.editorValue,
    onChange: schemaActions.handleDbmlChange,
    errors: schemaActions.editorErrors,
    lintResult,
    onJumpToLintIssue: handleJumpToLintIssue,
    scrollToLine,
    enumNames: parsedSchema.enums.map((e) => e.name),
    partialNames: parsedSchema.tablePartials.map((p) => p.name),
    tables: parsedSchema.tables,
    modKey,
    schemaFiles: activeWorkspace.schemaFiles,
    activeFilePath: activeSchemaFilePath,
    schemaFolder: schemaActions.activeSchemaFolder,
    allErrorsByFile: schemaActions.moduleErrors?.byFile,
    onSelectFile: schemaActions.handleSelectSchemaFile,
    onCreateFile: schemaActions.handleCreateSchemaFile,
    onRenameFile: schemaActions.handleRenameSchemaFile,
    onDeleteFile: schemaActions.handleDeleteSchemaFile,
    onEnableModularMode: schemaActions.handleEnableModularMode,
    onFlattenToSingleFile: schemaActions.handleFlattenToSingleFile,
    onJumpToMergedLine: schemaActions.jumpToMergedLine,
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <TopBar
        projectName={activeWorkspace.name}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => {
          if (viewMode !== 'docs') {
            setSidebarOpen((o) => !o);
          }
        }}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenWorkspaces={() => setWorkspacesModalOpen(true)}
        onOpenUrlModal={() => setOpenUrlOpen(true)}
        onOpenGithubModal={() => setGithubModalOpen(true)}
        onOpenImportExport={() => setImportExportOpen(true)}
        onOpenSaveVersion={() => setSaveVersionOpen(true)}
        onOpenShareModal={() => setShareModalOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        githubLink={activeWorkspace.githubLink}
        githubRepoLink={activeWorkspace.githubRepoLink}
        hasGithubChanges={schemaActions.hasGithubChanges}
        isCloudWorkspace={activeWorkspace.syncOrigin === 'cloud'}
        cloudSyncStatus={cloudSyncStatus}
        modKey={modKey}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        errorCount={parsedSchema.errors.length}
      />

      {/* Compact responsive toolbar for narrow viewports */}
      <div className="flex lg:hidden items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs overflow-x-auto">
        <div className="flex items-center gap-1">
          {(['split', 'diagram', 'docs'] as const satisfies readonly ViewMode[]).map((m) => (
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
              if (t?.line) schemaActions.jumpToMergedLine(t.line);
              setFocusRequest({ type: 'table', id, nonce: Date.now() });
            }}
            onFocusGroupOnCanvas={(g) => {
              setFocusRequest({ type: 'group', id: g, nonce: Date.now() });
            }}
            onCreateGroup={() =>
              setGroupModalState({ open: true, group: null })
            }
            onEditGroup={(group) => setGroupModalState({ open: true, group })}
            onDeleteGroup={schemaActions.handleDeleteGroup}
            onAutoLayoutGroup={schemaActions.handleAutoLayoutGroup}
            onMoveTableToGroup={schemaActions.handleMoveTableToGroup}
            onRemoveTableFromGroup={schemaActions.handleRemoveTableFromGroup}
            onReorderGroups={schemaActions.handleReorderGroups}
            onReorderTableInGroup={schemaActions.handleReorderTableInGroup}
            onSaveVersion={() => setSaveVersionOpen(true)}
            onRestoreVersion={schemaActions.handleRestoreVersion}
            onTogglePublishVersion={schemaActions.handleTogglePublishVersion}
          />
        )}

        {/* Center Viewport */}
        <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
          {viewMode === 'docs' ? (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                  Loading documentation...
                </div>
              }
            >
              <DocsView
                schema={parsedSchema}
                stickyNotes={activeWorkspace.stickyNotes}
                navOpen={docsNavOpen}
                onToggleNav={() => setDocsNavOpen((o) => !o)}
                modKey={modKey}
                sectionRequest={docsSectionRequest}
                onSelectTable={(id) => {
                  setSelectedTableId(id);
                  setViewMode('split');
                  setFocusRequest({ type: 'table', id, nonce: Date.now() });
                }}
              />
            </Suspense>
          ) : viewMode === 'split' && editorState === 'maximized' ? (
            <div className="flex-1 h-full min-w-0">
              <DbmlEditor
                {...editorElementProps}
                isMaximized={true}
                onToggleMaximize={() => setEditorState('normal')}
                onMinimize={() => setEditorState('minimized')}
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
                    {isModular
                      ? activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID
                        ? 'schema.dbml (merged)'
                        : activeSchemaFilePath
                      : 'schema.dbml'}
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
                      {...editorElementProps}
                      isMaximized={false}
                      onToggleMaximize={() => setEditorState('maximized')}
                      onMinimize={() => setEditorState('minimized')}
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
                onChangeDetailLevel={schemaActions.handleDetailLevelChange}
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
                    if (t?.line) schemaActions.jumpToMergedLine(t.line);
                  }
                }}
                onChangeTableHeaderColor={
                  schemaActions.handleChangeTableHeaderColor
                }
                onAssignTableToGroup={(tId, target, source, keep) =>
                  schemaActions.handleMoveTableToGroup(tId, target, source, keep)
                }
                onEditGroup={(group) =>
                  setGroupModalState({ open: true, group })
                }
                onAutoLayout={schemaActions.handleAutoLayout}
                onAutoLayoutGroup={schemaActions.handleAutoLayoutGroup}
                stickyNotes={activeWorkspace.stickyNotes}
                onAddStickyNote={(x, y) =>
                  schemaActions.handleAddStickyNote(x, y)
                }
                onUpdateStickyNote={schemaActions.handleUpdateStickyNote}
                onDeleteStickyNote={schemaActions.handleDeleteStickyNote}
                onCreateRef={schemaActions.handleCreateRef}
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
              onSetTableGroups={schemaActions.handleSetTableGroups}
              onChangeTableHeaderColor={
                schemaActions.handleChangeTableHeaderColor
              }
              onJumpToCode={(line) => {
                if (viewMode !== 'split') setViewMode('split');
                if (editorState === 'minimized') setEditorState('normal');
                if (line) schemaActions.jumpToMergedLine(line);
              }}
              onAddLinkedStickyNote={(tId) => {
                const pos = activeWorkspace.tablePositions[tId] || {
                  x: 200,
                  y: 200,
                };
                schemaActions.handleAddStickyNote(
                  pos.x + 296,
                  pos.y,
                  `table:${tId}`
                );
                showToast(`Attached sticky note to ${tId}`);
              }}
            />
          )}
      </div>

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Lazy-Loaded Modals */}
      <Suspense fallback={null}>
        {groupModalState.open && (
          <TableGroupModal
            initialGroup={groupModalState.group}
            allTableIds={parsedSchema.tables.map((t) => t.id)}
            onClose={closeGroupModal}
            onSave={schemaActions.handleSaveGroupModal}
          />
        )}

        {saveVersionOpen && (
          <SaveVersionModal
            suggestedTag={schemaActions.suggestedVersionTag}
            onClose={() => setSaveVersionOpen(false)}
            onSave={schemaActions.handleSaveVersion}
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
            selectedDomains={effectiveSelectedDomains}
            darkMode={darkMode}
            onImportDbml={remoteSync.handleImportDbml}
            onImportUrlResult={(res) =>
              remoteSync.handleLoadUrlResult(res, false)
            }
            onClose={() => setImportExportOpen(false)}
          />
        )}

        {openUrlOpen && (
          <OpenUrlModal
            currentUrlLink={activeWorkspace.urlLink}
            onLoadUrlResult={remoteSync.handleLoadUrlResult}
            onClose={() => setOpenUrlOpen(false)}
          />
        )}

        {githubModalOpen && (
          <GitHubModal
            workspace={activeWorkspace}
            onLoadGithubFile={remoteSync.handleLoadGithubFile}
            onSyncedGithubFile={remoteSync.handleSyncedGithubFile}
            onLoadGithubFolder={remoteSync.handleLoadGithubFolder}
            onSyncedGithubFolder={remoteSync.handleSyncedGithubFolder}
            onClose={() => setGithubModalOpen(false)}
          />
        )}

        {workspacesModalOpen && (
          <WorkspacesModal
            workspaces={workspaces}
            activeId={activeWorkspace.id}
            cloudAuth={cloudAuth}
            onSelectWorkspace={selectWorkspace}
            onCreateBlank={remoteSync.handleCreateBlankWorkspace}
            onLoadSampleTelemetry={remoteSync.handleLoadSampleTelemetry}
            onCreateModularProject={remoteSync.handleCreateModularWorkspace}
            onDeleteWorkspace={removeWorkspace}
            onConnectCloud={connectCloudAccount}
            onLogoutCloud={logoutCloudAccount}
            onSyncWorkspace={(id) => syncWorkspaceToCloud(id)}
            onSyncAllLocal={syncAllLocalWorkspacesToCloud}
            onClose={() => setWorkspacesModalOpen(false)}
          />
        )}

        {shareModalOpen && (
          <ShareModal
            workspace={activeWorkspace}
            cloudAuth={cloudAuth}
            onConnectCloud={async () => {
              await connectCloudAccount();
              await refreshCloudSync();
            }}
            onSyncWorkspaceToCloud={() => syncWorkspaceToCloud(activeWorkspace.id)}
            onOpenPreviewShare={(token, pinnedVersionTag) => {
              const path = pinnedVersionTag
                ? `/share/${encodeURIComponent(token)}/${encodeURIComponent(
                    pinnedVersionTag
                  )}`
                : `/share/${encodeURIComponent(token)}`;
              setShareModalOpen(false);
              window.history.pushState(null, '', path);
              setShareRoute({ token, versionTag: pinnedVersionTag || null });
            }}
            onClose={() => setShareModalOpen(false)}
            onShowToast={showToast}
          />
        )}

        {commandPaletteOpen && (
          <CommandPaletteModal
            open={commandPaletteOpen}
            schema={parsedSchema}
            stickyNotes={activeWorkspace.stickyNotes}
            schemaFiles={activeWorkspace.schemaFiles}
            schemaFolder={schemaActions.activeSchemaFolder}
            viewMode={viewMode}
            modKey={modKey}
            onClose={() => setCommandPaletteOpen(false)}
            onSelectCommand={handleExecuteCommand}
          />
        )}

        {shortcutsOpen && (
          <ShortcutsModal
            modKey={modKey}
            onClose={() => setShortcutsOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
