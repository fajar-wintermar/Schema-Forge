import React from 'react';
import { DetailLevel, TableDef, TablePosition } from '../../../types/schema';
import { ResolvedEdge, TABLE_WIDTH } from '../../../utils/autoLayout';
import type { CursorMode } from '../types';

export interface EdgeLayerProps {
  edges: ResolvedEdge[];
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  hoveredRefId: string | null;
  activeTableHighlight: string | null;
  cursorMode: CursorMode;
  darkMode: boolean;
  onHoverRef: (id: string | null) => void;
}

function getColAnchorY(
  table: TableDef,
  posKey: string,
  colName: string,
  positions: Record<string, TablePosition>,
  detailLevel: DetailLevel,
  fkColsByTable: Map<string, Set<string>>
) {
  const pos = positions[posKey] || positions[table.id] || { x: 0, y: 0 };
  if (detailLevel === 'names') return pos.y + 20;
  const fkSet = fkColsByTable.get(table.id);
  const cols =
    detailLevel === 'keys'
      ? table.columns.filter(
          (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
        )
      : table.columns;
  const rowH = detailLevel === 'full' ? 30 : 26;
  const idx = cols.findIndex((c) => c.name === colName);
  if (idx === -1) return pos.y + 20;
  return pos.y + 40 + idx * rowH + rowH / 2;
}

export const EdgeLayer: React.FC<EdgeLayerProps> = ({
  edges,
  positions,
  detailLevel,
  fkColsByTable,
  hoveredRefId,
  activeTableHighlight,
  cursorMode,
  darkMode,
  onHoverRef,
}) => (
  <svg
    className="overflow-visible pointer-events-none"
    style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}
  >
    {edges.map((edge) => {
      const { ref: r, fromInst, toInst } = edge;
      const pA =
        positions[fromInst.posKey] ||
        positions[fromInst.table.id] || { x: 0, y: 0 };
      const pB =
        positions[toInst.posKey] ||
        positions[toInst.table.id] || { x: 0, y: 0 };
      const y1 = getColAnchorY(
        fromInst.table,
        fromInst.posKey,
        r.fromColumns[0],
        positions,
        detailLevel,
        fkColsByTable
      );
      const y2 = getColAnchorY(
        toInst.table,
        toInst.posKey,
        r.toColumns[0],
        positions,
        detailLevel,
        fkColsByTable
      );

      const aCenter = pA.x + TABLE_WIDTH / 2;
      const bCenter = pB.x + TABLE_WIDTH / 2;
      let x1 = pA.x + TABLE_WIDTH;
      let x2 = pB.x;
      let dir1 = 1;
      let dir2 = -1;

      if (fromInst.posKey === toInst.posKey) {
        x1 = pA.x + TABLE_WIDTH;
        x2 = pA.x + TABLE_WIDTH;
        dir1 = 1;
        dir2 = 1;
      } else if (aCenter > bCenter + 40) {
        x1 = pA.x;
        x2 = pB.x + TABLE_WIDTH;
        dir1 = -1;
        dir2 = 1;
      } else if (Math.abs(aCenter - bCenter) <= 40) {
        x1 = pA.x + TABLE_WIDTH;
        x2 = pB.x + TABLE_WIDTH;
        dir1 = 1;
        dir2 = 1;
      }

      const dx =
        fromInst.posKey === toInst.posKey
          ? 70
          : Math.max(54, Math.abs(x2 - x1) * 0.45);
      const cx1 = x1 + dir1 * dx;
      const cx2 = x2 + dir2 * dx;
      const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

      const isHighlighted =
        hoveredRefId === edge.id ||
        activeTableHighlight === r.fromTable ||
        activeTableHighlight === r.toTable;

      const dimmedBySelection =
        activeTableHighlight !== null && !isHighlighted;

      const stroke = isHighlighted
        ? r.color || '#2563EB'
        : r.color
        ? r.color
        : darkMode
        ? '#475569'
        : '#94a3b8';

      const midX = (x1 + cx1 + cx2 + x2) / 4;
      const midY = (y1 + y2) / 2;
      const metaLabel = [
        r.name,
        r.onDelete ? `del:${r.onDelete}` : null,
        r.onUpdate ? `upd:${r.onUpdate}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      return (
        <g key={edge.id} style={{ opacity: dimmedBySelection ? 0.25 : 1 }}>
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
            cx={x1}
            cy={y1}
            r={isHighlighted ? 4.5 : 3.5}
            fill={stroke}
          />
          <circle
            cx={x2}
            cy={y2}
            r={isHighlighted ? 4.5 : 3.5}
            fill={isHighlighted ? stroke : r.color || '#64748b'}
          />
          {isHighlighted && (
            <>
              <text
                x={x1 + dir1 * 12}
                y={y1 - 6}
                fontSize={10}
                fontWeight={700}
                fill={stroke}
                className="font-mono"
              >
                {r.relation === '>' ? 'N' : '1'}
              </text>
              <text
                x={x2 + dir2 * 14}
                y={y2 - 6}
                fontSize={10}
                fontWeight={700}
                fill={stroke}
                className="font-mono"
              >
                {r.relation === '<' ? 'N' : '1'}
              </text>
              {hoveredRefId === edge.id && metaLabel && (
                <text
                  x={midX}
                  y={midY - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={stroke}
                  className="font-mono"
                >
                  {metaLabel}
                </text>
              )}
            </>
          )}
        </g>
      );
    })}
  </svg>
);
