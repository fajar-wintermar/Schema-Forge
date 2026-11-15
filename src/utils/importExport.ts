import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  TableDef,
  TablePosition,
} from '../types/schema';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  getTableHeight,
  resolveSchemaEdges,
  TABLE_WIDTH,
} from './autoLayout';

// ---------- CSV Import / Export ----------

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

// ---------- SQL DDL Import / Export ----------

export function exportSchemaToSql(
  schema: ParsedSchema,
  dialect: 'postgres' | 'mysql' = 'postgres'
): string {
  const lines: string[] = [
    `-- Generated by SchemaForge`,
    `-- Project: ${schema.project.name || 'Database Schema'}`,
    `-- Dialect: ${dialect.toUpperCase()}`,
    '',
  ];

  // Enums (PostgreSQL)
  if (dialect === 'postgres') {
    for (const en of schema.enums) {
      const vals = en.values.map((v) => `'${v.name.replace(/'/g, "''")}'`).join(', ');
      lines.push(`CREATE TYPE ${en.id} AS ENUM (${vals});`);
    }
    if (schema.enums.length > 0) lines.push('');
  }

  for (const table of schema.tables) {
    const q = (id: string) => (dialect === 'mysql' ? `\`${id}\`` : `"${id}"`);
    const tableIdentifier = table.schema
      ? `${q(table.schema)}.${q(table.name)}`
      : q(table.name);

    lines.push(`CREATE TABLE ${tableIdentifier} (`);
    const colLines: string[] = [];
    const pkCols = table.columns.filter((c) => c.pk).map((c) => c.name);

    for (const col of table.columns) {
      let sqlType = col.type;
      if (col.increment) {
        sqlType = dialect === 'postgres' ? 'SERIAL' : `${col.type} AUTO_INCREMENT`;
      }
      const parts = [`  ${q(col.name)} ${sqlType}`];
      if (col.notNull || col.pk) parts.push('NOT NULL');
      if (col.unique && !col.pk) parts.push('UNIQUE');
      if (col.defaultValue !== undefined) {
        const def =
          col.defaultValue.startsWith('`') && col.defaultValue.endsWith('`')
            ? col.defaultValue.slice(1, -1)
            : /^\d+(\.\d+)?$|^(true|false|null|now\(\)|current_timestamp)$/i.test(
                col.defaultValue
              )
            ? col.defaultValue
            : `'${col.defaultValue.replace(/'/g, "''")}'`;
        parts.push(`DEFAULT ${def}`);
      }
      colLines.push(parts.join(' '));
    }

    if (pkCols.length > 0) {
      colLines.push(
        `  PRIMARY KEY (${pkCols.map((c) => q(c)).join(', ')})`
      );
    }

    lines.push(colLines.join(',\n'));
    lines.push(');');

    if (table.note && dialect === 'postgres') {
      lines.push(
        `COMMENT ON TABLE ${tableIdentifier} IS '${table.note.replace(/'/g, "''")}';`
      );
    }

    for (const idx of table.indexes) {
      const idxName =
        idx.name || `idx_${table.name}_${idx.columns.join('_')}`;
      const uniq = idx.unique ? 'UNIQUE ' : '';
      lines.push(
        `CREATE ${uniq}INDEX ${q(idxName)} ON ${tableIdentifier} (${idx.columns
          .map((c) => q(c))
          .join(', ')});`
      );
    }

    lines.push('');
  }

  for (const r of schema.refs) {
    const q = (id: string) => (dialect === 'mysql' ? `\`${id}\`` : `"${id}"`);
    const childTable = r.relation === '<' ? r.toTable : r.fromTable;
    const childCols = r.relation === '<' ? r.toColumns : r.fromColumns;
    const parentTable = r.relation === '<' ? r.fromTable : r.toTable;
    const parentCols = r.relation === '<' ? r.fromColumns : r.toColumns;
    const fkName =
      r.name || `fk_${childTable.replace(/\./g, '_')}_${childCols.join('_')}`;
    let stmt = `ALTER TABLE ${q(childTable)} ADD CONSTRAINT ${q(
      fkName
    )} FOREIGN KEY (${childCols.map(q).join(', ')}) REFERENCES ${q(
      parentTable
    )} (${parentCols.map(q).join(', ')})`;
    if (r.onDelete) stmt += ` ON DELETE ${r.onDelete.toUpperCase()}`;
    if (r.onUpdate) stmt += ` ON UPDATE ${r.onUpdate.toUpperCase()}`;
    lines.push(`${stmt};`);
  }

  return lines.join('\n').trim() + '\n';
}

export function importSqlToDbml(sqlText: string): string {
  const cleaned = sqlText
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const out: string[] = [];
  const refs: string[] = [];

  // Parse CREATE TYPE ... AS ENUM
  const enumRegex =
    /CREATE\s+TYPE\s+([^\s(]+)\s+AS\s+ENUM\s*\(([^)]+)\)\s*;/gi;
  let eMatch: RegExpExecArray | null;
  while ((eMatch = enumRegex.exec(cleaned)) !== null) {
    const enumName = eMatch[1].replace(/["`]/g, '');
    const vals = eMatch[2]
      .split(',')
      .map((v) => v.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    out.push(`Enum ${enumName} {`);
    for (const v of vals) out.push(`  ${v}`);
    out.push('}\n');
  }

  // Parse CREATE TABLE
  const tableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(/gi;
  let tMatch: RegExpExecArray | null;
  while ((tMatch = tableRegex.exec(cleaned)) !== null) {
    const rawTableName = tMatch[1].replace(/["`]/g, '');
    let i = tMatch.index + tMatch[0].length;
    let depth = 1;
    let body = '';
    while (i < cleaned.length && depth > 0) {
      const ch = cleaned[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth > 0) body += ch;
      i++;
    }

    // Split top-level commas inside CREATE TABLE
    const items: string[] = [];
    let current = '';
    let pDepth = 0;
    let inQuote = false;
    let qChar = '';
    for (let k = 0; k < body.length; k++) {
      const c = body[k];
      if (inQuote) {
        current += c;
        if (c === qChar && body[k - 1] !== '\\') inQuote = false;
      } else {
        if (c === "'" || c === '"') {
          inQuote = true;
          qChar = c;
          current += c;
        } else if (c === '(') {
          pDepth++;
          current += c;
        } else if (c === ')') {
          pDepth--;
          current += c;
        } else if (c === ',' && pDepth === 0) {
          items.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
    }
    if (current.trim()) items.push(current.trim());

    const pkColumns = new Set<string>();
    const tableCols: Array<{
      name: string;
      type: string;
      attrs: string[];
    }> = [];

    for (const item of items) {
      if (/^(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i.test(item)) {
        const m = item.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (m) {
          m[1]
            .split(',')
            .map((s) => s.trim().replace(/["`]/g, ''))
            .forEach((pk) => pkColumns.add(pk));
        }
        continue;
      }
      if (/^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY/i.test(item)) {
        const fkMatch = item.match(
          /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i
        );
        if (fkMatch) {
          const fromCol = fkMatch[1].trim().replace(/["`]/g, '');
          const toTable = fkMatch[2].trim().replace(/["`]/g, '');
          const toCol = fkMatch[3].trim().replace(/["`]/g, '');
          refs.push(`Ref: ${rawTableName}.${fromCol} > ${toTable}.${toCol}`);
        }
        continue;
      }
      if (/^(?:CONSTRAINT|UNIQUE|INDEX|KEY|CHECK)\b/i.test(item)) {
        continue;
      }

      // Column definition
      const colMatch = item.match(/^["`]?([a-zA-Z0-9_]+)["`]?\s+([^\s]+(?:\([^)]+\))?)(.*)$/i);
      if (!colMatch) continue;
      const colName = colMatch[1];
      let colType = colMatch[2].toLowerCase();
      const rest = colMatch[3] || '';
      const attrs: string[] = [];

      if (/PRIMARY\s+KEY/i.test(rest)) attrs.push('pk');
      if (/SERIAL|BIGSERIAL|AUTO_INCREMENT/i.test(colType + ' ' + rest)) {
        attrs.push('increment');
        if (colType === 'serial') colType = 'integer';
        if (colType === 'bigserial') colType = 'bigint';
      }
      if (/\bUNIQUE\b/i.test(rest)) attrs.push('unique');
      if (/\bNOT\s+NULL\b/i.test(rest) && !attrs.includes('pk')) {
        attrs.push('not null');
      }
      const defMatch = rest.match(/\bDEFAULT\s+('[^']*'|\S+)/i);
      if (defMatch) {
        attrs.push(`default: ${defMatch[1]}`);
      }
      const refInline = rest.match(/\bREFERENCES\s+([^\s(]+)\s*\(([^)]+)\)/i);
      if (refInline) {
        const toTable = refInline[1].replace(/["`]/g, '');
        const toCol = refInline[2].replace(/["`]/g, '');
        refs.push(`Ref: ${rawTableName}.${colName} > ${toTable}.${toCol}`);
      }

      tableCols.push({ name: colName, type: colType, attrs });
    }

    out.push(`Table ${rawTableName} {`);
    for (const c of tableCols) {
      if (pkColumns.has(c.name) && !c.attrs.includes('pk')) {
        c.attrs.unshift('pk');
      }
      const attrStr = c.attrs.length > 0 ? ` [${c.attrs.join(', ')}]` : '';
      out.push(`  ${c.name} ${c.type}${attrStr}`);
    }
    out.push('}\n');
  }

  // Parse ALTER TABLE ... ADD FOREIGN KEY
  const alterRegex =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([^\s(]+)\s*\(([^)]+)\)([^;]*);/gi;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = alterRegex.exec(cleaned)) !== null) {
    const fromTable = aMatch[1].replace(/["`]/g, '');
    const fromCol = aMatch[2].trim().replace(/["`]/g, '');
    const toTable = aMatch[3].replace(/["`]/g, '');
    const toCol = aMatch[4].trim().replace(/["`]/g, '');
    refs.push(`Ref: ${fromTable}.${fromCol} > ${toTable}.${toCol}`);
  }

  if (refs.length > 0) {
    out.push(...refs);
  }

  if (out.length === 0) {
    throw new Error('No valid CREATE TABLE statements found in SQL.');
  }

  return out.join('\n').trim() + '\n';
}

// ---------- Standalone Vector SVG & High-Res PNG Export ----------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getContrastTextColor(hex?: string): string {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return '#ffffff';
  let c = hex.slice(1);
  if (c.length === 3) {
    c = c
      .split('')
      .map((x) => x + x)
      .join('');
  }
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#0f172a' : '#ffffff';
}

export function buildDiagramSvg(params: {
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  stickyNotes: StickyNote[];
  darkMode: boolean;
  title?: string;
}): { svg: string; width: number; height: number } {
  const { schema, positions, detailLevel, stickyNotes, darkMode, title } = params;

  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
  }

  const groupBoxes = computeGroupBoundingBoxes(
    schema,
    positions,
    detailLevel,
    fkColsByTable
  );

  const { instances } = buildTableInstances(schema);
  const resolvedEdges = resolveSchemaEdges(schema, instances, positions);

  // Compute overall bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const inst of instances) {
    const pos = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
    const h = getTableHeight(
      inst.table,
      detailLevel,
      fkColsByTable.get(inst.table.id),
      inst.sharedGroups.length > 1
    );
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
    maxY = Math.max(maxY, pos.y + h);
  }

  for (const gb of groupBoxes) {
    minX = Math.min(minX, gb.x);
    minY = Math.min(minY, gb.y);
    maxX = Math.max(maxX, gb.x + gb.width);
    maxY = Math.max(maxY, gb.y + gb.height);
  }

  for (const note of stickyNotes) {
    minX = Math.min(minX, note.x);
    minY = Math.min(minY, note.y);
    maxX = Math.max(maxX, note.x + note.width);
    maxY = Math.max(maxY, note.y + (note.collapsed ? 44 : 150));
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1000;
    maxY = 700;
  }

  const margin = 64;
  const headerBanner = title ? 56 : 0;
  const offsetX = -minX + margin;
  const offsetY = -minY + margin + headerBanner;
  const width = Math.ceil(maxX - minX + margin * 2);
  const height = Math.ceil(maxY - minY + margin * 2 + headerBanner);

  const bg = darkMode ? '#0b1120' : '#f8fafc';
  const cardBg = darkMode ? '#151e2e' : '#ffffff';
  const cardBorder = darkMode ? '#334155' : '#cbd5e1';
  const rowDivider = darkMode ? '#1e293b' : '#f1f5f9';
  const textPrimary = darkMode ? '#f1f5f9' : '#0f172a';
  const textSecondary = darkMode ? '#94a3b8' : '#64748b';
  const edgeStroke = darkMode ? '#64748b' : '#94a3b8';

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<defs>
    <style>
      .sans { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
    <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="${darkMode ? '#1e293b' : '#cbd5e1'}" />
    </pattern>
  </defs>`);

  parts.push(`<rect width="${width}" height="${height}" fill="${bg}" />`);
  parts.push(`<rect width="${width}" height="${height}" fill="url(#dotgrid)" />`);

  if (title) {
    parts.push(
      `<text x="${margin}" y="${42}" class="sans" font-size="18" font-weight="700" fill="${textPrimary}">${escapeXml(
        title
      )}</text>`
    );
    parts.push(
      `<text x="${width - margin}" y="${42}" text-anchor="end" class="sans" font-size="12" fill="${textSecondary}">${schema.tables.length} tables · ${schema.tableGroups.length} domains · ${schema.refs.length} relationships</text>`
    );
  }

  parts.push(`<g transform="translate(${offsetX}, ${offsetY})">`);

  // 1. TableGroup containers
  for (const gb of groupBoxes) {
    const gColor = gb.color || '#2563eb';
    parts.push(
      `<rect x="${gb.x}" y="${gb.y}" width="${gb.width}" height="${gb.height}" rx="12" fill="${gColor}" fill-opacity="${
        darkMode ? '0.09' : '0.06'
      }" stroke="${gColor}" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="6 4" />`
    );
    parts.push(
      `<rect x="${gb.x + 14}" y="${gb.y + 12}" width="10" height="10" rx="3" fill="${gColor}" />`
    );
    parts.push(
      `<text x="${gb.x + 32}" y="${gb.y + 22}" class="sans" font-size="13" font-weight="700" fill="${textPrimary}">${escapeXml(
        gb.name
      )}</text>`
    );
    if (gb.note) {
      parts.push(
        `<text x="${gb.x + 32}" y="${gb.y + 39}" class="sans" font-size="11" fill="${textSecondary}">${escapeXml(
          gb.note.slice(0, 80)
        )}</text>`
      );
    }
  }

  // 2. Relationship edges
  const getAnchorY = (table: TableDef, posKey: string, colName: string) => {
    const pos = positions[posKey] || positions[table.id] || { x: 0, y: 0 };
    if (detailLevel === 'names') return pos.y + 20;
    const fkSet = fkColsByTable.get(table.id);
    const cols =
      detailLevel === 'keys'
        ? table.columns.filter(
            (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
          )
        : table.columns;
    const rowH = detailLevel === 'full' ? 30 : 26;
    const idx = cols.findIndex((c) => c.name === colName);
    if (idx === -1) return pos.y + 20;
    return pos.y + 40 + idx * rowH + rowH / 2;
  };

  for (const edge of resolvedEdges) {
    const { ref: r, fromInst, toInst } = edge;
    const pA = positions[fromInst.posKey] || positions[fromInst.table.id] || { x: 0, y: 0 };
    const pB = positions[toInst.posKey] || positions[toInst.table.id] || { x: 0, y: 0 };
    const y1 = getAnchorY(fromInst.table, fromInst.posKey, r.fromColumns[0]);
    const y2 = getAnchorY(toInst.table, toInst.posKey, r.toColumns[0]);

    const aCenter = pA.x + TABLE_WIDTH / 2;
    const bCenter = pB.x + TABLE_WIDTH / 2;
    let x1 = pA.x + TABLE_WIDTH;
    let x2 = pB.x;
    let dir1 = 1;
    let dir2 = -1;

    if (fromInst.posKey === toInst.posKey) {
      x1 = pA.x + TABLE_WIDTH;
      x2 = pA.x + TABLE_WIDTH;
      dir1 = 1;
      dir2 = 1;
    } else if (aCenter > bCenter + 40) {
      x1 = pA.x;
      x2 = pB.x + TABLE_WIDTH;
      dir1 = -1;
      dir2 = 1;
    } else if (Math.abs(aCenter - bCenter) <= 40) {
      x1 = pA.x + TABLE_WIDTH;
      x2 = pB.x + TABLE_WIDTH;
      dir1 = 1;
      dir2 = 1;
    }

    const dx =
      fromInst.posKey === toInst.posKey
        ? 70
        : Math.max(54, Math.abs(x2 - x1) * 0.45);
    const cx1 = x1 + dir1 * dx;
    const cx2 = x2 + dir2 * dx;

    parts.push(
      `<path d="M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}" fill="none" stroke="${edgeStroke}" stroke-width="1.6" />`
    );
    parts.push(`<circle cx="${x1}" cy="${y1}" r="3.5" fill="${edgeStroke}" />`);
    parts.push(`<circle cx="${x2}" cy="${y2}" r="3.5" fill="#2563eb" />`);
  }

  // 3. Table cards
  for (const inst of instances) {
    const table = inst.table;
    const pos = positions[inst.posKey] || positions[table.id] || { x: 0, y: 0 };
    const isShared = inst.sharedGroups.length > 1;
    const h = getTableHeight(table, detailLevel, fkColsByTable.get(table.id), isShared);
    const headerBg = table.headerColor || (darkMode ? '#1e293b' : '#0f172a');
    const headerText = getContrastTextColor(headerBg);
    const fkSet = fkColsByTable.get(table.id);

    parts.push(
      `<rect x="${pos.x}" y="${pos.y}" width="${TABLE_WIDTH}" height="${h}" rx="8" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.2" />`
    );
    parts.push(
      `<path d="M ${pos.x} ${pos.y + 8} Q ${pos.x} ${pos.y} ${pos.x + 8} ${pos.y} L ${
        pos.x + TABLE_WIDTH - 8
      } ${pos.y} Q ${pos.x + TABLE_WIDTH} ${pos.y} ${pos.x + TABLE_WIDTH} ${
        pos.y + 8
      } L ${pos.x + TABLE_WIDTH} ${pos.y + 40} L ${pos.x} ${pos.y + 40} Z" fill="${headerBg}" />`
    );
    parts.push(
      `<text x="${pos.x + 12}" y="${pos.y + 25}" class="sans" font-size="13" font-weight="600" fill="${headerText}">${escapeXml(
        table.id
      )}</text>`
    );

    if (detailLevel !== 'names') {
      const cols =
        detailLevel === 'keys'
          ? table.columns.filter(
              (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
            )
          : table.columns;
      const rowH = detailLevel === 'full' ? 30 : 26;
      cols.forEach((col, i) => {
        const ry = pos.y + 40 + i * rowH;
        if (i > 0) {
          parts.push(
            `<line x1="${pos.x}" y1="${ry}" x2="${pos.x + TABLE_WIDTH}" y2="${ry}" stroke="${rowDivider}" stroke-width="1" />`
          );
        }
        const isFk = fkSet?.has(col.name);
        const keyTag = col.pk ? 'PK' : isFk ? 'FK' : col.unique ? 'UQ' : '';
        if (keyTag) {
          parts.push(
            `<text x="${pos.x + 12}" y="${ry + rowH / 2 + 4}" class="mono" font-size="10" font-weight="600" fill="${
              col.pk ? '#d97706' : '#2563eb'
            }">${keyTag}</text>`
          );
        }
        const nameX = keyTag ? pos.x + 36 : pos.x + 12;
        parts.push(
          `<text x="${nameX}" y="${ry + rowH / 2 + 4}" class="sans" font-size="12" font-weight="${
            col.pk ? '600' : '400'
          }" fill="${textPrimary}">${escapeXml(col.name)}</text>`
        );
        parts.push(
          `<text x="${pos.x + TABLE_WIDTH - 12}" y="${ry + rowH / 2 + 4}" text-anchor="end" class="mono" font-size="11" fill="${textSecondary}">${escapeXml(
            col.type
          )}</text>`
        );
      });
    }

    if (isShared) {
      parts.push(
        `<text x="${pos.x + 12}" y="${pos.y + h - 8}" class="sans" font-size="10" fill="#2563eb">Shared across ${inst.sharedGroups.length} domains</text>`
      );
    }
  }

  // 4. Sticky Notes
  const notePalette: Record<string, { bg: string; border: string; text: string }> = {
    amber: { bg: '#fef3c7', border: '#f59e0b', text: '#78350f' },
    sky: { bg: '#e0f2fe', border: '#0284c7', text: '#0c4a6e' },
    emerald: { bg: '#d1fae5', border: '#059669', text: '#064e3b' },
    rose: { bg: '#ffe4e6', border: '#e11d48', text: '#881337' },
    slate: { bg: '#f1f5f9', border: '#64748b', text: '#0f172a' },
  };

  for (const note of stickyNotes) {
    const pal = notePalette[note.color] || notePalette.amber;
    const nh = note.collapsed ? 42 : 140;
    parts.push(
      `<rect x="${note.x}" y="${note.y}" width="${note.width}" height="${nh}" rx="8" fill="${pal.bg}" stroke="${pal.border}" stroke-width="1.2" />`
    );
    parts.push(
      `<text x="${note.x + 12}" y="${note.y + 24}" class="sans" font-size="12" font-weight="700" fill="${pal.text}">${escapeXml(
        note.title || 'Note'
      )}</text>`
    );
    if (!note.collapsed && note.content) {
      const wrapped = note.content.slice(0, 180).split('\n').slice(0, 4);
      wrapped.forEach((line, idx) => {
        parts.push(
          `<text x="${note.x + 12}" y="${note.y + 46 + idx * 17}" class="sans" font-size="11" fill="${pal.text}">${escapeXml(
            line.slice(0, 38)
          )}</text>`
        );
      });
    }
  }

  parts.push('</g></svg>');
  return { svg: parts.join('\n'), width, height };
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8'
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDiagramAsPng(params: {
  filename: string;
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  stickyNotes: StickyNote[];
  darkMode: boolean;
  title?: string;
  scale?: number;
}): Promise<void> {
  const scale = params.scale || 2;
  const { svg, width, height } = buildDiagramSvg(params);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not acquire 2D canvas context.'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG serialization failed.'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = params.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG image for PNG export.'));
    };
    img.src = url;
  });
}
