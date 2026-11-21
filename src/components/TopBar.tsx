import React from 'react';
import {
  BookOpen,
  ChevronDown,
  Cloud,
  Columns2,
  Download,
  FolderGit2,
  GitCommitHorizontal,
  Keyboard,
  LayoutGrid,
  Link2,
  Loader2,
  Moon,
  PanelLeft,
  Search,
  Share2,
  Sun,
} from 'lucide-react';
import {
  CloudSyncStatus,
  GithubFileLink,
  GithubRepoLink,
  ViewMode,
} from '../types/schema';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  projectName: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onOpenCommandPalette: () => void;
  onOpenWorkspaces: () => void;
  onOpenUrlModal: () => void;
  onOpenGithubModal: () => void;
  onOpenImportExport: () => void;
  onOpenSaveVersion: () => void;
  onOpenShareModal: () => void;
  onOpenShortcuts: () => void;
  githubLink?: GithubFileLink;
  githubRepoLink?: GithubRepoLink;
  hasGithubChanges?: boolean;
  isCloudWorkspace?: boolean;
  cloudSyncStatus?: CloudSyncStatus;
  modKey: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  errorCount: number;
}

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
  onOpenCommandPalette,
  onOpenWorkspaces,
  onOpenUrlModal,
  onOpenGithubModal,
  onOpenImportExport,
  onOpenSaveVersion,
  onOpenShareModal,
  onOpenShortcuts,
  githubLink,
  githubRepoLink,
  hasGithubChanges = false,
  isCloudWorkspace = false,
  cloudSyncStatus = 'local',
  modKey,
  darkMode,
  onToggleDarkMode,
  errorCount,
}) => {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between gap-3 select-none z-30">
      {/* Left: Sidebar toggle + Wordmark + Project Switcher + Command Palette trigger */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggleSidebar}
          disabled={viewMode === 'docs'}
          title={
            viewMode === 'docs'
              ? 'Left sidebar is locked hidden in Docs view'
              : sidebarOpen
              ? `Hide Left Sidebar (${modKey}B)`
              : `Show Left Sidebar (${modKey}B)`
          }
          className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0 ${
            viewMode === 'docs'
              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <BrandLogo className="w-7 h-7 shrink-0" />
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
            SchemaForge
          </span>
        </div>

        <span
          className="text-slate-300 dark:text-slate-700 hidden sm:inline"
          aria-hidden="true"
        >
          /
        </span>

        <button
          type="button"
          onClick={onOpenWorkspaces}
          className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0 max-w-[210px]"
          title={
            isCloudWorkspace
              ? `Cloud workspace (${cloudSyncStatus}) — click to switch or sync`
              : 'Local IndexedDB workspace — click to switch or enable Cloud Sync'
          }
        >
          {isCloudWorkspace && (
            cloudSyncStatus === 'syncing' ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
            ) : (
              <Cloud
                className={`w-3.5 h-3.5 shrink-0 ${
                  cloudSyncStatus === 'error' || cloudSyncStatus === 'offline'
                    ? 'text-amber-500'
                    : 'text-blue-600 dark:text-blue-400'
                }`}
              />
            )
          )}
          <span className="truncate">{projectName}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>

        {/* Global Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          title={`Open Global Command Palette (${modKey}K)`}
          aria-label="Open Global Command Palette"
          className="relative flex-1 max-w-[290px] ml-1 flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">Search tables, notes, modules...</span>
          </span>
          <kbd className="hidden md:inline-block px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono text-slate-400 shrink-0">
            {modKey}K
          </kbd>
        </button>

        {errorCount > 0 && (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0 tabular-nums hidden xl:inline">
            {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      {/* Center: View Mode */}
      <div className="hidden lg:flex items-center gap-2.5 shrink-0">
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
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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
      </div>

      {/* Right: Shortcuts, Theme, Open URL, GitHub, Import/Export, Primary Save Version CTA */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts"
          aria-label="Keyboard shortcuts"
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Keyboard className="w-4 h-4" />
        </button>

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
          onClick={onOpenUrlModal}
          title="Open DBML from URL"
          aria-label="Open DBML from URL"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Open URL</span>
        </button>

        <button
          type="button"
          onClick={onOpenGithubModal}
          title={
            githubRepoLink
              ? `GitHub Folder: ${githubRepoLink.owner}/${githubRepoLink.repo}/${githubRepoLink.schemaFolder}/ (${githubRepoLink.branch}) · ${
                  hasGithubChanges ? 'Unpushed changes' : 'In sync'
                }`
              : githubLink
              ? `GitHub: ${githubLink.owner}/${githubLink.repo} (${githubLink.branch}) · ${
                  hasGithubChanges ? 'Unpushed changes' : 'In sync'
                }`
              : 'Load from or push DBML to GitHub'
          }
          aria-label="GitHub repository sync"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
            (githubRepoLink || githubLink) && hasGithubChanges
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">
            {githubRepoLink || githubLink
              ? hasGithubChanges
                ? 'Push GitHub'
                : 'GitHub'
              : 'GitHub'}
          </span>
          {(githubRepoLink || githubLink) && (
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                hasGithubChanges ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenImportExport}
          title={`Import / Export (${modKey}I)`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Import / Export</span>
          <span className="xl:hidden">Export</span>
        </button>

        <button
          type="button"
          onClick={onOpenShareModal}
          title="Share read-only docs & diagram link"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="hidden xl:inline">Share</span>
        </button>

        <button
          type="button"
          onClick={onOpenSaveVersion}
          title={`Save Version (${modKey}S)`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <GitCommitHorizontal className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Save Version</span>
          <span className="xl:hidden">Save</span>
        </button>
      </div>
    </header>
  );
};
