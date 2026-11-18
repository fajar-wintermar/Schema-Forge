import React from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { PaginationBar } from '../components/PaginationBar';
import { trimNotePreview } from '../noteUtils';
import type { DocsNoteEntry, DocsSection, NoteCategory } from '../types';

const NOTE_CATEGORIES: Array<{ id: NoteCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'Project' },
  { id: 'group', label: 'Table Groups' },
  { id: 'standalone', label: 'Note Blocks' },
  { id: 'table', label: 'Tables' },
  { id: 'column', label: 'Columns' },
  { id: 'enum', label: 'Enums' },
  { id: 'sticky', label: 'Sticky Notes' },
];

export interface AllNotesPageProps {
  totalAllNotes: number;
  filteredNotes: DocsNoteEntry[];
  pagedNotes: DocsNoteEntry[];
  noteCategoryCounts: Record<NoteCategory, number>;
  notesSearch: string;
  noteCategory: NoteCategory;
  notesPage: number;
  notesPageSize: number;
  navOpen: boolean;
  modKey: string;
  onToggleNav: () => void;
  onSetNotesSearch: (q: string) => void;
  onSetNoteCategory: (cat: NoteCategory) => void;
  onSetNotesPage: (p: number) => void;
  onSetNotesPageSize: (s: number) => void;
  onNavigateSection: (sec: DocsSection) => void;
}

export const AllNotesPage: React.FC<AllNotesPageProps> = ({
  totalAllNotes,
  filteredNotes,
  pagedNotes,
  noteCategoryCounts,
  notesSearch,
  noteCategory,
  notesPage,
  notesPageSize,
  navOpen,
  modKey,
  onToggleNav,
  onSetNotesSearch,
  onSetNoteCategory,
  onSetNotesPage,
  onSetNotesPageSize,
  onNavigateSection,
}) => (
  <div className="w-full px-6 lg:px-10 py-6 space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
      <div className="space-y-1">
        <DocsBreadcrumb
          navOpen={navOpen}
          modKey={modKey}
          onToggleNav={onToggleNav}
          onBackClick={() => onNavigateSection({ kind: 'overview' })}
          segments={[{ label: 'All Notes', isCurrent: true }]}
        />
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
          All Schema &amp; Documentation Notes ({filteredNotes.length})
        </h1>
      </div>

      <div className="relative w-full sm:w-72 shrink-0">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={notesSearch}
          onChange={(e) => onSetNotesSearch(e.target.value)}
          placeholder="Search all notes..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {NOTE_CATEGORIES.filter(
        (cat) => cat.id === 'all' || noteCategoryCounts[cat.id] > 0
      ).map((cat) => {
        const active = noteCategory === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSetNoteCategory(cat.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              active
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>{cat.label}</span>
            <span
              className={`text-[10px] tabular-nums ${
                active ? 'text-blue-100' : 'text-slate-400'
              }`}
            >
              {noteCategoryCounts[cat.id]}
            </span>
          </button>
        );
      })}
    </div>

    {filteredNotes.length === 0 ? (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400 space-y-1.5">
        <div>
          {totalAllNotes === 0
            ? 'No notes found in this schema yet.'
            : `No notes matching "${notesSearch}"`}
        </div>
        {totalAllNotes === 0 && (
          <div>
            Add <code className="font-mono">Note: &apos;...&apos;</code> to Project,
            TableGroup, Table, Column, or standalone{' '}
            <code className="font-mono">Note</code> blocks in DBML.
          </div>
        )}
      </div>
    ) : (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {pagedNotes.map((entry) => {
            const { preview, words } = trimNotePreview(entry.content, 200);
            return (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onNavigateSection({ kind: 'noteDetail', entryId: entry.id })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigateSection({ kind: 'noteDetail', entryId: entry.id });
                  }
                }}
                className="cursor-pointer px-5 py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                      {entry.categoryLabel}
                    </span>
                    {entry.accentColor && (
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: entry.accentColor }}
                      />
                    )}
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                      {entry.title}
                    </span>
                    {entry.subtitle && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        · {entry.subtitle}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] shrink-0">
                    <span className="text-slate-400 tabular-nums">
                      {words} {words === 1 ? 'word' : 'words'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                      <span>Open Note</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed max-w-4xl">
                  {preview}
                </p>
              </div>
            );
          })}
        </div>

        <PaginationBar
          page={notesPage}
          pageSize={notesPageSize}
          totalItems={filteredNotes.length}
          itemLabel="notes"
          onPageChange={onSetNotesPage}
          onPageSizeChange={onSetNotesPageSize}
        />
      </div>
    )}
  </div>
);
