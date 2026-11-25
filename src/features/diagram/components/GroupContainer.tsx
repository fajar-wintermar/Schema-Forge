import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
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
  crossDomainLinkCount?: number;
  onStartDrag: (groupBox: GroupBoundingBox, e: React.PointerEvent) => void;
  onToggleOnlyDomain: (groupName: string, isOnlySelected: boolean) => void;
  onAutoLayoutGroup: (groupName: string) => void;
  onEditGroup: (group: TableGroupDef) => void;
  onToggleCollapse?: (groupName: string) => void;
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
  crossDomainLinkCount = 0,
  onStartDrag,
  onToggleOnlyDomain,
  onAutoLayoutGroup,
  onEditGroup,
  onToggleCollapse,
  readOnly = false,
}) => {
  const color = gb.color || '#2563EB';
  const notePreview = gb.note ? stripMarkdownToPlainText(gb.note) : '';

  if (gb.collapsed) {
    return (
      <div
        style={{
          left: gb.x,
          top: gb.y,
          width: gb.width,
          height: gb.height,
          borderColor: `${color}aa`,
          backgroundColor: darkMode
            ? 'rgba(15, 23, 42, 0.94)'
            : 'rgba(255, 255, 255, 0.96)',
        }}
        className={`absolute rounded-2xl border-2 border-solid shadow-md transition-opacity overflow-hidden ${
          cursorMode === 'pan' ? 'pointer-events-none' : 'pointer-events-auto'
        } ${isDimmed ? 'opacity-30' : ''}`}
      >
        <div
          style={{ backgroundColor: `${color}${darkMode ? '22' : '12'}` }}
          onPointerDown={(e) => {
            if (cursorMode === 'pan') return;
            e.stopPropagation();
            onStartDrag(gb, e);
          }}
          onDoubleClick={(e) => {
            if (cursorMode === 'pan' || !onToggleCollapse) return;
            e.stopPropagation();
            onToggleCollapse(gb.name);
          }}
          className="h-full flex flex-col justify-between px-4 py-2.5 select-none cursor-move"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-xs shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {gb.name}
              </span>
            </div>

            <div
              className="flex items-center gap-1 shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
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
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={() => onToggleCollapse(gb.name)}
                  title="Expand TableGroup"
                  aria-label={`Expand ${gb.name}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>Expand</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium tabular-nums shrink-0">
              <span>
                {gb.tables.length} {gb.tables.length === 1 ? 'table' : 'tables'}
              </span>
              {crossDomainLinkCount > 0 && (
                <>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {crossDomainLinkCount}{' '}
                    {crossDomainLinkCount === 1 ? 'link' : 'links'}
                  </span>
                </>
              )}
            </div>
            {notePreview && (
              <span className="text-slate-500 dark:text-slate-400 truncate">
                {notePreview}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

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
        onDoubleClick={(e) => {
          if (cursorMode === 'pan' || !onToggleCollapse) return;
          e.stopPropagation();
          onToggleCollapse(gb.name);
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
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {onToggleCollapse && (
              <button
                type="button"
                onClick={() => onToggleCollapse(gb.name)}
                title="Collapse TableGroup"
                aria-label={`Collapse ${gb.name}`}
                className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/70"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
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
      {lod === 'full' && notePreview && (
        <div className="px-4 -mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {notePreview}
        </div>
      )}
    </div>
  );
};

export const GroupContainer = React.memo(GroupContainerComponent);
