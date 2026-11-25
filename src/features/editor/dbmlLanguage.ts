import { TableDef } from '@shared/domain/schemaTypes';
import { AutocompleteItem } from './types';

export const TOP_KEYWORDS = new Set([
  'project',
  'table',
  'tablepartial',
  'tablegroup',
  'ref',
  'enum',
  'indexes',
  'checks',
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
  'check',
  'cascade',
  'restrict',
  'no',
  'action',
  'set',
  'btree',
  'hash',
  'gin',
  'gist',
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

export function getAutocompleteContext(
  code: string,
  cursorPos: number,
  tables: TableDef[],
  enumNames: string[],
  partialNames: string[] = []
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
      const m = pendingBlock
        .trim()
        .match(/^(tablepartial|tablegroup|table|enum|project|indexes|checks|ref)\b/i);
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

  // Match ~partial injection inside Table / TablePartial
  const partialTildeMatch = currentLine.match(/~([a-zA-Z0-9_]*)$/);
  if (
    partialTildeMatch &&
    (currentBlock === 'table' || currentBlock === 'tablepartial') &&
    bracketDepth === 0
  ) {
    const partialPrefix = partialTildeMatch[1].toLowerCase();
    const replaceStart = cursorPos - partialTildeMatch[1].length - 1;
    const items: AutocompleteItem[] = partialNames
      .filter((p) => !partialPrefix || p.toLowerCase().includes(partialPrefix))
      .map((p) => ({
        label: `~${p}`,
        insertText: `~${p}`,
        kind: 'snippet',
        detail: 'Inject TablePartial',
      }));
    return { replaceStart, items };
  }

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
    } else if (/^(?:table|tablepartial)\b/i.test(trimmedLine)) {
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
        { label: 'color:', insertText: 'color: #2563EB', kind: 'setting', detail: 'Relationship line color' },
      ];
    } else if (currentBlock === 'indexes') {
      candidates = [
        { label: 'pk', insertText: 'pk', kind: 'setting', detail: 'Composite primary key' },
        { label: 'unique', insertText: 'unique', kind: 'setting', detail: 'Unique index constraint' },
        { label: 'name:', insertText: "name: ''", kind: 'setting', detail: 'Index name', cursorOffsetBack: 1 },
        { label: 'type: btree', insertText: 'type: btree', kind: 'setting', detail: 'B-Tree index' },
        { label: 'type: hash', insertText: 'type: hash', kind: 'setting', detail: 'Hash index' },
        { label: 'type: gin', insertText: 'type: gin', kind: 'setting', detail: 'GIN index' },
        { label: 'type: gist', insertText: 'type: gist', kind: 'setting', detail: 'GiST index' },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Index note', cursorOffsetBack: 1 },
      ];
    } else if (currentBlock === 'checks') {
      candidates = [
        { label: 'name:', insertText: "name: ''", kind: 'setting', detail: 'Check constraint name', cursorOffsetBack: 1 },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Check note', cursorOffsetBack: 1 },
      ];
    } else {
      const hasInlineRef = /\bref\s*:/i.test(insideBracket);
      candidates = [
        { label: 'pk', insertText: 'pk', kind: 'setting', detail: 'Primary key' },
        { label: 'not null', insertText: 'not null', kind: 'setting', detail: 'Disallows NULL' },
        { label: 'unique', insertText: 'unique', kind: 'setting', detail: 'Unique constraint' },
        { label: 'increment', insertText: 'increment', kind: 'setting', detail: 'Auto-increment' },
        { label: 'default:', insertText: "default: ''", kind: 'setting', detail: 'Default value', cursorOffsetBack: 1 },
        { label: 'check:', insertText: 'check: ``', kind: 'setting', detail: 'Inline CHECK constraint', cursorOffsetBack: 1 },
        { label: 'note:', insertText: "note: ''", kind: 'setting', detail: 'Column description', cursorOffsetBack: 1 },
        { label: 'ref: >', insertText: 'ref: > ', kind: 'setting', detail: 'Inline foreign key reference' },
        ...(hasInlineRef
          ? [
              { label: 'delete: cascade', insertText: 'delete: cascade', kind: 'setting' as const, detail: 'ON DELETE CASCADE' },
              { label: 'delete: set null', insertText: 'delete: set null', kind: 'setting' as const, detail: 'ON DELETE SET NULL' },
              { label: 'update: cascade', insertText: 'update: cascade', kind: 'setting' as const, detail: 'ON UPDATE CASCADE' },
              { label: 'color:', insertText: 'color: #2563EB', kind: 'setting' as const, detail: 'Inline ref line color' },
            ]
          : []),
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
          label: 'TablePartial',
          insertText: 'TablePartial partial_name {\n  created_at timestamptz [default: `now()`]\n  updated_at timestamptz [default: `now()`]\n}',
          kind: 'snippet',
          detail: 'Reusable table columns/indexes/checks',
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
  } else if (currentBlock === 'table' || currentBlock === 'tablepartial') {
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
        ...partialNames.map((p) => ({
          label: `~${p}`,
          insertText: `~${p}`,
          kind: 'snippet' as const,
          detail: 'Inject TablePartial',
        })),
        { label: 'id', insertText: 'id uuid [pk, not null]', kind: 'column', detail: 'Primary key column' },
        { label: 'created_at', insertText: "created_at timestamptz [default: `now()`]", kind: 'column', detail: 'Creation timestamp' },
        { label: 'updated_at', insertText: "updated_at timestamptz [default: `now()`]", kind: 'column', detail: 'Update timestamp' },
        { label: 'status', insertText: "status varchar(50) [not null]", kind: 'column', detail: 'Status column' },
        { label: 'indexes', insertText: 'indexes {\n    \n  }', kind: 'keyword', detail: 'Composite / expression indexes block', cursorOffsetBack: 4 },
        { label: 'checks', insertText: 'checks {\n    `` [name: \'\']\n  }', kind: 'keyword', detail: 'Table CHECK constraints block', cursorOffsetBack: 15 },
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

  return { replaceStart, items: filtered.slice(0, 14) };
}
