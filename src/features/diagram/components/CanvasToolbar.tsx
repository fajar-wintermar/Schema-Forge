import React from 'react';
import {
  BoxSelect,
  Check,
  ChevronUp,
  CornerDownRight,
  Crosshair,
  Grid,
  Hand,
  Lock,
  Map as MapIcon,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  Rows3,
  Sparkles,
  Spline,
  StickyNote as StickyNoteIcon,
  Unlock,
} from 'lucide-react';
import { DetailLevel } from '@shared/domain/schemaTypes';
import type { EdgeRoutingMode } from '../../../utils/io/edgeGeometry';
import type { CursorMode } from '../types';

export interface CanvasToolbarProps {
  cursorMode: CursorMode;
  focusMode: boolean;
  routingMode: EdgeRoutingMode;
  detailLevel: DetailLevel;
  detailMenuOpen: boolean;
  detailMenuRef: React.RefObject<HTMLDivElement | null>;
  snapGrid: boolean;
  showMinimap: boolean;
  autoLod: boolean;
  showCardinality: boolean;
  zoom: number;
  onUpdateCursorMode: (mode: CursorMode) => void;
  onToggleFocusMode: () => void;
  onToggleRoutingMode: () => void;
  onToggleDetailMenu: () => void;
  onCloseDetailMenu: () => void;
  onChangeDetailLevel: (level: DetailLevel) => void;
  onToggleAutoLod: () => void;
  onToggleShowCardinality: () => void;
  onAutoLayout: () => void;
  onAddNoteAtCenter: () => void;
  onToggleSnapGrid: () => void;
  onToggleMinimap: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitView: () => void;
  readOnly?: boolean;
  onResetLayout?: () => void;
  hasCustomLayout?: boolean;
  layoutLocked?: boolean;
  onToggleLayoutLocked?: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  cursorMode,
  focusMode,
  routingMode,
  detailLevel,
  detailMenuOpen,
  detailMenuRef,
  snapGrid,
  showMinimap,
  autoLod,
  showCardinality,
  zoom,
  onUpdateCursorMode,
  onToggleFocusMode,
  onToggleRoutingMode,
  onToggleDetailMenu,
  onCloseDetailMenu,
  onChangeDetailLevel,
  onToggleAutoLod,
  onToggleShowCardinality,
  onAutoLayout,
  onAddNoteAtCenter,
  onToggleSnapGrid,
  onToggleMinimap,
  onZoomOut,
  onZoomIn,
  onFitView,
  readOnly = false,
  onResetLayout,
  hasCustomLayout = false,
  layoutLocked = false,
  onToggleLayoutLocked,
}) => (
  <div
    onPointerDown={(e) => e.stopPropagation()}
    className="absolute bottom-4 right-4 z-20 flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm max-w-[calc(100%-2rem)]"
  >
    {/* Cursor Mode Toggle */}
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80"
      role="group"
      aria-label="Diagram cursor mode"
    >
      <button
        type="button"
        onClick={() => onUpdateCursorMode('select')}
        title="Select & Drag Objects (V) — hold Shift + drag canvas for box multi-select"
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          cursorMode === 'select'
            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <MousePointer2 className="w-3.5 h-3.5 shrink-0" />
        <span>Select</span>
      </button>
      <button
        type="button"
        onClick={() => onUpdateCursorMode('marquee')}
        title="Box Multi-Select (M) — drag rectangle on canvas to select multiple tables"
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          cursorMode === 'marquee'
            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <BoxSelect className="w-3.5 h-3.5 shrink-0" />
        <span>Box</span>
      </button>
      <button
        type="button"
        onClick={() => onUpdateCursorMode('pan')}
        title="Move Canvas Only (H) — drag anywhere to pan without selecting or moving objects"
        className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
          cursorMode === 'pan'
            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <Hand className="w-3.5 h-3.5 shrink-0" />
        <span>Pan</span>
      </button>
    </div>

    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

    {/* Table Fields Visibility Selector */}
    <div ref={detailMenuRef} className="relative">
      <button
        type="button"
        onClick={onToggleDetailMenu}
        title="Show or hide table fields (All fields, Keys only, Table names only)"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
      >
        <Rows3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>
          {detailLevel === 'keys'
            ? 'Keys Only'
            : detailLevel === 'names'
            ? 'Names Only'
            : 'All Fields'}
        </span>
        <ChevronUp className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {detailMenuOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden z-30">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Table Detail Visibility
          </div>
          <div className="p-1.5 space-y-0.5">
            {[
              {
                id: 'all' as const,
                label: 'All table fields',
                desc: 'Show every column and data type',
                active: detailLevel === 'full' || detailLevel === 'columns',
                onSelect: () =>
                  onChangeDetailLevel(
                    detailLevel === 'columns' ? 'columns' : 'full'
                  ),
              },
              {
                id: 'keys' as const,
                label: 'Keys only',
                desc: 'Show PK, FK, and unique columns',
                active: detailLevel === 'keys',
                onSelect: () => onChangeDetailLevel('keys'),
              },
              {
                id: 'names' as const,
                label: 'Table names only',
                desc: 'Show only table headers',
                active: detailLevel === 'names',
                onSelect: () => onChangeDetailLevel('names'),
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  opt.onSelect();
                  onCloseDetailMenu();
                }}
                className={`w-full px-2.5 py-2 rounded-lg text-left flex items-start justify-between gap-2 transition-colors ${
                  opt.active
                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold leading-tight">
                    {opt.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {opt.desc}
                  </div>
                </div>
                {opt.active && (
                  <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>

          {(detailLevel === 'full' || detailLevel === 'columns') && (
            <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
              <label className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <span>Include notes &amp; indexes</span>
                <input
                  type="checkbox"
                  checked={detailLevel === 'full'}
                  onChange={(e) =>
                    onChangeDetailLevel(e.target.checked ? 'full' : 'columns')
                  }
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            </div>
          )}

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
            <label
              title="Show 1 and N foreign key cardinality labels on relationship connectors"
              className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <span>Show FK cardinality</span>
              <input
                type="checkbox"
                checked={showCardinality}
                onChange={onToggleShowCardinality}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
            <label
              title="Automatically simplifies distant cards and edges when zoomed out on large schemas"
              className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <span>Auto LOD when zoomed out</span>
              <input
                type="checkbox"
                checked={autoLod}
                onChange={onToggleAutoLod}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>
        </div>
      )}
    </div>

    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

    <button
      type="button"
      onClick={onToggleFocusMode}
      title={
        focusMode
          ? 'Focus Neighborhood Mode: On (F) — click any table to isolate 1-hop neighbors'
          : 'Focus Neighborhood Mode: Off (F) — isolate 1-hop upstream/downstream tables'
      }
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
        focusMode
          ? 'bg-blue-600 text-white shadow-xs'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <Crosshair
        className={`w-3.5 h-3.5 shrink-0 ${
          focusMode ? 'text-white' : 'text-blue-600 dark:text-blue-400'
        }`}
      />
      <span>Focus</span>
    </button>

    <button
      type="button"
      onClick={onToggleRoutingMode}
      title={
        routingMode === 'orthogonal'
          ? 'Edge routing: Orthogonal right-angle (click to switch to Curved Bézier)'
          : 'Edge routing: Curved Bézier (click to switch to Orthogonal right-angle)'
      }
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
        routingMode === 'orthogonal'
          ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {routingMode === 'orthogonal' ? (
        <CornerDownRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
      ) : (
        <Spline className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
      )}
      <span>{routingMode === 'orthogonal' ? 'Ortho' : 'Curved'}</span>
    </button>

    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

    <button
      type="button"
      onClick={onAutoLayout}
      disabled={layoutLocked}
      title={
        layoutLocked
          ? 'Layout is locked — unlock to run Auto Layout'
          : 'Auto-arrange TableGroups and tables to minimize edge overlaps'
      }
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
      <span>Auto Layout</span>
    </button>

    {!readOnly && onToggleLayoutLocked && (
      <button
        type="button"
        onClick={onToggleLayoutLocked}
        title={
          layoutLocked
            ? 'Layout Locked — click to unlock dragging & Auto Layout'
            : 'Lock Layout — prevent accidental table, group, or note dragging'
        }
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
          layoutLocked
            ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 shadow-xs'
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {layoutLocked ? (
          <Lock className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Unlock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        )}
        <span>{layoutLocked ? 'Locked' : 'Lock'}</span>
      </button>
    )}

    {onResetLayout && hasCustomLayout && !layoutLocked && (
      <button
        type="button"
        onClick={onResetLayout}
        title="Reset view layout back to original shared positions"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-950/80 transition-colors whitespace-nowrap"
      >
        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
        <span>Reset</span>
      </button>
    )}

    {!readOnly && (
      <>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

        <button
          type="button"
          onClick={onAddNoteAtCenter}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-900/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/70 transition-colors"
          title="Add a Sticky Note annotation to the diagram"
        >
          <StickyNoteIcon className="w-3.5 h-3.5" />
          <span>Add Note</span>
        </button>
      </>
    )}

    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

    <button
      type="button"
      onClick={onToggleSnapGrid}
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
      onClick={onToggleMinimap}
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
      onClick={onZoomOut}
      title="Zoom out"
      className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <Minus className="w-3.5 h-3.5" />
    </button>
    <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-11 text-center tabular-nums">
      {Math.round(zoom * 100)}%
    </span>
    <button
      type="button"
      onClick={onZoomIn}
      title="Zoom in"
      className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      onClick={onFitView}
      title="Fit diagram to viewport"
      className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <Maximize2 className="w-3.5 h-3.5" />
    </button>
  </div>
);
