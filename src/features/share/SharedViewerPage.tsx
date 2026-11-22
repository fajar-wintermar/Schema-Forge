import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  ChevronDown,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Lock,
  Moon,
  Search,
  Sun,
} from 'lucide-react';
import { BrandLogo } from '../../components/BrandLogo';
import { InspectorDrawer } from '../../components/InspectorDrawer';
import {
  CommandItem,
  CommandTargetView,
} from '../command/commandSearch';
import { DiagramCanvas } from '../diagram/DiagramCanvas';
import type { DocsSection } from '../docs/types';
import {
  DetailLevel,
  ParsedSchema,
  SharedWorkspacePayload,
  StickyNote,
  TablePosition,
  ViewMode,
} from '../../types/schema';
import { autoLayoutSingleGroup, computeAutoLayout } from '../../utils/autoLayout';
import { fetchPublicShare } from '../../utils/cloudService';
import {
  buildDiagramSvg,
  downloadTextFile,
  exportDiagramAsPng,
} from '../../utils/importExport';

const CommandPaletteModal = lazy(() =>
  import('../command/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal,
  }))
);
const DocsView = lazy(() =>
  import('../docs/DocsView').then((m) => ({ default: m.DocsView }))
);

const EMPTY_PARSED_SCHEMA: ParsedSchema = {
  project: {},
  tables: [],
  enums: [],
  refs: [],
  tableGroups: [],
  tablePartials: [],
  notes: [],
  errors: [],
};

interface SharedViewerPageProps {
  token: string;
  initialVersionTag?: string | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onForkToStudio: () => void;
}

export const SharedViewerPage: React.FC<SharedViewerPageProps> = ({
  token,
  initialVersionTag = null,
  darkMode,
  onToggleDarkMode,
  onForkToStudio,
}) => {
  const [payload, setPayload] = useState<SharedWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersionTag, setSelectedVersionTag] = useState<string | null>(
    initialVersionTag || null
  );

  const [viewMode, setViewMode] = useState<'docs' | 'diagram'>('docs');
  const [docsNavOpen, setDocsNavOpen] = useState(true);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [highlightedColumn, setHighlightedColumn] = useState<{
    tableId: string;
    columnName: string;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    type: 'table' | 'group' | 'fit';
    id?: string;
    nonce: number;
  } | null>(null);
  const [docsSectionRequest, setDocsSectionRequest] = useState<{
    section: DocsSection;
    nonce: number;
  } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Ephemeral view-only layout state (never persisted to server or IndexedDB)
  const [viewPositions, setViewPositions] = useState<Record<string, TablePosition>>({});
  const [viewStickyNotes, setViewStickyNotes] = useState<StickyNote[]>([]);
  const [viewDetailLevel, setViewDetailLevel] = useState<DetailLevel>('full');
  const [hasCustomLayout, setHasCustomLayout] = useState(false);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const modKey = useMemo(() => {
    if (typeof navigator === 'undefined') return '⌘';
    const platform = navigator.platform || navigator.userAgent || '';
    return /Mac|iPod|iPhone|iPad/i.test(platform) ? '⌘' : 'Ctrl+';
  }, []);

  const resetEphemeralLayout = useCallback((nextPayload: SharedWorkspacePayload) => {
    const schema = nextPayload.content.parsedSchema || EMPTY_PARSED_SCHEMA;
    const detail = nextPayload.content.detailLevel || 'full';
    const basePositions =
      Object.keys(nextPayload.content.tablePositions || {}).length > 0
        ? nextPayload.content.tablePositions
        : computeAutoLayout(schema, detail);
    setViewPositions(basePositions);
    setViewStickyNotes(nextPayload.content.stickyNotes || []);
    setViewDetailLevel(detail);
    setHasCustomLayout(false);
  }, []);

  const loadShare = useCallback(
    async (versionTag: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchPublicShare(token, versionTag);
        setPayload(res);
        setViewMode(res.share.defaultView);
        resetEphemeralLayout(res);
        setFocusRequest({ type: 'fit', nonce: Date.now() });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to load shared schema.'
        );
      } finally {
        setLoading(false);
      }
    },
    [token, resetEphemeralLayout]
  );

  useEffect(() => {
    void loadShare(selectedVersionTag);
  }, [loadShare, selectedVersionTag]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
      } else if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [commandPaletteOpen]);

  const parsedSchema = useMemo(
    () => payload?.content.parsedSchema || EMPTY_PARSED_SCHEMA,
    [payload]
  );

  const selectedTable =
    parsedSchema.tables.find((t) => t.id === selectedTableId) || null;

  const handleVersionChange = (nextTag: string) => {
    const resolvedTag = nextTag === 'live' ? null : nextTag;
    setSelectedVersionTag(resolvedTag);
    const nextUrl = resolvedTag
      ? `/share/${encodeURIComponent(token)}/${encodeURIComponent(resolvedTag)}`
      : `/share/${encodeURIComponent(token)}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const handleUpdateViewPositions = useCallback(
    (next: Record<string, TablePosition>) => {
      setViewPositions(next);
      setHasCustomLayout(true);
    },
    []
  );

  const handleMoveViewStickyNote = useCallback(
    (noteId: string, patch: Partial<StickyNote>) => {
      // View-only: allow repositioning sticky notes locally without altering text/colors
      if (typeof patch.x !== 'number' && typeof patch.y !== 'number') return;
      setViewStickyNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                x: typeof patch.x === 'number' ? patch.x : n.x,
                y: typeof patch.y === 'number' ? patch.y : n.y,
              }
            : n
        )
      );
      setHasCustomLayout(true);
    },
    []
  );

  const handleViewAutoLayout = useCallback(() => {
    setViewPositions(computeAutoLayout(parsedSchema, viewDetailLevel));
    setHasCustomLayout(true);
    setFocusRequest({ type: 'fit', nonce: Date.now() });
  }, [parsedSchema, viewDetailLevel]);

  const handleViewAutoLayoutGroup = useCallback(
    (groupName: string) => {
      setViewPositions((prev) =>
        autoLayoutSingleGroup(groupName, parsedSchema, prev, viewDetailLevel)
      );
      setHasCustomLayout(true);
    },
    [parsedSchema, viewDetailLevel]
  );

  const handleResetViewLayout = useCallback(() => {
    if (!payload) return;
    resetEphemeralLayout(payload);
    setFocusRequest({ type: 'fit', nonce: Date.now() });
  }, [payload, resetEphemeralLayout]);

  const safeExportBaseName = useMemo(() => {
    const rawName = payload?.share.workspaceName || 'schema-diagram';
    const versionSuffix = payload?.share.activeVersionTag
      ? `-${payload.share.activeVersionTag}`
      : '';
    return (
      `${rawName}${versionSuffix}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'schema-diagram'
    );
  }, [payload?.share.workspaceName, payload?.share.activeVersionTag]);

  const handleExportSharedPng = useCallback(
    async (scale: number) => {
      if (!payload?.share.allowDiagramExport) return;
      setExportingPng(true);
      setExportMenuOpen(false);
      try {
        await exportDiagramAsPng({
          filename: `${safeExportBaseName}-${scale}x.png`,
          schema: parsedSchema,
          positions: viewPositions,
          detailLevel: viewDetailLevel,
          stickyNotes: viewStickyNotes,
          darkMode,
          title: payload.share.workspaceName,
          scale,
        });
        setExportFeedback(`Exported ${scale}x PNG`);
        setTimeout(() => setExportFeedback(null), 2200);
      } catch (err) {
        setExportFeedback(
          err instanceof Error ? err.message : 'Failed to export PNG'
        );
        setTimeout(() => setExportFeedback(null), 3000);
      } finally {
        setExportingPng(false);
      }
    },
    [
      payload,
      safeExportBaseName,
      parsedSchema,
      viewPositions,
      viewDetailLevel,
      viewStickyNotes,
      darkMode,
    ]
  );

  const handleExportSharedSvg = useCallback(() => {
    if (!payload?.share.allowDiagramExport) return;
    setExportMenuOpen(false);
    const { svg } = buildDiagramSvg({
      schema: parsedSchema,
      positions: viewPositions,
      detailLevel: viewDetailLevel,
      stickyNotes: viewStickyNotes,
      darkMode,
      title: payload.share.workspaceName,
    });
    downloadTextFile(
      `${safeExportBaseName}.svg`,
      svg,
      'image/svg+xml;charset=utf-8'
    );
    setExportFeedback('Exported SVG');
    setTimeout(() => setExportFeedback(null), 2200);
  }, [
    payload,
    parsedSchema,
    viewPositions,
    viewDetailLevel,
    viewStickyNotes,
    darkMode,
    safeExportBaseName,
  ]);

  const handleExecuteCommand = (
    item: CommandItem,
    target: CommandTargetView = 'auto'
  ) => {
    if (item.kind === 'action' && item.actionId) {
      if (item.actionId === 'view-diagram') setViewMode('diagram');
      else if (item.actionId === 'view-docs') setViewMode('docs');
      else if (item.actionId === 'toggle-theme') onToggleDarkMode();
      return;
    }

    if (
      (target === 'docs' || (target === 'auto' && viewMode === 'docs')) &&
      item.docsSection
    ) {
      setViewMode('docs');
      setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
      return;
    }

    if (item.kind === 'group' && item.groupName) {
      setViewMode('diagram');
      setSelectedTableId(null);
      setHighlightedColumn(null);
      setSelectedDomains([item.groupName]);
      setFocusRequest({ type: 'group', id: item.groupName, nonce: Date.now() });
      return;
    }

    if (item.tableId) {
      setViewMode('diagram');
      setSelectedTableId(item.tableId);
      if (item.kind === 'column' && item.columnName) {
        setHighlightedColumn({
          tableId: item.tableId,
          columnName: item.columnName,
        });
      } else {
        setHighlightedColumn(null);
      }
      setFocusRequest({ type: 'table', id: item.tableId, nonce: Date.now() });
      return;
    }

    if (item.docsSection) {
      setViewMode('docs');
      setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
    }
  };

  if (loading && !payload) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>Loading shared schema...</span>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <h1 className="text-base font-bold">Share Link Unavailable</h1>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {error || 'This shareable link could not be found or has been revoked.'}
          </p>
          <button
            type="button"
            onClick={onForkToStudio}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          >
            Open SchemaForge Studio
          </button>
        </div>
      </div>
    );
  }

  const effectiveViewMode: ViewMode = viewMode === 'docs' ? 'docs' : 'diagram';

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-3 select-none z-30">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            <BrandLogo className="w-7 h-7 shrink-0" />
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 hidden sm:inline">
              SchemaForge
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">
            /
          </span>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[200px]">
              {payload.share.workspaceName}
            </span>
            <span
              title="View-only share link — layout adjustments are temporary and DBML source cannot be copied"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0"
            >
              <Lock className="w-3 h-3 text-slate-400" />
              <span>View-Only</span>
            </span>

            {payload.share.pinnedVersionTag ? (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                {payload.share.pinnedVersionTag}
              </span>
            ) : payload.publishedVersions.length > 0 ? (
              <select
                value={selectedVersionTag || 'live'}
                onChange={(e) => handleVersionChange(e.target.value)}
                aria-label="Schema version"
                className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-200 shrink-0"
              >
                <option value="live">Latest Live</option>
                {payload.publishedVersions.map((v) => (
                  <option key={v.id} value={v.tag}>
                    {v.tag} — {v.title}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden md:flex flex-1 max-w-[260px] ml-2 items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Search tables, notes...</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono text-slate-400">
              {modKey}K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={() => setViewMode('docs')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'docs'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('diagram')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'diagram'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Diagram</span>
            </button>
          </div>

          {payload.share.allowDiagramExport && (
            <div className="relative">
              <button
                type="button"
                disabled={exportingPng}
                onClick={() => setExportMenuOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-60"
                title="Export diagram as PNG or SVG"
              >
                {exportingPng ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                )}
                <span className="hidden sm:inline">
                  {exportFeedback || (exportingPng ? 'Exporting...' : 'Export')}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {exportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-50">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Diagram Export
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleExportSharedPng(2)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Download PNG</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        2x Hi-Res
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportSharedPng(3)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Download PNG</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        3x Ultra
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportSharedPng(1)}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>Download PNG</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        1x Std
                      </span>
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      type="button"
                      onClick={handleExportSharedSvg}
                      className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Download SVG</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Vector
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
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
              stickyNotes={viewStickyNotes}
              navOpen={docsNavOpen}
              onToggleNav={() => setDocsNavOpen((o) => !o)}
              modKey={modKey}
              sectionRequest={docsSectionRequest}
              onSelectTable={(id) => {
                setSelectedTableId(id);
                setViewMode('diagram');
                setFocusRequest({ type: 'table', id, nonce: Date.now() });
              }}
            />
          </Suspense>
        ) : (
          <>
            <DiagramCanvas
              schema={parsedSchema}
              positions={viewPositions}
              onUpdatePositions={handleUpdateViewPositions}
              detailLevel={viewDetailLevel}
              onChangeDetailLevel={setViewDetailLevel}
              selectedDomains={selectedDomains}
              onChangeSelectedDomains={setSelectedDomains}
              selectedTableId={selectedTableId}
              highlightedColumn={highlightedColumn}
              onSelectTable={(id) => {
                setSelectedTableId(id);
                if (!id || id !== highlightedColumn?.tableId) {
                  setHighlightedColumn(null);
                }
              }}
              onChangeTableHeaderColor={() => {}}
              onAssignTableToGroup={() => {}}
              onEditGroup={() => {}}
              onAutoLayout={handleViewAutoLayout}
              onAutoLayoutGroup={handleViewAutoLayoutGroup}
              stickyNotes={viewStickyNotes}
              onAddStickyNote={() => {}}
              onUpdateStickyNote={handleMoveViewStickyNote}
              onDeleteStickyNote={() => {}}
              focusRequest={focusRequest}
              darkMode={darkMode}
              readOnly={true}
              onResetLayout={handleResetViewLayout}
              hasCustomLayout={hasCustomLayout}
            />
            {selectedTable && (
              <InspectorDrawer
                table={selectedTable}
                schema={parsedSchema}
                onClose={() => setSelectedTableId(null)}
                onSelectTable={(id) => {
                  setSelectedTableId(id);
                  setFocusRequest({ type: 'table', id, nonce: Date.now() });
                }}
                onSetTableGroups={() => {}}
                onChangeTableHeaderColor={() => {}}
                onJumpToCode={() => {}}
                onAddLinkedStickyNote={() => {}}
                readOnly={true}
              />
            )}
          </>
        )}
      </div>

      <Suspense fallback={null}>
        {commandPaletteOpen && (
          <CommandPaletteModal
            open={commandPaletteOpen}
            schema={parsedSchema}
            stickyNotes={viewStickyNotes}
            viewMode={effectiveViewMode}
            modKey={modKey}
            readOnly={true}
            onClose={() => setCommandPaletteOpen(false)}
            onSelectCommand={handleExecuteCommand}
          />
        )}
      </Suspense>
    </div>
  );
};
