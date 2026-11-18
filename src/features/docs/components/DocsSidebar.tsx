import React from 'react';
import {
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  GitBranch,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { ParsedSchema, TableDef, TableGroupDef } from '../../../types/schema';
import type { DocsSection, TreeFilterMode } from '../types';

export interface DocsSidebarProps {
  schema: ParsedSchema;
  section: DocsSection;
  activeTableId: string | null;
  orderedAllTables: TableDef[];
  treeFlatTables: TableDef[];
  visibleGroups: TableGroupDef[];
  ungroupedTables: TableDef[];
  tableMap: Map<string, TableDef>;
  fkLookup: Map<string, { targetTable: string; targetCol: string; label: string }>;
  allNotesCount: number;
  isFilteringDomains: boolean;
  navSearch: string;
  nq: string;
  treeMode: TreeFilterMode;
  sortAZ: boolean;
  expandedDomains: Record<string, boolean>;
  expandedTreeTables: Record<string, boolean>;
  matchesSearch: (table: TableDef, q: string) => boolean;
  onSetNavSearch: (val: string) => void;
  onSetTreeMode: (mode: TreeFilterMode) => void;
  onToggleSortAZ: () => void;
  onToggleDomainExpand: (domainName: string) => void;
  onToggleTreeTableExpand: (key: string) => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  schema,
  section,
  activeTableId,
  orderedAllTables,
  treeFlatTables,
  visibleGroups,
  ungroupedTables,
  tableMap,
  fkLookup,
  allNotesCount,
  isFilteringDomains,
  navSearch,
  nq,
  treeMode,
  sortAZ,
  expandedDomains,
  expandedTreeTables,
  matchesSearch,
  onSetNavSearch,
  onSetTreeMode,
  onToggleSortAZ,
  onToggleDomainExpand,
  onToggleTreeTableExpand,
  onNavigateSection,
  onOpenTableDetail,
}) => {
  const renderTreeTableItem = (table: TableDef, nodeKey: string) => {
    const isSelected = activeTableId === table.id;
    const isExpanded = Boolean(expandedTreeTables[nodeKey]);

    return (
      <div key={nodeKey}>
        <div
          className={`group flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTreeTableExpand(nodeKey);
            }}
            aria-label={
              isExpanded
                ? `Collapse ${table.id} columns`
                : `Expand ${table.id} columns`
            }
            className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenTableDetail(table.id)}
            className="flex-1 flex items-center gap-1.5 min-w-0 text-left py-0.5"
          >
            <Table2
              className={`w-3.5 h-3.5 shrink-0 ${
                isSelected
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400'
              }`}
            />
            <span className="truncate font-mono text-[12px]">{table.id}</span>
          </button>
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0 pr-1">
            {table.columns.length}
          </span>
        </div>

        {isExpanded && (
          <div className="ml-5 pl-2 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">
            {table.columns.map((col) => {
              const fk = fkLookup.get(`${table.id}.${col.name}`);
              return (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => onOpenTableDetail(table.id)}
                  className="w-full flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-left"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {col.pk ? (
                      <KeyRound className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    ) : fk ? (
                      <Link2 className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    ) : (
                      <span className="w-2.5 h-2.5 inline-block shrink-0" />
                    )}
                    <span className="font-mono truncate">{col.name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {col.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-[272px] shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col select-none">
      {/* Quick Section Navigation */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
        <button
          type="button"
          onClick={() => onNavigateSection({ kind: 'overview' })}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            section.kind === 'overview'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Schema Overview</span>
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {orderedAllTables.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection({ kind: 'groups' })}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            section.kind === 'groups'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Table Groups</span>
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {schema.tableGroups.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection({ kind: 'notes' })}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            section.kind === 'notes' || section.kind === 'noteDetail'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">All Notes</span>
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {allNotesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection({ kind: 'enums' })}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            section.kind === 'enums'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <ListChecks className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Enumerated Types</span>
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {schema.enums.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection({ kind: 'relationships' })}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
            section.kind === 'relationships'
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-2 truncate">
            <GitBranch className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">FK Relationships</span>
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {schema.refs.length}
          </span>
        </button>

        {schema.notes.length > 0 && (
          <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
            <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Project Notes
            </div>
            {schema.notes.map((n) => {
              const isActiveNote =
                section.kind === 'note' && section.noteId === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNavigateSection({ kind: 'note', noteId: n.id })}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isActiveNote
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{n.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tree Search & Mode Switch */}
      <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => onSetNavSearch(e.target.value)}
              placeholder="Search table or domain..."
              className="w-full pl-8 pr-6 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            {navSearch && (
              <button
                type="button"
                onClick={() => onSetNavSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Clear tree filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleSortAZ}
            title={
              sortAZ
                ? 'Sorted A–Z (click for schema order)'
                : 'Schema order (click to sort A–Z)'
            }
            className={`p-1.5 rounded-md border transition-colors shrink-0 ${
              sortAZ
                ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tree View Filter: All Tables vs By Domain */}
        <div
          className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80"
          role="group"
          aria-label="Docs tree grouping"
        >
          <button
            type="button"
            onClick={() => onSetTreeMode('all')}
            className={`py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              treeMode === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All Tables
          </button>
          <button
            type="button"
            onClick={() => onSetTreeMode('domain')}
            className={`py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              treeMode === 'domain'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            By Domain
          </button>
        </div>
      </div>

      {/* Tree Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {treeMode === 'all' ? (
          treeFlatTables.length === 0 ? (
            <div className="py-8 px-3 text-center text-xs text-slate-400">
              No matching tables
            </div>
          ) : (
            treeFlatTables.map((t) => renderTreeTableItem(t, `flat::${t.id}`))
          )
        ) : (
          <>
            {visibleGroups.map((group) => {
              const groupTablesRaw = group.tables
                .map((id) => tableMap.get(id))
                .filter((t): t is TableDef => Boolean(t));
              const groupTablesSorted = sortAZ
                ? [...groupTablesRaw].sort((a, b) => a.id.localeCompare(b.id))
                : groupTablesRaw;
              const matchingTables = groupTablesSorted.filter((t) =>
                !nq
                  ? true
                  : matchesSearch(t, nq) ||
                    group.name.toLowerCase().includes(nq)
              );
              if (
                nq &&
                matchingTables.length === 0 &&
                !group.name.toLowerCase().includes(nq)
              ) {
                return null;
              }
              const isOpen = expandedDomains[group.name] ?? true;

              return (
                <div key={group.name} className="space-y-0.5">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onToggleDomainExpand(group.name)}
                      className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: group.color || '#2563EB' }}
                      />
                      <span className="flex-1 truncate text-left">
                        {group.name}
                      </span>
                      <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                        {matchingTables.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateSection({ kind: 'group', groupName: group.name })
                      }
                      title={
                        group.note
                          ? `Open "${group.name}" documentation & note`
                          : `Open "${group.name}" domain page`
                      }
                      className={`p-1 rounded-md transition-colors shrink-0 ${
                        section.kind === 'group' &&
                        section.groupName === group.name
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : group.note
                          ? 'text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="ml-3 pl-1.5 border-l border-slate-200/80 dark:border-slate-800 space-y-0.5">
                      {matchingTables.map((t) =>
                        renderTreeTableItem(t, `dom:${group.name}::${t.id}`)
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!isFilteringDomains &&
              ungroupedTables.filter((t) => matchesSearch(t, nq)).length > 0 && (
                <div className="space-y-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleDomainExpand('__ungrouped__')}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    {expandedDomains['__ungrouped__'] ?? true ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-left">
                      Ungrouped
                    </span>
                    <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                      {ungroupedTables.filter((t) => matchesSearch(t, nq)).length}
                    </span>
                  </button>
                  {(expandedDomains['__ungrouped__'] ?? true) && (
                    <div className="ml-3 pl-1.5 border-l border-slate-200/80 dark:border-slate-800 space-y-0.5">
                      {(sortAZ
                        ? [...ungroupedTables].sort((a, b) =>
                            a.id.localeCompare(b.id)
                          )
                        : ungroupedTables
                      )
                        .filter((t) => matchesSearch(t, nq))
                        .map((t) => renderTreeTableItem(t, `ungrouped::${t.id}`))}
                    </div>
                  )}
                </div>
              )}
          </>
        )}
      </div>
    </aside>
  );
};
