import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Plus,
} from 'lucide-react';
import { ParseError, TableDef } from '../types/schema';

interface DbmlEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: ParseError[];
  scrollToLine?: number | null;
  enumNames?: string[];
  tables?: TableDef[];
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

interface AutocompleteItem {
  label: string;
  insertText: string;
  kind: 'keyword' | 'type' | 'enum' | 'table' | 'column' | 'setting' | 'snippet';
  detail?: string;
  cursorOffsetBack?: number;
}

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

    if (ch === '/' && code[i + 1] === '/') {
      let comment = '';
      while (i < len && code[i] !== '\n') {
        comment += code[i];
        i++;
      }
      pushSeg(comment, 'text-slate-400 dark:text-slate-500');
      continue;
    }

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
      pushSeg(comment, 'text-slate-400 dark:text-slate-500');
      continue;
    }

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

    if (ch === '#' && /^#[0-9a-fA-F]{3,8}\b/.test(code.slice(i))) {
      const match = code.slice(i).match(/^#[0-9a-fA-F]{3,8}/)!;
      pushSeg(match[0], 'text-pink-600 dark:text-pink-400');
      i += match[0].length;
      lineWordIndex++;
      continue;
    }

    if (ch === '<' && code[i + 1] === '>') {
      pushSeg('<>', 'text-blue-600 dark:text-blue-400');
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
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-slate-400 dark:text-slate-500'
      );
      i++;
      continue;
    }

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
      cls = 'text-violet-600 dark:text-violet-400';
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
      cls = 'text-violet-600 dark:text-violet-400';
    } else if (bracketDepth > 0 && SETTING_KEYWORDS.has(lower)) {
      cls = 'text-sky-600 dark:text-sky-400';
    } else if (
      blockKind === 'table' &&
      braceDepth === 1 &&
      bracketDepth === 0 &&
      lineWordIndex === 1 &&
      (BUILTIN_TYPES.has(lower) || enumNameSet.has(lower) || enumNameSet.has(word))
    ) {
      cls = 'text-emerald-600 dark:text-emerald-400';
    } else if (
      blockKind === 'table' &&
      braceDepth === 1 &&
      bracketDepth === 0 &&
      lineWordIndex === 1
    ) {
      cls = 'text-emerald-600 dark:text-emerald-400';
    } else if (
      braceDepth === 0 &&
      lineWordIndex === 1 &&
      (blockKind === 'table' || blockKind === 'enum' || blockKind === 'project')
    ) {
      cls = 'text-blue-700 dark:text-blue-300';
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

function getAutocompleteContext(
  code: string,
  cursorPos: number,
  tables: TableDef[],
  enumNames: string[]
): { replaceStart: number; items: AutocompleteItem[] } {
  const before = code.slice(0, cursorPos);
  const lastNewline = before.lastIndexOf('\n');
  const currentLine = before.slice(lastNewline + 1);
  const trimmedLine = currentLine.trimStart();

  // Do not autocomplete inside comments or open string literals on current line
  if (trimmedLine.startsWith('//')) {
    return { replaceStart: cursorPos, items: [] };
  }

  // Analyze brace & bracket context before cursor
  const blockStack: string[] = [];
  let pendingBlock = '';
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBlockComment = false;

  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (inBlockComment) {
      if (ch === '*' && before[i + 1] === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick && ch === '/' && before[i + 1] === '/') {
      while (i < before.length && before[i] !== '\n') i++;
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick && ch === '/' && before[i + 1] === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'" && !inDouble && !inBacktick && before[i - 1] !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle && !inBacktick && before[i - 1] !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (ch === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      continue;
    }
    if (inSingle || inDouble || inBacktick) continue;

    if (ch === '[') {
      bracketDepth++;
    } else if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (ch === '{') {
      const m = pendingBlock.trim().match(/^(tablegroup|table|enum|project|indexes|ref)\b/i);
      blockStack.push(m ? m[1].toLowerCase() : 'block');
      pendingBlock = '';
    } else if (ch === '}') {
      blockStack.pop();
      pendingBlock = '';
    } else if (ch === '\n') {
      pendingBlock = '';
    } else {
      pendingBlock += ch;
    }
  }

  if (inSingle || inDouble || inBacktick || inBlockComment) {
    return { replaceStart: cursorPos, items: [] };
  }

  const currentBlock = blockStack[blockStack.length - 1] || null;
  const braceDepth = blockStack.length;

  // Match table.column reference prefix like "orders." or "orders.us"
  const dotMatch = currentLine.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]*)$/);
  if (dotMatch) {
    const targetTable = tables.find(
      (t) =>
        t.id.toLowerCase() === dotMatch[1].toLowerCase() ||
        t.name.toLowerCase() === dotMatch[1].toLowerCase()
    );
    if (targetTable) {
      const colPrefix = dotMatch[2].toLowerCase();
      const replaceStart = cursorPos - dotMatch[2].length;
      const items: AutocompleteItem[] = targetTable.columns
        .filter((c) => !colPrefix || c.name.toLowerCase().includes(colPrefix))
        .map((c) => ({
          label: c.name,
          insertText: c.name,
          kind: 'column',
          detail: `${c.type}${c.pk ? ' · PK' : ''}`,
        }));
      return { replaceStart, items };
    }
  }

  const wordMatch = currentLine.match(/([a-zA-Z0-9_]*)$/);
  const prefix = (wordMatch?.[1] || '').toLowerCase();
  const replaceStart = cursorPos - (wordMatch?.[1]?.length || 0);

  let candidates: AutocompleteItem[] = [];

  if (bracketDepth > 0) {
    const insideBracket = currentLine.slice(currentLine.lastIndexOf('[') + 1);
    const inInlineRef = /\bref\s*:\s*[<>-]*\s*[a-zA-Z0-9_]*$/i.test(insideBracket);

    if (inInlineRef) {
      candidates = tables.map((t) => ({
        label: `${t.id}.id`,
        insertText: `${t.id}.id`,
        kind: 'table',
        detail: `${t.columns.length} columns`,
      }));
    } else if (/^tablegroup\b/i.test(trimmedLine)) {
      candidates = [
        { label: 'color:', insertText: 'color: #2563EB', kind: 'setting', detail: 'Domain group accent color' },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Group note', cursorOffsetBack: 1 },
      ];
    } else if (/^table\b/i.test(trimmedLine)) {
      candidates = [
        { label: 'headercolor:', insertText: 'headercolor: #1e3a8a', kind: 'setting', detail: 'Table header color' },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Table description', cursorOffsetBack: 1 },
      ];
    } else if (/^ref\b/i.test(trimmedLine) || currentBlock === 'ref') {
      candidates = [
        { label: 'delete: cascade', insertText: 'delete: cascade', kind: 'setting', detail: 'ON DELETE CASCADE' },
        { label: 'delete: set null', insertText: 'delete: set null', kind: 'setting', detail: 'ON DELETE SET NULL' },
        { label: 'delete: restrict', insertText: 'delete: restrict', kind: 'setting', detail: 'ON DELETE RESTRICT' },
        { label: 'update: cascade', insertText: 'update: cascade', kind: 'setting', detail: 'ON UPDATE CASCADE' },
        { label: 'update: no action', insertText: 'update: no action', kind: 'setting', detail: 'ON UPDATE NO ACTION' },
      ];
    } else if (currentBlock === 'indexes') {
      candidates = [
        { label: 'pk', insertText: 'pk', kind: 'setting', detail: 'Composite primary key' },
        { label: 'unique', insertText: 'unique', kind: 'setting', detail: 'Unique index constraint' },
        { label: 'name:', insertText: "name: ''", kind: 'setting', detail: 'Index name', cursorOffsetBack: 1 },
        { label: 'type: btree', insertText: 'type: btree', kind: 'setting', detail: 'B-Tree index' },
        { label: 'type: hash', insertText: 'type: hash', kind: 'setting', detail: 'Hash index' },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Index note', cursorOffsetBack: 1 },
      ];
    } else {
      candidates = [
        { label: 'pk', insertText: 'pk', kind: 'setting', detail: 'Primary key' },
        { label: 'not null', insertText: 'not null', kind: 'setting', detail: 'Disallows NULL' },
        { label: 'unique', insertText: 'unique', kind: 'setting', detail: 'Unique constraint' },
        { label: 'increment', insertText: 'increment', kind: 'setting', detail: 'Auto-increment' },
        { label: 'default:', insertText: "default: ''", kind: 'setting', detail: 'Default value', cursorOffsetBack: 1 },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Column description', cursorOffsetBack: 1 },
        { label: 'ref: >', insertText: 'ref: > ', kind: 'setting', detail: 'Inline foreign key reference' },
        { label: 'null', insertText: 'null', kind: 'setting', detail: 'Explicitly nullable' },
      ];
    }
  } else if (braceDepth === 0) {
    if (/^ref\b/i.test(trimmedLine)) {
      candidates = tables.map((t) => ({
        label: t.id,
        insertText: `${t.id}.`,
        kind: 'table',
        detail: `Table (${t.columns.length} cols)`,
      }));
    } else {
      candidates = [
        {
          label: 'Table',
          insertText: 'Table table_name [headercolor: #1e3a8a] {\n  id uuid [pk, not null]\n}',
          kind: 'snippet',
          detail: 'Define a database table',
        },
        {
          label: 'TableGroup',
          insertText: 'TableGroup "Domain Name" [color: #2563EB] {\n  \n}',
          kind: 'snippet',
          detail: 'Group tables by business domain',
        },
        {
          label: 'Ref:',
          insertText: 'Ref: ',
          kind: 'keyword',
          detail: 'Define foreign key relationship',
        },
        {
          label: 'Enum',
          insertText: 'Enum enum_name {\n  value_a\n  value_b\n}',
          kind: 'snippet',
          detail: 'Define enumerated type',
        },
        {
          label: 'Project',
          insertText: "Project MyDatabase {\n  database_type: 'PostgreSQL'\n  Note: ''\n}",
          kind: 'snippet',
          detail: 'Project metadata block',
        },
        {
          label: 'Note:',
          insertText: "Note: ''",
          kind: 'keyword',
          detail: 'Project note',
          cursorOffsetBack: 1,
        },
      ];
    }
  } else if (currentBlock === 'tablegroup') {
    candidates = [
      ...tables.map((t) => ({
        label: t.id,
        insertText: t.id,
        kind: 'table' as const,
        detail: `${t.columns.length} columns`,
      })),
      { label: 'Note:', insertText: "Note: ''", kind: 'keyword', detail: 'Domain description', cursorOffsetBack: 1 },
    ];
  } else if (currentBlock === 'project') {
    candidates = [
      { label: 'database_type:', insertText: "database_type: 'PostgreSQL'", kind: 'keyword', detail: 'Database engine' },
      { label: 'Note:', insertText: "Note: ''", kind: 'keyword', detail: 'Project documentation note', cursorOffsetBack: 1 },
    ];
  } else if (currentBlock === 'ref') {
    candidates = tables.map((t) => ({
      label: t.id,
      insertText: `${t.id}.`,
      kind: 'table',
      detail: `${t.columns.length} columns`,
    }));
  } else if (currentBlock === 'table') {
    // Check word position on current line inside Table { ... }
    const tokensOnLine = currentLine.trimStart().split(/\s+/).filter(Boolean);
    const endsWithSpace = /\s$/.test(currentLine);
    const typingColType =
      (tokensOnLine.length === 1 && endsWithSpace) ||
      (tokensOnLine.length === 2 && !endsWithSpace);

    if (typingColType) {
      candidates = [
        ...enumNames.map((en) => ({
          label: en,
          insertText: en,
          kind: 'enum' as const,
          detail: 'Custom Enum type',
        })),
        { label: 'uuid', insertText: 'uuid', kind: 'type', detail: 'Universally unique ID' },
        { label: 'varchar(255)', insertText: 'varchar(255)', kind: 'type', detail: 'Variable-length string' },
        { label: 'text', insertText: 'text', kind: 'type', detail: 'Unbounded text' },
        { label: 'integer', insertText: 'integer', kind: 'type', detail: '32-bit integer' },
        { label: 'bigint', insertText: 'bigint', kind: 'type', detail: '64-bit integer' },
        { label: 'boolean', insertText: 'boolean', kind: 'type', detail: 'True/false flag' },
        { label: 'timestamptz', insertText: 'timestamptz', kind: 'type', detail: 'Timestamp with timezone' },
        { label: 'timestamp', insertText: 'timestamp', kind: 'type', detail: 'Timestamp without timezone' },
        { label: 'date', insertText: 'date', kind: 'type', detail: 'Calendar date' },
        { label: 'jsonb', insertText: 'jsonb', kind: 'type', detail: 'Binary JSON document' },
        { label: 'decimal(10, 2)', insertText: 'decimal(10, 2)', kind: 'type', detail: 'Fixed-precision decimal' },
        { label: 'numeric', insertText: 'numeric', kind: 'type', detail: 'Exact numeric value' },
        { label: 'serial', insertText: 'serial', kind: 'type', detail: 'Auto-incrementing integer' },
      ];
    } else if (tokensOnLine.length <= 1 && !endsWithSpace) {
      candidates = [
        { label: 'id', insertText: 'id uuid [pk, not null]', kind: 'column', detail: 'Primary key column' },
        { label: 'created_at', insertText: "created_at timestamptz [default: `now()`]", kind: 'column', detail: 'Creation timestamp' },
        { label: 'updated_at', insertText: "updated_at timestamptz [default: `now()`]", kind: 'column', detail: 'Update timestamp' },
        { label: 'status', insertText: "status varchar(50) [not null]", kind: 'column', detail: 'Status column' },
        { label: 'indexes', insertText: 'indexes {\n    \n  }', kind: 'keyword', detail: 'Composite indexes block', cursorOffsetBack: 4 },
        { label: 'Note:', insertText: "Note: ''", kind: 'keyword', detail: 'Table note', cursorOffsetBack: 1 },
      ];
    }
  }

  const filtered = prefix
    ? candidates.filter(
        (c) =>
          c.label.toLowerCase().includes(prefix) &&
          c.label.toLowerCase() !== prefix
      )
    : candidates;

  return { replaceStart, items: filtered.slice(0, 12) };
}

export const DbmlEditor: React.FC<DbmlEditorProps> = ({
  value,
  onChange,
  errors,
  scrollToLine,
  enumNames = [],
  tables = [],
  isMaximized = false,
  onToggleMaximize,
  onMinimize,
  modKey = '⌘',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);

  // Autocomplete state
  const [acState, setAcState] = useState<{
    open: boolean;
    items: AutocompleteItem[];
    replaceStart: number;
    cursorPos: number;
    activeIndex: number;
    top: number;
    left: number;
  }>({
    open: false,
    items: [],
    replaceStart: 0,
    cursorPos: 0,
    activeIndex: 0,
    top: 0,
    left: 0,
  });

  const lines = value.split('\n');
  const errorsByLine = useMemo(() => {
    const map = new Map<number, ParseError[]>();
    for (const err of errors) {
      if (!map.has(err.line)) map.set(err.line, []);
      map.get(err.line)!.push(err);
    }
    return map;
  }, [errors]);

  const enumNameSet = useMemo(
    () => new Set(enumNames.flatMap((n) => [n, n.toLowerCase()])),
    [enumNames]
  );

  const highlightedLines = useMemo(
    () => tokenizeForHighlight(value, enumNameSet),
    [value, enumNameSet]
  );

  const jumpToLine = useCallback((lineNum: number) => {
    if (scrollContainerRef.current) {
      const targetTop = Math.max(0, (lineNum - 4) * 20);
      scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    const ta = textareaRef.current;
    if (ta) {
      const allLines = value.split('\n');
      let pos = 0;
      for (let i = 0; i < Math.min(lineNum - 1, allLines.length); i++) {
        pos += allLines[i].length + 1;
      }
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }
  }, [value]);

  useEffect(() => {
    if (!scrollToLine || !scrollContainerRef.current) return;
    const lineHeight = 20;
    const targetTop = Math.max(0, (scrollToLine - 4) * lineHeight);
    scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollToLine]);

  const computePopupCoords = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const split = before.split('\n');
    const row = split.length - 1;
    const col = split[split.length - 1].length;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const editorRect = editorWrapperRef.current?.getBoundingClientRect();

    // Header bar is 40px; padding top inside pre is 12px; gutter width is 44px + 12px left padding
    const rawTop = 40 + 12 + (row + 1) * 20 - scrollTop + 2;
    const rawLeft = 44 + 12 + col * 7.5 - scrollLeft;

    const maxTop = editorRect ? editorRect.height - 220 : 320;
    const top = rawTop > maxTop ? Math.max(44, rawTop - 220) : Math.max(44, rawTop);
    const maxLeft = editorRect ? Math.max(16, editorRect.width - 290) : 240;
    const left = Math.min(maxLeft, Math.max(52, rawLeft));

    return { top, left };
  }, []);

  const triggerAutocomplete = useCallback(
    (text: string, cursorPos: number, force = false) => {
      const { replaceStart, items } = getAutocompleteContext(
        text,
        cursorPos,
        tables,
        enumNames
      );
      if (items.length === 0) {
        setAcState((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      const typedLen = cursorPos - replaceStart;
      const prevChar = text[cursorPos - 1];
      if (!force && typedLen === 0 && prevChar !== '.' && prevChar !== '[') {
        setAcState((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      const { top, left } = computePopupCoords(text, cursorPos);
      setAcState({
        open: true,
        items,
        replaceStart,
        cursorPos,
        activeIndex: 0,
        top,
        left,
      });
    },
    [tables, enumNames, computePopupCoords]
  );

  const acceptSuggestion = useCallback(
    (item: AutocompleteItem) => {
      const next =
        value.slice(0, acState.replaceStart) +
        item.insertText +
        value.slice(acState.cursorPos);
      onChange(next);
      const targetPos =
        acState.replaceStart +
        item.insertText.length -
        (item.cursorOffsetBack || 0);
      setAcState((s) => ({ ...s, open: false }));
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(targetPos, targetPos);
        }
      });
    },
    [value, acState.replaceStart, acState.cursorPos, onChange]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextVal = e.target.value;
    const pos = e.target.selectionStart;
    onChange(nextVal);
    triggerAutocomplete(nextVal, pos, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl + Space opens autocomplete explicitly
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      triggerAutocomplete(value, e.currentTarget.selectionStart, true);
      return;
    }

    if (acState.open && acState.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          activeIndex: (s.activeIndex + 1) % s.items.length,
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          activeIndex: (s.activeIndex - 1 + s.items.length) % s.items.length,
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion(acState.items[acState.activeIndex] || acState.items[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAcState((s) => ({ ...s, open: false }));
        return;
      }
    }

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

  const kindColor = (kind: AutocompleteItem['kind']) => {
    switch (kind) {
      case 'table':
        return 'text-blue-600 dark:text-blue-400';
      case 'column':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'type':
      case 'enum':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'setting':
        return 'text-sky-600 dark:text-sky-400';
      default:
        return 'text-violet-600 dark:text-violet-400';
    }
  };

  return (
    <div
      ref={editorWrapperRef}
      className="relative flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800"
    >
      {/* Editor Toolbar */}
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
          <Code2 className="w-3.5 h-3.5 text-slate-400" />
          <span>schema.dbml</span>
          <span className="hidden xl:inline text-[10px] text-slate-400 font-normal">
            · Ctrl+Space autocomplete
          </span>
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

      {/* Editor Body with Shared-Scroll Synchronized Syntax Highlighting */}
      <div
        ref={scrollContainerRef}
        onScroll={() => {
          if (acState.open) setAcState((s) => ({ ...s, open: false }));
        }}
        className="flex-1 flex min-h-0 overflow-auto relative"
      >
        <div className="sticky left-0 z-20 w-11 shrink-0 py-3 pb-8 pr-2 text-right font-mono text-[12px] leading-[20px] text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800/80 select-none tabular-nums h-fit min-h-full">
          {lines.map((_, idx) => {
            const lineNum = idx + 1;
            const lineErrs = errorsByLine.get(lineNum);
            const hasErr = Boolean(lineErrs && lineErrs.length > 0);
            const isActiveLine = scrollToLine === lineNum;
            return (
              <div
                key={lineNum}
                title={
                  lineErrs ? lineErrs.map((e) => e.message).join(' | ') : undefined
                }
                className={`h-[20px] leading-[20px] flex items-center justify-end gap-0.5 ${
                  hasErr
                    ? 'text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40'
                    : isActiveLine
                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/30'
                    : ''
                }`}
              >
                {hasErr && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                )}
                <span>{lineNum}</span>
              </div>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-max h-fit min-h-full">
          <pre
            aria-hidden="true"
            style={{ tabSize: 2, fontVariantLigatures: 'none' }}
            className="m-0 py-3 pb-8 px-3 pr-8 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre pointer-events-none select-none"
          >
            {highlightedLines.map((segs, lineIdx) => {
              const lineNum = lineIdx + 1;
              const hasErr = errorsByLine.has(lineNum);
              const isHighlighted = scrollToLine === lineNum;
              return (
                <div
                  key={lineIdx}
                  className={`h-[20px] leading-[20px] ${
                    hasErr
                      ? 'bg-rose-50/80 dark:bg-rose-950/30 border-b border-rose-500/60 -mx-3 px-3'
                      : isHighlighted
                      ? 'bg-blue-50/80 dark:bg-blue-950/30 -mx-3 px-3'
                      : ''
                  }`}
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
            onChange={handleChange}
            onClick={() => setAcState((s) => (s.open ? { ...s, open: false } : s))}
            onBlur={() => {
              window.setTimeout(() => {
                setAcState((s) => (s.open ? { ...s, open: false } : s));
              }, 140);
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop !== 0) el.scrollTop = 0;
              if (el.scrollLeft !== 0) el.scrollLeft = 0;
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            wrap="off"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label="DBML Source Code Editor"
            style={{ tabSize: 2, fontVariantLigatures: 'none' }}
            className="dbml-editor-textarea absolute inset-0 z-10 w-full h-full m-0 py-3 pb-8 px-3 pr-8 border-0 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre bg-transparent text-transparent caret-slate-900 dark:caret-slate-100 resize-none focus:outline-none overflow-hidden selection:bg-blue-500/30 selection:text-transparent"
          />
        </div>
      </div>

      {/* Context-Aware Autocomplete Popup */}
      {acState.open && acState.items.length > 0 && (
        <div
          style={{ top: acState.top, left: acState.left }}
          className="absolute z-40 w-[280px] max-w-[90%] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
        >
          <div className="px-2.5 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>Suggestions</span>
            <span className="font-mono">↑↓ · Tab/Enter</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100/70 dark:divide-slate-800/70">
            {acState.items.map((item, idx) => {
              const active = idx === acState.activeIndex;
              return (
                <button
                  key={`${item.kind}:${item.label}:${idx}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(item);
                  }}
                  onMouseEnter={() =>
                    setAcState((s) => ({ ...s, activeIndex: idx }))
                  }
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/60'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-mono uppercase w-9 shrink-0 ${kindColor(
                        item.kind
                      )}`}
                    >
                      {item.kind}
                    </span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.label}
                    </span>
                  </div>
                  {item.detail && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                      {item.detail}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Error Checking Diagnostics Panel */}
      {errors.length > 0 && problemsOpen && (
        <div className="shrink-0 max-h-36 overflow-y-auto border-t border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 divide-y divide-rose-200/60 dark:divide-rose-900/40">
          {errors.map((err, idx) => (
            <button
              key={`${err.line}:${idx}`}
              type="button"
              onClick={() => jumpToLine(err.line)}
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

      {/* Diagnostics Footer */}
      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 px-3 py-1.5 bg-slate-50/80 dark:bg-slate-900/70 text-[11px] flex items-center justify-between gap-2">
        {errors.length === 0 ? (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valid DBML syntax</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setProblemsOpen((p) => !p)}
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
        <span className="text-slate-400 tabular-nums shrink-0">
          {lines.length} lines
        </span>
      </div>
    </div>
  );
};
