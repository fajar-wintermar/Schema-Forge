import React from 'react';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { SchemaNoteDef } from '../../../types/schema';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { ReadmeNoteCard } from '../components/ReadmeNoteCard';
import type { DocsNoteEntry, DocsSection } from '../types';

export interface StandaloneNotePageProps {
  activeNote: SchemaNoteDef;
  navOpen: boolean;
  modKey: string;
  mainPaneRef: React.RefObject<HTMLDivElement | null>;
  onToggleNav: () => void;
  onNavigateSection: (sec: DocsSection) => void;
}

export const StandaloneNotePage: React.FC<StandaloneNotePageProps> = ({
  activeNote,
  navOpen,
  modKey,
  mainPaneRef,
  onToggleNav,
  onNavigateSection,
}) => (
  <div className="w-full px-6 lg:px-10 py-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
      <DocsBreadcrumb
        navOpen={navOpen}
        modKey={modKey}
        onToggleNav={onToggleNav}
        onBackClick={() => onNavigateSection({ kind: 'overview' })}
        segments={[
          { label: 'Project Notes' },
          { label: activeNote.name, isCurrent: true },
        ]}
      />
      {activeNote.line && (
        <span className="text-[11px] font-mono text-slate-400">
          DBML line {activeNote.line}
        </span>
      )}
    </div>

    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        {activeNote.name}
      </h1>
    </div>

    <ReadmeNoteCard
      key={`standalone-note-${activeNote.id}`}
      title="Documentation Note"
      subtitle={activeNote.name}
      content={activeNote.content}
      defaultExpanded
      scrollContainerRef={mainPaneRef}
    />
  </div>
);

export interface NoteDetailPageProps {
  activeNoteEntry: DocsNoteEntry;
  allNoteEntries: DocsNoteEntry[];
  filteredNoteEntries: DocsNoteEntry[];
  navOpen: boolean;
  modKey: string;
  mainPaneRef: React.RefObject<HTMLDivElement | null>;
  onToggleNav: () => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const NoteDetailPage: React.FC<NoteDetailPageProps> = ({
  activeNoteEntry,
  allNoteEntries,
  filteredNoteEntries,
  navOpen,
  modKey,
  mainPaneRef,
  onToggleNav,
  onNavigateSection,
  onOpenTableDetail,
}) => {
  const list = filteredNoteEntries.some((e) => e.id === activeNoteEntry.id)
    ? filteredNoteEntries
    : allNoteEntries;
  const idx = list.findIndex((e) => e.id === activeNoteEntry.id);
  const prevEntry = idx > 0 ? list[idx - 1] : null;
  const nextEntry = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  const target = activeNoteEntry.target;

  return (
    <div className="w-full px-6 lg:px-10 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DocsBreadcrumb
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onBackClick={() => onNavigateSection({ kind: 'notes' })}
            backLabel="All Notes"
            segments={[]}
          />
          <span className="text-slate-400">/</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {activeNoteEntry.categoryLabel}
          </span>
          <span className="text-slate-400">/</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
            {activeNoteEntry.title}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {activeNoteEntry.line && (
            <span className="text-[11px] font-mono text-slate-400">
              DBML line {activeNoteEntry.line}
            </span>
          )}
          {target && target.kind !== 'note' && (
            <button
              type="button"
              onClick={() => {
                if (target.kind === 'table') {
                  onOpenTableDetail(target.tableId);
                } else {
                  onNavigateSection(target);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>
                {target.kind === 'table'
                  ? `Open ${target.tableId}`
                  : target.kind === 'group'
                  ? `Open ${target.groupName}`
                  : target.kind === 'enums'
                  ? 'View Enums'
                  : 'Schema Overview'}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          {activeNoteEntry.accentColor && (
            <span
              className="w-3 h-3 rounded-xs shrink-0"
              style={{ backgroundColor: activeNoteEntry.accentColor }}
            />
          )}
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-mono">
            {activeNoteEntry.title}
          </h1>
        </div>
        {activeNoteEntry.subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeNoteEntry.subtitle}
          </p>
        )}
      </div>

      <ReadmeNoteCard
        key={`note-detail-${activeNoteEntry.id}`}
        title={activeNoteEntry.categoryLabel}
        subtitle={activeNoteEntry.title}
        content={activeNoteEntry.content}
        accentColor={activeNoteEntry.accentColor}
        defaultExpanded
        scrollContainerRef={mainPaneRef}
      />

      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
        {prevEntry ? (
          <button
            type="button"
            onClick={() =>
              onNavigateSection({ kind: 'noteDetail', entryId: prevEntry.id })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono max-w-[45%] truncate"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{prevEntry.title}</span>
          </button>
        ) : (
          <span />
        )}

        {nextEntry && (
          <button
            type="button"
            onClick={() =>
              onNavigateSection({ kind: 'noteDetail', entryId: nextEntry.id })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono max-w-[45%] truncate"
          >
            <span className="truncate">{nextEntry.title}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
};
