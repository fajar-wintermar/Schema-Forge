import React from 'react';
import { KeyRound, Link2, Palette, Share2 } from 'lucide-react';
import { DetailLevel, TablePosition } from '@shared/domain/schemaTypes';
import { TABLE_WIDTH, TableInstance } from '../../../utils/autoLayout';
import { getContrastTextColor } from '../../../utils/importExport';
import { stripMarkdownToPlainText } from '../../markdown/markdownUtils';
import type { CanvasLodTier } from '../canvasVirtualization';
import { CursorMode, HEADER_SWATCHES } from '../types';

export interface TableCardProps {
  instance: TableInstance;
  pos: TablePosition;
  detailLevel: DetailLevel;
  lod?: CanvasLodTier;
  cardHeight?: number;
  fkSet?: Set<string>;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isHovered: boolean;
  isConnectingFk?: boolean;
  connectTargetCol?: string | null;
  focusState?: 'focused' | 'neighbor' | 'dimmed' | 'normal';
  highlightedColumn?: { tableId: string; columnName: string } | null;
  colorPickerOpen: boolean;
  cursorMode: CursorMode;
  darkMode: boolean;
  onHoverChange: (tableId: string, hovered: boolean) => void;
  onStartDrag: (inst: TableInstance, e: React.PointerEvent) => void;
  onStartConnectFk?: (
    inst: TableInstance,
    colName: string,
    side: 'left' | 'right',
    e: React.PointerEvent
  ) => void;
  onToggleColorPicker: (posKey: string) => void;
  onCloseColorPicker: () => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
  readOnly?: boolean;
}

const TableCardComponent: React.FC<TableCardProps> = ({
  instance: inst,
  pos,
  detailLevel,
  lod = 'full',
  cardHeight,
  fkSet,
  isSelected,
  isMultiSelected = false,
  isHovered,
  isConnectingFk = false,
  connectTargetCol = null,
  focusState = 'normal',
  highlightedColumn,
  colorPickerOpen,
  cursorMode,
  darkMode,
  onHoverChange,
  onStartDrag,
  onStartConnectFk,
  onToggleColorPicker,
  onCloseColorPicker,
  onChangeTableHeaderColor,
  readOnly = false,
}) => {
  const table = inst.table;
  const headerBg = table.headerColor || (darkMode ? '#1e293b' : '#0f172a');
  const headerText = getContrastTextColor(headerBg);
  const isShared = inst.sharedGroups.length > 1;

  const selectionBorderClass =
    focusState === 'dimmed'
      ? 'opacity-25 hover:opacity-85 border-slate-300 dark:border-slate-700'
      : isSelected || isMultiSelected || focusState === 'focused'
      ? 'border-blue-600 ring-2 ring-blue-500/35 z-20'
      : focusState === 'neighbor'
      ? 'border-blue-400 dark:border-blue-500 ring-1 ring-blue-400/40 z-10'
      : isHovered
      ? 'border-slate-400 dark:border-slate-500 z-10'
      : 'border-slate-300 dark:border-slate-700';

  // Minimal LOD: Ultra-lightweight macro block for zoomed-out 150+ table enterprise views
  if (lod === 'minimal') {
    const pkCount = table.columns.reduce((acc, c) => acc + (c.pk ? 1 : 0), 0);
    return (
      <div
        data-table-card={table.id}
        data-pos-key={inst.posKey}
        data-lod="minimal"
        data-selected={isSelected || isMultiSelected ? 'true' : 'false'}
        style={{
          left: pos.x,
          top: pos.y,
          width: TABLE_WIDTH,
          height: cardHeight ?? 76,
        }}
        onMouseEnter={() => {
          if (cursorMode !== 'pan') onHoverChange(table.id, true);
        }}
        onMouseLeave={() => onHoverChange(table.id, false)}
        onPointerDown={(e) => {
          if (cursorMode === 'pan') return;
          e.stopPropagation();
          onStartDrag(inst, e);
        }}
        className={`absolute rounded-lg border bg-white dark:bg-slate-900 select-none overflow-hidden flex flex-col ${
          cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto cursor-move'
        } ${selectionBorderClass}`}
      >
        <div
          style={{ backgroundColor: headerBg }}
          className="h-3 w-full shrink-0"
        />
        <div className="flex-1 px-3 py-2 flex flex-col justify-center min-h-0">
          <div className="text-[16px] font-bold leading-tight text-slate-900 dark:text-slate-100 truncate">
            {table.id}
          </div>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-0.5 truncate">
            {table.columns.length} cols
            {pkCount > 0 ? ` · ${pkCount} pk` : ''}
            {isShared ? ` · ${inst.sharedGroups.length} domains` : ''}
          </div>
        </div>
      </div>
    );
  }

  // Compact LOD: Preserves exact footprint & header + lightweight key summary (no icons/handles)
  if (lod === 'compact') {
    const keyCols = table.columns.filter(
      (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
    );
    const previewCols = (keyCols.length > 0 ? keyCols : table.columns).slice(0, 5);
    const hiddenCount = Math.max(0, table.columns.length - previewCols.length);

    return (
      <div
        data-table-card={table.id}
        data-pos-key={inst.posKey}
        data-lod="compact"
        data-selected={isSelected || isMultiSelected ? 'true' : 'false'}
        style={{
          left: pos.x,
          top: pos.y,
          width: TABLE_WIDTH,
          height: cardHeight,
        }}
        onMouseEnter={() => {
          if (cursorMode !== 'pan') onHoverChange(table.id, true);
        }}
        onMouseLeave={() => onHoverChange(table.id, false)}
        onPointerDown={(e) => {
          if (cursorMode === 'pan') return;
          e.stopPropagation();
          onStartDrag(inst, e);
        }}
        className={`absolute rounded-lg border bg-white dark:bg-slate-900 select-none overflow-hidden flex flex-col ${
          cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
        } ${selectionBorderClass}`}
      >
        <div
          style={{ backgroundColor: headerBg, color: headerText }}
          className="h-10 px-3 rounded-t-[7px] flex items-center justify-between gap-2 cursor-move shrink-0"
        >
          <span className="text-[14px] font-semibold truncate">{table.id}</span>
          <span className="text-[11px] font-mono opacity-80 tabular-nums shrink-0">
            {table.columns.length}c
          </span>
        </div>
        {detailLevel !== 'names' && (
          <div className="px-3 py-1.5 flex-1 min-h-0 overflow-hidden space-y-1 text-xs">
            {previewCols.map((col) => (
              <div
                key={col.name}
                className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
              >
                <span className={col.pk ? 'font-semibold truncate' : 'truncate'}>
                  {col.pk ? 'PK ' : fkSet?.has(col.name) ? 'FK ' : ''}
                  {col.name}
                </span>
                <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                  {col.type}
                </span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums pt-0.5">
                +{hiddenCount} more fields
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const visibleCols =
    detailLevel === 'names'
      ? []
      : detailLevel === 'keys'
      ? table.columns.filter(
          (c) => c.pk || c.unique || (fkSet ? fkSet.has(c.name) : false)
        )
      : table.columns;

  const rowH = detailLevel === 'full' ? 30 : 26;

  return (
    <div
      data-table-card={table.id}
      data-pos-key={inst.posKey}
      data-lod="full"
      data-selected={isSelected || isMultiSelected ? 'true' : 'false'}
      style={{
        left: pos.x,
        top: pos.y,
        width: TABLE_WIDTH,
      }}
      onMouseEnter={() => {
        if (cursorMode !== 'pan') onHoverChange(table.id, true);
      }}
      onMouseLeave={() => onHoverChange(table.id, false)}
      onPointerDown={(e) => {
        if (cursorMode === 'pan') return;
        e.stopPropagation();
        onStartDrag(inst, e);
      }}
      className={`absolute rounded-lg border bg-white dark:bg-slate-900 select-none transition-opacity ${
        cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
      } ${selectionBorderClass}`}
    >
      {/* Table Header */}
      <div
        style={{ backgroundColor: headerBg, color: headerText }}
        className="h-10 px-3 rounded-t-[7px] flex items-center justify-between gap-2 cursor-move"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold truncate">{table.id}</span>
          {table.appliedPartials && table.appliedPartials.length > 0 && (
            <span
              title={`Inherits TablePartial: ${table.appliedPartials
                .map((p) => `~${p}`)
                .join(', ')}`}
              className="text-[10px] font-mono opacity-80 shrink-0"
            >
              ~{table.appliedPartials.length}
            </span>
          )}
        </div>
        {!readOnly && (
          <div
            className="flex items-center gap-1 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onToggleColorPicker(inst.posKey)}
              title="Customize table header color"
              className="p-1 rounded hover:bg-black/15 transition-colors"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Header Color Picker Popover */}
      {colorPickerOpen && (
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
                  onCloseColorPicker();
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
                onCloseColorPicker();
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
            const isDropTarget = connectTargetCol === col.name;
            const canConnect =
              !readOnly && cursorMode !== 'pan' && Boolean(onStartConnectFk);

            return (
              <div
                key={col.name}
                data-fk-col={`${table.id}.${col.name}`}
                style={{ height: rowH }}
                className={`group/colrow relative px-3 flex items-center justify-between gap-2 text-xs transition-colors ${
                  isDropTarget
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/25 ring-1 ring-inset ring-emerald-500'
                    : isColHighlighted
                    ? 'bg-blue-500/15 dark:bg-blue-500/25 ring-1 ring-inset ring-blue-500/70'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
                title={
                  [col.note, col.check ? `CHECK (${col.check})` : null]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              >
                {canConnect && (
                  <>
                    <button
                      type="button"
                      data-fk-handle={`${table.id}.${col.name}:left`}
                      aria-label={`Drag from ${table.id}.${col.name} left handle to create Ref`}
                      title={`Drag to another column to create a Ref from ${table.id}.${col.name}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onStartConnectFk?.(inst, col.name, 'left', e);
                      }}
                      className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 bg-blue-600 dark:bg-blue-500 shadow-xs cursor-crosshair transition-opacity z-20 ${
                        isDropTarget
                          ? 'opacity-100 bg-emerald-500 scale-110'
                          : isConnectingFk
                          ? 'opacity-70 hover:opacity-100 hover:scale-110'
                          : 'opacity-0 group-hover/colrow:opacity-100 hover:scale-110'
                      }`}
                    />
                    <button
                      type="button"
                      data-fk-handle={`${table.id}.${col.name}:right`}
                      aria-label={`Drag from ${table.id}.${col.name} right handle to create Ref`}
                      title={`Drag to another column to create a Ref from ${table.id}.${col.name}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onStartConnectFk?.(inst, col.name, 'right', e);
                      }}
                      className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 bg-blue-600 dark:bg-blue-500 shadow-xs cursor-crosshair transition-opacity z-20 ${
                        isDropTarget
                          ? 'opacity-100 bg-emerald-500 scale-110'
                          : isConnectingFk
                          ? 'opacity-70 hover:opacity-100 hover:scale-110'
                          : 'opacity-0 group-hover/colrow:opacity-100 hover:scale-110'
                      }`}
                    />
                  </>
                )}

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

      {/* Table Note / Indexes / Checks footer in Full Detail mode */}
      {detailLevel === 'full' &&
        (table.note || table.indexes.length > 0 || table.checks.length > 0) && (
          <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 rounded-b-lg text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {table.note
              ? stripMarkdownToPlainText(table.note)
              : [
                  table.indexes.length > 0
                    ? `${table.indexes.length} index${
                        table.indexes.length > 1 ? 'es' : ''
                      }`
                    : null,
                  table.checks.length > 0
                    ? `${table.checks.length} check${
                        table.checks.length > 1 ? 's' : ''
                      }`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </div>
        )}
    </div>
  );
};

export const TableCard = React.memo(TableCardComponent);
