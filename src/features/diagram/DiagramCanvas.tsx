import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TablePosition, UNGROUPED_DOMAIN_ID } from '../../types/schema';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  getTableHeight,
  resolveSchemaEdges,
  TABLE_WIDTH,
} from '../../utils/autoLayout';
import {
  AlignmentGuide,
  AlignMode,
  alignSelectedTables,
  buildTableRects,
  computeSnapAlignment,
  findTablesInMarquee,
  getColumnPortWorldPosition,
  hitTestColumnAtWorldPoint,
  MarqueeRect,
  normalizeMarqueeRect,
} from './canvasGeometry';
import { CanvasToolbar } from './components/CanvasToolbar';
import { DiagramMinimap } from './components/DiagramMinimap';
import { DomainFilterBar } from './components/DomainFilterBar';
import { EdgeLayer } from './components/EdgeLayer';
import { GroupContainer } from './components/GroupContainer';
import { MultiSelectAlignBar } from './components/MultiSelectAlignBar';
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
  onResetLayout,
  hasCustomLayout = false,
  onCreateRef,
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
      return saved === 'pan' || saved === 'marquee' ? saved : 'select';
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
  const [selectedPosKeys, setSelectedPosKeys] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [connectPreview, setConnectPreview] = useState<{
    fromPosKey: string;
    fromTableId: string;
    fromCol: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    target: {
      posKey: string;
      tableId: string;
      columnName: string;
      x: number;
      y: number;
    } | null;
  } | null>(null);

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

  const ungroupedCount = useMemo(
    () => instances.filter((inst) => inst.groupName === null).length,
    [instances]
  );

  const isInstanceInSelectedDomains = useCallback(
    (inst: (typeof instances)[number]) =>
      inst.groupName === null
        ? selectedDomainSet.has(UNGROUPED_DOMAIN_ID)
        : selectedDomainSet.has(inst.groupName),
    [selectedDomainSet]
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
        ? instances.filter((inst) => isInstanceInSelectedDomains(inst))
        : instances,
    [instances, isFilteringDomains, isInstanceInSelectedDomains]
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleInstances.map((inst) => inst.table.id)),
    [visibleInstances]
  );

  const visiblePosKeySet = useMemo(
    () => new Set(visibleInstances.map((inst) => inst.posKey)),
    [visibleInstances]
  );

  const effectiveSelectedPosKeys = useMemo(
    () => selectedPosKeys.filter((pk) => visiblePosKeySet.has(pk)),
    [selectedPosKeys, visiblePosKeySet]
  );

  const selectedPosKeySet = useMemo(
    () => new Set(effectiveSelectedPosKeys),
    [effectiveSelectedPosKeys]
  );

  const visibleTableRects = useMemo(
    () =>
      buildTableRects(
        visibleInstances,
        positions,
        detailLevel,
        fkColsByTable
      ),
    [visibleInstances, positions, detailLevel, fkColsByTable]
  );

  const visibleEdges = useMemo(
    () =>
      isFilteringDomains
        ? resolvedEdges.filter(
            (edge) =>
              isInstanceInSelectedDomains(edge.fromInst) &&
              isInstanceInSelectedDomains(edge.toInst)
          )
        : resolvedEdges,
    [resolvedEdges, isFilteringDomains, isInstanceInSelectedDomains]
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
      else if (key === 'm') updateCursorMode('marquee');
      else if (key === 'h') updateCursorMode('pan');
      else if (key === 'f') updateFocusMode((prev) => !prev);
      else if (e.key === 'Escape') {
        if (selectedPosKeys.length > 0) {
          setSelectedPosKeys([]);
        }
        if (focusMode) {
          if (selectedTableId) {
            onSelectTable(null);
          } else {
            updateFocusMode(false);
          }
        }
      }
    };
    window.addEventListener('pointerdown', onPointerDownOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    updateCursorMode,
    updateFocusMode,
    focusMode,
    selectedTableId,
    onSelectTable,
    selectedPosKeys.length,
  ]);

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
      if (focusRequest.id === UNGROUPED_DOMAIN_ID) {
        const ungroupedBoxes = instances
          .filter((i) => i.groupName === null)
          .map((inst) => {
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
                false
              ),
            };
          });
        if (ungroupedBoxes.length > 0) fitBounds(ungroupedBoxes);
      } else {
        const gb = groupBoxes.find((b) => b.name === focusRequest.id);
        if (gb) fitBounds([gb]);
      }
    }
  }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport.x, viewport.y, viewport.zoom]
  );

  const handleAlignSelected = useCallback(
    (mode: AlignMode) => {
      if (readOnly || effectiveSelectedPosKeys.length < 2) return;
      const next = alignSelectedTables(
        effectiveSelectedPosKeys,
        positions,
        visibleTableRects,
        mode
      );
      onUpdatePositions(next);
    },
    [
      readOnly,
      effectiveSelectedPosKeys,
      positions,
      visibleTableRects,
      onUpdatePositions,
    ]
  );

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

        const movingRect = visibleTableRects.get(drag.posKey);
        const candidates = Array.from(visibleTableRects.values()).filter(
          (r) => r.posKey !== drag.posKey
        );
        const snap = computeSnapAlignment(
          {
            x: nx,
            y: ny,
            width: movingRect?.width ?? TABLE_WIDTH,
            height: movingRect?.height ?? 120,
          },
          candidates
        );
        nx = Math.round(nx + snap.dx);
        ny = Math.round(ny + snap.dy);
        setActiveGuides(snap.guides);

        onUpdatePositions({
          ...positions,
          [drag.posKey]: { x: nx, y: ny },
        });

        if (!readOnly) {
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
        }
      } else if (drag.type === 'multi-table') {
        const rawDx = (e.clientX - drag.startX) / viewport.zoom;
        const rawDy = (e.clientY - drag.startY) / viewport.zoom;
        let dx = rawDx;
        let dy = rawDy;
        if (snapGrid) {
          dx = Math.round(dx / 10) * 10;
          dy = Math.round(dy / 10) * 10;
        }

        const movingSet = new Set(drag.posKeys);
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const pk of drag.posKeys) {
          const orig = drag.origPositions[pk];
          const rect = visibleTableRects.get(pk);
          if (!orig) continue;
          minX = Math.min(minX, orig.x + dx);
          minY = Math.min(minY, orig.y + dy);
          maxX = Math.max(maxX, orig.x + dx + (rect?.width ?? TABLE_WIDTH));
          maxY = Math.max(maxY, orig.y + dy + (rect?.height ?? 120));
        }

        if (isFinite(minX)) {
          const candidates = Array.from(visibleTableRects.values()).filter(
            (r) => !movingSet.has(r.posKey)
          );
          const snap = computeSnapAlignment(
            { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
            candidates
          );
          dx += snap.dx;
          dy += snap.dy;
          setActiveGuides(snap.guides);
        }

        const next = { ...positions };
        for (const pk of drag.posKeys) {
          const orig = drag.origPositions[pk];
          if (!orig) continue;
          next[pk] = { x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) };
        }
        onUpdatePositions(next);
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
      } else if (drag.type === 'marquee') {
        const worldPt = clientToWorld(e.clientX, e.clientY);
        drag.currentWorldX = worldPt.x;
        drag.currentWorldY = worldPt.y;
        const rect = normalizeMarqueeRect(
          drag.startWorldX,
          drag.startWorldY,
          worldPt.x,
          worldPt.y
        );
        setMarqueeRect(rect);
        const inside = findTablesInMarquee(rect, visibleTableRects.values());
        if (drag.additive) {
          const merged = new Set([...drag.initialSelected, ...inside]);
          setSelectedPosKeys(Array.from(merged));
        } else {
          setSelectedPosKeys(inside);
        }
      } else if (drag.type === 'connect-fk') {
        const worldPt = clientToWorld(e.clientX, e.clientY);
        drag.currentWorldX = worldPt.x;
        drag.currentWorldY = worldPt.y;
        const hit = hitTestColumnAtWorldPoint(
          worldPt.x,
          worldPt.y,
          visibleInstances,
          positions,
          detailLevel,
          fkColsByTable
        );
        const validTarget =
          hit &&
          !(
            hit.tableId === drag.fromTableId &&
            hit.columnName === drag.fromCol
          )
            ? hit
            : null;
        setConnectPreview({
          fromPosKey: drag.fromPosKey,
          fromTableId: drag.fromTableId,
          fromCol: drag.fromCol,
          fromX: drag.startWorldX,
          fromY: drag.startWorldY,
          toX: validTarget ? validTarget.x : worldPt.x,
          toY: validTarget ? validTarget.y : worldPt.y,
          target: validTarget
            ? {
                posKey: validTarget.posKey,
                tableId: validTarget.tableId,
                columnName: validTarget.columnName,
                x: validTarget.x,
                y: validTarget.y,
              }
            : null,
        });
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
      if (!readOnly && drag && drag.type === 'table' && dropTargetGroupName) {
        const keepInSource = e.altKey || e.ctrlKey || e.metaKey;
        onAssignTableToGroup(
          drag.tableId,
          dropTargetGroupName,
          drag.origGroup,
          keepInSource
        );
      } else if (!readOnly && drag && drag.type === 'connect-fk') {
        const worldPt = clientToWorld(e.clientX, e.clientY);
        const hit = hitTestColumnAtWorldPoint(
          worldPt.x,
          worldPt.y,
          visibleInstances,
          positions,
          detailLevel,
          fkColsByTable
        );
        if (
          hit &&
          !(hit.tableId === drag.fromTableId && hit.columnName === drag.fromCol)
        ) {
          onCreateRef?.(
            drag.fromTableId,
            drag.fromCol,
            hit.tableId,
            hit.columnName
          );
        }
      }
      dragRef.current = null;
      setDropTargetGroupName(null);
      setAltPressedDuringDrag(false);
      setMarqueeRect(null);
      setActiveGuides([]);
      setConnectPreview(null);
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
    readOnly,
    onUpdatePositions,
    onUpdateStickyNote,
    onAssignTableToGroup,
    onCreateRef,
    clientToWorld,
    visibleTableRects,
    visibleInstances,
    detailLevel,
    fkColsByTable,
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
          if (cursorMode === 'marquee' || e.shiftKey) {
            const worldPt = clientToWorld(e.clientX, e.clientY);
            if (!e.shiftKey) {
              setSelectedPosKeys([]);
            }
            dragRef.current = {
              type: 'marquee',
              startWorldX: worldPt.x,
              startWorldY: worldPt.y,
              currentWorldX: worldPt.x,
              currentWorldY: worldPt.y,
              additive: e.shiftKey,
              initialSelected: effectiveSelectedPosKeys,
            };
            setMarqueeRect({
              x: worldPt.x,
              y: worldPt.y,
              width: 0,
              height: 0,
            });
            return;
          }
          setSelectedPosKeys([]);
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
      className={`relative flex-1 h-full overflow-hidden ${
        cursorMode === 'marquee'
          ? 'cursor-crosshair'
          : 'cursor-grab active:cursor-grabbing'
      } ${darkMode ? 'canvas-grid-dark' : 'canvas-grid-light'}`}
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

          const isMultiSelected = selectedPosKeySet.has(inst.posKey);
          const connectTargetCol =
            connectPreview?.target?.posKey === inst.posKey
              ? connectPreview.target.columnName
              : null;

          return (
            <TableCard
              key={inst.posKey}
              instance={inst}
              pos={pos}
              detailLevel={detailLevel}
              fkSet={fkColsByTable.get(inst.table.id)}
              isSelected={selectedTableId === inst.table.id}
              isMultiSelected={isMultiSelected}
              isHovered={hoveredTableId === inst.table.id}
              isConnectingFk={Boolean(connectPreview)}
              connectTargetCol={connectTargetCol}
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
                setColorPickerPosKey(null);
                if (e.shiftKey) {
                  setSelectedPosKeys((prev) => {
                    const exists = prev.includes(inst.posKey);
                    if (exists) return prev.filter((k) => k !== inst.posKey);
                    const base =
                      prev.length === 0 && selectedTableId
                        ? visibleInstances
                            .filter((vi) => vi.table.id === selectedTableId)
                            .map((vi) => vi.posKey)
                        : prev;
                    return Array.from(new Set([...base, inst.posKey]));
                  });
                  onSelectTable(inst.table.id);
                  return;
                }

                if (
                  selectedPosKeySet.has(inst.posKey) &&
                  effectiveSelectedPosKeys.length > 1
                ) {
                  const origPositions: Record<string, TablePosition> = {};
                  for (const pk of effectiveSelectedPosKeys) {
                    const instMatch = visibleInstances.find(
                      (vi) => vi.posKey === pk
                    );
                    const p =
                      positions[pk] ||
                      (instMatch ? positions[instMatch.table.id] : undefined) || {
                        x: 0,
                        y: 0,
                      };
                    origPositions[pk] = p;
                  }
                  dragRef.current = {
                    type: 'multi-table',
                    posKeys: effectiveSelectedPosKeys,
                    startX: e.clientX,
                    startY: e.clientY,
                    origPositions,
                  };
                  return;
                }

                setSelectedPosKeys([inst.posKey]);
                onSelectTable(inst.table.id);
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
              onStartConnectFk={
                readOnly
                  ? undefined
                  : (colName, side) => {
                      const anchor = getColumnPortWorldPosition(
                        inst.table,
                        pos,
                        colName,
                        side,
                        detailLevel,
                        fkColsByTable.get(inst.table.id)
                      );
                      dragRef.current = {
                        type: 'connect-fk',
                        fromPosKey: inst.posKey,
                        fromTableId: inst.table.id,
                        fromCol: colName,
                        startWorldX: anchor.x,
                        startWorldY: anchor.y,
                        currentWorldX: anchor.x,
                        currentWorldY: anchor.y,
                      };
                      setConnectPreview({
                        fromPosKey: inst.posKey,
                        fromTableId: inst.table.id,
                        fromCol: colName,
                        fromX: anchor.x,
                        fromY: anchor.y,
                        toX: anchor.x,
                        toY: anchor.y,
                        target: null,
                      });
                    }
              }
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

        {/* Snap Alignment Guides Overlay */}
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

        {/* Live Drag-to-Connect FK Preview */}
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

        {/* Marquee Selection Box */}
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
      </div>

      {!readOnly && (
        <MultiSelectAlignBar
          selectedCount={effectiveSelectedPosKeys.length}
          onAlign={handleAlignSelected}
          onClearSelection={() => setSelectedPosKeys([])}
        />
      )}

      <DomainFilterBar
        tableGroups={schema.tableGroups}
        ungroupedCount={ungroupedCount}
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
        onResetLayout={onResetLayout}
        hasCustomLayout={hasCustomLayout}
      />
    </div>
  );
};
