import { ParsedSchema } from '../schemaTypes';
import { parseDbml } from './parser';

function formatBodyNoteValue(note: string): string {
  const normalized = note.replace(/\r\n?/g, '\n').trim();
  if (normalized.includes('\n') || normalized.includes("'")) {
    const escaped = normalized.replace(/'''/g, "\\'''");
    const indented = escaped
      .split('\n')
      .map((l) => (l ? `    ${l}` : ''))
      .join('\n');
    return `'''\n${indented}\n  '''`;
  }
  const escaped = normalized.replace(/\\/g, '\\\\');
  return `'${escaped}'`;
}

function formatInlineNoteValue(note: string): string {
  const normalized = note.replace(/\r\n?/g, '\n').trim();
  if (normalized.includes('\n')) {
    const escaped = normalized.replace(/'''/g, "\\'''");
    return `'''\n${escaped}\n'''`;
  }
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `'${escaped}'`;
}

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
  let noteLine = '';
  if (note && note.trim()) {
    noteLine = `  Note: ${formatBodyNoteValue(note)}\n`;
  }
  const tableLines = tables.map((t) => `  ${t}`).join('\n');
  const body = [noteLine.trimEnd(), tableLines].filter(Boolean).join('\n');
  return `TableGroup ${safeName}${optStr} {\n${body ? body + '\n' : ''}}`;
}

function scanBalancedBracesEnd(dbml: string, openBraceIdx: number): number {
  let i = openBraceIdx + 1;
  let depth = 1;
  while (i < dbml.length && depth > 0) {
    const ch = dbml[i];
    if (ch === '/' && dbml[i + 1] === '/') {
      while (i < dbml.length && dbml[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && dbml[i + 1] === '*') {
      i += 2;
      while (i < dbml.length && !(dbml[i] === '*' && dbml[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (dbml.slice(i, i + 3) === "'''") {
      i += 3;
      while (i < dbml.length) {
        if (dbml[i] === '\\' && dbml.slice(i + 1, i + 4) === "'''") {
          i += 4;
          continue;
        }
        if (dbml.slice(i, i + 3) === "'''") {
          i += 3;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < dbml.length && dbml[i] !== q) {
        if (dbml[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return i;
}

function findTableGroupBlockRange(
  dbml: string,
  groupName: string
): { start: number; end: number } | null {
  const regex =
    /TableGroup\s+("([^"]+)"|'([^']+)'|([^\s\[{]+))(\s*\[[^\]]*\])?\s*\{/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(dbml)) !== null) {
    const matchedName = match[2] || match[3] || match[4];
    if (matchedName === groupName) {
      const start = match.index;
      const openBraceIdx = match.index + match[0].length - 1;
      const end = scanBalancedBracesEnd(dbml, openBraceIdx);
      return { start, end };
    }
  }
  return null;
}

function stripQuotes(raw: string): string {
  return raw.replace(/^["'`]|["'`]$/g, '');
}

function normalizeQualifiedTableName(raw: string): string {
  return raw
    .split('.')
    .map((part) => stripQuotes(part.trim()))
    .join('.');
}

function findTableHeaderAndBody(
  dbml: string,
  tableId: string
): {
  headerStart: number;
  bracketStart: number | null;
  bracketEnd: number | null;
  openBraceIdx: number;
  closeBraceIdx: number;
} | null {
  const tableHeaderRegex =
    /^[ \t]*Table\s+((?:"[^"]+"|'[^']+'|[^\s\[{.(]+)(?:\s*\.\s*(?:"[^"]+"|'[^']+'|[^\s\[{]+))?)(?:\s+as\s+(?:"[^"]+"|'[^']+'|[^\s\[{]+))?/gim;
  let match: RegExpExecArray | null;

  while ((match = tableHeaderRegex.exec(dbml)) !== null) {
    const candidateId = normalizeQualifiedTableName(match[1]);
    if (candidateId !== tableId) continue;

    let i = match.index + match[0].length;
    while (i < dbml.length && (dbml[i] === ' ' || dbml[i] === '\t')) i++;

    let bracketStart: number | null = null;
    let bracketEnd: number | null = null;

    if (dbml[i] === '[') {
      bracketStart = i;
      i++;
      let bDepth = 1;
      while (i < dbml.length && bDepth > 0) {
        if (dbml.slice(i, i + 3) === "'''") {
          i += 3;
          while (i < dbml.length) {
            if (dbml[i] === '\\' && dbml.slice(i + 1, i + 4) === "'''") {
              i += 4;
              continue;
            }
            if (dbml.slice(i, i + 3) === "'''") {
              i += 3;
              break;
            }
            i++;
          }
          continue;
        }
        const ch = dbml[i];
        if (ch === "'" || ch === '"' || ch === '`') {
          const q = ch;
          i++;
          while (i < dbml.length && dbml[i] !== q) {
            if (dbml[i] === '\\') i++;
            i++;
          }
          i++;
          continue;
        }
        if (ch === '[') bDepth++;
        else if (ch === ']') bDepth--;
        i++;
      }
      bracketEnd = i;
      while (
        i < dbml.length &&
        (dbml[i] === ' ' || dbml[i] === '\t' || dbml[i] === '\n' || dbml[i] === '\r')
      ) {
        i++;
      }
    } else {
      while (
        i < dbml.length &&
        (dbml[i] === ' ' || dbml[i] === '\t' || dbml[i] === '\n' || dbml[i] === '\r')
      ) {
        i++;
      }
    }

    if (dbml[i] !== '{') continue;
    const openBraceIdx = i;
    const endIdx = scanBalancedBracesEnd(dbml, openBraceIdx);
    const closeBraceIdx = endIdx - 1;
    return {
      headerStart: match.index,
      bracketStart,
      bracketEnd,
      openBraceIdx,
      closeBraceIdx,
    };
  }

  return null;
}

function splitBracketEntries(rawInner: string): string[] {
  const entries: string[] = [];
  let start = 0;
  let i = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  while (i < rawInner.length) {
    if (rawInner.slice(i, i + 3) === "'''") {
      i += 3;
      while (i < rawInner.length) {
        if (rawInner[i] === '\\' && rawInner.slice(i + 1, i + 4) === "'''") {
          i += 4;
          continue;
        }
        if (rawInner.slice(i, i + 3) === "'''") {
          i += 3;
          break;
        }
        i++;
      }
      continue;
    }
    const ch = rawInner[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      i++;
      while (i < rawInner.length && rawInner[i] !== q) {
        if (rawInner[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']' && bracketDepth > 0) bracketDepth--;
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const part = rawInner.slice(start, i).trim();
      if (part) entries.push(part);
      start = i + 1;
    }
    i++;
  }

  const tail = rawInner.slice(start).trim();
  if (tail) entries.push(tail);
  return entries;
}

function skipLiteralOrComment(text: string, i: number): number | null {
  if (text[i] === '/' && text[i + 1] === '/') {
    let j = i + 2;
    while (j < text.length && text[j] !== '\n') j++;
    return j;
  }
  if (text[i] === '/' && text[i + 1] === '*') {
    let j = i + 2;
    while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++;
    return Math.min(text.length, j + 2);
  }
  if (text.slice(i, i + 3) === "'''") {
    let j = i + 3;
    while (j < text.length) {
      if (text[j] === '\\' && text.slice(j + 1, j + 4) === "'''") {
        j += 4;
        continue;
      }
      if (text.slice(j, j + 3) === "'''") {
        return j + 3;
      }
      j++;
    }
    return text.length;
  }
  const ch = text[i];
  if (ch === "'" || ch === '"' || ch === '`') {
    let j = i + 1;
    while (j < text.length && text[j] !== ch) {
      if (text[j] === '\\') j++;
      j++;
    }
    return Math.min(text.length, j + 1);
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

export function setTableGroupNoteInDbml(
  dbml: string,
  groupName: string,
  note: string,
  existingSchema?: ParsedSchema
): string {
  const schema = existingSchema ?? parseDbml(dbml);
  const group = schema.tableGroups.find((g) => g.name === groupName);
  if (!group) return dbml;
  const trimmed = note.replace(/\r\n?/g, '\n').trim();
  return upsertTableGroupInDbml(
    dbml,
    group.name,
    group.tables,
    group.color,
    trimmed ? trimmed : undefined
  );
}

export function setTableNoteInDbml(
  dbml: string,
  tableId: string,
  note: string
): string {
  const loc = findTableHeaderAndBody(dbml, tableId);
  if (!loc) return dbml;

  const trimmed = note.replace(/\r\n?/g, '\n').trim();
  let updated = dbml;
  let delta = 0;

  // Strip any header [note: ...] so the body Note: '...' becomes the single source of truth
  if (loc.bracketStart !== null && loc.bracketEnd !== null) {
    const rawInner = updated.slice(loc.bracketStart + 1, loc.bracketEnd - 1);
    const entries = splitBracketEntries(rawInner);
    const filtered = entries.filter((entry) => !/^note\s*:/i.test(entry));
    if (filtered.length !== entries.length) {
      let replaceFrom = loc.bracketStart;
      while (replaceFrom > 0 && (updated[replaceFrom - 1] === ' ' || updated[replaceFrom - 1] === '\t')) {
        replaceFrom--;
      }
      const replacement = filtered.length > 0 ? ` [${filtered.join(', ')}]` : '';
      updated =
        updated.slice(0, replaceFrom) +
        replacement +
        updated.slice(loc.bracketEnd);
      delta = replacement.length - (loc.bracketEnd - replaceFrom);
    }
  }

  const bodyStart = loc.openBraceIdx + 1 + delta;
  const bodyEnd = loc.closeBraceIdx + delta;
  const body = updated.slice(bodyStart, bodyEnd);

  // Locate top-level Note: ... or Note { ... } inside the Table body
  let i = 0;
  let braceDepth = 0;
  let noteStart: number | null = null;
  let noteEnd: number | null = null;
  let noteIndent = '  ';

  while (i < body.length) {
    const skipped = skipLiteralOrComment(body, i);
    if (skipped !== null) {
      i = skipped;
      continue;
    }

    if (body[i] === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (body[i] === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }

    if (braceDepth === 0) {
      const lineStart = i === 0 || body[i - 1] === '\n';
      if (lineStart) {
        const rest = body.slice(i);
        const colonMatch = rest.match(/^([ \t]*)Note\s*:\s*/i);
        const blockMatch = rest.match(/^([ \t]*)Note\s*\{/i);

        if (colonMatch) {
          noteStart = i;
          noteIndent = colonMatch[1] || '  ';
          let j = i + colonMatch[0].length;
          while (j < body.length && (body[j] === ' ' || body[j] === '\t' || body[j] === '\n' || body[j] === '\r')) {
            j++;
          }
          const strEnd = skipLiteralOrComment(body, j);
          if (strEnd !== null) {
            j = strEnd;
          } else {
            while (j < body.length && body[j] !== '\n') j++;
          }
          while (j < body.length && (body[j] === ' ' || body[j] === '\t')) j++;
          noteEnd = j;
          break;
        }

        if (blockMatch) {
          noteStart = i;
          noteIndent = blockMatch[1] || '  ';
          const openB = i + blockMatch[0].length - 1;
          noteEnd = scanBalancedBracesEnd(body, openB);
          while (noteEnd < body.length && (body[noteEnd] === ' ' || body[noteEnd] === '\t')) {
            noteEnd++;
          }
          break;
        }
      }
    }

    i++;
  }

  let nextBody = body;
  if (noteStart !== null && noteEnd !== null) {
    if (!trimmed) {
      const before = body.slice(0, noteStart);
      let after = body.slice(noteEnd);
      if (after.startsWith('\r\n')) after = after.slice(2);
      else if (after.startsWith('\n')) after = after.slice(1);
      nextBody = before + after;
    } else {
      const replacement = `${noteIndent}Note: ${formatBodyNoteValue(trimmed)}`;
      nextBody = body.slice(0, noteStart) + replacement + body.slice(noteEnd);
    }
  } else if (trimmed) {
    const trimmedBody = body.replace(/[ \t]+$/, '');
    const prefix = trimmedBody.endsWith('\n')
      ? trimmedBody
      : trimmedBody
      ? `${trimmedBody}\n`
      : '\n';
    nextBody = `${prefix}  Note: ${formatBodyNoteValue(trimmed)}\n`;
  }

  return updated.slice(0, bodyStart) + nextBody + updated.slice(bodyEnd);
}

export function setColumnNoteInDbml(
  dbml: string,
  tableId: string,
  columnName: string,
  note: string
): string {
  const loc = findTableHeaderAndBody(dbml, tableId);
  if (!loc) return dbml;

  const trimmed = note.replace(/\r\n?/g, '\n').trim();
  const bodyStart = loc.openBraceIdx + 1;
  const bodyEnd = loc.closeBraceIdx;
  const body = dbml.slice(bodyStart, bodyEnd);

  let i = 0;
  let braceDepth = 0;

  while (i < body.length) {
    while (
      i < body.length &&
      (body[i] === ' ' || body[i] === '\t' || body[i] === '\n' || body[i] === '\r')
    ) {
      i++;
    }
    if (i >= body.length) break;

    if (body[i] === '/' && (body[i + 1] === '/' || body[i + 1] === '*')) {
      const skipped = skipLiteralOrComment(body, i);
      i = skipped ?? i + 1;
      continue;
    }

    if (body[i] === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (body[i] === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }

    if (braceDepth > 0) {
      const skipped = skipLiteralOrComment(body, i);
      i = skipped !== null ? skipped : i + 1;
      continue;
    }

    const stmtStart = i;
    const rest = body.slice(stmtStart);

    // Skip sub-blocks (indexes, checks, Note) or TablePartial (~partial)
    if (
      /^(?:indexes|checks)\b/i.test(rest) ||
      /^Note\s*[:{]/i.test(rest) ||
      rest.startsWith('~')
    ) {
      // Advance to next newline or balanced brace block
      while (i < body.length) {
        const skipped = skipLiteralOrComment(body, i);
        if (skipped !== null) {
          i = skipped;
          continue;
        }
        if (body[i] === '{') {
          i = scanBalancedBracesEnd(body, i);
          break;
        }
        if (body[i] === '\n') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Parse column statement up to unquoted newline (spanning multiline [...] if any)
    let parenDepth = 0;
    let bracketDepth = 0;
    let colBracketStart: number | null = null;
    let colBracketEnd: number | null = null;
    let inlineCommentStart: number | null = null;

    while (i < body.length) {
      if (body[i] === '/' && body[i + 1] === '/') {
        if (parenDepth === 0 && bracketDepth === 0) {
          inlineCommentStart = i;
        }
        while (i < body.length && body[i] !== '\n') i++;
        break;
      }
      const skipped = skipLiteralOrComment(body, i);
      if (skipped !== null) {
        i = skipped;
        continue;
      }
      const ch = body[i];
      if (ch === '\n' && parenDepth === 0 && bracketDepth === 0) {
        break;
      }
      if (ch === '(') parenDepth++;
      else if (ch === ')' && parenDepth > 0) parenDepth--;
      else if (ch === '[') {
        if (parenDepth === 0 && bracketDepth === 0) {
          // Skip array type suffix []
          if (body[i + 1] === ']') {
            i += 2;
            continue;
          }
          colBracketStart = i;
        }
        bracketDepth++;
      } else if (ch === ']') {
        bracketDepth = Math.max(0, bracketDepth - 1);
        if (parenDepth === 0 && bracketDepth === 0 && colBracketStart !== null) {
          colBracketEnd = i + 1;
        }
      }
      i++;
    }

    const stmtEnd = inlineCommentStart !== null ? inlineCommentStart : i;
    const stmtText = body.slice(stmtStart, stmtEnd).trimEnd();
    const colMatch = stmtText.match(/^("([^"]+)"|'([^']+)'|([^\s\[:]+))/);
    const parsedColName = colMatch
      ? colMatch[2] || colMatch[3] || colMatch[4]
      : null;

    if (parsedColName === columnName) {
      let nextBody = body;
      if (colBracketStart !== null && colBracketEnd !== null) {
        const inner = body.slice(colBracketStart + 1, colBracketEnd - 1);
        const entries = splitBracketEntries(inner);
        const filtered = entries.filter((entry) => !/^note\s*:/i.test(entry));
        if (trimmed) {
          filtered.push(`note: ${formatInlineNoteValue(trimmed)}`);
        }
        if (filtered.length > 0) {
          const replacement = `[${filtered.join(', ')}]`;
          nextBody =
            body.slice(0, colBracketStart) +
            replacement +
            body.slice(colBracketEnd);
        } else {
          let trimFrom = colBracketStart;
          while (
            trimFrom > stmtStart &&
            (body[trimFrom - 1] === ' ' || body[trimFrom - 1] === '\t')
          ) {
            trimFrom--;
          }
          nextBody = body.slice(0, trimFrom) + body.slice(colBracketEnd);
        }
      } else if (trimmed) {
        const insertPos = stmtStart + stmtText.length;
        nextBody =
          body.slice(0, insertPos) +
          ` [note: ${formatInlineNoteValue(trimmed)}]` +
          body.slice(insertPos);
      }

      return dbml.slice(0, bodyStart) + nextBody + dbml.slice(bodyEnd);
    }

    if (i < body.length && body[i] === '\n') i++;
  }

  return dbml;
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
    if (sourceGroupName && sourceGroupName !== targetGroupName) {
      updated = removeTableFromGroupInDbml(updated, tableId, sourceGroupName, parsed);
    }
  } else {
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

function formatDbmlRefIdentifier(identifier: string): string {
  return identifier
    .split('.')
    .map((part) => (/[^a-zA-Z0-9_]/.test(part) ? `"${part}"` : part))
    .join('.');
}

export function addRefInDbml(
  dbml: string,
  fromTable: string,
  fromCol: string,
  toTable: string,
  toCol: string,
  relation: '>' | '<' | '-' | '<>' = '>',
  existingSchema?: ParsedSchema
): { dbml: string; added: boolean; duplicate: boolean } {
  const refsToCheck = existingSchema?.refs ?? parseDbml(dbml).refs;
  const isSameSide = (
    aTable: string,
    aCols: string[],
    bTable: string,
    bCol: string
  ) => aTable === bTable && aCols.length === 1 && aCols[0] === bCol;

  const duplicate = refsToCheck.some(
    (r) =>
      (isSameSide(r.fromTable, r.fromColumns, fromTable, fromCol) &&
        isSameSide(r.toTable, r.toColumns, toTable, toCol)) ||
      (isSameSide(r.fromTable, r.fromColumns, toTable, toCol) &&
        isSameSide(r.toTable, r.toColumns, fromTable, fromCol))
  );

  if (duplicate) {
    return { dbml, added: false, duplicate: true };
  }

  const refLine = `Ref: ${formatDbmlRefIdentifier(
    fromTable
  )}.${formatDbmlRefIdentifier(fromCol)} ${relation} ${formatDbmlRefIdentifier(
    toTable
  )}.${formatDbmlRefIdentifier(toCol)}`;

  const trimmed = dbml.trimEnd();
  const nextDbml = trimmed ? `${trimmed}\n\n${refLine}\n` : `${refLine}\n`;
  return { dbml: nextDbml, added: true, duplicate: false };
}
