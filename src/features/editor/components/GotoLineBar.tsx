import React from 'react';
import { X } from 'lucide-react';

interface GotoLineBarProps {
  gotoInputRef: React.RefObject<HTMLInputElement | null>;
  gotoValue: string;
  onGotoValueChange: (val: string) => void;
  totalLines: number;
  onSubmit: () => void;
  onClose: () => void;
}

export const GotoLineBar: React.FC<GotoLineBarProps> = ({
  gotoInputRef,
  gotoValue,
  onGotoValueChange,
  totalLines,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 px-2.5 py-2 flex items-center gap-2 z-30">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
        Go to line:
      </span>
      <input
        ref={gotoInputRef}
        type="text"
        value={gotoValue}
        onChange={(e) => onGotoValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={`1–${totalLines} (or line:col)`}
        aria-label="Go to line number"
        className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      />
      <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
        / {totalLines}
      </span>
      <button
        type="button"
        onClick={onSubmit}
        className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap"
      >
        Go
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close Go to Line bar"
        className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
