import { useEffect } from 'react';
import { ViewMode } from '../../../types/schema';

interface UseGlobalShortcutsOptions {
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocsNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditorState: React.Dispatch<
    React.SetStateAction<'normal' | 'maximized' | 'minimized'>
  >;
  shortcutsOpen: boolean;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openUrlOpen: boolean;
  setOpenUrlOpen: React.Dispatch<React.SetStateAction<boolean>>;
  githubModalOpen: boolean;
  setGithubModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  groupModalOpen: boolean;
  closeGroupModal: () => void;
  saveVersionOpen: boolean;
  setSaveVersionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  importExportOpen: boolean;
  setImportExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workspacesModalOpen: boolean;
  setWorkspacesModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useGlobalShortcuts({
  viewMode,
  setViewMode,
  setSidebarOpen,
  setDocsNavOpen,
  setEditorState,
  shortcutsOpen,
  setShortcutsOpen,
  openUrlOpen,
  setOpenUrlOpen,
  githubModalOpen,
  setGithubModalOpen,
  groupModalOpen,
  closeGroupModal,
  saveVersionOpen,
  setSaveVersionOpen,
  importExportOpen,
  setImportExportOpen,
  workspacesModalOpen,
  setWorkspacesModalOpen,
}: UseGlobalShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (openUrlOpen) setOpenUrlOpen(false);
        else if (githubModalOpen) setGithubModalOpen(false);
        else if (groupModalOpen) closeGroupModal();
        else if (saveVersionOpen) setSaveVersionOpen(false);
        else if (importExportOpen) setImportExportOpen(false);
        else if (workspacesModalOpen) setWorkspacesModalOpen(false);
        return;
      }

      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;

      const anyModalOpen =
        shortcutsOpen ||
        openUrlOpen ||
        githubModalOpen ||
        groupModalOpen ||
        saveVersionOpen ||
        importExportOpen ||
        workspacesModalOpen;

      const key = e.key.toLowerCase();

      // Mod + I: Toggle Import / Export
      if (!e.shiftKey && key === 'i') {
        e.preventDefault();
        if (!anyModalOpen || importExportOpen) {
          setImportExportOpen((o) => !o);
        }
        return;
      }

      // Mod + S: Open Save Version modal
      if (!e.shiftKey && key === 's') {
        e.preventDefault();
        if (!anyModalOpen) {
          setSaveVersionOpen(true);
        }
        return;
      }

      if (anyModalOpen) return;

      // Mod + B: Toggle Left Sidebar (locked hidden in Docs view)
      if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        if (viewMode !== 'docs') {
          setSidebarOpen((o) => !o);
        }
        return;
      }

      // Mod + J: Toggle Docs Navigation Tree Sidebar (when in Docs view)
      if (!e.shiftKey && key === 'j') {
        if (viewMode === 'docs') {
          e.preventDefault();
          setDocsNavOpen((o) => !o);
        }
        return;
      }

      // Mod + \: Toggle Code Editor (minimize / restore split)
      if (!e.shiftKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        if (viewMode !== 'split') {
          setViewMode('split');
          setEditorState('normal');
        } else {
          setEditorState((prev) =>
            prev === 'minimized' ? 'normal' : 'minimized'
          );
        }
        return;
      }

      // Mod + Shift + E: Toggle Maximize / Restore Code Editor
      if (e.shiftKey && key === 'e') {
        e.preventDefault();
        if (viewMode !== 'split') {
          setViewMode('split');
          setEditorState('maximized');
        } else {
          setEditorState((prev) =>
            prev === 'maximized' ? 'normal' : 'maximized'
          );
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewMode,
    setViewMode,
    setSidebarOpen,
    setDocsNavOpen,
    setEditorState,
    shortcutsOpen,
    setShortcutsOpen,
    openUrlOpen,
    setOpenUrlOpen,
    githubModalOpen,
    setGithubModalOpen,
    groupModalOpen,
    closeGroupModal,
    saveVersionOpen,
    setSaveVersionOpen,
    importExportOpen,
    setImportExportOpen,
    workspacesModalOpen,
    setWorkspacesModalOpen,
  ]);
}
