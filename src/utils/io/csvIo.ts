import { ParsedSchema } from '../../types/schema';

function escapeCsvField(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function exportSchemaToCsv(schema: ParsedSchema): string {
  const tableToGroups = new Map<string, string[]>();
  for (const g of schema.tableGroups) {
    for (const t of g.tables) {
      if (!tableToGroups.has(t)) tableToGroups.set(t, []);
      const arr = tableToGroups.get(t)!;
      if (!arr.includes(g.name)) arr.push(g.name);
    }
  }

  const refLookup = new Map<string, string>();
  for (const r of schema.refs) {
    r.fromColumns.forEach((col, i) => {
      const toCol = r.toColumns[i] || r.toColumns[0] || 'id';
      refLookup.set(
        `${r.fromTable}.${col}`,
        `${r.relation} ${r.toTable}.${toCol}`
      );
    });
  }

  const headers = [
    'table_name',
    'table_group',
    'column_name',
    'data_type',
    'primary_key',
    'unique',
    'not_null',
    'increment',
    'default_value',
    'reference',
    'column_note',
    'table_note',
  ];

  const lines = [headers.join(',')];

  for (const table of schema.tables) {
    const groupName = (tableToGroups.get(table.id) || []).join('; ');
    for (const col of table.columns) {
      const refStr = refLookup.get(`${table.id}.${col.name}`) || '';
      const row = [
        table.id,
        groupName,
        col.name,
        col.type,
        col.pk ? 'true' : 'false',
        col.unique ? 'true' : 'false',
        col.notNull ? 'true' : 'false',
        col.increment ? 'true' : 'false',
        col.defaultValue || '',
        refStr,
        col.note || '',
        table.note || '',
      ].map(escapeCsvField);
      lines.push(row.join(','));
    }
  }

  return lines.join('\n');
}

export function importCsvToDbml(csvText: string): string {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.');
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const colIdx = (names: string[]) =>
    header.findIndex((h) => names.includes(h));

  const iTable = colIdx(['table_name', 'table', 'entity']);
  const iGroup = colIdx(['table_group', 'group', 'domain']);
  const iCol = colIdx(['column_name', 'column', 'field']);
  const iType = colIdx(['data_type', 'type']);
  const iPk = colIdx(['primary_key', 'pk', 'is_pk']);
  const iUnique = colIdx(['unique', 'is_unique']);
  const iNotNull = colIdx(['not_null', 'required']);
  const iInc = colIdx(['increment', 'auto_increment']);
  const iDefault = colIdx(['default_value', 'default']);
  const iRef = colIdx(['reference', 'ref', 'foreign_key']);
  const iNote = colIdx(['column_note', 'note', 'description']);
  const iTableNote = colIdx(['table_note']);

  if (iTable === -1 || iCol === -1) {
    throw new Error(
      'CSV requires at least "table_name" (or "table") and "column_name" (or "column") columns.'
    );
  }

  const tablesMap = new Map<
    string,
    { note?: string; cols: string[] }
  >();
  const groupsMap = new Map<string, Set<string>>();
  const refs: string[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const tableName = row[iTable]?.trim();
    const colName = row[iCol]?.trim();
    if (!tableName || !colName) continue;

    const dataType = (iType !== -1 ? row[iType] : '') || 'varchar';
    const isPk = iPk !== -1 && /^(true|yes|1|pk)$/i.test(row[iPk] || '');
    const isUnique =
      iUnique !== -1 && /^(true|yes|1|unique)$/i.test(row[iUnique] || '');
    const isNotNull =
      iNotNull !== -1 && /^(true|yes|1|not null)$/i.test(row[iNotNull] || '');
    const isInc =
      iInc !== -1 && /^(true|yes|1|increment)$/i.test(row[iInc] || '');
    const defVal = iDefault !== -1 ? row[iDefault] : '';
    const refVal = iRef !== -1 ? row[iRef] : '';
    const colNote = iNote !== -1 ? row[iNote] : '';
    const tNote = iTableNote !== -1 ? row[iTableNote] : '';
    const groupVal = iGroup !== -1 ? row[iGroup] : '';

    if (groupVal) {
      const groupNames = groupVal
        .split(/[;|]/)
        .map((g) => g.trim())
        .filter(Boolean);
      for (const gName of groupNames) {
        if (!groupsMap.has(gName)) groupsMap.set(gName, new Set());
        groupsMap.get(gName)!.add(tableName);
      }
    }

    if (!tablesMap.has(tableName)) {
      tablesMap.set(tableName, { note: tNote || undefined, cols: [] });
    } else if (tNote && !tablesMap.get(tableName)!.note) {
      tablesMap.get(tableName)!.note = tNote;
    }

    const attrs: string[] = [];
    if (isPk) attrs.push('pk');
    if (isInc) attrs.push('increment');
    if (isUnique) attrs.push('unique');
    if (isNotNull && !isPk) attrs.push('not null');
    if (defVal) {
      const formattedDef =
        defVal.startsWith("'") || defVal.startsWith('`')
          ? defVal
          : `'${defVal.replace(/'/g, "\\'")}'`;
      attrs.push(`default: ${formattedDef}`);
    }
    if (colNote) {
      attrs.push(`note: '${colNote.replace(/'/g, "\\'")}'`);
    }

    const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
    tablesMap.get(tableName)!.cols.push(`  ${colName} ${dataType}${attrStr}`);

    if (refVal) {
      const cleanRef = refVal.trim();
      if (/^[><-]|^<>/.test(cleanRef)) {
        refs.push(`Ref: ${tableName}.${colName} ${cleanRef}`);
      } else if (cleanRef.includes('.')) {
        refs.push(`Ref: ${tableName}.${colName} > ${cleanRef}`);
      }
    }
  }

  const out: string[] = [];
  for (const [tName, data] of tablesMap.entries()) {
    out.push(`Table ${tName} {`);
    out.push(...data.cols);
    if (data.note) {
      out.push(`  Note: '${data.note.replace(/'/g, "\\'")}'`);
    }
    out.push('}\n');
  }

  if (refs.length > 0) {
    out.push(...refs, '');
  }

  const groupColors = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626'];
  let gIdx = 0;
  for (const [gName, tSet] of groupsMap.entries()) {
    const safeName = /[^a-zA-Z0-9_]/.test(gName) ? `"${gName}"` : gName;
    const color = groupColors[gIdx % groupColors.length];
    gIdx++;
    out.push(`TableGroup ${safeName} [color: ${color}] {`);
    for (const t of tSet) out.push(`  ${t}`);
    out.push('}\n');
  }

  return out.join('\n').trim() + '\n';
}
