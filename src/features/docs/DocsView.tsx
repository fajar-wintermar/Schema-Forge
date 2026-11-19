import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { DocsSidebar } from './components/DocsSidebar';
import { buildAllNoteEntries, matchesTableQuery } from './noteUtils';
import { AllNotesPage } from './pages/AllNotesPage';
import { EnumsPage } from './pages/EnumsPage';
import { GroupDetailPage } from './pages/GroupDetailPage';
import { NoteDetailPage, StandaloneNotePage } from './pages/NoteDetailPage';
import { OverviewPage } from './pages/OverviewPage';
import { RelationshipsPage } from './pages/RelationshipsPage';
import { TableDetailPage } from './pages/TableDetailPage';
import { TableGroupsPage } from './pages/TableGroupsPage';
import {
  CARDINALITY_META,
  DocsSection,
  DocsViewProps,
  NoteCategory,
  TreeFilterMode,
} from './types';

export type { DocsViewProps } from './types';

export const DocsView: React.FC<DocsViewProps> = ({
  schema,
  stickyNotes = [],
  navOpen,
  onToggleNav,
  modKey = '⌘',
  selectedDomains = [],
  onClearDomainFilter,
  onSelectTable,
}) => {
  const [search, setSearch] = useState('');
  const [navSearch, setNavSearch] = useState('');
  const [treeMode, setTreeMode] = useState<TreeFilterMode>('all');
  const [sortAZ, setSortAZ] = useState(true);
  const [section, setSection] = useState<DocsSection>({ kind: 'overview' });
  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [expandedTreeTables, setExpandedTreeTables] = useState<Record<string, boolean>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainPaneRef = useRef<HTMLDivElement | null>(null);

  // Pagination & search states
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewPageSize, setOverviewPageSize] = useState(20);
  const [relPage, setRelPage] = useState(1);
  const [relPageSize, setRelPageSize] = useState(25);
  const [relSearch, setRelSearch] = useState('');
  const [enumSearch, setEnumSearch] = useState('');
  const [enumPage, setEnumPage] = useState(1);
  const [enumPageSize, setEnumPageSize] = useState(20);
  const [notesSearch, setNotesSearch] = useState('');
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('all');
  const [notesPage, setNotesPage] = useState(1);
  const [notesPageSize, setNotesPageSize] = useState(20);
  const [groupsSearch, setGroupsSearch] = useState('');
  const [groupsPage, setGroupsPage] = useState(1);
  const [groupsPageSize, setGroupsPageSize] = useState(10);

  // Reset to overview if active table, note, or group no longer exists after workspace switch
  useEffect(() => {
    if (
      section.kind === 'table' &&
      !schema.tables.some((t) => t.id === section.tableId)
    ) {
      setSection({ kind: 'overview' });
    } else if (
      section.kind === 'note' &&
      !schema.notes.some((n) => n.id === section.noteId)
    ) {
      setSection({ kind: 'overview' });
    } else if (
      section.kind === 'group' &&
      !schema.tableGroups.some((g) => g.name === section.groupName)
    ) {
      setSection({ kind: 'overview' });
    }
  }, [schema.tables, schema.notes, schema.tableGroups, section]);

  // Reset pagination when filters change
  useEffect(() => {
    setOverviewPage(1);
  }, [search, selectedDomains, overviewPageSize, schema.tables.length]);

  useEffect(() => {
    setRelPage(1);
  }, [relSearch, selectedDomains, relPageSize, schema.refs.length]);

  useEffect(() => {
    setEnumPage(1);
  }, [enumSearch, enumPageSize, schema.enums.length]);

  useEffect(() => {
    setGroupsPage(1);
  }, [groupsSearch, groupsPageSize, schema.tableGroups.length, selectedDomains]);

  useEffect(() => {
    setNotesPage(1);
  }, [
    notesSearch,
    noteCategory,
    notesPageSize,
    schema.notes.length,
    schema.tables.length,
    schema.tableGroups.length,
    schema.enums.length,
    stickyNotes.length,
  ]);

  const fkLookup = useMemo(() => {
    const map = new Map<
      string,
      { targetTable: string; targetCol: string; label: string }
    >();
    for (const r of schema.refs) {
      r.fromColumns.forEach((col, i) => {
        const targetCol = r.toColumns[i] || r.toColumns[0] || 'id';
        map.set(`${r.fromTable}.${col}`, {
          targetTable: r.toTable,
          targetCol,
          label: `${r.toTable}.${targetCol}`,
        });
      });
    }
    return map;
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

  const enumUsageMap = useMemo(() => {
    const map = new Map<string, Array<{ tableId: string; columnName: string }>>();
    for (const en of schema.enums) {
      map.set(en.id.toLowerCase(), []);
      map.set(en.name.toLowerCase(), []);
    }
    for (const t of schema.tables) {
      for (const c of t.columns) {
        const cleanType = c.type.replace(/\[\]$/, '').trim().toLowerCase();
        const hit = map.get(cleanType);
        if (hit) hit.push({ tableId: t.id, columnName: c.name });
      }
    }
    return map;
  }, [schema.enums, schema.tables]);

  const ungroupedTables = useMemo(
    () => schema.tables.filter((t) => !groupedSet.has(t.id)),
    [schema.tables, groupedSet]
  );

  const isFilteringDomains = selectedDomains.length > 0;
  const visibleGroups = useMemo(
    () =>
      schema.tableGroups.filter(
        (g) => !isFilteringDomains || selectedDomains.includes(g.name)
      ),
    [schema.tableGroups, isFilteringDomains, selectedDomains]
  );

  const visibleGroupTableSet = useMemo(() => {
    const s = new Set<string>();
    for (const g of visibleGroups) {
      for (const t of g.tables) s.add(t);
    }
    return s;
  }, [visibleGroups]);

  const orderedAllTables = useMemo(() => {
    const base = isFilteringDomains
      ? schema.tables.filter((t) => visibleGroupTableSet.has(t.id))
      : schema.tables;
    if (!sortAZ) return base;
    return [...base].sort((a, b) => a.id.localeCompare(b.id));
  }, [schema.tables, isFilteringDomains, visibleGroupTableSet, sortAZ]);

  const q = search.trim().toLowerCase();
  const nq = navSearch.trim().toLowerCase();

  const matchesSearch = (table: typeof schema.tables[number], queryStr: string) =>
    matchesTableQuery(table, queryStr, domainsByTable);

  const overviewTables = useMemo(
    () => orderedAllTables.filter((t) => matchesTableQuery(t, q, domainsByTable)),
    [orderedAllTables, q, domainsByTable]
  );

  const overviewTotalPages = Math.max(
    1,
    Math.ceil(overviewTables.length / overviewPageSize)
  );
  const safeOverviewPage = Math.min(overviewPage, overviewTotalPages);
  const pagedOverviewTables = useMemo(() => {
    const start = (safeOverviewPage - 1) * overviewPageSize;
    return overviewTables.slice(start, start + overviewPageSize);
  }, [overviewTables, safeOverviewPage, overviewPageSize]);

  const treeFlatTables = useMemo(
    () => orderedAllTables.filter((t) => matchesTableQuery(t, nq, domainsByTable)),
    [orderedAllTables, nq, domainsByTable]
  );

  const filteredRefs = useMemo(() => {
    const rq = relSearch.trim().toLowerCase();
    return schema.refs.filter((r) => {
      if (
        isFilteringDomains &&
        !(
          visibleGroupTableSet.has(r.fromTable) &&
          visibleGroupTableSet.has(r.toTable)
        )
      ) {
        return false;
      }
      if (!rq) return true;
      const meta = CARDINALITY_META[r.relation];
      return (
        r.fromTable.toLowerCase().includes(rq) ||
        r.toTable.toLowerCase().includes(rq) ||
        r.fromColumns.some((c) => c.toLowerCase().includes(rq)) ||
        r.toColumns.some((c) => c.toLowerCase().includes(rq)) ||
        meta.title.toLowerCase().includes(rq) ||
        meta.ratio.toLowerCase().includes(rq)
      );
    });
  }, [schema.refs, isFilteringDomains, visibleGroupTableSet, relSearch]);

  const relTotalPages = Math.max(1, Math.ceil(filteredRefs.length / relPageSize));
  const safeRelPage = Math.min(relPage, relTotalPages);
  const pagedRefs = useMemo(() => {
    const start = (safeRelPage - 1) * relPageSize;
    return filteredRefs.slice(start, start + relPageSize);
  }, [filteredRefs, safeRelPage, relPageSize]);

  const filteredEnums = useMemo(() => {
    const eq = enumSearch.trim().toLowerCase();
    if (!eq) return schema.enums;
    return schema.enums.filter(
      (en) =>
        en.id.toLowerCase().includes(eq) ||
        en.values.some(
          (v) =>
            v.name.toLowerCase().includes(eq) ||
            v.note?.toLowerCase().includes(eq)
        )
    );
  }, [schema.enums, enumSearch]);

  const enumTotalPages = Math.max(
    1,
    Math.ceil(filteredEnums.length / enumPageSize)
  );
  const safeEnumPage = Math.min(enumPage, enumTotalPages);
  const pagedEnums = useMemo(() => {
    const start = (safeEnumPage - 1) * enumPageSize;
    return filteredEnums.slice(start, start + enumPageSize);
  }, [filteredEnums, safeEnumPage, enumPageSize]);

  const totalFieldsCount = useMemo(
    () => schema.tables.reduce((acc, t) => acc + t.columns.length, 0),
    [schema.tables]
  );

  const allNoteEntries = useMemo(
    () => buildAllNoteEntries(schema, domainsByTable, stickyNotes),
    [schema, domainsByTable, stickyNotes]
  );

  const noteCategoryCounts = useMemo(() => {
    const counts: Record<NoteCategory, number> = {
      all: allNoteEntries.length,
      project: 0,
      group: 0,
      standalone: 0,
      table: 0,
      column: 0,
      enum: 0,
      sticky: 0,
    };
    for (const e of allNoteEntries) counts[e.category]++;
    return counts;
  }, [allNoteEntries]);

  const filteredNoteEntries = useMemo(() => {
    const nqStr = notesSearch.trim().toLowerCase();
    return allNoteEntries.filter((entry) => {
      if (noteCategory !== 'all' && entry.category !== noteCategory) return false;
      if (!nqStr) return true;
      return (
        entry.title.toLowerCase().includes(nqStr) ||
        (entry.subtitle || '').toLowerCase().includes(nqStr) ||
        entry.content.toLowerCase().includes(nqStr) ||
        entry.categoryLabel.toLowerCase().includes(nqStr)
      );
    });
  }, [allNoteEntries, noteCategory, notesSearch]);

  const notesTotalPages = Math.max(
    1,
    Math.ceil(filteredNoteEntries.length / notesPageSize)
  );
  const safeNotesPage = Math.min(notesPage, notesTotalPages);
  const pagedNoteEntries = useMemo(() => {
    const start = (safeNotesPage - 1) * notesPageSize;
    return filteredNoteEntries.slice(start, start + notesPageSize);
  }, [filteredNoteEntries, safeNotesPage, notesPageSize]);

  const filteredTableGroups = useMemo(() => {
    const gq = groupsSearch.trim().toLowerCase();
    if (!gq) return visibleGroups;
    return visibleGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(gq) ||
        (g.note || '').toLowerCase().includes(gq) ||
        g.tables.some((t) => t.toLowerCase().includes(gq))
    );
  }, [visibleGroups, groupsSearch]);

  const groupsTotalPages = Math.max(
    1,
    Math.ceil(filteredTableGroups.length / groupsPageSize)
  );
  const safeGroupsPage = Math.min(groupsPage, groupsTotalPages);
  const pagedTableGroups = useMemo(() => {
    const start = (safeGroupsPage - 1) * groupsPageSize;
    return filteredTableGroups.slice(start, start + groupsPageSize);
  }, [filteredTableGroups, safeGroupsPage, groupsPageSize]);

  const activeTableId = section.kind === 'table' ? section.tableId : null;
  const activeTable = activeTableId ? tableMap.get(activeTableId) || null : null;
  const activeNote =
    section.kind === 'note'
      ? schema.notes.find((n) => n.id === section.noteId) || null
      : null;
  const activeNoteEntry =
    section.kind === 'noteDetail'
      ? allNoteEntries.find((e) => e.id === section.entryId) || null
      : null;
  const activeGroup =
    section.kind === 'group'
      ? schema.tableGroups.find((g) => g.name === section.groupName) || null
      : null;

  useEffect(() => {
    if (section.kind === 'noteDetail' && !activeNoteEntry) {
      setSection({ kind: 'notes' });
    }
  }, [section, activeNoteEntry]);

  const updateScrollTopVisibility = useCallback(() => {
    const pane = mainPaneRef.current;
    setShowScrollTop(Boolean(pane && pane.scrollTop > 160));
  }, []);

  useEffect(() => {
    const pane = mainPaneRef.current;
    if (!pane) return;
    const handleScroll = () => updateScrollTopVisibility();
    pane.addEventListener('scroll', handleScroll, { passive: true });
    updateScrollTopVisibility();
    return () => {
      pane.removeEventListener('scroll', handleScroll);
    };
  }, [updateScrollTopVisibility, section]);

  const handleScrollToTop = () => {
    mainPaneRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateSection = (next: DocsSection) => {
    setSection(next);
    mainPaneRef.current?.scrollTo({ top: 0 });
  };

  const openTableDetail = (tableId: string) => {
    navigateSection({ kind: 'table', tableId });
  };

  const activeTableIndex = activeTable
    ? orderedAllTables.findIndex((t) => t.id === activeTable.id)
    : -1;
  const prevTable =
    activeTableIndex > 0 ? orderedAllTables[activeTableIndex - 1] : null;
  const nextTable =
    activeTableIndex >= 0 && activeTableIndex < orderedAllTables.length - 1
      ? orderedAllTables[activeTableIndex + 1]
      : null;

  return (
    <div className="flex-1 w-full h-full flex min-w-0 min-h-0 bg-slate-50 dark:bg-slate-950 relative">
      {navOpen && (
        <DocsSidebar
          schema={schema}
          section={section}
          activeTableId={activeTableId}
          orderedAllTables={orderedAllTables}
          treeFlatTables={treeFlatTables}
          visibleGroups={visibleGroups}
          ungroupedTables={ungroupedTables}
          tableMap={tableMap}
          fkLookup={fkLookup}
          allNotesCount={allNoteEntries.length}
          isFilteringDomains={isFilteringDomains}
          navSearch={navSearch}
          nq={nq}
          treeMode={treeMode}
          sortAZ={sortAZ}
          expandedDomains={expandedDomains}
          expandedTreeTables={expandedTreeTables}
          matchesSearch={matchesSearch}
          onSetNavSearch={setNavSearch}
          onSetTreeMode={setTreeMode}
          onToggleSortAZ={() => setSortAZ((s) => !s)}
          onToggleDomainExpand={(domainName) =>
            setExpandedDomains((prev) => ({
              ...prev,
              [domainName]:
                prev[domainName] === false ? true : !(prev[domainName] ?? true),
            }))
          }
          onToggleTreeTableExpand={(key) =>
            setExpandedTreeTables((prev) => ({ ...prev, [key]: !prev[key] }))
          }
          onNavigateSection={navigateSection}
          onOpenTableDetail={openTableDetail}
        />
      )}

      <button
        type="button"
        onClick={onToggleNav}
        title={
          navOpen
            ? `Hide Docs navigation (${modKey}J)`
            : `Show Docs navigation (${modKey}J)`
        }
        aria-label={navOpen ? 'Hide Docs navigation' : 'Show Docs navigation'}
        style={{ left: navOpen ? '260px' : '4px' }}
        className="absolute top-1/2 -translate-y-1/2 z-20 w-5 h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 shadow-sm flex items-center justify-center transition-colors"
      >
        {navOpen ? (
          <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      <div ref={mainPaneRef} className="flex-1 h-full overflow-y-auto min-w-0">
        {section.kind === 'table' && activeTable && (
          <TableDetailPage
            schema={schema}
            activeTable={activeTable}
            stickyNotes={stickyNotes}
            navOpen={navOpen}
            modKey={modKey}
            domainsByTable={domainsByTable}
            fkLookup={fkLookup}
            prevTable={prevTable}
            nextTable={nextTable}
            mainPaneRef={mainPaneRef}
            onToggleNav={onToggleNav}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
            onSelectTableInDiagram={onSelectTable}
          />
        )}

        {section.kind === 'note' && activeNote && (
          <StandaloneNotePage
            activeNote={activeNote}
            navOpen={navOpen}
            modKey={modKey}
            mainPaneRef={mainPaneRef}
            onToggleNav={onToggleNav}
            onNavigateSection={navigateSection}
          />
        )}

        {section.kind === 'noteDetail' && activeNoteEntry && (
          <NoteDetailPage
            activeNoteEntry={activeNoteEntry}
            allNoteEntries={allNoteEntries}
            filteredNoteEntries={filteredNoteEntries}
            navOpen={navOpen}
            modKey={modKey}
            mainPaneRef={mainPaneRef}
            onToggleNav={onToggleNav}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}

        {section.kind === 'group' && activeGroup && (
          <GroupDetailPage
            activeGroup={activeGroup}
            stickyNotes={stickyNotes}
            tableMap={tableMap}
            navOpen={navOpen}
            modKey={modKey}
            mainPaneRef={mainPaneRef}
            onToggleNav={onToggleNav}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}

        {section.kind === 'enums' && (
          <EnumsPage
            totalEnums={schema.enums.length}
            filteredEnums={filteredEnums}
            pagedEnums={pagedEnums}
            enumUsageMap={enumUsageMap}
            enumSearch={enumSearch}
            enumPage={safeEnumPage}
            enumPageSize={enumPageSize}
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onSetEnumSearch={setEnumSearch}
            onSetEnumPage={setEnumPage}
            onSetEnumPageSize={setEnumPageSize}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}

        {section.kind === 'relationships' && (
          <RelationshipsPage
            filteredRefs={filteredRefs}
            pagedRefs={pagedRefs}
            relSearch={relSearch}
            relPage={safeRelPage}
            relPageSize={relPageSize}
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onSetRelSearch={setRelSearch}
            onSetRelPage={setRelPage}
            onSetRelPageSize={setRelPageSize}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}

        {section.kind === 'groups' && (
          <TableGroupsPage
            totalSchemaGroups={schema.tableGroups.length}
            filteredGroups={filteredTableGroups}
            pagedGroups={pagedTableGroups}
            groupsSearch={groupsSearch}
            groupsPage={safeGroupsPage}
            groupsPageSize={groupsPageSize}
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onSetGroupsSearch={setGroupsSearch}
            onSetGroupsPage={setGroupsPage}
            onSetGroupsPageSize={setGroupsPageSize}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}

        {section.kind === 'notes' && (
          <AllNotesPage
            totalAllNotes={allNoteEntries.length}
            filteredNotes={filteredNoteEntries}
            pagedNotes={pagedNoteEntries}
            noteCategoryCounts={noteCategoryCounts}
            notesSearch={notesSearch}
            noteCategory={noteCategory}
            notesPage={safeNotesPage}
            notesPageSize={notesPageSize}
            navOpen={navOpen}
            modKey={modKey}
            onToggleNav={onToggleNav}
            onSetNotesSearch={setNotesSearch}
            onSetNoteCategory={setNoteCategory}
            onSetNotesPage={setNotesPage}
            onSetNotesPageSize={setNotesPageSize}
            onNavigateSection={navigateSection}
          />
        )}

        {section.kind === 'overview' && (
          <OverviewPage
            schema={schema}
            navOpen={navOpen}
            modKey={modKey}
            search={search}
            totalFieldsCount={totalFieldsCount}
            allNotesCount={allNoteEntries.length}
            visibleGroups={visibleGroups}
            overviewTables={overviewTables}
            pagedOverviewTables={pagedOverviewTables}
            overviewPage={safeOverviewPage}
            overviewPageSize={overviewPageSize}
            domainsByTable={domainsByTable}
            isFilteringDomains={isFilteringDomains}
            selectedDomains={selectedDomains}
            mainPaneRef={mainPaneRef}
            onToggleNav={onToggleNav}
            onSetSearch={setSearch}
            onSetOverviewPage={setOverviewPage}
            onSetOverviewPageSize={setOverviewPageSize}
            onClearDomainFilter={onClearDomainFilter}
            onNavigateSection={navigateSection}
            onOpenTableDetail={openTableDetail}
          />
        )}
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={handleScrollToTop}
          title="Go to top"
          aria-label="Go to top"
          className="absolute bottom-5 right-6 z-20 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-600 shadow-lg shadow-slate-900/10 dark:shadow-black/40 transition-all"
        >
          <ArrowUp className="w-3.5 h-3.5" />
          <span></span>
        </button>
      )}
    </div>
  );
};
