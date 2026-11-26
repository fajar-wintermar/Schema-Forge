import { describe, expect, it } from 'vitest';
import { parseDbml } from '@shared/domain/dbml';
import { computeDocsCoverage } from '../../src/utils/docsCoverage';
import {
  collectSchemaTagCatalog,
  extractMetadataTags,
} from '../../src/utils/metadataTags';
import {
  parseWorkspaceLayoutJson,
  serializeWorkspaceLayoutJson,
} from '../../src/utils/layoutSync';
import { buildDiagramSvg } from '../../src/utils/io/diagramExport';
import { exportSchemaToHtml } from '../../src/utils/io/docsExport';

const SAMPLE_DBML = `
Project Atlas {
  database_type: 'PostgreSQL'
}

Table users [headercolor: #1e3a8a] {
  id uuid [pk]
  email varchar(255) [not null, unique, note: '@pii Primary login email. Contact security@acme.com for audits.']
  legacy_flag boolean [note: '[Deprecated] Replaced by role_tier']
  created_at timestamptz

  Note: '''
  # Core User Account
  @owner(Identity) @sla(99.99%)
  Tags: Core, Audit
  \`\`\`sql
  -- @ignored_inside_code_fence
  SELECT * FROM users;
  \`\`\`
  '''
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: orders.user_id > users.id

TableGroup Commerce [color: #2563EB] {
  Note: 'Checkout and user identity domain'
  users
  orders
}
`;

describe('Documentation coverage meter & metadata tags', () => {
  it('computes accurate table, column, group, and overall coverage stats', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const report = computeDocsCoverage(schema);

    expect(report.tables).toEqual({ documented: 1, total: 2, pct: 50 });
    expect(report.columns).toEqual({ documented: 2, total: 6, pct: 33 });
    expect(report.groups).toEqual({ documented: 1, total: 1, pct: 100 });
    expect(report.undocumentedTables.map((t) => t.id)).toEqual(['orders']);
    expect(report.undocumentedGroups).toEqual([]);
    expect(report.undocumentedColumnCount).toBe(4);
    expect(report.overallPct).toBe(44); // 4 of 9 items
  });

  it('extracts @tag, [Tag], and Tags: lines without matching emails, markdown headings, or code fences', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const users = schema.tables.find((t) => t.id === 'users')!;
    const tableTags = extractMetadataTags(users.note);
    const labels = tableTags.map((t) => t.label);

    expect(labels).toContain('Owner: Identity');
    expect(labels).toContain('SLA: 99.99%');
    expect(labels).toContain('Core');
    expect(labels).toContain('Audit');
    expect(labels.some((l) => l.toLowerCase().includes('ignored_inside_code_fence'))).toBe(
      false
    );

    const emailCol = users.columns.find((c) => c.name === 'email')!;
    const emailTags = extractMetadataTags(emailCol.note);
    expect(emailTags.map((t) => t.label)).toEqual(['PII']);
    expect(emailTags.some((t) => t.label.toLowerCase().includes('acme'))).toBe(false);

    const catalog = collectSchemaTagCatalog(schema);
    expect(catalog.find((c) => c.label === 'PII')?.count).toBe(1);
    expect(catalog.find((c) => c.label === 'Deprecated')?.tone).toBe('deprecated');
  });
});

describe('Interactive SVG, domain slices & HTML export', () => {
  it('emits interactive data attributes on SVG tables/groups/edges and omits sticky notes', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const { svg } = buildDiagramSvg({
      schema,
      positions: { users: { x: 40, y: 40 }, orders: { x: 380, y: 40 } },
      detailLevel: 'full',
      darkMode: false,
      title: 'Atlas',
      stickyNotes: [
        {
          id: 'note_1',
          title: 'Secret Sticky',
          content: 'SECRET STICKY DO NOT EXPORT',
          x: 60,
          y: 60,
          width: 220,
          color: 'amber',
          author: 'tester',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(svg).toContain('class="svg-table" data-table-id="users"');
    expect(svg).toContain('class="svg-table" data-table-id="orders"');
    expect(svg).toContain('class="svg-group" data-group-name="Commerce"');
    expect(svg).toContain('class="svg-edge" data-edge-from="orders" data-edge-to="users"');
    expect(svg).not.toContain('SECRET STICKY DO NOT EXPORT');
  });

  it('embeds multi-domain SVG atlas switcher, coverage badge, and metadata pills into HTML export', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const allSvg = buildDiagramSvg({
      schema,
      positions: { users: { x: 40, y: 40 }, orders: { x: 380, y: 40 } },
      detailLevel: 'full',
      darkMode: false,
      title: 'All',
    }).svg;
    const commerceSvg = buildDiagramSvg({
      schema,
      positions: { users: { x: 40, y: 40 }, orders: { x: 380, y: 40 } },
      detailLevel: 'full',
      darkMode: false,
      title: 'Commerce',
      selectedDomains: ['Commerce'],
    }).svg;

    const html = exportSchemaToHtml(schema, {
      title: 'Atlas Docs',
      svgDiagram: allSvg,
      domainDiagrams: [
        { id: 'Commerce', label: 'Commerce', color: '#2563EB', svg: commerceSvg },
      ],
    });

    expect(html).toContain('44% Documented');
    expect(html).toContain('data-slice-btn="__all__"');
    expect(html).toContain('data-slice-btn="Commerce"');
    expect(html).toContain('<template data-diagram-slice="Commerce">');
    expect(html).toContain('Owner: Identity');
    expect(html).toContain('var tableSlugs =');
    expect(html).toContain('var groupSlugs =');
  });
});

describe('.schemaforge/layout.json serializer & parser', () => {
  it('round-trips coordinates, collapsed group metadata, and detailLevel deterministically', () => {
    const serialized = serializeWorkspaceLayoutJson({
      detailLevel: 'keys',
      tablePositions: {
        orders: { x: 412.6, y: 98.4 },
        users: { x: 40.2, y: 50.8 },
      },
      groupMeta: {
        Commerce: { collapsed: true, description: 'Core checkout' },
      },
    });

    const parsed = parseWorkspaceLayoutJson(serialized);
    expect(parsed).toEqual({
      version: 1,
      detailLevel: 'keys',
      tablePositions: {
        orders: { x: 413, y: 98 },
        users: { x: 40, y: 51 },
      },
      groupMeta: {
        Commerce: { collapsed: true, description: 'Core checkout' },
      },
    });

    expect(parseWorkspaceLayoutJson('not json {')).toBeNull();
  });
});
