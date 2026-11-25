import React from 'react';
import {
  BookOpen,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import type {
  SchemaVersion,
  ShareLinkRecord,
} from '@shared/domain/schemaTypes';
import {
  type ExpirationMode,
  getDefaultCustomExpirationValue,
  getMinDateTimeLocalValue,
  parseExpirationMode,
} from '../../share/shareExpirationForm';

interface ShareLinkEditFormProps {
  share: ShareLinkRecord;
  publishedVersions: SchemaVersion[];
  savingEdit: boolean;
  editLabel: string;
  editPinnedVersionTag: string;
  editDefaultView: 'docs' | 'diagram';
  editAllowDiagramExport: boolean;
  editExpiresMode: ExpirationMode;
  editCustomExpiresAt: string;
  onChangeLabel: (val: string) => void;
  onChangePinnedVersionTag: (val: string) => void;
  onChangeDefaultView: (val: 'docs' | 'diagram') => void;
  onToggleAllowDiagramExport: () => void;
  onChangeExpiresMode: (mode: ExpirationMode) => void;
  onChangeCustomExpiresAt: (val: string) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const ShareLinkEditForm: React.FC<ShareLinkEditFormProps> = ({
  share,
  publishedVersions,
  savingEdit,
  editLabel,
  editPinnedVersionTag,
  editDefaultView,
  editAllowDiagramExport,
  editExpiresMode,
  editCustomExpiresAt,
  onChangeLabel,
  onChangePinnedVersionTag,
  onChangeDefaultView,
  onToggleAllowDiagramExport,
  onChangeExpiresMode,
  onChangeCustomExpiresAt,
  onCancel,
  onSubmit,
}) => {
  const hasPinnedOutsidePublished =
    Boolean(share.pinnedVersionTag) &&
    !publishedVersions.some((v) => v.tag === share.pinnedVersionTag);

  return (
    <form
      onSubmit={onSubmit}
      className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Link Label
          </label>
          <input
            type="text"
            value={editLabel}
            onChange={(e) => onChangeLabel(e.target.value)}
            placeholder="e.g. Product & Backend Team"
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Schema Target (Version)
          </label>
          <select
            value={editPinnedVersionTag}
            onChange={(e) => onChangePinnedVersionTag(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="live">
              Latest Live Workspace (+ Published Versions)
            </option>
            {hasPinnedOutsidePublished && share.pinnedVersionTag && (
              <option value={share.pinnedVersionTag}>
                Pinned Snapshot: {share.pinnedVersionTag}
              </option>
            )}
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
              onClick={() => onChangeDefaultView('docs')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                editDefaultView === 'docs'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Docs</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeDefaultView('diagram')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                editDefaultView === 'diagram'
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
            value={editExpiresMode}
            onChange={(e) => {
              const mode = parseExpirationMode(e.target.value);
              onChangeExpiresMode(mode);
              if (mode === 'custom' && !editCustomExpiresAt) {
                onChangeCustomExpiresAt(
                  getDefaultCustomExpirationValue(share.expiresAt)
                );
              }
            }}
            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="never">Never expires</option>
            <option value="1">1 day from now</option>
            <option value="7">7 days from now</option>
            <option value="30">30 days from now</option>
            <option value="90">90 days from now</option>
            <option value="custom">Custom date &amp; time...</option>
          </select>
        </div>

        {editExpiresMode === 'custom' && (
          <div className="sm:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Custom Expiration Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={editCustomExpiresAt}
              min={getMinDateTimeLocalValue()}
              onChange={(e) => onChangeCustomExpiresAt(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        <div className="sm:col-span-2 flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Allow Diagram Export (PNG / SVG)
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={editAllowDiagramExport}
            aria-label="Allow Diagram Export (PNG / SVG)"
            onClick={onToggleAllowDiagramExport}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
              editAllowDiagramExport
                ? 'bg-blue-600'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                editAllowDiagramExport ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={savingEdit}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={savingEdit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
        >
          {savingEdit && <Loader2 className="w-3 h-3 animate-spin" />}
          <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>
    </form>
  );
};
