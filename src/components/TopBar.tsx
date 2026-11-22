import React, { useEffect, useRef, useState } from 'react';
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
  MonitorDown,
  Moon,
  MoreHorizontal,
  PanelLeft,
  Search,
  Share2,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import {
  CloudSyncStatus,
  GithubFileLink,
  GithubRepoLink,
  ViewMode,
} from '../types/schema';
import { BrandLogo } from './BrandLogo';
import { usePWAInstall } from '../features/pwa/usePWAInstall';

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
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  useEffect(() => {
    if (!sourceMenuOpen && !moreMenuOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        sourceMenuOpen &&
        sourceMenuRef.current &&
        !sourceMenuRef.current.contains(target)
      ) {
        setSourceMenuOpen(false);
      }
      if (
        moreMenuOpen &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(target)
      ) {
        setMoreMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSourceMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sourceMenuOpen, moreMenuOpen]);

  const isGithubLinked = Boolean(githubRepoLink || githubLink);
  const githubSummary = githubRepoLink
    ? `${githubRepoLink.owner}/${githubRepoLink.repo}/${githubRepoLink.schemaFolder}/ (${githubRepoLink.branch})`
    : githubLink
    ? `${githubLink.owner}/${githubLink.repo} (${githubLink.branch})`
    : 'Load or push DBML files';

  const canInstallApp = !isInstalled && (isInstallable || isIOS);

  return (
    <>
      <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 sm:px-4 flex items-center justify-between gap-2 xl:gap-3 select-none z-30">
        {/* Left: Sidebar toggle + Brand + Workspace Switcher + Responsive Command Palette */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
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
            <span className="hidden xl:inline text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
              SchemaForge
            </span>
          </div>

          <span
            className="text-slate-300 dark:text-slate-700 shrink-0"
            aria-hidden="true"
          >
            /
          </span>

          {/* Workspace Switcher — uses min-w-0 shrink so long names truncate inside Left instead of colliding with Center */}
          <button
            type="button"
            onClick={onOpenWorkspaces}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0 shrink max-w-[260px] sm:max-w-[320px] lg:max-w-[340px] xl:max-w-[380px]"
            title={
              isCloudWorkspace
                ? `${projectName} — Cloud workspace (${cloudSyncStatus})`
                : `${projectName} — Local IndexedDB workspace`
            }
          >
            {isCloudWorkspace &&
              (cloudSyncStatus === 'syncing' ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
              ) : (
                <Cloud
                  className={`w-3.5 h-3.5 shrink-0 ${
                    cloudSyncStatus === 'error' || cloudSyncStatus === 'offline'
                      ? 'text-amber-500'
                      : 'text-blue-600 dark:text-blue-400'
                  }`}
                />
              ))}
            <span className="truncate whitespace-nowrap min-w-0">
              {projectName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Global Command Palette Trigger — compact icon button on mobile/tablet, full pill on xl+ */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            title={`Open Global Command Palette (${modKey}K)`}
            aria-label="Open Global Command Palette"
            className="shrink-0 flex items-center justify-center w-8 h-8 xl:w-44 2xl:w-56 xl:justify-between xl:gap-2 xl:px-2.5 xl:py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="hidden xl:inline truncate">
                Search tables, notes...
              </span>
            </span>
            <kbd className="hidden 2xl:inline-block px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-mono text-slate-400 shrink-0">
              {modKey}K
            </kbd>
          </button>

          {errorCount > 0 && (
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap shrink-0 tabular-nums hidden 2xl:inline">
              {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </div>

        {/* Center: View Mode Segmented Switch */}
        <div className="hidden lg:flex items-center shrink-0">
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
                  className={`flex items-center gap-1.5 px-2 xl:px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
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

        {/* Right: Tidy Grouped Controls — Source & Export dropdown | Primary Actions (Share, Save) | Utility Cluster (Theme, More) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Group 1: Source & Import/Export Dropdown */}
          <div className="relative" ref={sourceMenuRef}>
            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                setSourceMenuOpen((o) => !o);
              }}
              aria-expanded={sourceMenuOpen}
              aria-haspopup="menu"
              title="GitHub Sync, Open URL, and Import / Export"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                isGithubLinked && hasGithubChanges
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-950/50'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sync &amp; I/O</span>
              {isGithubLinked && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    hasGithubChanges ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              )}
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {sourceMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-50"
              >
                <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  Sources &amp; Files
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSourceMenuOpen(false);
                    onOpenGithubModal();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2.5"
                >
                  <FolderGit2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 font-medium">
                      <span>GitHub Sync</span>
                      {isGithubLinked && (
                        <span
                          className={`text-[10px] font-semibold ${
                            hasGithubChanges
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {hasGithubChanges ? 'Unpushed' : 'In sync'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {githubSummary}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSourceMenuOpen(false);
                    onOpenUrlModal();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                >
                  <Link2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span className="font-medium">Open DBML from URL</span>
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSourceMenuOpen(false);
                    onOpenImportExport();
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2.5">
                    <Download className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span className="font-medium">Import / Export</span>
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10px] font-mono text-slate-400">
                    {modKey}I
                  </kbd>
                </button>
              </div>
            )}
          </div>

          {/* Group 2: Primary Collaboration & Versioning Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenShareModal}
              title="Share read-only docs & diagram link"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              type="button"
              onClick={onOpenSaveVersion}
              title={`Save Version (${modKey}S)`}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Save Version</span>
              <span className="xl:hidden">Save</span>
            </button>
          </div>

          {/* Group 3: Compact Utility Cluster (Theme + More Dropdown) */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-x divide-slate-200 dark:divide-slate-700 shrink-0">
            <button
              type="button"
              onClick={onToggleDarkMode}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-1.5 rounded-l-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setSourceMenuOpen(false);
                  setMoreMenuOpen((o) => !o);
                }}
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                title="Shortcuts & App Options"
                aria-label="Shortcuts & App Options"
                className="relative p-1.5 rounded-r-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
                {canInstallApp && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400"
                  />
                )}
              </button>

              {moreMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1.5 z-50"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenShortcuts();
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5"
                  >
                    <Keyboard className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span className="font-medium">Keyboard Shortcuts</span>
                  </button>

                  {isInstallable && !isInstalled && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void install();
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 flex items-center gap-2.5"
                    >
                      <MonitorDown className="w-4 h-4 shrink-0" />
                      <span className="font-medium">Install Offline App</span>
                    </button>
                  )}

                  {isIOS && !isInstalled && !isInstallable && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setShowIOSGuide(true);
                      }}
                      className="w-full px-3 py-2 text-left text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-50/70 dark:hover:bg-blue-950/40 flex items-center gap-2.5"
                    >
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <span className="font-medium">Install on iPhone / iPad</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {showIOSGuide && (
        <div
          onClick={() => setShowIOSGuide(false)}
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                Install SchemaForge on iOS
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
              <li>
                Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Open SchemaForge from your Home Screen to work offline in
                standalone mode.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="mt-4 w-full py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
