import { describe, expect, it } from 'vitest';
import {
  addRefInDbml,
  parseDbml,
  setColumnNoteInDbml,
  setTableGroupNoteInDbml,
  setTableNoteInDbml,
} from '@shared/domain/dbml';
import {
  alignSelectedTables,
  computeSnapAlignment,
  findTablesInMarquee,
  TableRect,
} from '../../src/features/diagram/canvasGeometry';
import {
  buildTableInstances,
  COLLAPSED_GROUP_HEIGHT,
  COLLAPSED_GROUP_WIDTH,
  computeGroupBoundingBoxes,
  resolveSchemaEdges,
} from '../../src/utils/autoLayout';
import { computeEdgeRoutingAndBundles } from '../../src/utils/io/edgeGeometry';
import {
  buildDiagramSvg,
  exportSchemaToHtml,
  exportSchemaToMarkdown,
} from '../../src/utils/importExport';

describe('addRefInDbml', () => {
  it('appends a new Ref statement and avoids creating duplicates', () => {
    const base = `
Table users {
  id int [pk]
}

Table orders {
  id int [pk]
  user_id int
}
`;
    const first = addRefInDbml(base, 'orders', 'user_id', 'users', 'id', '>');
    expect(first.added).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(first.dbml).toContain('Ref: orders.user_id > users.id');

    const parsed = parseDbml(first.dbml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.refs).toHaveLength(1);

    const second = addRefInDbml(
      first.dbml,
      'users',
      'id',
      'orders',
      'user_id',
      '<',
      parsed
    );
    expect(second.added).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.dbml).toBe(first.dbml);
  });
});

describe('canvasGeometry multi-select, snap guides & alignment', () => {
  const sampleRects = new Map<string, TableRect>([
    ['a', { posKey: 'a', x: 100, y: 120, width: 276, height: 140 }],
    ['b', { posKey: 'b', x: 460, y: 200, width: 276, height: 180 }],
    ['c', { posKey: 'c', x: 900, y: 340, width: 276, height: 120 }],
  ]);

  it('finds all tables intersecting a marquee rectangle', () => {
    const inside = findTablesInMarquee(
      { x: 50, y: 100, width: 450, height: 150 },
      sampleRects.values()
    );
    expect(inside).toEqual(['a', 'b']);
  });

  it('computes snap offsets and alignment guides within threshold', () => {
    const snap = computeSnapAlignment(
      { x: 104, y: 336, width: 276, height: 120 },
      [sampleRects.get('a')!, sampleRects.get('c')!],
      7
    );
    expect(snap.dx).toBe(-4); // aligns left edge to 100
    expect(snap.dy).toBe(4); // aligns top edge to 340
    expect(snap.guides).toHaveLength(2);
    expect(snap.guides.find((g) => g.axis === 'x')?.position).toBe(100);
    expect(snap.guides.find((g) => g.axis === 'y')?.position).toBe(340);
  });

  it('aligns and distributes multi-selected tables cleanly', () => {
    const positions = {
      a: { x: 100, y: 120 },
      b: { x: 460, y: 200 },
      c: { x: 900, y: 340 },
    };

    const leftAligned = alignSelectedTables(
      ['a', 'b', 'c'],
      positions,
      sampleRects,
      'left'
    );
    expect(leftAligned.a.x).toBe(100);
    expect(leftAligned.b.x).toBe(100);
    expect(leftAligned.c.x).toBe(100);

    const topAligned = alignSelectedTables(
      ['a', 'b', 'c'],
      positions,
      sampleRects,
      'top'
    );
    expect(topAligned.a.y).toBe(120);
    expect(topAligned.b.y).toBe(120);
    expect(topAligned.c.y).toBe(120);

    const distributedH = alignSelectedTables(
      ['a', 'b', 'c'],
      positions,
      sampleRects,
      'distribute-h'
    );
    expect(distributedH.a.x).toBe(100);
    expect(distributedH.b.x).toBe(500);
    expect(distributedH.c.x).toBe(900);
  });
});

describe('DBML inline documentation note mutations', () => {
  const sampleDbml = `
TableGroup Commerce [color: #2563EB] {
  orders
  order_items
}

Table orders {
  id uuid [pk]
  total_cents int [not null]
}

Table order_items {
  id uuid [pk]
  order_id uuid [ref: > orders.id]
}
`;

  it('creates, updates, supports multiline, and clears TableGroup notes', () => {
    const withNote = setTableGroupNoteInDbml(
      sampleDbml,
      'Commerce',
      'Handles checkout and fulfillment.'
    );
    let parsed = parseDbml(withNote);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tableGroups[0].note).toBe('Handles checkout and fulfillment.');

    const multiline = setTableGroupNoteInDbml(
      withNote,
      'Commerce',
      'Line one\nLine two'
    );
    parsed = parseDbml(multiline);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tableGroups[0].note).toBe('Line one\nLine two');

    const cleared = setTableGroupNoteInDbml(multiline, 'Commerce', '   ');
    parsed = parseDbml(cleared);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tableGroups[0].note).toBeUndefined();
  });

  it('creates, updates, and clears Table notes cleanly', () => {
    const added = setTableNoteInDbml(
      sampleDbml,
      'orders',
      'Customer purchase headers.'
    );
    let parsed = parseDbml(added);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tables.find((t) => t.id === 'orders')?.note).toBe(
      'Customer purchase headers.'
    );

    const updated = setTableNoteInDbml(
      added,
      'orders',
      "Buyer's finalized\norder record"
    );
    parsed = parseDbml(updated);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tables.find((t) => t.id === 'orders')?.note).toBe(
      "Buyer's finalized\norder record"
    );

    const cleared = setTableNoteInDbml(updated, 'orders', '');
    parsed = parseDbml(cleared);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tables.find((t) => t.id === 'orders')?.note).toBeUndefined();
  });

  it('creates, updates, and clears Column notes without disturbing other attributes', () => {
    const addedToBare = setColumnNoteInDbml(
      sampleDbml,
      'order_items',
      'order_id',
      'Parent order FK'
    );
    let parsed = parseDbml(addedToBare);
    expect(parsed.errors).toEqual([]);
    const orderIdCol = parsed.tables
      .find((t) => t.id === 'order_items')
      ?.columns.find((c) => c.name === 'order_id');
    expect(orderIdCol?.note).toBe('Parent order FK');

    const addedToExistingBracket = setColumnNoteInDbml(
      addedToBare,
      'orders',
      'total_cents',
      'Gross amount in USD cents'
    );
    parsed = parseDbml(addedToExistingBracket);
    expect(parsed.errors).toEqual([]);
    const totalCol = parsed.tables
      .find((t) => t.id === 'orders')
      ?.columns.find((c) => c.name === 'total_cents');
    expect(totalCol?.notNull).toBe(true);
    expect(totalCol?.note).toBe('Gross amount in USD cents');

    const cleared = setColumnNoteInDbml(
      addedToExistingBracket,
      'orders',
      'total_cents',
      ''
    );
    parsed = parseDbml(cleared);
    expect(parsed.errors).toEqual([]);
    const clearedCol = parsed.tables
      .find((t) => t.id === 'orders')
      ?.columns.find((c) => c.name === 'total_cents');
    expect(clearedCol?.notNull).toBe(true);
    expect(clearedCol?.note).toBeUndefined();
  });
});

describe('Collapsible TableGroups, edge bundling, docs & SVG export parity', () => {
  const multiDomainDbml = `
TableGroup Identity [color: #2563EB] {
  users
  sessions
  Note: 'Authentication and active sessions'
}

TableGroup Commerce [color: #059669] {
  orders
}

Table users {
  id uuid [pk]
  email varchar [note: '<script>alert("xss")</script> Primary login']
}

Table sessions {
  id uuid [pk]
  user_id uuid [ref: > users.id]
}

Table orders {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  Note: 'Orders placed by <img src=x onerror=alert(1)> users'
}
`;

  it('collapses TableGroups into compact summary boxes and bundles cross-group edges while hiding internal ones', () => {
    const schema = parseDbml(multiDomainDbml);
    const positions = {
      users: { x: 100, y: 100 },
      sessions: { x: 100, y: 320 },
      orders: { x: 640, y: 100 },
    };
    const fkCols = new Map<string, Set<string>>([
      ['users', new Set(['id'])],
      ['sessions', new Set(['user_id'])],
      ['orders', new Set(['user_id'])],
    ]);

    const collapsed = new Set(['Identity']);
    const boxes = computeGroupBoundingBoxes(
      schema,
      positions,
      'full',
      fkCols,
      collapsed
    );
    const identityBox = boxes.find((b) => b.name === 'Identity')!;
    const commerceBox = boxes.find((b) => b.name === 'Commerce')!;

    expect(identityBox.collapsed).toBe(true);
    expect(identityBox.width).toBe(COLLAPSED_GROUP_WIDTH);
    expect(identityBox.height).toBe(COLLAPSED_GROUP_HEIGHT);
    expect(commerceBox.collapsed).toBe(false);

    const { instances } = buildTableInstances(schema);
    const edges = resolveSchemaEdges(schema, instances, positions);
    const visibleInstances = instances.filter(
      (inst) => !(inst.groupName && collapsed.has(inst.groupName))
    );

    const { renderedEdges, crossDomainBundles } = computeEdgeRoutingAndBundles({
      edges,
      visibleGroupBoxes: boxes,
      visibleInstances,
      positions,
      detailLevel: 'full',
      fkColsByTable: fkCols,
      crossDomainMode: 'show',
      collapsedGroups: collapsed,
      tableGroups: schema.tableGroups,
    });

    // sessions -> users is internal to collapsed Identity -> hidden
    // orders -> users touches collapsed Identity -> bundled to Identity card
    expect(renderedEdges).toHaveLength(0);
    expect(crossDomainBundles).toHaveLength(1);
    expect(crossDomainBundles[0].edges).toHaveLength(1);
    expect(crossDomainBundles[0].edges[0].ref.fromTable).toBe('orders');
  });

  it('exports Markdown and XSS-safe standalone HTML documentation', () => {
    const schema = parseDbml(multiDomainDbml);
    const md = exportSchemaToMarkdown(schema, { title: 'Test Schema' });
    expect(md).toContain('# Test Schema');
    expect(md).toContain('## Business Domains (TableGroups)');
    expect(md).toContain('Authentication and active sessions');
    expect(md).toContain('Many-to-One (N:1)');

    const html = exportSchemaToHtml(schema, {
      title: 'Test <script>bad()</script> Schema',
    });
    expect(html).toContain('Test &lt;script&gt;bad()&lt;/script&gt; Schema');
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('embeds interactive SVG zoom controls and SchemaForge Docs syntax highlighting in HTML export', () => {
    const richDocsDbml = `
Project DocsTest {
  Note: '''
# Architecture Overview

Use \`orders.id\` for lookups.

> [!NOTE]
> Verify <script>alert("alert-xss")</script> isolation.

| Column | Role |
| --- | --- |
| id | Primary key |

\`\`\`sql
SELECT id, status
FROM orders
WHERE total > 0; -- <img src=x onerror=alert(1)>
\`\`\`
'''
}

Table orders {
  id uuid [pk]
  status varchar
  total int
}
`;
    const schema = parseDbml(richDocsDbml);
    const { svg } = buildDiagramSvg({
      schema,
      positions: { orders: { x: 80, y: 80 } },
      detailLevel: 'full',
      stickyNotes: [],
      darkMode: false,
    });

    const html = exportSchemaToHtml(schema, {
      title: 'Docs Rich Export',
      svgDiagram: svg,
    });

    // Interactive SVG diagram zoom/pan controls
    expect(html).toContain('id="diagram-viewport"');
    expect(html).toContain('id="diagram-stage"');
    expect(html).toContain('id="svg-zoom-in"');
    expect(html).toContain('id="svg-zoom-out"');
    expect(html).toContain('id="svg-zoom-fit"');
    expect(html).toContain('id="svg-zoom-reset"');

    // SchemaForge Docs styles, syntax highlighting, inline code, alerts, and GFM table
    expect(html).toContain('class="readme-card"');
    expect(html).toContain('<code class="inline-code">orders.id</code>');
    expect(html).toContain('class="md-alert alert-note"');
    expect(html).toContain('class="md-table-wrap"');
    expect(html).toContain('class="code-block"');
    expect(html).toContain('class="code-line-num"');
    expect(html).toContain('class="tok-keyword">SELECT</span>');

    // Strict XSS escaping inside alerts & code blocks
    expect(html).not.toContain('<script>alert("alert-xss")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;alert-xss&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  });

  it('maintains buildDiagramSvg parity with cardinality, crossDomainMode, routing, and collapsedGroups', () => {
    const schema = parseDbml(multiDomainDbml);
    const positions = {
      users: { x: 100, y: 100 },
      sessions: { x: 100, y: 320 },
      orders: { x: 640, y: 100 },
    };

    const withCard = buildDiagramSvg({
      schema,
      positions,
      detailLevel: 'full',
      stickyNotes: [],
      darkMode: false,
      showCardinality: true,
      crossDomainMode: 'show',
      edgeRouting: 'orthogonal',
    }).svg;

    const withoutCard = buildDiagramSvg({
      schema,
      positions,
      detailLevel: 'full',
      stickyNotes: [],
      darkMode: false,
      showCardinality: false,
      crossDomainMode: 'hide',
    }).svg;

    const collapsedSvg = buildDiagramSvg({
      schema,
      positions,
      detailLevel: 'full',
      stickyNotes: [],
      darkMode: false,
      collapsedGroups: ['Identity'],
    }).svg;

    expect(withCard).toContain('>N</text>');
    expect(withoutCard).not.toContain('>N</text>');
    expect(withoutCard).not.toContain('>1</text>');
    expect(collapsedSvg).toContain('Collapsed TableGroup');
    expect(collapsedSvg).toContain('1 ref');
  });

  it('excludes canvas sticky notes from SVG diagram and Markdown/HTML docs exports', () => {
    const dbmlWithNote = `
Note schema_guide {
  'DBML standalone note stays included'
}

Table users {
  id uuid [pk]
}
`;
    const schema = parseDbml(dbmlWithNote);
    const stickyNotes = [
      {
        id: 'sn-1',
        title: 'HIDDEN_STICKY_TITLE',
        content: 'HIDDEN_STICKY_BODY',
        color: 'amber' as const,
        author: 'Architect',
        updatedAt: '2026-11-25T00:00:00Z',
        x: 110,
        y: 110,
        width: 240,
      },
    ];

    const { svg } = buildDiagramSvg({
      schema,
      positions: { users: { x: 100, y: 100 } },
      detailLevel: 'full',
      stickyNotes,
      darkMode: false,
    });
    expect(svg).not.toContain('HIDDEN_STICKY_TITLE');
    expect(svg).not.toContain('HIDDEN_STICKY_BODY');

    const md = exportSchemaToMarkdown(schema, {
      title: 'No Sticky Docs',
      stickyNotes,
    });
    expect(md).toContain('DBML standalone note stays included');
    expect(md).not.toContain('HIDDEN_STICKY_TITLE');
    expect(md).not.toContain('HIDDEN_STICKY_BODY');

    const html = exportSchemaToHtml(schema, {
      title: 'No Sticky Docs',
      stickyNotes,
      svgDiagram: svg,
    });
    expect(html).toContain('DBML standalone note stays included');
    expect(html).not.toContain('HIDDEN_STICKY_TITLE');
    expect(html).not.toContain('HIDDEN_STICKY_BODY');
  });
});
