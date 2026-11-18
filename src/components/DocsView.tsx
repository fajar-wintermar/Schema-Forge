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
import { ParsedSchema, RefRelation, StickyNote, TableDef } from '../types/schema';
import {
  MarkdownContent,
  extractMarkdownHeadings,
  isRichMarkdownNote,
  stripMarkdownToPlainText,
} from './MarkdownContent';

interface DocsViewProps {
  schema: ParsedSchema;
  stickyNotes?: StickyNote[];
  navOpen: boolean;
  onToggleNav: () => void;
  modKey?: string;
  selectedDomains?: string[];
  onClearDomainFilter?: () => void;
  onSelectTable: (tableId: string) => void;
}

type TreeFilterMode = 'all' | 'domain';
type NoteCategory =
  | 'all'
  | 'project'
  | 'group'
  | 'standalone'
  | 'table'
  | 'column'
  | 'enum'
  | 'sticky';

interface DocsNoteEntry {
  id: string;
  category: Exclude<NoteCategory, 'all'>;
  categoryLabel: string;
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  line?: number;
  target?:
    | { kind: 'overview' }
    | { kind: 'group'; groupName: string }
    | { kind: 'note'; noteId: string }
    | { kind: 'table'; tableId: string }
    | { kind: 'enums' };
}

type DocsSection =
  | { kind: 'overview' }
  | { kind: 'groups' }
  | { kind: 'notes' }
  | { kind: 'enums' }
  | { kind: 'relationships' }
  | { kind: 'note'; noteId: string }
  | { kind: 'noteDetail'; entryId: string }
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

function trimNotePreview(
  content: string,
  maxChars = 200
): { preview: string; isTrimmed: boolean; words: number; lines: number } {
  const plain = stripMarkdownToPlainText(content);
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const lines = content.split('\n').length;
  const needsTrim = isRichMarkdownNote(content) || plain.length > maxChars;

  if (plain.length <= maxChars) {
    return { preview: plain, isTrimmed: needsTrim, words, lines };
  }

  let cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxChars * 0.65)) {
    cut = cut.slice(0, lastSpace);
  }
  return {
    preview: `${cut.trimEnd()}…`,
    isTrimmed: true,
    words,
    lines,
  };
}

interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

const PaginationBar: React.FC<PaginationBarProps> = ({
  page,
  pageSize,
  totalItems,
  itemLabel,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  return (
    <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 tabular-nums">
        <span>
          Showing {(safePage - 1) * pageSize + 1}–
          {Math.min(safePage * pageSize, totalItems)} of {totalItems} {itemLabel}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label={`${itemLabel} per page`}
          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs"
        >
          {pageSizeOptions.map((sz) => (
            <option key={sz} value={sz}>
              {sz} / page
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(1)}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {getPageNumbers(safePage, totalPages).map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`el-${idx}`} className="px-1.5 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`min-w-[28px] h-7 px-2 rounded border text-xs font-medium tabular-nums ${
                item === safePage
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
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface TrimmableNoteProps {
  content: string;
  compact?: boolean;
  inlineShort?: boolean;
  maxChars?: number;
  defaultExpanded?: boolean;
}

const TrimmableNote: React.FC<TrimmableNoteProps> = ({
  content,
  compact = false,
  inlineShort = false,
  maxChars = 180,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { preview, isTrimmed } = useMemo(
    () => trimNotePreview(content, maxChars),
    [content, maxChars]
  );

  if (!isTrimmed) {
    return (
      <MarkdownContent
        content={content}
        inline={inlineShort}
        compact={!inlineShort && compact}
      />
    );
  }

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(true);
          }
        }}
        className="group cursor-pointer text-left space-y-1"
      >
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
          {preview}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
          <ChevronDown className="w-3 h-3" />
          <span>Show full note</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <MarkdownContent content={content} compact={compact} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(false);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
      >
        <ChevronUp className="w-3 h-3" />
        <span>Trim note</span>
      </button>
    </div>
  );
};

interface ReadmeNoteCardProps {
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  defaultExpanded?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const ReadmeNoteCard: React.FC<ReadmeNoteCardProps> = ({
  title,
  subtitle,
  content,
  accentColor,
  defaultExpanded = true,
  scrollContainerRef,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const { preview, words, readMins } = useMemo(
    () => {
      const info = trimNotePreview(content, 240);
      const mins = Math.max(1, Math.round(info.words / 200));
      return { preview: info.preview, words: info.words, readMins: mins };
    },
    [content]
  );

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
            {words} words · ~{readMins} min read
          </span>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Trim note</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show full note</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!expanded ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(true);
            }
          }}
          className="px-6 py-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors space-y-2"
        >
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed max-w-4xl">
            {preview}
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            <span>Click to read full note</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      ) : (
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
  }, [notesSearch, noteCategory, notesPageSize, schema.notes.length, schema.tables.length, schema.tableGroups.length, schema.enums.length, stickyNotes.length]);

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

  const enumTotalPages = Math.max(1, Math.ceil(filteredEnums.length / enumPageSize));
  const safeEnumPage = Math.min(enumPage, enumTotalPages);
  const pagedEnums = useMemo(() => {
    const start = (safeEnumPage - 1) * enumPageSize;
    return filteredEnums.slice(start, start + enumPageSize);
  }, [filteredEnums, safeEnumPage, enumPageSize]);

  const totalFieldsCount = useMemo(
    () => schema.tables.reduce((acc, t) => acc + t.columns.length, 0),
    [schema.tables]
  );

  const allNoteEntries = useMemo<DocsNoteEntry[]>(() => {
    const entries: DocsNoteEntry[] = [];

    if (schema.project.note?.trim()) {
      entries.push({
        id: 'note_project',
        category: 'project',
        categoryLabel: 'Project README',
        title: schema.project.name || 'Project Note',
        subtitle: schema.project.databaseType || 'Database Project',
        content: schema.project.note,
        target: { kind: 'overview' },
      });
    }

    for (const g of schema.tableGroups) {
      if (!g.note?.trim()) continue;
      entries.push({
        id: `note_group_${g.name}`,
        category: 'group',
        categoryLabel: 'TableGroup',
        title: g.name,
        subtitle: `${g.tables.length} ${g.tables.length === 1 ? 'table' : 'tables'}`,
        content: g.note,
        accentColor: g.color || '#2563EB',
        line: g.line,
        target: { kind: 'group', groupName: g.name },
      });
    }

    for (const n of schema.notes) {
      if (!n.content?.trim()) continue;
      entries.push({
        id: `note_standalone_${n.id}`,
        category: 'standalone',
        categoryLabel: 'Project Note',
        title: n.name,
        content: n.content,
        line: n.line,
        target: { kind: 'note', noteId: n.id },
      });
    }

    for (const t of schema.tables) {
      const doms = domainsByTable.get(t.id) || [];
      if (t.note?.trim()) {
        entries.push({
          id: `note_table_${t.id}`,
          category: 'table',
          categoryLabel: 'Table',
          title: t.id,
          subtitle: doms.length > 0 ? doms.join(', ') : undefined,
          content: t.note,
          accentColor: t.headerColor,
          line: t.line,
          target: { kind: 'table', tableId: t.id },
        });
      }
      for (const c of t.columns) {
        if (!c.note?.trim()) continue;
        entries.push({
          id: `note_col_${t.id}_${c.name}`,
          category: 'column',
          categoryLabel: 'Column',
          title: `${t.id}.${c.name}`,
          subtitle: c.type,
          content: c.note,
          accentColor: t.headerColor,
          line: c.line,
          target: { kind: 'table', tableId: t.id },
        });
      }
    }

    for (const en of schema.enums) {
      for (const v of en.values) {
        if (!v.note?.trim()) continue;
        entries.push({
          id: `note_enum_${en.id}_${v.name}`,
          category: 'enum',
          categoryLabel: 'Enum Value',
          title: `${en.id}.${v.name}`,
          content: v.note,
          target: { kind: 'enums' },
        });
      }
    }

    for (const sn of stickyNotes) {
      if (!sn.content?.trim() && !sn.title?.trim()) continue;
      let target: DocsNoteEntry['target'];
      let subtitle = sn.author || 'Canvas sticky note';
      if (sn.linkedTarget?.startsWith('table:')) {
        const tableId = sn.linkedTarget.slice(6);
        target = { kind: 'table', tableId };
        subtitle = `Linked to table ${tableId}`;
      } else if (sn.linkedTarget?.startsWith('group:')) {
        const groupName = sn.linkedTarget.slice(6);
        target = { kind: 'group', groupName };
        subtitle = `Linked to domain ${groupName}`;
      }
      entries.push({
        id: `note_sticky_${sn.id}`,
        category: 'sticky',
        categoryLabel: 'Sticky Note',
        title: sn.title || 'Sticky Note',
        subtitle,
        content: sn.content || sn.title,
        target,
      });
    }

    return entries;
  }, [schema, domainsByTable, stickyNotes]);

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
    for (const e of allNoteEntries) {
      counts[e.category]++;
    }
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
              onClick={() => setSection({ kind: 'groups' })}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                section.kind === 'groups'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Table Groups</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {schema.tableGroups.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSection({ kind: 'notes' })}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                section.kind === 'notes'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">All Notes</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {allNoteEntries.length}
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
                        <button
                          type="button"
                          onClick={() => {
                            setSection({ kind: 'group', groupName: group.name });
                            mainPaneRef.current?.scrollTo({ top: 0 });
                          }}
                          title={
                            group.note
                              ? `Open "${group.name}" documentation & note`
                              : `Open "${group.name}" domain page`
                          }
                          className={`p-1 rounded-md transition-colors shrink-0 ${
                            section.kind === 'group' &&
                            section.groupName === group.name
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                              : group.note
                              ? 'text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <FileText className="w-3 h-3" />
                        </button>
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

            {/* Domain Tags & TableGroup Notes */}
            {(domainsByTable.get(activeTable.id) || []).length > 0 && (() => {
              const parentGroups = (domainsByTable.get(activeTable.id) || [])
                .map((dom) => schema.tableGroups.find((g) => g.name === dom))
                .filter((g): g is NonNullable<typeof g> => Boolean(g));
              const groupsWithNotes = parentGroups.filter((g) => Boolean(g.note?.trim()));

              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-400">Business Domains:</span>
                    {parentGroups.map((grp) => (
                      <button
                        key={grp.name}
                        type="button"
                        onClick={() => {
                          setSection({ kind: 'group', groupName: grp.name });
                          mainPaneRef.current?.scrollTo({ top: 0 });
                        }}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-blue-400"
                      >
                        <span
                          className="w-2 h-2 rounded-xs"
                          style={{
                            backgroundColor: grp.color || '#2563EB',
                          }}
                        />
                        <span>{grp.name}</span>
                      </button>
                    ))}
                  </div>

                  {groupsWithNotes.map((grp) => (
                    <div
                      key={grp.name}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: grp.color || '#2563EB' }}
                          />
                          <span>TableGroup Note · {grp.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSection({ kind: 'group', groupName: grp.name });
                            mainPaneRef.current?.scrollTo({ top: 0 });
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          Open Group Docs →
                        </button>
                      </div>
                      <TrimmableNote
                        key={`tbl-grp-${activeTable.id}-${grp.name}`}
                        content={grp.note!}
                        compact
                        maxChars={180}
                        defaultExpanded={false}
                      />
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Linked Canvas Sticky Notes for this Table */}
            {(() => {
              const tableStickyNotes = stickyNotes.filter(
                (sn) => sn.linkedTarget === `table:${activeTable.id}`
              );
              if (tableStickyNotes.length === 0) return null;
              return (
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
              );
            })()}

            {/* Rich / Long Table README Documentation */}
            {activeTable.note && isRichMarkdownNote(activeTable.note) && (
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
                  <TrimmableNote
                    key={`tbl-short-note-${activeTable.id}`}
                    content={activeTable.note}
                    compact
                    maxChars={160}
                    defaultExpanded={false}
                  />
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
              key={`standalone-note-${activeNote.id}`}
              title="Documentation Note"
              subtitle={activeNote.name}
              content={activeNote.content}
              defaultExpanded
              scrollContainerRef={mainPaneRef}
            />
          </div>
        )}

        {/* ---------- 1B-2. INDIVIDUAL NOTE DETAIL PAGE (FROM ALL NOTES) ---------- */}
        {section.kind === 'noteDetail' && activeNoteEntry && (() => {
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
                    onClick={() => {
                      setSection({ kind: 'notes' });
                      mainPaneRef.current?.scrollTo({ top: 0 });
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>All Notes</span>
                  </button>
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
                          openTableDetail(target.tableId);
                        } else {
                          setSection(target);
                          mainPaneRef.current?.scrollTo({ top: 0 });
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
                    onClick={() => {
                      setSection({ kind: 'noteDetail', entryId: prevEntry.id });
                      mainPaneRef.current?.scrollTo({ top: 0 });
                    }}
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
                    onClick={() => {
                      setSection({ kind: 'noteDetail', entryId: nextEntry.id });
                      mainPaneRef.current?.scrollTo({ top: 0 });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono max-w-[45%] truncate"
                  >
                    <span className="truncate">{nextEntry.title}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          );
        })()}

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
                No TableGroup note defined yet. Add <code className="font-mono">Note: &apos;...&apos;</code> inside{' '}
                <code className="font-mono">TableGroup &quot;{activeGroup.name}&quot;</code> to document this domain.
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
                <>
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
                        {pagedEnums.map((en) => {
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2.5">
                                  {en.values.map((v, idx) => (
                                    <div
                                      key={v.name}
                                      className="flex items-start gap-2 min-w-0"
                                    >
                                      <span className="font-mono text-[10px] text-slate-400 tabular-nums w-4 text-right shrink-0 pt-0.5">
                                        {idx + 1}.
                                      </span>
                                      <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="font-mono text-[11.5px] text-slate-800 dark:text-slate-200 font-medium break-words">
                                          {v.name}
                                        </div>
                                        {v.note && (
                                          <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                            <TrimmableNote
                                              content={v.note}
                                              compact
                                              maxChars={90}
                                            />
                                          </div>
                                        )}
                                      </div>
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

                  <PaginationBar
                    page={safeEnumPage}
                    pageSize={enumPageSize}
                    totalItems={filteredEnums.length}
                    itemLabel="enums"
                    onPageChange={setEnumPage}
                    onPageSizeChange={setEnumPageSize}
                  />
                </>
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

        {/* ---------- 3B. TABLE GROUPS (DOMAINS & NOTES) VIEW ---------- */}
        {section.kind === 'groups' && (
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
                    Table Groups
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
                  Table Groups &amp; Domain Notes ({filteredTableGroups.length})
                </h1>
              </div>

              <div className="relative w-full sm:w-72 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={groupsSearch}
                  onChange={(e) => setGroupsSearch(e.target.value)}
                  placeholder="Filter groups, notes, tables..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {filteredTableGroups.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400">
                {schema.tableGroups.length === 0
                  ? 'No TableGroup definitions found in this schema.'
                  : `No table groups matching "${groupsSearch}"`}
              </div>
            ) : (
              <div className="space-y-4">
                {pagedTableGroups.map((g) => (
                  <section
                    key={g.name}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: g.color || '#2563EB' }}
                        />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                          {g.name}
                        </h2>
                        <span className="text-xs text-slate-400 tabular-nums">
                          {g.tables.length} {g.tables.length === 1 ? 'table' : 'tables'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSection({ kind: 'group', groupName: g.name });
                          mainPaneRef.current?.scrollTo({ top: 0 });
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                      >
                        <span>Open Domain Page</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="px-5 py-4 space-y-4">
                      {g.note ? (
                        <div className="max-w-4xl">
                          <TrimmableNote
                            key={`grp-list-${g.name}`}
                            content={g.note}
                            maxChars={200}
                            defaultExpanded={false}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">
                          No TableGroup note defined.
                        </p>
                      )}

                      {g.tables.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium text-slate-400 mr-1">
                            Tables:
                          </span>
                          {g.tables.map((tId) => (
                            <button
                              key={tId}
                              type="button"
                              onClick={() => openTableDetail(tId)}
                              className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:border-blue-400"
                            >
                              {tId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                ))}

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <PaginationBar
                    page={safeGroupsPage}
                    pageSize={groupsPageSize}
                    totalItems={filteredTableGroups.length}
                    itemLabel="table groups"
                    onPageChange={setGroupsPage}
                    onPageSizeChange={setGroupsPageSize}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- 3C. ALL NOTES DIRECTORY VIEW (TRIMMED + PAGINATED) ---------- */}
        {section.kind === 'notes' && (
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
                    All Notes
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 pt-1">
                  All Schema &amp; Documentation Notes ({filteredNoteEntries.length})
                </h1>
              </div>

              <div className="relative w-full sm:w-72 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={notesSearch}
                  onChange={(e) => setNotesSearch(e.target.value)}
                  placeholder="Search all notes..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'project', label: 'Project' },
                  { id: 'group', label: 'Table Groups' },
                  { id: 'standalone', label: 'Note Blocks' },
                  { id: 'table', label: 'Tables' },
                  { id: 'column', label: 'Columns' },
                  { id: 'enum', label: 'Enums' },
                  { id: 'sticky', label: 'Sticky Notes' },
                ] as Array<{ id: NoteCategory; label: string }>
              )
                .filter((cat) => cat.id === 'all' || noteCategoryCounts[cat.id] > 0)
                .map((cat) => {
                  const active = noteCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNoteCategory(cat.id)}
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

            {filteredNoteEntries.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-xs text-slate-400 space-y-1.5">
                <div>
                  {allNoteEntries.length === 0
                    ? 'No notes found in this schema yet.'
                    : `No notes matching "${notesSearch}"`}
                </div>
                {allNoteEntries.length === 0 && (
                  <div>
                    Add <code className="font-mono">Note: &apos;...&apos;</code> to Project, TableGroup, Table, Column, or standalone <code className="font-mono">Note</code> blocks in DBML.
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {pagedNoteEntries.map((entry) => {
                    const { preview, words } = trimNotePreview(entry.content, 200);
                    return (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSection({ kind: 'noteDetail', entryId: entry.id });
                          mainPaneRef.current?.scrollTo({ top: 0 });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSection({ kind: 'noteDetail', entryId: entry.id });
                            mainPaneRef.current?.scrollTo({ top: 0 });
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
                  page={safeNotesPage}
                  pageSize={notesPageSize}
                  totalItems={filteredNoteEntries.length}
                  itemLabel="notes"
                  onPageChange={setNotesPage}
                  onPageSizeChange={setNotesPageSize}
                />
              </div>
            )}
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
                    onClick={() => setSection({ kind: 'groups' })}
                    className="tabular-nums hover:underline"
                  >
                    {schema.tableGroups.length} Table Groups
                  </button>
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
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setSection({ kind: 'notes' })}
                    className="tabular-nums hover:underline"
                  >
                    {allNoteEntries.length} Notes
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

            {/* Project README Card (trimmed by default on Overview, click to expand) */}
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

            {/* Standalone Project Notes Directory (trimmed preview, click to open note detail) */}
            {schema.notes.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Documentation Notes ({schema.notes.length})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSection({ kind: 'notes' });
                      mainPaneRef.current?.scrollTo({ top: 0 });
                    }}
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View all {allNoteEntries.length} notes →
                  </button>
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
                        {trimNotePreview(n.content, 160).preview}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Business Domains / TableGroup Notes Strip (trimmed preview, click to open detail) */}
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
                      onClick={() => {
                        setSection({ kind: 'groups' });
                        mainPaneRef.current?.scrollTo({ top: 0 });
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View all TableGroup notes →
                    </button>
                    {allNoteEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSection({ kind: 'notes' });
                          mainPaneRef.current?.scrollTo({ top: 0 });
                        }}
                        className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                      >
                        All Notes ({allNoteEntries.length}) →
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
                      onClick={() => {
                        setSection({ kind: 'group', groupName: g.name });
                        mainPaneRef.current?.scrollTo({ top: 0 });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSection({ kind: 'group', groupName: g.name });
                          mainPaneRef.current?.scrollTo({ top: 0 });
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
