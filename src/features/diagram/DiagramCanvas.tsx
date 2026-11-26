import React, { useCallback, useMemo, useRef } from 'react';
import { UNGROUPED_DOMAIN_ID } from '@shared/domain/schemaTypes';
import {
  buildTableInstances,
  computeGroupBoundingBoxes,
  resolveSchemaEdges,
} from '../../utils/autoLayout';
import { computeEdgeRoutingAndBundles } from '../../utils/io/edgeGeometry';
import { buildTableRects } from './canvasGeometry';
import {
  type CanvasLodTier,
  computeExactViewportWorldRect,
  computeWorldCullBounds,
  cullCrossDomainBundles,
  cullGroupBoxes,
  cullResolvedEdges,
  cullStickyNotes,
  cullTableInstances,
  resolveCanvasLod,
} from './canvasVirtualization';
import { CanvasInteractionOverlays } from './components/CanvasInteractionOverlays';
import { CanvasToolbar } from './components/CanvasToolbar';
import { DiagramMinimap } from './components/DiagramMinimap';
import { DomainFilterBar } from './components/DomainFilterBar';
import { EdgeLayer } from './components/EdgeLayer';
import { GroupContainer } from './components/GroupContainer';
import { MultiSelectAlignBar } from './components/MultiSelectAlignBar';
import { StickyNoteCard } from './components/StickyNoteCard';
import { TableCard } from './components/TableCard';
import { useDiagramInteractions } from './hooks/useDiagramInteractions';
import { useDiagramPreferences } from './hooks/useDiagramPreferences';
import { useDiagramViewport } from './hooks/useDiagramViewport';
import type { DiagramCanvasProps } from './types';

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
  collapsedGroups = [],
  onToggleGroupCollapse,
  onSetAllGroupsCollapsed,
  initialViewport,
  viewportRestoreRequest,
  onViewportChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const detailMenuRef = useRef<HTMLDivElement>(null);

  const {
    snapGrid,
    setSnapGrid,
    showMinimap,
    setShowMinimap,
    cursorMode,
    updateCursorMode,
    autoLod,
    toggleAutoLod,
    focusMode,
    updateFocusMode,
    routingMode,
    toggleRoutingMode,
    crossDomainMode,
    updateCrossDomainMode,
    showCardinality,
    toggleShowCardinality,
    layoutLocked,
    toggleLayoutLocked,
  } = useDiagramPreferences();

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

  const collapsedGroupSet = useMemo(
    () => new Set(collapsedGroups),
    [collapsedGroups]
  );

  const groupBoxes = useMemo(
    () =>
      computeGroupBoundingBoxes(
        schema,
        positions,
        detailLevel,
        fkColsByTable,
        collapsedGroupSet
      ),
    [schema, positions, detailLevel, fkColsByTable, collapsedGroupSet]
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
      instances.filter(
        (inst) =>
          (!isFilteringDomains || isInstanceInSelectedDomains(inst)) &&
          !(inst.groupName !== null && collapsedGroupSet.has(inst.groupName))
      ),
    [instances, isFilteringDomains, isInstanceInSelectedDomains, collapsedGroupSet]
  );

  const visibleTableIdSet = useMemo(
    () => new Set(visibleInstances.map((inst) => inst.table.id)),
    [visibleInstances]
  );

  const visiblePosKeySet = useMemo(
    () => new Set(visibleInstances.map((inst) => inst.posKey)),
    [visibleInstances]
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
      stickyNotes.filter((note) => {
        if (!note.linkedTarget?.startsWith('table:')) return true;
        const tableId = note.linkedTarget.slice('table:'.length);
        return visibleTableIdSet.has(tableId);
      }),
    [stickyNotes, visibleTableIdSet]
  );

  const focusedTableId =
    focusMode && selectedTableId && visibleTableIdSet.has(selectedTableId)
      ? selectedTableId
      : null;

  const crossDomainEdgesInView = useMemo(
    () =>
      visibleEdges.filter((e) => e.fromInst.groupName !== e.toInst.groupName),
    [visibleEdges]
  );

  const crossDomainLinkCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of crossDomainEdgesInView) {
      if (edge.fromInst.groupName) {
        counts.set(
          edge.fromInst.groupName,
          (counts.get(edge.fromInst.groupName) || 0) + 1
        );
      }
      if (edge.toInst.groupName) {
        counts.set(
          edge.toInst.groupName,
          (counts.get(edge.toInst.groupName) || 0) + 1
        );
      }
    }
    return counts;
  }, [crossDomainEdgesInView]);

  const { renderedEdges, crossDomainBundles, anchorBoxByDomain } = useMemo(
    () =>
      computeEdgeRoutingAndBundles({
        edges: visibleEdges,
        visibleGroupBoxes,
        visibleInstances,
        positions,
        detailLevel,
        fkColsByTable,
        crossDomainMode,
        collapsedGroups: collapsedGroupSet,
        focusedTableId,
        tableGroups: schema.tableGroups,
      }),
    [
      visibleEdges,
      visibleGroupBoxes,
      visibleInstances,
      positions,
      detailLevel,
      fkColsByTable,
      crossDomainMode,
      collapsedGroupSet,
      focusedTableId,
      schema.tableGroups,
    ]
  );

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
        ? visibleEdges.filter(
            (e) => e.fromInst.groupName === e.toInst.groupName
          )
        : visibleEdges;

    for (const edge of activeEdges) {
      if (
        edge.ref.fromTable === focusedTableId &&
        edge.ref.toTable !== focusedTableId
      ) {
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

  const {
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
  } = useDiagramViewport({
    containerRef,
    instances,
    visibleInstances,
    groupBoxes,
    visibleGroupBoxes,
    positions,
    detailLevel,
    fkColsByTable,
    focusRequest,
    initialViewport,
    viewportRestoreRequest,
    onViewportChange,
  });

  const interactions = useDiagramInteractions({
    filterMenuRef,
    detailMenuRef,
    cursorMode,
    updateCursorMode,
    focusMode,
    updateFocusMode,
    snapGrid,
    readOnly,
    layoutLocked,
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
  });

  const { effectiveSelectedPosKeys, selectedPosKeySet } = interactions;

  const handleAddNoteAtCenter = useCallback(() => {
    const center = getCanvasCenterNoteCoords();
    if (!center) return;
    onAddStickyNote(center.x, center.y);
  }, [getCanvasCenterNoteCoords, onAddStickyNote]);

  const minimapBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const rect of visibleTableRects.values()) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }
    for (const gb of visibleGroupBoxes) {
      if (!gb.collapsed) continue;
      minX = Math.min(minX, gb.x);
      minY = Math.min(minY, gb.y);
      maxX = Math.max(maxX, gb.x + gb.width);
      maxY = Math.max(maxY, gb.y + gb.height);
    }
    if (!isFinite(minX)) return { minX: 0, minY: 0, width: 1000, height: 800 };
    return {
      minX: minX - 80,
      minY: minY - 80,
      width: Math.max(400, maxX - minX + 160),
      height: Math.max(300, maxY - minY + 160),
    };
  }, [visibleTableRects, visibleGroupBoxes]);

  const rawCullBounds = computeWorldCullBounds(viewport, containerSize, 220, 140);
  const worldCullBounds = useMemo(
    () => ({
      minX: rawCullBounds.minX,
      minY: rawCullBounds.minY,
      maxX: rawCullBounds.maxX,
      maxY: rawCullBounds.maxY,
    }),
    [
      rawCullBounds.minX,
      rawCullBounds.minY,
      rawCullBounds.maxX,
      rawCullBounds.maxY,
    ]
  );

  const pinnedPosKeys = useMemo(() => {
    const set = new Set<string>(effectiveSelectedPosKeys);
    if (interactions.connectPreview?.fromPosKey) {
      set.add(interactions.connectPreview.fromPosKey);
    }
    if (interactions.connectPreview?.target?.posKey) {
      set.add(interactions.connectPreview.target.posKey);
    }
    if (interactions.colorPickerPosKey) {
      set.add(interactions.colorPickerPosKey);
    }
    return set;
  }, [
    effectiveSelectedPosKeys,
    interactions.connectPreview,
    interactions.colorPickerPosKey,
  ]);

  const pinnedTableIds = useMemo(() => {
    const set = new Set<string>();
    if (selectedTableId) set.add(selectedTableId);
    if (focusedTableId) set.add(focusedTableId);
    if (interactions.hoveredTableId) set.add(interactions.hoveredTableId);
    if (highlightedColumn?.tableId) set.add(highlightedColumn.tableId);
    return set;
  }, [
    selectedTableId,
    focusedTableId,
    interactions.hoveredTableId,
    highlightedColumn?.tableId,
  ]);

  const culledGroupBoxes = useMemo(
    () => cullGroupBoxes(visibleGroupBoxes, worldCullBounds),
    [visibleGroupBoxes, worldCullBounds]
  );

  const culledInstances = useMemo(
    () =>
      cullTableInstances({
        instances: visibleInstances,
        tableRects: visibleTableRects,
        bounds: worldCullBounds,
        pinnedPosKeys,
        pinnedTableIds,
      }),
    [
      visibleInstances,
      visibleTableRects,
      worldCullBounds,
      pinnedPosKeys,
      pinnedTableIds,
    ]
  );

  const culledStickyNotes = useMemo(
    () => cullStickyNotes(visibleStickyNotes, worldCullBounds),
    [visibleStickyNotes, worldCullBounds]
  );

  const culledEdges = useMemo(
    () =>
      cullResolvedEdges({
        edges: renderedEdges,
        tableRects: visibleTableRects,
        positions,
        detailLevel,
        fkColsByTable,
        bounds: worldCullBounds,
        pinnedTableIds,
        hoveredRefId: interactions.hoveredRefId,
      }),
    [
      renderedEdges,
      visibleTableRects,
      positions,
      detailLevel,
      fkColsByTable,
      worldCullBounds,
      pinnedTableIds,
      interactions.hoveredRefId,
    ]
  );

  const culledBundles = useMemo(
    () =>
      cullCrossDomainBundles({
        bundles: crossDomainBundles,
        anchorBoxByDomain,
        bounds: worldCullBounds,
        hoveredBundleId: interactions.hoveredBundleId,
      }),
    [
      crossDomainBundles,
      anchorBoxByDomain,
      worldCullBounds,
      interactions.hoveredBundleId,
    ]
  );

  const activeLod: CanvasLodTier = resolveCanvasLod({
    zoom: viewport.zoom,
    renderedTableCount: culledInstances.length,
    autoLodEnabled: autoLod,
  });

  const minimapViewportRect = useMemo(
    () => computeExactViewportWorldRect(viewport, containerSize),
    [viewport, containerSize]
  );

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={interactions.handleCanvasPointerDown}
      className={`relative flex-1 min-w-0 h-full overflow-hidden ${
        cursorMode === 'marquee'
          ? 'cursor-crosshair'
          : 'cursor-grab active:cursor-grabbing'
      } ${darkMode ? 'canvas-grid-dark' : 'canvas-grid-light'}`}
    >
      <div
        data-canvas-bg="true"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: visibleInstances.length >= 40 ? 'transform' : undefined,
        }}
        className="absolute inset-0 pointer-events-none"
      >
        {culledGroupBoxes.map((gb) => {
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
              lod={activeLod}
              isOnlySelected={isOnlySelected}
              isDropTarget={interactions.dropTargetGroupName === gb.name}
              isDimmed={isGroupDimmed}
              altPressedDuringDrag={interactions.altPressedDuringDrag}
              crossDomainLinkCount={crossDomainLinkCountByGroup.get(gb.name) || 0}
              readOnly={readOnly}
              onStartDrag={interactions.handleGroupStartDrag}
              onToggleOnlyDomain={interactions.handleToggleOnlyDomain}
              onAutoLayoutGroup={layoutLocked ? () => {} : onAutoLayoutGroup}
              onEditGroup={onEditGroup}
              onToggleCollapse={onToggleGroupCollapse}
            />
          );
        })}

        <EdgeLayer
          edges={culledEdges}
          bundles={culledBundles}
          anchorBoxByDomain={anchorBoxByDomain}
          positions={positions}
          detailLevel={detailLevel}
          lod={activeLod}
          fkColsByTable={fkColsByTable}
          hoveredRefId={interactions.hoveredRefId}
          hoveredBundleId={interactions.hoveredBundleId}
          activeTableHighlight={interactions.hoveredTableId || selectedTableId}
          focusMode={focusMode}
          focusedTableId={focusedTableId}
          routingMode={routingMode}
          cursorMode={cursorMode}
          darkMode={darkMode}
          showCardinality={showCardinality}
          onHoverRef={interactions.setHoveredRefId}
          onHoverBundle={interactions.setHoveredBundleId}
        />

        {culledInstances.map((inst) => {
          const pos =
            positions[inst.posKey] || positions[inst.table.id] || { x: 0, y: 0 };
          const cardRect = visibleTableRects.get(inst.posKey);
          const focusState = !focusNeighborhood.active
            ? 'normal'
            : inst.table.id === focusedTableId
            ? 'focused'
            : focusNeighborhood.neighborIds.has(inst.table.id)
            ? 'neighbor'
            : 'dimmed';

          const isMultiSelected = selectedPosKeySet.has(inst.posKey);
          const connectTargetCol =
            interactions.connectPreview?.target?.posKey === inst.posKey
              ? interactions.connectPreview.target.columnName
              : null;
          const cardColorOpen =
            !readOnly && interactions.colorPickerPosKey === inst.posKey;
          const cardLod: CanvasLodTier = cardColorOpen ? 'full' : activeLod;

          return (
            <TableCard
              key={inst.posKey}
              instance={inst}
              pos={pos}
              detailLevel={detailLevel}
              lod={cardLod}
              cardHeight={cardRect?.height}
              fkSet={fkColsByTable.get(inst.table.id)}
              isSelected={selectedTableId === inst.table.id}
              isMultiSelected={isMultiSelected}
              isHovered={interactions.hoveredTableId === inst.table.id}
              isConnectingFk={Boolean(interactions.connectPreview)}
              connectTargetCol={connectTargetCol}
              focusState={focusState}
              highlightedColumn={highlightedColumn}
              colorPickerOpen={cardColorOpen}
              cursorMode={cursorMode}
              darkMode={darkMode}
              readOnly={readOnly}
              onHoverChange={interactions.handleTableHoverChange}
              onStartDrag={interactions.handleTableStartDrag}
              onStartConnectFk={
                readOnly ? undefined : interactions.handleTableStartConnectFk
              }
              onToggleColorPicker={interactions.handleToggleColorPicker}
              onCloseColorPicker={interactions.handleCloseColorPicker}
              onChangeTableHeaderColor={onChangeTableHeaderColor}
            />
          );
        })}

        {culledStickyNotes.map((note) => {
          let isNoteDimmed = false;
          if (
            focusNeighborhood.active &&
            note.linkedTarget?.startsWith('table:')
          ) {
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
              onStartDrag={interactions.handleStickyNoteStartDrag}
              onUpdate={onUpdateStickyNote}
              onDelete={onDeleteStickyNote}
            />
          );
        })}

        <CanvasInteractionOverlays
          activeGuides={interactions.activeGuides}
          connectPreview={interactions.connectPreview}
          marqueeRect={interactions.marqueeRect}
        />
      </div>

      {!readOnly && !layoutLocked && (
        <MultiSelectAlignBar
          selectedCount={effectiveSelectedPosKeys.length}
          onAlign={interactions.handleAlignSelected}
          onClearSelection={interactions.clearSelection}
        />
      )}

      <DomainFilterBar
        tableGroups={schema.tableGroups}
        ungroupedCount={ungroupedCount}
        selectedDomains={selectedDomains}
        selectedDomainSet={selectedDomainSet}
        isFilteringDomains={isFilteringDomains}
        domainMenuOpen={interactions.domainMenuOpen}
        filterMenuRef={filterMenuRef}
        onSetDomainMenuOpen={interactions.setDomainMenuOpen}
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
        collapsedGroupCount={visibleGroupBoxes.filter((gb) => gb.collapsed).length}
        totalGroupCount={visibleGroupBoxes.length}
        onSetAllGroupsCollapsed={onSetAllGroupsCollapsed}
      />

      {(culledInstances.length < visibleInstances.length ||
        activeLod !== 'full') && (
        <div
          aria-label="Canvas virtualization status"
          className={`absolute left-4 ${
            showMinimap ? 'sm:bottom-34 bottom-4' : 'bottom-4'
          } z-10 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums pointer-events-none`}
        >
          <span>
            {culledInstances.length} / {visibleInstances.length} tables
          </span>
          {activeLod !== 'full' && (
            <>
              <span className="mx-1.5 text-slate-400" aria-hidden="true">
                ·
              </span>
              <span>
                {activeLod === 'minimal' ? 'Minimal LOD' : 'Compact LOD'}
              </span>
            </>
          )}
        </div>
      )}

      {showMinimap && (
        <DiagramMinimap
          visibleGroupBoxes={visibleGroupBoxes}
          visibleInstances={visibleInstances}
          tableRects={visibleTableRects}
          selectedTableId={selectedTableId}
          darkMode={darkMode}
          bounds={minimapBounds}
          viewportRect={minimapViewportRect}
          onJumpToPoint={panToWorldPoint}
        />
      )}

      <CanvasToolbar
        cursorMode={cursorMode}
        focusMode={focusMode}
        routingMode={routingMode}
        detailLevel={detailLevel}
        detailMenuOpen={interactions.detailMenuOpen}
        detailMenuRef={detailMenuRef}
        snapGrid={snapGrid}
        showMinimap={showMinimap}
        autoLod={autoLod}
        showCardinality={showCardinality}
        zoom={viewport.zoom}
        onUpdateCursorMode={interactions.handleSetCursorMode}
        onToggleFocusMode={() => updateFocusMode((prev) => !prev)}
        onToggleRoutingMode={toggleRoutingMode}
        onToggleDetailMenu={() =>
          interactions.setDetailMenuOpen((o) => !o)
        }
        onCloseDetailMenu={() => interactions.setDetailMenuOpen(false)}
        onChangeDetailLevel={onChangeDetailLevel}
        onToggleAutoLod={toggleAutoLod}
        onToggleShowCardinality={toggleShowCardinality}
        onAutoLayout={() => {
          if (!layoutLocked) onAutoLayout();
        }}
        onAddNoteAtCenter={handleAddNoteAtCenter}
        onToggleSnapGrid={() => setSnapGrid((s) => !s)}
        onToggleMinimap={() => setShowMinimap((m) => !m)}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitView={fitVisibleTables}
        readOnly={readOnly}
        onResetLayout={onResetLayout}
        hasCustomLayout={hasCustomLayout}
        layoutLocked={layoutLocked}
        onToggleLayoutLocked={toggleLayoutLocked}
      />
    </div>
  );
};
