import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { AppModals } from './components/AppModals';
import {
  AsyncEmptyState,
  AsyncErrorState,
  AsyncLoadingState,
} from './components/AsyncStateView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InspectorDrawer } from './components/InspectorDrawer';
import { TopBar } from './components/TopBar';
import { WorkspaceViewport } from './components/WorkspaceViewport';
import { useGlobalShortcuts } from './features/app/hooks/useGlobalShortcuts';
import type { DocsSection } from './features/docs/types';
import { OfflineIndicator } from './features/pwa/OfflineIndicator';
import { Sidebar, SidebarTab } from './features/sidebar/Sidebar';
import { useRemoteWorkspaceSync } from './features/workspace/hooks/useRemoteWorkspaceSync';
import { useSchemaActions } from './features/workspace/hooks/useSchemaActions';
import { useWorkspaceStore } from './features/workspace/hooks/useWorkspaceStore';
import { useModKey } from './hooks/useModKey';
import { useShareRoute } from './hooks/useShareRoute';
import { useSplitResize } from './hooks/useSplitResize';
import { useToast } from './hooks/useToast';
import { useWorkspaceCommandHandler } from './hooks/useWorkspaceCommandHandler';
import {
  TableGroupDef,
  TablePosition,
  UNGROUPED_DOMAIN_ID,
  ViewMode,
} from './types/schema';
import { lintSchemaQuality, SchemaLintIssue } from './utils/schemaLinter';

const SharedViewerPage = lazy(() =>
  import('./features/share/SharedViewerPage').then((m) => ({
    default: m.SharedViewerPage,
  }))
);

export default function App() {
  const modKey = useModKey();
  const { toast, showToast } = useToast();
  const { shareRoute, openSharePreview, exitSharePreview } = useShareRoute();
  const { editorWidth, setEditorWidth, startSplitResize } = useSplitResize();

  // Layout & navigation UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('domains');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [docsNavOpen, setDocsNavOpen] = useState(true);
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

  // Modal state
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

  const setFocusFit = useCallback(() => {
    setFocusRequest({ type: 'fit', nonce: Date.now() });
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedTableId(null);
    setSelectedDomains([]);
    setHighlightedColumn(null);
  }, []);

  const closeGroupModal = useCallback(() => {
    setGroupModalState({ open: false, group: null });
  }, []);

  const {
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

  const enumNames = useMemo(
    () => parsedSchema.enums.map((e) => e.name),
    [parsedSchema.enums]
  );

  const partialNames = useMemo(
    () => parsedSchema.tablePartials.map((p) => p.name),
    [parsedSchema.tablePartials]
  );

  const allTableIds = useMemo(
    () => parsedSchema.tables.map((t) => t.id),
    [parsedSchema.tables]
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

  const selectedTable = useMemo(
    () => parsedSchema.tables.find((t) => t.id === selectedTableId) || null,
    [parsedSchema.tables, selectedTableId]
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

  const handleChangeViewMode = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (mode === 'split') {
        setSidebarOpen(false);
        setEditorState((prev) => (prev !== 'normal' ? 'normal' : prev));
      } else if (mode === 'diagram') {
        setSidebarOpen(true);
      }
    },
    []
  );

  const handleChangeSelectedDomains = useCallback((domains: string[]) => {
    setSelectedDomains(domains);
    setFocusRequest({
      type: domains.length === 1 ? 'group' : 'fit',
      id: domains.length === 1 ? domains[0] : undefined,
      nonce: Date.now(),
    });
  }, []);

  const handleExecuteCommand = useWorkspaceCommandHandler({
    viewMode,
    editorState,
    effectiveSelectedDomains,
    activeDetailLevel: activeWorkspace?.detailLevel ?? 'full',
    onChangeViewMode: handleChangeViewMode,
    setViewMode,
    setEditorState,
    setDarkMode,
    setSelectedDomains,
    setSelectedTableId,
    setHighlightedColumn,
    setFocusRequest,
    setDocsSectionRequest,
    setImportExportOpen,
    setSaveVersionOpen,
    setGithubModalOpen,
    setShortcutsOpen,
    onAutoLayout: schemaActions.handleAutoLayout,
    onSelectSchemaFile: schemaActions.handleSelectSchemaFile,
    onJumpToMergedLine: schemaActions.jumpToMergedLine,
    onChangeDetailLevel: schemaActions.handleDetailLevelChange,
    showToast,
  });

  const handleUpdatePositions = useCallback(
    (next: Record<string, TablePosition>) => {
      updateActiveWorkspace((ws) => ({
        ...ws,
        tablePositions: next,
      }));
    },
    [updateActiveWorkspace]
  );

  const handleSelectTableOnCanvas = useCallback(
    (id: string | null) => {
      setSelectedTableId(id);
      if (!id || id !== highlightedColumn?.tableId) {
        setHighlightedColumn(null);
      }
      if (id) {
        const t = parsedSchema.tables.find((tb) => tb.id === id);
        if (t?.line) schemaActions.jumpToMergedLine(t.line);
      }
    },
    [highlightedColumn?.tableId, parsedSchema.tables, schemaActions]
  );

  const editorBaseProps = useMemo(
    () => ({
      value: schemaActions.editorValue,
      onChange: schemaActions.handleDbmlChange,
      errors: schemaActions.editorErrors,
      lintResult,
      onJumpToLintIssue: handleJumpToLintIssue,
      scrollToLine,
      enumNames,
      partialNames,
      tables: parsedSchema.tables,
      modKey,
      schemaFiles: activeWorkspace?.schemaFiles,
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
    }),
    [
      schemaActions,
      lintResult,
      handleJumpToLintIssue,
      scrollToLine,
      enumNames,
      partialNames,
      parsedSchema.tables,
      modKey,
      activeWorkspace?.schemaFiles,
      activeSchemaFilePath,
    ]
  );

  if (shareRoute) {
    return (
      <ErrorBoundary
        fullScreen
        title="Unable to render shared schema view"
        resetKeys={[shareRoute.token, shareRoute.versionTag]}
        onReset={exitSharePreview}
      >
        <Suspense
          fallback={
            <AsyncLoadingState
              message="Loading shared SchemaForge view..."
              className="h-screen w-screen bg-slate-50 dark:bg-slate-950 text-sm"
            />
          }
        >
          <SharedViewerPage
            token={shareRoute.token}
            initialVersionTag={shareRoute.versionTag}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((d) => !d)}
            onForkToStudio={exitSharePreview}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <AsyncLoadingState
        message="Loading SchemaForge workspace..."
        className="h-screen w-screen bg-slate-50 dark:bg-slate-950 text-sm"
      />
    );
  }

  if (loadError && !activeWorkspace) {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full">
          <AsyncErrorState message={loadError} onRetry={retryBootstrap} />
        </div>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="h-screen w-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full">
          <AsyncEmptyState
            title="No workspace loaded"
            description="Initialize a workspace to start designing schemas."
            action={
              <button
                type="button"
                onClick={retryBootstrap}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Reload workspaces
              </button>
            }
          />
        </div>
      </div>
    );
  }

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
          {(['split', 'diagram', 'docs'] as const satisfies readonly ViewMode[]).map(
            (m) => (
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
            )
          )}
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {sidebarOpen && viewMode !== 'docs' && (
          <ErrorBoundary
            compact
            title="Sidebar failed to render"
            resetKeys={[activeWorkspace.id, sidebarTab]}
            onReset={() => setSidebarTab('domains')}
          >
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
          </ErrorBoundary>
        )}

        <WorkspaceViewport
          workspace={activeWorkspace}
          parsedSchema={parsedSchema}
          viewMode={viewMode}
          editorState={editorState}
          editorWidth={editorWidth}
          startSplitResize={startSplitResize}
          onChangeEditorState={setEditorState}
          editorBaseProps={editorBaseProps}
          isModular={isModular}
          activeSchemaFilePath={activeSchemaFilePath}
          modKey={modKey}
          darkMode={darkMode}
          docsNavOpen={docsNavOpen}
          onToggleDocsNav={() => setDocsNavOpen((o) => !o)}
          docsSectionRequest={docsSectionRequest}
          onSelectTableFromDocs={(id) => {
            setSelectedTableId(id);
            setViewMode('split');
            setFocusRequest({ type: 'table', id, nonce: Date.now() });
          }}
          effectiveSelectedDomains={effectiveSelectedDomains}
          selectedTableId={selectedTableId}
          highlightedColumn={highlightedColumn}
          focusRequest={focusRequest}
          onUpdatePositions={handleUpdatePositions}
          onChangeDetailLevel={schemaActions.handleDetailLevelChange}
          onChangeSelectedDomains={handleChangeSelectedDomains}
          onSelectTableOnCanvas={handleSelectTableOnCanvas}
          onChangeTableHeaderColor={schemaActions.handleChangeTableHeaderColor}
          onAssignTableToGroup={(tId, target, source, keep) =>
            schemaActions.handleMoveTableToGroup(tId, target, source, keep)
          }
          onEditGroup={(group) => setGroupModalState({ open: true, group })}
          onAutoLayout={schemaActions.handleAutoLayout}
          onAutoLayoutGroup={schemaActions.handleAutoLayoutGroup}
          onAddStickyNote={(x, y) => schemaActions.handleAddStickyNote(x, y)}
          onUpdateStickyNote={schemaActions.handleUpdateStickyNote}
          onDeleteStickyNote={schemaActions.handleDeleteStickyNote}
          onCreateRef={schemaActions.handleCreateRef}
        />

        {selectedTable &&
          viewMode !== 'docs' &&
          !(viewMode === 'split' && editorState === 'maximized') && (
            <ErrorBoundary
              compact
              title="Inspector failed to render"
              resetKeys={[selectedTable.id]}
              onReset={() => setSelectedTableId(null)}
            >
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
            </ErrorBoundary>
          )}
      </div>

      <OfflineIndicator />

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      <AppModals
        activeWorkspace={activeWorkspace}
        workspaces={workspaces}
        parsedSchema={parsedSchema}
        allTableIds={allTableIds}
        effectiveSelectedDomains={effectiveSelectedDomains}
        activeSchemaFolder={schemaActions.activeSchemaFolder}
        suggestedVersionTag={schemaActions.suggestedVersionTag}
        cloudAuth={cloudAuth}
        viewMode={viewMode}
        darkMode={darkMode}
        modKey={modKey}
        groupModalState={groupModalState}
        saveVersionOpen={saveVersionOpen}
        importExportOpen={importExportOpen}
        workspacesModalOpen={workspacesModalOpen}
        shareModalOpen={shareModalOpen}
        shortcutsOpen={shortcutsOpen}
        openUrlOpen={openUrlOpen}
        githubModalOpen={githubModalOpen}
        commandPaletteOpen={commandPaletteOpen}
        onCloseGroupModal={closeGroupModal}
        onSaveGroupModal={schemaActions.handleSaveGroupModal}
        onCloseSaveVersion={() => setSaveVersionOpen(false)}
        onSaveVersion={schemaActions.handleSaveVersion}
        onCloseImportExport={() => setImportExportOpen(false)}
        onImportDbml={remoteSync.handleImportDbml}
        onLoadUrlResult={remoteSync.handleLoadUrlResult}
        onCloseOpenUrl={() => setOpenUrlOpen(false)}
        onCloseGithubModal={() => setGithubModalOpen(false)}
        onLoadGithubFile={remoteSync.handleLoadGithubFile}
        onSyncedGithubFile={remoteSync.handleSyncedGithubFile}
        onLoadGithubFolder={remoteSync.handleLoadGithubFolder}
        onSyncedGithubFolder={remoteSync.handleSyncedGithubFolder}
        onCloseWorkspacesModal={() => setWorkspacesModalOpen(false)}
        onSelectWorkspace={selectWorkspace}
        onCreateBlankWorkspace={remoteSync.handleCreateBlankWorkspace}
        onLoadSampleTelemetry={remoteSync.handleLoadSampleTelemetry}
        onCreateModularWorkspace={remoteSync.handleCreateModularWorkspace}
        onDeleteWorkspace={removeWorkspace}
        onConnectCloudAccount={connectCloudAccount}
        onLogoutCloudAccount={logoutCloudAccount}
        onSyncWorkspaceToCloud={syncWorkspaceToCloud}
        onSyncAllLocalWorkspacesToCloud={syncAllLocalWorkspacesToCloud}
        onRefreshCloudSync={refreshCloudSync}
        onCloseShareModal={() => setShareModalOpen(false)}
        onOpenPreviewShare={openSharePreview}
        onCloseCommandPalette={() => setCommandPaletteOpen(false)}
        onSelectCommand={handleExecuteCommand}
        onCloseShortcuts={() => setShortcutsOpen(false)}
        onShowToast={showToast}
      />
    </div>
  );
}
