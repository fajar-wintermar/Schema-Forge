import { ParsedSchema, RefRelation } from '@shared/domain/schemaTypes';
import { filterSchemaByDomains } from './dbmlIo';

function sanitizeMermaidId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  return /^[a-zA-Z_]/.test(cleaned) ? cleaned : `t_${cleaned}`;
}

function sanitizeMermaidType(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_()-]/g, '');
  return cleaned || 'text';
}

function sanitizeMermaidComment(raw?: string): string {
  if (!raw) return '';
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (!singleLine) return '';
  return ` "${singleLine.slice(0, 90).replace(/"/g, "'")}"`;
}

function mapRelationToMermaid(relation: RefRelation): string {
  switch (relation) {
    case '>':
      return '}o--||';
    case '<':
      return '||--o{';
    case '-':
      return '||--||';
    case '<>':
      return '}o--o{';
  }
}

export function exportSchemaToMermaid(
  schema: ParsedSchema,
  options: { title?: string } = {}
): string {
  const lines: string[] = [];
  if (options.title?.trim()) {
    lines.push('---');
    lines.push(`title: ${options.title.trim().replace(/\n/g, ' ')}`);
    lines.push('---');
  }
  lines.push('erDiagram');

  const fkLookup = new Set<string>();
  for (const ref of schema.refs) {
    for (const c of ref.fromColumns) fkLookup.add(`${ref.fromTable}.${c}`);
  }

  for (const table of schema.tables) {
    const id = sanitizeMermaidId(table.id);
    lines.push(`  ${id} {`);
    for (const col of table.columns) {
      const keys: string[] = [];
      if (col.pk) keys.push('PK');
      if (fkLookup.has(`${table.id}.${col.name}`)) keys.push('FK');
      if (col.unique && !col.pk) keys.push('UK');
      const keyPart = keys.length > 0 ? ` ${keys.join(',')}` : '';
      const comment = sanitizeMermaidComment(col.note);
      lines.push(
        `    ${sanitizeMermaidType(col.type)} ${sanitizeMermaidId(
          col.name
        )}${keyPart}${comment}`
      );
    }
    lines.push('  }');
  }

  for (const ref of schema.refs) {
    const left = sanitizeMermaidId(ref.fromTable);
    const right = sanitizeMermaidId(ref.toTable);
    const arrow = mapRelationToMermaid(ref.relation);
    const label = (
      ref.name ||
      `${ref.fromColumns.join(', ')} -> ${ref.toColumns.join(', ')}`
    )
      .replace(/"/g, "'")
      .trim();
    lines.push(`  ${left} ${arrow} ${right} : "${label}"`);
  }

  return lines.join('\n') + '\n';
}

export function exportGroupSummaryMarkdown(
  schema: ParsedSchema,
  groupName: string
): string {
  const group = schema.tableGroups.find((g) => g.name === groupName);
  const scoped = filterSchemaByDomains(schema, [groupName]);
  const lines: string[] = [];

  lines.push(`# ${groupName}`);
  lines.push('');
  if (group?.note) {
    lines.push(group.note.trim());
    lines.push('');
  }
  lines.push(
    `**Tables (${scoped.tables.length}):** ${scoped.tables
      .map((t) => `\`${t.id}\``)
      .join(', ') || 'None'}`
  );
  lines.push('');

  for (const t of scoped.tables) {
    lines.push(`## \`${t.id}\``);
    if (t.note) {
      lines.push('');
      lines.push(t.note.trim());
    }
    lines.push('');
    lines.push('| Column | Type | Key | Notes |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of t.columns) {
      const keys = [
        c.pk ? 'PK' : '',
        c.unique ? 'UQ' : '',
        c.notNull ? 'NN' : '',
      ]
        .filter(Boolean)
        .join(', ');
      const note = (c.note || '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
      lines.push(
        `| \`${c.name}\` | \`${c.type}\` | ${keys || '—'} | ${note} |`
      );
    }
    lines.push('');
  }

  if (scoped.tables.length > 0) {
    lines.push('## ER Diagram (Mermaid)');
    lines.push('');
    lines.push('```mermaid');
    lines.push(exportSchemaToMermaid(scoped).trimEnd());
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}
