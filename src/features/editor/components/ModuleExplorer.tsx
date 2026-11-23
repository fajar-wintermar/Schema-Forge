import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Edit3,
  FileCode2,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ParseError, SchemaModuleFile } from '../../../types/schema';
import { MERGED_SCHEMA_VIEW_ID } from '../../../utils/schemaModules';
import { SchemaTreeNode } from '../types';

interface ModuleExplorerProps {
  schemaFolder: string;
  sortedSchemaFiles: SchemaModuleFile[];
  schemaTreeNodes: SchemaTreeNode[];
  activeFilePath?: string;
  isMergedPreview: boolean;
  allErrorsByFile?: Record<string, ParseError[]>;
  fileSearch: string;
  onFileSearchChange: (val: string) => void;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (folderPath: string) => void;
  onSelectFile?: (path: string) => void;
  onCreateFile?: (path: string, content: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDeleteFile?: (path: string) => void;
  onFlattenToSingleFile?: () => void;
  onHideExplorer?: () => void;
  newFileOpen: boolean;
  setNewFileOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newFileName: string;
  setNewFileName: (val: string) => void;
  newFileIncludeStub: boolean;
  setNewFileIncludeStub: (val: boolean) => void;
  onCreateSubmit: (e: React.FormEvent) => void;
  renameTargetPath: string | null;
  setRenameTargetPath: (val: string | null) => void;
  renameValue: string;
  setRenameValue: (val: string) => void;
  onRenameSubmit: (e: React.FormEvent) => void;
  deleteTargetPath: string | null;
  setDeleteTargetPath: (val: string | null) => void;
}

export const ModuleExplorer: React.FC<ModuleExplorerProps> = ({
  schemaFolder,
  sortedSchemaFiles,
  schemaTreeNodes,
  activeFilePath,
  isMergedPreview,
  allErrorsByFile,
  fileSearch,
  onFileSearchChange,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onFlattenToSingleFile,
  onHideExplorer,
  newFileOpen,
  setNewFileOpen,
  newFileName,
  setNewFileName,
  newFileIncludeStub,
  setNewFileIncludeStub,
  onCreateSubmit,
  renameTargetPath,
  setRenameTargetPath,
  renameValue,
  setRenameValue,
  onRenameSubmit,
  deleteTargetPath,
  setDeleteTargetPath,
}) => {
  const renderTreeNodes = (nodes: SchemaTreeNode[], depth = 0): React.ReactNode => {
    const forceExpand = Boolean(fileSearch.trim());
    return nodes.map((node) => {
      if (node.kind === 'folder') {
        const isOpen = forceExpand || !collapsedFolders[node.path];
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => onToggleFolder(node.path)}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              className="w-full pr-2 py-1 flex items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              )}
              {isOpen ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              )}
              <span className="truncate flex-1 font-mono">{node.name}</span>
              {node.errorCount > 0 && (
                <span
                  title={`${node.errorCount} syntax issue(s)`}
                  className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"
                />
              )}
              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                {node.fileCount}
              </span>
            </button>
            {isOpen && <div>{renderTreeNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }

      const file = node.file;
      const active = activeFilePath === file.path;
      const fileErrCount = allErrorsByFile?.[file.path]?.length || 0;
      const isModified =
        file.lastSyncedContent !== undefined &&
        file.content !== file.lastSyncedContent;
      const isUntrackedNew =
        file.sha === undefined && file.lastSyncedContent === undefined;

      return (
        <div
          key={file.path}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          className={`group/tree-file pr-1.5 py-1 flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer ${
            active
              ? 'bg-blue-600/10 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 font-semibold border-l-2 border-blue-600 dark:border-blue-400'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border-l-2 border-transparent'
          }`}
          onClick={() => onSelectFile?.(file.path)}
          title={file.path}
        >
          <FileCode2
            className={`w-3.5 h-3.5 shrink-0 ${
              fileErrCount > 0
                ? 'text-rose-500'
                : active
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-400'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono">{node.name}</div>
            {node.matchedTables.length > 0 && (
              <div className="truncate text-[9.5px] text-slate-400 dark:text-slate-500 font-mono">
                Table: {node.matchedTables.join(', ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {(isModified || isUntrackedNew) && fileErrCount === 0 && (
              <span
                title={
                  isModified ? 'Modified since GitHub sync' : 'New local file'
                }
                className={`w-1.5 h-1.5 rounded-full shrink-0 mr-0.5 ${
                  isModified ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            )}
            {fileErrCount > 0 && (
              <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums mr-0.5">
                {fileErrCount}
              </span>
            )}
            {onRenameFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameTargetPath(file.path);
                  setRenameValue(file.path);
                  setNewFileOpen(false);
                  setDeleteTargetPath(null);
                }}
                title={`Rename ${file.path}`}
                aria-label={`Rename ${file.path}`}
                className="p-0.5 rounded opacity-0 group-hover/tree-file:opacity-100 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-300/50 dark:hover:bg-slate-700/70 transition-opacity"
              >
                <Edit3 className="w-3 h-3" />
              </button>
            )}
            {onDeleteFile && sortedSchemaFiles.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTargetPath(file.path);
                  setNewFileOpen(false);
                  setRenameTargetPath(null);
                }}
                title={`Delete ${file.path}`}
                aria-label={`Delete ${file.path}`}
                className="p-0.5 rounded opacity-0 group-hover/tree-file:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <aside
      aria-label="Schema File Explorer"
      className="w-[196px] sm:w-[216px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col min-h-0 select-none"
    >
      {/* Explorer Header */}
      <div className="px-2.5 py-1.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
            Explorer
          </span>
          <span className="text-[10px] font-mono text-slate-400 tabular-nums">
            {sortedSchemaFiles.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onCreateFile && (
            <button
              type="button"
              onClick={() => {
                setNewFileOpen((o) => !o);
                setRenameTargetPath(null);
                setDeleteTargetPath(null);
              }}
              title={`New .dbml file in ${schemaFolder}/`}
              aria-label={`New .dbml file in ${schemaFolder}/`}
              className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {onFlattenToSingleFile && (
            <button
              type="button"
              onClick={onFlattenToSingleFile}
              title="Flatten all modular files into a single schema.dbml"
              className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              Flatten
            </button>
          )}
          {onHideExplorer && (
            <button
              type="button"
              onClick={onHideExplorer}
              title="Hide explorer"
              aria-label="Hide explorer"
              className="p-1 rounded text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Explorer Search */}
      <div className="p-2 border-b border-slate-200/70 dark:border-slate-800/80">
        <div className="relative">
          <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={fileSearch}
            onChange={(e) => onFileSearchChange(e.target.value)}
            placeholder="Search files or tables..."
            aria-label="Search split schema files"
            className="w-full pl-6 pr-6 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          {fileSearch && (
            <button
              type="button"
              onClick={() => onFileSearchChange('')}
              aria-label="Clear file search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Create File Form */}
      {newFileOpen && (
        <form
          onSubmit={onCreateSubmit}
          className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1.5 text-[11px]"
        >
          <input
            type="text"
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            placeholder={`${schemaFolder}/payments.dbml`}
            className="w-full px-2 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <label className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={newFileIncludeStub}
              onChange={(e) => setNewFileIncludeStub(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>Include starter Table</span>
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-medium"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setNewFileOpen(false)}
              className="px-2 py-0.5 rounded text-[10.5px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Inline Rename File Form */}
      {renameTargetPath && (
        <form
          onSubmit={onRenameSubmit}
          className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 space-y-1.5 text-[11px]"
        >
          <div className="text-[10px] font-medium text-slate-500 truncate">
            Rename {renameTargetPath}
          </div>
          <input
            type="text"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full px-2 py-1 text-[11px] font-mono rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-medium"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenameTargetPath(null)}
              className="px-2 py-0.5 rounded text-[10.5px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Inline Delete Confirm */}
      {deleteTargetPath && (
        <div className="p-2 border-b border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 space-y-1.5 text-[11px]">
          <div className="text-[10.5px] text-rose-800 dark:text-rose-200 break-all">
            Delete{' '}
            <code className="font-mono font-semibold">{deleteTargetPath}</code>?
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onDeleteFile?.(deleteTargetPath);
                setDeleteTargetPath(null);
              }}
              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-medium"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setDeleteTargetPath(null)}
              className="px-2 py-0.5 rounded text-[10.5px] text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto py-1">
        {schemaTreeNodes.length === 0 ? (
          <div className="px-3 py-6 text-center space-y-1.5">
            <p className="text-[11px] text-slate-400">
              No files or tables match &ldquo;{fileSearch}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => onFileSearchChange('')}
              className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          renderTreeNodes(schemaTreeNodes, 0)
        )}
      </div>

      {/* Generated Merged Schema Output */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-1.5 bg-slate-100/60 dark:bg-slate-900/80">
        <div className="px-1.5 pb-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
          Generated Output
        </div>
        <button
          type="button"
          onClick={() => onSelectFile?.(MERGED_SCHEMA_VIEW_ID)}
          title="Preview on-the-fly merged schema.dbml (local only, never pushed to GitHub)"
          className={`w-full px-2 py-1.5 rounded flex items-center justify-between gap-1.5 text-[11px] font-mono transition-colors ${
            isMergedPreview
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-500/60 text-emerald-800 dark:text-emerald-200 font-semibold'
              : 'border border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/70'
          }`}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Layers className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">schema.dbml</span>
          </span>
          <span className="text-[9.5px] font-sans text-emerald-700 dark:text-emerald-300 shrink-0">
            merged
          </span>
        </button>
      </div>
    </aside>
  );
};
