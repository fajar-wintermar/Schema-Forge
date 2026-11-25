import React, { useMemo } from 'react';
import { DetailLevel, TableDef, TablePosition } from '@shared/domain/schemaTypes';
import { ResolvedEdge } from '../../../utils/autoLayout';
import {
  AnchorBox,
  buildEdgePath,
  EdgeRoutingMode,
  getBoxToBoxAnchors,
  getEdgeAnchorPoints,
} from '../../../utils/io/edgeGeometry';
import type { CanvasLodTier } from '../canvasVirtualization';
import type { CrossDomainBundle, CursorMode } from '../types';

export interface EdgeLayerProps {
  edges: ResolvedEdge[];
  bundles?: CrossDomainBundle[];
  anchorBoxByDomain?: Map<string, AnchorBox>;
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  lod?: CanvasLodTier;
  fkColsByTable: Map<string, Set<string>>;
  hoveredRefId: string | null;
  hoveredBundleId?: string | null;
  activeTableHighlight: string | null;
  focusMode: boolean;
  focusedTableId: string | null;
  routingMode: EdgeRoutingMode;
  cursorMode: CursorMode;
  darkMode: boolean;
  showCardinality?: boolean;
  onHoverRef: (id: string | null) => void;
  onHoverBundle?: (id: string | null) => void;
}

function computeColOffsetsForTable(
  table: TableDef,
  detailLevel: DetailLevel,
  fkSet?: Set<string>
): Map<string, number> {
  const offsets = new Map<string, number>();
  if (detailLevel === 'names') return offsets;
  const cols =
    detailLevel === 'keys'
      ? table.columns.filter(
          (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
        )
      : table.columns;
  const rowH = detailLevel === 'full' ? 30 : 26;
  cols.forEach((col, idx) => {
    offsets.set(col.name, 40 + idx * rowH + rowH / 2);
  });
  return offsets;
}

const EdgeLayerComponent: React.FC<EdgeLayerProps> = ({
  edges,
  bundles = [],
  anchorBoxByDomain,
  positions,
  detailLevel,
  lod = 'full',
  fkColsByTable,
  hoveredRefId,
  hoveredBundleId = null,
  activeTableHighlight,
  focusMode,
  focusedTableId,
  routingMode,
  cursorMode,
  darkMode,
  showCardinality = true,
  onHoverRef,
  onHoverBundle,
}) => {
  const hasActiveFocus = focusMode && focusedTableId !== null;
  const simplifiedEdges = lod === 'minimal';

  // Precompute column Y offsets per referenced table once instead of scanning columns per edge
  const colOffsetsByTableId = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    if (simplifiedEdges || detailLevel === 'names') return map;

    const registerTable = (table: TableDef) => {
      if (map.has(table.id)) return;
      map.set(
        table.id,
        computeColOffsetsForTable(table, detailLevel, fkColsByTable.get(table.id))
      );
    };

    for (const edge of edges) {
      registerTable(edge.fromInst.table);
      registerTable(edge.toInst.table);
    }
    return map;
  }, [edges, detailLevel, fkColsByTable, simplifiedEdges]);

  const getColY = (tableId: string, pos: TablePosition, colName?: string) => {
    if (simplifiedEdges || detailLevel === 'names' || !colName) {
      return pos.y + 20;
    }
    const offset = colOffsetsByTableId.get(tableId)?.get(colName);
    return offset !== undefined ? pos.y + offset : pos.y + 20;
  };

  return (
    <svg
      className="overflow-visible pointer-events-none"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}
    >
      {/* Cross-domain bundles (when cross-domain mode === 'bundle') */}
      {bundles.map((bundle, bIdx) => {
        if (!anchorBoxByDomain) return null;
        const boxA = anchorBoxByDomain.get(bundle.domainA);
        const boxB = anchorBoxByDomain.get(bundle.domainB);
        if (!boxA || !boxB) return null;

        const anchors = getBoxToBoxAnchors(boxA, boxB);
        const laneOffset = ((bIdx % 5) - 2) * 14;
        const { pathD, midX, midY } = buildEdgePath({
          ...anchors,
          isSelfRef: false,
          routing: routingMode,
          laneOffset,
        });

        const isBundleHovered = hoveredBundleId === bundle.id;
        const bundleOpacity = hasActiveFocus ? 0.14 : isBundleHovered ? 1 : 0.78;
        const strokeColor = isBundleHovered
          ? '#2563EB'
          : bundle.color || (darkMode ? '#64748b' : '#475569');
        const formatEndpoint = (key: string) => {
          const stripped = key.replace(/^(?:ungrouped|table):/, '');
          const sepIdx = stripped.indexOf('::');
          return sepIdx !== -1 ? stripped.slice(sepIdx + 2) : stripped;
        };
        const labelA = formatEndpoint(bundle.domainA);
        const labelB = formatEndpoint(bundle.domainB);
        const pillLabel = isBundleHovered
          ? `${labelA} ↔ ${labelB} (${bundle.edges.length})`
          : `${bundle.edges.length} ref${bundle.edges.length > 1 ? 's' : ''}`;
        const pillWidth = Math.max(46, pillLabel.length * 6.5 + 16);

        return (
          <g key={bundle.id} style={{ opacity: bundleOpacity }}>
            <title>
              {bundle.edges
                .map(
                  (e) =>
                    `${e.ref.fromTable}.${e.ref.fromColumns.join(', ')} ${e.ref.relation} ${e.ref.toTable}.${e.ref.toColumns.join(', ')}`
                )
                .join('\n')}
            </title>
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={16}
              className={
                cursorMode === 'pan'
                  ? 'pointer-events-none'
                  : 'pointer-events-auto cursor-pointer'
              }
              onMouseEnter={() => {
                if (cursorMode === 'select') onHoverBundle?.(bundle.id);
              }}
              onMouseLeave={() => onHoverBundle?.(null)}
            />
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isBundleHovered ? 2.6 : 2}
              strokeDasharray="6 4"
            />
            <circle cx={anchors.x1} cy={anchors.y1} r={4} fill={strokeColor} />
            <circle cx={anchors.x2} cy={anchors.y2} r={4} fill={strokeColor} />
            <g
              transform={`translate(${midX}, ${midY})`}
              className={
                cursorMode === 'pan'
                  ? 'pointer-events-none'
                  : 'pointer-events-auto cursor-pointer'
              }
              onMouseEnter={() => {
                if (cursorMode === 'select') onHoverBundle?.(bundle.id);
              }}
              onMouseLeave={() => onHoverBundle?.(null)}
            >
              <rect
                x={-pillWidth / 2}
                y={-11}
                width={pillWidth}
                height={22}
                rx={11}
                fill={darkMode ? '#0f172a' : '#ffffff'}
                stroke={strokeColor}
                strokeWidth={1.4}
              />
              <text
                x={0}
                y={3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={isBundleHovered ? '#2563EB' : darkMode ? '#e2e8f0' : '#334155'}
                className="font-mono"
              >
                {pillLabel}
              </text>
            </g>
          </g>
        );
      })}

      {/* Individual table-to-table edges */}
      {edges.map((edge, idx) => {
        const { ref: r, fromInst, toInst } = edge;
        const pA =
          positions[fromInst.posKey] ||
          positions[fromInst.table.id] || { x: 0, y: 0 };
        const pB =
          positions[toInst.posKey] ||
          positions[toInst.table.id] || { x: 0, y: 0 };
        const y1 = getColY(fromInst.table.id, pA, r.fromColumns[0]);
        const y2 = getColY(toInst.table.id, pB, r.toColumns[0]);

        const isSelfRef = fromInst.posKey === toInst.posKey;
        const anchors = getEdgeAnchorPoints(pA, pB, y1, y2, isSelfRef);
        const laneOffset = ((idx % 5) - 2) * 8;
        const { pathD, midX, midY } = buildEdgePath({
          ...anchors,
          isSelfRef,
          routing: routingMode,
          laneOffset,
        });

        const isFocusedEdge =
          hasActiveFocus &&
          (r.fromTable === focusedTableId || r.toTable === focusedTableId);

        const isHighlighted = hasActiveFocus
          ? hoveredRefId === edge.id || isFocusedEdge
          : hoveredRefId === edge.id ||
            activeTableHighlight === r.fromTable ||
            activeTableHighlight === r.toTable;

        const opacity = hasActiveFocus
          ? isFocusedEdge || hoveredRefId === edge.id
            ? 1
            : 0.08
          : activeTableHighlight !== null && !isHighlighted
          ? 0.25
          : 1;

        const stroke = isHighlighted
          ? r.color || '#2563EB'
          : r.color
          ? r.color
          : darkMode
          ? '#475569'
          : '#94a3b8';

        // Fast single-path rendering when zoomed out in minimal LOD
        if (simplifiedEdges && !isHighlighted) {
          return (
            <path
              key={edge.id}
              d={pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
              style={{ opacity: opacity * 0.85 }}
            />
          );
        }

        const metaLabel = [
          r.name,
          r.onDelete ? `del:${r.onDelete}` : null,
          r.onUpdate ? `upd:${r.onUpdate}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <g key={edge.id} style={{ opacity }}>
            <title>
              {`${r.fromTable}.${r.fromColumns.join(', ')} ${r.relation} ${r.toTable}.${r.toColumns.join(', ')}${metaLabel ? ` (${metaLabel})` : ''}`}
            </title>
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className={
                cursorMode === 'pan'
                  ? 'pointer-events-none'
                  : 'pointer-events-auto cursor-pointer'
              }
              onMouseEnter={() => {
                if (cursorMode === 'select') onHoverRef(edge.id);
              }}
              onMouseLeave={() => onHoverRef(null)}
            />
            <path
              d={pathD}
              fill="none"
              stroke={stroke}
              strokeWidth={isHighlighted ? 2.4 : r.color ? 1.8 : 1.5}
            />
            <circle
              cx={anchors.x1}
              cy={anchors.y1}
              r={isHighlighted ? 4.5 : 3.5}
              fill={stroke}
            />
            <circle
              cx={anchors.x2}
              cy={anchors.y2}
              r={isHighlighted ? 4.5 : 3.5}
              fill={isHighlighted ? stroke : r.color || '#64748b'}
            />
            {showCardinality && (
              <>
                <text
                  x={anchors.x1 + anchors.dir1 * 14}
                  y={anchors.y1 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={isHighlighted ? stroke : darkMode ? '#cbd5e1' : '#475569'}
                  stroke={darkMode ? '#0b1120' : '#f8fafc'}
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="font-mono select-none"
                >
                  {r.relation === '>' || r.relation === '<>' ? 'N' : '1'}
                </text>
                <text
                  x={anchors.x2 + anchors.dir2 * 14}
                  y={anchors.y2 - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={isHighlighted ? stroke : darkMode ? '#cbd5e1' : '#475569'}
                  stroke={darkMode ? '#0b1120' : '#f8fafc'}
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="font-mono select-none"
                >
                  {r.relation === '<' || r.relation === '<>' ? 'N' : '1'}
                </text>
              </>
            )}
            {isHighlighted && hoveredRefId === edge.id && metaLabel && (
              <text
                x={midX}
                y={midY - 8}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={stroke}
                stroke={darkMode ? '#0b1120' : '#f8fafc'}
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono select-none"
              >
                {metaLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const EdgeLayer = React.memo(EdgeLayerComponent);
