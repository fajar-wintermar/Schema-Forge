import React from 'react';
import { KeyRound, Link2, Palette, Share2 } from 'lucide-react';
import { DetailLevel, TablePosition } from '../../../types/schema';
import { TABLE_WIDTH, TableInstance } from '../../../utils/autoLayout';
import { getContrastTextColor } from '../../../utils/importExport';
import { stripMarkdownToPlainText } from '../../../components/MarkdownContent';
import { CursorMode, HEADER_SWATCHES } from '../types';

export interface TableCardProps {
  instance: TableInstance;
  pos: TablePosition;
  detailLevel: DetailLevel;
  fkSet?: Set<string>;
  isSelected: boolean;
  isHovered: boolean;
  highlightedColumn?: { tableId: string; columnName: string } | null;
  colorPickerOpen: boolean;
  cursorMode: CursorMode;
  darkMode: boolean;
  onHoverChange: (hovered: boolean) => void;
  onStartDrag: (e: React.PointerEvent) => void;
  onToggleColorPicker: () => void;
  onCloseColorPicker: () => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
}

export const TableCard: React.FC<TableCardProps> = ({
  instance: inst,
  pos,
  detailLevel,
  fkSet,
  isSelected,
  isHovered,
  highlightedColumn,
  colorPickerOpen,
  cursorMode,
  darkMode,
  onHoverChange,
  onStartDrag,
  onToggleColorPicker,
  onCloseColorPicker,
  onChangeTableHeaderColor,
}) => {
  const table = inst.table;
  const headerBg = table.headerColor || (darkMode ? '#1e293b' : '#0f172a');
  const headerText = getContrastTextColor(headerBg);
  const isShared = inst.sharedGroups.length > 1;

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
      style={{
        left: pos.x,
        top: pos.y,
        width: TABLE_WIDTH,
      }}
      onMouseEnter={() => {
        if (cursorMode === 'select') onHoverChange(true);
      }}
      onMouseLeave={() => onHoverChange(false)}
      onPointerDown={(e) => {
        if (cursorMode === 'pan') return;
        e.stopPropagation();
        onStartDrag(e);
      }}
      className={`absolute rounded-lg border bg-white dark:bg-slate-900 select-none transition-opacity ${
        cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
      } ${
        isSelected
          ? 'border-blue-600 ring-2 ring-blue-500/30 z-10'
          : isHovered
          ? 'border-slate-400 dark:border-slate-500 z-10'
          : 'border-slate-300 dark:border-slate-700'
      }`}
    >
      {/* Table Header */}
      <div
        style={{ backgroundColor: headerBg, color: headerText }}
        className="h-10 px-3 rounded-t-[7px] flex items-center justify-between gap-2 cursor-move"
      >
        <span className="text-[13px] font-semibold truncate">{table.id}</span>
        <div
          className="flex items-center gap-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onToggleColorPicker}
            title="Customize table header color"
            className="p-1 rounded hover:bg-black/15 transition-colors"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </div>
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
      {detailLevel === 'full' && (table.note || table.indexes.length > 0) && (
        <div className="px-3 py-1.5 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 rounded-b-lg text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {table.note
            ? stripMarkdownToPlainText(table.note)
            : `${table.indexes.length} index${
                table.indexes.length > 1 ? 'es' : ''
              }`}
        </div>
      )}
    </div>
  );
};
