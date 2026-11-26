import React, { useRef } from 'react';
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
  onJumpToPoint?: (worldX: number, worldY: number) => void;
}

const DiagramMinimapComponent: React.FC<DiagramMinimapProps> = ({
  visibleGroupBoxes,
  visibleInstances,
  tableRects,
  selectedTableId,
  darkMode,
  bounds,
  viewportRect,
  onJumpToPoint,
}) => {
  const draggingRef = useRef(false);

  if (visibleInstances.length === 0 && visibleGroupBoxes.length === 0) return null;

  const jumpFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onJumpToPoint) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.min(rect.width / bounds.width, rect.height / bounds.height);
    const renderedW = bounds.width * scale;
    const renderedH = bounds.height * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    const worldX = bounds.minX + (e.clientX - rect.left - offsetX) / scale;
    const worldY = bounds.minY + (e.clientY - rect.top - offsetY) / scale;
    onJumpToPoint(worldX, worldY);
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      title={onJumpToPoint ? 'Click or drag on minimap to pan canvas' : undefined}
      className="absolute bottom-4 left-4 w-44 h-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-1.5 shadow-sm hidden sm:block z-10"
    >
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        onPointerDown={(e) => {
          if (!onJumpToPoint) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          draggingRef.current = true;
          jumpFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current || !onJumpToPoint) return;
          jumpFromPointer(e);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className={`w-full h-full ${onJumpToPoint ? 'cursor-crosshair' : ''}`}
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
            fillOpacity={gb.collapsed ? 0.28 : 0.12}
            stroke={gb.color || '#2563EB'}
            strokeOpacity={gb.collapsed ? 0.85 : 0.45}
            strokeDasharray={gb.collapsed ? '28 16' : undefined}
            strokeWidth={gb.collapsed ? 14 : 8}
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
            fill="#2563EB"
            fillOpacity={0.08}
            stroke="#2563EB"
            strokeOpacity={0.85}
            strokeWidth={Math.max(4, bounds.width * 0.008)}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
};

export const DiagramMinimap = React.memo(DiagramMinimapComponent);
