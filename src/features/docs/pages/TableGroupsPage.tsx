import React from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { TableGroupDef } from '@shared/domain/schemaTypes';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { PaginationBar } from '../components/PaginationBar';
import { TrimmableNote } from '../components/TrimmableNote';
import type { DocsSection } from '../types';

export interface TableGroupsPageProps {
  totalSchemaGroups: number;
  filteredGroups: TableGroupDef[];
  pagedGroups: TableGroupDef[];
  groupsSearch: string;
  groupsPage: number;
  groupsPageSize: number;
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onSetGroupsSearch: (q: string) => void;
  onSetGroupsPage: (p: number) => void;
  onSetGroupsPageSize: (s: number) => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const TableGroupsPage: React.FC<TableGroupsPageProps> = ({
  totalSchemaGroups,
  filteredGroups,
  pagedGroups,
  groupsSearch,
  groupsPage,
  groupsPageSize,
  navOpen,
  modKey,
  onToggleNav,
  onSetGroupsSearch,
  onSetGroupsPage,
  onSetGroupsPageSize,
  onNavigateSection,
  onOpenTableDetail,
}) => (
  <div className="w-full px-6 lg:px-10 py-6 space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
      <div className="space-y-1">
        <DocsBreadcrumb
          navOpen={navOpen}
          modKey={modKey}
          onToggleNav={onToggleNav}
          onBackClick={() => onNavigateSection({ kind: 'overview' })}
          segments={[{ label: 'Table Groups', isCurrent: true }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
          Table Groups &amp; Domain Notes ({filteredGroups.length})
        </h1>
      </div>

      <div className="relative w-full sm:w-72 shrink-0">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={groupsSearch}
          onChange={(e) => onSetGroupsSearch(e.target.value)}
          placeholder="Filter groups, notes, tables..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>

    {filteredGroups.length === 0 ? (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400">
        {totalSchemaGroups === 0
          ? 'No TableGroup definitions found in this schema.'
          : `No table groups matching "${groupsSearch}"`}
      </div>
    ) : (
      <div className="space-y-4">
        {pagedGroups.map((g) => (
          <section
            key={g.name}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-xs shrink-0"
                  style={{ backgroundColor: g.color || '#2563EB' }}
                />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                  {g.name}
                </h2>
                <span className="text-xs text-slate-400 tabular-nums">
                  {g.tables.length} {g.tables.length === 1 ? 'table' : 'tables'}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigateSection({ kind: 'group', groupName: g.name })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
              >
                <span>Open Domain Page</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {g.note ? (
                <div className="max-w-4xl">
                  <TrimmableNote
                    key={`grp-list-${g.name}`}
                    content={g.note}
                    maxChars={200}
                    defaultExpanded={false}
                  />
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  No TableGroup note defined.
                </p>
              )}

              {g.tables.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-slate-400 mr-1">
                    Tables:
                  </span>
                  {g.tables.map((tId) => (
                    <button
                      key={tId}
                      type="button"
                      onClick={() => onOpenTableDetail(tId)}
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:border-blue-400"
                    >
                      {tId}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <PaginationBar
            page={groupsPage}
            pageSize={groupsPageSize}
            totalItems={filteredGroups.length}
            itemLabel="table groups"
            onPageChange={onSetGroupsPage}
            onPageSizeChange={onSetGroupsPageSize}
          />
        </div>
      </div>
    )}
  </div>
);
