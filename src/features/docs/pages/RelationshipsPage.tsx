import React from 'react';
import { Search } from 'lucide-react';
import { RefDef } from '@shared/domain/schemaTypes';
import { CardinalityBadge, CardinalityLegend } from '../components/CardinalityBadge';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { PaginationBar } from '../components/PaginationBar';
import type { DocsSection } from '../types';

export interface RelationshipsPageProps {
  filteredRefs: RefDef[];
  pagedRefs: RefDef[];
  relSearch: string;
  relPage: number;
  relPageSize: number;
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onSetRelSearch: (q: string) => void;
  onSetRelPage: (p: number) => void;
  onSetRelPageSize: (s: number) => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const RelationshipsPage: React.FC<RelationshipsPageProps> = ({
  filteredRefs,
  pagedRefs,
  relSearch,
  relPage,
  relPageSize,
  navOpen,
  modKey,
  onToggleNav,
  onSetRelSearch,
  onSetRelPage,
  onSetRelPageSize,
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
          segments={[{ label: 'Foreign Key Relationships', isCurrent: true }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
          Foreign Key Relationships ({filteredRefs.length})
        </h1>
      </div>

      <div className="relative w-full sm:w-72 shrink-0">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={relSearch}
          onChange={(e) => onSetRelSearch(e.target.value)}
          placeholder="Filter by table, column, cardinality..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>

    <CardinalityLegend />

    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {filteredRefs.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-400">
          No foreign key relationships found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900">
                  <th className="py-2.5 px-5">Source (Table.Column)</th>
                  <th className="py-2.5 px-4">Cardinality</th>
                  <th className="py-2.5 px-4">Target (Table.Column)</th>
                  <th className="py-2.5 px-5">Referential Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {pagedRefs.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-5 font-mono whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenTableDetail(r.fromTable)}
                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {r.fromTable}.{r.fromColumns.join(', ')}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <CardinalityBadge relation={r.relation} />
                    </td>
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenTableDetail(r.toTable)}
                        className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {r.toTable}.{r.toColumns.join(', ')}
                      </button>
                    </td>
                    <td className="py-2.5 px-5 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        {r.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: r.color }}
                            title={`Ref color: ${r.color}`}
                          />
                        )}
                        <span>
                          {[
                            r.name,
                            r.onDelete ? `on delete ${r.onDelete}` : null,
                            r.onUpdate ? `on update ${r.onUpdate}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={relPage}
            pageSize={relPageSize}
            totalItems={filteredRefs.length}
            itemLabel="relationships"
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={onSetRelPage}
            onPageSizeChange={onSetRelPageSize}
          />
        </>
      )}
    </div>
  </div>
);
