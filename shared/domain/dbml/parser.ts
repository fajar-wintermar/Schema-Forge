import {
  CheckDef,
  ColumnDef,
  EnumDef,
  EnumValueDef,
  IndexColumnItem,
  IndexDef,
  ParseError,
  ParsedSchema,
  ProjectMeta,
  RefDef,
  RefRelation,
  SchemaNoteDef,
  TableDef,
  TableGroupDef,
  TablePartialDef,
} from '../schemaTypes';
import { DbmlToken, tokenizeDbml, unquote } from './lexer';

interface RawInlineRef {
  fromCol: string;
  relation: RefRelation;
  targetRaw: string;
  onDelete?: string;
  onUpdate?: string;
  color?: string;
  settings?: Record<string, string>;
  line: number;
}

interface RawPartialRef {
  name: string;
  line: number;
}

interface ParsedTableLikeBody {
  columns: ColumnDef[];
  indexes: IndexDef[];
  checks: CheckDef[];
  partialRefs: RawPartialRef[];
  inlineRefs: RawInlineRef[];
  note?: string;
}

interface ParsedBracketSettings {
  settings: Record<string, string>;
  refValues: string[];
}

function toRefRelation(value: string): RefRelation | null {
  switch (value) {
    case '>':
    case '<':
    case '-':
    case '<>':
      return value;
    default:
      return null;
  }
}

export function parseDbml(source: string): ParsedSchema {
  const errors: ParseError[] = [];
  const tokens = tokenizeDbml(source, errors);
  const project: ProjectMeta = {};
  const tables: TableDef[] = [];
  const tablePartials: TablePartialDef[] = [];
  const refs: RefDef[] = [];
  const enums: EnumDef[] = [];
  const tableGroups: TableGroupDef[] = [];
  const notes: SchemaNoteDef[] = [];

  const aliasToTableId = new Map<string, string>();
  const rawTableEntries: Array<{
    table: TableDef;
    partialRefs: RawPartialRef[];
    inlineRefs: RawInlineRef[];
  }> = [];
  const rawPartialEntries: Array<{
    partial: TablePartialDef;
    partialRefs: RawPartialRef[];
    inlineRefs: RawInlineRef[];
  }> = [];

  let idx = 0;

  const peek = (offset = 0) => tokens[idx + offset];
  const next = () => tokens[idx++];
  const skipNewlines = () => {
    while (peek()?.type === 'newline') idx++;
  };

  function parseBracketSettings(): ParsedBracketSettings {
    const settings: Record<string, string> = {};
    const refValues: string[] = [];
    if (peek()?.value !== '[') return { settings, refValues };
    const openTok = next(); // '['

    let currentKey = '';
    let currentValParts: string[] = [];
    let readingValue = false;

    const flush = () => {
      const k = currentKey.trim().toLowerCase();
      if (k) {
        const val = readingValue ? currentValParts.join(' ').trim() : 'true';
        settings[k] = val;
        if (k === 'ref' && val) {
          refValues.push(val);
        }
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

    return { settings, refValues };
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

  function formatJoinedTokens(toks: DbmlToken[]): string {
    let out = '';
    for (const t of toks) {
      if (t.type === 'newline') continue;
      if (!out) {
        out = t.value;
      } else if (
        t.value === '.' ||
        t.value === '(' ||
        t.value === ')' ||
        t.value === ',' ||
        out.endsWith('.') ||
        out.endsWith('(')
      ) {
        out += t.value === ',' ? ', ' : t.value;
      } else {
        out += ' ' + t.value;
      }
    }
    return out.trim();
  }

  function parseIndexEntryTokens(rawTokens: DbmlToken[]): IndexColumnItem | null {
    const cleaned = rawTokens.filter((t) => t.type !== 'newline');
    if (cleaned.length === 0) return null;

    if (cleaned.length === 1) {
      const only = cleaned[0];
      const isExpr =
        only.quote === '`' || /[()\s+\-*/=<>]/.test(only.value);
      return {
        value: isExpr ? only.value.trim() : unquote(only.value),
        isExpression: isExpr,
      };
    }

    // Multiple tokens inside one comma-separated index item (e.g. lower(email) or schema.col)
    const joined = formatJoinedTokens(cleaned);
    const hasParenOrExpr =
      cleaned.some((t) => t.quote === '`' || t.value === '(' || t.value === ')') ||
      /\s/.test(joined);
    return {
      value: joined,
      isExpression: hasParenOrExpr,
    };
  }

  function parseIndexesBlock(ownerLabel: string, startLine: number): IndexDef[] {
    const indexes: IndexDef[] = [];
    if (peek()?.value !== '{') return indexes;
    next(); // '{'

    while (idx < tokens.length && peek()?.value !== '}') {
      skipNewlines();
      if (peek()?.value === '}') break;

      const entryLine = peek()!.line;
      const items: IndexColumnItem[] = [];

      if (peek()?.value === '(') {
        next(); // '('
        let parenDepth = 0;
        let currentItemTokens: DbmlToken[] = [];

        while (idx < tokens.length) {
          const p = peek();
          if (!p) break;
          if (p.value === ')' && parenDepth === 0) {
            next();
            break;
          }
          const t = next();
          if (t.value === '(') {
            parenDepth++;
            currentItemTokens.push(t);
          } else if (t.value === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            currentItemTokens.push(t);
          } else if (t.value === ',' && parenDepth === 0) {
            const parsedItem = parseIndexEntryTokens(currentItemTokens);
            if (parsedItem) items.push(parsedItem);
            currentItemTokens = [];
          } else {
            currentItemTokens.push(t);
          }
        }

        const tailItem = parseIndexEntryTokens(currentItemTokens);
        if (tailItem) items.push(tailItem);
      } else {
        const singleTokens: DbmlToken[] = [];
        let parenDepth = 0;
        while (idx < tokens.length) {
          const p = peek();
          if (!p || p.type === 'newline' || p.value === '}') break;
          if (p.value === '[' && parenDepth === 0) break;
          const t = next();
          if (t.value === '(') parenDepth++;
          else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
          singleTokens.push(t);
        }
        const parsedItem = parseIndexEntryTokens(singleTokens);
        if (parsedItem) items.push(parsedItem);
      }

      let idxSettings: Record<string, string> = {};
      if (peek()?.value === '[') {
        idxSettings = parseBracketSettings().settings;
      }

      if (items.length > 0) {
        indexes.push({
          columns: items.map((it) =>
            it.isExpression ? `\`${it.value}\`` : it.value
          ),
          items,
          name: idxSettings['name'],
          unique: idxSettings['unique'] === 'true',
          pk: idxSettings['pk'] === 'true',
          type: idxSettings['type'],
          note: idxSettings['note'],
          line: entryLine,
        });
      }

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
        message: `Unclosed '{' in Indexes block of ${ownerLabel}`,
      });
    }

    return indexes;
  }

  function parseChecksBlock(ownerLabel: string, startLine: number): CheckDef[] {
    const checks: CheckDef[] = [];
    if (peek()?.value !== '{') return checks;
    next(); // '{'

    while (idx < tokens.length && peek()?.value !== '}') {
      skipNewlines();
      if (peek()?.value === '}') break;

      const entryLine = peek()!.line;
      const exprTokens: DbmlToken[] = [];
      let parenDepth = 0;

      while (idx < tokens.length) {
        const p = peek();
        if (!p || p.type === 'newline' || p.value === '}') break;
        if (p.value === '[' && parenDepth === 0) break;
        const t = next();
        if (t.value === '(') parenDepth++;
        else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
        exprTokens.push(t);
      }

      let chkSettings: Record<string, string> = {};
      if (peek()?.value === '[') {
        chkSettings = parseBracketSettings().settings;
      }

      const expression =
        exprTokens.length === 1 && exprTokens[0].type === 'string'
          ? exprTokens[0].value.trim()
          : formatJoinedTokens(exprTokens);

      if (expression) {
        checks.push({
          expression,
          name: chkSettings['name'],
          note: chkSettings['note'],
          line: entryLine,
        });
      }

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
        message: `Unclosed '{' in Checks block of ${ownerLabel}`,
      });
    }

    return checks;
  }

  function parseTableLikeBody(
    ownerLabel: string,
    ownerKind: 'Table' | 'TablePartial',
    startLine: number,
    initialNote?: string
  ): ParsedTableLikeBody {
    const columns: ColumnDef[] = [];
    const indexes: IndexDef[] = [];
    const checks: CheckDef[] = [];
    const partialRefs: RawPartialRef[] = [];
    const inlineRefs: RawInlineRef[] = [];
    let bodyNote = initialNote;

    while (idx < tokens.length && peek()?.value !== '}') {
      skipNewlines();
      if (peek()?.value === '}') break;

      const colFirst = peek();
      if (!colFirst) break;

      // TablePartial injection: ~partial_name
      if (colFirst.value === '~') {
        const tildeTok = next();
        if (peek() && peek()?.type !== 'newline' && peek()?.value !== '}') {
          const { fullId: partialName } = readQualifiedName();
          if (partialName && partialName !== 'unknown') {
            partialRefs.push({ name: partialName, line: tildeTok.line });
          }
        } else {
          errors.push({
            line: tildeTok.line,
            message: `Expected TablePartial name after '~' in ${ownerLabel}`,
          });
        }
        while (
          idx < tokens.length &&
          peek()?.type !== 'newline' &&
          peek()?.value !== '}'
        ) {
          next();
        }
        continue;
      }

      if (
        colFirst.value.toLowerCase() === 'note' &&
        (peek(1)?.value === ':' || peek(1)?.value === '{')
      ) {
        next();
        if (peek()?.value === ':') {
          next();
          skipNewlines();
          bodyNote = next()?.value;
        } else if (peek()?.value === '{') {
          next();
          skipNewlines();
          if (peek() && peek()?.value !== '}') {
            bodyNote = next().value;
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
          indexes.push(...parseIndexesBlock(ownerLabel, colFirst.line));
        }
        continue;
      }

      if (
        colFirst.value.toLowerCase() === 'checks' &&
        (peek(1)?.value === '{' || peek(1)?.type === 'newline')
      ) {
        next();
        skipNewlines();
        if (peek()?.value === '{') {
          checks.push(...parseChecksBlock(ownerLabel, colFirst.line));
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
            colType &&
            !colType.endsWith('(') &&
            !colType.endsWith(', ') &&
            !colType.endsWith('.')
              ? ' ' + t.value
              : t.value;
        }
      }

      let colSettings: Record<string, string> = {};
      let colRefValues: string[] = [];
      if (peek()?.value === '[') {
        const parsed = parseBracketSettings();
        colSettings = parsed.settings;
        colRefValues = parsed.refValues;
      }

      for (const rawRef of colRefValues) {
        const opMatch = rawRef.trim().match(/^(<>|[><-])\s*(.+)$/);
        const relation = opMatch ? toRefRelation(opMatch[1]) : null;
        if (opMatch && relation) {
          inlineRefs.push({
            fromCol: colName,
            relation,
            targetRaw: opMatch[2].trim(),
            onDelete: colSettings['delete'],
            onUpdate: colSettings['update'],
            color: colSettings['color'],
            settings: Object.keys(colSettings).length > 0 ? { ...colSettings } : undefined,
            line: nameTok.line,
          });
        } else {
          errors.push({
            line: nameTok.line,
            message: `Invalid inline ref "${rawRef}" on ${ownerLabel}.${colName} (expected e.g. > table.col)`,
          });
        }
      }

      if (!colType) {
        errors.push({
          line: nameTok.line,
          message: `Column "${colName}" in ${ownerKind.toLowerCase()} "${ownerLabel}" is missing a data type`,
        });
      }

      const isPk =
        colSettings['pk'] === 'true' ||
        colSettings['primary key'] === 'true';

      if (columns.some((c) => c.name === colName)) {
        errors.push({
          line: nameTok.line,
          message: `Duplicate column "${colName}" in ${ownerKind.toLowerCase()} "${ownerLabel}"`,
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
        check: colSettings['check'],
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
        message: `Unclosed '{' in ${ownerKind} "${ownerLabel}"`,
      });
    }

    return {
      columns,
      indexes,
      checks,
      partialRefs,
      inlineRefs,
      note: bodyNote,
    };
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
      settings = parseBracketSettings().settings;
    }

    const relIdx = exprTokens.findIndex((t) => toRefRelation(t.value) !== null);
    const relation = relIdx !== -1 ? toRefRelation(exprTokens[relIdx].value) : null;
    if (relIdx === -1 || !relation) {
      errors.push({
        line: startLine,
        message: `Invalid Ref syntax: missing relationship operator (>, <, -, <>)`,
      });
      return null;
    }

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
      name: refName || settings['name'],
      fromTable: left.table,
      fromColumns: left.cols,
      relation,
      toTable: right.table,
      toColumns: right.cols,
      onDelete: settings['delete'],
      onUpdate: settings['update'],
      color: settings['color'],
      settings: Object.keys(settings).length > 0 ? settings : undefined,
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
        tableSettings = parseBracketSettings().settings;
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

      const body = parseTableLikeBody(
        fullId,
        'Table',
        startLine,
        tableSettings['note']
      );

      if (tables.some((t) => t.id === fullId)) {
        errors.push({
          line: startLine,
          message: `Duplicate table definition "${fullId}"`,
        });
      }

      const tableDef: TableDef = {
        id: fullId,
        schema,
        name,
        alias,
        headerColor: tableSettings['headercolor'],
        note: body.note,
        columns: body.columns,
        indexes: body.indexes,
        checks: body.checks,
        line: startLine,
      };

      tables.push(tableDef);
      rawTableEntries.push({
        table: tableDef,
        partialRefs: body.partialRefs,
        inlineRefs: body.inlineRefs,
      });
    } else if (keyword === 'tablepartial') {
      const startLine = tok.line;
      const { fullId } = readQualifiedName();

      let partialSettings: Record<string, string> = {};
      if (peek()?.value === '[') {
        partialSettings = parseBracketSettings().settings;
      }

      skipNewlines();
      if (peek()?.value !== '{') {
        errors.push({
          line: startLine,
          message: `Expected '{' after TablePartial ${fullId}`,
        });
        continue;
      }
      next(); // '{'

      const body = parseTableLikeBody(
        fullId,
        'TablePartial',
        startLine,
        partialSettings['note']
      );

      if (tablePartials.some((p) => p.id === fullId)) {
        errors.push({
          line: startLine,
          message: `Duplicate TablePartial definition "${fullId}"`,
        });
      }

      const partialDef: TablePartialDef = {
        id: fullId,
        name: fullId,
        headerColor: partialSettings['headercolor'],
        note: body.note,
        columns: body.columns,
        indexes: body.indexes,
        checks: body.checks,
        settings:
          Object.keys(partialSettings).length > 0 ? partialSettings : undefined,
        line: startLine,
      };

      tablePartials.push(partialDef);
      rawPartialEntries.push({
        partial: partialDef,
        partialRefs: body.partialRefs,
        inlineRefs: body.inlineRefs,
      });
    } else if (keyword === 'tablegroup') {
      const startLine = tok.line;
      let groupName = 'Group';
      if (peek() && peek()?.value !== '{' && peek()?.value !== '[') {
        groupName = unquote(next().value);
      }

      let settings: Record<string, string> = {};
      if (peek()?.value === '[') {
        settings = parseBracketSettings().settings;
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
            vSettings = parseBracketSettings().settings;
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
      if (
        peek() &&
        peek()?.value !== ':' &&
        peek()?.value !== '{' &&
        peek()?.type !== 'newline'
      ) {
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
          id: `note_${notes.length + 1}_${displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')}`,
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
        message: `Unknown keyword "${tok.value}" (expected Table, TablePartial, TableGroup, Ref, Enum, Note, or Project)`,
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

  // Resolve TablePartial inheritance (including nested ~partial inside partials)
  const rawPartialMap = new Map(
    rawPartialEntries.map((entry) => [entry.partial.id, entry])
  );
  const resolvedPartials = new Map<
    string,
    {
      columns: ColumnDef[];
      indexes: IndexDef[];
      checks: CheckDef[];
      inlineRefs: RawInlineRef[];
      headerColor?: string;
      note?: string;
      appliedPartials: string[];
    }
  >();

  function mergeColumnList(base: ColumnDef[], incoming: ColumnDef[]): ColumnDef[] {
    const out = [...base];
    for (const col of incoming) {
      const existingIdx = out.findIndex((c) => c.name === col.name);
      if (existingIdx >= 0) {
        out[existingIdx] = { ...col };
      } else {
        out.push({ ...col });
      }
    }
    return out;
  }

  function resolvePartial(
    partialId: string,
    stack: string[]
  ): {
    columns: ColumnDef[];
    indexes: IndexDef[];
    checks: CheckDef[];
    inlineRefs: RawInlineRef[];
    headerColor?: string;
    note?: string;
    appliedPartials: string[];
  } | null {
    if (resolvedPartials.has(partialId)) {
      return resolvedPartials.get(partialId)!;
    }
    const entry = rawPartialMap.get(partialId);
    if (!entry) return null;

    if (stack.includes(partialId)) {
      const cycle = [...stack, partialId].join(' -> ');
      errors.push({
        line: entry.partial.line || 1,
        message: `Circular TablePartial reference detected: ${cycle}`,
      });
      return null;
    }

    const nextStack = [...stack, partialId];
    let mergedCols: ColumnDef[] = [];
    const mergedIndexes: IndexDef[] = [];
    const mergedChecks: CheckDef[] = [];
    const mergedInlineRefs: RawInlineRef[] = [];
    let inheritedHeaderColor = entry.partial.headerColor;
    let inheritedNote = entry.partial.note;
    const applied: string[] = [];

    for (const pref of entry.partialRefs) {
      if (!rawPartialMap.has(pref.name)) {
        errors.push({
          line: pref.line,
          message: `Unknown TablePartial "~${pref.name}" referenced in TablePartial "${partialId}"`,
        });
        continue;
      }
      if (nextStack.includes(pref.name)) {
        errors.push({
          line: pref.line,
          message: `Circular TablePartial reference detected: ${[...nextStack, pref.name].join(' -> ')}`,
        });
        continue;
      }
      const sub = resolvePartial(pref.name, nextStack);
      if (!sub) continue;
      applied.push(pref.name);
      if (!inheritedHeaderColor && sub.headerColor) {
        inheritedHeaderColor = sub.headerColor;
      }
      if (!inheritedNote && sub.note) {
        inheritedNote = sub.note;
      }
      mergedCols = mergeColumnList(
        mergedCols,
        sub.columns.map((c) => ({ ...c, fromPartial: c.fromPartial || pref.name }))
      );
      mergedIndexes.push(...sub.indexes);
      mergedChecks.push(...sub.checks);
      mergedInlineRefs.push(...sub.inlineRefs);
    }

    mergedCols = mergeColumnList(
      mergedCols,
      entry.partial.columns.map((c) => ({ ...c, fromPartial: partialId }))
    );
    mergedIndexes.push(...entry.partial.indexes);
    mergedChecks.push(...entry.partial.checks);
    mergedInlineRefs.push(...entry.inlineRefs);

    // Update the TablePartialDef in place for Docs/inspection
    entry.partial.columns = mergedCols.map((c) => ({
      ...c,
      fromPartial: c.fromPartial === partialId ? undefined : c.fromPartial,
    }));
    entry.partial.indexes = [...mergedIndexes];
    entry.partial.checks = [...mergedChecks];
    entry.partial.headerColor = inheritedHeaderColor;
    entry.partial.note = inheritedNote;
    if (applied.length > 0) entry.partial.appliedPartials = applied;

    const result = {
      columns: mergedCols,
      indexes: mergedIndexes,
      checks: mergedChecks,
      inlineRefs: mergedInlineRefs,
      headerColor: inheritedHeaderColor,
      note: inheritedNote,
      appliedPartials: applied,
    };
    resolvedPartials.set(partialId, result);
    return result;
  }

  for (const entry of rawPartialEntries) {
    resolvePartial(entry.partial.id, []);
  }

  // Apply TablePartials to each Table and materialize inline refs
  const allInlineRefs: Array<RawInlineRef & { fromTable: string }> = [];

  for (const entry of rawTableEntries) {
    const { table, partialRefs, inlineRefs: ownInlineRefs } = entry;
    const ownColNames = new Set(table.columns.map((c) => c.name));
    let mergedCols: ColumnDef[] = [];
    const mergedIndexes: IndexDef[] = [];
    const mergedChecks: CheckDef[] = [];
    const appliedPartials: string[] = [];
    const partialInlineRefs: RawInlineRef[] = [];

    for (const pref of partialRefs) {
      const resolved = resolvePartial(pref.name, []);
      if (!resolved) {
        if (!rawPartialMap.has(pref.name)) {
          errors.push({
            line: pref.line,
            message: `Unknown TablePartial "~${pref.name}" referenced in Table "${table.id}"`,
          });
        }
        continue;
      }
      appliedPartials.push(pref.name);
      if (!table.headerColor && resolved.headerColor) {
        table.headerColor = resolved.headerColor;
      }
      if (!table.note && resolved.note) {
        table.note = resolved.note;
      }
      mergedCols = mergeColumnList(
        mergedCols,
        resolved.columns.map((c) => ({ ...c, fromPartial: c.fromPartial || pref.name }))
      );
      mergedIndexes.push(...resolved.indexes);
      mergedChecks.push(...resolved.checks);
      for (const pir of resolved.inlineRefs) {
        if (!ownColNames.has(pir.fromCol)) {
          partialInlineRefs.push(pir);
        }
      }
    }

    table.columns = mergeColumnList(mergedCols, table.columns);
    table.indexes = [...mergedIndexes, ...table.indexes];
    table.checks = [...mergedChecks, ...table.checks];
    if (appliedPartials.length > 0) {
      table.appliedPartials = appliedPartials;
    }

    for (const ir of [...partialInlineRefs, ...ownInlineRefs]) {
      allInlineRefs.push({ ...ir, fromTable: table.id });
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

  for (const ir of allInlineRefs) {
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
      onDelete: ir.onDelete,
      onUpdate: ir.onUpdate,
      color: ir.color,
      settings: ir.settings,
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

  // Semantic reference & index column validation
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

  for (const t of tables) {
    for (const idxDef of t.indexes) {
      const items =
        idxDef.items ||
        idxDef.columns.map((c) => ({
          value: c,
          isExpression: c.startsWith('`') && c.endsWith('`'),
        }));
      for (const item of items) {
        if (item.isExpression) continue;
        if (!t.columns.some((c) => c.name === item.value)) {
          errors.push({
            line: idxDef.line || t.line || 1,
            message: `Index references unknown column "${item.value}" on table "${t.id}"`,
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
    tablePartials,
    refs,
    enums,
    tableGroups,
    notes,
    errors: uniqueErrors,
  };
}
