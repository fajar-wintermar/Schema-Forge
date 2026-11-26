import {
  ParsedSchema,
  RefRelation,
  StickyNote,
} from '@shared/domain/schemaTypes';
import {
  extractMarkdownHeadings,
  isRichMarkdownNote,
} from '../../features/markdown/markdownUtils';
import { computeDocsCoverage } from '../docsCoverage';
import { extractMetadataTags, MetadataTagTone } from '../metadataTags';
import { escapeHtml, renderSafeMarkdownToHtml } from './docsMarkdownHtml';

export interface DiagramSlice {
  id: string;
  label: string;
  color?: string;
  svg: string;
}

export interface DocsExportOptions {
  title?: string;
  stickyNotes?: StickyNote[];
  svgDiagram?: string;
  domainDiagrams?: DiagramSlice[];
  darkMode?: boolean;
}

const CARDINALITY_LABELS: Record<RefRelation, string> = {
  '>': 'Many-to-One (N:1)',
  '<': 'One-to-Many (1:N)',
  '-': 'One-to-One (1:1)',
  '<>': 'Many-to-Many (N:M)',
};

function escapeMdCell(raw?: string): string {
  if (!raw) return '—';
  const cleaned = raw.replace(/\r\n?/g, '\n').trim();
  if (!cleaned) return '—';
  return cleaned.replace(/\|/g, '\\|').replace(/\n+/g, '<br/>');
}

function slugAnchor(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

export function exportSchemaToMarkdown(
  schema: ParsedSchema,
  options: DocsExportOptions = {}
): string {
  const title =
    options.title?.trim() ||
    schema.project.name ||
    'Database Schema Documentation';
  const lines: string[] = [];

  const fkLookup = new Map<string, string>();
  for (const r of schema.refs) {
    r.fromColumns.forEach((col, i) => {
      const targetCol = r.toColumns[i] || r.toColumns[0] || 'id';
      fkLookup.set(`${r.fromTable}.${col}`, `${r.toTable}.${targetCol}`);
    });
  }

  const domainsByTable = new Map<string, string[]>();
  for (const g of schema.tableGroups) {
    for (const tId of new Set(g.tables)) {
      if (!domainsByTable.has(tId)) domainsByTable.set(tId, []);
      domainsByTable.get(tId)!.push(g.name);
    }
  }

  const totalFields = schema.tables.reduce((sum, t) => sum + t.columns.length, 0);

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `**Engine:** ${schema.project.databaseType || 'Relational SQL'} · **Tables:** ${schema.tables.length} · **Fields:** ${totalFields} · **Domains:** ${schema.tableGroups.length} · **Relationships:** ${schema.refs.length} · **Enums:** ${schema.enums.length}`
  );
  lines.push('');

  if (schema.project.note) {
    lines.push(schema.project.note.trim());
    lines.push('');
  }

  lines.push('## Table of Contents');
  lines.push('');
  if (schema.tableGroups.length > 0) {
    lines.push('- [Business Domains (TableGroups)](#business-domains)');
  }
  lines.push('- [Tables](#tables)');
  if (schema.refs.length > 0) lines.push('- [Relationships](#relationships)');
  if (schema.enums.length > 0) lines.push('- [Enums](#enums)');
  if (schema.tablePartials.length > 0) {
    lines.push('- [Table Partials](#table-partials)');
  }
  if (schema.notes.length > 0) {
    lines.push('- [Documentation Notes](#documentation-notes)');
  }
  lines.push('');

  if (schema.tableGroups.length > 0) {
    lines.push('<a id="business-domains"></a>');
    lines.push('## Business Domains (TableGroups)');
    lines.push('');
    for (const g of schema.tableGroups) {
      lines.push(`### ${g.name} (${g.tables.length} tables)`);
      if (g.color) {
        lines.push(`- **Color:** \`${g.color}\``);
      }
      if (g.note) {
        lines.push('');
        lines.push(g.note.trim());
      }
      if (g.tables.length > 0) {
        lines.push('');
        lines.push(
          `**Tables:** ${g.tables
            .map((t) => `[\`${t}\`](#table-${slugAnchor(t)})`)
            .join(', ')}`
        );
      }
      lines.push('');
    }
  }

  lines.push('<a id="tables"></a>');
  lines.push('## Tables');
  lines.push('');

  const sortedTables = [...schema.tables].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  for (const t of sortedTables) {
    const domains = domainsByTable.get(t.id) || [];
    lines.push(`<a id="table-${slugAnchor(t.id)}"></a>`);
    lines.push(`### \`${t.id}\`${t.alias ? ` (as \`${t.alias}\`)` : ''}`);
    const metaBadges: string[] = [];
    if (domains.length > 0) metaBadges.push(`**Domains:** ${domains.join(', ')}`);
    if (t.appliedPartials && t.appliedPartials.length > 0) {
      metaBadges.push(
        `**Partials:** ${t.appliedPartials.map((p) => `\`~${p}\``).join(', ')}`
      );
    }
    metaBadges.push(`**Columns:** ${t.columns.length}`);
    lines.push(metaBadges.join(' · '));
    lines.push('');

    if (t.note) {
      lines.push(t.note.trim());
      lines.push('');
    }

    lines.push('| Column | Type | Constraints | Default | Reference | Description |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const c of t.columns) {
      const fk = fkLookup.get(`${t.id}.${c.name}`);
      const constraints: string[] = [];
      if (c.pk) constraints.push('PK');
      if (fk) constraints.push('FK');
      if (c.unique) constraints.push('UNIQUE');
      if (c.notNull && !c.pk) constraints.push('NOT NULL');
      if (c.increment) constraints.push('INCREMENT');
      if (c.check) constraints.push(`CHECK (${c.check})`);
      const cName = c.fromPartial ? `${c.name} (~${c.fromPartial})` : c.name;
      lines.push(
        `| \`${escapeMdCell(cName)}\` | \`${escapeMdCell(c.type)}\` | ${
          constraints.length > 0 ? constraints.join(', ') : 'nullable'
        } | ${c.defaultValue ? `\`${escapeMdCell(c.defaultValue)}\`` : '—'} | ${
          fk ? `\`${fk}\`` : '—'
        } | ${escapeMdCell(c.note)} |`
      );
    }
    lines.push('');

    if (t.indexes.length > 0) {
      lines.push('**Indexes:**');
      for (const idx of t.indexes) {
        const flags = [
          idx.name ? `name: \`${idx.name}\`` : null,
          idx.type ? `type: \`${idx.type}\`` : null,
          idx.pk ? 'PK' : null,
          idx.unique ? 'UNIQUE' : null,
          idx.note ? idx.note : null,
        ]
          .filter(Boolean)
          .join(' · ');
        lines.push(
          `- \`(${idx.columns.join(', ')})\`${flags ? ` — ${flags}` : ''}`
        );
      }
      lines.push('');
    }

    if (t.checks.length > 0) {
      lines.push('**Check Constraints:**');
      for (const chk of t.checks) {
        lines.push(
          `- \`CHECK (${chk.expression})\`${chk.name ? ` (${chk.name})` : ''}${
            chk.note ? ` — ${chk.note}` : ''
          }`
        );
      }
      lines.push('');
    }
  }

  if (schema.refs.length > 0) {
    lines.push('<a id="relationships"></a>');
    lines.push('## Relationships');
    lines.push('');
    lines.push('| From | Cardinality | To | Details |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of schema.refs) {
      const details = [
        r.name,
        r.onDelete ? `on delete ${r.onDelete}` : null,
        r.onUpdate ? `on update ${r.onUpdate}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      lines.push(
        `| \`${r.fromTable}.${r.fromColumns.join(', ')}\` | ${
          CARDINALITY_LABELS[r.relation]
        } | \`${r.toTable}.${r.toColumns.join(', ')}\` | ${
          details ? escapeMdCell(details) : '—'
        } |`
      );
    }
    lines.push('');
  }

  if (schema.enums.length > 0) {
    lines.push('<a id="enums"></a>');
    lines.push('## Enums');
    lines.push('');
    for (const en of schema.enums) {
      lines.push(`### \`${en.id}\``);
      lines.push('');
      lines.push('| Value | Note |');
      lines.push('| --- | --- |');
      for (const v of en.values) {
        lines.push(`| \`${escapeMdCell(v.name)}\` | ${escapeMdCell(v.note)} |`);
      }
      lines.push('');
    }
  }

  if (schema.tablePartials.length > 0) {
    lines.push('<a id="table-partials"></a>');
    lines.push('## Table Partials');
    lines.push('');
    for (const p of schema.tablePartials) {
      lines.push(`### \`~${p.name}\``);
      if (p.note) {
        lines.push('');
        lines.push(p.note.trim());
      }
      lines.push('');
      lines.push(
        `- Columns: ${p.columns.map((c) => `\`${c.name}: ${c.type}\``).join(', ')}`
      );
      lines.push('');
    }
  }

  if (schema.notes.length > 0) {
    lines.push('<a id="documentation-notes"></a>');
    lines.push('## Documentation Notes');
    lines.push('');
    for (const n of schema.notes) {
      lines.push(`### ${n.name}`);
      lines.push('');
      lines.push(n.content.trim());
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export { escapeHtml } from './docsMarkdownHtml';

const CARDINALITY_HTML_META: Record<
  RefRelation,
  { symbol: string; title: string; ratio: string; cls: string; desc: string }
> = {
  '>': {
    symbol: '&gt;',
    title: 'Many-to-One',
    ratio: 'N : 1',
    cls: 'rel-many-to-one',
    desc: 'Many rows in source reference one row in target',
  },
  '<': {
    symbol: '&lt;',
    title: 'One-to-Many',
    ratio: '1 : N',
    cls: 'rel-one-to-many',
    desc: 'One row in source referenced by many rows in target',
  },
  '-': {
    symbol: '-',
    title: 'One-to-One',
    ratio: '1 : 1',
    cls: 'rel-one-to-one',
    desc: 'Single row maps uniquely to a single row',
  },
  '<>': {
    symbol: '&lt;&gt;',
    title: 'Many-to-Many',
    ratio: 'N : M',
    cls: 'rel-many-to-many',
    desc: 'Multiple rows on both sides are associated',
  },
};

function sanitizeColorHex(raw?: string, fallback = '#2563eb'): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  return fallback;
}

function renderReadmeCardHtml(params: {
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  idPrefix: string;
}): string {
  const { title, subtitle, content, accentColor, idPrefix } = params;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  const headings = extractMarkdownHeadings(content);
  const dotHtml = accentColor
    ? `<span class="dot" style="background:${sanitizeColorHex(accentColor)}"></span>`
    : '<span class="readme-icon" aria-hidden="true">Doc</span>';

  const tocHtml =
    headings.length >= 2
      ? `<div class="readme-toc"><span class="readme-toc-label">Contents</span>${headings
          .map((h) => {
            const targetId = `${idPrefix}-${h.id}`;
            return `<a class="readme-toc-link lvl-${h.level}" href="#${escapeHtml(
              targetId
            )}">${escapeHtml(h.text)}</a>`;
          })
          .join('')}</div>`
      : '';

  return `<article class="readme-card">
    <div class="readme-head">
      <div class="readme-title-wrap">
        ${dotHtml}
        <strong>${escapeHtml(title)}</strong>
        ${
          subtitle
            ? `<span class="muted">·</span><span class="mono muted">${escapeHtml(
                subtitle
              )}</span>`
            : ''
        }
      </div>
      <span class="muted tabular-nums readme-meta">${words} words · ~${mins} min read</span>
    </div>
    ${tocHtml}
    <div class="readme-body prose">${renderSafeMarkdownToHtml(
      content,
      idPrefix
    )}</div>
  </article>`;
}

export function exportSchemaToHtml(
  schema: ParsedSchema,
  options: DocsExportOptions = {}
): string {
  const title =
    options.title?.trim() ||
    schema.project.name ||
    'Database Schema Documentation';
  const darkInitial = Boolean(options.darkMode);

  const fkLookup = new Map<string, string>();
  for (const r of schema.refs) {
    r.fromColumns.forEach((col, i) => {
      const targetCol = r.toColumns[i] || r.toColumns[0] || 'id';
      fkLookup.set(`${r.fromTable}.${col}`, `${r.toTable}.${targetCol}`);
    });
  }

  const domainsByTable = new Map<string, string[]>();
  for (const g of schema.tableGroups) {
    for (const tId of new Set(g.tables)) {
      if (!domainsByTable.has(tId)) domainsByTable.set(tId, []);
      domainsByTable.get(tId)!.push(g.name);
    }
  }

  const enumUsageMap = new Map<string, Array<{ tableId: string; columnName: string }>>();
  for (const en of schema.enums) {
    enumUsageMap.set(en.id.toLowerCase(), []);
    enumUsageMap.set(en.name.toLowerCase(), []);
  }
  for (const t of schema.tables) {
    for (const c of t.columns) {
      const cleanType = c.type.replace(/\[\]$/, '').trim().toLowerCase();
      const hit = enumUsageMap.get(cleanType);
      if (hit) hit.push({ tableId: t.id, columnName: c.name });
    }
  }

  const totalFields = schema.tables.reduce((sum, t) => sum + t.columns.length, 0);
  const sortedTables = [...schema.tables].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const coverage = computeDocsCoverage(schema);

  const tagBadgeCls = (tone: MetadataTagTone): string => `meta-tag tag-${tone}`;

  const tableSlugMapJson = JSON.stringify(
    Object.fromEntries(schema.tables.map((t) => [t.id, slugAnchor(t.id)]))
  ).replace(/</g, '\\u003c');
  const groupSlugMapJson = JSON.stringify(
    Object.fromEntries(schema.tableGroups.map((g) => [g.name, slugAnchor(g.name)]))
  ).replace(/</g, '\\u003c');

  const navGroupsHtml = schema.tableGroups
    .map(
      (g) =>
        `<a class="nav-link" href="#group-${escapeHtml(
          slugAnchor(g.name)
        )}"><span class="dot" style="background:${sanitizeColorHex(
          g.color
        )}"></span><span class="nav-truncate">${escapeHtml(
          g.name
        )}</span><span class="count tabular-nums">${g.tables.length}t</span></a>`
    )
    .join('');

  const navTablesHtml = sortedTables
    .map(
      (t) =>
        `<a class="nav-link mono" data-nav-table="${escapeHtml(
          t.id.toLowerCase()
        )}" href="#table-${escapeHtml(slugAnchor(t.id))}"><span class="dot" style="background:${sanitizeColorHex(
          t.headerColor,
          '#0f172a'
        )}"></span><span class="nav-truncate">${escapeHtml(t.id)}</span></a>`
    )
    .join('');

  const projectReadmeHtml =
    schema.project.note && isRichMarkdownNote(schema.project.note)
      ? `<section class="section">${renderReadmeCardHtml({
          title: 'README',
          subtitle: schema.project.name || 'Project Documentation',
          content: schema.project.note,
          idPrefix: 'proj-readme',
        })}</section>`
      : '';

  const groupsSectionHtml =
    schema.tableGroups.length > 0
      ? `<section id="domains" class="section">
          <h2>Business Domains (TableGroups)</h2>
          <div class="grid">
            ${schema.tableGroups
              .map(
                (g, gIdx) => `<article id="group-${escapeHtml(
                  slugAnchor(g.name)
                )}" class="card group-card">
                  <div class="card-head">
                    <span class="title-with-dot">
                      <span class="dot" style="background:${sanitizeColorHex(
                        g.color
                      )}"></span>
                      <strong>${escapeHtml(g.name)}</strong>
                    </span>
                    <span class="badge tabular-nums">${g.tables.length} tables</span>
                  </div>
                  ${
                    g.note
                      ? `<div class="prose">${renderSafeMarkdownToHtml(
                          g.note,
                          `grp-${gIdx}`
                        )}</div>`
                      : `<p class="muted italic">No TableGroup note defined.</p>`
                  }
                  <div class="chip-row">
                    ${g.tables
                      .map(
                        (tId) =>
                          `<a class="chip mono" href="#table-${escapeHtml(
                            slugAnchor(tId)
                          )}">${escapeHtml(tId)}</a>`
                      )
                      .join('')}
                  </div>
                </article>`
              )
              .join('')}
          </div>
        </section>`
      : '';

  const tablesSectionHtml = `<section id="tables" class="section">
    <h2>Tables (${sortedTables.length})</h2>
    <div class="stack">
      ${sortedTables
        .map((t, tIdx) => {
          const domains = domainsByTable.get(t.id) || [];
          const tableTags = extractMetadataTags(t.note);
          const allColumnTags = t.columns.flatMap((c) => extractMetadataTags(c.note));
          const searchHaystack = [
            t.id,
            t.note || '',
            ...domains,
            ...tableTags.map((tg) => tg.label),
            ...allColumnTags.map((tg) => tg.label),
            ...t.columns.map((c) => `${c.name} ${c.type} ${c.note || ''}`),
          ]
            .join(' ')
            .toLowerCase();

          const richNoteHtml =
            t.note && isRichMarkdownNote(t.note)
              ? `<div class="table-rich-note">${renderReadmeCardHtml({
                  title: 'Table Documentation',
                  subtitle: t.id,
                  content: t.note,
                  accentColor: t.headerColor,
                  idPrefix: `tbl-${tIdx}`,
                })}</div>`
              : '';

          const shortNoteHtml =
            t.note && !isRichMarkdownNote(t.note)
              ? `<div class="table-note prose">${renderSafeMarkdownToHtml(
                  t.note,
                  `tbl-${tIdx}`
                )}</div>`
              : '';

          const partialsStripHtml =
            t.appliedPartials && t.appliedPartials.length > 0
              ? `<div class="partials-strip"><span class="muted">Mixed-in Partials:</span> ${t.appliedPartials
                  .map(
                    (p) =>
                      `<a href="#partials" class="partial-pill mono">~${escapeHtml(
                        p
                      )}</a>`
                  )
                  .join(' ')}</div>`
              : '';

          return `<article id="table-${escapeHtml(
            slugAnchor(t.id)
          )}" class="card table-card" data-table-search="${escapeHtml(
            searchHaystack
          )}">
            <div class="card-head table-head">
              <div class="title-with-dot">
                <span class="dot dot-lg" style="background:${sanitizeColorHex(
                  t.headerColor,
                  '#0f172a'
                )}"></span>
                <h3 class="mono">${escapeHtml(t.id)}</h3>
                ${
                  t.alias
                    ? `<span class="muted mono">as ${escapeHtml(t.alias)}</span>`
                    : ''
                }
              </div>
              <div class="meta-badges">
                ${tableTags
                  .map(
                    (tg) =>
                      `<span class="${tagBadgeCls(tg.tone)}">${escapeHtml(
                        tg.label
                      )}</span>`
                  )
                  .join('')}
                ${domains
                  .map((d) => `<span class="badge">${escapeHtml(d)}</span>`)
                  .join('')}
                <span class="badge tabular-nums">${t.columns.length} columns · ${
            t.indexes.length
          } indexes${t.checks.length > 0 ? ` · ${t.checks.length} checks` : ''}</span>
              </div>
            </div>
            ${partialsStripHtml}
            ${richNoteHtml}
            ${shortNoteHtml}
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Constraints</th>
                    <th>Default</th>
                    <th>Description &amp; Reference</th>
                  </tr>
                </thead>
                <tbody>
                  ${t.columns
                    .map((c, cIdx) => {
                      const fk = fkLookup.get(`${t.id}.${c.name}`);
                      const badges: string[] = [];
                      if (c.pk) badges.push('<span class="tag pk">PK</span>');
                      if (fk) badges.push('<span class="tag fk">FK</span>');
                      if (c.unique) {
                        badges.push('<span class="tag uq">UQ</span>');
                      }
                      if (c.notNull && !c.pk) {
                        badges.push('<span class="tag">NOT NULL</span>');
                      }
                      if (c.increment) {
                        badges.push('<span class="tag">INCREMENT</span>');
                      }
                      if (c.check) {
                        badges.push('<span class="tag chk">CHECK</span>');
                      }
                      const colTags = extractMetadataTags(c.note);
                      return `<tr>
                        <td class="mono strong nowrap">${
                          c.pk ? '<span class="pk-dot" title="Primary Key">◆</span> ' : ''
                        }${escapeHtml(c.name)}${
                        c.fromPartial
                          ? ` <span class="partial-tag">~${escapeHtml(
                              c.fromPartial
                            )}</span>`
                          : ''
                      }</td>
                        <td class="mono nowrap">${escapeHtml(c.type)}</td>
                        <td class="nowrap">${
                          badges.length > 0
                            ? badges.join(' ')
                            : '<span class="muted">nullable</span>'
                        }</td>
                        <td class="mono muted">${
                          c.defaultValue ? escapeHtml(c.defaultValue) : '—'
                        }</td>
                        <td>
                          ${
                            colTags.length > 0
                              ? `<div class="col-tag-row">${colTags
                                  .map(
                                    (tg) =>
                                      `<span class="${tagBadgeCls(
                                        tg.tone
                                      )}">${escapeHtml(tg.label)}</span>`
                                  )
                                  .join('')}</div>`
                              : ''
                          }
                          ${
                            fk
                              ? `<a class="mono ref-link" href="#table-${escapeHtml(
                                  slugAnchor(fk.split('.')[0])
                                )}">→ ${escapeHtml(fk)}</a>`
                              : ''
                          }
                          ${
                            c.check
                              ? `<div class="mono check-line">CHECK (${escapeHtml(
                                  c.check
                                )})</div>`
                              : ''
                          }
                          ${
                            c.note
                              ? `<div class="prose inline-note">${renderSafeMarkdownToHtml(
                                  c.note,
                                  `col-${tIdx}-${cIdx}`
                                )}</div>`
                              : !fk && !c.check
                              ? '<span class="muted">—</span>'
                              : ''
                          }
                        </td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
            ${
              t.indexes.length > 0
                ? `<div class="sub-block">
                    <div class="sub-block-title">Indexes (${t.indexes.length})</div>
                    <div class="sub-block-list">
                      ${t.indexes
                        .map((idx) => {
                          const items =
                            idx.items ||
                            idx.columns.map((c) => ({
                              value: c,
                              isExpression: c.startsWith('`') && c.endsWith('`'),
                            }));
                          const colsHtml = items
                            .map((it) =>
                              it.isExpression
                                ? `<span class="expr-tok">\`${escapeHtml(
                                    it.value.replace(/^`|`$/g, '')
                                  )}\`</span>`
                                : escapeHtml(it.value)
                            )
                            .join(', ');
                          return `<div class="idx-row mono">
                            <span>(${colsHtml})</span>
                            ${
                              idx.name
                                ? `<span class="muted">· ${escapeHtml(idx.name)}</span>`
                                : ''
                            }
                            ${
                              idx.type
                                ? `<span class="tok-sky">· ${escapeHtml(idx.type)}</span>`
                                : ''
                            }
                            ${idx.pk ? '<span class="tok-amber">· pk</span>' : ''}
                            ${
                              idx.unique
                                ? '<span class="tok-emerald">· unique</span>'
                                : ''
                            }
                            ${
                              idx.note
                                ? `<span class="sans muted">— ${escapeHtml(
                                    idx.note
                                  )}</span>`
                                : ''
                            }
                          </div>`;
                        })
                        .join('')}
                    </div>
                  </div>`
                : ''
            }
            ${
              t.checks.length > 0
                ? `<div class="sub-block">
                    <div class="sub-block-title">Check Constraints (${t.checks.length})</div>
                    <div class="sub-block-list">
                      ${t.checks
                        .map(
                          (chk) => `<div class="idx-row">
                            <code class="check-pill mono">CHECK (${escapeHtml(
                              chk.expression
                            )})</code>
                            ${
                              chk.name
                                ? `<span class="mono muted">· ${escapeHtml(
                                    chk.name
                                  )}</span>`
                                : ''
                            }
                            ${
                              chk.note
                                ? `<span class="muted">— ${escapeHtml(
                                    chk.note
                                  )}</span>`
                                : ''
                            }
                          </div>`
                        )
                        .join('')}
                    </div>
                  </div>`
                : ''
            }
          </article>`;
        })
        .join('')}
    </div>
  </section>`;

  const refsSectionHtml =
    schema.refs.length > 0
      ? `<section id="relationships" class="section">
          <h2>Relationships (${schema.refs.length})</h2>
          <div class="card legend-card">
            <div class="legend-grid">
              ${(['>', '<', '-', '<>'] as const satisfies readonly RefRelation[])
                .map((rel) => {
                  const m = CARDINALITY_HTML_META[rel];
                  return `<div class="legend-item">
                    <span class="card-badge ${m.cls}"><span class="mono strong">${m.symbol}</span> <span>${m.title}</span> <span class="mono opacity-80">(${m.ratio})</span></span>
                    <div class="muted legend-desc">${m.desc}</div>
                  </div>`;
                })
                .join('')}
            </div>
          </div>
          <div class="card table-card">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Cardinality</th>
                    <th>To</th>
                    <th>Rules</th>
                  </tr>
                </thead>
                <tbody>
                  ${schema.refs
                    .map((r) => {
                      const m = CARDINALITY_HTML_META[r.relation];
                      return `<tr>
                        <td class="mono"><a href="#table-${escapeHtml(
                          slugAnchor(r.fromTable)
                        )}">${escapeHtml(r.fromTable)}.${escapeHtml(
                        r.fromColumns.join(', ')
                      )}</a></td>
                        <td><span class="card-badge ${m.cls}" title="${m.desc}"><span class="mono strong">${m.symbol}</span> <span>${m.title}</span> <span class="mono opacity-80">(${m.ratio})</span></span></td>
                        <td class="mono"><a href="#table-${escapeHtml(
                          slugAnchor(r.toTable)
                        )}">${escapeHtml(r.toTable)}.${escapeHtml(
                        r.toColumns.join(', ')
                      )}</a></td>
                        <td class="mono muted">${escapeHtml(
                          [
                            r.name,
                            r.onDelete ? `on delete ${r.onDelete}` : null,
                            r.onUpdate ? `on update ${r.onUpdate}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'
                        )}</td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>`
      : '';

  const enumsSectionHtml =
    schema.enums.length > 0
      ? `<section id="enums" class="section">
          <h2>Enums (${schema.enums.length})</h2>
          <div class="grid">
            ${schema.enums
              .map((en) => {
                const usages =
                  enumUsageMap.get(en.id.toLowerCase()) ||
                  enumUsageMap.get(en.name.toLowerCase()) ||
                  [];
                return `<article class="card">
                  <div class="card-head"><strong class="mono">${escapeHtml(
                    en.id
                  )}</strong><span class="badge tabular-nums">${
                  en.values.length
                } values</span></div>
                  <div class="table-wrap">
                    <table>
                      <tbody>
                        ${en.values
                          .map(
                            (v) =>
                              `<tr><td class="mono strong">${escapeHtml(
                                v.name
                              )}</td><td class="muted">${
                                v.note ? escapeHtml(v.note) : '—'
                              }</td></tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                  ${
                    usages.length > 0
                      ? `<div class="chip-row">${usages
                          .map(
                            (u) =>
                              `<a class="chip mono" href="#table-${escapeHtml(
                                slugAnchor(u.tableId)
                              )}">${escapeHtml(u.tableId)}.${escapeHtml(
                                u.columnName
                              )}</a>`
                          )
                          .join('')}</div>`
                      : ''
                  }
                </article>`;
              })
              .join('')}
          </div>
        </section>`
      : '';

  const partialsSectionHtml =
    schema.tablePartials.length > 0
      ? `<section id="partials" class="section">
          <h2>Table Partials (${schema.tablePartials.length})</h2>
          <div class="grid">
            ${schema.tablePartials
              .map(
                (p, pIdx) => `<article class="card">
                  <div class="card-head">
                    <strong class="mono partial-title">~${escapeHtml(p.name)}</strong>
                    <span class="badge tabular-nums">${p.columns.length} cols</span>
                  </div>
                  ${
                    p.note
                      ? `<div class="prose">${renderSafeMarkdownToHtml(
                          p.note,
                          `part-${pIdx}`
                        )}</div>`
                      : ''
                  }
                  <div class="chip-row">
                    ${p.columns
                      .map(
                        (c) =>
                          `<span class="chip mono">${escapeHtml(
                            c.name
                          )}: ${escapeHtml(c.type)}</span>`
                      )
                      .join('')}
                  </div>
                </article>`
              )
              .join('')}
          </div>
        </section>`
      : '';

  const notesSectionHtml =
    schema.notes.length > 0
      ? `<section id="notes" class="section">
          <h2>Documentation Notes</h2>
          <div class="stack">
            ${schema.notes
              .map((n, nIdx) =>
                isRichMarkdownNote(n.content)
                  ? renderReadmeCardHtml({
                      title: n.name,
                      subtitle: 'Standalone Note',
                      content: n.content,
                      idPrefix: `note-${nIdx}`,
                    })
                  : `<article class="card">
                      <div class="card-head"><strong>${escapeHtml(
                        n.name
                      )}</strong><span class="badge">Note</span></div>
                      <div class="prose">${renderSafeMarkdownToHtml(
                        n.content,
                        `note-${nIdx}`
                      )}</div>
                    </article>`
              )
              .join('')}
          </div>
        </section>`
      : '';

  const domainSlices = options.domainDiagrams || [];
  const primaryDiagramSvg =
    options.svgDiagram || (domainSlices.length > 0 ? domainSlices[0].svg : undefined);
  const allDiagramSlices: DiagramSlice[] = primaryDiagramSvg
    ? [
        ...(options.svgDiagram
          ? [{ id: '__all__', label: 'All Domains', svg: options.svgDiagram }]
          : []),
        ...domainSlices,
      ]
    : [];

  const diagramSectionHtml = primaryDiagramSvg
    ? `<section id="diagram" class="section">
        <div class="diagram-section-head">
          <h2>ER Diagram</h2>
          <div class="diagram-toolbar" aria-label="Diagram zoom controls">
            <button type="button" class="btn btn-sm" id="svg-zoom-out" title="Zoom out">−</button>
            <span id="svg-zoom-label" class="mono zoom-label tabular-nums">100%</span>
            <button type="button" class="btn btn-sm" id="svg-zoom-in" title="Zoom in">+</button>
            <button type="button" class="btn btn-sm" id="svg-zoom-fit" title="Fit diagram inside viewport">Fit</button>
            <button type="button" class="btn btn-sm" id="svg-zoom-reset" title="Reset zoom to 100%">100%</button>
          </div>
        </div>
        ${
          allDiagramSlices.length > 1
            ? `<div class="diagram-slices" id="diagram-slices" role="tablist" aria-label="Diagram domain slices">${allDiagramSlices
                .map(
                  (sl, idx) =>
                    `<button type="button" class="slice-pill${
                      idx === 0 ? ' is-active' : ''
                    }" data-slice-btn="${escapeHtml(sl.id)}">${
                      sl.color
                        ? `<span class="dot" style="background:${sanitizeColorHex(
                            sl.color
                          )}"></span>`
                        : ''
                    }<span>${escapeHtml(sl.label)}</span></button>`
                )
                .join('')}</div>`
            : ''
        }
        <div class="card diagram-card">
          <div id="diagram-viewport" class="diagram-viewport" tabindex="0">
            <div id="diagram-stage" class="diagram-stage">${primaryDiagramSvg}</div>
          </div>
          ${allDiagramSlices
            .map(
              (sl) =>
                `<template data-diagram-slice="${escapeHtml(sl.id)}">${
                  sl.svg
                }</template>`
            )
            .join('')}
          <div class="diagram-hint">Click any table or TableGroup to jump to its docs · Hover a table to highlight foreign keys · Drag to pan · Ctrl/⌘ + scroll to zoom</div>
        </div>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"${darkInitial ? ' class="dark"' : ''}>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — Schema Documentation</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface-alt: #f1f5f9;
      --surface-subtle: rgba(248, 250, 252, 0.72);
      --border: #e2e8f0;
      --border-soft: rgba(226, 232, 240, 0.75);
      --text: #0f172a;
      --text-body: #334155;
      --muted: #64748b;
      --accent: #2563eb;
      --accent-soft: #eff6ff;
      --inline-code-bg: #f1f5f9;
      --inline-code-border: rgba(226, 232, 240, 0.85);
      --inline-code-text: #be123c;
    }
    html.dark {
      --bg: #020617;
      --surface: #0f172a;
      --surface-alt: #1e293b;
      --surface-subtle: rgba(15, 23, 42, 0.7);
      --border: #1e293b;
      --border-soft: rgba(30, 41, 59, 0.75);
      --text: #f8fafc;
      --text-body: #cbd5e1;
      --muted: #94a3b8;
      --accent: #60a5fa;
      --accent-soft: rgba(23, 37, 84, 0.55);
      --inline-code-bg: #1e293b;
      --inline-code-border: rgba(51, 65, 85, 0.85);
      --inline-code-text: #fda4af;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
      display: flex;
      min-height: 100vh;
    }
    .sans { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; }
    .mono {
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-variant-numeric: tabular-nums;
    }
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .muted { color: var(--muted); }
    .strong { font-weight: 600; }
    .italic { font-style: italic; font-size: 13px; }
    .nowrap { white-space: nowrap; }
    .opacity-80 { opacity: 0.8; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Sidebar matching DocsSidebar */
    .sidebar {
      width: 272px; flex-shrink: 0; border-right: 1px solid var(--border);
      background: var(--surface); position: sticky; top: 0; height: 100vh;
      overflow-y: auto; padding: 14px 12px 24px; display: flex; flex-direction: column; gap: 4px;
    }
    .sidebar h1 { font-size: 14px; font-weight: 700; margin: 0 0 8px 4px; letter-spacing: -0.01em; }
    .search-box {
      width: 100%; padding: 7px 10px; font-size: 12px; border-radius: 8px; margin-bottom: 8px;
      border: 1px solid var(--border); background: var(--bg); color: var(--text); outline: none;
    }
    .search-box:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2); }
    .nav-group-label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--muted); margin: 12px 8px 4px;
    }
    .nav-link {
      display: flex; align-items: center; gap: 8px; padding: 5px 8px;
      border-radius: 6px; font-size: 12px; color: var(--text-body);
    }
    .nav-link:hover { background: var(--surface-alt); color: var(--text); text-decoration: none; }
    .nav-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .nav-link .count { margin-left: auto; font-size: 10.5px; color: var(--muted); flex-shrink: 0; }
    .dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; display: inline-block; }
    .dot-lg { width: 11px; height: 11px; border-radius: 3px; }

    /* Main layout */
    .main { flex: 1; min-width: 0; padding: 28px 40px 64px; max-width: 1200px; }
    .hero {
      display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
      gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 26px;
    }
    .hero h1 { margin: 6px 0 6px; font-size: 25px; font-weight: 700; letter-spacing: -0.02em; }
    .stats { font-size: 12px; font-weight: 500; color: var(--accent); }
    .actions { display: flex; gap: 8px; }
    .btn {
      padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font-size: 12px; font-weight: 600; cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .btn:hover { background: var(--surface-alt); }
    .btn-sm { padding: 4px 9px; font-size: 11.5px; border-radius: 6px; }
    .section { margin-bottom: 36px; }
    .section h2 { font-size: 17px; font-weight: 700; margin: 0 0 14px; letter-spacing: -0.01em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 14px; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .card {
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface);
      padding: 16px; break-inside: avoid;
    }
    .table-card { padding: 0; overflow: hidden; }
    .card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .table-head { padding: 14px 20px; border-bottom: 1px solid var(--border); margin-bottom: 0; }
    .table-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .table-note { padding: 10px 20px; background: var(--surface-subtle); border-bottom: 1px solid var(--border-soft); font-size: 12.5px; }
    .table-rich-note { padding: 14px 20px; border-bottom: 1px solid var(--border-soft); background: var(--bg); }
    .partials-strip {
      padding: 8px 20px; border-bottom: 1px solid var(--border-soft);
      background: rgba(139, 92, 246, 0.06); font-size: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    }
    .partial-pill {
      padding: 2px 7px; border-radius: 5px; font-size: 11px;
      border: 1px solid rgba(139, 92, 246, 0.35); background: var(--surface); color: #7c3aed;
    }
    html.dark .partial-pill { color: #c4b5fd; }
    .partial-title { color: #7c3aed; }
    html.dark .partial-title { color: #c4b5fd; }
    .partial-tag { font-size: 10px; font-weight: 500; color: #7c3aed; margin-left: 4px; }
    html.dark .partial-tag { color: #c4b5fd; }
    .title-with-dot { display: inline-flex; align-items: center; gap: 10px; }
    .meta-badges, .chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .badge, .chip {
      display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px;
      border: 1px solid var(--border); background: var(--surface-alt); color: var(--text-body);
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 10px 16px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
    th {
      font-size: 11px; font-weight: 600; color: var(--muted); background: var(--surface-subtle);
    }
    tbody tr:hover { background: var(--surface-subtle); }
    tr:last-child td { border-bottom: none; }

    /* Column constraint tags */
    .pk-dot { color: #f59e0b; font-size: 10px; }
    .tag {
      display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 10px; font-weight: 700;
      border: 1px solid var(--border); background: var(--surface-alt); color: var(--text-body);
    }
    .tag.pk { color: #b45309; border-color: #fcd34d; background: #fef3c7; }
    .tag.fk { color: #1d4ed8; border-color: #bfdbfe; background: #dbeafe; }
    .tag.uq { color: #047857; border-color: #a7f3d0; background: #d1fae5; }
    .tag.chk { color: #0e7490; border-color: #a5f3fc; background: #ecfeff; }
    html.dark .tag.pk { color: #fcd34d; border-color: rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.14); }
    html.dark .tag.fk { color: #93c5fd; border-color: rgba(59, 130, 246, 0.35); background: rgba(59, 130, 246, 0.14); }
    html.dark .tag.uq { color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.14); }
    html.dark .tag.chk { color: #67e8f9; border-color: rgba(6, 182, 212, 0.35); background: rgba(6, 182, 212, 0.14); }

    /* Indexes & Check blocks */
    .sub-block { padding: 12px 20px; border-top: 1px solid var(--border); background: var(--surface-subtle); font-size: 12px; }
    .sub-block-title { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
    .sub-block-list { display: flex; flex-direction: column; gap: 4px; }
    .idx-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text-body); }
    .expr-tok { color: #0e7490; }
    .tok-sky { color: #0284c7; }
    .tok-amber { color: #d97706; }
    .tok-emerald { color: #059669; }
    html.dark .expr-tok { color: #67e8f9; }
    html.dark .tok-sky { color: #38bdf8; }
    html.dark .tok-amber { color: #fbbf24; }
    html.dark .tok-emerald { color: #34d399; }
    .check-line { font-size: 11px; color: #0e7490; margin-top: 2px; }
    html.dark .check-line { color: #67e8f9; }
    .check-pill {
      font-size: 11px; color: #0e7490; background: rgba(6, 182, 212, 0.08);
      padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(6, 182, 212, 0.25);
    }
    html.dark .check-pill { color: #67e8f9; }

    /* Cardinality badges matching CardinalityBadge.tsx */
    .legend-card { margin-bottom: 14px; padding: 14px; }
    .legend-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
    .legend-item { padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-subtle); }
    .legend-desc { font-size: 11px; margin-top: 5px; line-height: 1.4; }
    .card-badge {
      display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px;
      border-radius: 5px; border: 1px solid var(--border); font-size: 11px; font-weight: 500; white-space: nowrap;
    }
    .rel-many-to-one { border-color: #bfdbfe; background: #eff6ff; color: #1d4ed8; }
    .rel-one-to-many { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
    .rel-one-to-one { border-color: #ddd6fe; background: #f5f3ff; color: #6d28d9; }
    .rel-many-to-many { border-color: #fde68a; background: #fffbeb; color: #b45309; }
    html.dark .rel-many-to-one { border-color: #1e3a8a; background: rgba(23, 37, 84, 0.55); color: #93c5fd; }
    html.dark .rel-one-to-many { border-color: #064e3b; background: rgba(2, 44, 34, 0.55); color: #6ee7b7; }
    html.dark .rel-one-to-one { border-color: #4c1d95; background: rgba(46, 16, 101, 0.55); color: #c4b5fd; }
    html.dark .rel-many-to-many { border-color: #78350f; background: rgba(69, 26, 3, 0.55); color: #fcd34d; }

    /* ReadmeNoteCard styling */
    .readme-card {
      border: 1px solid var(--border); border-radius: 12px; background: var(--surface); overflow: hidden;
    }
    .readme-head {
      padding: 10px 18px; border-bottom: 1px solid var(--border); background: var(--surface-subtle);
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
    }
    .readme-title-wrap { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    .readme-icon {
      font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px;
      background: var(--accent-soft); color: var(--accent);
    }
    .readme-meta { font-size: 11px; }
    .readme-toc {
      padding: 8px 18px; border-bottom: 1px solid var(--border-soft); background: var(--bg);
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 11px;
    }
    .readme-toc-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    .readme-toc-link { color: var(--text-body); }
    .readme-toc-link.lvl-1 { font-weight: 600; }
    .readme-toc-link.lvl-3 { color: var(--muted); }
    .readme-body { padding: 20px 24px; max-width: 880px; }

    /* Markdown Prose & Alerts matching MarkdownContent.tsx + inlineRenderer.tsx */
    .prose { color: var(--text-body); font-size: 13.5px; line-height: 1.7; min-width: 0; overflow-wrap: break-word; }
    .prose p { margin: 8px 0; }
    .prose p:first-child { margin-top: 0; }
    .prose p:last-child { margin-bottom: 0; }
    .prose .md-h1 { font-size: 20px; font-weight: 700; color: var(--text); margin: 20px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .prose .md-h2 { font-size: 17px; font-weight: 700; color: var(--text); margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--border-soft); }
    .prose .md-h3 { font-size: 15px; font-weight: 600; color: var(--text); margin: 14px 0 6px; }
    .prose .md-h4, .prose .md-h5, .prose .md-h6 { font-size: 13.5px; font-weight: 600; color: var(--text); margin: 12px 0 5px; }
    .prose .md-h1:first-child, .prose .md-h2:first-child, .prose .md-h3:first-child { margin-top: 0; }
    .prose .md-hr { border: 0; border-top: 1px solid var(--border); margin: 16px 0; }
    .prose .inline-code {
      padding: 1px 6px; margin: 0 1px; border-radius: 4px;
      background: var(--inline-code-bg); border: 1px solid var(--inline-code-border);
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85em; color: var(--inline-code-text);
    }
    .prose .md-link { color: var(--accent); text-decoration: underline; text-decoration-color: rgba(59, 130, 246, 0.45); font-weight: 500; }
    .prose .md-del { text-decoration: line-through; color: var(--muted); }
    .prose .md-img { max-width: 100%; border-radius: 8px; border: 1px solid var(--border); margin: 6px 0; }
    .prose .md-list { margin: 8px 0; padding-left: 20px; }
    .prose .md-list li { margin: 4px 0; }
    .prose .md-task-item { list-style: none; margin-left: -20px; display: flex; align-items: flex-start; gap: 8px; }
    .prose .md-task-box { margin-top: 5px; accent-color: var(--accent); }
    .prose .md-list-body { flex: 1; min-width: 0; }
    .prose .md-quote { margin: 10px 0; padding-left: 14px; border-left: 4px solid var(--border); color: var(--muted); }
    .prose .md-alert {
      margin: 12px 0; padding: 10px 14px; border-radius: 0 8px 8px 0;
      border-top: 1px solid var(--border); border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
      border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.08);
    }
    .prose .md-alert-title { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .prose .alert-note { border-left-color: #3b82f6; background: rgba(59, 130, 246, 0.08); }
    .prose .alert-note .md-alert-title { color: #2563eb; }
    .prose .alert-tip { border-left-color: #10b981; background: rgba(16, 185, 129, 0.08); }
    .prose .alert-tip .md-alert-title { color: #059669; }
    .prose .alert-important { border-left-color: #8b5cf6; background: rgba(139, 92, 246, 0.08); }
    .prose .alert-important .md-alert-title { color: #7c3aed; }
    .prose .alert-warning { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.09); }
    .prose .alert-warning .md-alert-title { color: #d97706; }
    .prose .alert-caution { border-left-color: #f43f5e; background: rgba(244, 63, 94, 0.08); }
    .prose .alert-caution .md-alert-title { color: #e11d48; }
    html.dark .prose .alert-note .md-alert-title { color: #93c5fd; }
    html.dark .prose .alert-tip .md-alert-title { color: #6ee7b7; }
    html.dark .prose .alert-important .md-alert-title { color: #c4b5fd; }
    html.dark .prose .alert-warning .md-alert-title { color: #fcd34d; }
    html.dark .prose .alert-caution .md-alert-title { color: #fda4af; }
    .prose .md-table-wrap { margin: 12px 0; border-radius: 8px; border: 1px solid var(--border); overflow-x: auto; }
    .prose .md-table-wrap table { font-size: 12px; }
    .prose .md-table-wrap th { background: var(--surface-alt); }

    /* CodeBlockView dark slate-950 syntax-highlighted code blocks */
    .code-block {
      margin: 12px 0; border-radius: 8px; border: 1px solid #1e293b;
      background: #020617; color: #f1f5f9; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .code-block-head {
      padding: 6px 14px; border-bottom: 1px solid #1e293b; background: rgba(15, 23, 42, 0.92);
      display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #94a3b8;
    }
    .code-block-lang { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', ui-monospace, monospace; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; color: #cbd5e1; }
    .code-auto { font-size: 9px; color: #64748b; text-transform: lowercase; }
    .code-copy-btn {
      border: 0; background: transparent; color: #cbd5e1; cursor: pointer; font-size: 11px;
      padding: 2px 8px; border-radius: 4px; font-family: inherit;
    }
    .code-copy-btn:hover { background: #1e293b; color: #ffffff; }
    .code-block-pre {
      margin: 0; padding: 12px 14px; overflow-x: auto; font-size: 12px; line-height: 1.625;
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: #f1f5f9;
    }
    .code-block-pre code { display: block; min-width: max-content; }
    .code-line { display: flex; min-height: 1.625em; }
    .code-line.diff-added { background: rgba(16, 185, 129, 0.14); margin: 0 -14px; padding: 0 14px; }
    .code-line.diff-removed { background: rgba(244, 63, 94, 0.14); margin: 0 -14px; padding: 0 14px; }
    .code-line-num {
      user-select: none; width: 28px; padding-right: 12px; text-align: right;
      color: #475569; flex-shrink: 0; font-variant-numeric: tabular-nums;
    }
    .code-line-text { flex: 1; white-space: pre; }
    /* Syntax Highlighting Tokens matching TOKEN_CLASS_MAP */
    .tok-plain { color: #f1f5f9; }
    .tok-comment { color: #64748b; font-style: italic; }
    .tok-keyword { color: #c084fc; font-weight: 500; }
    .tok-type { color: #6ee7b7; }
    .tok-string { color: #fcd34d; }
    .tok-number { color: #fdba74; }
    .tok-boolean { color: #fdba74; font-weight: 500; }
    .tok-property { color: #7dd3fc; }
    .tok-identifier { color: #67e8f9; }
    .tok-operator { color: #38bdf8; }
    .tok-punctuation { color: #94a3b8; }
    .tok-variable { color: #5eead4; }
    .tok-decorator { color: #f472b6; }
    .tok-added { color: #6ee7b7; }
    .tok-removed { color: #fda4af; }
    .tok-meta { color: #22d3ee; font-weight: 600; }

    /* Metadata Tags */
    .col-tag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
    .meta-tag {
      display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 5px;
      font-size: 10.5px; font-weight: 600; border: 1px solid var(--border);
      background: var(--surface-alt); color: var(--text-body);
    }
    .tag-pii { border-color: #fda4af; background: #fff1f2; color: #be123c; }
    .tag-deprecated { border-color: #fdba74; background: #fff7ed; color: #c2410c; }
    .tag-owner { border-color: #c7d2fe; background: #eef2ff; color: #4338ca; }
    .tag-sla { border-color: #a5f3fc; background: #ecfeff; color: #0e7490; }
    html.dark .tag-pii { border-color: rgba(244, 63, 94, 0.4); background: rgba(244, 63, 94, 0.14); color: #fda4af; }
    html.dark .tag-deprecated { border-color: rgba(249, 115, 22, 0.4); background: rgba(249, 115, 22, 0.14); color: #fdba74; }
    html.dark .tag-owner { border-color: rgba(99, 102, 241, 0.4); background: rgba(99, 102, 241, 0.14); color: #a5b4fc; }
    html.dark .tag-sla { border-color: rgba(6, 182, 212, 0.4); background: rgba(6, 182, 212, 0.14); color: #67e8f9; }

    /* Interactive SVG Diagram Viewport */
    .diagram-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
    .diagram-section-head h2 { margin: 0; }
    .diagram-toolbar { display: inline-flex; align-items: center; gap: 6px; }
    .diagram-slices { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .slice-pill {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 7px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-body);
      font-size: 11.5px; font-weight: 600; cursor: pointer; transition: background 0.15s, border-color 0.15s;
    }
    .slice-pill:hover { background: var(--surface-alt); }
    .slice-pill.is-active { background: var(--accent); border-color: var(--accent); color: #ffffff; }
    .zoom-label { font-size: 11.5px; min-width: 46px; text-align: center; color: var(--muted); font-weight: 600; }
    .diagram-card { padding: 0; overflow: hidden; }
    .diagram-viewport {
      width: 100%; height: 540px; min-height: 280px; max-height: 85vh;
      overflow: auto; resize: vertical; background: var(--bg); cursor: grab;
      padding: 12px; outline: none;
    }
    .diagram-viewport.is-dragging { cursor: grabbing; user-select: none; }
    .diagram-stage { display: inline-block; min-width: 100%; }
    .diagram-viewport svg { display: block; }
    .diagram-viewport svg .svg-table,
    .diagram-viewport svg .svg-group { cursor: pointer; transition: opacity 0.15s; }
    .diagram-viewport svg .svg-table:hover > rect:first-of-type { stroke: var(--accent); stroke-width: 2.2; }
    .diagram-viewport svg .svg-edge { transition: opacity 0.15s; }
    .diagram-viewport svg.has-hover .svg-edge { opacity: 0.22; }
    .diagram-viewport svg.has-hover .svg-edge.is-connected { opacity: 1; }
    .diagram-viewport svg.has-hover .svg-edge.is-connected path { stroke: var(--accent); stroke-width: 2.4; }
    .flash-target { box-shadow: 0 0 0 3px var(--accent); transition: box-shadow 0.4s ease; }
    .diagram-hint {
      padding: 7px 14px; border-top: 1px solid var(--border); background: var(--surface-subtle);
      font-size: 11px; color: var(--muted);
    }

    @media (max-width: 860px) { .sidebar { display: none; } .main { padding: 20px 16px; } }
    @media print {
      body { background: #ffffff; color: #0f172a; display: block; }
      .sidebar, .actions, .diagram-toolbar, .diagram-slices, .diagram-hint, .code-copy-btn { display: none !important; }
      .main { max-width: none; padding: 0; }
      .card, .readme-card { break-inside: avoid; border-color: #cbd5e1; }
      .diagram-viewport { height: auto !important; max-height: none !important; overflow: visible !important; resize: none !important; padding: 0; }
      .diagram-viewport svg { width: 100% !important; height: auto !important; }
    }
  </style>
</head>
<body>
  <aside class="sidebar">
    <h1>${escapeHtml(title)}</h1>
    <input id="doc-filter" class="search-box" type="search" placeholder="Filter tables, columns &amp; tags..." />
    <a class="nav-link" href="#top">Overview</a>
    ${primaryDiagramSvg ? '<a class="nav-link" href="#diagram">ER Diagram</a>' : ''}
    ${schema.tableGroups.length > 0 ? '<a class="nav-link" href="#domains">Business Domains</a>' : ''}
    <a class="nav-link" href="#tables">Tables (${sortedTables.length})</a>
    ${schema.refs.length > 0 ? `<a class="nav-link" href="#relationships">Relationships (${schema.refs.length})</a>` : ''}
    ${schema.enums.length > 0 ? `<a class="nav-link" href="#enums">Enums (${schema.enums.length})</a>` : ''}
    ${schema.tablePartials.length > 0 ? `<a class="nav-link" href="#partials">Table Partials (${schema.tablePartials.length})</a>` : ''}
    ${schema.notes.length > 0 ? '<a class="nav-link" href="#notes">Notes</a>' : ''}
    ${schema.tableGroups.length > 0 ? `<div class="nav-group-label">Domains</div>${navGroupsHtml}` : ''}
    <div class="nav-group-label">Tables</div>
    ${navTablesHtml}
  </aside>
  <main class="main" id="top">
    <header class="hero">
      <div>
        <div class="stats">${escapeHtml(
          schema.project.databaseType || 'Relational Schema'
        )} · ${schema.tables.length} Tables · ${totalFields} Fields · ${
    schema.tableGroups.length
  } Table Groups · ${schema.enums.length} Enums · ${schema.refs.length} Relationships · ${coverage.overallPct}% Documented</div>
        <h1>${escapeHtml(title)}</h1>
        ${
          schema.project.note && !isRichMarkdownNote(schema.project.note)
            ? `<div class="prose">${renderSafeMarkdownToHtml(
                schema.project.note,
                'proj-short'
              )}</div>`
            : ''
        }
      </div>
      <div class="actions">
        <button type="button" class="btn" onclick="document.documentElement.classList.toggle('dark')">Toggle Theme</button>
        <button type="button" class="btn" onclick="window.print()">Print / Save PDF</button>
      </div>
    </header>
    ${projectReadmeHtml}
    ${diagramSectionHtml}
    ${groupsSectionHtml}
    ${tablesSectionHtml}
    ${refsSectionHtml}
    ${enumsSectionHtml}
    ${partialsSectionHtml}
    ${notesSectionHtml}
  </main>
  <script>
    (function () {
      var input = document.getElementById('doc-filter');
      if (input) {
        input.addEventListener('input', function () {
          var q = String(input.value || '').trim().toLowerCase();
          var cards = document.querySelectorAll('[data-table-search]');
          cards.forEach(function (el) {
            var hay = el.getAttribute('data-table-search') || '';
            el.style.display = !q || hay.indexOf(q) !== -1 ? '' : 'none';
          });
          var navs = document.querySelectorAll('[data-nav-table]');
          navs.forEach(function (el) {
            var name = el.getAttribute('data-nav-table') || '';
            el.style.display = !q || name.indexOf(q) !== -1 ? '' : 'none';
          });
        });
      }

      document.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-copy-code]') : null;
        if (!btn) return;
        var block = btn.closest('.code-block');
        if (!block) return;
        var lineEls = block.querySelectorAll('.code-line-text');
        var text = Array.prototype.map.call(lineEls, function (el) {
          return el.textContent || '';
        }).join('\\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            var prev = btn.textContent;
            btn.textContent = 'Copied';
            window.setTimeout(function () { btn.textContent = prev || 'Copy'; }, 1500);
          }).catch(function () {});
        }
      });

      var tableSlugs = ${tableSlugMapJson};
      var groupSlugs = ${groupSlugMapJson};
      var viewport = document.getElementById('diagram-viewport');
      var stage = document.getElementById('diagram-stage');
      var label = document.getElementById('svg-zoom-label');
      var scale = 1;
      var natW = 1000;
      var natH = 600;
      var activeSvg = null;
      var movedSinceDown = false;

      function scrollToTargetElement(elId) {
        var target = document.getElementById(elId);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash-target');
        window.setTimeout(function () { target.classList.remove('flash-target'); }, 1400);
      }

      function bindActiveSvg(fitInitially) {
        if (!viewport || !stage) return;
        var svg = stage.querySelector('svg');
        if (!svg) return;
        activeSvg = svg;

        natW = parseFloat(svg.getAttribute('width') || '0');
        natH = parseFloat(svg.getAttribute('height') || '0');
        if ((!natW || !natH) && svg.viewBox && svg.viewBox.baseVal) {
          natW = svg.viewBox.baseVal.width;
          natH = svg.viewBox.baseVal.height;
        }
        if (!natW || !natH) {
          var box = svg.getBoundingClientRect();
          natW = box.width || 1000;
          natH = box.height || 600;
        }

        svg.style.maxWidth = 'none';
        svg.style.display = 'block';
        svg.style.flexShrink = '0';

        if (fitInitially && natW > viewport.clientWidth - 24) {
          fitDiagram();
        } else {
          applyZoom(1);
        }

        var tables = svg.querySelectorAll('[data-table-id]');
        tables.forEach(function (tEl) {
          var tid = tEl.getAttribute('data-table-id') || '';
          tEl.addEventListener('mouseenter', function () {
            svg.classList.add('has-hover');
            svg.querySelectorAll('.svg-edge').forEach(function (edgeEl) {
              var fromT = edgeEl.getAttribute('data-edge-from');
              var toT = edgeEl.getAttribute('data-edge-to');
              edgeEl.classList.toggle('is-connected', fromT === tid || toT === tid);
            });
          });
          tEl.addEventListener('mouseleave', function () {
            svg.classList.remove('has-hover');
            svg.querySelectorAll('.svg-edge.is-connected').forEach(function (edgeEl) {
              edgeEl.classList.remove('is-connected');
            });
          });
        });

        svg.addEventListener('click', function (e) {
          if (movedSinceDown) return;
          var targetNode = e.target;
          if (!targetNode || !targetNode.closest) return;
          var tableG = targetNode.closest('[data-table-id]');
          if (tableG) {
            var tableId = tableG.getAttribute('data-table-id') || '';
            var slug = tableSlugs[tableId];
            if (slug) scrollToTargetElement('table-' + slug);
            return;
          }
          var groupG = targetNode.closest('[data-group-name]');
          if (groupG) {
            var groupName = groupG.getAttribute('data-group-name') || '';
            var gSlug = groupSlugs[groupName];
            if (gSlug) scrollToTargetElement('group-' + gSlug);
          }
        });
      }

      function applyZoom(nextScale, anchorClientX, anchorClientY) {
        if (!viewport || !activeSvg) return;
        var clamped = Math.min(4, Math.max(0.15, nextScale));
        var rect = viewport.getBoundingClientRect();
        var relX = anchorClientX !== undefined ? anchorClientX - rect.left : viewport.clientWidth / 2;
        var relY = anchorClientY !== undefined ? anchorClientY - rect.top : viewport.clientHeight / 2;
        var contentX = (viewport.scrollLeft + relX) / scale;
        var contentY = (viewport.scrollTop + relY) / scale;

        scale = clamped;
        activeSvg.style.width = Math.round(natW * scale) + 'px';
        activeSvg.style.height = Math.round(natH * scale) + 'px';
        if (label) label.textContent = Math.round(scale * 100) + '%';

        viewport.scrollLeft = contentX * scale - relX;
        viewport.scrollTop = contentY * scale - relY;
      }

      function fitDiagram() {
        if (!viewport || !activeSvg) return;
        var availW = Math.max(240, viewport.clientWidth - 28);
        var availH = Math.max(240, viewport.clientHeight - 28);
        var fit = Math.min(1, availW / natW, availH / natH);
        applyZoom(Math.max(0.15, fit));
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      }

      if (viewport && stage) {
        bindActiveSvg(true);

        var btnIn = document.getElementById('svg-zoom-in');
        var btnOut = document.getElementById('svg-zoom-out');
        var btnFit = document.getElementById('svg-zoom-fit');
        var btnReset = document.getElementById('svg-zoom-reset');
        if (btnIn) btnIn.addEventListener('click', function () { applyZoom(scale * 1.25); });
        if (btnOut) btnOut.addEventListener('click', function () { applyZoom(scale / 1.25); });
        if (btnFit) btnFit.addEventListener('click', fitDiagram);
        if (btnReset) btnReset.addEventListener('click', function () { applyZoom(1); });

        var sliceBar = document.getElementById('diagram-slices');
        if (sliceBar) {
          sliceBar.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-slice-btn]') : null;
            if (!btn) return;
            var sliceId = btn.getAttribute('data-slice-btn');
            var tpl = document.querySelector('template[data-diagram-slice="' + CSS.escape(sliceId || '') + '"]');
            if (!tpl) return;
            sliceBar.querySelectorAll('[data-slice-btn]').forEach(function (b) {
              b.classList.toggle('is-active', b === btn);
            });
            stage.innerHTML = '';
            stage.appendChild(tpl.content.cloneNode(true));
            bindActiveSvg(true);
          });
        }

        viewport.addEventListener('wheel', function (e) {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
          applyZoom(scale * factor, e.clientX, e.clientY);
        }, { passive: false });

        var dragging = false;
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;

        viewport.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          dragging = true;
          movedSinceDown = false;
          startX = e.clientX;
          startY = e.clientY;
          startLeft = viewport.scrollLeft;
          startTop = viewport.scrollTop;
          viewport.classList.add('is-dragging');
        });

        window.addEventListener('mousemove', function (e) {
          if (!dragging) return;
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedSinceDown = true;
          viewport.scrollLeft = startLeft - dx;
          viewport.scrollTop = startTop - dy;
        });

        window.addEventListener('mouseup', function () {
          if (!dragging) return;
          dragging = false;
          viewport.classList.remove('is-dragging');
        });
      }
    })();
  </script>
</body>
</html>`;
}

export function printSchemaDocs(
  schema: ParsedSchema,
  options: DocsExportOptions = {}
): void {
  if (typeof document === 'undefined') return;
  const html = exportSchemaToHtml(schema, { ...options, darkMode: false });
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';

  const cleanup = () => {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 800);
  };

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow;
      if (win) {
        win.onafterprint = cleanup;
        win.focus();
        win.print();
      }
    } finally {
      window.setTimeout(cleanup, 60000);
    }
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
