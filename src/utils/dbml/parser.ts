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
  SchemaNoteDef,
  TableDef,
  TableGroupDef,
} from '../../types/schema';
import { DbmlToken, tokenizeDbml, unquote } from './lexer';

export function parseDbml(source: string): ParsedSchema {
  const errors: ParseError[] = [];
  const tokens = tokenizeDbml(source, errors);
  const project: ProjectMeta = {};
  const tables: TableDef[] = [];
  const refs: RefDef[] = [];
  const enums: EnumDef[] = [];
  const tableGroups: TableGroupDef[] = [];
  const notes: SchemaNoteDef[] = [];

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
    const exprTokens: DbmlToken[] = [];
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

    const parseSide = (sideTokens: DbmlToken[]) => {
      const joined = sideTokens.map((t) => t.value).join('');
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
            skipNewlines();
            const valTok = next();
            if (key === 'database_type') project.databaseType = valTok?.value;
            else if (key === 'note') project.note = valTok?.value;
          } else if (key === 'note' && peek()?.value === '{') {
            next();
            skipNewlines();
            if (peek() && peek()?.value !== '}') {
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

        if (
          colFirst.value.toLowerCase() === 'note' &&
          (peek(1)?.value === ':' || peek(1)?.value === '{')
        ) {
          next();
          if (peek()?.value === ':') {
            next();
            skipNewlines();
            tableNote = next()?.value;
          } else if (peek()?.value === '{') {
            next();
            skipNewlines();
            if (peek() && peek()?.value !== '}') {
              tableNote = next().value;
            }
            skipNewlines();
            if (peek()?.value === '}') next();
          }
          continue;
        }

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

        const nameTok = next();
        const colName = unquote(nameTok.value);

        let colType = '';
        let parenDepth = 0;
        while (idx < tokens.length) {
          const p = peek();
          if (!p || p.type === 'newline' || p.value === '}') break;
          if (p.value === '[' && parenDepth === 0) {
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
              skipNewlines();
              groupNote = next()?.value;
            } else if (peek()?.value === '{') {
              next();
              skipNewlines();
              if (peek() && peek()?.value !== '}') groupNote = next().value;
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
      const startLine = tok.line;
      let noteName: string | undefined;
      if (peek() && peek()?.value !== ':' && peek()?.value !== '{' && peek()?.type !== 'newline') {
        noteName = unquote(next().value);
      }
      skipNewlines();
      let content = '';
      if (peek()?.value === ':') {
        next();
        skipNewlines();
        if (peek()) content = next().value;
      } else if (peek()?.value === '{') {
        const openBraceLine = peek()!.line;
        next();
        skipNewlines();
        const parts: string[] = [];
        while (idx < tokens.length && peek()?.value !== '}') {
          if (peek()?.type === 'newline') {
            next();
            continue;
          }
          parts.push(next().value);
        }
        content = parts.join('\n').trim();
        if (peek()?.value === '}') {
          next();
        } else {
          errors.push({
            line: openBraceLine,
            message: `Unclosed '{' in Note${noteName ? ` "${noteName}"` : ''}`,
          });
        }
      }
      if (content) {
        const displayName = noteName || `Project Note ${notes.length + 1}`;
        notes.push({
          id: `note_${notes.length + 1}_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          name: displayName,
          content,
          line: startLine,
        });
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
    notes,
    errors: uniqueErrors,
  };
}
