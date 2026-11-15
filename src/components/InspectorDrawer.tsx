import React from 'react';
import {
  ArrowRight,
  Code2,
  KeyRound,
  Layers,
  Link2,
  StickyNote as StickyNoteIcon,
  X,
} from 'lucide-react';
import { ParsedSchema, TableDef } from '../types/schema';

interface InspectorDrawerProps {
  table: TableDef | null;
  schema: ParsedSchema;
  onClose: () => void;
  onSelectTable: (tableId: string) => void;
  onSetTableGroups: (tableId: string, groupNames: string[]) => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
  onJumpToCode: (line?: number) => void;
  onAddLinkedStickyNote: (tableId: string) => void;
}

const SWATCHES = [
  '#0f172a',
  '#1e3a8a',
  '#0369a1',
  '#065f46',
  '#9a3412',
  '#5b21b6',
  '#9f1239',
  '#374151',
];

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  table,
  schema,
  onClose,
  onSelectTable,
  onSetTableGroups,
  onChangeTableHeaderColor,
  onJumpToCode,
  onAddLinkedStickyNote,
}) => {
  if (!table) return null;

  const assignedGroups = schema.tableGroups
    .filter((g) => g.tables.includes(table.id))
    .map((g) => g.name);

  const toggleGroupAssignment = (groupName: string) => {
    const next = assignedGroups.includes(groupName)
      ? assignedGroups.filter((g) => g !== groupName)
      : [...assignedGroups, groupName];
    onSetTableGroups(table.id, next);
  };

  const outgoing = schema.refs.filter((r) => r.fromTable === table.id);
  const incoming = schema.refs.filter((r) => r.toTable === table.id);

  return (
    <aside className="w-[300px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full z-10">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-400">
            Table Inspector
          </div>
          <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
            {table.id}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onJumpToCode(table.line)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>View DBML</span>
          </button>
          <button
            type="button"
            onClick={() => onAddLinkedStickyNote(table.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/40 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/50"
          >
            <StickyNoteIcon className="w-3.5 h-3.5" />
            <span>Attach Note</span>
          </button>
        </div>

        {/* Business Domain Multi-Assignment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Business Domains</span>
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {assignedGroups.length === 0
                ? 'Ungrouped'
                : `${assignedGroups.length} assigned`}
            </span>
          </div>
          {schema.tableGroups.length === 0 ? (
            <p className="text-xs text-slate-400">
              No business domains defined yet.
            </p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
              {schema.tableGroups.map((g) => {
                const checked = assignedGroups.includes(g.name);
                return (
                  <label
                    key={g.name}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                      checked
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGroupAssignment(g.name)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span
                      className="w-2 h-2 rounded-xs shrink-0"
                      style={{ backgroundColor: g.color || '#2563EB' }}
                    />
                    <span className="truncate flex-1">{g.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-400">
            Tables can belong to multiple domains when shared across business flows.
          </p>
        </div>

        {/* Header Color */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Header Color
            </span>
            {table.headerColor && (
              <button
                type="button"
                onClick={() => onChangeTableHeaderColor(table.id, null)}
                className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => onChangeTableHeaderColor(table.id, sw)}
                style={{ backgroundColor: sw }}
                className={`h-6 rounded border border-black/15 ${
                  table.headerColor?.toLowerCase() === sw
                    ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900'
                    : ''
                }`}
                title={sw}
              />
            ))}
          </div>
        </div>

        {/* Note */}
        {table.note && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Table Documentation
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              {table.note}
            </p>
          </div>
        )}

        {/* Columns */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Columns
            </span>
            <span className="text-slate-400 tabular-nums">
              {table.columns.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            {table.columns.map((c) => (
              <div key={c.name} className="px-2.5 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1 truncate">
                    {c.pk && <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />}
                    {c.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {c.type}
                  </span>
                </div>
                {(c.defaultValue || c.note || c.unique || c.notNull) && (
                  <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-2">
                    {c.notNull && !c.pk && <span>not null</span>}
                    {c.unique && <span>unique</span>}
                    {c.defaultValue && <span>default: {c.defaultValue}</span>}
                    {c.note && <span className="text-slate-500">{c.note}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Relationships */}
        {(outgoing.length > 0 || incoming.length > 0) && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Relationships</span>
            </div>
            <div className="space-y-1.5">
              {outgoing.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectTable(r.toTable)}
                  className="w-full text-left p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[11px] font-mono flex items-center justify-between gap-2"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {r.fromColumns.join(',')} <ArrowRight className="w-3 h-3 inline text-blue-500" /> {r.toTable}.{r.toColumns.join(',')}
                  </span>
                </button>
              ))}
              {incoming.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectTable(r.fromTable)}
                  className="w-full text-left p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[11px] font-mono flex items-center justify-between gap-2"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {r.fromTable}.{r.fromColumns.join(',')} <ArrowRight className="w-3 h-3 inline text-emerald-500" /> {r.toColumns.join(',')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
