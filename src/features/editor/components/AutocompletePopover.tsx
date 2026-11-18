import React from 'react';
import { kindColor } from '../dbmlLanguage';
import { AutocompleteItem } from '../types';

interface AutocompletePopoverProps {
  items: AutocompleteItem[];
  activeIndex: number;
  top: number;
  left: number;
  onSelect: (item: AutocompleteItem) => void;
  onHoverIndex: (idx: number) => void;
}

export const AutocompletePopover: React.FC<AutocompletePopoverProps> = ({
  items,
  activeIndex,
  top,
  left,
  onSelect,
  onHoverIndex,
}) => {
  return (
    <div
      style={{ top, left }}
      className="absolute z-40 w-[280px] max-w-[90%] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
    >
      <div className="px-2.5 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
        <span>Suggestions</span>
        <span className="font-mono">↑↓ · Tab/Enter</span>
      </div>
      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100/70 dark:divide-slate-800/70">
        {items.map((item, idx) => {
          const active = idx === activeIndex;
          return (
            <button
              key={`${item.kind}:${item.label}:${idx}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              onMouseEnter={() => onHoverIndex(idx)}
              className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                active
                  ? 'bg-blue-50 dark:bg-blue-950/60'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-[10px] font-mono uppercase w-9 shrink-0 ${kindColor(
                    item.kind
                  )}`}
                >
                  {item.kind}
                </span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                  {item.label}
                </span>
              </div>
              {item.detail && (
                <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                  {item.detail}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
