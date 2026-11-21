import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Code2,
  FileCode2,
  FileText,
  KeyRound,
  Layers,
  LayoutGrid,
  Puzzle,
  Search,
  Table2,
  X,
  Zap,
} from 'lucide-react';
import {
  ParsedSchema,
  SchemaModuleFile,
  StickyNote,
  ViewMode,
} from '../../types/schema';
import {
  buildCommandItems,
  CommandFilterTab,
  CommandItem,
  CommandTargetView,
  searchCommandItems,
} from './commandSearch';

interface CommandPaletteModalProps {
  open: boolean;
  schema: ParsedSchema;
  stickyNotes: StickyNote[];
  schemaFiles?: SchemaModuleFile[];
  schemaFolder?: string;
  viewMode: ViewMode;
  modKey: string;
  readOnly?: boolean;
  onClose: () => void;
  onSelectCommand: (item: CommandItem, target: CommandTargetView) => void;
}

const FILTER_TABS: Array<{ id: CommandFilterTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'table', label: 'Tables' },
  { id: 'column', label: 'Columns' },
  { id: 'group', label: 'Domains' },
  { id: 'note', label: 'Notes' },
  { id: 'file', label: 'Modules' },
  { id: 'partial', label: 'Partials' },
  { id: 'action', label: 'Actions' },
];

function renderHighlightedText(text: string, indices: number[]): React.ReactNode {
  if (!indices || indices.length === 0) return text;
  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let buffer = '';
  let bufMatched = set.has(0);

  for (let i = 0; i < text.length; i++) {
    const matched = set.has(i);
    if (matched === bufMatched) {
      buffer += text[i];
    } else {
      if (buffer) {
        parts.push(
          bufMatched ? (
            <mark
              key={i}
              className="bg-blue-500/15 dark:bg-blue-400/25 text-blue-700 dark:text-blue-300 rounded-[2px] font-semibold"
            >
              {buffer}
            </mark>
          ) : (
            <span key={i}>{buffer}</span>
          )
        );
      }
      buffer = text[i];
      bufMatched = matched;
    }
  }
  if (buffer) {
    parts.push(
      bufMatched ? (
        <mark
          key="end"
          className="bg-blue-500/15 dark:bg-blue-400/25 text-blue-700 dark:text-blue-300 rounded-[2px] font-semibold"
        >
          {buffer}
        </mark>
      ) : (
        <span key="end">{buffer}</span>
      )
    );
  }
  return parts;
}

function getItemTargets(
  item: CommandItem,
  readOnly: boolean
): {
  canCode: boolean;
  canDiagram: boolean;
  canDocs: boolean;
} {
  if (item.kind === 'action') {
    return { canCode: false, canDiagram: false, canDocs: false };
  }
  if (item.kind === 'file') {
    return { canCode: !readOnly, canDiagram: false, canDocs: false };
  }
  return {
    canCode: !readOnly && Boolean(item.line || item.filePath),
    canDiagram: Boolean(item.tableId || item.groupName),
    canDocs: Boolean(item.docsSection),
  };
}

function renderItemIcon(item: CommandItem) {
  switch (item.kind) {
    case 'table':
      return <Table2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />;
    case 'column':
      return (
        <KeyRound
          className={`w-4 h-4 shrink-0 ${
            item.isPk
              ? 'text-amber-500'
              : 'text-emerald-600 dark:text-emerald-400'
          }`}
        />
      );
    case 'group':
      return <Layers className="w-4 h-4 text-violet-500 shrink-0" />;
    case 'partial':
      return <Puzzle className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />;
    case 'note':
      return <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    case 'file':
      return <FileCode2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
    case 'action':
      return <Zap className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />;
  }
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  schema,
  stickyNotes,
  schemaFiles,
  schemaFolder = 'schema',
  viewMode,
  modKey,
  readOnly = false,
  onClose,
  onSelectCommand,
}) => {
  const [query, setQuery] = useState('');
  const [filterTab, setFilterTab] = useState<CommandFilterTab>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const allItems = useMemo(
    () =>
      open
        ? buildCommandItems({ schema, stickyNotes, schemaFiles, schemaFolder })
        : [],
    [open, schema, stickyNotes, schemaFiles, schemaFolder]
  );

  const visibleTabs = useMemo(() => {
    const presentKinds = new Set(allItems.map((i) => i.kind));
    return FILTER_TABS.filter(
      (t) => t.id === 'all' || presentKinds.has(t.id)
    );
  }, [allItems]);

  const results = useMemo(
    () => searchCommandItems(allItems, query, filterTab, 45),
    [allItems, query, filterTab]
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setFilterTab('all');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, filterTab]);

  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  const choose = (item: CommandItem, target: CommandTargetView = 'auto') => {
    onSelectCommand(item, target);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const idx = visibleTabs.findIndex((t) => t.id === filterTab);
      const nextIdx = e.shiftKey
        ? (idx - 1 + visibleTabs.length) % visibleTabs.length
        : (idx + 1) % visibleTabs.length;
      setFilterTab(visibleTabs[nextIdx].id);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length > 0 ? (prev + 1) % results.length : 0
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
      return;
    }
    if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      const chosen = results[activeIndex].item;
      const targets = getItemTargets(chosen, readOnly);
      if (e.altKey && targets.canDocs) {
        choose(chosen, 'docs');
      } else if (e.shiftKey && targets.canCode) {
        choose(chosen, 'editor');
      } else {
        choose(chosen, 'auto');
      }
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-start justify-center pt-[9vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Global Command Palette"
        className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Search Input Row */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to table, column, domain, Markdown note, .dbml file, or action..."
            className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
            Esc
          </kbd>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => {
            const active = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilterTab(tab.id);
                  inputRef.current?.focus();
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] font-mono text-slate-400 hidden sm:inline whitespace-nowrap pl-2">
            View: <span className="capitalize">{viewMode}</span>
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-[52vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
          {results.length === 0 ? (
            <div className="py-12 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No matching tables, columns, domains, notes, or `.dbml` files for &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.map(({ item, titleMatches }, idx) => {
              const isActive = idx === activeIndex;
              const targets = getItemTargets(item, readOnly);

              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => choose(item, 'auto')}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/50'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {renderItemIcon(item)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.accentColor && (
                          <span
                            className="w-2 h-2 rounded-xs shrink-0"
                            style={{ backgroundColor: item.accentColor }}
                          />
                        )}
                        <span
                          className={`text-xs truncate ${
                            item.kind === 'action' || item.kind === 'note'
                              ? 'font-semibold'
                              : 'font-mono font-semibold'
                          } text-slate-900 dark:text-slate-100`}
                        >
                          {renderHighlightedText(item.title, titleMatches)}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive &&
                      (targets.canCode || targets.canDiagram || targets.canDocs) && (
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {targets.canCode && (
                            <button
                              type="button"
                              onClick={() => choose(item, 'editor')}
                              title="Jump in Code Editor (Shift+Enter)"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <Code2 className="w-3 h-3" />
                              <span className="hidden sm:inline">Code</span>
                            </button>
                          )}
                          {targets.canDiagram && (
                            <button
                              type="button"
                              onClick={() => choose(item, 'diagram')}
                              title="Focus on ERD Diagram"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <LayoutGrid className="w-3 h-3" />
                              <span className="hidden sm:inline">Diagram</span>
                            </button>
                          )}
                          {targets.canDocs && (
                            <button
                              type="button"
                              onClick={() => choose(item, 'docs')}
                              title="Open in Docs (Alt+Enter)"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span className="hidden sm:inline">Docs</span>
                            </button>
                          )}
                        </div>
                      )}

                    {item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span>↑↓ Navigate</span>
            <span>↵ Jump</span>
            {!readOnly && <span className="hidden sm:inline">⇧↵ Code</span>}
            <span className="hidden sm:inline">⌥↵ Docs</span>
            <span className="hidden sm:inline">Tab Filter</span>
          </div>
          <span className="font-mono text-[10px]">
            {results.length} {results.length === 1 ? 'result' : 'results'} · {modKey}K
          </span>
        </div>
      </div>
    </div>
  );
};
