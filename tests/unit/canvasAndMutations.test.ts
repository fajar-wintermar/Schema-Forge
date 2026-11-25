import { describe, expect, it } from 'vitest';
import { addRefInDbml, parseDbml } from '@shared/domain/dbml';
import {
  alignSelectedTables,
  computeSnapAlignment,
  findTablesInMarquee,
  TableRect,
} from '../../src/features/diagram/canvasGeometry';

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
