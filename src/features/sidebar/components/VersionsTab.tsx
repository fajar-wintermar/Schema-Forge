import React from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { SchemaVersion } from '@shared/domain/schemaTypes';

export interface VersionsTabProps {
  versions: SchemaVersion[];
  onSaveVersion: () => void;
  onRestoreVersion: (version: SchemaVersion) => void;
  onTogglePublishVersion: (versionId: string) => void;
}

export const VersionsTab: React.FC<VersionsTabProps> = ({
  versions,
  onSaveVersion,
  onRestoreVersion,
  onTogglePublishVersion,
}) => (
  <div className="flex-1 flex flex-col min-h-0">
    <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
      <div>
        <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          Version Snapshots
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Stored locally in IndexedDB
        </p>
      </div>
      <button
        type="button"
        onClick={onSaveVersion}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Snapshot</span>
      </button>
    </div>

    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {versions.length === 0 ? (
        <div className="text-center py-8 px-4 text-xs text-slate-500 dark:text-slate-400">
          No snapshots yet. Save a version to track schema evolution and revert
          anytime.
        </div>
      ) : (
        versions.map((ver) => (
          <div
            key={ver.id}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                {ver.tag}
              </span>
              <button
                type="button"
                onClick={() => onTogglePublishVersion(ver.id)}
                className={`text-[11px] font-medium transition-colors ${
                  ver.isPublished
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                {ver.isPublished ? 'Published' : 'Draft · Publish'}
              </button>
            </div>
            <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
              {ver.title}
            </div>
            {ver.description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {ver.description}
              </p>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-slate-700/60">
              <span className="text-[11px] text-slate-400 tabular-nums">
                {new Date(ver.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <button
                type="button"
                onClick={() => onRestoreVersion(ver)}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Revert to this</span>
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);
