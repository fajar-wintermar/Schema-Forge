import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Database,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  PanelLeft,
  Search,
  Table2,
  X,
} from 'lucide-react';
import { ParsedSchema, RefRelation, TableDef } from '../types/schema';
import {
  MarkdownContent,
  extractMarkdownHeadings,
  isRichMarkdownNote,
  stripMarkdownToPlainText,
} from './MarkdownContent';

interface DocsViewProps {
  schema: ParsedSchema;
  navOpen: boolean;
  onToggleNav: () => void;
  modKey?: string;
  selectedDomains?: string[];
  onClearDomainFilter?: () => void;
  onSelectTable: (tableId: string) => void;
}

type TreeFilterMode = 'all' | 'domain';
type DocsSection =
  | { kind: 'overview' }
  | { kind: 'enums' }
  | { kind: 'relationships' }
  | { kind: 'note'; noteId: string }
  | { kind: 'group'; groupName: string }
  | { kind: 'table'; tableId: string };

const CARDINALITY_META: Record<
  RefRelation,
  { symbol: RefRelation; title: string; ratio: string; description: string; badgeCls: string }
> = {
  '>': {
    symbol: '>',
    title: 'Many-to-One',
    ratio: 'N : 1',
    description: 'Many rows in source reference one row in target',
    badgeCls:
      'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300',
  },
  '<': {
    symbol: '<',
    title: 'One-to-Many',
    ratio: '1 : N',
    description: 'One row in source referenced by many rows in target',
    badgeCls:
      'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  },
  '-': {
    symbol: '-',
    title: 'One-to-One',
    ratio: '1 : 1',
    description: 'Single row maps uniquely to a single row',
    badgeCls:
      'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300',
  },
  '<>': {
    symbol: '<>',
    title: 'Many-to-Many',
    ratio: 'N : M',
    description: 'Multiple rows on both sides are associated',
    badgeCls:
      'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
  },
};

function getPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push('ellipsis');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

interface ReadmeNoteCardProps {
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const ReadmeNoteCard: React.FC<ReadmeNoteCardProps> = ({
  title,
  subtitle,
  content,
  accentColor,
  scrollContainerRef,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const stats = useMemo(() => {
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const lines = content.split('\n').length;
    const readMins = Math.max(1, Math.round(words / 200));
    return { words, lines, readMins };
  }, [content]);

  const scrollToHeading = (id: string) => {
    const container = scrollContainerRef?.current;
    if (!container) return;
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    const target = container.querySelector(`#${escaped}`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {accentColor ? (
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: accentColor }}
            />
          ) : (
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </span>
          {subtitle && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
          <span className="tabular-nums hidden sm:inline">
            {stats.words} words · ~{stats.readMins} min read
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Expand</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {headings.length >= 2 && (
            <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Contents
              </span>
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => scrollToHeading(h.id)}
                  className={`text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
                    h.level === 1
                      ? 'font-semibold text-slate-700 dark:text-slate-200'
                      : h.level === 2
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="px-6 py-5 lg:px-8 lg:py-6">
            <div className="max-w-4xl">
              <MarkdownContent content={content} />
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export const DocsView: React.FC<DocsViewProps> = ({
  schema,
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
  const mainPaneRef = useRef<HTMLDivElement | null>(null);

  // Pagination states for Overview & Relationships
  const [overviewPage, setOverviewPage] = useState(1);
  const [overviewPageSize, setOverviewPageSize] = useState(20);
  const [relPage, setRelPage] = useState(1);
  const [relPageSize, setRelPageSize] = useState(25);
  const [relSearch, setRelSearch] = useState('');
  const [enumSearch, setEnumSearch] = useState('');

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

  const groupColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of schema.tableGroups) {
      map.set(g.name, g.color || '#2563EB');
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
        if (hit) {
          hit.push({ tableId: t.id, columnName: c.name });
        }
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

  const matchesSearch = (table: TableDef, queryStr: string) => {
    if (!queryStr) return true;
    if (table.id.toLowerCase().includes(queryStr)) return true;
    if (table.note?.toLowerCase().includes(queryStr)) return true;
    const domains = domainsByTable.get(table.id) || [];
    if (domains.some((d) => d.toLowerCase().includes(queryStr))) return true;
    return table.columns.some(
      (c) =>
        c.name.toLowerCase().includes(queryStr) ||
        c.type.toLowerCase().includes(queryStr) ||
        c.note?.toLowerCase().includes(queryStr)
    );
  };

  const overviewTables = useMemo(
    () => orderedAllTables.filter((t) => matchesSearch(t, q)),
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
    () => orderedAllTables.filter((t) => matchesSearch(t, nq)),
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

  const totalFieldsCount = useMemo(
    () => schema.tables.reduce((acc, t) => acc + t.columns.length, 0),
    [schema.tables]
  );

  const activeTableId = section.kind === 'table' ? section.tableId : null;
  const activeTable = activeTableId ? tableMap.get(activeTableId) || null : null;
  const activeNote =
    section.kind === 'note'
      ? schema.notes.find((n) => n.id === section.noteId) || null
      : null;
  const activeGroup =
    section.kind === 'group'
      ? schema.tableGroups.find((g) => g.name === section.groupName) || null
      : null;

  const toggleDomainExpand = (domainName: string) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [domainName]: prev[domainName] === false ? true : !(prev[domainName] ?? true),
    }));
  };

  const toggleTreeTableExpand = (key: string) => {
    setExpandedTreeTables((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const openTableDetail = (tableId: string) => {
    setSection({ kind: 'table', tableId });
    mainPaneRef.current?.scrollTo({ top: 0 });
  };

  const renderCardinalityBadge = (relation: RefRelation) => {
    const meta = CARDINALITY_META[relation];
    return (
      <span
        title={meta.description}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${meta.badgeCls}`}
      >
        <span className="font-mono font-bold">{meta.symbol}</span>
        <span>{meta.title}</span>
        <span className="font-mono opacity-80">({meta.ratio})</span>
      </span>
    );
  };

  const renderCardinalityLegend = () => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Cardinality Legend</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {(['>', '<', '-', '<>'] as RefRelation[]).map((rel) => {
          const meta = CARDINALITY_META[rel];
          return (
            <div
              key={rel}
              className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                {renderCardinalityBadge(rel)}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {meta.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTreeTableItem = (table: TableDef, nodeKey: string) => {
    const isSelected = activeTableId === table.id;
    const isExpanded = Boolean(expandedTreeTables[nodeKey]);

    return (
      <div key={nodeKey}>
        <div
          className={`group flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTreeTableExpand(nodeKey);
            }}
            aria-label={
              isExpanded
                ? `Collapse ${table.id} columns`
                : `Expand ${table.id} columns`
            }
            className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => openTableDetail(table.id)}
            className="flex-1 flex items-center gap-1.5 min-w-0 text-left py-0.5"
          >
            <Table2
              className={`w-3.5 h-3.5 shrink-0 ${
                isSelected
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400'
              }`}
            />
            <span className="truncate font-mono text-[12px]">{table.id}</span>
          </button>
          <span className="text-[10px] text-slate-400 tabular-nums shrink-0 pr-1">
            {table.columns.length}
          </span>
        </div>

        {isExpanded && (
          <div className="ml-5 pl-2 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">
            {table.columns.map((col) => {
              const fk = fkLookup.get(`${table.id}.${col.name}`);
              return (
                <button
                  key={col.name}
                  type="button"
                  onClick={() => openTableDetail(table.id)}
                  className="w-full flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-left"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {col.pk ? (
                      <KeyRound className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                    ) : fk ? (
                      <Link2 className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                    ) : (
                      <span className="w-2.5 h-2.5 inline-block shrink-0" />
                    )}
                    <span className="font-mono truncate">{col.name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {col.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Prev / Next table for Table Detail View
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
      {/* Left Docs Tree Navigation Sidebar (dbdocs-style) */}
      {navOpen && (
        <aside className="w-[272px] shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col select-none">
          {/* Quick Section Navigation: Overview, Enumerated Types, Foreign Key Relationships */}
          <div className="p-2 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
            <button
              type="button"
              onClick={() => setSection({ kind: 'overview' })}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                section.kind === 'overview'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Database className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Schema Overview</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {orderedAllTables.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSection({ kind: 'enums' })}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                section.kind === 'enums'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <ListChecks className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Enumerated Types</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {schema.enums.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSection({ kind: 'relationships' })}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                section.kind === 'relationships'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">FK Relationships</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {schema.refs.length}
              </span>
            </button>

            {schema.notes.length > 0 && (
              <div className="pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Project Notes
                </div>
                {schema.notes.map((n) => {
                  const isActiveNote =
                    section.kind === 'note' && section.noteId === n.id;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setSection({ kind: 'note', noteId: n.id });
                        mainPaneRef.current?.scrollTo({ top: 0 });
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                        isActiveNote
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{n.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tree Search & Mode Switch */}
          <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={navSearch}
                  onChange={(e) => setNavSearch(e.target.value)}
                  placeholder="Search table or domain..."
                  className="w-full pl-8 pr-6 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {navSearch && (
                  <button
                    type="button"
                    onClick={() => setNavSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label="Clear tree filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSortAZ((s) => !s)}
                title={
                  sortAZ
                    ? 'Sorted A–Z (click for schema order)'
                    : 'Schema order (click to sort A–Z)'
                }
                className={`p-1.5 rounded-md border transition-colors shrink-0 ${
                  sortAZ
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tree View Filter: All Tables vs By Domain */}
            <div
              className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80"
              role="group"
              aria-label="Docs tree grouping"
            >
              <button
                type="button"
                onClick={() => setTreeMode('all')}
                className={`py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  treeMode === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All Tables
              </button>
              <button
                type="button"
                onClick={() => setTreeMode('domain')}
                className={`py-1 px-2 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                  treeMode === 'domain'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                By Domain
              </button>
            </div>
          </div>

          {/* Tree Body */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {treeMode === 'all' ? (
              treeFlatTables.length === 0 ? (
                <div className="py-8 px-3 text-center text-xs text-slate-400">
                  No matching tables
                </div>
              ) : (
                treeFlatTables.map((t) =>
                  renderTreeTableItem(t, `flat::${t.id}`)
                )
              )
            ) : (
              <>
                {visibleGroups.map((group) => {
                  const groupTablesRaw = group.tables
                    .map((id) => tableMap.get(id))
                    .filter((t): t is TableDef => Boolean(t));
                  const groupTablesSorted = sortAZ
                    ? [...groupTablesRaw].sort((a, b) => a.id.localeCompare(b.id))
                    : groupTablesRaw;
                  const matchingTables = groupTablesSorted.filter((t) =>
                    !nq
                      ? true
                      : matchesSearch(t, nq) ||
                        group.name.toLowerCase().includes(nq)
                  );
                  if (
                    nq &&
                    matchingTables.length === 0 &&
                    !group.name.toLowerCase().includes(nq)
                  ) {
                    return null;
                  }
                  const isOpen = expandedDomains[group.name] ?? true;

                  return (
                    <div key={group.name} className="space-y-0.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleDomainExpand(group.name)}
                          className="flex-1 min-w-0 flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: group.color || '#2563EB' }}
                          />
                          <span className="flex-1 truncate text-left">
                            {group.name}
                          </span>
                          <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                            {matchingTables.length}
                          </span>
                        </button>
                        {group.note && (
                          <button
                            type="button"
                            onClick={() => {
                              setSection({ kind: 'group', groupName: group.name });
                              mainPaneRef.current?.scrollTo({ top: 0 });
                            }}
                            title={`Open "${group.name}" documentation`}
                            className={`p-1 rounded-md transition-colors shrink-0 ${
                              section.kind === 'group' &&
                              section.groupName === group.name
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <FileText className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {isOpen && (
                        <div className="ml-3 pl-1.5 border-l border-slate-200/80 dark:border-slate-800 space-y-0.5">
                          {matchingTables.map((t) =>
                            renderTreeTableItem(t, `dom:${group.name}::${t.id}`)
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!isFilteringDomains &&
                  ungroupedTables.filter((t) => matchesSearch(t, nq)).length >
                    0 && (
                    <div className="space-y-0.5 pt-1">
                      <button
                        type="button"
                        onClick={() => toggleDomainExpand('__ungrouped__')}
                        className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        {expandedDomains['__ungrouped__'] ?? true ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="flex-1 truncate text-left">
                          Ungrouped
                        </span>
                        <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                          {
                            ungroupedTables.filter((t) => matchesSearch(t, nq))
                              .length
                          }
                        </span>
                      </button>
                      {(expandedDomains['__ungrouped__'] ?? true) && (
                        <div className="ml-3 pl-1.5 border-l border-slate-200/80 dark:border-slate-800 space-y-0.5">
                          {(sortAZ
                            ? [...ungroupedTables].sort((a, b) =>
                                a.id.localeCompare(b.id)
                              )
                            : ungroupedTables
                          )
                            .filter((t) => matchesSearch(t, nq))
                            .map((t) =>
                              renderTreeTableItem(t, `ungrouped::${t.id}`)
                            )}
                        </div>
                      )}
                    </div>
                  )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* Edge Toggle Handle */}
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

      {/* Main Docs Content Pane */}
      <div ref={mainPaneRef} className="flex-1 h-full overflow-y-auto min-w-0">
        {/* ---------- 1. TABLE DETAIL VIEW ---------- */}
        {section.kind === 'table' && activeTable && (
          <div className="w-full px-6 lg:px-10 py-6 space-y-6">
            {/* Breadcrumb & Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs">
                {!navOpen && (
                  <button
                    type="button"
                    onClick={onToggleNav}
                    title={`Show Docs navigation (${modKey}J)`}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSection({ kind: 'overview' })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Schema Overview</span>
                </button>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {schema.project.name || 'Schema'}
                </span>
                <span className="text-slate-400">/</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {activeTable.id}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onSelectTable(activeTable.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Open in Diagram</span>
              </button>
            </div>

            {/* Domain Tags */}
            {(domainsByTable.get(activeTable.id) || []).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Business Domains:</span>
                {(domainsByTable.get(activeTable.id) || []).map((dom) => (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => {
                      setSection({ kind: 'group', groupName: dom });
                      mainPaneRef.current?.scrollTo({ top: 0 });
                    }}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-blue-400"
                  >
                    <span
                      className="w-2 h-2 rounded-xs"
                      style={{
                        backgroundColor: groupColorMap.get(dom) || '#2563EB',
                      }}
                    />
                    <span>{dom}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Rich / Long Table README Documentation */}
            {activeTable.note && isRichMarkdownNote(activeTable.note) && (
              <ReadmeNoteCard
                title="Table Documentation"
                subtitle={activeTable.id}
                content={activeTable.note}
                accentColor={activeTable.headerColor}
                scrollContainerRef={mainPaneRef}
              />
            )}

            {/* Full Column Specification Card */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-3 h-3 rounded-xs shrink-0"
                    style={{
                      backgroundColor: activeTable.headerColor || '#0f172a',
                    }}
                  />
                  <h1 className="font-mono text-lg font-bold text-slate-900 dark:text-slate-50 truncate">
                    {activeTable.id}
                  </h1>
                  {activeTable.alias && (
                    <span className="text-xs text-slate-400 font-mono">
                      as {activeTable.alias}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  {activeTable.columns.length} columns ·{' '}
                  {activeTable.indexes.length} indexes
                </span>
              </div>

              {activeTable.note && !isRichMarkdownNote(activeTable.note) && (
                <div className="px-5 py-2.5 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  <MarkdownContent content={activeTable.note} compact />
                </div>
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
                            {constraints.length > 0
                              ? constraints.join(' · ')
                              : 'nullable'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {col.defaultValue || '—'}
                          </td>
                          <td className="py-2.5 px-5 text-slate-600 dark:text-slate-300">
                            <div className="space-y-1">
                              {fk && (
                                <button
                                  type="button"
                                  onClick={() => openTableDetail(fk.targetTable)}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline mr-2"
                                >
                                  <Link2 className="w-3 h-3" />
                                  <span>{fk.label}</span>
                                </button>
                              )}
                              {col.note &&
                                (col.note.includes('\n') || col.note.length >= 120 ? (
                                  <MarkdownContent content={col.note} compact />
                                ) : (
                                  <MarkdownContent content={col.note} inline />
                                ))}
                              {!fk && !col.note && (
                                <span className="text-slate-400">—</span>
                              )}
                            </div>
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
                    Indexes
                  </div>
                  <div className="space-y-1">
                    {activeTable.indexes.map((idx, i) => (
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

            {/* Outgoing & Incoming Foreign Key Relationships */}
            {(() => {
              const outgoing = schema.refs.filter(
                (r) => r.fromTable === activeTable.id
              );
              const incoming = schema.refs.filter(
                (r) => r.toTable === activeTable.id
              );
              if (outgoing.length === 0 && incoming.length === 0) return null;

              return (
                <div className="space-y-4">
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
                              className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                                {r.fromColumns.join(', ')}
                              </span>
                              {renderCardinalityBadge(r.relation)}
                              <button
                                type="button"
                                onClick={() => openTableDetail(r.toTable)}
                                className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold truncate"
                              >
                                {r.toTable}.{r.toColumns.join(', ')}
                              </button>
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
                              className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => openTableDetail(r.fromTable)}
                                className="font-mono text-blue-600 dark:text-blue-400 hover:underline font-semibold truncate"
                              >
                                {r.fromTable}.{r.fromColumns.join(', ')}
                              </button>
                              {renderCardinalityBadge(r.relation)}
                              <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                                {r.toColumns.join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sequential Table Footer Nav */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
              {prevTable ? (
                <button
                  type="button"
                  onClick={() => openTableDetail(prevTable.id)}
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
                  onClick={() => openTableDetail(nextTable.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono"
                >
                  <span>{nextTable.id}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ---------- 1B. STANDALONE NOTE README VIEW ---------- */}
        {section.kind === 'note' && activeNote && (
          <div className="w-full px-6 lg:px-10 py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs">
                {!navOpen && (
                  <button
                    type="button"
                    onClick={onToggleNav}
                    title={`Show Docs navigation (${modKey}J)`}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSection({ kind: 'overview' })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Schema Overview</span>
                </button>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  Project Notes
                </span>
                <span className="text-slate-400">/</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeNote.name}
                </span>
              </div>
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
              title="Documentation Note"
              subtitle={activeNote.name}
              content={activeNote.content}
              scrollContainerRef={mainPaneRef}
            />
          </div>
        )}

        {/* ---------- 1C. BUSINESS DOMAIN (TABLEGROUP) README VIEW ---------- */}
        {section.kind === 'group' && activeGroup && (
          <div className="w-full px-6 lg:px-10 py-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs">
                {!navOpen && (
                  <button
                    type="button"
                    onClick={onToggleNav}
                    title={`Show Docs navigation (${modKey}J)`}
                    className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSection({ kind: 'overview' })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Schema Overview</span>
                </button>
                <span className="text-slate-400">/</span>
                <span className="text-slate-500 dark:text-slate-400">
                  Business Domain
                </span>
                <span className="text-slate-400">/</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {activeGroup.name}
                </span>
              </div>
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

            {activeGroup.note && (
              <ReadmeNoteCard
                title="Domain Documentation"
                subtitle={activeGroup.name}
                content={activeGroup.note}
                accentColor={activeGroup.color || '#2563EB'}
                scrollContainerRef={mainPaneRef}
              />
            )}

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
                      onClick={() => openTableDetail(tbl.id)}
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
        )}

        {/* ---------- 2. ENUMERATED TYPES VIEW (ENHANCED TABLE) ---------- */}
        {section.kind === 'enums' && (
          <div className="w-full px-6 lg:px-10 py-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {!navOpen && (
                    <button
                      type="button"
                      onClick={onToggleNav}
                      title={`Show Docs navigation (${modKey}J)`}
                      className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <PanelLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSection({ kind: 'overview' })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Schema Overview</span>
                  </button>
                  <span className="text-slate-400">/</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Enumerated Types
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
                  Enumerated Types ({schema.enums.length})
                </h1>
              </div>

              <div className="relative w-full sm:w-64 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={enumSearch}
                  onChange={(e) => setEnumSearch(e.target.value)}
                  placeholder="Filter enums or values..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {filteredEnums.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  {schema.enums.length === 0
                    ? 'No Enum definitions found in this schema.'
                    : `No enumerated types matching "${enumSearch}"`}
                </div>
              ) : (
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
                      {filteredEnums.map((en) => {
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
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
                                {en.values.map((v, idx) => (
                                  <div
                                    key={v.name}
                                    className="flex items-baseline gap-2 font-mono text-[11.5px]"
                                  >
                                    <span className="text-[10px] text-slate-400 tabular-nums w-4 text-right shrink-0">
                                      {idx + 1}.
                                    </span>
                                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                                      {v.name}
                                    </span>
                                    {v.note && (
                                      <span className="font-sans text-[11px] text-slate-400">
                                        — <MarkdownContent content={v.note} inline />
                                      </span>
                                    )}
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
                                      onClick={() => openTableDetail(u.tableId)}
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
              )}
            </div>
          </div>
        )}

        {/* ---------- 3. FOREIGN KEY RELATIONSHIPS VIEW + CARDINALITY LEGEND ---------- */}
        {section.kind === 'relationships' && (
          <div className="w-full px-6 lg:px-10 py-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {!navOpen && (
                    <button
                      type="button"
                      onClick={onToggleNav}
                      title={`Show Docs navigation (${modKey}J)`}
                      className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <PanelLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSection({ kind: 'overview' })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Schema Overview</span>
                  </button>
                  <span className="text-slate-400">/</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Foreign Key Relationships
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
                  Foreign Key Relationships ({filteredRefs.length})
                </h1>
              </div>

              <div className="relative w-full sm:w-72 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  placeholder="Filter by table, column, cardinality..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {/* Cardinality Legend */}
            {renderCardinalityLegend()}

            {/* Relationships Specification Table + Pagination */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {filteredRefs.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-400">
                  No foreign key relationships found.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900">
                          <th className="py-2.5 px-5">Source (Table.Column)</th>
                          <th className="py-2.5 px-4">Cardinality</th>
                          <th className="py-2.5 px-4">Target (Table.Column)</th>
                          <th className="py-2.5 px-5">Referential Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                        {pagedRefs.map((r) => (
                          <tr
                            key={r.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-2.5 px-5 font-mono whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openTableDetail(r.fromTable)}
                                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {r.fromTable}.{r.fromColumns.join(', ')}
                              </button>
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {renderCardinalityBadge(r.relation)}
                            </td>
                            <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openTableDetail(r.toTable)}
                                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {r.toTable}.{r.toColumns.join(', ')}
                              </button>
                            </td>
                            <td className="py-2.5 px-5 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {[
                                r.onDelete ? `on delete ${r.onDelete}` : null,
                                r.onUpdate ? `on update ${r.onUpdate}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>
                        Showing {(safeRelPage - 1) * relPageSize + 1}–
                        {Math.min(
                          safeRelPage * relPageSize,
                          filteredRefs.length
                        )}{' '}
                        of {filteredRefs.length} relationships
                      </span>
                      <select
                        value={relPageSize}
                        onChange={(e) => setRelPageSize(Number(e.target.value))}
                        aria-label="Relationships per page"
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs"
                      >
                        {[10, 25, 50, 100].map((sz) => (
                          <option key={sz} value={sz}>
                            {sz} / page
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeRelPage <= 1}
                        onClick={() => setRelPage(1)}
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safeRelPage <= 1}
                        onClick={() => setRelPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      {getPageNumbers(safeRelPage, relTotalPages).map(
                        (item, idx) =>
                          item === 'ellipsis' ? (
                            <span key={`el-${idx}`} className="px-1.5 text-slate-400">
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setRelPage(item)}
                              className={`min-w-[28px] h-7 px-2 rounded border text-xs font-medium tabular-nums ${
                                item === safeRelPage
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {item}
                            </button>
                          )
                      )}
                      <button
                        type="button"
                        disabled={safeRelPage >= relTotalPages}
                        onClick={() =>
                          setRelPage((p) => Math.min(relTotalPages, p + 1))
                        }
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safeRelPage >= relTotalPages}
                        onClick={() => setRelPage(relTotalPages)}
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Last page"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------- 4. DOCS SCHEMA OVERVIEW (THIN, UNGROUPED & PAGINATED) ---------- */}
        {section.kind === 'overview' && (
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
                    onClick={() => setSection({ kind: 'enums' })}
                    className="tabular-nums hover:underline"
                  >
                    {schema.enums.length} Enums
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSection({ kind: 'relationships' })}
                    className="tabular-nums hover:underline"
                  >
                    {schema.refs.length} Relationships
                  </button>
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  {schema.project.name || 'Database Schema Documentation'}
                </h1>
                {schema.project.note && !isRichMarkdownNote(schema.project.note) && (
                  <div className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
                    <MarkdownContent content={schema.project.note} compact />
                  </div>
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

            {/* Project README Card (for rich / multi-line project notes) */}
            {schema.project.note && isRichMarkdownNote(schema.project.note) && (
              <ReadmeNoteCard
                title="README"
                subtitle={schema.project.name || 'Project Documentation'}
                content={schema.project.note}
                scrollContainerRef={mainPaneRef}
              />
            )}

            {/* Standalone Project Notes Directory (if any Note blocks exist) */}
            {schema.notes.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Documentation Notes ({schema.notes.length})</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {schema.notes.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        setSection({ kind: 'note', noteId: n.id });
                        mainPaneRef.current?.scrollTo({ top: 0 });
                      }}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left space-y-1.5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {n.name}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                        {stripMarkdownToPlainText(n.content)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Business Domains Guide Strip (when TableGroups have notes) */}
            {visibleGroups.some((g) => Boolean(g.note)) && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Business Domains ({visibleGroups.length})</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {visibleGroups.map((g) => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => {
                        setSection({ kind: 'group', groupName: g.name });
                        mainPaneRef.current?.scrollTo({ top: 0 });
                      }}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left space-y-1.5 transition-colors"
                    >
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
                        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2">
                          {stripMarkdownToPlainText(g.note)}
                        </p>
                      ) : (
                        <p className="text-[11.5px] text-slate-400 italic">
                          No domain notes
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isFilteringDomains && (
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-xs">
                <span className="text-blue-900 dark:text-blue-100 font-medium">
                  Showing tables in selected domain
                  {selectedDomains.length > 1 ? 's' : ''}:{' '}
                  {selectedDomains.join(', ')}
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
                              onClick={() => openTableDetail(t.id)}
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

                  {/* Overview Pagination Controls */}
                  <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>
                        Showing {(safeOverviewPage - 1) * overviewPageSize + 1}–
                        {Math.min(
                          safeOverviewPage * overviewPageSize,
                          overviewTables.length
                        )}{' '}
                        of {overviewTables.length} tables
                      </span>
                      <select
                        value={overviewPageSize}
                        onChange={(e) =>
                          setOverviewPageSize(Number(e.target.value))
                        }
                        aria-label="Tables per page"
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs"
                      >
                        {[10, 20, 50, 100].map((sz) => (
                          <option key={sz} value={sz}>
                            {sz} / page
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeOverviewPage <= 1}
                        onClick={() => setOverviewPage(1)}
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="First page"
                      >
                        <ChevronsLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safeOverviewPage <= 1}
                        onClick={() =>
                          setOverviewPage((p) => Math.max(1, p - 1))
                        }
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      {getPageNumbers(safeOverviewPage, overviewTotalPages).map(
                        (item, idx) =>
                          item === 'ellipsis' ? (
                            <span
                              key={`ov-el-${idx}`}
                              className="px-1.5 text-slate-400"
                            >
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setOverviewPage(item)}
                              className={`min-w-[28px] h-7 px-2 rounded border text-xs font-medium tabular-nums ${
                                item === safeOverviewPage
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {item}
                            </button>
                          )
                      )}
                      <button
                        type="button"
                        disabled={safeOverviewPage >= overviewTotalPages}
                        onClick={() =>
                          setOverviewPage((p) =>
                            Math.min(overviewTotalPages, p + 1)
                          )
                        }
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={safeOverviewPage >= overviewTotalPages}
                        onClick={() => setOverviewPage(overviewTotalPages)}
                        className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                        aria-label="Last page"
                      >
                        <ChevronsRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Navigation Cards to Enumerated Types & Foreign Key Relationships */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSection({ kind: 'enums' })}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left flex items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Enumerated Types ({schema.enums.length})
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      View enum member values and referencing columns
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setSection({ kind: 'relationships' })}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400 dark:hover:border-blue-600 text-left flex items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Foreign Key Relationships ({schema.refs.length})
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Browse cardinality legend, constraints, and table links
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
