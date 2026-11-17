import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  Columns2,
  Download,
  FolderGit2,
  GitCommitHorizontal,
  KeyRound,
  Keyboard,
  Layers,
  LayoutGrid,
  Link2,
  Moon,
  PanelLeft,
  Search,
  Sun,
  Table2,
  X,
} from 'lucide-react';
import {
  GithubFileLink,
  GithubRepoLink,
  ParsedSchema,
  ViewMode,
} from '../types/schema';
import { BrandLogo } from './BrandLogo';

export interface GlobalSearchResult {
  kind: 'table' | 'column' | 'group';
  id: string;
  tableId?: string;
  columnName?: string;
  columnType?: string;
  isPk?: boolean;
  groupName?: string;
  domains: string[];
  line?: number;
  subtitle?: string;
}

interface TopBarProps {
  projectName: string;
  schema: ParsedSchema;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onSelectSearchResult: (result: GlobalSearchResult) => void;
  onOpenWorkspaces: () => void;
  onOpenUrlModal: () => void;
  onOpenGithubModal: () => void;
  onOpenImportExport: () => void;
  onOpenSaveVersion: () => void;
  onOpenShortcuts: () => void;
  githubLink?: GithubFileLink;
  githubRepoLink?: GithubRepoLink;
  hasGithubChanges?: boolean;
  modKey: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  errorCount: number;
}

const VIEW_OPTIONS: Array<{
  id: ViewMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'split', label: 'Split', Icon: Columns2 },
  { id: 'diagram', label: 'Diagram', Icon: LayoutGrid },
  { id: 'docs', label: 'Docs', Icon: BookOpen },
];

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  schema,
  sidebarOpen,
  onToggleSidebar,
  viewMode,
  onChangeViewMode,
  onSelectSearchResult,
  onOpenWorkspaces,
  onOpenUrlModal,
  onOpenGithubModal,
  onOpenImportExport,
  onOpenSaveVersion,
  onOpenShortcuts,
  githubLink,
  githubRepoLink,
  hasGithubChanges = false,
  modKey,
  darkMode,
  onToggleDarkMode,
  errorCount,
}) => {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl + K shortcut to focus global search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const domainsByTable = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of schema.tableGroups) {
      for (const t of new Set(g.tables)) {
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(g.name);
      }
    }
    return map;
  }, [schema.tableGroups]);

  const searchResults = useMemo<GlobalSearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    const results: GlobalSearchResult[] = [];

    if (!q) {
      // Show quick overview of tables when focused with empty query
      for (const t of schema.tables.slice(0, 8)) {
        results.push({
          kind: 'table',
          id: `table:${t.id}`,
          tableId: t.id,
          domains: domainsByTable.get(t.id) || [],
          line: t.line,
          subtitle: `${t.columns.length} columns`,
        });
      }
      return results;
    }

    // 1. Matching Business Domains
    for (const g of schema.tableGroups) {
      if (
        g.name.toLowerCase().includes(q) ||
        g.note?.toLowerCase().includes(q)
      ) {
        results.push({
          kind: 'group',
          id: `group:${g.name}`,
          groupName: g.name,
          domains: [g.name],
          line: g.line,
          subtitle: `${g.tables.length} tables`,
        });
      }
    }

    // 2. Matching Tables
    for (const t of schema.tables) {
      const domains = domainsByTable.get(t.id) || [];
      const domainMatch = domains.some((d) => d.toLowerCase().includes(q));
      if (
        t.id.toLowerCase().includes(q) ||
        t.alias?.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q) ||
        domainMatch
      ) {
        results.push({
          kind: 'table',
          id: `table:${t.id}`,
          tableId: t.id,
          domains,
          line: t.line,
          subtitle: `${t.columns.length} columns`,
        });
      }
    }

    // 3. Matching Columns (supports "table.col" or column name/type)
    for (const t of schema.tables) {
      const domains = domainsByTable.get(t.id) || [];
      for (const c of t.columns) {
        const qualified = `${t.id}.${c.name}`.toLowerCase();
        if (
          c.name.toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q) ||
          qualified.includes(q) ||
          c.note?.toLowerCase().includes(q)
        ) {
          results.push({
            kind: 'column',
            id: `col:${t.id}.${c.name}`,
            tableId: t.id,
            columnName: c.name,
            columnType: c.type,
            isPk: c.pk,
            domains,
            line: c.line || t.line,
            subtitle: c.note,
          });
        }
      }
    }

    return results.slice(0, 24);
  }, [query, schema, domainsByTable]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const handleChoose = (res: GlobalSearchResult) => {
    onSelectSearchResult(res);
    setSearchOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setSearchOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        searchResults.length > 0 ? (prev + 1) % searchResults.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        searchResults.length > 0
          ? (prev - 1 + searchResults.length) % searchResults.length
          : 0
      );
    } else if (e.key === 'Enter' && searchResults[activeIndex]) {
      e.preventDefault();
      handleChoose(searchResults[activeIndex]);
    }
  };

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-3 select-none z-30">
      {/* Left: Sidebar toggle + Wordmark + Project Switcher + Global Search */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          disabled={viewMode === 'docs'}
          title={
            viewMode === 'docs'
              ? 'Left sidebar is locked hidden in Docs view'
              : sidebarOpen
              ? `Hide Left Sidebar (${modKey}B)`
              : `Show Left Sidebar (${modKey}B)`
          }
          className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0 ${
            viewMode === 'docs'
              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <BrandLogo className="w-7 h-7 shrink-0" />
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
            SchemaForge
          </span>
        </div>

        <span
          className="text-slate-300 dark:text-slate-700 hidden sm:inline"
          aria-hidden="true"
        >
          /
        </span>

        <button
          type="button"
          onClick={onOpenWorkspaces}
          className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0 max-w-[190px]"
          title="Switch or create local workspace"
        >
          <span className="truncate">{projectName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {/* Global Search Input */}
        <div ref={searchBoxRef} className="relative flex-1 max-w-[290px] ml-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Find table or column..."
            aria-label="Global search for tables, columns, and domains"
            className="w-full pl-8 pr-14 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white dark:focus:bg-slate-900 transition-colors"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden md:inline-block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 pointer-events-none">
              ⌘K
            </kbd>
          )}

          {/* Search Results Dropdown */}
          {searchOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  {query.trim()
                    ? `${searchResults.length} matches across all domains`
                    : 'Quick jump to table'}
                </span>
                <span className="font-mono">↑↓ Navigate · Enter Select</span>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                {searchResults.length === 0 ? (
                  <div className="py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No tables, columns, or domains matching &ldquo;{query}&rdquo;
                  </div>
                ) : (
                  searchResults.map((res, idx) => {
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={res.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => handleChoose(res)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-3 transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-950/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {res.kind === 'group' ? (
                            <Layers className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                          ) : res.kind === 'table' ? (
                            <Table2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                          ) : (
                            <KeyRound
                              className={`w-3.5 h-3.5 shrink-0 ${
                                res.isPk
                                  ? 'text-amber-500'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            />
                          )}

                          <div className="min-w-0">
                            <div className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {res.kind === 'group' ? (
                                res.groupName
                              ) : res.kind === 'table' ? (
                                res.tableId
                              ) : (
                                <>
                                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    {res.tableId}.
                                  </span>
                                  <span>{res.columnName}</span>
                                </>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {res.domains.length > 0
                                ? res.domains.join(' · ')
                                : 'Ungrouped'}
                              {res.subtitle ? ` · ${res.subtitle}` : ''}
                            </div>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {res.kind === 'column'
                            ? res.columnType
                            : res.kind === 'group'
                            ? 'Domain'
                            : 'Table'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {errorCount > 0 && (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0 tabular-nums hidden xl:inline">
            {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      {/* Center: View Mode */}
      <div className="hidden lg:flex items-center gap-2.5 shrink-0">
        <div
          className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70"
          role="group"
          aria-label="Workspace View Mode"
        >
          {VIEW_OPTIONS.map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeViewMode(id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Shortcuts, Theme, Open URL, GitHub, Import/Export, Primary Save Version CTA */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenUrlModal}
          title="Open DBML from URL"
          aria-label="Open DBML from URL"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Open URL</span>
        </button>

        <button
          type="button"
          onClick={onOpenGithubModal}
          title={
            githubRepoLink
              ? `GitHub Folder: ${githubRepoLink.owner}/${githubRepoLink.repo}/${githubRepoLink.schemaFolder}/ (${githubRepoLink.branch}) · ${
                  hasGithubChanges ? 'Unpushed changes' : 'In sync'
                }`
              : githubLink
              ? `GitHub: ${githubLink.owner}/${githubLink.repo} (${githubLink.branch}) · ${
                  hasGithubChanges ? 'Unpushed changes' : 'In sync'
                }`
              : 'Load from or push DBML to GitHub'
          }
          aria-label="GitHub repository sync"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
            (githubRepoLink || githubLink) && hasGithubChanges
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">
            {githubRepoLink || githubLink
              ? hasGithubChanges
                ? 'Push GitHub'
                : 'GitHub'
              : 'GitHub'}
          </span>
          {(githubRepoLink || githubLink) && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasGithubChanges ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenImportExport}
          title={`Import / Export (${modKey}I)`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Import / Export</span>
          <span className="xl:hidden">Export</span>
        </button>

        <button
          type="button"
          onClick={onOpenSaveVersion}
          title={`Save Version (${modKey}S)`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <GitCommitHorizontal className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Save Version</span>
          <span className="xl:hidden">Save</span>
        </button>
      </div>
    </header>
  );
};
