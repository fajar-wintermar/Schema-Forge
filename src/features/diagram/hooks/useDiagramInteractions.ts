import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DetailLevel,
  StickyNote,
  TablePosition,
} from '@shared/domain/schemaTypes';
import {
  type GroupBoundingBox,
  TABLE_WIDTH,
  type TableInstance,
} from '../../../utils/autoLayout';
import {
  type AlignmentGuide,
  type AlignMode,
  alignSelectedTables,
  computeSnapAlignment,
  findTablesInMarquee,
  getColumnPortWorldPosition,
  hitTestColumnAtWorldPoint,
  type MarqueeRect,
  normalizeMarqueeRect,
  type TableRect,
} from '../canvasGeometry';
import type { CursorMode, DragState, ViewportState } from '../types';

export interface ConnectPreviewState {
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
}

interface UseDiagramInteractionsOptions {
  filterMenuRef: React.RefObject<HTMLDivElement | null>;
  detailMenuRef: React.RefObject<HTMLDivElement | null>;
  cursorMode: CursorMode;
  updateCursorMode: (mode: CursorMode) => void;
  focusMode: boolean;
  updateFocusMode: (next: boolean | ((prev: boolean) => boolean)) => void;
  snapGrid: boolean;
  readOnly: boolean;
  layoutLocked?: boolean;
  viewport: ViewportState;
  scheduleViewportUpdate: (
    updater: ViewportState | ((prev: ViewportState) => ViewportState)
  ) => void;
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  positions: Record<string, TablePosition>;
  onUpdatePositions: (next: Record<string, TablePosition>) => void;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  groupBoxes: GroupBoundingBox[];
  visibleInstances: TableInstance[];
  visibleTableRects: Map<string, TableRect>;
  visiblePosKeySet: Set<string>;
  selectedTableId: string | null;
  onSelectTable: (tableId: string | null) => void;
  onChangeSelectedDomains: (domains: string[]) => void;
  onAssignTableToGroup: (
    tableId: string,
    targetGroupName: string,
    sourceGroupName: string | null,
    keepInSource?: boolean
  ) => void;
  onUpdateStickyNote: (id: string, patch: Partial<StickyNote>) => void;
  onCreateRef?: (
    fromTableId: string,
    fromCol: string,
    toTableId: string,
    toCol: string
  ) => void;
}

export function useDiagramInteractions({
  filterMenuRef,
  detailMenuRef,
  cursorMode,
  updateCursorMode,
  focusMode,
  updateFocusMode,
  snapGrid,
  readOnly,
  layoutLocked = false,
  viewport,
  scheduleViewportUpdate,
  clientToWorld,
  positions,
  onUpdatePositions,
  detailLevel,
  fkColsByTable,
  groupBoxes,
  visibleInstances,
  visibleTableRects,
  visiblePosKeySet,
  selectedTableId,
  onSelectTable,
  onChangeSelectedDomains,
  onAssignTableToGroup,
  onUpdateStickyNote,
  onCreateRef,
}: UseDiagramInteractionsOptions) {
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
  const [colorPickerPosKey, setColorPickerPosKey] = useState<string | null>(
    null
  );
  const [dropTargetGroupName, setDropTargetGroupName] = useState<string | null>(
    null
  );
  const [altPressedDuringDrag, setAltPressedDuringDrag] = useState(false);
  const [selectedPosKeys, setSelectedPosKeys] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [connectPreview, setConnectPreview] =
    useState<ConnectPreviewState | null>(null);

  const effectiveSelectedPosKeys = useMemo(
    () => selectedPosKeys.filter((pk) => visiblePosKeySet.has(pk)),
    [selectedPosKeys, visiblePosKeySet]
  );

  const selectedPosKeySet = useMemo(
    () => new Set(effectiveSelectedPosKeys),
    [effectiveSelectedPosKeys]
  );

  const dragRef = useRef<DragState>(null);

  const clearSelection = useCallback(() => {
    setSelectedPosKeys([]);
  }, []);

  const handleSetCursorMode = useCallback(
    (mode: CursorMode) => {
      updateCursorMode(mode);
      if (mode === 'pan') {
        setHoveredTableId(null);
        setHoveredRefId(null);
        setHoveredBundleId(null);
        setColorPickerPosKey(null);
        setDropTargetGroupName(null);
      }
    },
    [updateCursorMode]
  );

  useEffect(() => {
    const onPointerDownOutside = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) return;
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        setDomainMenuOpen(false);
      }
      if (detailMenuRef.current && !detailMenuRef.current.contains(e.target)) {
        setDetailMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
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
      if (key === 'v') handleSetCursorMode('select');
      else if (key === 'm') handleSetCursorMode('marquee');
      else if (key === 'h') handleSetCursorMode('pan');
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
    filterMenuRef,
    detailMenuRef,
    handleSetCursorMode,
    updateFocusMode,
    focusMode,
    selectedTableId,
    onSelectTable,
    selectedPosKeys.length,
  ]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.type === 'pan') {
        scheduleViewportUpdate((prev) => ({
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
          (r) =>
            r.posKey !== drag.posKey &&
            Math.abs(r.x - nx) < 1600 &&
            Math.abs(r.y - ny) < 1200
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
            if (gb.collapsed || gb.name === drag.origGroup) continue;
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
    scheduleViewportUpdate,
  ]);

  const handleAlignSelected = useCallback(
    (mode: AlignMode) => {
      if (readOnly || layoutLocked || effectiveSelectedPosKeys.length < 2) return;
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
      layoutLocked,
      effectiveSelectedPosKeys,
      positions,
      visibleTableRects,
      onUpdatePositions,
    ]
  );

  const latestPropsRef = useRef({
    positions,
    selectedTableId,
    selectedPosKeySet,
    effectiveSelectedPosKeys,
    visibleInstances,
    detailLevel,
    fkColsByTable,
    onSelectTable,
    onChangeSelectedDomains,
  });
  latestPropsRef.current = {
    positions,
    selectedTableId,
    selectedPosKeySet,
    effectiveSelectedPosKeys,
    visibleInstances,
    detailLevel,
    fkColsByTable,
    onSelectTable,
    onChangeSelectedDomains,
  };

  const handleTableHoverChange = useCallback(
    (tableId: string, hovered: boolean) => {
      setHoveredTableId(hovered ? tableId : null);
    },
    []
  );

  const handleToggleColorPicker = useCallback((posKey: string) => {
    setColorPickerPosKey((prev) => (prev === posKey ? null : posKey));
  }, []);

  const handleCloseColorPicker = useCallback(() => {
    setColorPickerPosKey(null);
  }, []);

  const handleTableStartDrag = useCallback(
    (inst: TableInstance, e: React.PointerEvent) => {
      const {
        positions: curPos,
        selectedTableId: curSelectedTableId,
        selectedPosKeySet: curSelectedSet,
        effectiveSelectedPosKeys: curSelectedKeys,
        visibleInstances: curVisibleInstances,
        onSelectTable: selectTable,
      } = latestPropsRef.current;

      setColorPickerPosKey(null);
      if (e.shiftKey) {
        setSelectedPosKeys((prev) => {
          const exists = prev.includes(inst.posKey);
          if (exists) return prev.filter((k) => k !== inst.posKey);
          const base =
            prev.length === 0 && curSelectedTableId
              ? curVisibleInstances
                  .filter((vi) => vi.table.id === curSelectedTableId)
                  .map((vi) => vi.posKey)
              : prev;
          return Array.from(new Set([...base, inst.posKey]));
        });
        selectTable(inst.table.id);
        return;
      }

      if (layoutLocked) {
        setSelectedPosKeys([inst.posKey]);
        selectTable(inst.table.id);
        return;
      }

      if (curSelectedSet.has(inst.posKey) && curSelectedKeys.length > 1) {
        const origPositions: Record<string, TablePosition> = {};
        for (const pk of curSelectedKeys) {
          const instMatch = curVisibleInstances.find((vi) => vi.posKey === pk);
          const p =
            curPos[pk] ||
            (instMatch ? curPos[instMatch.table.id] : undefined) || {
              x: 0,
              y: 0,
            };
          origPositions[pk] = p;
        }
        dragRef.current = {
          type: 'multi-table',
          posKeys: curSelectedKeys,
          startX: e.clientX,
          startY: e.clientY,
          origPositions,
        };
        return;
      }

      const pos =
        curPos[inst.posKey] || curPos[inst.table.id] || { x: 0, y: 0 };
      setSelectedPosKeys([inst.posKey]);
      selectTable(inst.table.id);
      dragRef.current = {
        type: 'table',
        posKey: inst.posKey,
        tableId: inst.table.id,
        startX: e.clientX,
        startY: e.clientY,
        origPos: pos,
        origGroup: inst.groupName,
      };
    },
    [layoutLocked]
  );

  const handleTableStartConnectFk = useCallback(
    (inst: TableInstance, colName: string, side: 'left' | 'right') => {
      const {
        positions: curPos,
        detailLevel: curDetailLevel,
        fkColsByTable: curFkCols,
      } = latestPropsRef.current;
      const pos =
        curPos[inst.posKey] || curPos[inst.table.id] || { x: 0, y: 0 };
      const anchor = getColumnPortWorldPosition(
        inst.table,
        pos,
        colName,
        side,
        curDetailLevel,
        curFkCols.get(inst.table.id)
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
    },
    []
  );

  const handleGroupStartDrag = useCallback(
    (gb: GroupBoundingBox, e: React.PointerEvent) => {
      if (layoutLocked) return;
      const curPos = latestPropsRef.current.positions;
      const origPositions: Record<string, TablePosition> = {};
      for (const pk of gb.posKeys) {
        origPositions[pk] = curPos[pk] || { x: 0, y: 0 };
      }
      dragRef.current = {
        type: 'group',
        groupName: gb.name,
        posKeys: gb.posKeys,
        startX: e.clientX,
        startY: e.clientY,
        origPositions,
      };
    },
    [layoutLocked]
  );

  const handleToggleOnlyDomain = useCallback(
    (groupName: string, isOnlySelected: boolean) => {
      latestPropsRef.current.onChangeSelectedDomains(
        isOnlySelected ? [] : [groupName]
      );
    },
    []
  );

  const handleStickyNoteStartDrag = useCallback(
    (note: StickyNote, e: React.PointerEvent) => {
      if (layoutLocked) return;
      dragRef.current = {
        type: 'note',
        noteId: note.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: note.x,
        origY: note.y,
      };
    },
    [layoutLocked]
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
        (e.target instanceof HTMLElement &&
          e.target.dataset.canvasBg === 'true')
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
    },
    [
      cursorMode,
      viewport.x,
      viewport.y,
      clientToWorld,
      effectiveSelectedPosKeys,
      onSelectTable,
    ]
  );

  return {
    domainMenuOpen,
    setDomainMenuOpen,
    detailMenuOpen,
    setDetailMenuOpen,
    hoveredTableId,
    hoveredRefId,
    setHoveredRefId,
    hoveredBundleId,
    setHoveredBundleId,
    colorPickerPosKey,
    dropTargetGroupName,
    altPressedDuringDrag,
    effectiveSelectedPosKeys,
    selectedPosKeySet,
    clearSelection,
    marqueeRect,
    activeGuides,
    connectPreview,
    handleSetCursorMode,
    handleAlignSelected,
    handleTableHoverChange,
    handleToggleColorPicker,
    handleCloseColorPicker,
    handleTableStartDrag,
    handleTableStartConnectFk,
    handleGroupStartDrag,
    handleToggleOnlyDomain,
    handleStickyNoteStartDrag,
    handleCanvasPointerDown,
  };
}
