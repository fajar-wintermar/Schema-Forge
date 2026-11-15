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

function tokenizeDbml(input: string, errors: ParseError[]): Token[] {
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
      const startLine = line;
      i += 2;
      let closed = false;
      while (i < len) {
        if (input[i] === '*' && input[i + 1] === '/') {
          closed = true;
          i += 2;
          break;
        }
        if (input[i] === '\n') line++;
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: 'Unclosed multi-line comment (missing */)',
        });
      }
      continue;
    }

    // Triple-quoted multiline string '''...'''
    if (input.slice(i, i + 3) === "'''") {
      const startLine = line;
      i += 3;
      let val = '';
      let closed = false;
      while (i < len) {
        if (input.slice(i, i + 3) === "'''") {
          closed = true;
          i += 3;
          break;
        }
        if (input[i] === '\n') line++;
        val += input[i];
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: "Unclosed multi-line string (missing ''')",
        });
      }
      tokens.push({ type: 'string', value: val.trim(), line: startLine });
      continue;
    }

    // Single, double, or backtick quoted strings
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      i++;
      let val = '';
      let closed = false;
      while (i < len) {
        if (input[i] === quote) {
          closed = true;
          i++;
          break;
        }
        if (input[i] === '\\' && i + 1 < len) {
          i++;
          val += input[i];
        } else {
          if (input[i] === '\n') line++;
          val += input[i];
        }
        i++;
      }
      if (!closed) {
        errors.push({
          line: startLine,
          message: `Unclosed string literal (missing ${quote})`,
        });
      }
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
  const errors: ParseError[] = [];
  const tokens = tokenizeDbml(source, errors);
  const project: ProjectMeta = {};
  const tables: TableDef[] = [];
  const refs: RefDef[] = [];
  const enums: EnumDef[] = [];
  const tableGroups: TableGroupDef[] = [];

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
    const openTok = next(); // '['

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

    if (depth > 0) {
      errors.push({
        line: openTok.line,
        message: "Unclosed '[' in settings block",
      });
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
        const openBraceLine = peek()!.line;
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
        if (peek()?.value === '}') {
          next();
        } else {
          errors.push({
            line: openBraceLine,
            message: "Unclosed '{' in Project block",
          });
        }
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
            if (peek()?.value === '}') {
              next();
            } else {
              errors.push({
                line: colFirst.line,
                message: `Unclosed '{' in Indexes block of table "${fullId}"`,
              });
            }
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
          } else {
            errors.push({
              line: nameTok.line,
              message: `Invalid inline ref "${rawRef}" on ${fullId}.${colName} (expected e.g. > table.col)`,
            });
          }
        }

        if (!colType) {
          errors.push({
            line: nameTok.line,
            message: `Column "${colName}" in table "${fullId}" is missing a data type`,
          });
        }

        const isPk =
          colSettings['pk'] === 'true' ||
          colSettings['primary key'] === 'true';

        if (columns.some((c) => c.name === colName)) {
          errors.push({
            line: nameTok.line,
            message: `Duplicate column "${colName}" in table "${fullId}"`,
          });
        }

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

      if (peek()?.value === '}') {
        next();
      } else {
        errors.push({
          line: startLine,
          message: `Unclosed '{' in Table "${fullId}"`,
        });
      }

      if (tables.some((t) => t.id === fullId)) {
        errors.push({
          line: startLine,
          message: `Duplicate table definition "${fullId}"`,
        });
      }

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
        if (peek()?.value === '}') {
          next();
        } else {
          errors.push({
            line: startLine,
            message: `Unclosed '{' in TableGroup "${groupName}"`,
          });
        }
      } else {
        errors.push({
          line: startLine,
          message: `Expected '{' after TableGroup ${groupName}`,
        });
      }

      if (tableGroups.some((g) => g.name === groupName)) {
        errors.push({
          line: startLine,
          message: `Duplicate TableGroup "${groupName}"`,
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
        if (peek()?.value === '}') {
          next();
        } else {
          errors.push({
            line: startLine,
            message: "Unclosed '{' in Ref block",
          });
        }
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
          if (peek()?.value === '}') {
            next();
          } else {
            errors.push({
              line: startLine,
              message: "Unclosed '{' in Ref block",
            });
          }
        } else {
          errors.push({
            line: startLine,
            message: "Expected ':' or '{' after Ref",
          });
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
        if (peek()?.value === '}') {
          next();
        } else {
          errors.push({
            line: startLine,
            message: `Unclosed '{' in Enum "${fullId}"`,
          });
        }
      } else {
        errors.push({
          line: startLine,
          message: `Expected '{' after Enum ${fullId}`,
        });
      }
      if (enums.some((e) => e.id === fullId)) {
        errors.push({
          line: startLine,
          message: `Duplicate Enum definition "${fullId}"`,
        });
      }
      enums.push({
        id: fullId,
        schema,
        name,
        values,
        line: startLine,
      });
    } else if (keyword === 'note') {
      if (peek()?.value === ':') {
        next();
        next();
      } else if (peek()?.value === '{') {
        skipBlock();
      }
    } else if (tok.value === '}') {
      errors.push({
        line: tok.line,
        message: "Unexpected closing '}'",
      });
    } else {
      errors.push({
        line: tok.line,
        message: `Unknown keyword "${tok.value}" (expected Table, TableGroup, Ref, Enum, or Project)`,
      });
      if (peek()?.value === '{') {
        skipBlock();
      } else {
        while (idx < tokens.length && peek()?.type !== 'newline') {
          next();
        }
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

  // Semantic reference validation
  const tableById = new Map(tables.map((t) => [t.id, t]));
  for (const r of refs) {
    const errLine = r.line || 1;
    const fromT = tableById.get(r.fromTable);
    const toT = tableById.get(r.toTable);
    if (!fromT) {
      errors.push({
        line: errLine,
        message: `Ref references unknown table "${r.fromTable}"`,
      });
    } else {
      for (const col of r.fromColumns) {
        if (!fromT.columns.some((c) => c.name === col)) {
          errors.push({
            line: errLine,
            message: `Column "${col}" does not exist on table "${r.fromTable}"`,
          });
        }
      }
    }
    if (!toT) {
      errors.push({
        line: errLine,
        message: `Ref references unknown table "${r.toTable}"`,
      });
    } else {
      for (const col of r.toColumns) {
        if (!toT.columns.some((c) => c.name === col)) {
          errors.push({
            line: errLine,
            message: `Column "${col}" does not exist on table "${r.toTable}"`,
          });
        }
      }
    }
  }

  for (const g of tableGroups) {
    for (const tId of g.tables) {
      if (!tableById.has(tId)) {
        errors.push({
          line: g.line || 1,
          message: `TableGroup "${g.name}" references unknown table "${tId}"`,
        });
      }
    }
  }

  // Deduplicate and sort errors by line
  const seenErr = new Set<string>();
  const uniqueErrors: ParseError[] = [];
  for (const e of errors) {
    const key = `${e.line}::${e.message}`;
    if (!seenErr.has(key)) {
      seenErr.add(key);
      uniqueErrors.push(e);
    }
  }
  uniqueErrors.sort((a, b) => a.line - b.line);

  return {
    project,
    tables,
    refs,
    enums,
    tableGroups,
    errors: uniqueErrors,
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

export function assignTableToGroupInDbml(
  dbml: string,
  tableId: string,
  targetGroupName: string,
  parsed: ParsedSchema
): string {
  const target = parsed.tableGroups.find((g) => g.name === targetGroupName);
  if (!target) return dbml;
  if (target.tables.includes(tableId)) return dbml;
  const nextTables = [...target.tables, tableId];
  return upsertTableGroupInDbml(
    dbml,
    target.name,
    nextTables,
    target.color,
    target.note
  );
}

export function removeTableFromGroupInDbml(
  dbml: string,
  tableId: string,
  groupName: string | null,
  parsed: ParsedSchema
): string {
  let updated = dbml;
  for (const g of parsed.tableGroups) {
    if (groupName !== null && g.name !== groupName) continue;
    if (g.tables.includes(tableId)) {
      const nextTables = g.tables.filter((t) => t !== tableId);
      updated = upsertTableGroupInDbml(updated, g.name, nextTables, g.color, g.note);
    }
  }
  return updated;
}

export function setTableGroupsForTableInDbml(
  dbml: string,
  tableId: string,
  targetGroupNames: string[],
  parsed: ParsedSchema
): string {
  const targetSet = new Set(targetGroupNames);
  let updated = dbml;
  for (const g of parsed.tableGroups) {
    const hasTable = g.tables.includes(tableId);
    const shouldHave = targetSet.has(g.name);
    if (hasTable && !shouldHave) {
      const nextTables = g.tables.filter((t) => t !== tableId);
      updated = upsertTableGroupInDbml(updated, g.name, nextTables, g.color, g.note);
    } else if (!hasTable && shouldHave) {
      const nextTables = [...g.tables, tableId];
      updated = upsertTableGroupInDbml(updated, g.name, nextTables, g.color, g.note);
    }
  }
  return updated;
}

export function moveTableToGroupInDbml(
  dbml: string,
  tableId: string,
  targetGroupName: string | null,
  parsed: ParsedSchema,
  sourceGroupName?: string | null
): string {
  let updated = dbml;
  if (sourceGroupName !== undefined) {
    // Only remove from the specific source group when moving from a known group
    if (sourceGroupName && sourceGroupName !== targetGroupName) {
      updated = removeTableFromGroupInDbml(updated, tableId, sourceGroupName, parsed);
    }
  } else {
    // Remove from all other groups
    for (const g of parsed.tableGroups) {
      if (g.tables.includes(tableId) && g.name !== targetGroupName) {
        const nextTables = g.tables.filter((t) => t !== tableId);
        updated = upsertTableGroupInDbml(updated, g.name, nextTables, g.color, g.note);
      }
    }
  }

  if (targetGroupName) {
    const reParsed = parseDbml(updated);
    updated = assignTableToGroupInDbml(updated, tableId, targetGroupName, reParsed);
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
