import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { ParseError } from '@shared/domain/schemaTypes';
import { SchemaLintIssue, SchemaLintResult } from '../../../utils/schemaLinter';
import { QualityLinterPanel } from './QualityLinterPanel';

interface ErrorFooterProps {
  errors: ParseError[];
  problemsOpen: boolean;
  onToggleProblems: () => void;
  lintResult?: SchemaLintResult;
  qualityOpen: boolean;
  onToggleQuality: () => void;
  onCloseQuality: () => void;
  onJumpToLintIssue: (issue: SchemaLintIssue) => void;
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
  lintResult,
  qualityOpen,
  onToggleQuality,
  onCloseQuality,
  onJumpToLintIssue,
  onJumpToLine,
  isModular,
  otherFileErrorEntries,
  otherFileErrorsCount,
  onSelectFile,
  lineCount,
  modKey,
  onOpenGotoLine,
}) => {
  const lintTotal = lintResult?.issues.length ?? 0;
  const lintWarnings = lintResult?.warningCount ?? 0;

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

      {qualityOpen && lintResult && (
        <QualityLinterPanel
          lintResult={lintResult}
          onJumpToIssue={onJumpToLintIssue}
          onClose={onCloseQuality}
        />
      )}

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 bg-slate-50/80 dark:bg-slate-900/70 text-[11px] space-y-1">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {errors.length === 0 ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isModular ? 'Valid DBML (merged check)' : 'Valid DBML syntax'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onToggleProblems}
                className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium min-w-0 flex-1 text-left hover:underline"
                title="Click to view all syntax & reference checks"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate min-w-0">
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

            {lintResult && errors.length === 0 && otherFileErrorsCount === 0 && (
              <>
                <span className="text-slate-300 dark:text-slate-700 shrink-0">·</span>
                <button
                  type="button"
                  onClick={onToggleQuality}
                  aria-expanded={qualityOpen}
                  title="Toggle non-blocking Schema Quality Linter diagnostics"
                  className={`flex items-center gap-1 font-medium whitespace-nowrap shrink-0 hover:underline ${
                    lintWarnings > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : lintTotal > 0
                      ? 'text-sky-700 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {lintWarnings > 0 ? (
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                  ) : lintTotal > 0 ? (
                    <Info className="w-3 h-3 shrink-0" />
                  ) : null}
                  <span className="tabular-nums">
                    {lintTotal === 0
                      ? 'Quality clean'
                      : `${lintTotal} quality ${
                          lintTotal === 1 ? 'hint' : 'hints'
                        }`}
                  </span>
                  {qualityOpen ? (
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  ) : (
                    <ChevronUp className="w-3 h-3 shrink-0" />
                  )}
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenGotoLine}
            title={`Go to line (${modKey}G)`}
            className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 tabular-nums shrink-0 whitespace-nowrap"
          >
            {lineCount} lines · {modKey}G
          </button>
        </div>

        {(errors.length > 0 || otherFileErrorsCount > 0) &&
          (lintResult || (otherFileErrorsCount > 0 && otherFileErrorEntries[0] && onSelectFile)) && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10.5px]">
              {lintResult && (
                <button
                  type="button"
                  onClick={onToggleQuality}
                  aria-expanded={qualityOpen}
                  title="Toggle non-blocking Schema Quality Linter diagnostics"
                  className={`flex items-center gap-1 font-medium whitespace-nowrap shrink-0 hover:underline ${
                    lintWarnings > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : lintTotal > 0
                      ? 'text-sky-700 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {lintWarnings > 0 ? (
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                  ) : lintTotal > 0 ? (
                    <Info className="w-3 h-3 shrink-0" />
                  ) : null}
                  <span className="tabular-nums">
                    {lintTotal === 0
                      ? 'Quality clean'
                      : `${lintTotal} quality ${
                          lintTotal === 1 ? 'hint' : 'hints'
                        }`}
                  </span>
                  {qualityOpen ? (
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  ) : (
                    <ChevronUp className="w-3 h-3 shrink-0" />
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
          )}
      </div>
    </>
  );
};
