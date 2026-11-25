import { DetailLevel, StickyNote, TablePosition } from '@shared/domain/schemaTypes';
import {
  getTableHeight,
  GroupBoundingBox,
  ResolvedEdge,
  TABLE_WIDTH,
  TableInstance,
} from '../../utils/autoLayout';
import type { TableRect } from './canvasGeometry';
import type { CrossDomainBundle } from './types';

export type CanvasLodTier = 'full' | 'compact' | 'minimal';

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewportMetrics {
  x: number;
  y: number;
  zoom: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export const MIN_CANVAS_ZOOM = 0.08;
export const MAX_CANVAS_ZOOM = 2;

export function rectsIntersectBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  bounds: WorldBounds
): boolean {
  return (
    x <= bounds.maxX &&
    x + width >= bounds.minX &&
    y <= bounds.maxY &&
    y + height >= bounds.minY
  );
}

/**
 * Computes the visible world-space bounding box from viewport + container size,
 * expanded by overscan padding and optionally quantized to tile boundaries so
 * small pans keep identical culled object lists (preventing React churn).
 */
export function computeWorldCullBounds(
  viewport: ViewportMetrics,
  container: ContainerDimensions,
  overscanScreenPx = 220,
  tileWorldStep = 140
): WorldBounds {
  const safeZoom = Math.max(MIN_CANVAS_ZOOM, viewport.zoom);
  const w = Math.max(320, container.width || 1200);
  const h = Math.max(240, container.height || 800);
  const overscanWorld = Math.max(180, overscanScreenPx / safeZoom);

  const rawMinX = -viewport.x / safeZoom - overscanWorld;
  const rawMinY = -viewport.y / safeZoom - overscanWorld;
  const rawMaxX = (w - viewport.x) / safeZoom + overscanWorld;
  const rawMaxY = (h - viewport.y) / safeZoom + overscanWorld;

  if (tileWorldStep <= 0) {
    return { minX: rawMinX, minY: rawMinY, maxX: rawMaxX, maxY: rawMaxY };
  }

  const effectiveStep = Math.max(
    80,
    Math.min(480, Math.round(tileWorldStep / Math.max(0.25, safeZoom)))
  );

  return {
    minX: Math.floor(rawMinX / effectiveStep) * effectiveStep,
    minY: Math.floor(rawMinY / effectiveStep) * effectiveStep,
    maxX: Math.ceil(rawMaxX / effectiveStep) * effectiveStep,
    maxY: Math.ceil(rawMaxY / effectiveStep) * effectiveStep,
  };
}

/**
 * Computes the exact screen viewport rectangle in world coordinates (no overscan),
 * used to draw the camera frame inside the minimap.
 */
export function computeExactViewportWorldRect(
  viewport: ViewportMetrics,
  container: ContainerDimensions
): { x: number; y: number; width: number; height: number } {
  const safeZoom = Math.max(MIN_CANVAS_ZOOM, viewport.zoom);
  const w = Math.max(1, container.width || 1200);
  const h = Math.max(1, container.height || 800);
  return {
    x: -viewport.x / safeZoom,
    y: -viewport.y / safeZoom,
    width: w / safeZoom,
    height: h / safeZoom,
  };
}

/**
 * Determines the Level-of-Detail (LOD) tier for rendering table cards and edges.
 * Automatically simplifies cards when zoomed far out or viewing dense clusters
 * so panning/zooming stays responsive at 60fps on 150+ table enterprise schemas.
 */
export function resolveCanvasLod(options: {
  zoom: number;
  renderedTableCount: number;
  autoLodEnabled: boolean;
}): CanvasLodTier {
  const { zoom, renderedTableCount, autoLodEnabled } = options;
  if (!autoLodEnabled) return 'full';

  if (zoom < 0.28 || (renderedTableCount >= 140 && zoom < 0.42)) {
    return 'minimal';
  }
  if (zoom < 0.5 || (renderedTableCount >= 85 && zoom < 0.68)) {
    return 'compact';
  }
  return 'full';
}

export function cullTableInstances(options: {
  instances: TableInstance[];
  tableRects: Map<string, TableRect>;
  bounds: WorldBounds;
  pinnedPosKeys?: Set<string>;
  pinnedTableIds?: Set<string>;
}): TableInstance[] {
  const {
    instances,
    tableRects,
    bounds,
    pinnedPosKeys,
    pinnedTableIds,
  } = options;

  if (instances.length === 0) return instances;

  const result: TableInstance[] = [];
  for (const inst of instances) {
    if (
      pinnedPosKeys?.has(inst.posKey) ||
      pinnedTableIds?.has(inst.table.id)
    ) {
      result.push(inst);
      continue;
    }
    const rect = tableRects.get(inst.posKey);
    if (!rect) {
      result.push(inst);
      continue;
    }
    if (rectsIntersectBounds(rect.x, rect.y, rect.width, rect.height, bounds)) {
      result.push(inst);
    }
  }
  return result;
}

export function cullGroupBoxes(
  groupBoxes: GroupBoundingBox[],
  bounds: WorldBounds
): GroupBoundingBox[] {
  if (groupBoxes.length === 0) return groupBoxes;
  return groupBoxes.filter((gb) =>
    rectsIntersectBounds(gb.x, gb.y, gb.width, gb.height, bounds)
  );
}

export function cullStickyNotes(
  notes: StickyNote[],
  bounds: WorldBounds
): StickyNote[] {
  if (notes.length === 0) return notes;
  return notes.filter((note) => {
    const estHeight = note.collapsed ? 42 : 180;
    return rectsIntersectBounds(note.x, note.y, note.width, estHeight, bounds);
  });
}

export function cullResolvedEdges(options: {
  edges: ResolvedEdge[];
  tableRects: Map<string, TableRect>;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  bounds: WorldBounds;
  pinnedTableIds?: Set<string>;
  hoveredRefId?: string | null;
}): ResolvedEdge[] {
  const {
    edges,
    tableRects,
    positions,
    detailLevel,
    fkColsByTable,
    bounds,
    pinnedTableIds,
    hoveredRefId,
  } = options;

  if (edges.length === 0) return edges;

  // Pad for Bézier/orthogonal routing arcs and self-reference loops
  const routePad = 80;
  const result: ResolvedEdge[] = [];

  for (const edge of edges) {
    if (
      hoveredRefId === edge.id ||
      pinnedTableIds?.has(edge.ref.fromTable) ||
      pinnedTableIds?.has(edge.ref.toTable)
    ) {
      result.push(edge);
      continue;
    }

    const rFrom =
      tableRects.get(edge.fromInst.posKey) ??
      (() => {
        const p = positions[edge.fromInst.posKey] ||
          positions[edge.fromInst.table.id] || { x: 0, y: 0 };
        return {
          posKey: edge.fromInst.posKey,
          x: p.x,
          y: p.y,
          width: TABLE_WIDTH,
          height: getTableHeight(
            edge.fromInst.table,
            detailLevel,
            fkColsByTable.get(edge.fromInst.table.id),
            edge.fromInst.sharedGroups.length > 1
          ),
        };
      })();

    const rTo =
      tableRects.get(edge.toInst.posKey) ??
      (() => {
        const p = positions[edge.toInst.posKey] ||
          positions[edge.toInst.table.id] || { x: 0, y: 0 };
        return {
          posKey: edge.toInst.posKey,
          x: p.x,
          y: p.y,
          width: TABLE_WIDTH,
          height: getTableHeight(
            edge.toInst.table,
            detailLevel,
            fkColsByTable.get(edge.toInst.table.id),
            edge.toInst.sharedGroups.length > 1
          ),
        };
      })();

    const minX = Math.min(rFrom.x, rTo.x) - routePad;
    const minY = Math.min(rFrom.y, rTo.y) - routePad;
    const maxX = Math.max(rFrom.x + rFrom.width, rTo.x + rTo.width) + routePad;
    const maxY =
      Math.max(rFrom.y + rFrom.height, rTo.y + rTo.height) + routePad;

    if (rectsIntersectBounds(minX, minY, maxX - minX, maxY - minY, bounds)) {
      result.push(edge);
    }
  }

  return result;
}

export function cullCrossDomainBundles(options: {
  bundles: CrossDomainBundle[];
  anchorBoxByDomain: Map<string, { x: number; y: number; width: number; height: number }>;
  bounds: WorldBounds;
  hoveredBundleId?: string | null;
}): CrossDomainBundle[] {
  const { bundles, anchorBoxByDomain, bounds, hoveredBundleId } = options;
  if (bundles.length === 0) return bundles;

  const pad = 90;
  return bundles.filter((bundle) => {
    if (hoveredBundleId === bundle.id) return true;
    const boxA = anchorBoxByDomain.get(bundle.domainA);
    const boxB = anchorBoxByDomain.get(bundle.domainB);
    if (!boxA || !boxB) return false;
    const minX = Math.min(boxA.x, boxB.x) - pad;
    const minY = Math.min(boxA.y, boxB.y) - pad;
    const maxX = Math.max(boxA.x + boxA.width, boxB.x + boxB.width) + pad;
    const maxY = Math.max(boxA.y + boxA.height, boxB.y + boxB.height) + pad;
    return rectsIntersectBounds(minX, minY, maxX - minX, maxY - minY, bounds);
  });
}
