import React from 'react';
import { GroupBoundingBox, TABLE_WIDTH, TableInstance } from '../../../utils/autoLayout';
import type { TableRect } from '../canvasGeometry';

export interface DiagramMinimapProps {
  visibleGroupBoxes: GroupBoundingBox[];
  visibleInstances: TableInstance[];
  tableRects: Map<string, TableRect>;
  selectedTableId: string | null;
  darkMode: boolean;
  bounds: { minX: number; minY: number; width: number; height: number };
  viewportRect?: { x: number; y: number; width: number; height: number };
}

const DiagramMinimapComponent: React.FC<DiagramMinimapProps> = ({
  visibleGroupBoxes,
  visibleInstances,
  tableRects,
  selectedTableId,
  darkMode,
  bounds,
  viewportRect,
}) => {
  if (visibleInstances.length === 0 && visibleGroupBoxes.length === 0) return null;

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
          const rect = tableRects.get(inst.posKey);
          if (!rect) return null;
          return (
            <rect
              key={inst.posKey}
              x={rect.x}
              y={rect.y}
              width={TABLE_WIDTH}
              height={rect.height}
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
        {viewportRect && (
          <rect
            x={viewportRect.x}
            y={viewportRect.y}
            width={viewportRect.width}
            height={viewportRect.height}
            fill="none"
            stroke="#2563EB"
            strokeOpacity={0.75}
            strokeWidth={Math.max(4, bounds.width * 0.008)}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
};

export const DiagramMinimap = React.memo(DiagramMinimapComponent);
