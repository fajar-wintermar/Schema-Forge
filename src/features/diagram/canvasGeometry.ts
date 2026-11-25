import { DetailLevel, TableDef, TablePosition } from '@shared/domain/schemaTypes';
import { getTableHeight, TABLE_WIDTH, TableInstance } from '../../utils/autoLayout';

export interface TableRect {
  posKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export type AlignMode =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v';

export function buildTableRects(
  instances: TableInstance[],
  positions: Record<string, TablePosition>,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
): Map<string, TableRect> {
  const map = new Map<string, TableRect>();
  for (const inst of instances) {
    const pos = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
    const height = getTableHeight(
      inst.table,
      detailLevel,
      fkColsByTable.get(inst.table.id),
      inst.sharedGroups.length > 1
    );
    map.set(inst.posKey, {
      posKey: inst.posKey,
      x: pos.x,
      y: pos.y,
      width: TABLE_WIDTH,
      height,
    });
  }
  return map;
}

export function normalizeMarqueeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): MarqueeRect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function findTablesInMarquee(
  rect: MarqueeRect,
  tableRects: Iterable<TableRect>
): string[] {
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;
  const matched: string[] = [];

  for (const box of tableRects) {
    const bx2 = box.x + box.width;
    const by2 = box.y + box.height;
    const intersects =
      box.x <= rx2 && bx2 >= rect.x && box.y <= ry2 && by2 >= rect.y;
    if (intersects) {
      matched.push(box.posKey);
    }
  }
  return matched;
}

export function computeSnapAlignment(
  movingBox: { x: number; y: number; width: number; height: number },
  candidates: Array<{ x: number; y: number; width: number; height: number }>,
  threshold = 7
): {
  dx: number;
  dy: number;
  guides: AlignmentGuide[];
} {
  let bestDx = 0;
  let bestXDist = threshold + 1;
  let snappedXLine: number | null = null;
  let snappedXCandidate: { y: number; height: number } | null = null;

  let bestDy = 0;
  let bestYDist = threshold + 1;
  let snappedYLine: number | null = null;
  let snappedYCandidate: { x: number; width: number } | null = null;

  const movingXEdges = [
    movingBox.x,
    movingBox.x + movingBox.width / 2,
    movingBox.x + movingBox.width,
  ];
  const movingYEdges = [
    movingBox.y,
    movingBox.y + movingBox.height / 2,
    movingBox.y + movingBox.height,
  ];

  for (const cand of candidates) {
    const candXEdges = [
      cand.x,
      cand.x + cand.width / 2,
      cand.x + cand.width,
    ];
    for (const mx of movingXEdges) {
      for (const cx of candXEdges) {
        const dist = Math.abs(cx - mx);
        if (dist <= threshold && dist < bestXDist) {
          bestXDist = dist;
          bestDx = cx - mx;
          snappedXLine = cx;
          snappedXCandidate = { y: cand.y, height: cand.height };
        }
      }
    }

    const candYEdges = [
      cand.y,
      cand.y + cand.height / 2,
      cand.y + cand.height,
    ];
    for (const my of movingYEdges) {
      for (const cy of candYEdges) {
        const dist = Math.abs(cy - my);
        if (dist <= threshold && dist < bestYDist) {
          bestYDist = dist;
          bestDy = cy - my;
          snappedYLine = cy;
          snappedYCandidate = { x: cand.x, width: cand.width };
        }
      }
    }
  }

  const guides: AlignmentGuide[] = [];
  if (snappedXLine !== null && snappedXCandidate !== null) {
    const ny = movingBox.y + bestDy;
    const minY = Math.min(movingBox.y, ny, snappedXCandidate.y) - 16;
    const maxY =
      Math.max(
        movingBox.y + movingBox.height,
        ny + movingBox.height,
        snappedXCandidate.y + snappedXCandidate.height
      ) + 16;
    guides.push({
      axis: 'x',
      position: snappedXLine,
      start: minY,
      end: maxY,
    });
  }

  if (snappedYLine !== null && snappedYCandidate !== null) {
    const nx = movingBox.x + bestDx;
    const minX = Math.min(movingBox.x, nx, snappedYCandidate.x) - 16;
    const maxX =
      Math.max(
        movingBox.x + movingBox.width,
        nx + movingBox.width,
        snappedYCandidate.x + snappedYCandidate.width
      ) + 16;
    guides.push({
      axis: 'y',
      position: snappedYLine,
      start: minX,
      end: maxX,
    });
  }

  return {
    dx: snappedXLine !== null ? bestDx : 0,
    dy: snappedYLine !== null ? bestDy : 0,
    guides,
  };
}

export function alignSelectedTables(
  selectedKeys: string[],
  positions: Record<string, TablePosition>,
  rectsByKey: Map<string, TableRect>,
  mode: AlignMode
): Record<string, TablePosition> {
  const items = selectedKeys
    .map((key) => {
      const rect = rectsByKey.get(key);
      const pos = positions[key] || (rect ? { x: rect.x, y: rect.y } : null);
      if (!rect || !pos) return null;
      return {
        key,
        x: pos.x,
        y: pos.y,
        width: rect.width,
        height: rect.height,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (items.length < 2) return positions;
  if ((mode === 'distribute-h' || mode === 'distribute-v') && items.length < 3) {
    return positions;
  }

  const next = { ...positions };
  const minX = Math.min(...items.map((i) => i.x));
  const maxRight = Math.max(...items.map((i) => i.x + i.width));
  const minY = Math.min(...items.map((i) => i.y));
  const maxBottom = Math.max(...items.map((i) => i.y + i.height));

  switch (mode) {
    case 'left': {
      for (const item of items) {
        next[item.key] = { x: Math.round(minX), y: item.y };
      }
      break;
    }
    case 'center': {
      const targetCenter = (minX + maxRight) / 2;
      for (const item of items) {
        next[item.key] = {
          x: Math.round(targetCenter - item.width / 2),
          y: item.y,
        };
      }
      break;
    }
    case 'right': {
      for (const item of items) {
        next[item.key] = {
          x: Math.round(maxRight - item.width),
          y: item.y,
        };
      }
      break;
    }
    case 'top': {
      for (const item of items) {
        next[item.key] = { x: item.x, y: Math.round(minY) };
      }
      break;
    }
    case 'middle': {
      const targetMiddle = (minY + maxBottom) / 2;
      for (const item of items) {
        next[item.key] = {
          x: item.x,
          y: Math.round(targetMiddle - item.height / 2),
        };
      }
      break;
    }
    case 'bottom': {
      for (const item of items) {
        next[item.key] = {
          x: item.x,
          y: Math.round(maxBottom - item.height),
        };
      }
      break;
    }
    case 'distribute-h': {
      const sorted = [...items].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalWidth = sorted.reduce((sum, i) => sum + i.width, 0);
      const span = last.x + last.width - first.x;
      const gap = (span - totalWidth) / (sorted.length - 1);
      let cursorX = first.x + first.width + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const item = sorted[i];
        next[item.key] = { x: Math.round(cursorX), y: item.y };
        cursorX += item.width + gap;
      }
      break;
    }
    case 'distribute-v': {
      const sorted = [...items].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalHeight = sorted.reduce((sum, i) => sum + i.height, 0);
      const span = last.y + last.height - first.y;
      const gap = (span - totalHeight) / (sorted.length - 1);
      let cursorY = first.y + first.height + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        const item = sorted[i];
        next[item.key] = { x: item.x, y: Math.round(cursorY) };
        cursorY += item.height + gap;
      }
      break;
    }
  }

  return next;
}

export function getVisibleColumnsForTable(
  table: TableDef,
  detailLevel: DetailLevel,
  fkSet?: Set<string>
) {
  if (detailLevel === 'names') return [];
  if (detailLevel === 'keys') {
    return table.columns.filter(
      (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
    );
  }
  return table.columns;
}

export function getColumnPortWorldPosition(
  table: TableDef,
  pos: TablePosition,
  colName: string,
  side: 'left' | 'right',
  detailLevel: DetailLevel,
  fkSet?: Set<string>
): { x: number; y: number } {
  const rowH = detailLevel === 'full' ? 30 : 26;
  const cols = getVisibleColumnsForTable(table, detailLevel, fkSet);
  const idx = cols.findIndex((c) => c.name === colName);
  const y = idx >= 0 ? pos.y + 40 + idx * rowH + rowH / 2 : pos.y + 20;
  const x = side === 'right' ? pos.x + TABLE_WIDTH : pos.x;
  return { x, y };
}

export function hitTestColumnAtWorldPoint(
  wx: number,
  wy: number,
  instances: TableInstance[],
  positions: Record<string, TablePosition>,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
): { posKey: string; tableId: string; columnName: string; x: number; y: number; side: 'left' | 'right' } | null {
  if (detailLevel === 'names') return null;
  const rowH = detailLevel === 'full' ? 30 : 26;

  // Iterate reverse so topmost rendered card wins if cards overlap
  for (let i = instances.length - 1; i >= 0; i--) {
    const inst = instances[i];
    const pos = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
    // Allow generous horizontal hit padding (+/- 10px) around card sides for easy handle dropping
    if (wx < pos.x - 10 || wx > pos.x + TABLE_WIDTH + 10) continue;

    const fkSet = fkColsByTable.get(inst.table.id);
    const visibleCols = getVisibleColumnsForTable(inst.table, detailLevel, fkSet);
    const colsTop = pos.y + 40;
    const colsBottom = colsTop + visibleCols.length * rowH;
    if (wy < colsTop || wy >= colsBottom) continue;

    const colIdx = Math.floor((wy - colsTop) / rowH);
    const col = visibleCols[colIdx];
    if (!col) continue;

    const centerX = pos.x + TABLE_WIDTH / 2;
    const side: 'left' | 'right' = wx >= centerX ? 'right' : 'left';
    return {
      posKey: inst.posKey,
      tableId: inst.table.id,
      columnName: col.name,
      x: side === 'right' ? pos.x + TABLE_WIDTH : pos.x,
      y: colsTop + colIdx * rowH + rowH / 2,
      side,
    };
  }

  return null;
}
