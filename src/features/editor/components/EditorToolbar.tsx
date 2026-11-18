import React from 'react';
import {
  Code2,
  FolderTree,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  Search,
} from 'lucide-react';

interface EditorToolbarProps {
  isModular: boolean;
  isMergedPreview: boolean;
  activeFilePath?: string;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  onEnableModularMode?: () => void;
  findOpen: boolean;
  onOpenFind: () => void;
  isMaximized: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  modKey: string;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isModular,
  isMergedPreview,
  activeFilePath,
  explorerOpen,
  onToggleExplorer,
  onEnableModularMode,
  findOpen,
  onOpenFind,
  isMaximized,
  onToggleMaximize,
  onMinimize,
  modKey,
}) => {
  return (
    <div className="h-10 shrink-0 px-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-900/70">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 min-w-0">
        {isModular ? (
          <button
            type="button"
            onClick={onToggleExplorer}
            title={
              explorerOpen
                ? 'Hide schema file explorer'
                : 'Show schema file explorer'
            }
            aria-label="Toggle schema file explorer"
            className={`p-1 rounded transition-colors shrink-0 ${
              explorerOpen
                ? 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Code2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="font-mono truncate">
          {isMergedPreview
            ? 'schema.dbml (generated)'
            : isModular && activeFilePath
            ? activeFilePath
            : 'schema.dbml'}
        </span>
        {!isMergedPreview && (
          <span className="hidden xl:inline text-[10px] text-slate-400 font-normal whitespace-nowrap">
            · Ctrl+Space autocomplete
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isModular && onEnableModularMode && (
          <button
            type="button"
            onClick={onEnableModularMode}
            title="Split single DBML into per-table files under schema/ and merge schema.dbml on the fly"
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/70 transition-colors whitespace-nowrap"
          >
            <FolderTree className="w-3 h-3" />
            <span className="hidden sm:inline">Split to schema/</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenFind}
          title={`Find & Replace (${modKey}F / ${modKey}H)`}
          aria-label="Find and replace in editor"
          className={`p-1.5 rounded transition-colors ${
            findOpen
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        {onToggleMaximize && (
          <button
            type="button"
            onClick={onToggleMaximize}
            title={
              isMaximized
                ? `Restore split view (${modKey}⇧E)`
                : `Maximize editor (${modKey}⇧E)`
            }
            aria-label={isMaximized ? 'Restore split view' : 'Maximize editor'}
            className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {onMinimize && (
          <button
            type="button"
            onClick={onMinimize}
            title={`Minimize editor (${modKey}\\)`}
            aria-label="Minimize editor"
            className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
