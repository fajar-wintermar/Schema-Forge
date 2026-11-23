import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  X,
} from 'lucide-react';
import type { AlignMode } from '../canvasGeometry';

interface MultiSelectAlignBarProps {
  selectedCount: number;
  onAlign: (mode: AlignMode) => void;
  onClearSelection: () => void;
}

export const MultiSelectAlignBar: React.FC<MultiSelectAlignBarProps> = ({
  selectedCount,
  onAlign,
  onClearSelection,
}) => {
  if (selectedCount < 2) return null;

  const canDistribute = selectedCount >= 3;

  return (
    <div
      role="toolbar"
      aria-label="Multi-select table alignment"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-sm"
    >
      <span className="text-[11px] font-mono font-semibold text-blue-600 dark:text-blue-400 px-1.5 tabular-nums whitespace-nowrap">
        {selectedCount} selected
      </span>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

      <button
        type="button"
        onClick={() => onAlign('left')}
        aria-label="Align left"
        title="Align selected tables left"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignStartVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('center')}
        aria-label="Align horizontal center"
        title="Align horizontal centers"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignCenterVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('right')}
        aria-label="Align right"
        title="Align selected tables right"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignEndVertical className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

      <button
        type="button"
        onClick={() => onAlign('top')}
        aria-label="Align top"
        title="Align selected tables top"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignStartHorizontal className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('middle')}
        aria-label="Align vertical middle"
        title="Align vertical centers"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignCenterHorizontal className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onAlign('bottom')}
        aria-label="Align bottom"
        title="Align selected tables bottom"
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <AlignEndHorizontal className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

      <button
        type="button"
        disabled={!canDistribute}
        onClick={() => onAlign('distribute-h')}
        aria-label="Distribute horizontally"
        title={
          canDistribute
            ? 'Distribute horizontally evenly'
            : 'Select at least 3 tables to distribute'
        }
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <AlignHorizontalSpaceAround className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={!canDistribute}
        onClick={() => onAlign('distribute-v')}
        aria-label="Distribute vertically"
        title={
          canDistribute
            ? 'Distribute vertically evenly'
            : 'Select at least 3 tables to distribute'
        }
        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none transition-colors"
      >
        <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />

      <button
        type="button"
        onClick={onClearSelection}
        aria-label="Clear multi-selection"
        title="Clear selection (Esc)"
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
