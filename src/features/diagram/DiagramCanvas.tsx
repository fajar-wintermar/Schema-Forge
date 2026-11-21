import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TablePosition } from '../../types/schema';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  getTableHeight,
  resolveSchemaEdges,
  TABLE_WIDTH,
} from '../../utils/autoLayout';
import { CanvasToolbar } from './components/CanvasToolbar';
import { DiagramMinimap } from './components/DiagramMinimap';
import { DomainFilterBar } from './components/DomainFilterBar';
import { EdgeLayer } from './components/EdgeLayer';
import { GroupContainer } from './components/GroupContainer';
import { StickyNoteCard } from './components/StickyNoteCard';
import { TableCard } from './components/TableCard';
import {
  AnchorBox,
  EdgeRoutingMode,
} from '../../utils/io/edgeGeometry';
import {
  CROSS_DOMAIN_EDGE_STORAGE_KEY,
  CrossDomainBundle,
  CrossDomainEdgeMode,
  CURSOR_MODE_STORAGE_KEY,
  CursorMode,
  DiagramCanvasProps,
  DragState,
  EDGE_ROUTING_STORAGE_KEY,
  FOCUS_MODE_STORAGE_KEY,
  ViewportState,
} from './types';

export type { DiagramCanvasProps } from './types';

export const DiagramCanvas: React.FC<DiagramCanvasProps> = ({
  schema,
  positions,
  onUpdatePositions,
  detailLevel,
  onChangeDetailLevel,
  selectedDomains,
  onChangeSelectedDomains,
  selectedTableId,
  highlightedColumn,
  onSelectTable,
  onChangeTableHeaderColor,
  onAssignTableToGroup,
  onEditGroup,
  onAutoLayout,
  onAutoLayoutGroup,
  stickyNotes,
  onAddStickyNote,
  onUpdateStickyNote,
  onDeleteStickyNote,
  focusRequest,
  darkMode,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const detailMenuRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({
    x: 40,
    y: 40,
    zoom: 0.85,
  });
  const [snapGrid, setSnapGrid] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [cursorMode, setCursorMode] = useState<CursorMode>(() => {
    try {
      const saved = localStorage.getItem(CURSOR_MODE_STORAGE_KEY);
      return saved === 'pan' ? 'pan' : 'select';
    } catch {
      return 'select';
    }
  });
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
  const [colorPickerPosKey, setColorPickerPosKey] = useState<string | null>(null);
  const [dropTargetGroupName, setDropTargetGroupName] = useState<string | null>(null);
  const [altPressedDuringDrag, setAltPressedDuringDrag] = useState(false);

  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FOCUS_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [routingMode, setRoutingMode] = useState<EdgeRoutingMode>(() => {
    try {
      const saved = localStorage.getItem(EDGE_ROUTING_STORAGE_KEY);
      return saved === 'orthogonal' ? 'orthogonal' : 'bezier';
    } catch {
      return 'bezier';
    }
  });
  const [crossDomainMode, setCrossDomainMode] = useState<CrossDomainEdgeMode>(
    () => {
      try {
        const saved = localStorage.getItem(CROSS_DOMAIN_EDGE_STORAGE_KEY);
        return saved === 'bundle' || saved === 'hide' ? saved : 'show';
      } catch {
        return 'show';
      }
    }
  );

  const updateFocusMode = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setFocusMode((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(FOCUS_MODE_STORAGE_KEY, String(resolved));
      } catch {
        // ignore storage errors
      }
      return resolved;
    });
  }, []);

  const toggleRoutingMode = useCallback(() => {
    setRoutingMode((prev) => {
      const next: EdgeRoutingMode =
        prev === 'bezier' ? 'orthogonal' : 'bezier';
      try {
        localStorage.setItem(EDGE_ROUTING_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const updateCrossDomainMode = useCallback((next: CrossDomainEdgeMode) => {
    setCrossDomainMode(next);
    try {
      localStorage.setItem(CROSS_DOMAIN_EDGE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateCursorMode = useCallback((mode: CursorMode) => {
    setCursorMode(mode);
    if (mode === 'pan') {
      setHoveredTableId(null);
      setHoveredRefId(null);
      setHoveredBundleId(null);
      setColorPickerPosKey(null);
      setDropTargetGroupName(null);
    }
    try {
      localStorage.setItem(CURSOR_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, []);

  const dragRef = useRef<DragState>(null);

  const fkColsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of schema.refs) {
      if (!map.has(r.fromTable)) map.set(r.fromTable, new Set());
      for (const c of r.fromColumns) map.get(r.fromTable)!.add(c);
      if (!map.has(r.toTable)) map.set(r.toTable, new Set());
      for (const c of r.toColumns) map.get(r.toTable)!.add(c);
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

  const isFilteringDomains = selectedDomains.length > 0;
  const selectedDomainSet = useMemo(
    () => new Set(selectedDomains),
    [selectedDomains]
  );

  const visibleGroupBoxes = useMemo(
    () =>
      isFilteringDomains
        ? groupBoxes.filter((gb) => selectedDomainSet.has(gb.name))
        : groupBoxes,
    [groupBoxes, isFilteringDomains, selectedDomainSet]
  );

  const visibleInstances = useMemo(
    () =>
      isFilteringDomains
        ? instances.filter(
            (inst) =>
              inst.groupName !== null && selectedDomainSet.has(inst.groupName)
          )
        : instances,
    [instances, isFilteringDomains, selectedDomainSet]
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleInstances.map((inst) => inst.table.id)),
    [visibleInstances]
  );

  const visibleEdges = useMemo(
    () =>
      isFilteringDomains
        ? resolvedEdges.filter(
            (edge) =>
              edge.fromInst.groupName !== null &&
              edge.toInst.groupName !== null &&
              selectedDomainSet.has(edge.fromInst.groupName) &&
              selectedDomainSet.has(edge.toInst.groupName)
          )
        : resolvedEdges,
    [resolvedEdges, isFilteringDomains, selectedDomainSet]
  );

  const visibleStickyNotes = useMemo(
    () =>
      isFilteringDomains
        ? stickyNotes.filter((note) => {
            if (!note.linkedTarget?.startsWith('table:')) return true;
            const tableId = note.linkedTarget.slice('table:'.length);
            return visibleTableIdSet.has(tableId);
          })
        : stickyNotes,
    [stickyNotes, isFilteringDomains, visibleTableIdSet]
  );

  const focusedTableId =
    focusMode && selectedTableId && visibleTableIdSet.has(selectedTableId)
      ? selectedTableId
      : null;

  const crossDomainEdgesInView = useMemo(
    () =>
      visibleEdges.filter(
        (e) => e.fromInst.groupName !== e.toInst.groupName
      ),
    [visibleEdges]
  );

  const { renderedEdges, crossDomainBundles, anchorBoxByDomain } = useMemo(() => {
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
      if (inst.groupName === null) {
        const p =
          positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
        boxMap.set(`ungrouped:${inst.table.id}`, {
          x: p.x,
          y: p.y,
          width: TABLE_WIDTH,
          height: getTableHeight(
            inst.table,
            detailLevel,
            fkColsByTable.get(inst.table.id),
            false
          ),
        });
      }
    }

    if (crossDomainMode === 'show') {
      return {
        renderedEdges: visibleEdges,
        crossDomainBundles: [] as CrossDomainBundle[],
        anchorBoxByDomain: boxMap,
      };
    }

    if (crossDomainMode === 'hide') {
      return {
        renderedEdges: visibleEdges.filter(
          (e) => e.fromInst.groupName === e.toInst.groupName
        ),
        crossDomainBundles: [] as CrossDomainBundle[],
        anchorBoxByDomain: boxMap,
      };
    }

    // crossDomainMode === 'bundle'
    const directEdges: typeof visibleEdges = [];
    const bundleMap = new Map<string, CrossDomainBundle>();

    for (const edge of visibleEdges) {
      const isCross = edge.fromInst.groupName !== edge.toInst.groupName;
      const touchesFocus =
        focusedTableId !== null &&
        (edge.ref.fromTable === focusedTableId ||
          edge.ref.toTable === focusedTableId);

      if (!isCross || touchesFocus) {
        directEdges.push(edge);
        continue;
      }

      const keyA =
        edge.fromInst.groupName || `ungrouped:${edge.fromInst.table.id}`;
      const keyB =
        edge.toInst.groupName || `ungrouped:${edge.toInst.table.id}`;
      const [domainA, domainB] = keyA < keyB ? [keyA, keyB] : [keyB, keyA];
      const pairKey = `${domainA}::${domainB}`;

      let bundle = bundleMap.get(pairKey);
      if (!bundle) {
        const groupColor =
          schema.tableGroups.find((g) => g.name === domainA)?.color ||
          schema.tableGroups.find((g) => g.name === domainB)?.color ||
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
  }, [
    visibleEdges,
    visibleGroupBoxes,
    visibleInstances,
    positions,
    detailLevel,
    fkColsByTable,
    crossDomainMode,
    focusedTableId,
    schema.tableGroups,
  ]);

  const focusNeighborhood = useMemo(() => {
    if (!focusedTableId) {
      return {
        active: false,
        neighborIds: new Set<string>(),
        groupNames: new Set<string>(),
      };
    }

    const neighborIds = new Set<string>();
    const activeEdges =
      crossDomainMode === 'hide'
        ? visibleEdges.filter((e) => e.fromInst.groupName === e.toInst.groupName)
        : visibleEdges;

    for (const edge of activeEdges) {
      if (edge.ref.fromTable === focusedTableId && edge.ref.toTable !== focusedTableId) {
        neighborIds.add(edge.ref.toTable);
      } else if (
        edge.ref.toTable === focusedTableId &&
        edge.ref.fromTable !== focusedTableId
      ) {
        neighborIds.add(edge.ref.fromTable);
      }
    }

    const focusTableSet = new Set<string>([focusedTableId, ...neighborIds]);
    const groupNames = new Set<string>();
    for (const inst of visibleInstances) {
      if (inst.groupName && focusTableSet.has(inst.table.id)) {
        groupNames.add(inst.groupName);
      }
    }

    return { active: true, neighborIds, groupNames };
  }, [focusedTableId, visibleEdges, visibleInstances, crossDomainMode]);

  useEffect(() => {
    const onPointerDownOutside = (e: PointerEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(e.target as Node)
      ) {
        setDomainMenuOpen(false);
      }
      if (
        detailMenuRef.current &&
        !detailMenuRef.current.contains(e.target as Node)
      ) {
        setDetailMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'v') updateCursorMode('select');
      else if (key === 'h') updateCursorMode('pan');
      else if (key === 'f') updateFocusMode((prev) => !prev);
      else if (e.key === 'Escape' && focusMode) {
        if (selectedTableId) {
          onSelectTable(null);
        } else {
          updateFocusMode(false);
        }
      }
    };
    window.addEventListener('pointerdown', onPointerDownOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [updateCursorMode, updateFocusMode, focusMode, selectedTableId, onSelectTable]);

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

  const fitVisibleTables = useCallback(() => {
    const boxes = visibleInstances.map((inst) => {
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
  }, [visibleInstances, positions, detailLevel, fkColsByTable, fitBounds]);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.type === 'fit') {
      fitVisibleTables();
    } else if (focusRequest.type === 'table' && focusRequest.id) {
      const inst =
        visibleInstances.find((i) => i.table.id === focusRequest.id) ||
        instances.find((i) => i.table.id === focusRequest.id);
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
        setViewport((prev) => ({
          ...prev,
          x: drag.origX + (e.clientX - drag.startX),
          y: drag.origY + (e.clientY - drag.startY),
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
    for (const inst of visibleInstances) {
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
  }, [visibleInstances, positions, detailLevel, fkColsByTable]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={(e) => {
        if (cursorMode === 'pan') {
          dragRef.current = {
            type: 'pan',
            startX: e.clientX,
            startY: e.clientY,
            origX: viewport.x,
            origY: viewport.y,
          };
          return;
        }
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
        {visibleGroupBoxes.map((gb) => {
          const groupObj = schema.tableGroups.find((g) => g.name === gb.name);
          const isOnlySelected =
            selectedDomains.length === 1 && selectedDomains[0] === gb.name;
          const isGroupDimmed =
            focusNeighborhood.active &&
            !focusNeighborhood.groupNames.has(gb.name);
          return (
            <GroupContainer
              key={gb.name}
              groupBox={gb}
              groupObj={groupObj}
              cursorMode={cursorMode}
              darkMode={darkMode}
              isOnlySelected={isOnlySelected}
              isDropTarget={dropTargetGroupName === gb.name}
              isDimmed={isGroupDimmed}
              altPressedDuringDrag={altPressedDuringDrag}
              readOnly={readOnly}
              onStartDrag={(e) => {
                if (readOnly) return;
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
              onToggleOnlyDomain={() =>
                onChangeSelectedDomains(isOnlySelected ? [] : [gb.name])
              }
              onAutoLayoutGroup={() => onAutoLayoutGroup(gb.name)}
              onEditGroup={onEditGroup}
            />
          );
        })}

        <EdgeLayer
          edges={renderedEdges}
          bundles={crossDomainBundles}
          anchorBoxByDomain={anchorBoxByDomain}
          positions={positions}
          detailLevel={detailLevel}
          fkColsByTable={fkColsByTable}
          hoveredRefId={hoveredRefId}
          hoveredBundleId={hoveredBundleId}
          activeTableHighlight={hoveredTableId || selectedTableId}
          focusMode={focusMode}
          focusedTableId={focusedTableId}
          routingMode={routingMode}
          cursorMode={cursorMode}
          darkMode={darkMode}
          onHoverRef={setHoveredRefId}
          onHoverBundle={setHoveredBundleId}
        />

        {visibleInstances.map((inst) => {
          const pos =
            positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
          const focusState = !focusNeighborhood.active
            ? 'normal'
            : inst.table.id === focusedTableId
            ? 'focused'
            : focusNeighborhood.neighborIds.has(inst.table.id)
            ? 'neighbor'
            : 'dimmed';

          return (
            <TableCard
              key={inst.posKey}
              instance={inst}
              pos={pos}
              detailLevel={detailLevel}
              fkSet={fkColsByTable.get(inst.table.id)}
              isSelected={selectedTableId === inst.table.id}
              isHovered={hoveredTableId === inst.table.id}
              focusState={focusState}
              highlightedColumn={highlightedColumn}
              colorPickerOpen={!readOnly && colorPickerPosKey === inst.posKey}
              cursorMode={cursorMode}
              darkMode={darkMode}
              readOnly={readOnly}
              onHoverChange={(hovered) =>
                setHoveredTableId(hovered ? inst.table.id : null)
              }
              onStartDrag={(e) => {
                onSelectTable(inst.table.id);
                setColorPickerPosKey(null);
                if (readOnly) {
                  dragRef.current = {
                    type: 'pan',
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: viewport.x,
                    origY: viewport.y,
                  };
                  return;
                }
                dragRef.current = {
                  type: 'table',
                  posKey: inst.posKey,
                  tableId: inst.table.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origPos: pos,
                  origGroup: inst.groupName,
                };
              }}
              onToggleColorPicker={() =>
                setColorPickerPosKey(
                  colorPickerPosKey === inst.posKey ? null : inst.posKey
                )
              }
              onCloseColorPicker={() => setColorPickerPosKey(null)}
              onChangeTableHeaderColor={onChangeTableHeaderColor}
            />
          );
        })}

        {visibleStickyNotes.map((note) => {
          let isNoteDimmed = false;
          if (focusNeighborhood.active && note.linkedTarget?.startsWith('table:')) {
            const targetId = note.linkedTarget.slice('table:'.length);
            isNoteDimmed =
              targetId !== focusedTableId &&
              !focusNeighborhood.neighborIds.has(targetId);
          }
          return (
            <StickyNoteCard
              key={note.id}
              note={note}
              cursorMode={cursorMode}
              isDimmed={isNoteDimmed}
              readOnly={readOnly}
              onStartDrag={(e) => {
                if (readOnly) return;
                dragRef.current = {
                  type: 'note',
                  noteId: note.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: note.x,
                  origY: note.y,
                };
              }}
              onUpdate={(patch) => onUpdateStickyNote(note.id, patch)}
              onDelete={() => onDeleteStickyNote(note.id)}
            />
          );
        })}
      </div>

      <DomainFilterBar
        tableGroups={schema.tableGroups}
        selectedDomains={selectedDomains}
        selectedDomainSet={selectedDomainSet}
        isFilteringDomains={isFilteringDomains}
        domainMenuOpen={domainMenuOpen}
        filterMenuRef={filterMenuRef}
        onSetDomainMenuOpen={setDomainMenuOpen}
        onChangeSelectedDomains={onChangeSelectedDomains}
        hasCrossDomainEdges={crossDomainEdgesInView.length > 0}
        crossDomainEdgeCount={crossDomainEdgesInView.length}
        crossDomainMode={crossDomainMode}
        onChangeCrossDomainMode={updateCrossDomainMode}
        focusMode={focusMode}
        focusedTableId={focusedTableId}
        neighborCount={focusNeighborhood.neighborIds.size}
        onClearFocusSelection={() => onSelectTable(null)}
        onExitFocusMode={() => updateFocusMode(false)}
      />

      {showMinimap && (
        <DiagramMinimap
          visibleGroupBoxes={visibleGroupBoxes}
          visibleInstances={visibleInstances}
          positions={positions}
          detailLevel={detailLevel}
          fkColsByTable={fkColsByTable}
          selectedTableId={selectedTableId}
          darkMode={darkMode}
          bounds={minimapBounds}
        />
      )}

      <CanvasToolbar
        cursorMode={cursorMode}
        focusMode={focusMode}
        routingMode={routingMode}
        detailLevel={detailLevel}
        detailMenuOpen={detailMenuOpen}
        detailMenuRef={detailMenuRef}
        snapGrid={snapGrid}
        showMinimap={showMinimap}
        zoom={viewport.zoom}
        onUpdateCursorMode={updateCursorMode}
        onToggleFocusMode={() => updateFocusMode((prev) => !prev)}
        onToggleRoutingMode={toggleRoutingMode}
        onToggleDetailMenu={() => setDetailMenuOpen((o) => !o)}
        onCloseDetailMenu={() => setDetailMenuOpen(false)}
        onChangeDetailLevel={onChangeDetailLevel}
        onAutoLayout={onAutoLayout}
        onAddNoteAtCenter={handleAddNoteAtCenter}
        onToggleSnapGrid={() => setSnapGrid((s) => !s)}
        onToggleMinimap={() => setShowMinimap((m) => !m)}
        onZoomOut={() =>
          setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom - 0.12) }))
        }
        onZoomIn={() =>
          setViewport((v) => ({ ...v, zoom: Math.min(2, v.zoom + 0.12) }))
        }
        onFitView={fitVisibleTables}
        readOnly={readOnly}
      />
    </div>
  );
};
