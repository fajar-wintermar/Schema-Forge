import {
  ColumnDef,
  EnumDef,
  EnumValueDef,
  IndexDef,
  ParseError,
  ParsedSchema,
  ProjectMeta,
  RefDef,
  RefRelation,
  TableDef,
  TableGroupDef,
} from '../types/schema';

interface Token {
  type: 'word' | 'string' | 'symbol' | 'newline';
  value: string;
  line: number;
}

function tokenizeDbml(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (ch === '\r') {
      i++;
      continue;
    }

    if (ch === '\n') {
      tokens.push({ type: 'newline', value: '\n', line });
      line++;
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && input[i + 1] === '/') {
      while (i < len && input[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line comment
    if (ch === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < len && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // Triple-quoted multiline string '''...'''
    if (input.slice(i, i + 3) === "'''") {
      const startLine = line;
      i += 3;
      let val = '';
      while (i < len && input.slice(i, i + 3) !== "'''") {
        if (input[i] === '\n') line++;
        val += input[i];
        i++;
      }
      i += 3;
      tokens.push({ type: 'string', value: val.trim(), line: startLine });
      continue;
    }

    // Single, double, or backtick quoted strings
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      i++;
      let val = '';
      while (i < len && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < len) {
          i++;
          val += input[i];
        } else {
          if (input[i] === '\n') line++;
          val += input[i];
        }
        i++;
      }
      i++;
      tokens.push({ type: 'string', value: val, line: startLine });
      continue;
    }

    // Multi-char symbols
    if (ch === '<' && input[i + 1] === '>') {
      tokens.push({ type: 'symbol', value: '<>', line });
      i += 2;
      continue;
    }

    // Single-char symbols
    if ('{}[]():,.<>-'.includes(ch)) {
      tokens.push({ type: 'symbol', value: ch, line });
      i++;
      continue;
    }

    // Word / identifier / type / number / hex color
    let word = '';
    const startLine = line;
    while (
      i < len &&
      !/[\s{}\[\]():,.<>'"`\-]/.test(input[i]) &&
      !(input[i] === '/' && (input[i + 1] === '/' || input[i + 1] === '*'))
    ) {
      word += input[i];
      i++;
    }
    if (word) {
      tokens.push({ type: 'word', value: word, line: startLine });
    }
  }

  return tokens;
}

function unquote(val: string): string {
  return val.replace(/^['"`]|['"`]$/g, '');
}

export function parseDbml(source: string): ParsedSchema {
  const tokens = tokenizeDbml(source);
  const project: ProjectMeta = {};
  const tables: TableDef[] = [];
  const refs: RefDef[] = [];
  const enums: EnumDef[] = [];
  const tableGroups: TableGroupDef[] = [];
  const errors: ParseError[] = [];

  const aliasToTableId = new Map<string, string>();
  const inlineRefs: Array<{
    fromTable: string;
    fromCol: string;
    relation: RefRelation;
    targetRaw: string;
    line: number;
  }> = [];

  let idx = 0;

  const peek = (offset = 0) => tokens[idx + offset];
  const next = () => tokens[idx++];
  const skipNewlines = () => {
    while (peek()?.type === 'newline') idx++;
  };

  function parseBracketSettings(): Record<string, string> {
    const settings: Record<string, string> = {};
    if (peek()?.value !== '[') return settings;
    next(); // '['

    let currentKey = '';
    let currentValParts: string[] = [];
    let readingValue = false;

    const flush = () => {
      const k = currentKey.trim().toLowerCase();
      if (k) {
        settings[k] = readingValue ? currentValParts.join(' ').trim() : 'true';
      }
      currentKey = '';
      currentValParts = [];
      readingValue = false;
    };

    let depth = 1;
    while (idx < tokens.length && depth > 0) {
      const t = next();
      if (t.type === 'newline') continue;
      if (t.value === '[') {
        depth++;
        if (readingValue) currentValParts.push(t.value);
        continue;
      }
      if (t.value === ']') {
        depth--;
        if (depth === 0) {
          flush();
          break;
        }
        if (readingValue) currentValParts.push(t.value);
        continue;
      }
      if (t.value === ',' && depth === 1) {
        flush();
        continue;
      }
      if (t.value === ':' && !readingValue && depth === 1) {
        readingValue = true;
        continue;
      }

      if (!readingValue) {
        currentKey += (currentKey ? ' ' : '') + t.value;
      } else {
        if (t.value === '.' || t.value === '(' || t.value === ')') {
          const prev = currentValParts.pop() || '';
          currentValParts.push(prev + t.value);
        } else if (
          currentValParts.length > 0 &&
          (currentValParts[currentValParts.length - 1].endsWith('.') ||
            currentValParts[currentValParts.length - 1].endsWith('('))
        ) {
          const prev = currentValParts.pop() || '';
          currentValParts.push(prev + t.value);
        } else {
          currentValParts.push(t.value);
        }
      }
    }

    return settings;
  }

  function readQualifiedName(): { schema?: string; name: string; fullId: string } {
    const first = next();
    if (!first) return { name: 'unknown', fullId: 'unknown' };
    if (peek()?.value === '.') {
      next(); // '.'
      const second = next();
      const s = unquote(first.value);
      const n = second ? unquote(second.value) : 'unknown';
      return { schema: s, name: n, fullId: `${s}.${n}` };
    }
    const n = unquote(first.value);
    return { name: n, fullId: n };
  }

  function parseRefExpression(
    startLine: number,
    refName?: string
  ): RefDef | null {
    // Collect tokens until newline or closing brace or '['
    const exprTokens: Token[] = [];
    while (
      idx < tokens.length &&
      peek()?.type !== 'newline' &&
      peek()?.value !== '}' &&
      peek()?.value !== '['
    ) {
      exprTokens.push(next());
    }

    let settings: Record<string, string> = {};
    if (peek()?.value === '[') {
      settings = parseBracketSettings();
    }

    const relIdx = exprTokens.findIndex((t) =>
      ['>', '<', '-', '<>'].includes(t.value)
    );
    if (relIdx === -1) {
      errors.push({
        line: startLine,
        message: `Invalid Ref syntax: missing relationship operator (>, <, -, <>)`,
      });
      return null;
    }

    const relation = exprTokens[relIdx].value as RefRelation;
    const leftTokens = exprTokens.slice(0, relIdx);
    const rightTokens = exprTokens.slice(relIdx + 1);

    const parseSide = (sideTokens: Token[]) => {
      const joined = sideTokens.map((t) => t.value).join('');
      // Support schema.table.col or table.col or table.(col1, col2)
      const tupleMatch = joined.match(/^(.+?)\.\((.+)\)$/);
      if (tupleMatch) {
        return {
          table: unquote(tupleMatch[1]),
          cols: tupleMatch[2].split(',').map((c) => unquote(c.trim())),
        };
      }
      const parts = joined.split('.').map((p) => unquote(p));
      if (parts.length >= 3) {
        return { table: `${parts[0]}.${parts[1]}`, cols: [parts.slice(2).join('.')] };
      }
      if (parts.length === 2) {
        return { table: parts[0], cols: [parts[1]] };
      }
      return { table: parts[0] || '', cols: ['id'] };
    };

    const left = parseSide(leftTokens);
    const right = parseSide(rightTokens);

    return {
      id: `ref_${refs.length + 1}_${left.table}_${right.table}`,
      name: refName,
      fromTable: left.table,
      fromColumns: left.cols,
      relation,
      toTable: right.table,
      toColumns: right.cols,
      onDelete: settings['delete'],
      onUpdate: settings['update'],
      line: startLine,
    };
  }

  function skipBlock() {
    let depth = 0;
    while (idx < tokens.length) {
      const t = next();
      if (t.value === '{') depth++;
      else if (t.value === '}') {
        depth--;
        if (depth <= 0) break;
      }
    }
  }

  while (idx < tokens.length) {
    skipNewlines();
    if (idx >= tokens.length) break;

    const tok = next();
    const keyword = tok.value.toLowerCase();

    if (keyword === 'project') {
      if (peek()?.value !== '{' && peek()?.type !== 'newline') {
        project.name = unquote(next().value);
      }
      skipNewlines();
      if (peek()?.value === '{') {
        next(); // '{'
        while (idx < tokens.length && peek()?.value !== '}') {
          skipNewlines();
          if (peek()?.value === '}') break;
          const kTok = next();
          const key = kTok.value.toLowerCase();
          if (peek()?.value === ':') {
            next();
            const valTok = next();
            if (key === 'database_type') project.databaseType = valTok?.value;
            else if (key === 'note') project.note = valTok?.value;
          } else if (key === 'note' && peek()?.value === '{') {
            next();
            skipNewlines();
            if (peek()?.type === 'string') {
              project.note = next().value;
            }
            skipNewlines();
            if (peek()?.value === '}') next();
          } else {
            while (
              idx < tokens.length &&
              peek()?.type !== 'newline' &&
              peek()?.value !== '}'
            ) {
              next();
            }
          }
        }
        if (peek()?.value === '}') next();
      }
    } else if (keyword === 'table') {
      const startLine = tok.line;
      const { schema, name, fullId } = readQualifiedName();
      let alias: string | undefined;

      if (peek()?.value.toLowerCase() === 'as') {
        next();
        const aliasTok = next();
        if (aliasTok) {
          alias = unquote(aliasTok.value);
          aliasToTableId.set(alias, fullId);
        }
      }

      let tableSettings: Record<string, string> = {};
      if (peek()?.value === '[') {
        tableSettings = parseBracketSettings();
      }

      skipNewlines();
      if (peek()?.value !== '{') {
        errors.push({
          line: startLine,
          message: `Expected '{' after Table ${fullId}`,
        });
        continue;
      }
      next(); // '{'

      const columns: ColumnDef[] = [];
      const indexes: IndexDef[] = [];
      let tableNote = tableSettings['note'];

      while (idx < tokens.length && peek()?.value !== '}') {
        skipNewlines();
        if (peek()?.value === '}') break;

        const colFirst = peek();
        if (!colFirst) break;

        // Table Note: '...' or Note { '...' }
        if (
          colFirst.value.toLowerCase() === 'note' &&
          (peek(1)?.value === ':' || peek(1)?.value === '{')
        ) {
          next();
          if (peek()?.value === ':') {
            next();
            tableNote = next()?.value;
          } else if (peek()?.value === '{') {
            next();
            skipNewlines();
            if (peek()?.type === 'string' || peek()?.type === 'word') {
              tableNote = next().value;
            }
            skipNewlines();
            if (peek()?.value === '}') next();
          }
          continue;
        }

        // Indexes { ... }
        if (
          colFirst.value.toLowerCase() === 'indexes' &&
          (peek(1)?.value === '{' || peek(1)?.type === 'newline')
        ) {
          next();
          skipNewlines();
          if (peek()?.value === '{') {
            next();
            while (idx < tokens.length && peek()?.value !== '}') {
              skipNewlines();
              if (peek()?.value === '}') break;
              const idxCols: string[] = [];
              if (peek()?.value === '(') {
                next();
                while (idx < tokens.length && peek()?.value !== ')') {
                  const t = next();
                  if (t.value !== ',') idxCols.push(unquote(t.value));
                }
                if (peek()?.value === ')') next();
              } else {
                idxCols.push(unquote(next().value));
              }
              let idxSettings: Record<string, string> = {};
              if (peek()?.value === '[') {
                idxSettings = parseBracketSettings();
              }
              indexes.push({
                columns: idxCols,
                name: idxSettings['name'],
                unique: idxSettings['unique'] === 'true',
                pk: idxSettings['pk'] === 'true',
                type: idxSettings['type'],
                note: idxSettings['note'],
              });
              while (
                idx < tokens.length &&
                peek()?.type !== 'newline' &&
                peek()?.value !== '}'
              ) {
                next();
              }
            }
            if (peek()?.value === '}') next();
          }
          continue;
        }

        // Regular column line
        const nameTok = next();
        const colName = unquote(nameTok.value);

        // Read type (might include parentheses like varchar(255) or decimal(10, 2) or array [])
        let colType = '';
        let parenDepth = 0;
        while (idx < tokens.length) {
          const p = peek();
          if (!p || p.type === 'newline' || p.value === '}') break;
          if (p.value === '[' && parenDepth === 0) {
            // Check if this is `type[]` array suffix vs `[settings]`
            if (peek(1)?.value === ']') {
              next();
              next();
              colType += '[]';
              continue;
            }
            break;
          }
          const t = next();
          if (t.value === '(') {
            parenDepth++;
            colType += '(';
          } else if (t.value === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            colType += ')';
          } else if (t.value === ',') {
            colType += ', ';
          } else if (t.value === '.') {
            colType += '.';
          } else {
            colType +=
              colType && !colType.endsWith('(') && !colType.endsWith(', ') && !colType.endsWith('.')
                ? ' ' + t.value
                : t.value;
          }
        }

        let colSettings: Record<string, string> = {};
        if (peek()?.value === '[') {
          colSettings = parseBracketSettings();
        }

        // Inline ref
        if (colSettings['ref']) {
          const rawRef = colSettings['ref'].trim();
          const opMatch = rawRef.match(/^(<>|[><-])\s*(.+)$/);
          if (opMatch) {
            inlineRefs.push({
              fromTable: fullId,
              fromCol: colName,
              relation: opMatch[1] as RefRelation,
              targetRaw: opMatch[2].trim(),
              line: nameTok.line,
            });
          }
        }

        const isPk =
          colSettings['pk'] === 'true' ||
          colSettings['primary key'] === 'true';

        columns.push({
          name: colName,
          type: colType || 'varchar',
          pk: isPk,
          unique: colSettings['unique'] === 'true',
          notNull: colSettings['not null'] === 'true' || isPk,
          increment: colSettings['increment'] === 'true',
          defaultValue: colSettings['default'],
          note: colSettings['note'],
          line: nameTok.line,
        });

        while (
          idx < tokens.length &&
          peek()?.type !== 'newline' &&
          peek()?.value !== '}'
        ) {
          next();
        }
      }

      if (peek()?.value === '}') next();

      tables.push({
        id: fullId,
        schema,
        name,
        alias,
        headerColor: tableSettings['headercolor'],
        note: tableNote,
        columns,
        indexes,
        line: startLine,
      });
    } else if (keyword === 'tablegroup') {
      const startLine = tok.line;
      let groupName = 'Group';
      if (peek() && peek()?.value !== '{' && peek()?.value !== '[') {
        groupName = unquote(next().value);
      }

      let settings: Record<string, string> = {};
      if (peek()?.value === '[') {
        settings = parseBracketSettings();
      }

      skipNewlines();
      const memberTables: string[] = [];
      let groupNote = settings['note'];

      if (peek()?.value === '{') {
        next();
        while (idx < tokens.length && peek()?.value !== '}') {
          skipNewlines();
          if (peek()?.value === '}') break;

          if (
            peek()?.value.toLowerCase() === 'note' &&
            (peek(1)?.value === ':' || peek(1)?.value === '{')
          ) {
            next();
            if (peek()?.value === ':') {
              next();
              groupNote = next()?.value;
            } else if (peek()?.value === '{') {
              next();
              skipNewlines();
              if (peek()) groupNote = next().value;
              skipNewlines();
              if (peek()?.value === '}') next();
            }
            continue;
          }

          const { fullId } = readQualifiedName();
          if (fullId && fullId !== 'unknown') {
            memberTables.push(fullId);
          }
        }
        if (peek()?.value === '}') next();
      } else {
        errors.push({
          line: startLine,
          message: `Expected '{' after TableGroup ${groupName}`,
        });
      }

      tableGroups.push({
        id: groupName,
        name: groupName,
        color: settings['color'],
        note: groupNote,
        tables: memberTables,
        line: startLine,
      });
    } else if (keyword === 'ref') {
      const startLine = tok.line;
      let refName: string | undefined;
      if (peek()?.value === ':') {
        next();
        const r = parseRefExpression(startLine);
        if (r) refs.push(r);
      } else if (peek()?.value === '{') {
        next();
        while (idx < tokens.length && peek()?.value !== '}') {
          skipNewlines();
          if (peek()?.value === '}') break;
          const r = parseRefExpression(peek()?.line || startLine);
          if (r) refs.push(r);
        }
        if (peek()?.value === '}') next();
      } else {
        if (peek() && peek()?.value !== ':') {
          refName = unquote(next().value);
        }
        if (peek()?.value === ':') {
          next();
          const r = parseRefExpression(startLine, refName);
          if (r) refs.push(r);
        } else if (peek()?.value === '{') {
          next();
          skipNewlines();
          const r = parseRefExpression(startLine, refName);
          if (r) refs.push(r);
          skipNewlines();
          if (peek()?.value === '}') next();
        }
      }
    } else if (keyword === 'enum') {
      const startLine = tok.line;
      const { schema, name, fullId } = readQualifiedName();
      skipNewlines();
      const values: EnumValueDef[] = [];
      if (peek()?.value === '{') {
        next();
        while (idx < tokens.length && peek()?.value !== '}') {
          skipNewlines();
          if (peek()?.value === '}') break;
          const vTok = next();
          let vSettings: Record<string, string> = {};
          if (peek()?.value === '[') {
            vSettings = parseBracketSettings();
          }
          values.push({
            name: unquote(vTok.value),
            note: vSettings['note'],
          });
        }
        if (peek()?.value === '}') next();
      }
      enums.push({
        id: fullId,
        schema,
        name,
        values,
        line: startLine,
      });
    } else {
      // Unknown top-level block or token
      if (peek()?.value === '{') {
        skipBlock();
      }
    }
  }

  // Resolve inline refs & table aliases
  const tableIds = new Set(tables.map((t) => t.id));
  const resolveTableId = (raw: string): string => {
    if (tableIds.has(raw)) return raw;
    if (aliasToTableId.has(raw)) return aliasToTableId.get(raw)!;
    // Try matching without schema
    const found = tables.find((t) => t.name === raw || t.id === raw);
    return found ? found.id : raw;
  };

  for (const ir of inlineRefs) {
    const parts = ir.targetRaw.split('.').map((p) => unquote(p.trim()));
    let toTable = parts[0];
    let toCol = parts[1] || 'id';
    if (parts.length >= 3) {
      toTable = `${parts[0]}.${parts[1]}`;
      toCol = parts[2];
    }
    refs.push({
      id: `inline_ref_${refs.length + 1}_${ir.fromTable}_${toTable}`,
      fromTable: resolveTableId(ir.fromTable),
      fromColumns: [ir.fromCol],
      relation: ir.relation,
      toTable: resolveTableId(toTable),
      toColumns: [toCol],
      line: ir.line,
    });
  }

  for (const r of refs) {
    r.fromTable = resolveTableId(r.fromTable);
    r.toTable = resolveTableId(r.toTable);
  }

  for (const g of tableGroups) {
    g.tables = g.tables.map((t) => resolveTableId(t));
  }

  return {
    project,
    tables,
    refs,
    enums,
    tableGroups,
    errors,
  };
}

// ---------- Surgical DBML Mutation Helpers ----------

function formatGroupBlock(
  name: string,
  tables: string[],
  color?: string,
  note?: string
): string {
  const safeName = /[^a-zA-Z0-9_]/.test(name) ? `"${name}"` : name;
  const opts: string[] = [];
  if (color) opts.push(`color: ${color}`);
  const optStr = opts.length > 0 ? ` [${opts.join(', ')}]` : '';
  const noteLine = note ? `  Note: '${note.replace(/'/g, "\\'")}'\n` : '';
  const tableLines = tables.map((t) => `  ${t}`).join('\n');
  const body = [noteLine.trimEnd(), tableLines].filter(Boolean).join('\n');
  return `TableGroup ${safeName}${optStr} {\n${body ? body + '\n' : ''}}`;
}

function findTableGroupBlockRange(
  dbml: string,
  groupName: string
): { start: number; end: number } | null {
  const regex = /TableGroup\s+("([^"]+)"|'([^']+)'|([^\s\[{]+))(\s*\[[^\]]*\])?\s*\{/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(dbml)) !== null) {
    const matchedName = match[2] || match[3] || match[4];
    if (matchedName === groupName) {
      const start = match.index;
      let i = match.index + match[0].length;
      let depth = 1;
      while (i < dbml.length && depth > 0) {
        if (dbml[i] === '{') depth++;
        else if (dbml[i] === '}') depth--;
        i++;
      }
      return { start, end: i };
    }
  }
  return null;
}

export function upsertTableGroupInDbml(
  dbml: string,
  groupName: string,
  tables: string[],
  color?: string,
  note?: string,
  oldGroupName?: string
): string {
  const targetName = oldGroupName || groupName;
  const range = findTableGroupBlockRange(dbml, targetName);
  const block = formatGroupBlock(groupName, tables, color, note);

  if (range) {
    return dbml.slice(0, range.start) + block + dbml.slice(range.end);
  }
  return dbml.trimEnd() + '\n\n' + block + '\n';
}

export function deleteTableGroupInDbml(dbml: string, groupName: string): string {
  const range = findTableGroupBlockRange(dbml, groupName);
  if (!range) return dbml;
  const before = dbml.slice(0, range.start).replace(/\n{2,}$/, '\n');
  const after = dbml.slice(range.end).replace(/^\n+/, '\n');
  return (before + after).trim() + '\n';
}

export function moveTableToGroupInDbml(
  dbml: string,
  tableId: string,
  targetGroupName: string | null,
  parsed: ParsedSchema
): string {
  let updated = dbml;
  // Remove table from any existing group
  for (const g of parsed.tableGroups) {
    if (g.tables.includes(tableId) && g.name !== targetGroupName) {
      const nextTables = g.tables.filter((t) => t !== tableId);
      updated = upsertTableGroupInDbml(updated, g.name, nextTables, g.color, g.note);
    }
  }
  if (targetGroupName) {
    const target = parsed.tableGroups.find((g) => g.name === targetGroupName);
    if (target) {
      const nextTables = target.tables.includes(tableId)
        ? target.tables
        : [...target.tables, tableId];
      updated = upsertTableGroupInDbml(
        updated,
        target.name,
        nextTables,
        target.color,
        target.note
      );
    }
  }
  return updated;
}

export function setTableHeaderColorInDbml(
  dbml: string,
  tableId: string,
  color: string | null
): string {
  // Match `Table <tableId>` (with optional quotes, optional `as alias`, optional `[...]`) before `{`
  const escaped = tableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(Table\\s+(?:"${escaped}"|'${escaped}'|${escaped})(?:\\s+as\\s+[^\\s\\[{]+)?)(?:\\s*\\[([^\\]]*)\\])?(\\s*\\{)`,
    'i'
  );
  const match = regex.exec(dbml);
  if (!match) return dbml;

  const prefix = match[1];
  const existingBracket = match[2] || '';
  const suffix = match[3];

  const parts = existingBracket
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^headercolor\s*:/i.test(p));

  if (color) {
    parts.push(`headercolor: ${color}`);
  }

  const newBracket = parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  return (
    dbml.slice(0, match.index) +
    prefix +
    newBracket +
    suffix +
    dbml.slice(match.index + match[0].length)
  );
}

export function reorderTableGroupsInDbml(
  dbml: string,
  orderedGroupNames: string[],
  parsed: ParsedSchema
): string {
  // Remove all existing TableGroup blocks and re-append in the desired order
  let updated = dbml;
  const groupMap = new Map(parsed.tableGroups.map((g) => [g.name, g]));

  for (const name of parsed.tableGroups.map((g) => g.name)) {
    updated = deleteTableGroupInDbml(updated, name);
  }

  for (const name of orderedGroupNames) {
    const g = groupMap.get(name);
    if (!g) continue;
    updated = upsertTableGroupInDbml(updated, g.name, g.tables, g.color, g.note);
  }

  return updated;
}
