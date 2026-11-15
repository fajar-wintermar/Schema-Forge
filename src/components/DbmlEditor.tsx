import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Code2, Plus } from 'lucide-react';
import { ParseError } from '../types/schema';

interface DbmlEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: ParseError[];
  scrollToLine?: number | null;
}

const SNIPPETS = [
  {
    label: '+ Table',
    code: `\nTable new_entity [headercolor: #1e3a8a] {\n  id uuid [pk, not null]\n  name varchar(120) [not null]\n  created_at timestamptz [default: \`now()\`]\n}\n`,
  },
  {
    label: '+ TableGroup',
    code: `\nTableGroup "New Domain" [color: #2563EB] {\n  Note: 'Describe business logic for this domain'\n}\n`,
  },
  {
    label: '+ Ref',
    code: `\nRef: child_table.parent_id > parent_table.id [delete: cascade]\n`,
  },
];

export const DbmlEditor: React.FC<DbmlEditorProps> = ({
  value,
  onChange,
  errors,
  scrollToLine,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lines = value.split('\n');
  const errorLineSet = new Set(errors.map((e) => e.line));

  useEffect(() => {
    if (!scrollToLine || !textareaRef.current) return;
    const lineHeight = 20;
    const targetTop = Math.max(0, (scrollToLine - 3) * lineHeight);
    textareaRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollToLine]);

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.substring(0, start) + '  ' + value.substring(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  const insertSnippet = (snippet: string) => {
    onChange(value.trimEnd() + '\n' + snippet);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800">
      {/* Editor Toolbar */}
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
          <Code2 className="w-3.5 h-3.5 text-slate-400" />
          <span>schema.dbml</span>
        </div>
        <div className="flex items-center gap-1">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => insertSnippet(s.code)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <Plus className="w-2.5 h-2.5" />
              <span>{s.label.replace('+ ', '')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Editor Body */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        <div
          ref={lineNumbersRef}
          className="w-11 shrink-0 py-3 pr-2 text-right font-mono text-[12px] leading-[20px] text-slate-400 dark:text-slate-600 bg-slate-50/60 dark:bg-slate-900/40 border-r border-slate-200/70 dark:border-slate-800/80 select-none overflow-hidden tabular-nums"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const hasErr = errorLineSet.has(lineNum);
            return (
              <div
                key={lineNum}
                className={
                  hasErr
                    ? 'text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40'
                    : ''
                }
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          wrap="off"
          aria-label="DBML Source Code Editor"
          className="flex-1 w-full h-full py-3 px-3 font-mono text-[12.5px] leading-[20px] bg-transparent text-slate-900 dark:text-slate-100 resize-none focus:outline-none overflow-auto"
        />
      </div>

      {/* Diagnostics Footer */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 bg-slate-50/80 dark:bg-slate-900/70 text-[11px] flex items-center justify-between gap-2">
        {errors.length === 0 ? (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valid DBML syntax</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium truncate">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              Line {errors[0].line}: {errors[0].message}
            </span>
          </div>
        )}
        <span className="text-slate-400 tabular-nums shrink-0">
          {lines.length} lines
        </span>
      </div>
    </div>
  );
};
