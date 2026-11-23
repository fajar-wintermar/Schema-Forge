import {
  DetailLevel,
  ParsedSchema,
  RefDef,
  TableDef,
  TablePosition,
} from '../types/schema';

export const TABLE_WIDTH = 276;

export function getTableHeight(
  table: TableDef,
  detailLevel: DetailLevel,
  refsFromTable?: Set<string>,
  isShared?: boolean
): number {
  const headerHeight = 40;
  const sharedFooter = isShared ? 22 : 0;
  if (detailLevel === 'names') {
    return headerHeight + sharedFooter + 8;
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
  const idxExtra =
    detailLevel === 'full' &&
    !table.note &&
    (table.indexes.length > 0 || table.checks.length > 0)
      ? 24
      : detailLevel === 'full' && table.note && table.checks.length > 0
      ? 0
      : 0;
  return headerHeight + rows * rowHeight + noteExtra + idxExtra + sharedFooter + 10;
}

export interface TableInstance {
  posKey: string;
  table: TableDef;
  groupName: string | null;
  isPrimary: boolean;
  sharedGroups: string[];
}

export interface ResolvedEdge {
  id: string;
  ref: RefDef;
  fromInst: TableInstance;
  toInst: TableInstance;
}

export function buildTableInstances(schema: ParsedSchema): {
  instances: TableInstance[];
  groupsByTable: Map<string, string[]>;
  primaryGroupByTable: Map<string, string>;
  instanceByGroupAndTable: Map<string, TableInstance>;
} {
  const tableMap = new Map(schema.tables.map((t) => [t.id, t]));
  const groupsByTable = new Map<string, string[]>();
  const primaryGroupByTable = new Map<string, string>();

  for (const g of schema.tableGroups) {
    const seenInGroup = new Set<string>();
    for (const tId of g.tables) {
      if (!tableMap.has(tId) || seenInGroup.has(tId)) continue;
      seenInGroup.add(tId);
      if (!groupsByTable.has(tId)) groupsByTable.set(tId, []);
      groupsByTable.get(tId)!.push(g.name);
      if (!primaryGroupByTable.has(tId)) {
        primaryGroupByTable.set(tId, g.name);
      }
    }
  }

  const instances: TableInstance[] = [];
  const instanceByGroupAndTable = new Map<string, TableInstance>();

  for (const g of schema.tableGroups) {
    const seenInGroup = new Set<string>();
    for (const tId of g.tables) {
      const table = tableMap.get(tId);
      if (!table || seenInGroup.has(tId)) continue;
      seenInGroup.add(tId);
      const isPrimary = primaryGroupByTable.get(tId) === g.name;
      const posKey = isPrimary ? tId : `${g.name}::${tId}`;
      const inst: TableInstance = {
        posKey,
        table,
        groupName: g.name,
        isPrimary,
        sharedGroups: groupsByTable.get(tId) || [g.name],
      };
      instances.push(inst);
      instanceByGroupAndTable.set(`${g.name}::${tId}`, inst);
    }
  }

  // Ungrouped tables
  for (const t of schema.tables) {
    if (!groupsByTable.has(t.id)) {
      const inst: TableInstance = {
        posKey: t.id,
        table: t,
        groupName: null,
        isPrimary: true,
        sharedGroups: [],
      };
      instances.push(inst);
      instanceByGroupAndTable.set(`__ungrouped__::${t.id}`, inst);
    }
  }

  return {
    instances,
    groupsByTable,
    primaryGroupByTable,
    instanceByGroupAndTable,
  };
}

export function resolveSchemaEdges(
  schema: ParsedSchema,
  instances: TableInstance[],
  positions: Record<string, TablePosition>
): ResolvedEdge[] {
  const byTable = new Map<string, TableInstance[]>();
  for (const inst of instances) {
    if (!byTable.has(inst.table.id)) byTable.set(inst.table.id, []);
    byTable.get(inst.table.id)!.push(inst);
  }

  const edges: ResolvedEdge[] = [];

  for (const r of schema.refs) {
    const fromList = byTable.get(r.fromTable) || [];
    const toList = byTable.get(r.toTable) || [];
    if (fromList.length === 0 || toList.length === 0) continue;

    // Self-reference: connect each instance to itself
    if (r.fromTable === r.toTable) {
      fromList.forEach((inst, idx) => {
        edges.push({
          id: `${r.id}__self_${idx}`,
          ref: r,
          fromInst: inst,
          toInst: inst,
        });
      });
      continue;
    }

    // 1. Prefer same-group connections so shared tables connect locally inside each domain
    const sameGroupPairs: Array<{ f: TableInstance; t: TableInstance }> = [];
    for (const f of fromList) {
      for (const t of toList) {
        if (f.groupName && f.groupName === t.groupName) {
          sameGroupPairs.push({ f, t });
        }
      }
    }

    if (sameGroupPairs.length > 0) {
      sameGroupPairs.forEach((pair, idx) => {
        edges.push({
          id: `${r.id}__g_${idx}`,
          ref: r,
          fromInst: pair.f,
          toInst: pair.t,
        });
      });
      continue;
    }

    // 2. Otherwise connect the closest pair of instances geometrically
    let bestF = fromList[0];
    let bestT = toList[0];
    let bestDist = Infinity;
    for (const f of fromList) {
      const pf = positions[f.posKey] || { x: 0, y: 0 };
      for (const t of toList) {
        const pt = positions[t.posKey] || { x: 0, y: 0 };
        const dist = Math.hypot(pf.x - pt.x, pf.y - pt.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestF = f;
          bestT = t;
        }
      }
    }

    edges.push({
      id: r.id,
      ref: r,
      fromInst: bestF,
      toInst: bestT,
    });
  }

  return edges;
}

export interface GroupBoundingBox {
  id: string;
  name: string;
  color?: string;
  note?: string;
  tables: string[];
  posKeys: string[];
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
  const { instances } = buildTableInstances(schema);
  const byGroup = new Map<string, TableInstance[]>();
  for (const inst of instances) {
    if (!inst.groupName) continue;
    if (!byGroup.has(inst.groupName)) byGroup.set(inst.groupName, []);
    byGroup.get(inst.groupName)!.push(inst);
  }

  const boxes: GroupBoundingBox[] = [];
  const padX = 24;
  const padTop = 58;
  const padBottom = 24;

  for (const group of schema.tableGroups) {
    const groupInstances = byGroup.get(group.name) || [];
    if (groupInstances.length === 0) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const inst of groupInstances) {
      const pos = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
      const h = getTableHeight(
        inst.table,
        detailLevel,
        fkColsByTable.get(inst.table.id),
        inst.sharedGroups.length > 1
      );
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
      tables: groupInstances.map((i) => i.table.id),
      posKeys: groupInstances.map((i) => i.posKey),
      x: minX - padX,
      y: minY - padTop,
      width: maxX - minX + padX * 2,
      height: maxY - minY + padTop + padBottom,
    });
  }

  return boxes;
}

function layoutInstanceSubset(
  subsetInstances: TableInstance[],
  schema: ParsedSchema,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
): { relPositions: Record<string, TablePosition>; width: number; height: number } {
  if (subsetInstances.length === 0) {
    return { relPositions: {}, width: TABLE_WIDTH, height: 120 };
  }

  const tableToInst = new Map<string, TableInstance>();
  for (const inst of subsetInstances) {
    tableToInst.set(inst.table.id, inst);
  }

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const neighbors = new Map<string, Set<string>>();

  for (const inst of subsetInstances) {
    outgoing.set(inst.posKey, new Set());
    incoming.set(inst.posKey, new Set());
    neighbors.set(inst.posKey, new Set());
  }

  for (const r of schema.refs) {
    const fInst = tableToInst.get(r.fromTable);
    const tInst = tableToInst.get(r.toTable);
    if (!fInst || !tInst || fInst.posKey === tInst.posKey) continue;

    let parent = tInst.posKey;
    let child = fInst.posKey;
    if (r.relation === '<') {
      parent = fInst.posKey;
      child = tInst.posKey;
    }

    outgoing.get(parent)?.add(child);
    incoming.get(child)?.add(parent);
    neighbors.get(parent)?.add(child);
    neighbors.get(child)?.add(parent);
  }

  const layer = new Map<string, number>();
  const visiting = new Set<string>();

  function getLayer(posKey: string): number {
    if (layer.has(posKey)) return layer.get(posKey)!;
    if (visiting.has(posKey)) return 0;
    visiting.add(posKey);
    let maxParent = -1;
    for (const p of incoming.get(posKey) || []) {
      maxParent = Math.max(maxParent, getLayer(p));
    }
    visiting.delete(posKey);
    const l = maxParent + 1;
    layer.set(posKey, l);
    return l;
  }

  for (const inst of subsetInstances) {
    getLayer(inst.posKey);
  }

  const layersMap = new Map<number, string[]>();
  for (const inst of subsetInstances) {
    const l = layer.get(inst.posKey) || 0;
    if (!layersMap.has(l)) layersMap.set(l, []);
    layersMap.get(l)!.push(inst.posKey);
  }

  let layerKeys = Array.from(layersMap.keys()).sort((a, b) => a - b);

  if (layerKeys.length === 1 && subsetInstances.length > 3) {
    const all = layersMap.get(layerKeys[0])!;
    layersMap.clear();
    const maxCols = all.length > 24 ? 6 : all.length > 9 ? 4 : 3;
    const cols = Math.min(maxCols, Math.ceil(Math.sqrt(all.length)));
    all.forEach((pk, idx) => {
      const col = idx % cols;
      if (!layersMap.has(col)) layersMap.set(col, []);
      layersMap.get(col)!.push(pk);
    });
    layerKeys = Array.from(layersMap.keys()).sort((a, b) => a - b);
  }

  const posInLayer = new Map<string, number>();
  const refreshPos = () => {
    for (const lk of layerKeys) {
      (layersMap.get(lk) || []).forEach((id, idx) => posInLayer.set(id, idx));
    }
  };
  refreshPos();

  for (let sweep = 0; sweep < 4; sweep++) {
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

  const instMap = new Map(subsetInstances.map((i) => [i.posKey, i]));
  const gapX = 64;
  const gapY = 34;
  const relPositions: Record<string, TablePosition> = {};

  let curX = 0;
  let maxLayerHeight = 0;

  for (const lk of layerKeys) {
    const ids = layersMap.get(lk) || [];
    let curY = 0;
    for (const pk of ids) {
      const inst = instMap.get(pk)!;
      const h = getTableHeight(
        inst.table,
        detailLevel,
        fkColsByTable.get(inst.table.id),
        inst.sharedGroups.length > 1
      );
      relPositions[pk] = { x: curX, y: curY };
      curY += h + gapY;
    }
    maxLayerHeight = Math.max(maxLayerHeight, curY - gapY);
    curX += TABLE_WIDTH + gapX;
  }

  for (const lk of layerKeys) {
    const ids = layersMap.get(lk) || [];
    if (ids.length === 0) continue;
    const lastPk = ids[ids.length - 1];
    const lastInst = instMap.get(lastPk)!;
    const colH =
      relPositions[lastPk].y +
      getTableHeight(
        lastInst.table,
        detailLevel,
        fkColsByTable.get(lastInst.table.id),
        lastInst.sharedGroups.length > 1
      );
    const offset = Math.max(0, (maxLayerHeight - colH) / 2);
    if (offset > 12) {
      for (const pk of ids) {
        relPositions[pk].y += Math.round(offset);
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

export function computeAutoLayout(
  schema: ParsedSchema,
  detailLevel: DetailLevel
): Record<string, TablePosition> {
  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
    if (!fkColsByTable.has(r.toTable)) fkColsByTable.set(r.toTable, new Set());
    for (const c of r.toColumns) fkColsByTable.get(r.toTable)!.add(c);
  }

  const { instances, groupsByTable } = buildTableInstances(schema);
  const byGroup = new Map<string, TableInstance[]>();
  const UNGROUPED_ID = '__ungrouped__';

  for (const inst of instances) {
    const key = inst.groupName || UNGROUPED_ID;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(inst);
  }

  interface GroupLayout {
    id: string;
    relPositions: Record<string, TablePosition>;
    boxWidth: number;
    boxHeight: number;
    posKeys: string[];
  }

  const padX = 24;
  const padTop = 58;
  const padBottom = 24;
  const groupLayouts: GroupLayout[] = [];

  for (const group of schema.tableGroups) {
    const subset = byGroup.get(group.name) || [];
    if (subset.length === 0) continue;
    const inner = layoutInstanceSubset(subset, schema, detailLevel, fkColsByTable);
    groupLayouts.push({
      id: group.id,
      relPositions: inner.relPositions,
      boxWidth: inner.width + padX * 2,
      boxHeight: inner.height + padTop + padBottom,
      posKeys: subset.map((i) => i.posKey),
    });
  }

  const ungrouped = byGroup.get(UNGROUPED_ID) || [];
  if (ungrouped.length > 0) {
    const inner = layoutInstanceSubset(ungrouped, schema, detailLevel, fkColsByTable);
    groupLayouts.push({
      id: UNGROUPED_ID,
      relPositions: inner.relPositions,
      boxWidth: inner.width + padX * 2,
      boxHeight: inner.height + padTop + padBottom,
      posKeys: ungrouped.map((i) => i.posKey),
    });
  }

  const groupOut = new Map<string, Set<string>>();
  const groupIn = new Map<string, Set<string>>();
  const groupEdgeWeight = new Map<string, number>();

  for (const g of groupLayouts) {
    groupOut.set(g.id, new Set());
    groupIn.set(g.id, new Set());
  }

  for (const r of schema.refs) {
    const gFromList = groupsByTable.get(r.fromTable) || [UNGROUPED_ID];
    const gToList = groupsByTable.get(r.toTable) || [UNGROUPED_ID];
    for (const gFrom of gFromList) {
      for (const gTo of gToList) {
        if (gFrom === gTo) continue;
        const parentG = r.relation === '<' ? gFrom : gTo;
        const childG = r.relation === '<' ? gTo : gFrom;
        groupOut.get(parentG)?.add(childG);
        groupIn.get(childG)?.add(parentG);
        const key = `${parentG}->${childG}`;
        groupEdgeWeight.set(key, (groupEdgeWeight.get(key) || 0) + 1);
      }
    }
  }

  const orderedGroups: GroupLayout[] = [];
  const remaining = new Set(groupLayouts.map((g) => g.id));
  const layoutById = new Map(groupLayouts.map((g) => [g.id, g]));

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

  const cols =
    orderedGroups.length <= 1
      ? 1
      : orderedGroups.length <= 6
      ? 2
      : orderedGroups.length <= 12
      ? 3
      : 4;
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

    for (const pk of g.posKeys) {
      const rel = g.relPositions[pk] || { x: 0, y: 0 };
      finalPositions[pk] = {
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
  const { instances } = buildTableInstances(schema);
  const subset =
    groupName === '__ungrouped__'
      ? instances.filter((i) => i.groupName === null)
      : instances.filter((i) => i.groupName === groupName);
  if (subset.length === 0) return currentPositions;

  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of schema.refs) {
    if (!fkColsByTable.has(r.fromTable)) fkColsByTable.set(r.fromTable, new Set());
    for (const c of r.fromColumns) fkColsByTable.get(r.fromTable)!.add(c);
    if (!fkColsByTable.has(r.toTable)) fkColsByTable.set(r.toTable, new Set());
    for (const c of r.toColumns) fkColsByTable.get(r.toTable)!.add(c);
  }

  let anchorX = Infinity;
  let anchorY = Infinity;
  for (const inst of subset) {
    const p = currentPositions[inst.posKey] || currentPositions[inst.table.id];
    if (p) {
      anchorX = Math.min(anchorX, p.x);
      anchorY = Math.min(anchorY, p.y);
    }
  }
  if (!isFinite(anchorX)) anchorX = 100;
  if (!isFinite(anchorY)) anchorY = 120;

  const inner = layoutInstanceSubset(subset, schema, detailLevel, fkColsByTable);

  const next = { ...currentPositions };
  for (const inst of subset) {
    const rel = inner.relPositions[inst.posKey] || { x: 0, y: 0 };
    next[inst.posKey] = {
      x: Math.round(anchorX + rel.x),
      y: Math.round(anchorY + rel.y),
    };
  }
  return next;
}
