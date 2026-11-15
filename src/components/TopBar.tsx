import React from 'react';
import {
  BookOpen,
  ChevronDown,
  Columns2,
  Download,
  GitCommitHorizontal,
  Layers,
  LayoutGrid,
  Moon,
  PanelLeft,
  Sparkles,
  Sun,
} from 'lucide-react';
import { DetailLevel, ViewMode } from '../types/schema';

interface TopBarProps {
  projectName: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  detailLevel: DetailLevel;
  onChangeDetailLevel: (level: DetailLevel) => void;
  onAutoLayout: () => void;
  onOpenWorkspaces: () => void;
  onOpenImportExport: () => void;
  onOpenSaveVersion: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  errorCount: number;
}

const DETAIL_OPTIONS: Array<{ id: DetailLevel; label: string }> = [
  { id: 'full', label: 'Full' },
  { id: 'columns', label: 'Columns' },
  { id: 'keys', label: 'Keys' },
  { id: 'names', label: 'Names' },
];

const VIEW_OPTIONS: Array<{
  id: ViewMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'split', label: 'Split', Icon: Columns2 },
  { id: 'diagram', label: 'Diagram', Icon: LayoutGrid },
  { id: 'docs', label: 'Docs', Icon: BookOpen },
];

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  sidebarOpen,
  onToggleSidebar,
  viewMode,
  onChangeViewMode,
  detailLevel,
  onChangeDetailLevel,
  onAutoLayout,
  onOpenWorkspaces,
  onOpenImportExport,
  onOpenSaveVersion,
  darkMode,
  onToggleDarkMode,
  errorCount,
}) => {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-4 select-none z-20">
      {/* Left: Sidebar toggle + Wordmark + Project Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0">
          SchemaForge
        </span>

        <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
          /
        </span>

        <button
          type="button"
          onClick={onOpenWorkspaces}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0 max-w-[240px]"
          title="Switch or create local workspace"
        >
          <span className="truncate">{projectName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {errorCount > 0 && (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0 tabular-nums">
            {errorCount} syntax {errorCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      {/* Center: View Mode + Detail Level + Auto-Layout */}
      <div className="hidden lg:flex items-center gap-3">
        <div
          className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70"
          role="group"
          aria-label="Workspace View Mode"
        >
          {VIEW_OPTIONS.map(({ id, label, Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeViewMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70"
          role="group"
          aria-label="Table Detail Level"
          title="Control table detail visibility"
        >
          <Layers className="w-3.5 h-3.5 text-slate-400 mx-1.5 shrink-0" />
          {DETAIL_OPTIONS.map((opt) => {
            const active = detailLevel === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeDetailLevel(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAutoLayout}
          title="Auto-arrange TableGroups and tables to minimize edge overlaps"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Auto Layout</span>
        </button>
      </div>

      {/* Right: Theme, Import/Export, Primary Save Version CTA */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onOpenImportExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Import / Export</span>
        </button>

        <button
          type="button"
          onClick={onOpenSaveVersion}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <GitCommitHorizontal className="w-3.5 h-3.5" />
          <span>Save Version</span>
        </button>
      </div>
    </header>
  );
};
