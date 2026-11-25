import React, { useState } from 'react';
import {
  BookOpen,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
} from 'lucide-react';
import type { SchemaVersion } from '@shared/domain/schemaTypes';
import type { CreateShareInput } from '../../hooks/useWorkspaceShares';
import {
  type ExpirationMode,
  getDefaultCustomExpirationValue,
  getMinDateTimeLocalValue,
  parseExpirationMode,
} from '../../share/shareExpirationForm';

interface CreateShareFormProps {
  publishedVersions: SchemaVersion[];
  creating: boolean;
  onCreateShare: (input: CreateShareInput) => Promise<boolean>;
}

export const CreateShareForm: React.FC<CreateShareFormProps> = ({
  publishedVersions,
  creating,
  onCreateShare,
}) => {
  const [label, setLabel] = useState('');
  const [pinnedVersionTag, setPinnedVersionTag] = useState<string>('live');
  const [defaultView, setDefaultView] = useState<'docs' | 'diagram'>('docs');
  const [allowDiagramExport, setAllowDiagramExport] = useState(false);
  const [expiresMode, setExpiresMode] = useState<ExpirationMode>('never');
  const [customExpiresAt, setCustomExpiresAt] = useState<string>(() =>
    getDefaultCustomExpirationValue()
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onCreateShare({
      label,
      pinnedVersionTag,
      defaultView,
      allowDiagramExport,
      expiresMode,
      customExpiresAt,
    });
    if (ok) {
      setLabel('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-3.5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Create New Share Link
        </h3>
        <span className="text-[11px] text-slate-400">
          Viewers get read-only Docs &amp; Diagram access
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Link Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Product & Backend Team"
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Schema Target
          </label>
          <select
            value={pinnedVersionTag}
            onChange={(e) => setPinnedVersionTag(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="live">
              Latest Live Workspace (+ Published Versions)
            </option>
            {publishedVersions.map((v) => (
              <option key={v.id} value={v.tag}>
                Pinned Snapshot: {v.tag} — {v.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Landing View
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setDefaultView('docs')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                defaultView === 'docs'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </button>
            <button
              type="button"
              onClick={() => setDefaultView('diagram')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                defaultView === 'diagram'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Diagram</span>
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Expiration
          </label>
          <select
            value={expiresMode}
            onChange={(e) => {
              const mode = parseExpirationMode(e.target.value);
              setExpiresMode(mode);
              if (mode === 'custom' && !customExpiresAt) {
                setCustomExpiresAt(getDefaultCustomExpirationValue());
              }
            }}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="never">Never expires</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="custom">Custom date &amp; time...</option>
          </select>
        </div>

        {expiresMode === 'custom' && (
          <div className="sm:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Custom Expiration Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={customExpiresAt}
              min={getMinDateTimeLocalValue()}
              onChange={(e) => setCustomExpiresAt(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        <div className="sm:col-span-2 flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                Allow Diagram Export (PNG / SVG)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Let viewers download PNG or SVG snapshots of the diagram
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={allowDiagramExport}
            aria-label="Allow Diagram Export (PNG / SVG)"
            onClick={() => setAllowDiagramExport((v) => !v)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
              allowDiagramExport
                ? 'bg-blue-600'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                allowDiagramExport ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          <span>
            {creating ? 'Creating Link...' : 'Generate & Copy Share Link'}
          </span>
        </button>
      </div>
    </form>
  );
};
