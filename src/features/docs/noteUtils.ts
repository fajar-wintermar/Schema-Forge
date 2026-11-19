import { ParsedSchema, StickyNote, TableDef } from '../../types/schema';
import {
  isRichMarkdownNote,
  stripMarkdownToPlainText,
} from '../markdown/markdownUtils';
import type { DocsNoteEntry } from './types';

export function trimNotePreview(
  content: string,
  maxChars = 200
): { preview: string; isTrimmed: boolean; words: number; lines: number } {
  const plain = stripMarkdownToPlainText(content);
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const lines = content.split('\n').length;
  const needsTrim = isRichMarkdownNote(content) || plain.length > maxChars;

  if (plain.length <= maxChars) {
    return { preview: plain, isTrimmed: needsTrim, words, lines };
  }

  let cut = plain.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxChars * 0.65)) {
    cut = cut.slice(0, lastSpace);
  }
  return {
    preview: `${cut.trimEnd()}…`,
    isTrimmed: true,
    words,
    lines,
  };
}

export function matchesTableQuery(
  table: TableDef,
  queryStr: string,
  domainsByTable: Map<string, string[]>
): boolean {
  if (!queryStr) return true;
  if (table.id.toLowerCase().includes(queryStr)) return true;
  if (table.note?.toLowerCase().includes(queryStr)) return true;
  const domains = domainsByTable.get(table.id) || [];
  if (domains.some((d) => d.toLowerCase().includes(queryStr))) return true;
  return table.columns.some(
    (c) =>
      c.name.toLowerCase().includes(queryStr) ||
      c.type.toLowerCase().includes(queryStr) ||
      c.note?.toLowerCase().includes(queryStr)
  );
}

export function buildAllNoteEntries(
  schema: ParsedSchema,
  domainsByTable: Map<string, string[]>,
  stickyNotes: StickyNote[]
): DocsNoteEntry[] {
  const entries: DocsNoteEntry[] = [];

  if (schema.project.note?.trim()) {
    entries.push({
      id: 'note_project',
      category: 'project',
      categoryLabel: 'Project README',
      title: schema.project.name || 'Project Note',
      subtitle: schema.project.databaseType || 'Database Project',
      content: schema.project.note,
      target: { kind: 'overview' },
    });
  }

  for (const g of schema.tableGroups) {
    if (!g.note?.trim()) continue;
    entries.push({
      id: `note_group_${g.name}`,
      category: 'group',
      categoryLabel: 'TableGroup',
      title: g.name,
      subtitle: `${g.tables.length} ${g.tables.length === 1 ? 'table' : 'tables'}`,
      content: g.note,
      accentColor: g.color || '#2563EB',
      line: g.line,
      target: { kind: 'group', groupName: g.name },
    });
  }

  for (const n of schema.notes) {
    if (!n.content?.trim()) continue;
    entries.push({
      id: `note_standalone_${n.id}`,
      category: 'standalone',
      categoryLabel: 'Project Note',
      title: n.name,
      content: n.content,
      line: n.line,
      target: { kind: 'note', noteId: n.id },
    });
  }

  for (const t of schema.tables) {
    const doms = domainsByTable.get(t.id) || [];
    if (t.note?.trim()) {
      entries.push({
        id: `note_table_${t.id}`,
        category: 'table',
        categoryLabel: 'Table',
        title: t.id,
        subtitle: doms.length > 0 ? doms.join(', ') : undefined,
        content: t.note,
        accentColor: t.headerColor,
        line: t.line,
        target: { kind: 'table', tableId: t.id },
      });
    }
    for (const c of t.columns) {
      if (!c.note?.trim()) continue;
      entries.push({
        id: `note_col_${t.id}_${c.name}`,
        category: 'column',
        categoryLabel: 'Column',
        title: `${t.id}.${c.name}`,
        subtitle: c.type,
        content: c.note,
        accentColor: t.headerColor,
        line: c.line,
        target: { kind: 'table', tableId: t.id },
      });
    }
  }

  for (const en of schema.enums) {
    for (const v of en.values) {
      if (!v.note?.trim()) continue;
      entries.push({
        id: `note_enum_${en.id}_${v.name}`,
        category: 'enum',
        categoryLabel: 'Enum Value',
        title: `${en.id}.${v.name}`,
        content: v.note,
        target: { kind: 'enums' },
      });
    }
  }

  for (const sn of stickyNotes) {
    if (!sn.content?.trim() && !sn.title?.trim()) continue;
    let target: DocsNoteEntry['target'];
    let subtitle = sn.author || 'Canvas sticky note';
    if (sn.linkedTarget?.startsWith('table:')) {
      const tableId = sn.linkedTarget.slice(6);
      target = { kind: 'table', tableId };
      subtitle = `Linked to table ${tableId}`;
    } else if (sn.linkedTarget?.startsWith('group:')) {
      const groupName = sn.linkedTarget.slice(6);
      target = { kind: 'group', groupName };
      subtitle = `Linked to domain ${groupName}`;
    }
    entries.push({
      id: `note_sticky_${sn.id}`,
      category: 'sticky',
      categoryLabel: 'Sticky Note',
      title: sn.title || 'Sticky Note',
      subtitle,
      content: sn.content || sn.title,
      target,
    });
  }

  return entries;
}
