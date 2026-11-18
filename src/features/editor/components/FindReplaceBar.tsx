import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from 'lucide-react';

interface FindReplaceBarProps {
  modKey: string;
  findInputRef: React.RefObject<HTMLInputElement | null>;
  replaceInputRef: React.RefObject<HTMLInputElement | null>;
  findQuery: string;
  onFindQueryChange: (val: string) => void;
  replaceQuery: string;
  onReplaceQueryChange: (val: string) => void;
  replaceOpen: boolean;
  onToggleReplace: () => void;
  matchCase: boolean;
  onToggleMatchCase: () => void;
  wholeWord: boolean;
  onToggleWholeWord: () => void;
  matchCount: number;
  safeMatchIdx: number;
  onGoToMatch: (idx: number) => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  modKey,
  findInputRef,
  replaceInputRef,
  findQuery,
  onFindQueryChange,
  replaceQuery,
  onReplaceQueryChange,
  replaceOpen,
  onToggleReplace,
  matchCase,
  onToggleMatchCase,
  wholeWord,
  onToggleWholeWord,
  matchCount,
  safeMatchIdx,
  onGoToMatch,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}) => {
  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 px-2.5 py-2 space-y-1.5 z-30">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleReplace}
          title={replaceOpen ? 'Hide Replace' : `Show Replace (${modKey}H)`}
          aria-label="Toggle replace row"
          className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0"
        >
          {replaceOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        <div className="relative flex-1 min-w-0 flex items-center">
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => onFindQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                onGoToMatch(e.shiftKey ? safeMatchIdx - 1 : safeMatchIdx + 1);
              }
            }}
            placeholder="Find..."
            aria-label="Find text in DBML editor"
            className="w-full pl-2.5 pr-14 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <div className="absolute right-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={onToggleMatchCase}
              title="Match Case"
              aria-label="Match Case"
              className={`p-1 rounded transition-colors ${
                matchCase
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <CaseSensitive className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleWholeWord}
              title="Match Whole Word"
              aria-label="Match Whole Word"
              className={`p-1 rounded transition-colors ${
                wholeWord
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <WholeWord className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <span
          className={`text-[11px] font-mono tabular-nums whitespace-nowrap min-w-[54px] text-center ${
            findQuery && matchCount === 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {!findQuery
            ? '0/0'
            : matchCount === 0
            ? 'No match'
            : `${safeMatchIdx + 1} of ${matchCount}`}
        </span>

        <button
          type="button"
          disabled={matchCount === 0}
          onClick={() => onGoToMatch(safeMatchIdx - 1)}
          title="Previous Match (Shift+Enter)"
          aria-label="Previous Match"
          className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={matchCount === 0}
          onClick={() => onGoToMatch(safeMatchIdx + 1)}
          title="Next Match (Enter)"
          aria-label="Next Match"
          className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close Find bar"
          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {replaceOpen && (
        <div className="flex items-center gap-1.5 pl-6">
          <input
            ref={replaceInputRef}
            type="text"
            value={replaceQuery}
            onChange={(e) => onReplaceQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) {
                e.preventDefault();
                onReplaceAll();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                onReplaceCurrent();
              }
            }}
            placeholder="Replace with..."
            aria-label="Replacement text"
            className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <button
            type="button"
            disabled={matchCount === 0}
            onClick={onReplaceCurrent}
            title="Replace Current Match (Enter)"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap"
          >
            <Replace className="w-3 h-3" />
            <span>Replace</span>
          </button>
          <button
            type="button"
            disabled={matchCount === 0}
            onClick={onReplaceAll}
            title="Replace All Matches"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-[11px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
          >
            <ReplaceAll className="w-3 h-3" />
            <span>All</span>
          </button>
        </div>
      )}
    </div>
  );
};
