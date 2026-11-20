import { ParsedSchema, SchemaModuleFile, StickyNote } from '../../types/schema';
import { MERGED_SCHEMA_VIEW_ID } from '../../utils/schemaModules';
import { buildAllNoteEntries } from '../docs/noteUtils';
import type { DocsNoteEntry, DocsSection } from '../docs/types';
import { stripMarkdownToPlainText } from '../markdown/markdownUtils';

export type CommandItemKind =
  | 'table'
  | 'column'
  | 'group'
  | 'partial'
  | 'note'
  | 'file'
  | 'action';

export type CommandFilterTab = 'all' | CommandItemKind;

export type CommandTargetView = 'auto' | 'editor' | 'diagram' | 'docs';

export type CommandActionId =
  | 'view-split'
  | 'view-diagram'
  | 'view-docs'
  | 'auto-layout'
  | 'toggle-theme'
  | 'import-export'
  | 'save-version'
  | 'github'
  | 'shortcuts';

export interface CommandItem {
  id: string;
  kind: CommandItemKind;
  title: string;
  subtitle?: string;
  badge?: string;
  accentColor?: string;
  domains: string[];
  tableId?: string;
  columnName?: string;
  columnType?: string;
  isPk?: boolean;
  groupName?: string;
  partialName?: string;
  noteEntry?: DocsNoteEntry;
  docsSection?: DocsSection;
  filePath?: string;
  line?: number;
  actionId?: CommandActionId;
  searchTokens: string;
}

export interface ScoredCommandItem {
  item: CommandItem;
  score: number;
  titleMatches: number[];
}

export interface FuzzyMatchResult {
  score: number;
  indices: number[];
}

const SEPARATOR_CHARS = new Set(['_', '.', '-', '/', ' ', ':']);

/**
 * Fast, deterministic subsequence fuzzy scorer with word-boundary and prefix bonuses.
 */
export function fuzzyScore(
  query: string,
  text: string
): FuzzyMatchResult | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  if (!text) return null;

  const lower = text.toLowerCase();
  if (lower === q) {
    return {
      score: 300 + q.length * 10,
      indices: Array.from({ length: text.length }, (_, i) => i),
    };
  }

  // Prefer contiguous substring matches when present
  const subIdx = lower.indexOf(q);
  if (subIdx !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => subIdx + i);
    const atStart = subIdx === 0;
    const atBoundary =
      atStart || SEPARATOR_CHARS.has(lower[subIdx - 1]) || isCamelBoundary(text, subIdx);
    const bonus = (atStart ? 120 : atBoundary ? 70 : 30) + q.length * 14 - subIdx * 0.5;
    return { score: bonus, indices };
  }

  // Compact subsequence match (strip spaces from query for cross-token typing like "usr eml")
  const compactQ = q.replace(/\s+/g, '');
  if (!compactQ) return null;

  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let prevMatch = -2;

  for (let ti = 0; ti < lower.length && qi < compactQ.length; ti++) {
    if (lower[ti] === compactQ[qi]) {
      indices.push(ti);
      let charScore = 10;
      if (ti === 0) charScore += 28;
      else if (SEPARATOR_CHARS.has(lower[ti - 1]) || isCamelBoundary(text, ti)) {
        charScore += 20;
      }
      if (ti === prevMatch + 1) {
        charScore += 14;
      } else if (prevMatch >= 0) {
        charScore -= Math.min(8, ti - prevMatch - 1);
      }
      score += charScore;
      prevMatch = ti;
      qi++;
    }
  }

  if (qi < compactQ.length) return null;
  // Shorter titles win ties
  score -= text.length * 0.15;
  return { score, indices };
}

function isCamelBoundary(text: string, idx: number): boolean {
  if (idx <= 0) return false;
  const prev = text[idx - 1];
  const curr = text[idx];
  return prev >= 'a' && prev <= 'z' && curr >= 'A' && curr <= 'Z';
}

export function buildCommandItems(params: {
  schema: ParsedSchema;
  stickyNotes: StickyNote[];
  schemaFiles?: SchemaModuleFile[];
  schemaFolder?: string;
}): CommandItem[] {
  const { schema, stickyNotes, schemaFiles, schemaFolder = 'schema' } = params;
  const items: CommandItem[] = [];

  const domainsByTable = new Map<string, string[]>();
  for (const g of schema.tableGroups) {
    for (const t of new Set(g.tables)) {
      if (!domainsByTable.has(t)) domainsByTable.set(t, []);
      domainsByTable.get(t)!.push(g.name);
    }
  }

  // 1. Domains (TableGroups)
  for (const g of schema.tableGroups) {
    items.push({
      id: `group:${g.name}`,
      kind: 'group',
      title: g.name,
      subtitle: `${g.tables.length} ${g.tables.length === 1 ? 'table' : 'tables'}${
        g.note ? ` · ${stripMarkdownToPlainText(g.note).slice(0, 70)}` : ''
      }`,
      badge: 'Domain',
      accentColor: g.color || '#2563EB',
      domains: [g.name],
      groupName: g.name,
      docsSection: { kind: 'group', groupName: g.name },
      line: g.line,
      searchTokens: `${g.tables.join(' ')} ${g.note || ''}`,
    });
  }

  // 2. Tables
  for (const t of schema.tables) {
    const domains = domainsByTable.get(t.id) || [];
    const domainStr = domains.length > 0 ? domains.join(' · ') : 'Ungrouped';
    items.push({
      id: `table:${t.id}`,
      kind: 'table',
      title: t.id,
      subtitle: `${domainStr} · ${t.columns.length} cols${
        t.alias ? ` · as ${t.alias}` : ''
      }`,
      badge: 'Table',
      accentColor: t.headerColor,
      domains,
      tableId: t.id,
      docsSection: { kind: 'table', tableId: t.id },
      line: t.line,
      searchTokens: `${t.alias || ''} ${domains.join(' ')} ${t.note || ''}`,
    });
  }

  // 3. Columns
  for (const t of schema.tables) {
    const domains = domainsByTable.get(t.id) || [];
    for (const c of t.columns) {
      items.push({
        id: `col:${t.id}.${c.name}`,
        kind: 'column',
        title: `${t.id}.${c.name}`,
        subtitle: `${domains.length > 0 ? domains.join(' · ') : 'Ungrouped'}${
          c.note ? ` · ${stripMarkdownToPlainText(c.note).slice(0, 65)}` : ''
        }`,
        badge: c.type,
        domains,
        tableId: t.id,
        columnName: c.name,
        columnType: c.type,
        isPk: c.pk,
        docsSection: { kind: 'table', tableId: t.id },
        line: c.line || t.line,
        searchTokens: `${c.name} ${c.type} ${t.id} ${c.note || ''} ${c.check || ''}`,
      });
    }
  }

  // 4. TablePartials
  for (const p of schema.tablePartials) {
    items.push({
      id: `partial:${p.name}`,
      kind: 'partial',
      title: `~${p.name}`,
      subtitle: `${p.columns.length} cols · ${p.indexes.length} indexes · ${p.checks.length} checks`,
      badge: 'Partial',
      domains: [],
      partialName: p.name,
      docsSection: { kind: 'partials' },
      line: p.line,
      searchTokens: `${p.name} ${p.columns.map((c) => c.name).join(' ')} ${p.note || ''}`,
    });
  }

  // 5. Markdown & Canvas Notes (Project README, Standalone Note blocks, Table/Group/Column notes, Sticky Notes)
  const allNotes = buildAllNoteEntries(schema, domainsByTable, stickyNotes);
  for (const entry of allNotes) {
    const plain = stripMarkdownToPlainText(entry.content);
    let docsSection: DocsSection = { kind: 'notes' };
    if (entry.target?.kind === 'overview') docsSection = { kind: 'overview' };
    else if (entry.target?.kind === 'group')
      docsSection = { kind: 'group', groupName: entry.target.groupName };
    else if (entry.target?.kind === 'note')
      docsSection = { kind: 'note', noteId: entry.target.noteId };
    else if (entry.target?.kind === 'table')
      docsSection = { kind: 'table', tableId: entry.target.tableId };
    else if (entry.target?.kind === 'enums')
      docsSection = { kind: 'enums' };

    items.push({
      id: `note:${entry.id}`,
      kind: 'note',
      title: entry.title,
      subtitle: `${entry.categoryLabel}${entry.subtitle ? ` · ${entry.subtitle}` : ''}${
        plain ? ` — ${plain.slice(0, 75)}` : ''
      }`,
      badge: entry.category === 'sticky' ? 'Sticky' : 'Note',
      accentColor: entry.accentColor,
      domains:
        entry.target?.kind === 'group' ? [entry.target.groupName] : [],
      tableId:
        entry.target?.kind === 'table' ? entry.target.tableId : undefined,
      groupName:
        entry.target?.kind === 'group' ? entry.target.groupName : undefined,
      noteEntry: entry,
      docsSection,
      line: entry.line,
      searchTokens: `${entry.categoryLabel} ${entry.subtitle || ''} ${plain.slice(0, 300)}`,
    });
  }

  // 6. Modular .dbml files
  if (schemaFiles && schemaFiles.length > 0) {
    const sortedFiles = [...schemaFiles].sort((a, b) =>
      a.path.localeCompare(b.path)
    );
    for (const f of sortedFiles) {
      const linesCount = f.content.split('\n').length;
      items.push({
        id: `file:${f.path}`,
        kind: 'file',
        title: f.path,
        subtitle: `${linesCount} lines · DBML module`,
        badge: 'Module',
        domains: [],
        filePath: f.path,
        line: 1,
        searchTokens: `${f.path} dbml module ${schemaFolder}`,
      });
    }
    items.push({
      id: `file:${MERGED_SCHEMA_VIEW_ID}`,
      kind: 'file',
      title: 'schema.dbml (merged preview)',
      subtitle: `Read-only bundle of ${sortedFiles.length} modules in ${schemaFolder}/`,
      badge: 'Generated',
      domains: [],
      filePath: MERGED_SCHEMA_VIEW_ID,
      line: 1,
      searchTokens: `merged schema.dbml generated bundle`,
    });
  }

  // 7. Quick workspace actions
  const actions: Array<{
    id: CommandActionId;
    title: string;
    subtitle: string;
    tokens: string;
  }> = [
    {
      id: 'view-split',
      title: 'Switch to Split View',
      subtitle: 'Editor + Interactive ERD Diagram side-by-side',
      tokens: 'view mode code editor diagram split',
    },
    {
      id: 'view-diagram',
      title: 'Switch to Diagram View',
      subtitle: 'Full-width ERD Canvas',
      tokens: 'view mode erd canvas diagram',
    },
    {
      id: 'view-docs',
      title: 'Switch to Docs View',
      subtitle: 'Engineering documentation portal & Markdown notes',
      tokens: 'view mode documentation portal markdown readme',
    },
    {
      id: 'auto-layout',
      title: 'Auto-Layout Diagram',
      subtitle: 'Re-arrange domains and tables to minimize edge crossings',
      tokens: 'arrange organize layout diagram canvas',
    },
    {
      id: 'toggle-theme',
      title: 'Toggle Light / Dark Theme',
      subtitle: 'Switch application & CodeMirror theme',
      tokens: 'dark light mode appearance theme',
    },
    {
      id: 'import-export',
      title: 'Open Import / Export Studio',
      subtitle: 'SQL DDL, JSON, SVG/PNG diagram export',
      tokens: 'export postgres mysql ddl svg png json import',
    },
    {
      id: 'save-version',
      title: 'Save Version Snapshot',
      subtitle: 'Commit a schema snapshot to version history',
      tokens: 'snapshot history commit diff version',
    },
    {
      id: 'github',
      title: 'Open GitHub Sync',
      subtitle: 'Pull or push DBML files to GitHub repository',
      tokens: 'git github pull push sync repo',
    },
    {
      id: 'shortcuts',
      title: 'View Keyboard Shortcuts',
      subtitle: 'Show all global and editor shortcuts',
      tokens: 'keys help hotkeys shortcuts',
    },
  ];

  for (const act of actions) {
    items.push({
      id: `action:${act.id}`,
      kind: 'action',
      title: act.title,
      subtitle: act.subtitle,
      badge: 'Action',
      domains: [],
      actionId: act.id,
      searchTokens: act.tokens,
    });
  }

  return items;
}

export function searchCommandItems(
  items: CommandItem[],
  query: string,
  filterTab: CommandFilterTab,
  limit = 40
): ScoredCommandItem[] {
  const filtered =
    filterTab === 'all' ? items : items.filter((it) => it.kind === filterTab);

  const trimmed = query.trim();
  if (!trimmed) {
    // Curated ordering when opened without typing
    const priority: Record<CommandItemKind, number> = {
      table: 0,
      group: 1,
      file: 2,
      note: 3,
      partial: 4,
      action: 5,
      column: 6,
    };
    const sorted = [...filtered].sort((a, b) => {
      const pa = priority[a.kind];
      const pb = priority[b.kind];
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });
    return sorted.slice(0, limit).map((item) => ({
      item,
      score: 0,
      titleMatches: [],
    }));
  }

  const scored: ScoredCommandItem[] = [];
  for (const item of filtered) {
    const titleHit = fuzzyScore(trimmed, item.title);
    const subHit = item.subtitle ? fuzzyScore(trimmed, item.subtitle) : null;
    const tokenHit = item.searchTokens
      ? fuzzyScore(trimmed, item.searchTokens)
      : null;

    if (!titleHit && !subHit && !tokenHit) continue;

    // Slight boost for tables/domains/files over deep column/token-only matches
    const kindBoost =
      item.kind === 'table'
        ? 18
        : item.kind === 'group' || item.kind === 'file'
        ? 14
        : item.kind === 'partial' || item.kind === 'note'
        ? 8
        : item.kind === 'action'
        ? 6
        : 0;

    const bestScore = Math.max(
      titleHit ? titleHit.score * 2 + kindBoost : -Infinity,
      subHit ? subHit.score * 1.05 + kindBoost * 0.5 : -Infinity,
      tokenHit ? tokenHit.score * 0.6 : -Infinity
    );

    scored.push({
      item,
      score: bestScore,
      titleMatches: titleHit ? titleHit.indices : [],
    });
  }

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.01) return b.score - a.score;
    return a.item.title.localeCompare(b.item.title);
  });

  return scored.slice(0, limit);
}
