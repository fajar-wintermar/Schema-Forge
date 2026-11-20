import React from 'react';
import { Blocks, KeyRound, Search } from 'lucide-react';
import { TableDef, TablePartialDef } from '../../../types/schema';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { TrimmableNote } from '../components/TrimmableNote';
import type { DocsSection } from '../types';

export interface PartialsPageProps {
  partials: TablePartialDef[];
  tables: TableDef[];
  partialSearch: string;
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onSetPartialSearch: (q: string) => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const PartialsPage: React.FC<PartialsPageProps> = ({
  partials,
  tables,
  partialSearch,
  navOpen,
  modKey,
  onToggleNav,
  onSetPartialSearch,
  onNavigateSection,
  onOpenTableDetail,
}) => {
  const pq = partialSearch.trim().toLowerCase();
  const filtered = pq
    ? partials.filter(
        (p) =>
          p.name.toLowerCase().includes(pq) ||
          (p.note || '').toLowerCase().includes(pq) ||
          p.columns.some((c) => c.name.toLowerCase().includes(pq))
      )
    : partials;

  return (
    <div className="w-full px-6 lg:px-10 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <DocsBreadcrumb
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onBackClick={() => onNavigateSection({ kind: 'overview' })}
            segments={[{ label: 'Table Partials', isCurrent: true }]}
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
            Table Partials ({filtered.length})
          </h1>
        </div>

        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={partialSearch}
            onChange={(e) => onSetPartialSearch(e.target.value)}
            placeholder="Filter partials or columns..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400">
          {partials.length === 0
            ? 'No TablePartial blocks defined in this schema.'
            : `No TablePartials matching "${partialSearch}".`}
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((partial) => {
            const usedBy = tables.filter((t) =>
              t.appliedPartials?.includes(partial.name)
            );
            return (
              <section
                key={partial.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Blocks className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{
                        backgroundColor: partial.headerColor || '#7c3aed',
                      }}
                    />
                    <h2 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      ~{partial.name}
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {partial.columns.length} columns
                    {partial.indexes.length > 0
                      ? ` · ${partial.indexes.length} indexes`
                      : ''}
                    {partial.checks.length > 0
                      ? ` · ${partial.checks.length} checks`
                      : ''}
                    {` · used by ${usedBy.length} ${
                      usedBy.length === 1 ? 'table' : 'tables'
                    }`}
                  </span>
                </div>

                {partial.note && (
                  <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    <TrimmableNote
                      content={partial.note}
                      compact
                      maxChars={160}
                      defaultExpanded={false}
                    />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900">
                        <th className="py-2 px-5">Column</th>
                        <th className="py-2 px-4">Type</th>
                        <th className="py-2 px-4">Default</th>
                        <th className="py-2 px-5">Constraints &amp; Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                      {partial.columns.map((c) => (
                        <tr key={c.name}>
                          <td className="py-2 px-5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5">
                              {c.pk && (
                                <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />
                              )}
                              {c.name}
                            </span>
                          </td>
                          <td className="py-2 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {c.type}
                          </td>
                          <td className="py-2 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {c.defaultValue || '—'}
                          </td>
                          <td className="py-2 px-5 text-slate-600 dark:text-slate-300 text-[11px]">
                            {[
                              c.pk ? 'PK' : null,
                              c.notNull && !c.pk ? 'NOT NULL' : null,
                              c.unique ? 'UNIQUE' : null,
                              c.check ? `CHECK (${c.check})` : null,
                              c.note || null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {usedBy.length > 0 && (
                  <div className="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Injected into:
                    </span>
                    {usedBy.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTableDetail(t.id)}
                        className="font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {t.id}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
