import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, Maximize2, X } from 'lucide-react';
import { SchemaDiffResult, SqlDialect } from '../types/schema';
import { generateSqlMigration, SqlMigrationOptions } from '../utils/schemaDiff';
import { highlightSql } from '../utils/highlight/dbmlAndSql';
import { TOKEN_CLASS_MAP } from '../utils/highlight/types';

export interface SqlMigrationViewerProps {
  diff: SchemaDiffResult;
  dialect: SqlDialect;
  onChangeDialect: (dialect: SqlDialect) => void;
  options?: SqlMigrationOptions;
  downloadFilename?: string;
  maxHeightClass?: string;
  allowExpand?: boolean;
  compact?: boolean;
}

export const SqlMigrationViewer: React.FC<SqlMigrationViewerProps> = ({
  diff,
  dialect,
  onChangeDialect,
  options,
  downloadFilename,
  maxHeightClass = 'max-h-72',
  allowExpand = true,
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const sql = useMemo(
    () => generateSqlMigration(diff, dialect, options),
    [diff, dialect, options]
  );

  const highlightedLines = useMemo(
    () => highlightSql(sql.split('\n')),
    [sql]
  );

  const resolvedFilename = useMemo(() => {
    if (downloadFilename) return downloadFilename;
    const slug = (s?: string) =>
      (s || 'schema')
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `migration_${slug(options?.baseLabel)}_to_${slug(
      options?.targetLabel
    )}_${dialect}.sql`;
  }, [downloadFilename, options?.baseLabel, options?.targetLabel, dialect]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard write errors
    }
  };

  const handleDownload = () => {
    const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resolvedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderCodeBlock = (heightClass: string) => (
    <div
      className={`${heightClass} overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed select-text`}
    >
      <pre className="m-0 whitespace-pre">
        {highlightedLines.map((tokens, lineIdx) => (
          <div key={lineIdx} className="min-h-[1.25em]">
            {tokens.length === 0
              ? ' '
              : tokens.map((tok, tIdx) => (
                  <span key={tIdx} className={TOKEN_CLASS_MAP[tok.type]}>
                    {tok.text}
                  </span>
                ))}
          </div>
        ))}
      </pre>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {(['postgres', 'mysql'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDialect(d)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                dialect === d
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {d === 'postgres' ? 'PostgreSQL' : 'MySQL'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Copy SQL migration script"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            {!compact && <span>{copied ? 'Copied' : 'Copy'}</span>}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            title={`Download ${resolvedFilename}`}
          >
            <Download className="w-3 h-3" />
            {!compact && <span>.sql</span>}
          </button>

          {allowExpand && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              title="Open full SQL migration preview"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {renderCodeBlock(maxHeightClass)}

      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  Incremental SQL Migration ({dialect === 'postgres' ? 'PostgreSQL' : 'MySQL'})
                </h3>
                {(options?.baseLabel || options?.targetLabel) && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {options.baseLabel || 'Base'} → {options.targetLabel || 'Target'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex items-center p-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {(['postgres', 'mysql'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onChangeDialect(d)}
                      className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                        dialect === d
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {d === 'postgres' ? 'PostgreSQL' : 'MySQL'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy SQL'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .sql</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-hidden">
              {renderCodeBlock('h-[65vh]')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
