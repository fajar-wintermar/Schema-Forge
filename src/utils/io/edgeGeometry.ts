import { DetailLevel, TableGroupDef, TablePosition } from '@shared/domain/schemaTypes';
import {
  getTableHeight,
  GroupBoundingBox,
  ResolvedEdge,
  TABLE_WIDTH,
  TableInstance,
} from '../autoLayout';

export type EdgeRoutingMode = 'bezier' | 'orthogonal';
export type EdgeVisibilityMode = 'show' | 'bundle' | 'hide';

export interface EdgeBundleItem {
  id: string;
  domainA: string;
  domainB: string;
  color: string;
  edges: ResolvedEdge[];
}

export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgeAnchorPoints {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dir1: 1 | -1;
  dir2: 1 | -1;
}

export interface BuiltEdgePath {
  pathD: string;
  midX: number;
  midY: number;
}

export function getEdgeAnchorPoints(
  pA: TablePosition,
  pB: TablePosition,
  y1: number,
  y2: number,
  isSelfRef: boolean,
  widthA = TABLE_WIDTH,
  widthB = TABLE_WIDTH
): EdgeAnchorPoints {
  const aCenter = pA.x + widthA / 2;
  const bCenter = pB.x + widthB / 2;

  if (isSelfRef) {
    return {
      x1: pA.x + widthA,
      y1,
      x2: pA.x + widthA,
      y2,
      dir1: 1,
      dir2: 1,
    };
  }

  if (aCenter > bCenter + 40) {
    return {
      x1: pA.x,
      y1,
      x2: pB.x + widthB,
      y2,
      dir1: -1,
      dir2: 1,
    };
  }

  if (Math.abs(aCenter - bCenter) <= 40) {
    return {
      x1: pA.x + widthA,
      y1,
      x2: pB.x + widthB,
      y2,
      dir1: 1,
      dir2: 1,
    };
  }

  return {
    x1: pA.x + widthA,
    y1,
    x2: pB.x,
    y2,
    dir1: 1,
    dir2: -1,
  };
}

export function getBoxToBoxAnchors(
  boxA: AnchorBox,
  boxB: AnchorBox
): EdgeAnchorPoints {
  const aCenter = boxA.x + boxA.width / 2;
  const bCenter = boxB.x + boxB.width / 2;
  const y1 = boxA.y + boxA.height / 2;
  const y2 = boxB.y + boxB.height / 2;

  // Side-by-side left-to-right
  if (boxA.x + boxA.width < boxB.x - 16) {
    return {
      x1: boxA.x + boxA.width,
      y1,
      x2: boxB.x,
      y2,
      dir1: 1,
      dir2: -1,
    };
  }
  // Side-by-side right-to-left
  if (boxB.x + boxB.width < boxA.x - 16) {
    return {
      x1: boxA.x,
      y1,
      x2: boxB.x + boxB.width,
      y2,
      dir1: -1,
      dir2: 1,
    };
  }

  // Stacked vertically or overlapping horizontally: connect right or left sides cleanly
  if (aCenter <= bCenter) {
    return {
      x1: boxA.x + boxA.width,
      y1,
      x2: boxB.x + boxB.width,
      y2,
      dir1: 1,
      dir2: 1,
    };
  }

  return {
    x1: boxA.x,
    y1,
    x2: boxB.x,
    y2,
    dir1: -1,
    dir2: -1,
  };
}

function buildRoundedOrthoPath(
  points: Array<{ x: number; y: number }>,
  radius = 6
): string {
  if (points.length < 2) return '';
  const cmds: string[] = [`M ${points[0].x} ${points[0].y}`];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 0.5 || len2 < 0.5) {
      cmds.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const r = Math.min(radius, len1 / 2, len2 / 2);
    const sx = curr.x - (dx1 / len1) * r;
    const sy = curr.y - (dy1 / len1) * r;
    const ex = curr.x + (dx2 / len2) * r;
    const ey = curr.y + (dy2 / len2) * r;

    cmds.push(`L ${sx} ${sy} Q ${curr.x} ${curr.y} ${ex} ${ey}`);
  }

  const last = points[points.length - 1];
  cmds.push(`L ${last.x} ${last.y}`);
  return cmds.join(' ');
}

export function buildEdgePath(params: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dir1: 1 | -1;
  dir2: 1 | -1;
  isSelfRef: boolean;
  routing: EdgeRoutingMode;
  laneOffset?: number;
}): BuiltEdgePath {
  const {
    x1,
    y1,
    x2,
    y2,
    dir1,
    dir2,
    isSelfRef,
    routing,
    laneOffset = 0,
  } = params;

  if (routing === 'bezier') {
    const dx = isSelfRef ? 70 : Math.max(54, Math.abs(x2 - x1) * 0.45);
    const cx1 = x1 + dir1 * dx;
    const cx2 = x2 + dir2 * dx;
    const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
    // True cubic Bézier midpoint at t = 0.5
    const midX = (x1 + 3 * cx1 + 3 * cx2 + x2) / 8;
    const midY = (y1 + y2) / 2;
    return { pathD, midX, midY };
  }

  // Orthogonal right-angle routing
  if (isSelfRef) {
    const loopX = Math.max(x1, x2) + 46 + Math.abs(laneOffset);
    const targetY = Math.abs(y2 - y1) < 10 ? y1 + 32 : y2;
    const pts = [
      { x: x1, y: y1 },
      { x: loopX, y: y1 },
      { x: loopX, y: targetY },
      { x: x2, y: targetY },
    ];
    return {
      pathD: buildRoundedOrthoPath(pts),
      midX: loopX,
      midY: (y1 + targetY) / 2,
    };
  }

  // Same-side ports (both exit right or both exit left)
  if (dir1 === dir2) {
    const channelX =
      dir1 === 1
        ? Math.max(x1, x2) + 38 + Math.abs(laneOffset)
        : Math.min(x1, x2) - 38 - Math.abs(laneOffset);
    const pts = [
      { x: x1, y: y1 },
      { x: channelX, y: y1 },
      { x: channelX, y: y2 },
      { x: x2, y: y2 },
    ];
    return {
      pathD: buildRoundedOrthoPath(pts),
      midX: channelX,
      midY: (y1 + y2) / 2,
    };
  }

  // Opposing horizontal ports with clear corridor between x1 and x2
  const clearCorridor =
    (dir1 === 1 && x2 - x1 >= 24) || (dir1 === -1 && x1 - x2 >= 24);
  if (clearCorridor) {
    const rawMidX = (x1 + x2) / 2 + laneOffset;
    const minCorridorX = Math.min(x1, x2) + 12;
    const maxCorridorX = Math.max(x1, x2) - 12;
    const midX = Math.max(minCorridorX, Math.min(maxCorridorX, rawMidX));
    const pts = [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 },
    ];
    return {
      pathD: buildRoundedOrthoPath(pts),
      midX,
      midY: (y1 + y2) / 2,
    };
  }

  // Reversed / tight opposing ports: clean 5-segment Z-detour
  const outX1 = x1 + dir1 * 26;
  const outX2 = x2 + dir2 * 26;
  const midY = (y1 + y2) / 2 + (Math.abs(y2 - y1) < 20 ? 36 : 0);
  const pts = [
    { x: x1, y: y1 },
    { x: outX1, y: y1 },
    { x: outX1, y: midY },
    { x: outX2, y: midY },
    { x: outX2, y: y2 },
    { x: x2, y: y2 },
  ];
  return {
    pathD: buildRoundedOrthoPath(pts),
    midX: (outX1 + outX2) / 2,
    midY,
  };
}

export function computeEdgeRoutingAndBundles(params: {
  edges: ResolvedEdge[];
  visibleGroupBoxes: GroupBoundingBox[];
  visibleInstances: TableInstance[];
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  crossDomainMode: EdgeVisibilityMode;
  collapsedGroups?: Set<string>;
  focusedTableId?: string | null;
  tableGroups: TableGroupDef[];
}): {
  renderedEdges: ResolvedEdge[];
  crossDomainBundles: EdgeBundleItem[];
  anchorBoxByDomain: Map<string, AnchorBox>;
} {
  const {
    edges,
    visibleGroupBoxes,
    visibleInstances,
    positions,
    detailLevel,
    fkColsByTable,
    crossDomainMode,
    collapsedGroups,
    focusedTableId = null,
    tableGroups,
  } = params;

  const boxMap = new Map<string, AnchorBox>();
  for (const gb of visibleGroupBoxes) {
    boxMap.set(gb.name, {
      x: gb.x,
      y: gb.y,
      width: gb.width,
      height: gb.height,
    });
  }
  for (const inst of visibleInstances) {
    const p = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
    const rect: AnchorBox = {
      x: p.x,
      y: p.y,
      width: TABLE_WIDTH,
      height: getTableHeight(
        inst.table,
        detailLevel,
        fkColsByTable.get(inst.table.id),
        inst.sharedGroups.length > 1
      ),
    };
    boxMap.set(`table:${inst.posKey}`, rect);
    if (inst.groupName === null) {
      boxMap.set(`ungrouped:${inst.table.id}`, rect);
    }
  }

  const directEdges: ResolvedEdge[] = [];
  const bundleMap = new Map<string, EdgeBundleItem>();

  const getEndpointKey = (inst: TableInstance): string => {
    if (inst.groupName && collapsedGroups?.has(inst.groupName)) {
      return inst.groupName;
    }
    if (crossDomainMode === 'bundle') {
      return inst.groupName || `ungrouped:${inst.table.id}`;
    }
    return `table:${inst.posKey}`;
  };

  for (const edge of edges) {
    const fromCollapsed = Boolean(
      edge.fromInst.groupName && collapsedGroups?.has(edge.fromInst.groupName)
    );
    const toCollapsed = Boolean(
      edge.toInst.groupName && collapsedGroups?.has(edge.toInst.groupName)
    );

    // Hide internal edges completely inside a collapsed group
    if (
      fromCollapsed &&
      toCollapsed &&
      edge.fromInst.groupName === edge.toInst.groupName
    ) {
      continue;
    }

    const isCross = edge.fromInst.groupName !== edge.toInst.groupName;
    if (crossDomainMode === 'hide' && isCross) {
      continue;
    }

    const touchesCollapsed = fromCollapsed || toCollapsed;
    const touchesFocus =
      focusedTableId !== null &&
      (edge.ref.fromTable === focusedTableId ||
        edge.ref.toTable === focusedTableId);

    // Render direct table-to-table edge when neither endpoint is collapsed
    // and either we're showing all cross-domain edges, it's intra-group, or focused
    if (
      !touchesCollapsed &&
      (crossDomainMode === 'show' || !isCross || touchesFocus)
    ) {
      directEdges.push(edge);
      continue;
    }

    const keyA = getEndpointKey(edge.fromInst);
    const keyB = getEndpointKey(edge.toInst);
    if (keyA === keyB) continue;

    const [domainA, domainB] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
    const pairKey = `${domainA}::${domainB}`;

    let bundle = bundleMap.get(pairKey);
    if (!bundle) {
      const groupColor =
        tableGroups.find((g) => g.name === domainA)?.color ||
        tableGroups.find((g) => g.name === domainB)?.color ||
        '#64748b';
      bundle = {
        id: `bundle:${pairKey}`,
        domainA,
        domainB,
        color: groupColor,
        edges: [],
      };
      bundleMap.set(pairKey, bundle);
    }
    bundle.edges.push(edge);
  }

  return {
    renderedEdges: directEdges,
    crossDomainBundles: Array.from(bundleMap.values()),
    anchorBoxByDomain: boxMap,
  };
}
