import { TableDef } from '../../types/schema';
import { AutocompleteItem, HighlightSegment } from './types';

export const TOP_KEYWORDS = new Set([
  'project',
  'table',
  'tablegroup',
  'ref',
  'enum',
  'indexes',
  'note',
  'as',
]);

export const SETTING_KEYWORDS = new Set([
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

export const BUILTIN_TYPES = new Set([
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

export function kindColor(kind: AutocompleteItem['kind']): string {
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
}

export function tokenizeForHighlight(
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

export function getAutocompleteContext(
  code: string,
  cursorPos: number,
  tables: TableDef[],
  enumNames: string[]
): { replaceStart: number; items: AutocompleteItem[] } {
  const before = code.slice(0, cursorPos);
  const lastNewline = before.lastIndexOf('\n');
  const currentLine = before.slice(lastNewline + 1);
  const trimmedLine = currentLine.trimStart();

  // Do not autocomplete inside comments on current line
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
