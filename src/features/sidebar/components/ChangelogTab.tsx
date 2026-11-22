import React, { useMemo, useState } from 'react';
import { ParsedSchema, SchemaVersion, SqlDialect } from '../../../types/schema';
import { computeSchemaDiff } from '../../../utils/schemaDiff';
import { SqlMigrationViewer } from '../../../components/SqlMigrationViewer';

export interface ChangelogTabProps {
  schema: ParsedSchema;
  currentDbml: string;
  versions: SchemaVersion[];
  onSelectTable: (tableId: string) => void;
}

export const ChangelogTab: React.FC<ChangelogTabProps> = ({
  schema,
  currentDbml,
  versions,
  onSelectTable,
}) => {
  const [compareFromId, setCompareFromId] = useState<string>(
    versions[1]?.id || versions[0]?.id || 'working'
  );
  const [compareToId, setCompareToId] = useState<string>('working');
  const [diffFilter, setDiffFilter] = useState<
    'all' | 'added' | 'modified' | 'removed'
  >('all');
  const [diffDomainFilter, setDiffDomainFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'semantic' | 'raw' | 'sql'>('semantic');
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgres');

  const resolveLabel = (id: string) => {
    if (id === 'working') return 'Working Draft';
    return versions.find((v) => v.id === id)?.tag || id;
  };

  const diffResult = useMemo(() => {
    const getDbmlForId = (id: string) => {
      if (id === 'working') return currentDbml;
      return versions.find((v) => v.id === id)?.dbml || currentDbml;
    };
    return computeSchemaDiff(
      getDbmlForId(compareFromId),
      getDbmlForId(compareToId)
    );
  }, [compareFromId, compareToId, currentDbml, versions]);

  const filteredTableDiffs = useMemo(() => {
    return diffResult.tables.filter((td) => {
      if (diffFilter !== 'all' && td.status !== diffFilter) return false;
      if (diffDomainFilter !== 'all') {
        const groups = td.groupNames || [];
        if (diffDomainFilter === 'Ungrouped') {
          if (groups.length > 0) return false;
        } else if (!groups.includes(diffDomainFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [diffResult.tables, diffFilter, diffDomainFilter]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Base Version
            </label>
            <select
              value={compareFromId}
              onChange={(e) => setCompareFromId(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.tag} {v.isPublished ? '(Pub)' : ''}
                </option>
              ))}
              <option value="working">Working Draft</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
              Target Version
            </label>
            <select
              value={compareToId}
              onChange={(e) => setCompareToId(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="working">Working Draft</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.tag} {v.isPublished ? '(Pub)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
          {(
            [
              { id: 'semantic', label: 'Semantic' },
              { id: 'sql', label: 'SQL (ALTER)' },
              { id: 'raw', label: 'Raw Diff' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id)}
              className={`py-1 text-[11px] font-medium rounded transition-colors ${
                viewMode === mode.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {viewMode === 'semantic' && (
          <>
            <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
              {(['all', 'added', 'modified', 'removed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDiffFilter(f)}
                  className={`flex-1 py-1 text-[11px] font-medium rounded capitalize transition-colors ${
                    diffFilter === f
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <select
              value={diffDomainFilter}
              onChange={(e) => setDiffDomainFilter(e.target.value)}
              className="w-full px-2 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Domains</option>
              {schema.tableGroups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
              <option value="Ungrouped">Ungrouped</option>
            </select>
          </>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            +{diffResult.summary.tablesAdded} tables
          </span>
          <span>·</span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            ~{diffResult.summary.tablesModified} modified
          </span>
          <span>·</span>
          <span className="text-rose-600 dark:text-rose-400 font-medium">
            -{diffResult.summary.tablesRemoved} removed
          </span>
          {diffResult.summary.indexesChanged > 0 && (
            <>
              <span>·</span>
              <span>{diffResult.summary.indexesChanged} idx</span>
            </>
          )}
          {diffResult.summary.refsChanged > 0 && (
            <>
              <span>·</span>
              <span>{diffResult.summary.refsChanged} FK</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {viewMode === 'sql' ? (
          <SqlMigrationViewer
            diff={diffResult}
            dialect={sqlDialect}
            onChangeDialect={setSqlDialect}
            options={{
              baseLabel: resolveLabel(compareFromId),
              targetLabel: resolveLabel(compareToId),
            }}
            maxHeightClass="max-h-[calc(100vh-300px)]"
          />
        ) : viewMode === 'raw' ? (
          <div className="font-mono text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            {diffResult.lineDiff
              .filter((l) => l.type !== 'context')
              .slice(0, 250)
              .map((l, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-0.5 whitespace-pre-wrap break-all ${
                    l.type === 'added'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  {l.type === 'added' ? '+ ' : '- '}
                  {l.text}
                </div>
              ))}
            {diffResult.lineDiff.filter((l) => l.type !== 'context').length ===
              0 && (
              <div className="p-4 text-center text-slate-400 font-sans">
                No textual differences between selected versions.
              </div>
            )}
          </div>
        ) : (
          <>
            {filteredTableDiffs.length === 0 &&
            diffResult.groups.length === 0 &&
            diffResult.refs.length === 0 &&
            diffResult.enums.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">
                No schema differences found for the selected comparison.
              </div>
            ) : (
              <>
                {diffResult.groups.length > 0 && diffDomainFilter === 'all' && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Domain Group Changes
                    </div>
                    {diffResult.groups.map((gd) => (
                      <div
                        key={gd.name}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {gd.name}
                          </span>
                          <span
                            className={`text-[11px] font-medium capitalize ${
                              gd.status === 'added'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : gd.status === 'removed'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {gd.status}
                          </span>
                        </div>
                        {gd.addedTables.length > 0 && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                            + {gd.addedTables.join(', ')}
                          </div>
                        )}
                        {gd.removedTables.length > 0 && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono">
                            - {gd.removedTables.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {filteredTableDiffs.map((td) => (
                  <div
                    key={td.tableId}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectTable(td.tableId)}
                        className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                      >
                        {td.tableId}
                      </button>
                      <span
                        className={`text-[11px] font-medium capitalize shrink-0 ${
                          td.status === 'added'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : td.status === 'removed'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {td.status}
                      </span>
                    </div>
                    {td.groupNames && td.groupNames.length > 0 && (
                      <div className="text-[11px] text-slate-400">
                        Domains: {td.groupNames.join(', ')}
                      </div>
                    )}
                    <div className="space-y-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
                      {td.columnDiffs.map((cd) => (
                        <div
                          key={cd.name}
                          className="text-[11px] flex items-start justify-between gap-2 font-mono"
                        >
                          <span
                            className={
                              cd.status === 'added'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : cd.status === 'removed'
                                ? 'text-rose-600 dark:text-rose-400 line-through'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {cd.status === 'added'
                              ? '+'
                              : cd.status === 'removed'
                              ? '-'
                              : '~'}{' '}
                            {cd.name}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 text-right truncate">
                            {cd.changes.join('; ')}
                          </span>
                        </div>
                      ))}
                      {(td.indexDiffs || []).map((idDiff) => (
                        <div
                          key={idDiff.key}
                          className="text-[11px] flex items-start justify-between gap-2 font-mono"
                        >
                          <span
                            className={
                              idDiff.status === 'added'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : idDiff.status === 'removed'
                                ? 'text-rose-600 dark:text-rose-400 line-through'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {idDiff.status === 'added'
                              ? '+'
                              : idDiff.status === 'removed'
                              ? '-'
                              : '~'}{' '}
                            [idx] {idDiff.name || idDiff.key}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 text-right truncate">
                            {idDiff.changes.join('; ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {diffResult.enums.length > 0 && diffDomainFilter === 'all' && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Enum Changes
                    </div>
                    {diffResult.enums.map((ed) => (
                      <div
                        key={ed.name}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-mono space-y-0.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                            {ed.name}
                          </span>
                          <span className="capitalize text-slate-500">{ed.status}</span>
                        </div>
                        {ed.addedValues.length > 0 && (
                          <div className="text-emerald-600 dark:text-emerald-400">
                            + {ed.addedValues.join(', ')}
                          </div>
                        )}
                        {ed.removedValues.length > 0 && (
                          <div className="text-rose-600 dark:text-rose-400">
                            - {ed.removedValues.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {diffResult.refs.length > 0 && diffDomainFilter === 'all' && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Relationship Changes
                    </div>
                    {diffResult.refs.map((rd, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] font-mono"
                      >
                        <span
                          className={
                            rd.status === 'added'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : rd.status === 'removed'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {rd.status === 'added'
                            ? '+ '
                            : rd.status === 'removed'
                            ? '- '
                            : '~ '}
                          {rd.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

