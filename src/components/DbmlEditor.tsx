import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Edit3,
  FileCode2,
  Folder,
  FolderOpen,
  FolderTree,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Plus,
  Replace,
  ReplaceAll,
  Search,
  Trash2,
  WholeWord,
  X,
} from 'lucide-react';
import { ParseError, SchemaModuleFile, TableDef } from '../types/schema';
import {
  buildShellMergeScript,
  createStarterModuleDbml,
  MERGED_SCHEMA_VIEW_ID,
  normalizeModulePath,
} from '../utils/schemaModules';

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
  schemaFiles?: SchemaModuleFile[];
  activeFilePath?: string;
  schemaFolder?: string;
  allErrorsByFile?: Record<string, ParseError[]>;
  onSelectFile?: (path: string) => void;
  onCreateFile?: (path: string, content: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDeleteFile?: (path: string) => void;
  onEnableModularMode?: () => void;
  onFlattenToSingleFile?: () => void;
  onJumpToMergedLine?: (mergedLine: number) => void;
}

interface SchemaTreeFolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: SchemaTreeNode[];
  fileCount: number;
  errorCount: number;
}

interface SchemaTreeFileNode {
  kind: 'file';
  name: string;
  path: string;
  file: SchemaModuleFile;
  matchedTables: string[];
}

type SchemaTreeNode = SchemaTreeFolderNode | SchemaTreeFileNode;

function extractDefinedTableNames(content: string): string[] {
  const names: string[] = [];
  const regex = /^\s*Table\s+(?:"([^"]+)"|`([^`]+)`|([a-zA-Z0-9_.]+))/gim;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const name = (m[1] || m[2] || m[3] || '').trim();
    if (name) names.push(name);
  }
  return names;
}

function buildSchemaFileTree(
  files: SchemaModuleFile[],
  searchQuery: string,
  allErrorsByFile?: Record<string, ParseError[]>
): { nodes: SchemaTreeNode[]; matchCount: number } {
  const q = searchQuery.trim().toLowerCase();

  interface MutableFolder {
    name: string;
    path: string;
    folders: Map<string, MutableFolder>;
    files: SchemaTreeFileNode[];
  }

  const root: MutableFolder = {
    name: '',
    path: '',
    folders: new Map(),
    files: [],
  };

  let matchCount = 0;

  for (const file of files) {
    const tableNames = extractDefinedTableNames(file.content);
    const matchingTables = q
      ? tableNames.filter((t) => t.toLowerCase().includes(q))
      : [];
    const pathMatch = !q || file.path.toLowerCase().includes(q);
    if (!pathMatch && matchingTables.length === 0) {
      continue;
    }

    matchCount++;
    const parts = file.path.split('/').filter(Boolean);
    const fileName = parts.pop() || file.path;
    let cursor = root;
    let accumPath = '';

    for (const seg of parts) {
      accumPath = accumPath ? `${accumPath}/${seg}` : seg;
      let next = cursor.folders.get(seg);
      if (!next) {
        next = {
          name: seg,
          path: accumPath,
          folders: new Map(),
          files: [],
        };
        cursor.folders.set(seg, next);
      }
      cursor = next;
    }

    cursor.files.push({
      kind: 'file',
      name: fileName,
      path: file.path,
      file,
      matchedTables: pathMatch ? [] : matchingTables,
    });
  }

  const finalize = (folder: MutableFolder): SchemaTreeNode[] => {
    const folderNodes: SchemaTreeFolderNode[] = Array.from(
      folder.folders.values()
    )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((sub) => {
        const children = finalize(sub);
        let fileCount = 0;
        let errorCount = 0;
        for (const child of children) {
          if (child.kind === 'folder') {
            fileCount += child.fileCount;
            errorCount += child.errorCount;
          } else {
            fileCount += 1;
            errorCount += allErrorsByFile?.[child.path]?.length || 0;
          }
        }
        return {
          kind: 'folder',
          name: sub.name,
          path: sub.path,
          children,
          fileCount,
          errorCount,
        };
      });

    const fileNodes = [...folder.files].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return [...folderNodes, ...fileNodes];
  };

  return { nodes: finalize(root), matchCount };
}

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
  schemaFiles,
  activeFilePath,
  schemaFolder = 'schema',
  allErrorsByFile,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onEnableModularMode,
  onFlattenToSingleFile,
  onJumpToMergedLine,
}) => {
  const isModular = Boolean(schemaFiles && schemaFiles.length > 0);
  const isMergedPreview = isModular && activeFilePath === MERGED_SCHEMA_VIEW_ID;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const codeAreaRef = useRef<HTMLDivElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const gotoInputRef = useRef<HTMLInputElement>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);

  // Modular file explorer UI state
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [fileSearch, setFileSearch] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileIncludeStub, setNewFileIncludeStub] = useState(true);
  const [renameTargetPath, setRenameTargetPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTargetPath, setDeleteTargetPath] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  // Find & Replace state
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);

  // Go to Line state
  const [gotoOpen, setGotoOpen] = useState(false);
  const [gotoValue, setGotoValue] = useState('');
  const [gotoHighlightLine, setGotoHighlightLine] = useState<number | null>(null);

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
  const lineStartOffsets = useMemo(() => {
    const offsets: number[] = [];
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      offsets.push(pos);
      pos += lines[i].length + 1;
    }
    return offsets;
  }, [lines]);

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

  // Compute all Find matches across source text
  const findMatches = useMemo<Array<{ start: number; end: number }>>(() => {
    if (!findOpen || !findQuery) return [];
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
    const flags = matchCase ? 'g' : 'gi';
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return [];
    }
    const matches: Array<{ start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (matches.length >= 2000) break;
    }
    return matches;
  }, [findOpen, findQuery, matchCase, wholeWord, value]);

  const safeMatchIdx =
    findMatches.length > 0
      ? Math.min(activeMatchIdx, findMatches.length - 1)
      : 0;

  const scrollToOffset = useCallback(
    (offset: number) => {
      if (!scrollContainerRef.current) return;
      const before = value.slice(0, offset);
      const row = before.split('\n').length - 1;
      const targetTop = Math.max(0, (row - 3) * 20);
      scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    },
    [value]
  );

  const openFindBar = useCallback(
    (withReplace: boolean) => {
      const ta = textareaRef.current;
      let seededQuery = findQuery;
      if (ta && ta.selectionStart !== ta.selectionEnd) {
        const selected = value.slice(ta.selectionStart, ta.selectionEnd);
        if (!selected.includes('\n') && selected.length <= 120) {
          seededQuery = selected;
          setFindQuery(selected);
        }
      }
      setFindOpen(true);
      if (withReplace) setReplaceOpen(true);
      setAcState((s) => (s.open ? { ...s, open: false } : s));
      requestAnimationFrame(() => {
        if (withReplace && seededQuery) {
          replaceInputRef.current?.focus();
          replaceInputRef.current?.select();
        } else {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }
      });
    },
    [findQuery, value]
  );

  const closeFindBar = useCallback(() => {
    setFindOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const goToMatch = useCallback(
    (nextIdx: number) => {
      if (findMatches.length === 0) return;
      const normalized =
        ((nextIdx % findMatches.length) + findMatches.length) %
        findMatches.length;
      setActiveMatchIdx(normalized);
      scrollToOffset(findMatches[normalized].start);
    },
    [findMatches, scrollToOffset]
  );

  const handleReplaceCurrent = useCallback(() => {
    if (isMergedPreview || findMatches.length === 0) return;
    const target = findMatches[safeMatchIdx];
    const next =
      value.slice(0, target.start) + replaceQuery + value.slice(target.end);
    onChange(next);
    if (findMatches.length > 1) {
      const nextOffset = target.start + replaceQuery.length;
      scrollToOffset(nextOffset);
    }
  }, [
    isMergedPreview,
    findMatches,
    safeMatchIdx,
    value,
    replaceQuery,
    onChange,
    scrollToOffset,
  ]);

  const handleReplaceAll = useCallback(() => {
    if (isMergedPreview || findMatches.length === 0) return;
    let out = '';
    let last = 0;
    for (const m of findMatches) {
      out += value.slice(last, m.start) + replaceQuery;
      last = m.end;
    }
    out += value.slice(last);
    onChange(out);
    setActiveMatchIdx(0);
  }, [isMergedPreview, findMatches, value, replaceQuery, onChange]);

  const openGotoLine = useCallback(() => {
    const ta = textareaRef.current;
    const currentLine = ta
      ? value.slice(0, ta.selectionStart).split('\n').length
      : 1;
    setFindOpen(false);
    setGotoOpen(true);
    setGotoValue(String(currentLine));
    setAcState((s) => (s.open ? { ...s, open: false } : s));
    requestAnimationFrame(() => {
      gotoInputRef.current?.focus();
      gotoInputRef.current?.select();
    });
  }, [value]);

  const closeGotoLine = useCallback(() => {
    setGotoOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const jumpToLine = useCallback(
    (lineNum: number, colNum = 1) => {
      const clampedLine = Math.max(1, Math.min(lines.length, lineNum));
      const lineText = lines[clampedLine - 1] || '';
      const clampedCol = Math.max(1, Math.min(lineText.length + 1, colNum));
      const pos = (lineStartOffsets[clampedLine - 1] || 0) + (clampedCol - 1);

      setGotoHighlightLine(clampedLine);

      const ta = textareaRef.current;
      if (ta) {
        ta.setSelectionRange(pos, pos);
        ta.focus({ preventScroll: true });
      }

      const container = scrollContainerRef.current;
      if (container) {
        const lineTop = 12 + (clampedLine - 1) * 20;
        const offsetFromTop = Math.min(
          140,
          Math.max(40, Math.floor(container.clientHeight * 0.25))
        );
        const targetTop = Math.max(0, lineTop - offsetFromTop);

        const colX = (clampedCol - 1) * 7.5;
        let targetLeft = container.scrollLeft;
        if (colX < container.scrollLeft) {
          targetLeft = Math.max(0, colX - 24);
        } else if (colX > container.scrollLeft + container.clientWidth - 96) {
          targetLeft = Math.max(0, colX - container.clientWidth + 120);
        }

        container.scrollTo({
          top: targetTop,
          left: targetLeft,
          behavior: 'smooth',
        });
      }
    },
    [lines, lineStartOffsets]
  );

  const handleSubmitGotoLine = useCallback(() => {
    const raw = gotoValue.trim();
    if (!raw) return;
    const parts = raw.split(':');
    const parsedLine = parseInt(parts[0], 10);
    if (Number.isNaN(parsedLine)) return;
    const parsedCol = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
    setGotoOpen(false);
    requestAnimationFrame(() => {
      jumpToLine(parsedLine, parsedCol);
    });
  }, [gotoValue, jumpToLine]);

  // Global editor Find (Ctrl/Cmd+F), Find+Replace (Ctrl/Cmd+H), and Go to Line (Ctrl/Cmd+G) listener
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'f' && key !== 'h' && key !== 'g') return;

      const active = document.activeElement;
      const insideEditor = Boolean(
        editorWrapperRef.current &&
          active &&
          editorWrapperRef.current.contains(active)
      );
      const typingElsewhere =
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          (active as HTMLElement).isContentEditable) &&
        !insideEditor;

      if (typingElsewhere) return;

      e.preventDefault();
      if (key === 'g') {
        openGotoLine();
      } else {
        setGotoOpen(false);
        openFindBar(key === 'h');
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, [openFindBar, openGotoLine]);

  // Scroll to active match when query changes
  useEffect(() => {
    if (!findOpen || findMatches.length === 0) {
      setActiveMatchIdx(0);
      return;
    }
    setActiveMatchIdx(0);
    scrollToOffset(findMatches[0].start);
  }, [findOpen, findQuery, matchCase, wholeWord]);

  useEffect(() => {
    if (!scrollToLine || !scrollContainerRef.current) return;
    const lineHeight = 20;
    const targetTop = Math.max(0, (scrollToLine - 4) * lineHeight);
    scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [scrollToLine, activeFilePath]);

  // Reset inline modular prompts & ensure active file's parent folders are expanded
  useEffect(() => {
    setRenameTargetPath(null);
    setDeleteTargetPath(null);
    if (!activeFilePath || activeFilePath === MERGED_SCHEMA_VIEW_ID) return;
    const parts = activeFilePath.split('/').filter(Boolean);
    if (parts.length > 1) {
      setCollapsedFolders((prev) => {
        let changed = false;
        const next = { ...prev };
        let accum = '';
        for (let i = 0; i < parts.length - 1; i++) {
          accum = accum ? `${accum}/${parts[i]}` : parts[i];
          if (next[accum]) {
            delete next[accum];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [activeFilePath]);

  const sortedSchemaFiles = useMemo(() => {
    if (!schemaFiles) return [];
    return [...schemaFiles].sort((a, b) => a.path.localeCompare(b.path));
  }, [schemaFiles]);

  const schemaTree = useMemo(
    () => buildSchemaFileTree(sortedSchemaFiles, fileSearch, allErrorsByFile),
    [sortedSchemaFiles, fileSearch, allErrorsByFile]
  );

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderPath]: !prev[folderPath],
    }));
  };

  const otherFileErrorEntries = useMemo(() => {
    if (!isModular || !allErrorsByFile) return [];
    return Object.entries(allErrorsByFile).filter(
      ([path, errs]) => path !== activeFilePath && errs.length > 0
    );
  }, [isModular, allErrorsByFile, activeFilePath]);

  const otherFileErrorsCount = useMemo(
    () => otherFileErrorEntries.reduce((acc, [, errs]) => acc + errs.length, 0),
    [otherFileErrorEntries]
  );

  const handleCreateModuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateFile || !newFileName.trim()) return;
    const normalizedPath = normalizeModulePath(newFileName, schemaFolder);
    const content = newFileIncludeStub
      ? createStarterModuleDbml(normalizedPath)
      : `// ${normalizedPath}\n`;
    onCreateFile(normalizedPath, content);
    setNewFileName('');
    setNewFileOpen(false);
    setExplorerOpen(true);
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRenameFile || !renameTargetPath || !renameValue.trim()) {
      return;
    }
    const nextPath = normalizeModulePath(renameValue, schemaFolder);
    onRenameFile(renameTargetPath, nextPath);
    setRenameTargetPath(null);
  };

  const handleJumpFromMergedCursor = () => {
    if (!onJumpToMergedLine) return;
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionStart : 0;
    const lineNum = Math.max(1, value.slice(0, pos).split('\n').length);
    onJumpToMergedLine(lineNum);
  };

  const handleCopyMergeScript = async () => {
    try {
      await navigator.clipboard.writeText(buildShellMergeScript(schemaFolder));
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const computePopupCoords = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const split = before.split('\n');
    const row = split.length - 1;
    const col = split[split.length - 1].length;
    const scrollTop = scrollContainerRef.current?.scrollTop || 0;
    const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
    const codeRect = codeAreaRef.current?.getBoundingClientRect();

    // Padding top inside pre is 12px; gutter width is 44px + 12px left padding
    const rawTop = 12 + (row + 1) * 20 - scrollTop + 2;
    const rawLeft = 44 + 12 + col * 7.5 - scrollLeft;

    const maxTop = codeRect ? Math.max(24, codeRect.height - 210) : 280;
    const top = rawTop > maxTop ? Math.max(8, rawTop - 210) : Math.max(8, rawTop);
    const maxLeft = codeRect ? Math.max(16, codeRect.width - 284) : 220;
    const left = Math.min(maxLeft, Math.max(48, rawLeft));

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
    if (isMergedPreview) return;
    const nextVal = e.target.value;
    const pos = e.target.selectionStart;
    onChange(nextVal);
    triggerAutocomplete(nextVal, pos, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMergedPreview) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onJumpToMergedLine) {
        e.preventDefault();
        handleJumpFromMergedCursor();
      }
      return;
    }

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

  const renderTreeNodes = (nodes: SchemaTreeNode[], depth = 0): React.ReactNode => {
    const forceExpand = Boolean(fileSearch.trim());
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        const isOpen = forceExpand || !collapsedFolders[node.path];
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              className="w-full pr-2 py-1 flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              )}
              <span className="truncate flex-1 font-mono">{node.name}</span>
              {node.errorCount > 0 && (
                <span
                  title={`${node.errorCount} syntax issue(s)`}
                  className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                />
              )}
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                {node.fileCount}
              </span>
            </button>
            {isOpen && <div>{renderTreeNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const file = node.file;
      const active = activeFilePath === file.path;
      const fileErrCount = allErrorsByFile?.[file.path]?.length || 0;
      const isModified =
        file.lastSyncedContent !== undefined &&
        file.content !== file.lastSyncedContent;
      const isUntrackedNew =
        file.sha === undefined && file.lastSyncedContent === undefined;

      return (
        <div
          key={file.path}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          className={`group/tree-file pr-1.5 py-1 flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer ${
            active
              ? 'bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 font-semibold border-l-2 border-blue-600 dark:border-blue-400'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border-l-2 border-transparent'
          }`}
          onClick={() => onSelectFile?.(file.path)}
          title={file.path}
        >
          <FileCode2
            className={`w-3.5 h-3.5 shrink-0 ${
              fileErrCount > 0
                ? 'text-rose-500'
                : active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono">{node.name}</div>
            {node.matchedTables.length > 0 && (
              <div className="truncate text-[9.5px] text-slate-400 dark:text-slate-500 font-mono">
                Table: {node.matchedTables.join(', ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {(isModified || isUntrackedNew) && fileErrCount === 0 && (
              <span
                title={
                  isModified ? 'Modified since GitHub sync' : 'New local file'
                }
                className={`w-1.5 h-1.5 rounded-full shrink-0 mr-0.5 ${
                  isModified ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            )}
            {fileErrCount > 0 && (
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums mr-0.5">
                {fileErrCount}
              </span>
            )}
            {onRenameFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTargetPath(file.path);
                  setRenameValue(file.path);
                  setNewFileOpen(false);
                  setDeleteTargetPath(null);
                }}
                title={`Rename ${file.path}`}
                aria-label={`Rename ${file.path}`}
                className="p-0.5 rounded opacity-0 group-hover/tree-file:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-300/50 dark:hover:bg-slate-700/70 transition-opacity"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
            {onDeleteFile && sortedSchemaFiles.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTargetPath(file.path);
                  setNewFileOpen(false);
                  setRenameTargetPath(null);
                }}
                title={`Delete ${file.path}`}
                aria-label={`Delete ${file.path}`}
                className="p-0.5 rounded opacity-0 group-hover/tree-file:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div
      ref={editorWrapperRef}
      className="relative flex flex-col h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800"
    >
      {/* Editor Toolbar */}
      <div className="h-10 shrink-0 px-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 min-w-0">
          {isModular ? (
            <button
              type="button"
              onClick={() => setExplorerOpen((o) => !o)}
              title={
                explorerOpen
                  ? 'Hide schema file explorer'
                  : 'Show schema file explorer'
              }
              aria-label="Toggle schema file explorer"
              className={`p-1 rounded transition-colors shrink-0 ${
                explorerOpen
                  ? 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Code2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span className="font-mono truncate">
            {isMergedPreview
              ? 'schema.dbml (generated)'
              : isModular && activeFilePath
              ? activeFilePath
              : 'schema.dbml'}
          </span>
          {!isMergedPreview && (
            <span className="hidden xl:inline text-[10px] text-slate-400 font-normal whitespace-nowrap">
              · Ctrl+Space autocomplete
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!isModular && onEnableModularMode && (
            <button
              type="button"
              onClick={onEnableModularMode}
              title="Split single DBML into per-table files under schema/ and merge schema.dbml on the fly"
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/70 transition-colors whitespace-nowrap"
            >
              <FolderTree className="w-3 h-3" />
              <span className="hidden sm:inline">Split to schema/</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => openFindBar(false)}
            title={`Find & Replace (${modKey}F / ${modKey}H)`}
            aria-label="Find and replace in editor"
            className={`p-1.5 rounded transition-colors ${
              findOpen
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

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

      {/* Editor Main Workspace (Optional File Explorer Tree + Code Editor) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {isModular && explorerOpen && (
          <aside
            aria-label="Schema File Explorer"
            className="w-[196px] sm:w-[216px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col min-h-0 select-none"
          >
            {/* Explorer Header */}
            <div className="px-2.5 py-1.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                  Explorer
                </span>
                <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                  {sortedSchemaFiles.length}
                </span>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {onCreateFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewFileOpen((o) => !o);
                      setRenameTargetPath(null);
                      setDeleteTargetPath(null);
                    }}
                    title={`New .dbml file in ${schemaFolder}/`}
                    aria-label={`New .dbml file in ${schemaFolder}/`}
                    className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                {onFlattenToSingleFile && (
                  <button
                    type="button"
                    onClick={onFlattenToSingleFile}
                    title="Flatten all modular files into a single schema.dbml"
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    Flatten
                  </button>
                )}
              </div>
            </div>

            {/* Explorer Search */}
            <div className="p-2 border-b border-slate-200/70 dark:border-slate-800/80">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Search files or tables..."
                  aria-label="Search split schema files"
                  className="w-full pl-6 pr-6 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {fileSearch && (
                  <button
                    type="button"
                    onClick={() => setFileSearch('')}
                    aria-label="Clear file search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Inline Create File Form */}
            {newFileOpen && (
              <form
                onSubmit={handleCreateModuleSubmit}
                className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1.5 text-[11px]"
              >
                <input
                  type="text"
                  autoFocus
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={`${schemaFolder}/payments.dbml`}
                  className="w-full px-2 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <label className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newFileIncludeStub}
                    onChange={(e) => setNewFileIncludeStub(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Include starter Table</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-medium"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewFileOpen(false)}
                    className="px-2 py-0.5 rounded text-[10.5px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Inline Rename File Form */}
            {renameTargetPath && (
              <form
                onSubmit={handleRenameSubmit}
                className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1.5 text-[11px]"
              >
                <div className="text-[10px] font-medium text-slate-500 truncate">
                  Rename {renameTargetPath}
                </div>
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full px-2 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-medium"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenameTargetPath(null)}
                    className="px-2 py-0.5 rounded text-[10.5px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Inline Delete Confirm */}
            {deleteTargetPath && (
              <div className="p-2 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 space-y-1.5 text-[11px]">
                <div className="text-[10.5px] text-rose-800 dark:text-rose-200 break-all">
                  Delete{' '}
                  <code className="font-mono font-semibold">
                    {deleteTargetPath}
                  </code>
                  ?
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteFile?.(deleteTargetPath);
                      setDeleteTargetPath(null);
                    }}
                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-medium"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTargetPath(null)}
                    className="px-2 py-0.5 rounded text-[10.5px] text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Tree View */}
            <div className="flex-1 overflow-y-auto py-1">
              {schemaTree.nodes.length === 0 ? (
                <div className="px-3 py-6 text-center space-y-1.5">
                  <p className="text-[11px] text-slate-400">
                    No files or tables match &ldquo;{fileSearch}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => setFileSearch('')}
                    className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                renderTreeNodes(schemaTree.nodes, 0)
              )}
            </div>

            {/* Generated Merged Schema Output */}
            <div className="border-t border-slate-200 dark:border-slate-800 p-1.5 bg-slate-100/60 dark:bg-slate-900/80">
              <div className="px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                Generated Output
              </div>
              <button
                type="button"
                onClick={() => onSelectFile?.(MERGED_SCHEMA_VIEW_ID)}
                title="Preview on-the-fly merged schema.dbml (local only, never pushed to GitHub)"
                className={`w-full px-2 py-1.5 rounded flex items-center justify-between gap-1.5 text-[11px] font-mono transition-colors ${
                  isMergedPreview
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/60 text-emerald-800 dark:text-emerald-200 font-semibold'
                    : 'border border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Layers className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span className="truncate">schema.dbml</span>
                </span>
                <span className="text-[9.5px] font-sans text-emerald-700 dark:text-emerald-300 shrink-0">
                  merged
                </span>
              </button>
            </div>
          </aside>
        )}

        {/* Code Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* Read-only Merged Preview Info Banner */}
          {isMergedPreview && (
            <div className="shrink-0 px-2.5 py-1.5 border-b border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-emerald-900 dark:text-emerald-200">
                Generated on the fly from {sortedSchemaFiles.length} files in{' '}
                <code className="font-mono font-semibold">{schemaFolder}/</code> · Read-only (never pushed to GitHub)
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {onJumpToMergedLine && (
                  <button
                    type="button"
                    onClick={handleJumpFromMergedCursor}
                    className="px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 font-medium hover:bg-emerald-50"
                  >
                    Jump to Source File
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopyMergeScript}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-200 font-medium hover:bg-emerald-50"
                >
                  {copiedScript ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>
                    {copiedScript ? 'Copied build-schema.sh' : 'Copy build-schema.sh'}
                  </span>
                </button>
              </div>
            </div>
          )}

      {/* Find & Replace Widget */}
      {findOpen && (
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 px-2.5 py-2 space-y-1.5 z-30">
          {/* Find Row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReplaceOpen((r) => !r)}
              title={replaceOpen ? 'Hide Replace' : `Show Replace (${modKey}H)`}
              aria-label="Toggle replace row"
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 shrink-0"
            >
              {replaceOpen ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>

            <div className="relative flex-1 min-w-0 flex items-center">
              <input
                ref={findInputRef}
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeFindBar();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    goToMatch(e.shiftKey ? safeMatchIdx - 1 : safeMatchIdx + 1);
                  }
                }}
                placeholder="Find..."
                aria-label="Find text in DBML editor"
                className="w-full pl-2.5 pr-14 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <div className="absolute right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMatchCase((v) => !v)}
                  title="Match Case"
                  aria-label="Match Case"
                  className={`p-1 rounded transition-colors ${
                    matchCase
                      ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <CaseSensitive className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWholeWord((v) => !v)}
                  title="Match Whole Word"
                  aria-label="Match Whole Word"
                  className={`p-1 rounded transition-colors ${
                    wholeWord
                      ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <WholeWord className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <span
              className={`text-[11px] font-mono tabular-nums whitespace-nowrap min-w-[54px] text-center ${
                findQuery && findMatches.length === 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {!findQuery
                ? '0/0'
                : findMatches.length === 0
                ? 'No match'
                : `${safeMatchIdx + 1} of ${findMatches.length}`}
            </span>

            <button
              type="button"
              disabled={findMatches.length === 0}
              onClick={() => goToMatch(safeMatchIdx - 1)}
              title="Previous Match (Shift+Enter)"
              aria-label="Previous Match"
              className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={findMatches.length === 0}
              onClick={() => goToMatch(safeMatchIdx + 1)}
              title="Next Match (Enter)"
              aria-label="Next Match"
              className="p-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={closeFindBar}
              title="Close (Esc)"
              aria-label="Close Find bar"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Replace Row */}
          {replaceOpen && (
            <div className="flex items-center gap-1.5 pl-6">
              <input
                ref={replaceInputRef}
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeFindBar();
                  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.altKey) {
                    e.preventDefault();
                    handleReplaceAll();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    handleReplaceCurrent();
                  }
                }}
                placeholder="Replace with..."
                aria-label="Replacement text"
                className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={handleReplaceCurrent}
                title="Replace Current Match (Enter)"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 whitespace-nowrap"
              >
                <Replace className="w-3 h-3" />
                <span>Replace</span>
              </button>
              <button
                type="button"
                disabled={findMatches.length === 0}
                onClick={handleReplaceAll}
                title="Replace All Matches"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-[11px] font-medium text-white disabled:opacity-40 whitespace-nowrap"
              >
                <ReplaceAll className="w-3 h-3" />
                <span>All</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Go to Line Widget (Ctrl/Cmd+G) */}
      {gotoOpen && (
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-900/95 px-2.5 py-2 flex items-center gap-2 z-30">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
            Go to line:
          </span>
          <input
            ref={gotoInputRef}
            type="text"
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                closeGotoLine();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmitGotoLine();
              }
            }}
            placeholder={`1–${lines.length} (or line:col)`}
            aria-label="Go to line number"
            className="flex-1 min-w-0 px-2.5 py-1 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
            / {lines.length}
          </span>
          <button
            type="button"
            onClick={handleSubmitGotoLine}
            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium whitespace-nowrap"
          >
            Go
          </button>
          <button
            type="button"
            onClick={closeGotoLine}
            title="Close (Esc)"
            aria-label="Close Go to Line bar"
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Body with Shared-Scroll Synchronized Syntax Highlighting */}
      <div
        ref={codeAreaRef}
        className="relative flex-1 flex min-h-0 overflow-hidden"
      >
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
            const isActiveLine =
              scrollToLine === lineNum || gotoHighlightLine === lineNum;
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
              const isHighlighted =
                scrollToLine === lineNum || gotoHighlightLine === lineNum;
              const lineStart = lineStartOffsets[lineIdx] || 0;
              const lineLen = lines[lineIdx]?.length || 0;
              const lineEnd = lineStart + lineLen;

              // Find matches intersecting this line
              const lineMatchSpans: Array<{
                start: number;
                end: number;
                isActive: boolean;
              }> = [];
              if (findMatches.length > 0 && lineLen > 0) {
                for (let mi = 0; mi < findMatches.length; mi++) {
                  const m = findMatches[mi];
                  if (m.end <= lineStart) continue;
                  if (m.start >= lineEnd) break;
                  lineMatchSpans.push({
                    start: Math.max(m.start, lineStart),
                    end: Math.min(m.end, lineEnd),
                    isActive: mi === safeMatchIdx,
                  });
                }
              }

              let renderedSegments: React.ReactNode;
              if (segs.length === 0) {
                renderedSegments = <span>{'\u200b'}</span>;
              } else if (lineMatchSpans.length === 0) {
                renderedSegments = segs.map((seg, sIdx) => (
                  <span key={sIdx} className={seg.className}>
                    {seg.text}
                  </span>
                ));
              } else {
                const nodes: React.ReactNode[] = [];
                let cursor = lineStart;
                segs.forEach((seg, sIdx) => {
                  const segStart = cursor;
                  const segEnd = segStart + seg.text.length;
                  cursor = segEnd;

                  let pos = segStart;
                  for (const ms of lineMatchSpans) {
                    if (ms.end <= pos || ms.start >= segEnd) continue;
                    if (ms.start > pos) {
                      nodes.push(
                        <span key={`${sIdx}-${pos}`} className={seg.className}>
                          {seg.text.slice(pos - segStart, ms.start - segStart)}
                        </span>
                      );
                    }
                    const hiStart = Math.max(pos, ms.start);
                    const hiEnd = Math.min(segEnd, ms.end);
                    nodes.push(
                      <span
                        key={`${sIdx}-m-${hiStart}`}
                        className={`${seg.className} ${
                          ms.isActive
                            ? 'bg-orange-400/55 dark:bg-orange-500/55 rounded-[2px]'
                            : 'bg-amber-300/45 dark:bg-amber-500/35 rounded-[2px]'
                        }`}
                      >
                        {seg.text.slice(hiStart - segStart, hiEnd - segStart)}
                      </span>
                    );
                    pos = hiEnd;
                  }
                  if (pos < segEnd) {
                    nodes.push(
                      <span key={`${sIdx}-tail-${pos}`} className={seg.className}>
                        {seg.text.slice(pos - segStart)}
                      </span>
                    );
                  }
                });
                renderedSegments = nodes;
              }

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
                  {renderedSegments}
                </div>
              );
            })}
          </pre>

          <textarea
            ref={textareaRef}
            value={value}
            readOnly={isMergedPreview}
            onChange={handleChange}
            onClick={() => setAcState((s) => (s.open ? { ...s, open: false } : s))}
            onDoubleClick={() => {
              if (isMergedPreview && onJumpToMergedLine) {
                handleJumpFromMergedCursor();
              }
            }}
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
      </div>

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
          onClick={openGotoLine}
          title={`Go to line (${modKey}G)`}
          className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 tabular-nums shrink-0"
        >
          {lines.length} lines · {modKey}G
        </button>
      </div>
        </div>
      </div>
    </div>
  );
};
