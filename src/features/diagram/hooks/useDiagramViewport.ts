import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DetailLevel,
  type TablePosition,
  UNGROUPED_DOMAIN_ID,
} from '@shared/domain/schemaTypes';
import {
  getTableHeight,
  type GroupBoundingBox,
  TABLE_WIDTH,
  type TableInstance,
} from '../../../utils/autoLayout';
import {
  type ContainerDimensions,
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
} from '../canvasVirtualization';
import type { DiagramCanvasProps, ViewportState } from '../types';

interface UseDiagramViewportOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  instances: TableInstance[];
  visibleInstances: TableInstance[];
  groupBoxes: GroupBoundingBox[];
  visibleGroupBoxes: GroupBoundingBox[];
  positions: Record<string, TablePosition>;
  detailLevel: DetailLevel;
  fkColsByTable: Map<string, Set<string>>;
  focusRequest: DiagramCanvasProps['focusRequest'];
}

export function useDiagramViewport({
  containerRef,
  instances,
  visibleInstances,
  groupBoxes,
  visibleGroupBoxes,
  positions,
  detailLevel,
  fkColsByTable,
  focusRequest,
}: UseDiagramViewportOptions) {
  const [viewport, setViewport] = useState<ViewportState>({
    x: 40,
    y: 40,
    zoom: 0.85,
  });
  const [containerSize, setContainerSize] = useState<ContainerDimensions>({
    width: 1200,
    height: 800,
  });

  const rafViewportIdRef = useRef<number | null>(null);
  const pendingViewportRef = useRef<ViewportState | null>(null);
  const latestViewportRef = useRef<ViewportState>(viewport);
  latestViewportRef.current = viewport;

  const scheduleViewportUpdate = useCallback(
    (updater: ViewportState | ((prev: ViewportState) => ViewportState)) => {
      const base = pendingViewportRef.current ?? latestViewportRef.current;
      const next = typeof updater === 'function' ? updater(base) : updater;
      pendingViewportRef.current = next;

      if (rafViewportIdRef.current === null) {
        rafViewportIdRef.current = window.requestAnimationFrame(() => {
          rafViewportIdRef.current = null;
          const commit = pendingViewportRef.current;
          pendingViewportRef.current = null;
          if (commit) {
            setViewport(commit);
          }
        });
      }
    },
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize((prev) =>
          Math.abs(prev.width - rect.width) < 2 &&
          Math.abs(prev.height - rect.height) < 2
            ? prev
            : { width: rect.width, height: rect.height }
        );
      }
    };
    updateSize();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateSize)
        : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      if (rafViewportIdRef.current !== null) {
        window.cancelAnimationFrame(rafViewportIdRef.current);
      }
    };
  }, [containerRef]);

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
          MIN_CANVAS_ZOOM,
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
    [containerRef]
  );

  const fitVisibleTables = useCallback(() => {
    const tableBoxes = visibleInstances.map((inst) => {
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
    const collapsedBoxes = visibleGroupBoxes
      .filter((gb) => gb.collapsed)
      .map((gb) => ({
        x: gb.x,
        y: gb.y,
        width: gb.width,
        height: gb.height,
      }));
    fitBounds([...tableBoxes, ...collapsedBoxes]);
  }, [
    visibleInstances,
    visibleGroupBoxes,
    positions,
    detailLevel,
    fkColsByTable,
    fitBounds,
  ]);

  const focusDepsRef = useRef({
    fitVisibleTables,
    visibleInstances,
    instances,
    positions,
    detailLevel,
    fkColsByTable,
    viewportZoom: viewport.zoom,
    groupBoxes,
    fitBounds,
    setViewport,
  });
  focusDepsRef.current = {
    fitVisibleTables,
    visibleInstances,
    instances,
    positions,
    detailLevel,
    fkColsByTable,
    viewportZoom: viewport.zoom,
    groupBoxes,
    fitBounds,
    setViewport,
  };

  useEffect(() => {
    if (!focusRequest) return;
    const {
      fitVisibleTables: fitVisible,
      visibleInstances: visInsts,
      instances: allInsts,
      positions: posMap,
      detailLevel: detail,
      fkColsByTable: fkMap,
      viewportZoom: zoomNow,
      groupBoxes: gBoxes,
      fitBounds: fitBoxes,
      setViewport: applyViewport,
    } = focusDepsRef.current;

    if (focusRequest.type === 'fit') {
      fitVisible();
    } else if (focusRequest.type === 'table' && focusRequest.id) {
      const visMatch = visInsts.find((i) => i.table.id === focusRequest.id);
      const inst =
        visMatch || allInsts.find((i) => i.table.id === focusRequest.id);
      const el = containerRef.current;
      if (!inst || !el) return;
      if (!visMatch && inst.groupName) {
        const collapsedGb = gBoxes.find(
          (b) => b.name === inst.groupName && b.collapsed
        );
        if (collapsedGb) {
          fitBoxes([collapsedGb]);
          return;
        }
      }
      const p =
        posMap[inst.posKey] || posMap[inst.table.id] || { x: 0, y: 0 };
      const h = getTableHeight(
        inst.table,
        detail,
        fkMap.get(inst.table.id),
        inst.sharedGroups.length > 1
      );
      const rect = el.getBoundingClientRect();
      const zoom = Math.max(zoomNow, 0.9);
      applyViewport({
        zoom,
        x: rect.width / 2 - (p.x + TABLE_WIDTH / 2) * zoom,
        y: rect.height / 2 - (p.y + h / 2) * zoom,
      });
    } else if (focusRequest.type === 'group' && focusRequest.id) {
      if (focusRequest.id === UNGROUPED_DOMAIN_ID) {
        const ungroupedBoxes = allInsts
          .filter((i) => i.groupName === null)
          .map((inst) => {
            const p =
              posMap[inst.posKey] || posMap[inst.table.id] || { x: 0, y: 0 };
            return {
              x: p.x,
              y: p.y,
              width: TABLE_WIDTH,
              height: getTableHeight(
                inst.table,
                detail,
                fkMap.get(inst.table.id),
                false
              ),
            };
          });
        if (ungroupedBoxes.length > 0) fitBoxes(ungroupedBoxes);
      } else {
        const gb = gBoxes.find((b) => b.name === focusRequest.id);
        if (gb) fitBoxes([gb]);
      }
    }
  }, [focusRequest, containerRef]);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [containerRef, viewport.x, viewport.y, viewport.zoom]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.08 : 0.92;

        scheduleViewportUpdate((prev) => {
          const nextZoom = Math.min(
            MAX_CANVAS_ZOOM,
            Math.max(MIN_CANVAS_ZOOM, prev.zoom * factor)
          );
          const scaleChange = nextZoom / prev.zoom;
          return {
            zoom: nextZoom,
            x: mouseX - (mouseX - prev.x) * scaleChange,
            y: mouseY - (mouseY - prev.y) * scaleChange,
          };
        });
      }
    },
    [containerRef, scheduleViewportUpdate]
  );

  const zoomOut = useCallback(() => {
    setViewport((v) => ({
      ...v,
      zoom: Math.max(MIN_CANVAS_ZOOM, v.zoom - 0.12),
    }));
  }, []);

  const zoomIn = useCallback(() => {
    setViewport((v) => ({
      ...v,
      zoom: Math.min(MAX_CANVAS_ZOOM, v.zoom + 0.12),
    }));
  }, []);

  const getCanvasCenterNoteCoords = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = (rect.width / 2 - viewport.x) / viewport.zoom - 120;
    const cy = (rect.height / 2 - viewport.y) / viewport.zoom - 70;
    return { x: Math.round(cx), y: Math.round(cy) };
  }, [containerRef, viewport.x, viewport.y, viewport.zoom]);

  const panToWorldPoint = useCallback(
    (worldX: number, worldY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      scheduleViewportUpdate((prev) => ({
        ...prev,
        x: rect.width / 2 - worldX * prev.zoom,
        y: rect.height / 2 - worldY * prev.zoom,
      }));
    },
    [containerRef, scheduleViewportUpdate]
  );

  return {
    viewport,
    containerSize,
    scheduleViewportUpdate,
    fitVisibleTables,
    clientToWorld,
    handleWheel,
    zoomOut,
    zoomIn,
    panToWorldPoint,
    getCanvasCenterNoteCoords,
  };
}
