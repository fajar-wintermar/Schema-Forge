import React, { useState } from 'react';
import { FolderPlus, Plus, Trash2, X } from 'lucide-react';
import { WorkspaceProject } from '../../../types/schema';

interface WorkspacesModalProps {
  workspaces: WorkspaceProject[];
  activeId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateBlank: (name: string) => void;
  onLoadSampleTelemetry: () => void;
  onCreateModularProject?: () => void;
  onDeleteWorkspace: (id: string) => void;
  onClose: () => void;
}

export const WorkspacesModal: React.FC<WorkspacesModalProps> = ({
  workspaces,
  activeId,
  onSelectWorkspace,
  onCreateBlank,
  onLoadSampleTelemetry,
  onCreateModularProject,
  onDeleteWorkspace,
  onClose,
}) => {
  const [newName, setNewName] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateBlank(newName.trim());
    setNewName('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Local Schema Workspaces
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persisted automatically in browser IndexedDB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New project name..."
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </form>

          <div className="space-y-2">
            <button
              type="button"
              onClick={onLoadSampleTelemetry}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span>Create from Template: Multi-Tenant SaaS Telemetry</span>
              </span>
              <span className="text-blue-600 dark:text-blue-400">Load</span>
            </button>

            {onCreateModularProject && (
              <button
                type="button"
                onClick={onCreateModularProject}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <span className="flex items-center gap-2 text-left">
                  <FolderPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Create Modular Project (<code className="font-mono">schema/*.dbml</code> → merged{' '}
                    <code className="font-mono">schema.dbml</code>)
                  </span>
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 shrink-0">Create</span>
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeId;
              return (
                <div
                  key={ws.id}
                  className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {ws.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {ws.versions.length} versions · Updated{' '}
                      {new Date(ws.updatedAt).toLocaleDateString()}
                    </div>
                  </button>

                  {workspaces.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteWorkspace(ws.id)}
                      title="Delete workspace"
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
