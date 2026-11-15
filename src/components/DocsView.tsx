import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Database,
  KeyRound,
  Layers,
  Link2,
  Search,
  Table2,
} from 'lucide-react';
import { DetailLevel, ParsedSchema, TableDef } from '../types/schema';

interface DocsViewProps {
  schema: ParsedSchema;
  detailLevel: DetailLevel;
  selectedDomains: string[];
  onClearDomainFilter?: () => void;
  onSelectTable: (tableId: string) => void;
}

export const DocsView: React.FC<DocsViewProps> = ({
  schema,
  detailLevel,
  selectedDomains,
  onClearDomainFilter,
  onSelectTable,
}) => {
  const [search, setSearch] = useState('');

  const fkLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of schema.refs) {
      r.fromColumns.forEach((col, i) => {
        const targetCol = r.toColumns[i] || r.toColumns[0] || 'id';
        map.set(`${r.fromTable}.${col}`, `${r.toTable}.${targetCol}`);
      });
    }
    return map;
  }, [schema.refs]);

  const refColumnSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of schema.refs) {
      for (const col of r.fromColumns) set.add(`${r.fromTable}.${col}`);
      for (const col of r.toColumns) set.add(`${r.toTable}.${col}`);
    }
    return set;
  }, [schema.refs]);

  const tableMap = useMemo(
    () => new Map(schema.tables.map((t) => [t.id, t])),
    [schema.tables]
  );

  const groupedSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of schema.tableGroups) {
      for (const t of g.tables) s.add(t);
    }
    return s;
  }, [schema.tableGroups]);

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

  const ungroupedTables = useMemo(
    () => schema.tables.filter((t) => !groupedSet.has(t.id)),
    [schema.tables, groupedSet]
  );

  const q = search.trim().toLowerCase();

  const matchesSearch = (table: TableDef) => {
    if (!q) return true;
    if (table.id.toLowerCase().includes(q)) return true;
    if (table.note?.toLowerCase().includes(q)) return true;
    return table.columns.some(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.note?.toLowerCase().includes(q)
    );
  };

  const renderTableDoc = (table: TableDef, currentDomain?: string) => {
    const cols =
      detailLevel === 'keys'
        ? table.columns.filter(
            (c) =>
              c.pk ||
              c.unique ||
              refColumnSet.has(`${table.id}.${c.name}`)
          )
        : detailLevel === 'names'
        ? []
        : table.columns;

    const outgoing = schema.refs.filter((r) => r.fromTable === table.id);
    const incoming = schema.refs.filter((r) => r.toTable === table.id);
    const otherDomains = (domainsByTable.get(table.id) || []).filter(
      (d) => d !== currentDomain
    );

    return (
      <section
        key={`${currentDomain || 'ungrouped'}::${table.id}`}
        id={`doc-table-${table.id}`}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        {/* Table Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{
                backgroundColor: table.headerColor || '#0f172a',
              }}
            />
            <button
              type="button"
              onClick={() => onSelectTable(table.id)}
              className="font-mono text-base font-semibold text-slate-900 dark:text-slate-50 hover:text-blue-600 dark:hover:text-blue-400 truncate"
            >
              {table.id}
            </button>
            {table.alias && (
              <span className="text-xs text-slate-400 font-mono">
                as {table.alias}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0 flex items-center gap-2">
            {otherDomains.length > 0 && (
              <>
                <span className="text-blue-600 dark:text-blue-400">
                  Also in: {otherDomains.join(', ')}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>
              {table.columns.length} columns · {outgoing.length + incoming.length} refs
            </span>
          </div>
        </div>

        {table.note && (
          <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            {table.note}
          </div>
        )}

        {/* Columns Specification Table */}
        {detailLevel !== 'names' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900">
                  <th className="py-2.5 px-5">Column</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Constraints</th>
                  {detailLevel === 'full' && (
                    <>
                      <th className="py-2.5 px-4">Default</th>
                      <th className="py-2.5 px-5">Description &amp; Reference</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {cols.map((col) => {
                  const fk = fkLookup.get(`${table.id}.${col.name}`);
                  const constraints: string[] = [];
                  if (col.pk) constraints.push('PK');
                  if (fk) constraints.push('FK');
                  if (col.unique) constraints.push('UNIQUE');
                  if (col.notNull && !col.pk) constraints.push('NOT NULL');
                  if (col.increment) constraints.push('INCREMENT');

                  return (
                    <tr
                      key={col.name}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-2.5 px-5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {col.pk && (
                            <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                          {col.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {col.type}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {constraints.length > 0 ? constraints.join(' · ') : 'nullable'}
                      </td>
                      {detailLevel === 'full' && (
                        <>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {col.defaultValue || '—'}
                          </td>
                          <td className="py-2.5 px-5 text-slate-600 dark:text-slate-300">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              {fk && (
                                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400">
                                  <Link2 className="w-3 h-3" />
                                  <span>{fk}</span>
                                </span>
                              )}
                              {col.note && <span>{col.note}</span>}
                              {!fk && !col.note && (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Indexes */}
        {detailLevel === 'full' && table.indexes.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Indexes
            </div>
            <div className="space-y-1">
              {table.indexes.map((idx, i) => (
                <div
                  key={i}
                  className="text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2"
                >
                  <span>({idx.columns.join(', ')})</span>
                  {idx.name && (
                    <span className="text-slate-400">· {idx.name}</span>
                  )}
                  {idx.unique && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      · unique
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

  const isFilteringDomains = selectedDomains.length > 0;
  const visibleGroups = schema.tableGroups.filter(
    (g) => !isFilteringDomains || selectedDomains.includes(g.name)
  );
  const visibleGroupTableSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of visibleGroups) {
      for (const t of g.tables) s.add(t);
    }
    return s;
  }, [visibleGroups]);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Project Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
              <Database className="w-3.5 h-3.5" />
              <span>{schema.project.databaseType || 'Relational Schema'}</span>
              <span>·</span>
              <span className="tabular-nums">{schema.tables.length} Tables</span>
              <span>·</span>
              <span className="tabular-nums">
                {schema.tableGroups.length} Business Domains
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {schema.project.name || 'Database Schema Documentation'}
            </h1>
            {schema.project.note && (
              <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                {schema.project.note}
              </p>
            )}
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables, columns, notes..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        {isFilteringDomains && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs">
            <span className="text-blue-900 dark:text-blue-100 font-medium">
              Showing only selected domain{selectedDomains.length > 1 ? 's' : ''}:{' '}
              {selectedDomains.join(', ')}
            </span>
            {onClearDomainFilter && (
              <button
                type="button"
                onClick={onClearDomainFilter}
                className="font-semibold text-blue-600 dark:text-blue-300 hover:underline shrink-0"
              >
                Show All Domains
              </button>
            )}
          </div>
        )}

        {/* Business Domains */}
        {visibleGroups.map((group) => {
          const members = group.tables
            .map((id) => tableMap.get(id))
            .filter((t): t is TableDef => Boolean(t))
            .filter(matchesSearch);

          if (members.length === 0) return null;

          return (
            <div key={group.name} className="space-y-4">
              <div className="flex items-start gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-sm mt-1 shrink-0"
                  style={{ backgroundColor: group.color || '#2563EB' }}
                />
                <div className="space-y-0.5">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                    <span>{group.name}</span>
                    <span className="text-xs font-normal text-slate-400 tabular-nums">
                      ({members.length}{' '}
                      {members.length === 1 ? 'table' : 'tables'})
                    </span>
                  </h2>
                  {group.note && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {group.note}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-5">
                {members.map((t) => renderTableDoc(t, group.name))}
              </div>
            </div>
          );
        })}

        {/* Ungrouped Tables */}
        {!isFilteringDomains &&
          ungroupedTables.filter(matchesSearch).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-slate-400" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                  Ungrouped Tables
                </h2>
              </div>
              <div className="space-y-5">
                {ungroupedTables
                  .filter(matchesSearch)
                  .map((t) => renderTableDoc(t))}
              </div>
            </div>
          )}

        {/* Enums Section */}
        {schema.enums.length > 0 && !isFilteringDomains && (
          <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Enumerated Types</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schema.enums.map((en) => (
                <div
                  key={en.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                >
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {en.id}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-slate-600 dark:text-slate-300">
                    {en.values.map((v, i) => (
                      <span key={v.name} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-slate-300 dark:text-slate-700">·</span>}
                        <span>{v.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relationships Matrix */}
        {schema.refs.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              Foreign Key Relationships
            </h2>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {schema.refs
                .filter(
                  (r) =>
                    !isFilteringDomains ||
                    (visibleGroupTableSet.has(r.fromTable) &&
                      visibleGroupTableSet.has(r.toTable))
                )
                .map((r) => (
                <div
                  key={r.id}
                  className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 min-w-0">
                    <span className="font-semibold truncate">
                      {r.fromTable}.{r.fromColumns.join(',')}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="font-semibold truncate">
                      {r.toTable}.{r.toColumns.join(',')}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    cardinality: {r.relation}
                    {r.onDelete ? ` · on delete ${r.onDelete}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
