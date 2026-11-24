import React from 'react';
import { Maximize2, PanelLeftOpen } from 'lucide-react';
import { MERGED_SCHEMA_VIEW_ID } from '../utils/schemaModules';

interface MinimizedEditorRailProps {
  modKey: string;
  isModular: boolean;
  activeSchemaFilePath?: string;
  errorCount: number;
  onRestore: () => void;
  onMaximize: () => void;
}

export const MinimizedEditorRail: React.FC<MinimizedEditorRailProps> = ({
  modKey,
  isModular,
  activeSchemaFilePath,
  errorCount,
  onRestore,
  onMaximize,
}) => (
  <div className="w-10 shrink-0 h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden md:flex flex-col items-center py-2.5 gap-2 select-none">
    <button
      type="button"
      onClick={onRestore}
      title={`Restore DBML editor (${modKey}\\)`}
      aria-label="Restore DBML editor"
      className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      <PanelLeftOpen className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={onMaximize}
      title={`Maximize DBML editor (${modKey}⇧E)`}
      aria-label="Maximize DBML editor"
      className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      <Maximize2 className="w-3.5 h-3.5" />
    </button>
    <div className="w-4 h-px bg-slate-200 dark:bg-slate-800 my-0.5" />
    <button
      type="button"
      onClick={onRestore}
      title={`Click to expand DBML editor (${modKey}\\)`}
      className="flex-1 flex items-center justify-center text-[11px] font-mono font-medium tracking-widest text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 [writing-mode:vertical-rl] rotate-180"
    >
      {isModular
        ? activeSchemaFilePath === MERGED_SCHEMA_VIEW_ID
          ? 'schema.dbml (merged)'
          : activeSchemaFilePath
        : 'schema.dbml'}
    </button>
    {errorCount > 0 && (
      <span
        title={`${errorCount} syntax issue(s)`}
        className="text-[10px] font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums"
      >
        {errorCount}
      </span>
    )}
  </div>
);
