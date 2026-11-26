import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  ExternalLink,
  KeyRound,
  Link2,
  Plus,
} from 'lucide-react';
import { ParsedSchema, StickyNote, TableDef } from '@shared/domain/schemaTypes';
import { extractMetadataTags } from '../../../utils/metadataTags';
import { isRichMarkdownNote } from '../../markdown/markdownUtils';
import { CardinalityBadge } from '../components/CardinalityBadge';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { InlineNoteEditor } from '../components/InlineNoteEditor';
import { MetadataTagPills } from '../components/MetadataTagPills';
import { ReadmeNoteCard } from '../components/ReadmeNoteCard';
import { TrimmableNote } from '../components/TrimmableNote';
import type { DocsSection } from '../types';

export interface TableDetailPageProps {
  schema: ParsedSchema;
  activeTable: TableDef;
  stickyNotes: StickyNote[];
  navOpen: boolean;
  modKey: string;
  domainsByTable: Map<string, string[]>;
  fkLookup: Map<string, { targetTable: string; targetCol: string; label: string }>;
  prevTable: TableDef | null;
  nextTable: TableDef | null;
  mainPaneRef: React.RefObject<HTMLDivElement | null>;
  onToggleNav: () => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
  onSelectTableInDiagram: (tableId: string) => void;
  onUpdateTableNote?: (tableId: string, note: string) => void;
  onUpdateColumnNote?: (
    tableId: string,
    columnName: string,
    note: string
  ) => void;
}

export const TableDetailPage: React.FC<TableDetailPageProps> = ({
  schema,
  activeTable,
  stickyNotes,
  navOpen,
  modKey,
  domainsByTable,
  fkLookup,
  prevTable,
  nextTable,
  mainPaneRef,
  onToggleNav,
  onNavigateSection,
  onOpenTableDetail,
  onSelectTableInDiagram,
  onUpdateTableNote,
  onUpdateColumnNote,
}) => {
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);

  const isEditingTableNote =
    Boolean(onUpdateTableNote) && editingTableId === activeTable.id;

  const parentGroups = (domainsByTable.get(activeTable.id) || [])
    .map((dom) => schema.tableGroups.find((g) => g.name === dom))
    .filter((g): g is NonNullable<typeof g> => Boolean(g));
  const tableStickyNotes = stickyNotes.filter(
    (sn) => sn.linkedTarget === `table:${activeTable.id}`
  );
  const outgoing = schema.refs.filter((r) => r.fromTable === activeTable.id);
  const incoming = schema.refs.filter((r) => r.toTable === activeTable.id);
  const tableTags = extractMetadataTags(activeTable.note);

  return (
    <div className="w-full px-6 lg:px-10 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <DocsBreadcrumb
          navOpen={navOpen}
          modKey={modKey}
          onToggleNav={onToggleNav}
          onBackClick={() => onNavigateSection({ kind: 'overview' })}
          segments={[
            { label: schema.project.name || 'Schema' },
            { label: activeTable.id, mono: true, isCurrent: true },
          ]}
        />

        <button
          type="button"
          onClick={() => onSelectTableInDiagram(activeTable.id)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Open in Diagram</span>
        </button>
      </div>

      {parentGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Business Domains:</span>
          {parentGroups.map((grp) => (
            <button
              key={grp.name}
              type="button"
              onClick={() =>
                onNavigateSection({ kind: 'group', groupName: grp.name })
              }
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-blue-400"
            >
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: grp.color || '#2563EB' }}
              />
              <span>{grp.name}</span>
            </button>
          ))}
        </div>
      )}

      {tableStickyNotes.length > 0 && (
        <div className="space-y-2">
          {tableStickyNotes.map((sn) => (
            <div
              key={sn.id}
              className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 px-5 py-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                <span>{sn.title || 'Sticky Note'}</span>
                {sn.author && (
                  <span className="text-[11px] font-normal opacity-75">
                    {sn.author}
                  </span>
                )}
              </div>
              {sn.content && (
                <TrimmableNote
                  key={`tbl-sn-${sn.id}`}
                  content={sn.content}
                  compact
                  maxChars={180}
                  defaultExpanded={false}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {!isEditingTableNote && activeTable.note && isRichMarkdownNote(activeTable.note) && (
        <ReadmeNoteCard
          key={`tbl-readme-${activeTable.id}`}
          title="Table Documentation"
          subtitle={activeTable.id}
          content={activeTable.note}
          accentColor={activeTable.headerColor}
          defaultExpanded={false}
          scrollContainerRef={mainPaneRef}
        />
      )}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: activeTable.headerColor || '#0f172a' }}
            />
            <h1 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
              {activeTable.id}
            </h1>
            {activeTable.alias && (
              <span className="text-xs text-slate-400 font-mono">
                as {activeTable.alias}
              </span>
            )}
            <MetadataTagPills tags={tableTags} />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {activeTable.columns.length} columns · {activeTable.indexes.length}{' '}
              indexes
              {activeTable.checks.length > 0
                ? ` · ${activeTable.checks.length} checks`
                : ''}
            </span>
            {onUpdateTableNote && !isEditingTableNote && (
              <button
                type="button"
                onClick={() => setEditingTableId(activeTable.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {activeTable.note ? (
                  <>
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Note</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <span>Add Note</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {activeTable.appliedPartials && activeTable.appliedPartials.length > 0 && (
          <div className="px-5 py-2 bg-violet-50/50 dark:bg-violet-950/20 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Mixed-in Partials:
            </span>
            {activeTable.appliedPartials.map((partialName) => (
              <button
                key={partialName}
                type="button"
                onClick={() => onNavigateSection({ kind: 'partials' })}
                className="font-mono text-[11px] px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-300 hover:border-violet-400"
              >
                ~{partialName}
              </button>
            ))}
          </div>
        )}

        {isEditingTableNote && onUpdateTableNote ? (
          <div className="p-4 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800">
            <InlineNoteEditor
              key={`edit-table-${activeTable.id}`}
              initialValue={activeTable.note || ''}
              label={`Editing Table "${activeTable.id}" Note`}
              placeholder="Document table purpose, grain, ownership, or retention rules..."
              onSave={(nextNote) => {
                onUpdateTableNote(activeTable.id, nextNote);
                setEditingTableId(null);
              }}
              onCancel={() => setEditingTableId(null)}
            />
          </div>
        ) : (
          activeTable.note &&
          !isRichMarkdownNote(activeTable.note) && (
            <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
              <TrimmableNote
                key={`tbl-short-note-${activeTable.id}`}
                content={activeTable.note}
                compact
                maxChars={160}
                defaultExpanded={false}
              />
            </div>
          )
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900">
                <th className="py-2.5 px-5">Column</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Constraints</th>
                <th className="py-2.5 px-4">Default</th>
                <th className="py-2.5 px-5">Description &amp; Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
              {activeTable.columns.map((col) => {
                const fk = fkLookup.get(`${activeTable.id}.${col.name}`);
                const constraints: string[] = [];
                if (col.pk) constraints.push('PK');
                if (fk) constraints.push('FK');
                if (col.unique) constraints.push('UNIQUE');
                if (col.notNull && !col.pk) constraints.push('NOT NULL');
                if (col.increment) constraints.push('INCREMENT');
                if (col.check) constraints.push('CHECK');

                const colEditKey = `${activeTable.id}::${col.name}`;
                const isEditingColNote =
                  Boolean(onUpdateColumnNote) &&
                  !col.fromPartial &&
                  editingColumnKey === colEditKey;
                const colTags = extractMetadataTags(col.note);

                return (
                  <tr
                    key={col.name}
                    className="group hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-2.5 px-5 font-mono font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {col.pk && (
                          <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                        {col.name}
                        {col.fromPartial && (
                          <span
                            title={`Inherited from TablePartial ~${col.fromPartial}`}
                            className="text-[10px] font-normal text-violet-600 dark:text-violet-400"
                          >
                            ~{col.fromPartial}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {col.type}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {constraints.length > 0
                        ? constraints.join(' · ')
                        : 'nullable'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {col.defaultValue || '—'}
                    </td>
                    <td className="py-2.5 px-5 text-slate-600 dark:text-slate-300">
                      {isEditingColNote && onUpdateColumnNote ? (
                        <InlineNoteEditor
                          key={`edit-col-${colEditKey}`}
                          initialValue={col.note || ''}
                          compact
                          placeholder={`Document ${col.name}...`}
                          onSave={(nextNote) => {
                            onUpdateColumnNote(
                              activeTable.id,
                              col.name,
                              nextNote
                            );
                            setEditingColumnKey(null);
                          }}
                          onCancel={() => setEditingColumnKey(null)}
                        />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            {fk && (
                              <button
                                type="button"
                                onClick={() => onOpenTableDetail(fk.targetTable)}
                                className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline mr-2"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>{fk.label}</span>
                              </button>
                            )}
                            {col.check && (
                              <div className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300">
                                CHECK ({col.check})
                              </div>
                            )}
                            {colTags.length > 0 && (
                              <div>
                                <MetadataTagPills tags={colTags} />
                              </div>
                            )}
                            {col.note && (
                              <TrimmableNote
                                key={`col-note-${activeTable.id}-${col.name}`}
                                content={col.note}
                                compact
                                inlineShort
                                maxChars={120}
                                defaultExpanded={false}
                              />
                            )}
                            {!fk && !col.note && !col.check && (
                              <span className="text-slate-400">—</span>
                            )}
                          </div>

                          {onUpdateColumnNote && (
                            col.fromPartial ? (
                              <span
                                title={`Defined on TablePartial ~${col.fromPartial}`}
                                className="text-[10px] text-slate-400 italic shrink-0"
                              >
                                partial
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingColumnKey(colEditKey)}
                                title={
                                  col.note
                                    ? `Edit note for ${col.name}`
                                    : `Add note for ${col.name}`
                                }
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 opacity-70 group-hover:opacity-100 transition-opacity shrink-0"
                              >
                                {col.note ? (
                                  <>
                                    <Edit3 className="w-3 h-3" />
                                    <span className="sr-only sm:not-sr-only">
                                      Edit
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span className="sr-only sm:not-sr-only">
                                      Note
                                    </span>
                                  </>
                                )}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {activeTable.indexes.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Indexes ({activeTable.indexes.length})
            </div>
            <div className="space-y-1.5">
              {activeTable.indexes.map((idx, i) => {
                const items =
                  idx.items ||
                  idx.columns.map((c) => ({
                    value: c,
                    isExpression: c.startsWith('`') && c.endsWith('`'),
                  }));
                return (
                  <div
                    key={i}
                    className="text-xs font-mono text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2"
                  >
                    <span>
                      (
                      {items.map((it, itemIdx) => (
                        <React.Fragment key={itemIdx}>
                          {itemIdx > 0 && ', '}
                          <span
                            className={
                              it.isExpression
                                ? 'text-cyan-700 dark:text-cyan-300'
                                : ''
                            }
                          >
                            {it.isExpression ? `\`${it.value.replace(/^`|`$/g, '')}\`` : it.value}
                          </span>
                        </React.Fragment>
                      ))}
                      )
                    </span>
                    {idx.name && (
                      <span className="text-slate-400">· {idx.name}</span>
                    )}
                    {idx.type && (
                      <span className="text-sky-600 dark:text-sky-400">
                        · {idx.type}
                      </span>
                    )}
                    {idx.pk && (
                      <span className="text-amber-600 dark:text-amber-400">
                        · pk
                      </span>
                    )}
                    {idx.unique && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        · unique
                      </span>
                    )}
                    {idx.note && (
                      <span className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                        — {idx.note}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTable.checks.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Check Constraints ({activeTable.checks.length})
            </div>
            <div className="space-y-1.5">
              {activeTable.checks.map((chk, i) => (
                <div
                  key={i}
                  className="text-xs flex flex-wrap items-center gap-2"
                >
                  <code className="font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-50/70 dark:bg-cyan-950/30 px-1.5 py-0.5 rounded">
                    CHECK ({chk.expression})
                  </code>
                  {chk.name && (
                    <span className="font-mono text-[11px] text-slate-400">
                      · {chk.name}
                    </span>
                  )}
                  {chk.note && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      — {chk.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {(outgoing.length > 0 || incoming.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
              References ({outgoing.length})
            </div>
            {outgoing.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No outgoing foreign keys.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {outgoing.map((r) => (
                  <div
                    key={r.id}
                    className="px-4 py-2.5 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                        {r.fromColumns.join(', ')}
                      </span>
                      <CardinalityBadge relation={r.relation} />
                      <button
                        type="button"
                        onClick={() => onOpenTableDetail(r.toTable)}
                        className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold truncate"
                      >
                        {r.toTable}.{r.toColumns.join(', ')}
                      </button>
                    </div>
                    {(r.name || r.onDelete || r.onUpdate) && (
                      <div className="font-mono text-[10.5px] text-slate-400">
                        {[
                          r.name,
                          r.onDelete ? `on delete ${r.onDelete}` : null,
                          r.onUpdate ? `on update ${r.onUpdate}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Referenced By ({incoming.length})
            </div>
            {incoming.length === 0 ? (
              <div className="p-4 text-xs text-slate-400">
                No incoming foreign keys.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {incoming.map((r) => (
                  <div
                    key={r.id}
                    className="px-4 py-2.5 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenTableDetail(r.fromTable)}
                        className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold truncate"
                      >
                        {r.fromTable}.{r.fromColumns.join(', ')}
                      </button>
                      <CardinalityBadge relation={r.relation} />
                      <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                        {r.toColumns.join(', ')}
                      </span>
                    </div>
                    {(r.name || r.onDelete || r.onUpdate) && (
                      <div className="font-mono text-[10.5px] text-slate-400">
                        {[
                          r.name,
                          r.onDelete ? `on delete ${r.onDelete}` : null,
                          r.onUpdate ? `on update ${r.onUpdate}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
        {prevTable ? (
          <button
            type="button"
            onClick={() => onOpenTableDetail(prevTable.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{prevTable.id}</span>
          </button>
        ) : (
          <span />
        )}

        {nextTable && (
          <button
            type="button"
            onClick={() => onOpenTableDetail(nextTable.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono"
          >
            <span>{nextTable.id}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
