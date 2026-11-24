import React, { useCallback } from 'react';
import {
  CommandItem,
  CommandTargetView,
} from '../features/command/commandSearch';
import type { DocsSection } from '../features/docs/types';
import { DetailLevel, ViewMode } from '../types/schema';

interface FocusRequest {
  type: 'table' | 'group' | 'fit';
  id?: string;
  nonce: number;
}

interface DocsSectionRequest {
  section: DocsSection;
  nonce: number;
}

interface HighlightedColumn {
  tableId: string;
  columnName: string;
}

interface UseWorkspaceCommandHandlerOptions {
  viewMode: ViewMode;
  editorState: 'normal' | 'maximized' | 'minimized';
  effectiveSelectedDomains: string[];
  activeDetailLevel: DetailLevel;
  onChangeViewMode: (mode: ViewMode) => void;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  setEditorState: React.Dispatch<
    React.SetStateAction<'normal' | 'maximized' | 'minimized'>
  >;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedDomains: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedTableId: React.Dispatch<React.SetStateAction<string | null>>;
  setHighlightedColumn: React.Dispatch<
    React.SetStateAction<HighlightedColumn | null>
  >;
  setFocusRequest: React.Dispatch<React.SetStateAction<FocusRequest | null>>;
  setDocsSectionRequest: React.Dispatch<
    React.SetStateAction<DocsSectionRequest | null>
  >;
  setImportExportOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSaveVersionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGithubModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onAutoLayout: () => void;
  onSelectSchemaFile: (filePath: string) => void;
  onJumpToMergedLine: (line: number) => void;
  onChangeDetailLevel: (level: DetailLevel) => void;
  showToast: (msg: string) => void;
}

export function useWorkspaceCommandHandler({
  viewMode,
  editorState,
  effectiveSelectedDomains,
  activeDetailLevel,
  onChangeViewMode,
  setViewMode,
  setEditorState,
  setDarkMode,
  setSelectedDomains,
  setSelectedTableId,
  setHighlightedColumn,
  setFocusRequest,
  setDocsSectionRequest,
  setImportExportOpen,
  setSaveVersionOpen,
  setGithubModalOpen,
  setShortcutsOpen,
  onAutoLayout,
  onSelectSchemaFile,
  onJumpToMergedLine,
  onChangeDetailLevel,
  showToast,
}: UseWorkspaceCommandHandlerOptions) {
  return useCallback(
    (item: CommandItem, target: CommandTargetView = 'auto') => {
      if (item.kind === 'action' && item.actionId) {
        switch (item.actionId) {
          case 'view-split':
            onChangeViewMode('split');
            break;
          case 'view-diagram':
            onChangeViewMode('diagram');
            break;
          case 'view-docs':
            onChangeViewMode('docs');
            break;
          case 'auto-layout':
            if (viewMode === 'docs') setViewMode('split');
            onAutoLayout();
            break;
          case 'toggle-theme':
            setDarkMode((d) => !d);
            break;
          case 'import-export':
            setImportExportOpen(true);
            break;
          case 'save-version':
            setSaveVersionOpen(true);
            break;
          case 'github':
            setGithubModalOpen(true);
            break;
          case 'shortcuts':
            setShortcutsOpen(true);
            break;
        }
        return;
      }

      if (item.kind === 'file' || target === 'editor') {
        if (viewMode !== 'split') setViewMode('split');
        if (editorState === 'minimized') setEditorState('normal');
        if (item.filePath) {
          onSelectSchemaFile(item.filePath);
          showToast(`Opened ${item.title}`);
          return;
        }
        if (item.line) {
          onJumpToMergedLine(item.line);
          showToast(`Jumped to ${item.title} (Ln ${item.line})`);
        }
        return;
      }

      if (
        (target === 'docs' || (target === 'auto' && viewMode === 'docs')) &&
        item.docsSection
      ) {
        setViewMode('docs');
        setDocsSectionRequest({ section: item.docsSection, nonce: Date.now() });
        showToast(`Opened ${item.title} in Docs`);
        return;
      }

      if (item.kind === 'partial') {
        if (viewMode === 'split' && item.line) {
          if (editorState === 'minimized') setEditorState('normal');
          onJumpToMergedLine(item.line);
          showToast(`Jumped to ${item.title}`);
        } else if (item.docsSection) {
          setViewMode('docs');
          setDocsSectionRequest({
            section: item.docsSection,
            nonce: Date.now(),
          });
          showToast(`Opened ${item.title} in Docs`);
        }
        return;
      }

      if (item.kind === 'note' && !item.tableId && !item.groupName) {
        if (item.docsSection && (viewMode === 'docs' || !item.line)) {
          setViewMode('docs');
          setDocsSectionRequest({
            section: item.docsSection,
            nonce: Date.now(),
          });
          showToast(`Opened note "${item.title}"`);
        } else if (item.line) {
          if (viewMode === 'diagram') setViewMode('split');
          if (editorState === 'minimized') setEditorState('normal');
          onJumpToMergedLine(item.line);
          showToast(`Jumped to note "${item.title}"`);
        }
        return;
      }

      if (item.kind === 'group' && item.groupName) {
        setHighlightedColumn(null);
        setSelectedTableId(null);
        if (viewMode === 'docs') setViewMode('split');
        if (editorState === 'maximized') setEditorState('normal');
        setSelectedDomains([item.groupName]);
        if (item.line) onJumpToMergedLine(item.line);
        setFocusRequest({
          type: 'group',
          id: item.groupName,
          nonce: Date.now(),
        });
        showToast(`Showing domain "${item.groupName}"`);
        return;
      }

      if (item.tableId) {
        if (viewMode === 'docs') setViewMode('split');
        if (editorState === 'maximized') setEditorState('normal');
        if (
          effectiveSelectedDomains.length > 0 &&
          !item.domains.some((d) => effectiveSelectedDomains.includes(d))
        ) {
          setSelectedDomains([]);
        }
        setSelectedTableId(item.tableId);

        if (item.kind === 'column' && item.columnName) {
          setHighlightedColumn({
            tableId: item.tableId,
            columnName: item.columnName,
          });
          if (
            activeDetailLevel === 'names' ||
            (activeDetailLevel === 'keys' && !item.isPk)
          ) {
            onChangeDetailLevel('columns');
          }
          showToast(`Highlighted ${item.tableId}.${item.columnName}`);
        } else {
          setHighlightedColumn(null);
          showToast(`Focused table ${item.tableId}`);
        }

        if (item.line) onJumpToMergedLine(item.line);
        setFocusRequest({
          type: 'table',
          id: item.tableId,
          nonce: Date.now(),
        });
      }
    },
    [
      viewMode,
      editorState,
      effectiveSelectedDomains,
      activeDetailLevel,
      onChangeViewMode,
      setViewMode,
      setEditorState,
      setDarkMode,
      setSelectedDomains,
      setSelectedTableId,
      setHighlightedColumn,
      setFocusRequest,
      setDocsSectionRequest,
      setImportExportOpen,
      setSaveVersionOpen,
      setGithubModalOpen,
      setShortcutsOpen,
      onAutoLayout,
      onSelectSchemaFile,
      onJumpToMergedLine,
      onChangeDetailLevel,
      showToast,
    ]
  );
}
