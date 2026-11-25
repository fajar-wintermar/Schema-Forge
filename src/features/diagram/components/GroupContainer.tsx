import React from 'react';
import { Edit3, Eye, EyeOff, Sparkles } from 'lucide-react';
import { TableGroupDef } from '@shared/domain/schemaTypes';
import { GroupBoundingBox } from '../../../utils/autoLayout';
import { stripMarkdownToPlainText } from '../../markdown/markdownUtils';
import type { CanvasLodTier } from '../canvasVirtualization';
import type { CursorMode } from '../types';

export interface GroupContainerProps {
  groupBox: GroupBoundingBox;
  groupObj?: TableGroupDef;
  cursorMode: CursorMode;
  darkMode: boolean;
  lod?: CanvasLodTier;
  isOnlySelected: boolean;
  isDropTarget: boolean;
  isDimmed?: boolean;
  altPressedDuringDrag: boolean;
  onStartDrag: (groupBox: GroupBoundingBox, e: React.PointerEvent) => void;
  onToggleOnlyDomain: (groupName: string, isOnlySelected: boolean) => void;
  onAutoLayoutGroup: (groupName: string) => void;
  onEditGroup: (group: TableGroupDef) => void;
  readOnly?: boolean;
}

const GroupContainerComponent: React.FC<GroupContainerProps> = ({
  groupBox: gb,
  groupObj,
  cursorMode,
  darkMode,
  lod = 'full',
  isOnlySelected,
  isDropTarget,
  isDimmed = false,
  altPressedDuringDrag,
  onStartDrag,
  onToggleOnlyDomain,
  onAutoLayoutGroup,
  onEditGroup,
  readOnly = false,
}) => {
  const color = gb.color || '#2563EB';
  return (
    <div
      style={{
        left: gb.x,
        top: gb.y,
        width: gb.width,
        height: gb.height,
        borderColor: isDropTarget ? '#2563EB' : `${color}66`,
        backgroundColor: `${color}${darkMode ? '14' : '0d'}`,
      }}
      className={`absolute rounded-2xl border-2 border-dashed transition-opacity ${
        cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
      } ${isDimmed ? 'opacity-30' : ''} ${
        isDropTarget ? 'ring-4 ring-blue-500/30 border-solid' : ''
      }`}
    >
      <div
        onPointerDown={(e) => {
          if (cursorMode === 'pan') return;
          e.stopPropagation();
          onStartDrag(gb, e);
        }}
        className="flex items-center justify-between gap-3 px-4 py-2.5 select-none cursor-move"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-xs shrink-0"
            style={{ backgroundColor: color }}
          />
          <span
            className={`${
              lod === 'minimal' ? 'text-base' : 'text-sm'
            } font-bold text-slate-900 dark:text-slate-100 truncate`}
          >
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

        {lod !== 'minimal' && (
          <div
            className="flex items-center gap-1 shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onToggleOnlyDomain(gb.name, isOnlySelected)}
              title={
                isOnlySelected ? 'Show all domains' : 'Show only this domain'
              }
              className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/70"
            >
              {isOnlySelected ? (
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
            {!readOnly && groupObj && (
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
        )}
      </div>
      {lod === 'full' && gb.note && (
        <div className="px-4 -mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {stripMarkdownToPlainText(gb.note)}
        </div>
      )}
    </div>
  );
};

export const GroupContainer = React.memo(GroupContainerComponent);
