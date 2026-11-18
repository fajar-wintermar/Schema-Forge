import React from 'react';
import { DetailLevel, TablePosition } from '../../../types/schema';
import {
  getTableHeight,
  GroupBoundingBox,
  TABLE_WIDTH,
  TableInstance,
} from '../../../utils/autoLayout';

export interface DiagramMinimapProps {
  visibleGroupBoxes: GroupBoundingBox[];
  visibleInstances: TableInstance[];
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  selectedTableId: string | null;
  darkMode: boolean;
  bounds: { minX: number; minY: number; width: number; height: number };
}

export const DiagramMinimap: React.FC<DiagramMinimapProps> = ({
  visibleGroupBoxes,
  visibleInstances,
  positions,
  detailLevel,
  fkColsByTable,
  selectedTableId,
  darkMode,
  bounds,
}) => {
  if (visibleInstances.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 w-44 h-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-1.5 shadow-sm pointer-events-none hidden sm:block">
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        className="w-full h-full"
      >
        {visibleGroupBoxes.map((gb) => (
          <rect
            key={gb.name}
            x={gb.x}
            y={gb.y}
            width={gb.width}
            height={gb.height}
            rx={16}
            fill={gb.color || '#2563EB'}
            fillOpacity={0.14}
            stroke={gb.color || '#2563EB'}
            strokeOpacity={0.4}
            strokeWidth={8}
          />
        ))}
        {visibleInstances.map((inst) => {
          const p =
            positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
          const h = getTableHeight(
            inst.table,
            detailLevel,
            fkColsByTable.get(inst.table.id),
            inst.sharedGroups.length > 1
          );
          return (
            <rect
              key={inst.posKey}
              x={p.x}
              y={p.y}
              width={TABLE_WIDTH}
              height={h}
              rx={12}
              fill={
                selectedTableId === inst.table.id
                  ? '#2563EB'
                  : darkMode
                  ? '#475569'
                  : '#94a3b8'
              }
            />
          );
        })}
      </svg>
    </div>
  );
};
