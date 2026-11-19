import { ParsedSchema } from '../../types/schema';
import { parseDbml } from './parser';

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
  if (note) {
    if (note.includes('\n') || note.includes("'")) {
      const escaped = note.replace(/'''/g, "\\'''");
      const indented = escaped
        .split('\n')
        .map((l) => (l ? `    ${l}` : ''))
        .join('\n');
      noteLine = `  Note: '''\n${indented}\n  '''\n`;
    } else {
      noteLine = `  Note: '${note}'\n`;
    }
  }
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
