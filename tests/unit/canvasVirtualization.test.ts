import { describe, expect, it } from 'vitest';
import {
  computeExactViewportWorldRect,
  computeWorldCullBounds,
  cullGroupBoxes,
  cullResolvedEdges,
  cullStickyNotes,
  cullTableInstances,
  resolveCanvasLod,
} from '../../src/features/diagram/canvasVirtualization';
import { buildTableRects } from '../../src/features/diagram/canvasGeometry';
import { buildTableInstances, resolveSchemaEdges } from '../../src/utils/autoLayout';
import { parseDbml } from '@shared/domain/dbml';
import type { StickyNote, TablePosition } from '@shared/domain/schemaTypes';

function buildMassiveSchema(tableCount: number) {
  const blocks: string[] = [];
  for (let i = 0; i < tableCount; i++) {
    const refLine = i > 0 ? `\n  parent_id int [ref: > tbl_${i - 1}.id]` : '';
    blocks.push(`Table tbl_${i} {
  id int [pk]
  code varchar [unique]${refLine}
  created_at timestamp
}`);
  }
  blocks.push(`TableGroup core_0 {
  tbl_0
  tbl_1
}`);
  blocks.push(`TableGroup core_far {
  tbl_${tableCount - 2}
  tbl_${tableCount - 1}
}`);
  const parsed = parseDbml(blocks.join('\n\n'));
  const { instances } = buildTableInstances(parsed);
  const positions: Record<string, TablePosition> = {};
  const cols = 15;
  instances.forEach((inst, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    positions[inst.posKey] = { x: c * 360, y: r * 240 };
  });
  return { parsed, instances, positions };
}

describe('canvasVirtualization', () => {
  it('culls offscreen tables, groups, notes, and edges on 180-table enterprise schemas while preserving pinned targets', () => {
    const { parsed, instances, positions } = buildMassiveSchema(180);
    const fkCols = new Map<string, Set<string>>();
    for (const r of parsed.refs) {
      if (!fkCols.has(r.fromTable)) fkCols.set(r.fromTable, new Set());
      r.fromColumns.forEach((c) => fkCols.get(r.fromTable)!.add(c));
    }

    const tableRects = buildTableRects(instances, positions, 'full', fkCols);
    const edges = resolveSchemaEdges(parsed, instances, positions);

    // Viewport focused cleanly on top-left corner at 1.0x zoom
    const bounds = computeWorldCullBounds(
      { x: 0, y: 0, zoom: 1 },
      { width: 1200, height: 800 },
      120,
      0
    );

    const pinnedPosKeys = new Set<string>(['tbl_179']);
    const culledTables = cullTableInstances({
      instances,
      tableRects,
      bounds,
      pinnedPosKeys,
    });

    // Only tables intersecting top-left + pinned tbl_179 should be mounted
    expect(culledTables.length).toBeLessThan(40);
    expect(culledTables.some((i) => i.posKey === 'tbl_0')).toBe(true);
    expect(culledTables.some((i) => i.posKey === 'tbl_179')).toBe(true);
    expect(culledTables.some((i) => i.posKey === 'tbl_140')).toBe(false);

    const culledEdges = cullResolvedEdges({
      edges,
      tableRects,
      positions,
      detailLevel: 'full',
      fkColsByTable: fkCols,
      bounds,
    });
    expect(culledEdges.length).toBeLessThan(edges.length);
    expect(culledEdges.length).toBeGreaterThan(0);

    const groups = cullGroupBoxes(
      [
        {
          id: 'g0',
          name: 'core_0',
          tables: ['tbl_0', 'tbl_1'],
          posKeys: ['tbl_0', 'tbl_1'],
          x: -24,
          y: -58,
          width: 700,
          height: 240,
        },
        {
          id: 'gfar',
          name: 'core_far',
          tables: ['tbl_178', 'tbl_179'],
          posKeys: ['tbl_178', 'tbl_179'],
          x: 4500,
          y: 3500,
          width: 700,
          height: 240,
        },
      ],
      bounds
    );
    expect(groups.map((g) => g.name)).toEqual(['core_0']);

    const notes: StickyNote[] = [
      {
        id: 'n1',
        x: 100,
        y: 100,
        width: 240,
        title: 'Near',
        content: 'Visible',
        color: 'amber',
        author: 'Architect',
        updatedAt: '',
      },
      {
        id: 'n2',
        x: 5200,
        y: 4100,
        width: 240,
        title: 'Far',
        content: 'Culled',
        color: 'sky',
        author: 'Architect',
        updatedAt: '',
      },
    ];
    expect(cullStickyNotes(notes, bounds).map((n) => n.id)).toEqual(['n1']);
  });

  it('keeps cross-viewport edges whose endpoints sit on opposite offscreen sides', () => {
    const { parsed, instances, positions } = buildMassiveSchema(4);
    positions['tbl_0'] = { x: -800, y: 200 };
    positions['tbl_1'] = { x: 2400, y: 200 };
    const fkCols = new Map<string, Set<string>>();
    const tableRects = buildTableRects(instances, positions, 'full', fkCols);
    const edges = resolveSchemaEdges(parsed, instances, positions);

    const bounds = computeWorldCullBounds(
      { x: 0, y: 0, zoom: 1 },
      { width: 1000, height: 700 },
      50,
      0
    );

    const culled = cullResolvedEdges({
      edges,
      tableRects,
      positions,
      detailLevel: 'full',
      fkColsByTable: fkCols,
      bounds,
    });
    expect(culled.some((e) => e.ref.fromTable === 'tbl_1' && e.ref.toTable === 'tbl_0')).toBe(
      true
    );
  });

  it('resolves LOD tiers based on zoom, density, and autoLod toggle', () => {
    expect(
      resolveCanvasLod({ zoom: 0.9, renderedTableCount: 30, autoLodEnabled: true })
    ).toBe('full');
    expect(
      resolveCanvasLod({ zoom: 0.4, renderedTableCount: 30, autoLodEnabled: true })
    ).toBe('compact');
    expect(
      resolveCanvasLod({ zoom: 0.2, renderedTableCount: 30, autoLodEnabled: true })
    ).toBe('minimal');
    expect(
      resolveCanvasLod({ zoom: 0.6, renderedTableCount: 110, autoLodEnabled: true })
    ).toBe('compact');
    expect(
      resolveCanvasLod({ zoom: 0.35, renderedTableCount: 160, autoLodEnabled: true })
    ).toBe('minimal');
    expect(
      resolveCanvasLod({ zoom: 0.15, renderedTableCount: 180, autoLodEnabled: false })
    ).toBe('full');
  });

  it('quantizes tile bounds cleanly and computes minimap viewport rects accurately', () => {
    const b1 = computeWorldCullBounds(
      { x: -10, y: -10, zoom: 1 },
      { width: 1000, height: 800 },
      200,
      140
    );
    const b2 = computeWorldCullBounds(
      { x: -18, y: -14, zoom: 1 },
      { width: 1000, height: 800 },
      200,
      140
    );
    expect(b1).toEqual(b2);

    const vpRect = computeExactViewportWorldRect(
      { x: -200, y: -100, zoom: 0.5 },
      { width: 1000, height: 600 }
    );
    expect(vpRect).toEqual({ x: 400, y: 200, width: 2000, height: 1200 });
  });
});
