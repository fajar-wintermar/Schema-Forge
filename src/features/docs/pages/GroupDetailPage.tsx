import React from 'react';
import { StickyNote, TableDef, TableGroupDef } from '../../../types/schema';
import { stripMarkdownToPlainText } from '../../../components/MarkdownContent';
import { DocsBreadcrumb } from '../components/DocsBreadcrumb';
import { ReadmeNoteCard } from '../components/ReadmeNoteCard';
import { TrimmableNote } from '../components/TrimmableNote';
import type { DocsSection } from '../types';

export interface GroupDetailPageProps {
  activeGroup: TableGroupDef;
  stickyNotes: StickyNote[];
  tableMap: Map<string, TableDef>;
  navOpen: boolean;
  modKey: string;
  mainPaneRef: React.RefObject<HTMLDivElement | null>;
  onToggleNav: () => void;
  onNavigateSection: (sec: DocsSection) => void;
  onOpenTableDetail: (tableId: string) => void;
}

export const GroupDetailPage: React.FC<GroupDetailPageProps> = ({
  activeGroup,
  stickyNotes,
  tableMap,
  navOpen,
  modKey,
  mainPaneRef,
  onToggleNav,
  onNavigateSection,
  onOpenTableDetail,
}) => (
  <div className="w-full px-6 lg:px-10 py-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
      <DocsBreadcrumb
        navOpen={navOpen}
        modKey={modKey}
        onToggleNav={onToggleNav}
        onBackClick={() => onNavigateSection({ kind: 'overview' })}
        segments={[
          { label: 'Business Domain' },
          { label: activeGroup.name, isCurrent: true },
        ]}
      />
    </div>

    <div className="flex items-center gap-3">
      <span
        className="w-3.5 h-3.5 rounded-xs shrink-0"
        style={{ backgroundColor: activeGroup.color || '#2563EB' }}
      />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        {activeGroup.name}
      </h1>
      <span className="text-xs text-slate-400 tabular-nums">
        ({activeGroup.tables.length} tables)
      </span>
    </div>

    {activeGroup.note ? (
      <ReadmeNoteCard
        key={`group-readme-${activeGroup.name}`}
        title="TableGroup Documentation"
        subtitle={activeGroup.name}
        content={activeGroup.note}
        accentColor={activeGroup.color || '#2563EB'}
        defaultExpanded
        scrollContainerRef={mainPaneRef}
      />
    ) : (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-5 py-4 text-xs text-slate-400">
        No TableGroup note defined yet. Add{' '}
        <code className="font-mono">Note: &apos;...&apos;</code> inside{' '}
        <code className="font-mono">TableGroup &quot;{activeGroup.name}&quot;</code>{' '}
        to document this domain.
      </div>
    )}

    {stickyNotes
      .filter((sn) => sn.linkedTarget === `group:${activeGroup.name}`)
      .map((sn) => (
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
              key={`grp-sn-${sn.id}`}
              content={sn.content}
              compact
              maxChars={180}
              defaultExpanded={false}
            />
          )}
        </div>
      ))}

    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Tables in {activeGroup.name} ({activeGroup.tables.length})
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {activeGroup.tables.map((tId) => {
          const tbl = tableMap.get(tId);
          if (!tbl) return null;
          return (
            <button
              key={tId}
              type="button"
              onClick={() => onOpenTableDetail(tbl.id)}
              className="w-full px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: tbl.headerColor || '#0f172a' }}
                  />
                  <span>{tbl.id}</span>
                </div>
                {tbl.note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {stripMarkdownToPlainText(tbl.note)}
                  </p>
                )}
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium shrink-0">
                {tbl.columns.length} cols →
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
