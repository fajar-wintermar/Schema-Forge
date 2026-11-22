import {
  CheckDef,
  ColumnDef,
  EnumDef,
  IndexDef,
  ParsedSchema,
  RefDef,
  TableDef,
  TableGroupDef,
  TablePartialDef,
  UNGROUPED_DOMAIN_ID,
} from '../../types/schema';

export function filterSchemaByDomains(
  schema: ParsedSchema,
  selectedDomains: string[]
): ParsedSchema {
  if (!selectedDomains || selectedDomains.length === 0) {
    return schema;
  }

  const selectedSet = new Set(selectedDomains);
  const includeUngrouped = selectedSet.has(UNGROUPED_DOMAIN_ID);

  const allGroupedTableIds = new Set<string>();
  for (const g of schema.tableGroups) {
    for (const tId of g.tables) {
      allGroupedTableIds.add(tId);
    }
  }

  const filteredGroups = schema.tableGroups.filter((g) =>
    selectedSet.has(g.name)
  );

  const selectedTableIds = new Set<string>();
  for (const g of filteredGroups) {
    for (const tId of g.tables) {
      selectedTableIds.add(tId);
    }
  }
  if (includeUngrouped) {
    for (const t of schema.tables) {
      if (!allGroupedTableIds.has(t.id)) {
        selectedTableIds.add(t.id);
      }
    }
  }

  const filteredTables = schema.tables.filter((t) =>
    selectedTableIds.has(t.id)
  );
  const filteredRefs = schema.refs.filter(
    (r) => selectedTableIds.has(r.fromTable) && selectedTableIds.has(r.toTable)
  );

  // Collect referenced TablePartials (including transitive partial-to-partial references)
  const partialByName = new Map<string, TablePartialDef>();
  for (const p of schema.tablePartials) {
    partialByName.set(p.name, p);
    partialByName.set(p.id, p);
  }
  const usedPartialNames = new Set<string>();
  const partialQueue: string[] = [];
  for (const t of filteredTables) {
    for (const pName of t.appliedPartials || []) {
      if (!usedPartialNames.has(pName)) {
        usedPartialNames.add(pName);
        partialQueue.push(pName);
      }
    }
  }
  while (partialQueue.length > 0) {
    const cur = partialQueue.shift()!;
    const pDef = partialByName.get(cur);
    if (!pDef) continue;
    for (const sub of pDef.appliedPartials || []) {
      if (!usedPartialNames.has(sub)) {
        usedPartialNames.add(sub);
        partialQueue.push(sub);
      }
    }
  }
  const filteredPartials = schema.tablePartials.filter(
    (p) => usedPartialNames.has(p.name) || usedPartialNames.has(p.id)
  );

  // Collect referenced Enums across visible tables & partials
  const referencedTypeNames = new Set<string>();
  const recordColTypes = (cols: ColumnDef[]) => {
    for (const c of cols) {
      const clean = c.type.replace(/\[\]$/, '').trim().toLowerCase();
      if (clean) referencedTypeNames.add(clean);
    }
  };
  for (const t of filteredTables) recordColTypes(t.columns);
  for (const p of filteredPartials) recordColTypes(p.columns);

  const filteredEnums = schema.enums.filter(
    (e) =>
      referencedTypeNames.has(e.id.toLowerCase()) ||
      referencedTypeNames.has(e.name.toLowerCase())
  );

  return {
    project: schema.project,
    tables: filteredTables,
    tablePartials: filteredPartials,
    refs: filteredRefs,
    enums: filteredEnums,
    tableGroups: filteredGroups,
    notes: [],
    errors: [],
  };
}

function formatSegment(seg: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(seg)) return seg;
  return `"${seg.replace(/"/g, '\\"')}"`;
}

function formatQualifiedId(id: string): string {
  const dotIdx = id.indexOf('.');
  if (dotIdx > 0 && !id.includes(' ')) {
    const left = id.slice(0, dotIdx);
    const right = id.slice(dotIdx + 1);
    return `${formatSegment(left)}.${formatSegment(right)}`;
  }
  return formatSegment(id);
}

function formatDbmlString(value: string): string {
  if (value.includes('\n')) {
    const escaped = value.replace(/'''/g, "\\'''");
    return `'''\n${escaped}\n  '''`;
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function formatNoteBlock(note: string, indent = '  '): string {
  if (note.includes('\n')) {
    const escaped = note.replace(/'''/g, "\\'''");
    const indented = escaped
      .split('\n')
      .map((l) => (l ? `${indent}  ${l}` : ''))
      .join('\n');
    return `${indent}Note: '''\n${indented}\n${indent}'''`;
  }
  return `${indent}Note: ${formatDbmlString(note)}`;
}

function formatColumnLine(col: ColumnDef): string {
  const settings: string[] = [];
  if (col.pk) settings.push('pk');
  if (col.unique) settings.push('unique');
  if (col.notNull && !col.pk) settings.push('not null');
  if (col.increment) settings.push('increment');
  if (col.defaultValue !== undefined) {
    const trimmed = col.defaultValue.trim();
    if (
      (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
      /^-?\d+(\.\d+)?$/.test(trimmed) ||
      /^(true|false|null)$/i.test(trimmed)
    ) {
      settings.push(`default: ${trimmed}`);
    } else {
      settings.push(`default: ${formatDbmlString(trimmed)}`);
    }
  }
  if (col.check) {
    const expr = col.check.trim();
    const formattedExpr =
      expr.startsWith('`') && expr.endsWith('`') ? expr : `\`${expr}\``;
    settings.push(`check: ${formattedExpr}`);
  }
  if (col.note) {
    settings.push(`note: ${formatDbmlString(col.note)}`);
  }

  const settingSuffix = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
  return `  ${formatSegment(col.name)} ${col.type}${settingSuffix}`;
}

function formatIndexLine(idx: IndexDef): string {
  const items =
    idx.items && idx.items.length > 0
      ? idx.items.map((it) =>
          it.isExpression ? `\`${it.value}\`` : formatSegment(it.value)
        )
      : idx.columns.map((c) =>
          c.startsWith('`') && c.endsWith('`') ? c : formatSegment(c)
        );
  const target =
    items.length > 1 ? `(${items.join(', ')})` : items[0] || 'id';

  const settings: string[] = [];
  if (idx.pk) settings.push('pk');
  if (idx.unique) settings.push('unique');
  if (idx.name) settings.push(`name: ${formatDbmlString(idx.name)}`);
  if (idx.type) settings.push(`type: ${idx.type}`);
  if (idx.note) settings.push(`note: ${formatDbmlString(idx.note)}`);

  const settingSuffix = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
  return `    ${target}${settingSuffix}`;
}

function formatCheckLine(chk: CheckDef): string {
  const expr = chk.expression.trim();
  const formattedExpr =
    expr.startsWith('`') && expr.endsWith('`') ? expr : `\`${expr}\``;
  const settings: string[] = [];
  if (chk.name) settings.push(`name: ${formatDbmlString(chk.name)}`);
  if (chk.note) settings.push(`note: ${formatDbmlString(chk.note)}`);
  const settingSuffix = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
  return `    ${formattedExpr}${settingSuffix}`;
}

function formatTableOrPartialBlock(
  kind: 'Table' | 'TablePartial',
  def: TableDef | TablePartialDef
): string {
  const headerOpts: string[] = [];
  if (def.headerColor) headerOpts.push(`headercolor: ${def.headerColor}`);
  const headerOptStr =
    headerOpts.length > 0 ? ` [${headerOpts.join(', ')}]` : '';
  const aliasStr =
    kind === 'Table' && (def as TableDef).alias
      ? ` as ${formatSegment((def as TableDef).alias!)}`
      : '';
  const headerName =
    kind === 'Table' ? formatQualifiedId(def.id) : formatSegment(def.name);

  const lines: string[] = [`${kind} ${headerName}${aliasStr}${headerOptStr} {`];

  const ownCols = def.columns.filter((c) => !c.fromPartial);
  for (const col of ownCols) {
    lines.push(formatColumnLine(col));
  }

  for (const pName of def.appliedPartials || []) {
    lines.push(`  ~${formatSegment(pName)}`);
  }

  if (def.indexes.length > 0) {
    lines.push('');
    lines.push('  Indexes {');
    for (const idx of def.indexes) {
      lines.push(formatIndexLine(idx));
    }
    lines.push('  }');
  }

  if (def.checks.length > 0) {
    lines.push('');
    lines.push('  Checks {');
    for (const chk of def.checks) {
      lines.push(formatCheckLine(chk));
    }
    lines.push('  }');
  }

  if (def.note) {
    lines.push('');
    lines.push(formatNoteBlock(def.note, '  '));
  }

  lines.push('}');
  return lines.join('\n');
}

function formatEnumBlock(en: EnumDef): string {
  const lines: string[] = [`Enum ${formatQualifiedId(en.id)} {`];
  for (const val of en.values) {
    const noteSuffix = val.note
      ? ` [note: ${formatDbmlString(val.note)}]`
      : '';
    lines.push(`  ${formatSegment(val.name)}${noteSuffix}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function formatTableGroupBlock(group: TableGroupDef): string {
  const opts: string[] = [];
  if (group.color) opts.push(`color: ${group.color}`);
  const optStr = opts.length > 0 ? ` [${opts.join(', ')}]` : '';
  const lines: string[] = [`TableGroup ${formatSegment(group.name)}${optStr} {`];
  if (group.note) {
    lines.push(formatNoteBlock(group.note, '  '));
  }
  for (const tId of group.tables) {
    lines.push(`  ${formatQualifiedId(tId)}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function formatRefEndpoint(table: string, cols: string[]): string {
  const tStr = formatQualifiedId(table);
  if (cols.length > 1) {
    return `${tStr}.(${cols.map(formatSegment).join(', ')})`;
  }
  return `${tStr}.${formatSegment(cols[0] || 'id')}`;
}

function formatRefBlock(r: RefDef): string {
  const namePart = r.name ? ` ${formatSegment(r.name)}` : '';
  const left = formatRefEndpoint(r.fromTable, r.fromColumns);
  const right = formatRefEndpoint(r.toTable, r.toColumns);
  const opts: string[] = [];
  if (r.onDelete) opts.push(`delete: ${r.onDelete}`);
  if (r.onUpdate) opts.push(`update: ${r.onUpdate}`);
  if (r.color) opts.push(`color: ${r.color}`);
  const optStr = opts.length > 0 ? ` [${opts.join(', ')}]` : '';
  return `Ref${namePart}: ${left} ${r.relation} ${right}${optStr}`;
}

export function exportSchemaToDbml(schema: ParsedSchema): string {
  const sections: string[] = [];

  if (schema.project.name || schema.project.databaseType || schema.project.note) {
    const pName = schema.project.name || 'Database';
    const pLines = [`Project ${formatSegment(pName)} {`];
    if (schema.project.databaseType) {
      pLines.push(
        `  database_type: ${formatDbmlString(schema.project.databaseType)}`
      );
    }
    if (schema.project.note) {
      pLines.push(formatNoteBlock(schema.project.note, '  '));
    }
    pLines.push('}');
    sections.push(pLines.join('\n'));
  }

  for (const en of schema.enums) {
    sections.push(formatEnumBlock(en));
  }

  for (const p of schema.tablePartials) {
    sections.push(formatTableOrPartialBlock('TablePartial', p));
  }

  for (const t of schema.tables) {
    sections.push(formatTableOrPartialBlock('Table', t));
  }

  for (const g of schema.tableGroups) {
    sections.push(formatTableGroupBlock(g));
  }

  if (schema.refs.length > 0) {
    sections.push(schema.refs.map(formatRefBlock).join('\n'));
  }

  for (const n of schema.notes) {
    sections.push(
      `Note ${formatSegment(n.name)} {\n  '''\n${n.content}\n  '''\n}`
    );
  }

  return sections.join('\n\n') + (sections.length > 0 ? '\n' : '');
}
