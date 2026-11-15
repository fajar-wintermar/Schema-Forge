import {
  DetailLevel,
  ParsedSchema,
  TableDef,
  TablePosition,
} from '../types/schema';

export const TABLE_WIDTH = 276;

export function estimateTableHeight(
  table: TableDef,
  detailLevel: DetailLevel
): number {
  const headerHeight = 40;
  if (detailLevel === 'names') {
    return headerHeight + (table.note ? 24 : 8);
  }
  const visibleCols =
    detailLevel === 'keys'
      ? table.columns.filter((c) => c.pk || c.unique || isFkCol(table, c))
      : table.columns;
  const rowHeight = detailLevel === 'full' ? 30 : 26;
  const colsCount = Math.max(visibleCols.length, 1);
  const noteExtra =
    detailLevel === 'full' && table.note ? 28 : 0;
  const idxExtra =
    detailLevel === 'full' && table.indexes.length > 0 ? 22 : 0;
  return headerHeight + colsCount * rowHeight + noteExtra + idxExtra + 10;
}

function isFkCol(table: TableDef, col: { name: string }): boolean {
  return col.name.endsWith('_id');
}

export function getTableHeight(
  table: TableDef,
  detailLevel: DetailLevel,
  refsFromTable?: Set<string>
): number {
  const headerHeight = 40;
  if (detailLevel === 'names') {
    return headerHeight + 8;
  }
  let cols = table.columns;
  if (detailLevel === 'keys') {
    cols = table.columns.filter(
      (c) => c.pk || c.unique || (refsFromTable ? refsFromTable.has(c.name) : false)
    );
  }
  const rowHeight = detailLevel === 'full' ? 30 : 26;
  const rows = Math.max(cols.length, detailLevel === 'keys' ? 1 : 0);
  const noteExtra = detailLevel === 'full' && table.note ? 30 : 0;
  const idxExtra = detailLevel === 'full' && table.indexes.length > 0 ? 24 : 0;
  return headerHeight + rows * rowHeight + noteExtra + idxExtra + 10;
}

interface BoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupBoundingBox {
  id: string;
  name: string;
  color?: string;
  note?: string;
  tables: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeGroupBoundingBoxes(
  schema: ParsedSchema,
  positions: Record<string, TablePosition>,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
): GroupBoundingBox[] {
  const tableMap = new Map(schema.tables.map((t) => [t.id, t]));
  const boxes: GroupBoundingBox[] = [];
  const padX = 24;
  const padTop = 58;
  const padBottom = 24;

  for (const group of schema.tableGroups) {
    const validTables = group.tables
      .map((id) => tableMap.get(id))
      .filter((t): t is TableDef => Boolean(t));

    if (validTables.length === 0) {
      continue;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const t of validTables) {
      const pos = positions[t.id] || { x: 0, y: 0 };
      const h = getTableHeight(t, detailLevel, fkColsByTable.get(t.id));
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
      maxY = Math.max(maxY, pos.y + h);
    }

    boxes.push({
      id: group.id,
      name: group.name,
      color: group.color,
      note: group.note,
      tables: validTables.map((t) => t.id),
      x: minX - padX,
      y: minY - padTop,
      width: maxX - minX + padX * 2,
      height: maxY - minY + padTop + padBottom,
    });
  }

  return boxes;
}

/**
 * Sugiyama-inspired layered ordering + barycenter crossing minimization
 * for a subset of tables, returning relative coordinates inside a container.
 */
function layoutTableSubset(
  subsetTables: TableDef[],
  schema: ParsedSchema,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
): { relPositions: Record<string, TablePosition>; width: number; height: number } {
  if (subsetTables.length === 0) {
    return { relPositions: {}, width: TABLE_WIDTH, height: 120 };
  }

  const subsetIds = new Set(subsetTables.map((t) => t.id));
  const tableMap = new Map(subsetTables.map((t) => [t.id, t]));

  // Build directed adjacency (referenced parent -> dependent child) & undirected neighbors
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();

  for (const t of subsetTables) {
    outgoing.set(t.id, new Set());
    incoming.set(t.id, new Set());
    neighbors.set(t.id, new Set());
  }

  for (const r of schema.refs) {
    if (!subsetIds.has(r.fromTable) || !subsetIds.has(r.toTable)) continue;
    if (r.fromTable === r.toTable) continue;

    let parent = r.toTable;
    let child = r.fromTable;
    if (r.relation === '<') {
      parent = r.fromTable;
      child = r.toTable;
    }

    outgoing.get(parent)?.add(child);
    incoming.get(child)?.add(parent);
    neighbors.get(parent)?.add(child);
    neighbors.get(child)?.add(parent);
  }

  // Assign layers using longest path from sources (cycle-safe)
  const layer = new Map<string, number>();
  const visiting = new Set<string>();

  function getLayer(id: string): number {
    if (layer.has(id)) return layer.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let maxParent = -1;
    for (const p of incoming.get(id) || []) {
      maxParent = Math.max(maxParent, getLayer(p));
    }
    visiting.delete(id);
    const l = maxParent + 1;
    layer.set(id, l);
    return l;
  }

  for (const t of subsetTables) {
    getLayer(t.id);
  }

  // Group by layer; if too flat (all in 1 layer with >3 tables), wrap into neat columns
  const layersMap = new Map<number, string[]>();
  for (const t of subsetTables) {
    const l = layer.get(t.id) || 0;
    if (!layersMap.has(l)) layersMap.set(l, []);
    layersMap.get(l)!.push(t.id);
  }

  let layerKeys = Array.from(layersMap.keys()).sort((a, b) => a - b);

  // If a single layer has more than 3 tables, fold into 2 columns to keep group compact
  if (layerKeys.length === 1 && subsetTables.length > 3) {
    const all = layersMap.get(layerKeys[0])!;
    layersMap.clear();
    const cols = Math.min(3, Math.ceil(Math.sqrt(all.length)));
    all.forEach((id, idx) => {
      const col = idx % cols;
      if (!layersMap.has(col)) layersMap.set(col, []);
      layersMap.get(col)!.push(id);
    });
    layerKeys = Array.from(layersMap.keys()).sort((a, b) => a - b);
  }

  // Barycenter heuristic sweeps to minimize edge crossings between layers
  const posInLayer = new Map<string, number>();
  const refreshPos = () => {
    for (const lk of layerKeys) {
      (layersMap.get(lk) || []).forEach((id, idx) => posInLayer.set(id, idx));
    }
  };
  refreshPos();

  for (let sweep = 0; sweep < 4; sweep++) {
    // Forward sweep
    for (let li = 1; li < layerKeys.length; li++) {
      const lk = layerKeys[li];
      const nodes = layersMap.get(lk)!;
      nodes.sort((a, b) => {
        const ba = computeBarycenter(a, incoming.get(a), posInLayer);
        const bb = computeBarycenter(b, incoming.get(b), posInLayer);
        if (ba !== bb) return ba - bb;
        return (neighbors.get(b)?.size || 0) - (neighbors.get(a)?.size || 0);
      });
      refreshPos();
    }
    // Backward sweep
    for (let li = layerKeys.length - 2; li >= 0; li--) {
      const lk = layerKeys[li];
      const nodes = layersMap.get(lk)!;
      nodes.sort((a, b) => {
        const ba = computeBarycenter(a, outgoing.get(a), posInLayer);
        const bb = computeBarycenter(b, outgoing.get(b), posInLayer);
        if (ba !== bb) return ba - bb;
        return (neighbors.get(b)?.size || 0) - (neighbors.get(a)?.size || 0);
      });
      refreshPos();
    }
  }

  // Assign coordinates within group
  const gapX = 64;
  const gapY = 34;
  const relPositions: Record<string, TablePosition> = {};

  let curX = 0;
  let maxLayerHeight = 0;

  for (const lk of layerKeys) {
    const ids = layersMap.get(lk) || [];
    let curY = 0;
    for (const id of ids) {
      const t = tableMap.get(id)!;
      const h = getTableHeight(t, detailLevel, fkColsByTable.get(id));
      relPositions[id] = { x: curX, y: curY };
      curY += h + gapY;
    }
    maxLayerHeight = Math.max(maxLayerHeight, curY - gapY);
    curX += TABLE_WIDTH + gapX;
  }

  // Vertically center shorter columns relative to tallest column in the group
  for (const lk of layerKeys) {
    const ids = layersMap.get(lk) || [];
    if (ids.length === 0) continue;
    const lastId = ids[ids.length - 1];
    const lastT = tableMap.get(lastId)!;
    const colH =
      relPositions[lastId].y +
      getTableHeight(lastT, detailLevel, fkColsByTable.get(lastId));
    const offset = Math.max(0, (maxLayerHeight - colH) / 2);
    if (offset > 12) {
      for (const id of ids) {
        relPositions[id].y += Math.round(offset);
      }
    }
  }

  return {
    relPositions,
    width: Math.max(TABLE_WIDTH, curX - gapX),
    height: Math.max(80, maxLayerHeight),
  };
}

function computeBarycenter(
  nodeId: string,
  related: Set<string> | undefined,
  posMap: Map<string, number>
): number {
  if (!related || related.size === 0) return posMap.get(nodeId) ?? 0;
  let sum = 0;
  let count = 0;
  for (const r of related) {
    const p = posMap.get(r);
    if (p !== undefined) {
      sum += p;
      count++;
    }
  }
  return count > 0 ? sum / count : posMap.get(nodeId) ?? 0;
}

/**
 * Group-aware intelligent auto-layout:
 * 1. Arranges tables inside each TableGroup using crossing minimization.
 * 2. Builds an inter-group dependency graph and orders TableGroups via
 *    topological layering + barycenter sweeps to minimize cross-domain edge overlaps.
 * 3. Packs TableGroups cleanly in 2D space with zero box overlaps, and places
 *    ungrouped tables neatly in an adjacent region.
 */
export function computeAutoLayout(
  schema: ParsedSchema,
  detailLevel: DetailLevel
): Record<string, TablePosition> {
  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
  }

  const tableMap = new Map(schema.tables.map((t) => [t.id, t]));
  const tableToGroup = new Map<string, string>();

  // Layout each group internally first
  interface GroupLayout {
    id: string;
    relPositions: Record<string, TablePosition>;
    boxWidth: number;
    boxHeight: number;
    tableIds: string[];
  }

  const padX = 24;
  const padTop = 58;
  const padBottom = 24;

  const groupLayouts: GroupLayout[] = [];

  for (const group of schema.tableGroups) {
    const memberTables = group.tables
      .map((id) => tableMap.get(id))
      .filter((t): t is TableDef => Boolean(t));
    if (memberTables.length === 0) continue;

    for (const t of memberTables) {
      tableToGroup.set(t.id, group.id);
    }

    const inner = layoutTableSubset(
      memberTables,
      schema,
      detailLevel,
      fkColsByTable
    );

    groupLayouts.push({
      id: group.id,
      relPositions: inner.relPositions,
      boxWidth: inner.width + padX * 2,
      boxHeight: inner.height + padTop + padBottom,
      tableIds: memberTables.map((t) => t.id),
    });
  }

  // Ungrouped tables
  const ungroupedTables = schema.tables.filter((t) => !tableToGroup.has(t.id));
  const UNGROUPED_ID = '__ungrouped__';
  if (ungroupedTables.length > 0) {
    const inner = layoutTableSubset(
      ungroupedTables,
      schema,
      detailLevel,
      fkColsByTable
    );
    groupLayouts.push({
      id: UNGROUPED_ID,
      relPositions: inner.relPositions,
      boxWidth: inner.width + padX * 2,
      boxHeight: inner.height + padTop + padBottom,
      tableIds: ungroupedTables.map((t) => t.id),
    });
    for (const t of ungroupedTables) {
      tableToGroup.set(t.id, UNGROUPED_ID);
    }
  }

  // Build inter-group dependency graph to order groups cleanly
  const groupOut = new Map<string, Set<string>>();
  const groupIn = new Map<string, Set<string>>();
  const groupEdgeWeight = new Map<string, number>();

  for (const g of groupLayouts) {
    groupOut.set(g.id, new Set());
    groupIn.set(g.id, new Set());
  }

  for (const r of schema.refs) {
    const gFrom = tableToGroup.get(r.fromTable);
    const gTo = tableToGroup.get(r.toTable);
    if (!gFrom || !gTo || gFrom === gTo) continue;

    let parentG = gTo;
    let childG = gFrom;
    if (r.relation === '<') {
      parentG = gFrom;
      childG = gTo;
    }

    groupOut.get(parentG)?.add(childG);
    groupIn.get(childG)?.add(parentG);
    const key = `${parentG}->${childG}`;
    groupEdgeWeight.set(key, (groupEdgeWeight.get(key) || 0) + 1);
  }

  // Order groups so heavily connected groups sit adjacent in a 2-column or layered grid
  const orderedGroups: GroupLayout[] = [];
  const remaining = new Set(groupLayouts.map((g) => g.id));
  const layoutById = new Map(groupLayouts.map((g) => [g.id, g]));

  // Start with the group that has highest out-degree (foundational domain like Identity/Catalog)
  while (remaining.size > 0) {
    let bestId: string | null = null;
    if (orderedGroups.length === 0) {
      let bestScore = -Infinity;
      for (const id of remaining) {
        if (id === UNGROUPED_ID && remaining.size > 1) continue;
        const score =
          (groupOut.get(id)?.size || 0) * 2 - (groupIn.get(id)?.size || 0);
        if (score > bestScore) {
          bestScore = score;
          bestId = id;
        }
      }
    } else {
      // Pick remaining group with strongest edge weight to already placed groups
      let bestScore = -Infinity;
      for (const id of remaining) {
        if (id === UNGROUPED_ID && remaining.size > 1) continue;
        let conn = 0;
        for (const placed of orderedGroups) {
          conn += groupEdgeWeight.get(`${placed.id}->${id}`) || 0;
          conn += groupEdgeWeight.get(`${id}->${placed.id}`) || 0;
        }
        if (conn > bestScore) {
          bestScore = conn;
          bestId = id;
        }
      }
    }

    if (!bestId) bestId = Array.from(remaining)[0];
    remaining.delete(bestId);
    orderedGroups.push(layoutById.get(bestId)!);
  }

  // Arrange ordered groups into a balanced 2D grid (2 columns for 2-6 groups, 3 columns for 7+)
  const cols = orderedGroups.length <= 1 ? 1 : orderedGroups.length <= 6 ? 2 : 3;
  const groupGapX = 96;
  const groupGapY = 84;
  const startX = 80;
  const startY = 80;

  const colWidths = new Array(cols).fill(0);
  const rowsCount = Math.ceil(orderedGroups.length / cols);
  const rowHeights = new Array(rowsCount).fill(0);

  orderedGroups.forEach((g, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    colWidths[c] = Math.max(colWidths[c], g.boxWidth);
    rowHeights[r] = Math.max(rowHeights[r], g.boxHeight);
  });

  const colX = new Array(cols).fill(startX);
  for (let c = 1; c < cols; c++) {
    colX[c] = colX[c - 1] + colWidths[c - 1] + groupGapX;
  }

  const rowY = new Array(rowsCount).fill(startY);
  for (let r = 1; r < rowsCount; r++) {
    rowY[r] = rowY[r - 1] + rowHeights[r - 1] + groupGapY;
  }

  const finalPositions: Record<string, TablePosition> = {};

  orderedGroups.forEach((g, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const originX = colX[c] + padX;
    const originY = rowY[r] + padTop;

    for (const tableId of g.tableIds) {
      const rel = g.relPositions[tableId] || { x: 0, y: 0 };
      finalPositions[tableId] = {
        x: Math.round(originX + rel.x),
        y: Math.round(originY + rel.y),
      };
    }
  });

  return finalPositions;
}

export function autoLayoutSingleGroup(
  groupName: string,
  schema: ParsedSchema,
  currentPositions: Record<string, TablePosition>,
  detailLevel: DetailLevel
): Record<string, TablePosition> {
  const group = schema.tableGroups.find((g) => g.name === groupName);
  if (!group) return currentPositions;

  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
  }

  const tableMap = new Map(schema.tables.map((t) => [t.id, t]));
  const memberTables = group.tables
    .map((id) => tableMap.get(id))
    .filter((t): t is TableDef => Boolean(t));

  if (memberTables.length === 0) return currentPositions;

  // Anchor at current group's top-left
  let anchorX = Infinity;
  let anchorY = Infinity;
  for (const t of memberTables) {
    const p = currentPositions[t.id];
    if (p) {
      anchorX = Math.min(anchorX, p.x);
      anchorY = Math.min(anchorY, p.y);
    }
  }
  if (!isFinite(anchorX)) anchorX = 100;
  if (!isFinite(anchorY)) anchorY = 120;

  const inner = layoutTableSubset(
    memberTables,
    schema,
    detailLevel,
    fkColsByTable
  );

  const next = { ...currentPositions };
  for (const t of memberTables) {
    const rel = inner.relPositions[t.id] || { x: 0, y: 0 };
    next[t.id] = {
      x: Math.round(anchorX + rel.x),
      y: Math.round(anchorY + rel.y),
    };
  }
  return next;
}
