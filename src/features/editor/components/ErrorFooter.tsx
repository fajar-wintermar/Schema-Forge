import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ParseError } from '../../../types/schema';

interface ErrorFooterProps {
  errors: ParseError[];
  problemsOpen: boolean;
  onToggleProblems: () => void;
  onJumpToLine: (line: number) => void;
  isModular: boolean;
  otherFileErrorEntries: Array<[string, ParseError[]]>;
  otherFileErrorsCount: number;
  onSelectFile?: (path: string) => void;
  lineCount: number;
  modKey: string;
  onOpenGotoLine: () => void;
}

export const ErrorFooter: React.FC<ErrorFooterProps> = ({
  errors,
  problemsOpen,
  onToggleProblems,
  onJumpToLine,
  isModular,
  otherFileErrorEntries,
  otherFileErrorsCount,
  onSelectFile,
  lineCount,
  modKey,
  onOpenGotoLine,
}) => {
  return (
    <>
      {errors.length > 0 && problemsOpen && (
        <div className="shrink-0 max-h-36 overflow-y-auto border-t border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 divide-y divide-rose-200/60 dark:divide-rose-900/40">
          {errors.map((err, idx) => (
            <button
              key={`${err.line}:${idx}`}
              type="button"
              onClick={() => onJumpToLine(err.line)}
              className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-300 hover:bg-rose-100/70 dark:hover:bg-rose-900/30 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              <span className="font-mono font-semibold shrink-0">
                Ln {err.line}
              </span>
              <span className="truncate">{err.message}</span>
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 bg-slate-50/80 dark:bg-slate-900/70 text-[11px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {errors.length === 0 ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isModular ? 'Valid DBML (merged check)' : 'Valid DBML syntax'}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggleProblems}
              className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium truncate hover:underline"
              title="Click to view all syntax & reference checks"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {errors.length} {errors.length === 1 ? 'error' : 'errors'} · Ln{' '}
                {errors[0].line}: {errors[0].message}
              </span>
              {problemsOpen ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          )}

          {otherFileErrorsCount > 0 && otherFileErrorEntries[0] && onSelectFile && (
            <button
              type="button"
              onClick={() => onSelectFile(otherFileErrorEntries[0][0])}
              className="text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap shrink-0"
              title={`Jump to ${otherFileErrorEntries[0][0]}`}
            >
              {otherFileErrorsCount} in {otherFileErrorEntries[0][0]} →
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenGotoLine}
          title={`Go to line (${modKey}G)`}
          className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 tabular-nums shrink-0"
        >
          {lineCount} lines · {modKey}G
        </button>
      </div>
    </>
  );
};
