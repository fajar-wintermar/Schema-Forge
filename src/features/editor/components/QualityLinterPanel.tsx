import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import {
  LintRuleId,
  SchemaLintIssue,
  SchemaLintResult,
} from '../../../utils/schemaLinter';

interface QualityLinterPanelProps {
  lintResult: SchemaLintResult;
  onJumpToIssue: (issue: SchemaLintIssue) => void;
  onClose: () => void;
}

const RULE_LABEL: Record<LintRuleId, string> = {
  'unindexed-fk': 'Unindexed FK',
  'missing-pk': 'Missing PK',
  'naming-convention': 'Naming',
  'nullable-unique': 'Nullable Unique',
  'circular-fk': 'Circular FK',
};

export const QualityLinterPanel: React.FC<QualityLinterPanelProps> = ({
  lintResult,
  onJumpToIssue,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'warning' | 'info'>('all');

  const filteredIssues = useMemo(() => {
    if (filter === 'all') return lintResult.issues;
    return lintResult.issues.filter((i) => i.severity === filter);
  }, [lintResult.issues, filter]);

  return (
    <section
      aria-label="Schema Quality Diagnostics"
      className="shrink-0 max-h-60 flex flex-col border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
    >
      {/* Header Bar */}
      <div className="shrink-0 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
            Schema Quality
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400 truncate">
            {lintResult.warningCount} warn · {lintResult.infoCount} info
            {lintResult.dominantNamingStyle
              ? ` · ${lintResult.dominantNamingStyle}`
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div
            role="group"
            aria-label="Filter quality diagnostics"
            className="flex items-center gap-0.5 border border-slate-200 dark:border-slate-700 rounded-md p-0.5 bg-white dark:bg-slate-900"
          >
            {(
              [
                { id: 'all', label: `All (${lintResult.issues.length})` },
                { id: 'warning', label: `Warn (${lintResult.warningCount})` },
                { id: 'info', label: `Info (${lintResult.infoCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Schema Quality panel"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Diagnostic List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
        {filteredIssues.length === 0 ? (
          <div className="px-3 py-4 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {lintResult.issues.length === 0
                ? 'All quality checks passed — keys, FK indexes, naming, and dependency graph look healthy.'
                : 'No diagnostics match the selected severity filter.'}
            </span>
          </div>
        ) : (
          filteredIssues.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onJumpToIssue(issue)}
              className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900/70 transition-colors flex items-start gap-2.5"
            >
              {issue.severity === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              ) : (
                <Info className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {RULE_LABEL[issue.ruleId]} ·{' '}
                    <span className="font-normal text-slate-700 dark:text-slate-300">
                      {issue.message}
                    </span>
                  </span>
                  {issue.line && (
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      Ln {issue.line}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                  {issue.suggestion}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
};
