import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Edit3,
  Eye,
  EyeOff,
  Grid,
  KeyRound,
  Link2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  Plus,
  Share2,
  Sparkles,
  StickyNote as StickyNoteIcon,
  Trash2,
} from 'lucide-react';
import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  StickyNoteColor,
  TableDef,
  TableGroupDef,
  TablePosition,
} from '../types/schema';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  getTableHeight,
  resolveSchemaEdges,
  TABLE_WIDTH,
} from '../utils/autoLayout';
import { getContrastTextColor } from '../utils/importExport';

interface DiagramCanvasProps {
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  onUpdatePositions: (next: Record<string, TablePosition>) => void;
  detailLevel: DetailLevel;
  focusedGroup: string | null;
  onToggleFocusGroup: (groupName: string | null) => void;
  selectedTableId: string | null;
  highlightedColumn?: { tableId: string; columnName: string } | null;
  onSelectTable: (tableId: string | null) => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
  onAssignTableToGroup: (
    tableId: string,
    targetGroup: string,
    sourceGroup?: string | null,
    keepInSource?: boolean
  ) => void;
  onEditGroup: (group: TableGroupDef) => void;
  onAutoLayoutGroup: (groupName: string) => void;
  stickyNotes: StickyNote[];
  onAddStickyNote: (x: number, y: number) => void;
  onUpdateStickyNote: (id: string, patch: Partial<StickyNote>) => void;
  onDeleteStickyNote: (id: string) => void;
  focusRequest: {
    type: 'table' | 'group' | 'fit';
    id?: string;
    nonce: number;
  } | null;
  darkMode: boolean;
}

const HEADER_SWATCHES = [
  '#0f172a',
  '#1e3a8a',
  '#0369a1',
  '#065f46',
  '#9a3412',
  '#5b21b6',
  '#9f1239',
  '#374151',
];

const NOTE_STYLES: Record<
  StickyNoteColor,
  { bg: string; border: string; header: string; text: string }
> = {
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/80',
    border: 'border-amber-300 dark:border-amber-700',
    header: 'bg-amber-100/80 dark:bg-amber-900/50',
    text: 'text-amber-950 dark:text-amber-100',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950/80',
    border: 'border-sky-300 dark:border-sky-700',
    header: 'bg-sky-100/80 dark:bg-sky-900/50',
    text: 'text-sky-950 dark:text-sky-100',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/80',
    border: 'border-emerald-300 dark:border-emerald-700',
    header: 'bg-emerald-100/80 dark:bg-emerald-900/50',
    text: 'text-emerald-950 dark:text-emerald-100',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/80',
    border: 'border-rose-300 dark:border-rose-700',
    header: 'bg-rose-100/80 dark:bg-rose-900/50',
    text: 'text-rose-950 dark:text-rose-100',
  },
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    header: 'bg-slate-200/70 dark:bg-slate-700/60',
    text: 'text-slate-900 dark:text-slate-100',
  },
};

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  schema,
  positions,
  onUpdatePositions,
  detailLevel,
  focusedGroup,
  onToggleFocusGroup,
  selectedTableId,
  highlightedColumn,
  onSelectTable,
  onChangeTableHeaderColor,
  onAssignTableToGroup,
  onEditGroup,
  onAutoLayoutGroup,
  stickyNotes,
  onAddStickyNote,
  onUpdateStickyNote,
  onDeleteStickyNote,
  focusRequest,
  darkMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ x: 40, y: 40, zoom: 0.85 });
  const [snapGrid, setSnapGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);
  const [colorPickerPosKey, setColorPickerPosKey] = useState<string | null>(
    null
  );
  const [dropTargetGroupName, setDropTargetGroupName] = useState<string | null>(
    null
  );
  const [altPressedDuringDrag, setAltPressedDuringDrag] = useState(false);

  const dragRef = useRef<
    | { type: 'pan'; startX: number; startY: number; origX: number; origY: number }
    | {
        type: 'table';
        posKey: string;
        tableId: string;
        startX: number;
        startY: number;
        origPos: TablePosition;
        origGroup: string | null;
      }
    | {
        type: 'group';
        groupName: string;
        posKeys: string[];
        startX: number;
        startY: number;
        origPositions: Record<string, TablePosition>;
      }
    | {
        type: 'note';
        noteId: string;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
      }
    | null
  >(null);

  const fkColsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of schema.refs) {
      if (!map.has(r.fromTable)) map.set(r.fromTable, new Set());
      for (const c of r.fromColumns) map.get(r.fromTable)!.add(c);
    }
    return map;
  }, [schema.refs]);

  const { instances } = useMemo(() => buildTableInstances(schema), [schema]);

  const resolvedEdges = useMemo(
    () => resolveSchemaEdges(schema, instances, positions),
    [schema, instances, positions]
  );

  const groupBoxes = useMemo(
    () =>
      computeGroupBoundingBoxes(
        schema,
        positions,
        detailLevel,
        fkColsByTable
      ),
    [schema, positions, detailLevel, fkColsByTable]
  );

  const fitBounds = useCallback(
    (boxes: Array<{ x: number; y: number; width: number; height: number }>) => {
      const el = containerRef.current;
      if (!el || boxes.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const b of boxes) {
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      }
      const rect = el.getBoundingClientRect();
      const pad = 64;
      const w = Math.max(100, maxX - minX);
      const h = Math.max(100, maxY - minY);
      const zoom = Math.min(
        1.15,
        Math.max(
          0.25,
          Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h)
        )
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setViewport({
        zoom,
        x: rect.width / 2 - cx * zoom,
        y: rect.height / 2 - cy * zoom,
      });
    },
    []
  );

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.type === 'fit') {
      const boxes = instances.map((inst) => {
        const p = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
        return {
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
      });
      fitBounds(boxes);
    } else if (focusRequest.type === 'table' && focusRequest.id) {
      const inst = instances.find((i) => i.table.id === focusRequest.id);
      const el = containerRef.current;
      if (!inst || !el) return;
      const p = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
      const h = getTableHeight(
        inst.table,
        detailLevel,
        fkColsByTable.get(inst.table.id),
        inst.sharedGroups.length > 1
      );
      const rect = el.getBoundingClientRect();
      const zoom = Math.max(viewport.zoom, 0.9);
      setViewport({
        zoom,
        x: rect.width / 2 - (p.x + TABLE_WIDTH / 2) * zoom,
        y: rect.height / 2 - (p.y + h / 2) * zoom,
      });
    } else if (focusRequest.type === 'group' && focusRequest.id) {
      const gb = groupBoxes.find((b) => b.name === focusRequest.id);
      if (gb) fitBounds([gb]);
    }
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === 'pan') {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        setViewport((prev) => ({
          ...prev,
          x: drag.origX + dx,
          y: drag.origY + dy,
        }));
      } else if (drag.type === 'table') {
        const dx = (e.clientX - drag.startX) / viewport.zoom;
        const dy = (e.clientY - drag.startY) / viewport.zoom;
        let nx = drag.origPos.x + dx;
        let ny = drag.origPos.y + dy;
        if (snapGrid) {
          nx = Math.round(nx / 10) * 10;
          ny = Math.round(ny / 10) * 10;
        }
        onUpdatePositions({
          ...positions,
          [drag.posKey]: { x: nx, y: ny },
        });

        setAltPressedDuringDrag(e.altKey || e.ctrlKey || e.metaKey);

        const centerX = nx + TABLE_WIDTH / 2;
        const centerY = ny + 40;
        let hoveredG: string | null = null;
        for (const gb of groupBoxes) {
          if (gb.name === drag.origGroup) continue;
          if (
            centerX >= gb.x &&
            centerX <= gb.x + gb.width &&
            centerY >= gb.y &&
            centerY <= gb.y + gb.height
          ) {
            hoveredG = gb.name;
            break;
          }
        }
        setDropTargetGroupName(hoveredG);
      } else if (drag.type === 'group') {
        const dx = (e.clientX - drag.startX) / viewport.zoom;
        const dy = (e.clientY - drag.startY) / viewport.zoom;
        const next = { ...positions };
        for (const pk of drag.posKeys) {
          const orig = drag.origPositions[pk];
          if (!orig) continue;
          let nx = orig.x + dx;
          let ny = orig.y + dy;
          if (snapGrid) {
            nx = Math.round(nx / 10) * 10;
            ny = Math.round(ny / 10) * 10;
          }
          next[pk] = { x: nx, y: ny };
        }
        onUpdatePositions(next);
      } else if (drag.type === 'note') {
        const dx = (e.clientX - drag.startX) / viewport.zoom;
        const dy = (e.clientY - drag.startY) / viewport.zoom;
        let nx = drag.origX + dx;
        let ny = drag.origY + dy;
        if (snapGrid) {
          nx = Math.round(nx / 10) * 10;
          ny = Math.round(ny / 10) * 10;
        }
        onUpdateStickyNote(drag.noteId, { x: nx, y: ny });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && drag.type === 'table' && dropTargetGroupName) {
        const keepInSource = e.altKey || e.ctrlKey || e.metaKey;
        onAssignTableToGroup(
          drag.tableId,
          dropTargetGroupName,
          drag.origGroup,
          keepInSource
        );
      }
      dragRef.current = null;
      setDropTargetGroupName(null);
      setAltPressedDuringDrag(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [
    viewport.zoom,
    positions,
    snapGrid,
    groupBoxes,
    dropTargetGroupName,
    onUpdatePositions,
    onUpdateStickyNote,
    onAssignTableToGroup,
  ]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextZoom = Math.min(2, Math.max(0.2, viewport.zoom * factor));
      const scaleChange = nextZoom / viewport.zoom;

      setViewport((prev) => ({
        zoom: nextZoom,
        x: mouseX - (mouseX - prev.x) * scaleChange,
        y: mouseY - (mouseY - prev.y) * scaleChange,
      }));
    }
  };

  const getColAnchorY = (table: TableDef, posKey: string, colName: string) => {
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
  };

  const activeTableHighlight = hoveredTableId || selectedTableId;

  const isInstanceDimmed = (groupName: string | null) => {
    if (!focusedGroup) return false;
    return groupName !== focusedGroup;
  };

  const handleAddNoteAtCenter = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = (rect.width / 2 - viewport.x) / viewport.zoom - 120;
    const cy = (rect.height / 2 - viewport.y) / viewport.zoom - 70;
    onAddStickyNote(Math.round(cx), Math.round(cy));
  };

  const minimapBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const inst of instances) {
      const p = positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
      const h = getTableHeight(
        inst.table,
        detailLevel,
        fkColsByTable.get(inst.table.id),
        inst.sharedGroups.length > 1
      );
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + TABLE_WIDTH);
      maxY = Math.max(maxY, p.y + h);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, width: 1000, height: 800 };
    return {
      minX: minX - 80,
      minY: minY - 80,
      width: Math.max(400, maxX - minX + 160),
      height: Math.max(300, maxY - minY + 160),
    };
  }, [instances, positions, detailLevel, fkColsByTable]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).dataset.canvasBg === 'true'
        ) {
          setColorPickerPosKey(null);
          onSelectTable(null);
          dragRef.current = {
            type: 'pan',
            startX: e.clientX,
            startY: e.clientY,
            origX: viewport.x,
            origY: viewport.y,
          };
        }
      }}
      className={`relative flex-1 h-full overflow-hidden cursor-grab active:cursor-grabbing ${
        darkMode ? 'canvas-grid-dark' : 'canvas-grid-light'
      }`}
    >
      <div
        data-canvas-bg="true"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* 1. TableGroup Domain Containers */}
        {groupBoxes.map((gb) => {
          const groupObj = schema.tableGroups.find((g) => g.name === gb.name);
          const color = gb.color || '#2563EB';
          const isIsolated = focusedGroup === gb.name;
          const isDimmed = focusedGroup !== null && !isIsolated;
          const isDropTarget = dropTargetGroupName === gb.name;

          return (
            <div
              key={gb.name}
              style={{
                left: gb.x,
                top: gb.y,
                width: gb.width,
                height: gb.height,
                borderColor: isDropTarget ? '#2563EB' : `${color}66`,
                backgroundColor: `${color}${darkMode ? '14' : '0d'}`,
              }}
              className={`absolute rounded-2xl border-2 border-dashed transition-opacity pointer-events-auto ${
                isDimmed ? 'opacity-25' : 'opacity-100'
              } ${isDropTarget ? 'ring-4 ring-blue-500/30 border-solid' : ''}`}
            >
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const origPositions: Record<string, TablePosition> = {};
                  for (const pk of gb.posKeys) {
                    origPositions[pk] = positions[pk] || { x: 0, y: 0 };
                  }
                  dragRef.current = {
                    type: 'group',
                    groupName: gb.name,
                    posKeys: gb.posKeys,
                    startX: e.clientX,
                    startY: e.clientY,
                    origPositions,
                  };
                }}
                className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-move select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-xs shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {gb.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    · {gb.tables.length}
                  </span>
                  {isDropTarget && (
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 ml-2">
                      {altPressedDuringDrag
                        ? `Drop to also assign to ${gb.name}`
                        : `Drop to move to ${gb.name} (hold Alt to keep in both)`}
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-1 shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onToggleFocusGroup(isIsolated ? null : gb.name)
                    }
                    title={isIsolated ? 'Show all domains' : 'Isolate domain'}
                    className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/70"
                  >
                    {isIsolated ? (
                      <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAutoLayoutGroup(gb.name)}
                    title="Auto-layout tables in this domain"
                    className="p-1 rounded-md text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-white/70 dark:hover:bg-slate-800/70"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  {groupObj && (
                    <button
                      type="button"
                      onClick={() => onEditGroup(groupObj)}
                      title="Edit domain"
                      className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/70"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {gb.note && (
                <div className="px-4 -mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {gb.note}
                </div>
              )}
            </div>
          );
        })}

        {/* 2. Relationship Edges */}
        <svg
          className="overflow-visible pointer-events-none"
          style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1 }}
        >
          {resolvedEdges.map((edge) => {
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
              r.fromColumns[0]
            );
            const y2 = getColAnchorY(
              toInst.table,
              toInst.posKey,
              r.toColumns[0]
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

            const dimmedByGroup =
              focusedGroup !== null &&
              fromInst.groupName !== focusedGroup &&
              toInst.groupName !== focusedGroup;

            const dimmedBySelection =
              activeTableHighlight !== null && !isHighlighted;

            const stroke = isHighlighted
              ? '#2563EB'
              : darkMode
              ? '#475569'
              : '#94a3b8';

            return (
              <g
                key={edge.id}
                style={{
                  opacity: dimmedByGroup
                    ? 0.12
                    : dimmedBySelection
                    ? 0.25
                    : 1,
                }}
              >
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredRefId(edge.id)}
                  onMouseLeave={() => setHoveredRefId(null)}
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isHighlighted ? 2.4 : 1.5}
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
                  fill={isHighlighted ? '#2563EB' : '#64748b'}
                />
                {isHighlighted && (
                  <>
                    <text
                      x={x1 + dir1 * 12}
                      y={y1 - 6}
                      fontSize={10}
                      fontWeight={700}
                      fill="#2563EB"
                      className="font-mono"
                    >
                      {r.relation === '>'
                        ? 'N'
                        : r.relation === '<'
                        ? '1'
                        : '1'}
                    </text>
                    <text
                      x={x2 + dir2 * 14}
                      y={y2 - 6}
                      fontSize={10}
                      fontWeight={700}
                      fill="#2563EB"
                      className="font-mono"
                    >
                      {r.relation === '>'
                        ? '1'
                        : r.relation === '<'
                        ? 'N'
                        : '1'}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* 3. Table Cards (including shared domain instances) */}
        {instances.map((inst) => {
          const table = inst.table;
          const pos =
            positions[inst.posKey] || positions[table.id] || { x: 0, y: 0 };
          const isSelected = selectedTableId === table.id;
          const isHovered = hoveredTableId === table.id;
          const fkSet = fkColsByTable.get(table.id);
          const headerBg =
            table.headerColor || (darkMode ? '#1e293b' : '#0f172a');
          const headerText = getContrastTextColor(headerBg);
          const dimmed = isInstanceDimmed(inst.groupName);
          const isShared = inst.sharedGroups.length > 1;

          const visibleCols =
            detailLevel === 'names'
              ? []
              : detailLevel === 'keys'
              ? table.columns.filter(
                  (c) =>
                    c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
                )
              : table.columns;

          const rowH = detailLevel === 'full' ? 30 : 26;

          return (
            <div
              key={inst.posKey}
              style={{
                left: pos.x,
                top: pos.y,
                width: TABLE_WIDTH,
              }}
              onMouseEnter={() => setHoveredTableId(table.id)}
              onMouseLeave={() => setHoveredTableId(null)}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectTable(table.id);
                setColorPickerPosKey(null);
                dragRef.current = {
                  type: 'table',
                  posKey: inst.posKey,
                  tableId: table.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origPos: pos,
                  origGroup: inst.groupName,
                };
              }}
              className={`absolute rounded-lg border bg-white dark:bg-slate-900 pointer-events-auto select-none transition-opacity ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-500/30 z-10'
                  : isHovered
                  ? 'border-slate-400 dark:border-slate-500 z-10'
                  : 'border-slate-300 dark:border-slate-700'
              } ${dimmed ? 'opacity-25' : 'opacity-100'}`}
            >
              {/* Table Header */}
              <div
                style={{ backgroundColor: headerBg, color: headerText }}
                className="h-10 px-3 rounded-t-[7px] flex items-center justify-between gap-2 cursor-move"
              >
                <span className="text-[13px] font-semibold truncate">
                  {table.id}
                </span>
                <div
                  className="flex items-center gap-1 shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setColorPickerPosKey(
                        colorPickerPosKey === inst.posKey ? null : inst.posKey
                      )
                    }
                    title="Customize table header color"
                    className="p-1 rounded hover:bg-black/15 transition-colors"
                  >
                    <Palette className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Header Color Picker Popover */}
              {colorPickerPosKey === inst.posKey && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute right-2 top-11 z-30 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg w-48 space-y-2"
                >
                  <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Header Color
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {HEADER_SWATCHES.map((sw) => (
                      <button
                        key={sw}
                        type="button"
                        onClick={() => {
                          onChangeTableHeaderColor(table.id, sw);
                          setColorPickerPosKey(null);
                        }}
                        style={{ backgroundColor: sw }}
                        className="h-6 rounded border border-black/10 hover:scale-105 transition-transform"
                        title={sw}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-[11px] text-slate-500 flex items-center gap-1.5 cursor-pointer">
                      <span>Custom:</span>
                      <input
                        type="color"
                        value={table.headerColor || '#0f172a'}
                        onChange={(e) =>
                          onChangeTableHeaderColor(table.id, e.target.value)
                        }
                        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        onChangeTableHeaderColor(table.id, null);
                        setColorPickerPosKey(null);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}

              {/* Columns */}
              {detailLevel !== 'names' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {visibleCols.map((col) => {
                    const isFk = fkSet?.has(col.name);
                    const isColHighlighted =
                      highlightedColumn?.tableId === table.id &&
                      highlightedColumn?.columnName === col.name;
                    return (
                      <div
                        key={col.name}
                        style={{ height: rowH }}
                        className={`px-3 flex items-center justify-between gap-2 text-xs transition-colors ${
                          isColHighlighted
                            ? 'bg-blue-500/15 dark:bg-blue-500/25 ring-1 ring-inset ring-blue-500/70'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                        title={col.note || undefined}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {col.pk ? (
                            <KeyRound className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : isFk ? (
                            <Link2 className="w-3 h-3 text-blue-500 shrink-0" />
                          ) : (
                            <span className="w-3 shrink-0" />
                          )}
                          <span
                            className={`truncate ${
                              isColHighlighted
                                ? 'font-semibold text-blue-700 dark:text-blue-200'
                                : col.pk
                                ? 'font-semibold text-slate-900 dark:text-slate-50'
                                : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {col.name}
                          </span>
                          {col.notNull && !col.pk && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              *
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-mono text-[11px] shrink-0 ${
                            isColHighlighted
                              ? 'text-blue-600 dark:text-blue-300 font-medium'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {col.type}
                        </span>
                      </div>
                    );
                  })}
                  {visibleCols.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-slate-400 italic">
                      No key columns
                    </div>
                  )}
                </div>
              )}

              {/* Shared Domain Sub-bar */}
              {isShared && (
                <div
                  title={`Assigned domains: ${inst.sharedGroups.join(', ')}`}
                  className="px-3 py-1 bg-blue-50/70 dark:bg-blue-950/40 border-t border-blue-100 dark:border-blue-900/60 flex items-center gap-1.5 text-[10px] font-medium text-blue-700 dark:text-blue-300"
                >
                  <Share2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    Shared · {inst.sharedGroups.length} domains
                  </span>
                </div>
              )}

              {/* Table Note / Indexes footer in Full Detail mode */}
              {detailLevel === 'full' &&
                (table.note || table.indexes.length > 0) && (
                  <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 rounded-b-lg text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {table.note ||
                      `${table.indexes.length} index${
                        table.indexes.length > 1 ? 'es' : ''
                      }`}
                  </div>
                )}
            </div>
          );
        })}

        {/* 4. Sticky Notes */}
        {stickyNotes.map((note) => {
          const style = NOTE_STYLES[note.color] || NOTE_STYLES.amber;
          return (
            <div
              key={note.id}
              style={{
                left: note.x,
                top: note.y,
                width: note.width,
              }}
              className={`absolute rounded-lg border shadow-sm pointer-events-auto ${style.bg} ${style.border} ${style.text}`}
            >
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dragRef.current = {
                    type: 'note',
                    noteId: note.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: note.x,
                    origY: note.y,
                  };
                }}
                className={`px-2.5 py-1.5 rounded-t-[7px] flex items-center justify-between gap-1.5 cursor-move ${style.header}`}
              >
                <input
                  type="text"
                  value={note.title}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onUpdateStickyNote(note.id, { title: e.target.value })
                  }
                  placeholder="Note title..."
                  className="bg-transparent text-xs font-bold focus:outline-none flex-1 min-w-0"
                />
                <div
                  className="flex items-center gap-1 shrink-0"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {(
                    ['amber', 'sky', 'emerald', 'rose', 'slate'] as StickyNoteColor[]
                  ).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onUpdateStickyNote(note.id, { color: c })}
                      className={`w-2.5 h-2.5 rounded-full border border-black/20 ${
                        c === 'amber'
                          ? 'bg-amber-400'
                          : c === 'sky'
                          ? 'bg-sky-400'
                          : c === 'emerald'
                          ? 'bg-emerald-400'
                          : c === 'rose'
                          ? 'bg-rose-400'
                          : 'bg-slate-400'
                      } ${note.color === c ? 'ring-1 ring-offset-1 ring-slate-700' : ''}`}
                      title={`Color: ${c}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStickyNote(note.id, {
                        collapsed: !note.collapsed,
                      })
                    }
                    className="p-0.5 opacity-70 hover:opacity-100"
                    title={note.collapsed ? 'Expand note' : 'Collapse note'}
                  >
                    {note.collapsed ? (
                      <Maximize2 className="w-3 h-3" />
                    ) : (
                      <Minimize2 className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteStickyNote(note.id)}
                    className="p-0.5 opacity-70 hover:opacity-100 hover:text-rose-600"
                    title="Delete sticky note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {!note.collapsed && (
                <div className="p-2.5 space-y-1.5">
                  <textarea
                    value={note.content}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onUpdateStickyNote(note.id, {
                        content: e.target.value,
                        updatedAt: new Date().toISOString(),
                      })
                    }
                    rows={4}
                    placeholder="Write architecture notes, edge cases, or review comments..."
                    className="w-full bg-transparent text-xs leading-relaxed resize-none focus:outline-none"
                  />
                  {note.linkedTarget && (
                    <div className="text-[10px] opacity-70 font-mono truncate">
                      Linked: {note.linkedTarget}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Minimap Overlay */}
      {showMinimap && instances.length > 0 && (
        <div className="absolute bottom-4 left-4 w-44 h-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs p-1.5 shadow-sm pointer-events-none hidden sm:block">
          <svg
            viewBox={`${minimapBounds.minX} ${minimapBounds.minY} ${minimapBounds.width} ${minimapBounds.height}`}
            className="w-full h-full"
          >
            {groupBoxes.map((gb) => (
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
            {instances.map((inst) => {
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
      )}

      {/* Floating Canvas Toolbar */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-4 flex items-center gap-1.5 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm"
      >
        <button
          type="button"
          onClick={handleAddNoteAtCenter}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-900/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/70 transition-colors"
          title="Add a Sticky Note annotation to the diagram"
        >
          <StickyNoteIcon className="w-3.5 h-3.5" />
          <span>Add Note</span>
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() => setSnapGrid((s) => !s)}
          title={snapGrid ? 'Grid Snap: On' : 'Grid Snap: Off'}
          className={`p-1.5 rounded-lg transition-colors ${
            snapGrid
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setShowMinimap((m) => !m)}
          title={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
          className={`p-1.5 rounded-lg transition-colors ${
            showMinimap
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={() =>
            setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.12) }))
          }
          title="Zoom out"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-11 text-center tabular-nums">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setViewport((v) => ({ ...v, zoom: Math.min(2, v.zoom + 0.12) }))
          }
          title="Zoom in"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const boxes = instances.map((inst) => {
              const p =
                positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
              return {
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
            });
            fitBounds(boxes);
          }}
          title="Fit diagram to viewport"
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
