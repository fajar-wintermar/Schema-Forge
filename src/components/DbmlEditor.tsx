import React, { useEffect, useMemo, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Plus,
} from 'lucide-react';
import { ParseError } from '../types/schema';

interface DbmlEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: ParseError[];
  scrollToLine?: number | null;
  enumNames?: string[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  modKey?: string;
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

const TOP_KEYWORDS = new Set([
  'project',
  'table',
  'tablegroup',
  'ref',
  'enum',
  'indexes',
  'note',
  'as',
]);

const SETTING_KEYWORDS = new Set([
  'pk',
  'primary',
  'key',
  'unique',
  'not',
  'null',
  'increment',
  'default',
  'note',
  'headercolor',
  'color',
  'ref',
  'delete',
  'update',
  'name',
  'type',
  'cascade',
  'restrict',
  'no',
  'action',
  'set',
  'database_type',
]);

const BUILTIN_TYPES = new Set([
  'uuid',
  'varchar',
  'char',
  'character',
  'text',
  'integer',
  'int',
  'int2',
  'int4',
  'int8',
  'bigint',
  'smallint',
  'tinyint',
  'boolean',
  'bool',
  'timestamptz',
  'timestamp',
  'datetime',
  'date',
  'time',
  'jsonb',
  'json',
  'decimal',
  'numeric',
  'double',
  'float',
  'float4',
  'float8',
  'real',
  'serial',
  'bigserial',
  'smallserial',
  'bytea',
  'blob',
  'enum',
  'money',
  'inet',
  'cidr',
  'interval',
]);

interface HighlightSegment {
  text: string;
  className: string;
}

function tokenizeForHighlight(
  code: string,
  enumNameSet: Set<string>
): HighlightSegment[][] {
  const lines: HighlightSegment[][] = [[]];
  let i = 0;
  const len = code.length;
  let bracketDepth = 0;
  let braceDepth = 0;
  let lineWordIndex = 0;
  let blockKind: 'table' | 'enum' | 'tablegroup' | 'project' | 'indexes' | null =
    null;

  const pushSeg = (text: string, className: string) => {
    const parts = text.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) {
        lines.push([]);
        lineWordIndex = 0;
      }
      if (part.length > 0) {
        lines[lines.length - 1].push({ text: part, className });
      }
    });
  };

  while (i < len) {
    const ch = code[i];

    if (ch === '\n') {
      lines.push([]);
      lineWordIndex = 0;
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      let ws = '';
      while (i < len && (code[i] === ' ' || code[i] === '\t' || code[i] === '\r')) {
        ws += code[i];
        i++;
      }
      lines[lines.length - 1].push({ text: ws, className: '' });
      continue;
    }

    // Single-line comment
    if (ch === '/' && code[i + 1] === '/') {
      let comment = '';
      while (i < len && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      pushSeg(comment, 'text-slate-400 dark:text-slate-500 italic');
      continue;
    }

    // Multi-line comment
    if (ch === '/' && code[i + 1] === '*') {
      let comment = '/*';
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
        comment += code[i];
        i++;
      }
      if (i < len) {
        comment += '*/';
        i += 2;
      }
      pushSeg(comment, 'text-slate-400 dark:text-slate-500 italic');
      continue;
    }

    // Triple-quoted string
    if (code.slice(i, i + 3) === "'''") {
      let str = "'''";
      i += 3;
      while (i < len && code.slice(i, i + 3) !== "'''") {
        str += code[i];
        i++;
      }
      if (i < len) {
        str += "'''";
        i += 3;
      }
      pushSeg(str, 'text-amber-700 dark:text-amber-300');
      lineWordIndex++;
      continue;
    }

    // Single, double, or backtick quoted string
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let str = quote;
      i++;
      while (i < len && code[i] !== quote) {
        if (code[i] === '\\' && i + 1 < len) {
          str += code[i] + code[i + 1];
          i += 2;
        } else {
          str += code[i];
          i++;
        }
      }
      if (i < len) {
        str += code[i];
        i++;
      }
      pushSeg(
        str,
        quote === '`'
          ? 'text-cyan-700 dark:text-cyan-300'
          : 'text-amber-700 dark:text-amber-300'
      );
      lineWordIndex++;
      continue;
    }

    // Hex color
    if (ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(code.slice(i))) {
      const match = code.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
      pushSeg(match[0], 'text-pink-600 dark:text-pink-400 font-medium');
      i += match[0].length;
      lineWordIndex++;
      continue;
    }

    // Symbols
    if (ch === '<' && code[i + 1] === '>') {
      pushSeg('<>', 'text-blue-600 dark:text-blue-400 font-semibold');
      i += 2;
      continue;
    }

    if ('{}[]():,.<>-'.includes(ch)) {
      if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        if (braceDepth === 0) blockKind = null;
      }

      const isRelOp = '<>-'.includes(ch) && bracketDepth === 0;
      pushSeg(
        ch,
        isRelOp
          ? 'text-blue-600 dark:text-blue-400 font-semibold'
          : 'text-slate-400 dark:text-slate-500'
      );
      i++;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9.]/.test(code[i])) {
        num += code[i];
        i++;
      }
      pushSeg(num, 'text-orange-600 dark:text-orange-400');
      lineWordIndex++;
      continue;
    }

    // Word / identifier
    let word = '';
    while (
      i < len &&
      !/[\s{}\[\]():,.<>'"`\-]/.test(code[i]) &&
      !(code[i] === '/' && (code[i + 1] === '/' || code[i + 1] === '*'))
    ) {
      word += code[i];
      i++;
    }

    const lower = word.toLowerCase();
    let cls = 'text-slate-900 dark:text-slate-100';

    if (TOP_KEYWORDS.has(lower) && bracketDepth === 0 && lineWordIndex === 0) {
      cls = 'text-violet-600 dark:text-violet-400 font-semibold';
      if (
        lower === 'table' ||
        lower === 'enum' ||
        lower === 'tablegroup' ||
        lower === 'project' ||
        lower === 'indexes'
      ) {
        blockKind = lower;
      }
    } else if (lower === 'as' && braceDepth === 0) {
      cls = 'text-violet-600 dark:text-violet-400 font-semibold';
    } else if (bracketDepth > 0 && SETTING_KEYWORDS.has(lower)) {
      cls = 'text-sky-600 dark:text-sky-400 font-medium';
    } else if (
      blockKind === 'table' &&
      braceDepth === 1 &&
      bracketDepth === 0 &&
      lineWordIndex === 1 &&
      (BUILTIN_TYPES.has(lower) || enumNameSet.has(lower) || enumNameSet.has(word))
    ) {
      cls = 'text-emerald-600 dark:text-emerald-400 font-medium';
    } else if (
      blockKind === 'table' &&
      braceDepth === 1 &&
      bracketDepth === 0 &&
      lineWordIndex === 1
    ) {
      // Custom enum/domain type in second position on column line
      cls = 'text-emerald-600 dark:text-emerald-400 font-medium';
    } else if (
      braceDepth === 0 &&
      lineWordIndex === 1 &&
      (blockKind === 'table' || blockKind === 'enum' || blockKind === 'project')
    ) {
      cls = 'text-blue-700 dark:text-blue-300 font-semibold';
    } else if (
      (lower === 'true' || lower === 'false' || lower === 'null') &&
      bracketDepth > 0
    ) {
      cls = 'text-orange-600 dark:text-orange-400';
    }

    pushSeg(word, cls);
    lineWordIndex++;
  }

  return lines;
}

export const DbmlEditor: React.FC<DbmlEditorProps> = ({
  value,
  onChange,
  errors,
  scrollToLine,
  enumNames = [],
  isMaximized = false,
  onToggleMaximize,
  onMinimize,
  modKey = '⌘',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lines = value.split('\n');
  const errorLineSet = useMemo(
    () => new Set(errors.map((e) => e.line)),
    [errors]
  );

  const enumNameSet = useMemo(
    () => new Set(enumNames.flatMap((n) => [n, n.toLowerCase()])),
    [enumNames]
  );

  const highlightedLines = useMemo(
    () => tokenizeForHighlight(value, enumNameSet),
    [value, enumNameSet]
  );

  useEffect(() => {
    if (!scrollToLine || !textareaRef.current) return;
    const lineHeight = 20;
    const targetTop = Math.max(0, (scrollToLine - 4) * lineHeight);
    textareaRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollToLine]);

  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop;
      highlightRef.current.scrollLeft = scrollLeft;
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

          {(onToggleMaximize || onMinimize) && (
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          )}

          {onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={
                isMaximized
                  ? `Restore split view (${modKey}⇧E)`
                  : `Maximize editor (${modKey}⇧E)`
              }
              aria-label={isMaximized ? 'Restore split view' : 'Maximize editor'}
              className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title={`Minimize editor (${modKey}\\)`}
              aria-label="Minimize editor"
              className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Editor Body with Synchronized Syntax Highlighting */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        <div
          ref={lineNumbersRef}
          className="w-11 shrink-0 py-3 pr-2 text-right font-mono text-[12px] leading-[20px] text-slate-400 dark:text-slate-600 bg-slate-50/60 dark:bg-slate-900/40 border-r border-slate-200/70 dark:border-slate-800/80 select-none overflow-hidden tabular-nums"
        >
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const hasErr = errorLineSet.has(lineNum);
            const isActiveLine = scrollToLine === lineNum;
            return (
              <div
                key={lineNum}
                className={
                  hasErr
                    ? 'text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40'
                    : isActiveLine
                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/30'
                    : ''
                }
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-0 h-full overflow-hidden">
          <pre
            ref={highlightRef}
            aria-hidden="true"
            style={{ tabSize: 2, fontVariantLigatures: 'none' }}
            className="absolute inset-0 m-0 py-3 px-3 font-mono text-[12.5px] leading-[20px] whitespace-pre overflow-hidden pointer-events-none select-none"
          >
            {highlightedLines.map((segs, lineIdx) => {
              const lineNum = lineIdx + 1;
              const hasErr = errorLineSet.has(lineNum);
              const isHighlighted = scrollToLine === lineNum;
              return (
                <div
                  key={lineIdx}
                  className={
                    hasErr
                      ? 'bg-rose-50/80 dark:bg-rose-950/30 -mx-3 px-3'
                      : isHighlighted
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 -mx-3 px-3'
                      : ''
                  }
                >
                  {segs.length === 0 ? (
                    <span>{'\u200b'}</span>
                  ) : (
                    segs.map((seg, sIdx) => (
                      <span key={sIdx} className={seg.className}>
                        {seg.text}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </pre>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label="DBML Source Code Editor"
            style={{ tabSize: 2, fontVariantLigatures: 'none' }}
            className="relative z-10 w-full h-full py-3 px-3 font-mono text-[12.5px] leading-[20px] bg-transparent text-transparent caret-slate-900 dark:caret-slate-100 resize-none focus:outline-none overflow-auto selection:bg-blue-500/25"
          />
        </div>
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
