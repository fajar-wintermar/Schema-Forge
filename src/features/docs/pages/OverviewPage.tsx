import React from 'react';
import {
  ArrowRight,
  Database,
  FileText,
  Layers,
  PanelLeft,
  Search,
  Table2,
} from 'lucide-react';
import {
  formatDomainLabel,
  ParsedSchema,
  StickyNote,
  TableDef,
  TableGroupDef,
  TablePosition,
} from '@shared/domain/schemaTypes';
import {
  isRichMarkdownNote,
  stripMarkdownToPlainText,
} from '../../markdown/markdownUtils';
import { DocsExportMenu } from '../components/DocsExportMenu';
import { PaginationBar } from '../components/PaginationBar';
import { ReadmeNoteCard } from '../components/ReadmeNoteCard';
import { TrimmableNote } from '../components/TrimmableNote';
import { trimNotePreview } from '../noteUtils';
import type { DocsSection } from '../types';

export interface OverviewPageProps {
  schema: ParsedSchema;
  stickyNotes: StickyNote[];
  projectName?: string;
  darkMode?: boolean;
  allowExport?: boolean;
  positions?: Record<string, TablePosition>;
  collapsedGroups?: string[];
  navOpen: boolean;
  modKey: string;
  search: string;
  totalFieldsCount: number;
  allNotesCount: number;
  visibleGroups: TableGroupDef[];
  overviewTables: TableDef[];
  pagedOverviewTables: TableDef[];
  overviewPage: number;
  overviewPageSize: number;
  domainsByTable: Map<string, string[]>;
  isFilteringDomains: boolean;
  selectedDomains: string[];
  mainPaneRef: React.RefObject<HTMLDivElement | null>;
  onToggleNav: () => void;
  onSetSearch: (q: string) => void;
  onSetOverviewPage: (p: number) => void;
  onSetOverviewPageSize: (s: number) => void;
  onClearDomainFilter?: () => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  schema,
  stickyNotes,
  projectName,
  darkMode,
  allowExport = true,
  positions,
  collapsedGroups,
  navOpen,
  modKey,
  search,
  totalFieldsCount,
  allNotesCount,
  visibleGroups,
  overviewTables,
  pagedOverviewTables,
  overviewPage,
  overviewPageSize,
  domainsByTable,
  isFilteringDomains,
  selectedDomains,
  mainPaneRef,
  onToggleNav,
  onSetSearch,
  onSetOverviewPage,
  onSetOverviewPageSize,
  onClearDomainFilter,
  onNavigateSection,
  onOpenTableDetail,
}) => (
  <div className="w-full px-6 lg:px-10 py-8 space-y-6">
    {/* Project Header */}
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
          {!navOpen && (
            <button
              type="button"
              onClick={onToggleNav}
              title={`Show Docs navigation (${modKey}J)`}
              className="p-1 mr-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <Database className="w-3.5 h-3.5" />
          <span>{schema.project.databaseType || 'Relational Schema'}</span>
          <span>·</span>
          <span className="tabular-nums">{schema.tables.length} Tables</span>
          <span>·</span>
          <span className="tabular-nums">{totalFieldsCount} Fields</span>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateSection({ kind: 'groups' })}
            className="tabular-nums hover:underline"
          >
            {schema.tableGroups.length} Table Groups
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateSection({ kind: 'enums' })}
            className="tabular-nums hover:underline"
          >
            {schema.enums.length} Enums
          </button>
          {schema.tablePartials.length > 0 && (
            <>
              <span>·</span>
              <button
                type="button"
                onClick={() => onNavigateSection({ kind: 'partials' })}
                className="tabular-nums hover:underline"
              >
                {schema.tablePartials.length} Partials
              </button>
            </>
          )}
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateSection({ kind: 'relationships' })}
            className="tabular-nums hover:underline"
          >
            {schema.refs.length} Relationships
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onNavigateSection({ kind: 'notes' })}
            className="tabular-nums hover:underline"
          >
            {allNotesCount} Notes
          </button>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          {schema.project.name || 'Database Schema Documentation'}
        </h1>
        {schema.project.note && !isRichMarkdownNote(schema.project.note) && (
          <div className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
            <TrimmableNote
              key={`ov-proj-short-${schema.project.name || 'default'}`}
              content={schema.project.note}
              compact
              maxChars={120}
              defaultExpanded={false}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto shrink-0">
        <div className="relative flex-1 md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSetSearch(e.target.value)}
            placeholder="Search tables, columns, notes..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        {allowExport && (
          <DocsExportMenu
            schema={schema}
            stickyNotes={stickyNotes}
            projectName={projectName}
            selectedDomains={selectedDomains}
            positions={positions}
            collapsedGroups={collapsedGroups}
            darkMode={darkMode}
          />
        )}
      </div>
    </div>

    {/* Project README Card */}
    {schema.project.note && isRichMarkdownNote(schema.project.note) && (
      <ReadmeNoteCard
        key={`ov-readme-${schema.project.name || 'default'}`}
        title="README"
        subtitle={schema.project.name || 'Project Documentation'}
        content={schema.project.note}
        defaultExpanded={false}
        scrollContainerRef={mainPaneRef}
      />
    )}

    {/* Standalone Project Notes Directory */}
    {schema.notes.length > 0 && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Documentation Notes ({schema.notes.length})</span>
          </span>
          <button
            type="button"
            onClick={() => onNavigateSection({ kind: 'notes' })}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            View all {allNotesCount} notes →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {schema.notes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onNavigateSection({ kind: 'note', noteId: n.id })}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left space-y-1.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {n.name}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {trimNotePreview(n.content, 160).preview}
              </p>
            </button>
          ))}
        </div>
      </div>
    )}

    {/* Business Domains / TableGroup Notes Strip */}
    {visibleGroups.length > 0 && (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <span className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Table Groups &amp; Domain Notes ({visibleGroups.length})</span>
          </span>
          <div className="flex items-center gap-3 font-medium">
            <button
              type="button"
              onClick={() => onNavigateSection({ kind: 'groups' })}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              View all TableGroup notes →
            </button>
            {allNotesCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigateSection({ kind: 'notes' })}
                className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
              >
                All Notes ({allNotesCount}) →
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleGroups.map((g) => (
            <div
              key={g.name}
              role="button"
              tabIndex={0}
              onClick={() =>
                onNavigateSection({ kind: 'group', groupName: g.name })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNavigateSection({ kind: 'group', groupName: g.name });
                }
              }}
              className="cursor-pointer p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left space-y-2 transition-colors flex flex-col justify-between"
            >
              <div className="space-y-1.5 w-full">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: g.color || '#2563EB' }}
                    />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {g.name}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                    {g.tables.length}t
                  </span>
                </div>
                {g.note ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    {trimNotePreview(g.note, 160).preview}
                  </p>
                ) : (
                  <p className="text-[11.5px] text-slate-400 italic">
                    No TableGroup note defined
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {isFilteringDomains && (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs">
        <span className="text-blue-900 dark:text-blue-100 font-medium">
          Showing tables in selected domain
          {selectedDomains.length > 1 ? 's' : ''}:{' '}
          {selectedDomains.map(formatDomainLabel).join(', ')}
        </span>
        {onClearDomainFilter && (
          <button
            type="button"
            onClick={onClearDomainFilter}
            className="font-semibold text-blue-600 dark:text-blue-300 hover:underline shrink-0"
          >
            Show All Tables
          </button>
        )}
      </div>
    )}

    {/* Thin Flat Paginated Table Directory */}
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
        <span>All Tables ({overviewTables.length})</span>
        <div className="flex items-center gap-3 text-[11px] font-normal text-slate-400">
          <span>Click any table to open full specification</span>
        </div>
      </div>

      {overviewTables.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">
          No tables matching &ldquo;{search}&rdquo;
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/60 dark:bg-slate-900">
                  <th className="py-2.5 px-5">Table Name</th>
                  <th className="py-2.5 px-4">Domains</th>
                  <th className="py-2.5 px-4">Table Notes</th>
                  <th className="py-2.5 px-4 text-right">Fields</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                {pagedOverviewTables.map((t) => {
                  const domains = domainsByTable.get(t.id) || [];
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpenTableDetail(t.id)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2.5">
                          <Table2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{
                              backgroundColor: t.headerColor || '#0f172a',
                            }}
                          />
                          <span className="hover:text-blue-600 dark:hover:text-blue-400">
                            {t.id}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {domains.length > 0 ? domains.join(', ') : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-md truncate">
                        {t.note ? (
                          stripMarkdownToPlainText(t.note)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {t.columns.length}
                      </td>
                      <td className="py-2.5 px-5 text-right whitespace-nowrap">
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          View →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={overviewPage}
            pageSize={overviewPageSize}
            totalItems={overviewTables.length}
            itemLabel="tables"
            onPageChange={onSetOverviewPage}
            onPageSizeChange={onSetOverviewPageSize}
          />
        </>
      )}
    </div>
  </div>
);
