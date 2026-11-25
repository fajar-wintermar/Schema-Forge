import React from 'react';
import type { AlignmentGuide, MarqueeRect } from '../canvasGeometry';
import type { ConnectPreviewState } from '../hooks/useDiagramInteractions';

interface CanvasInteractionOverlaysProps {
  activeGuides: AlignmentGuide[];
  connectPreview: ConnectPreviewState | null;
  marqueeRect: MarqueeRect | null;
}

export const CanvasInteractionOverlays: React.FC<
  CanvasInteractionOverlaysProps
> = ({ activeGuides, connectPreview, marqueeRect }) => {
  return (
    <>
      {activeGuides.length > 0 && (
        <svg
          className="overflow-visible pointer-events-none z-30"
          style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}
        >
          {activeGuides.map((g, i) =>
            g.axis === 'x' ? (
              <line
                key={`gx-${i}`}
                x1={g.position}
                y1={g.start}
                x2={g.position}
                y2={g.end}
                stroke="#2563EB"
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
            ) : (
              <line
                key={`gy-${i}`}
                x1={g.start}
                y1={g.position}
                x2={g.end}
                y2={g.position}
                stroke="#2563EB"
                strokeWidth={1.25}
                strokeDasharray="4 3"
              />
            )
          )}
        </svg>
      )}

      {connectPreview && (
        <svg
          className="overflow-visible pointer-events-none z-30"
          style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}
        >
          {(() => {
            const dx = connectPreview.toX - connectPreview.fromX;
            const ctrlOffset = Math.max(48, Math.abs(dx) * 0.45);
            const dir = dx >= 0 ? 1 : -1;
            const d = `M ${connectPreview.fromX} ${connectPreview.fromY} C ${
              connectPreview.fromX + dir * ctrlOffset
            } ${connectPreview.fromY}, ${
              connectPreview.toX - dir * ctrlOffset
            } ${connectPreview.toY}, ${connectPreview.toX} ${
              connectPreview.toY
            }`;
            const color = connectPreview.target ? '#16A34A' : '#2563EB';
            return (
              <g>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.2}
                  strokeDasharray="5 4"
                />
                <circle
                  cx={connectPreview.fromX}
                  cy={connectPreview.fromY}
                  r={4.5}
                  fill={color}
                />
                <circle
                  cx={connectPreview.toX}
                  cy={connectPreview.toY}
                  r={connectPreview.target ? 5.5 : 4}
                  fill={color}
                />
              </g>
            );
          })()}
        </svg>
      )}

      {marqueeRect && marqueeRect.width > 1 && marqueeRect.height > 1 && (
        <div
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
          className="absolute border border-blue-500 bg-blue-500/12 pointer-events-none z-30 rounded-xs"
        />
      )}
    </>
  );
};
