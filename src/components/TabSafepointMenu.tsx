import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  History,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { formatSafepointBadge, TabSafepoint } from '../utils/tabSafepoints';

interface TabSafepointMenuProps {
  safepoints: TabSafepoint[];
  hasPendingChanges: boolean;
  onPinNow: () => void;
  onRestore: (safepointId: string) => void;
  onDelete: (safepointId: string) => void;
  onClearAll: () => void;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const TabSafepointMenu: React.FC<TabSafepointMenuProps> = ({
  safepoints,
  hasPendingChanges,
  onPinNow,
  onRestore,
  onDelete,
  onClearAll,
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Tab Safepoints — auto-saved when moving between Split, Diagram, and Docs"
        className={`relative flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
          open
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <History className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden xl:inline">Safepoints</span>
        {safepoints.length > 0 && (
          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
            {safepoints.length}
          </span>
        )}
        {hasPendingChanges && (
          <span
            aria-label="Pending changes will auto-checkpoint on tab switch"
            title="Changes ready for automatic safepoint on next tab switch"
            className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tab Safepoints"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Tab Safepoints</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Auto-saved whenever you switch Split, Diagram, or Docs
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onPinNow}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                title="Create a manual safepoint right now"
              >
                <BookmarkPlus className="w-3 h-3" />
                <span>Pin</span>
              </button>
              {safepoints.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Clear all tab safepoints"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {safepoints.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  No tab safepoints captured yet
                </p>
                <p className="text-[11px] leading-relaxed">
                  Edit DBML, rearrange tables, or update docs notes—when you switch
                  between Split, Diagram, and Docs, a recoverable safepoint of what
                  you did is automatically saved here.
                </p>
              </div>
            ) : (
              safepoints.map((sp) => (
                <div
                  key={sp.id}
                  className="px-3.5 py-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        sp.reason === 'manual'
                          ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                          : sp.reason === 'pre-restore'
                          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                          : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {formatSafepointBadge(sp)}
                    </span>
                    <span
                      className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums shrink-0"
                      title={formatClock(sp.createdAt)}
                    >
                      {formatRelativeTime(sp.createdAt)} · {formatClock(sp.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-snug mb-1.5">
                    {sp.summary}
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                      {sp.highlights.map((tag, idx) => (
                        <span
                          key={`${sp.id}-${idx}`}
                          className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                        {sp.tableCount} {sp.tableCount === 1 ? 'table' : 'tables'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onRestore(sp.id);
                          setOpen(false);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 dark:hover:border-blue-700 text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        title="Restore schema, layout, and view to this safepoint"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(sp.id)}
                        className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Remove safepoint"
                        aria-label="Remove safepoint"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
