import React from 'react';
import { ListChecks, Search } from 'lucide-react';
import { EnumDef } from '../../../types/schema';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { PaginationBar } from '../components/PaginationBar';
import { TrimmableNote } from '../components/TrimmableNote';
import type { DocsSection } from '../types';

export interface EnumsPageProps {
  totalEnums: number;
  filteredEnums: EnumDef[];
  pagedEnums: EnumDef[];
  enumUsageMap: Map<string, Array<{ tableId: string; columnName: string }>>;
  enumSearch: string;
  enumPage: number;
  enumPageSize: number;
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onSetEnumSearch: (q: string) => void;
  onSetEnumPage: (p: number) => void;
  onSetEnumPageSize: (s: number) => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const EnumsPage: React.FC<EnumsPageProps> = ({
  totalEnums,
  filteredEnums,
  pagedEnums,
  enumUsageMap,
  enumSearch,
  enumPage,
  enumPageSize,
  navOpen,
  modKey,
  onToggleNav,
  onSetEnumSearch,
  onSetEnumPage,
  onSetEnumPageSize,
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
          segments={[{ label: 'Enumerated Types', isCurrent: true }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
          Enumerated Types ({totalEnums})
        </h1>
      </div>

      <div className="relative w-full sm:w-64 shrink-0">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={enumSearch}
          onChange={(e) => onSetEnumSearch(e.target.value)}
          placeholder="Filter enums or values..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>

    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {filteredEnums.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-400">
          {totalEnums === 0
            ? 'No Enum definitions found in this schema.'
            : `No enumerated types matching "${enumSearch}"`}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900">
                  <th className="py-3 px-5">Enum Name</th>
                  <th className="py-3 px-4 text-right">Values</th>
                  <th className="py-3 px-4">Allowed Members</th>
                  <th className="py-3 px-5">Used By Columns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {pagedEnums.map((en) => {
                  const usages =
                    enumUsageMap.get(en.id.toLowerCase()) ||
                    enumUsageMap.get(en.name.toLowerCase()) ||
                    [];
                  return (
                    <tr
                      key={en.id}
                      className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{en.id}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {en.values.length}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2.5">
                          {en.values.map((v, idx) => (
                            <div
                              key={v.name}
                              className="flex items-start gap-2 min-w-0"
                            >
                              <span className="font-mono text-[10px] text-slate-400 tabular-nums w-4 text-right shrink-0 pt-0.5">
                                {idx + 1}.
                              </span>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="font-mono text-[11.5px] text-slate-800 dark:text-slate-200 font-medium break-words">
                                  {v.name}
                                </div>
                                {v.note && (
                                  <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                    <TrimmableNote
                                      content={v.note}
                                      compact
                                      maxChars={90}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        {usages.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {usages.map((u) => (
                              <button
                                key={`${u.tableId}.${u.columnName}`}
                                type="button"
                                onClick={() => onOpenTableDetail(u.tableId)}
                                className="font-mono text-[11px] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:border-blue-400"
                              >
                                {u.tableId}.{u.columnName}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={enumPage}
            pageSize={enumPageSize}
            totalItems={filteredEnums.length}
            itemLabel="enums"
            onPageChange={onSetEnumPage}
            onPageSizeChange={onSetEnumPageSize}
          />
        </>
      )}
    </div>
  </div>
);
