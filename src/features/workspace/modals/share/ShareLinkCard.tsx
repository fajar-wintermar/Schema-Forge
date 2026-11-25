import React from 'react';
import {
  Check,
  Clock,
  Copy,
  Eye,
  Image as ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import type {
  SchemaVersion,
  ShareLinkRecord,
} from '@shared/domain/schemaTypes';
import {
  type ExpirationMode,
  formatExpirationSummary,
} from '../../share/shareExpirationForm';
import { ShareLinkEditForm } from './ShareLinkEditForm';

interface ShareLinkCardProps {
  share: ShareLinkRecord;
  shareUrl: string;
  publishedVersions: SchemaVersion[];
  isCopied: boolean;
  isEditing: boolean;
  isTogglingExport: boolean;
  isDeleting: boolean;
  savingEdit: boolean;
  editLabel: string;
  editPinnedVersionTag: string;
  editDefaultView: 'docs' | 'diagram';
  editAllowDiagramExport: boolean;
  editExpiresMode: ExpirationMode;
  editCustomExpiresAt: string;
  onCopy: () => void;
  onPreview: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onToggleDiagramExport: () => void;
  onRevoke: () => void;
  onChangeEditLabel: (val: string) => void;
  onChangeEditPinnedVersionTag: (val: string) => void;
  onChangeEditDefaultView: (val: 'docs' | 'diagram') => void;
  onToggleEditAllowDiagramExport: () => void;
  onChangeEditExpiresMode: (mode: ExpirationMode) => void;
  onChangeEditCustomExpiresAt: (val: string) => void;
  onSubmitEdit: (e: React.FormEvent) => void;
}

export const ShareLinkCard: React.FC<ShareLinkCardProps> = ({
  share,
  shareUrl,
  publishedVersions,
  isCopied,
  isEditing,
  isTogglingExport,
  isDeleting,
  savingEdit,
  editLabel,
  editPinnedVersionTag,
  editDefaultView,
  editAllowDiagramExport,
  editExpiresMode,
  editCustomExpiresAt,
  onCopy,
  onPreview,
  onStartEdit,
  onCancelEdit,
  onToggleDiagramExport,
  onRevoke,
  onChangeEditLabel,
  onChangeEditPinnedVersionTag,
  onChangeEditDefaultView,
  onToggleEditAllowDiagramExport,
  onChangeEditExpiresMode,
  onChangeEditCustomExpiresAt,
  onSubmitEdit,
}) => {
  const isRevoked = Boolean(share.revokedAt);
  const isExpired = Boolean(
    share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()
  );
  const inactive = isRevoked || isExpired;

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 ${
        inactive && !isEditing
          ? 'border-slate-200/70 dark:border-slate-800/70 bg-slate-50/40 dark:bg-slate-900/40 opacity-75'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Link2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {share.label || 'Read-Only Share Link'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300">
            {share.pinnedVersionTag || 'Live'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-[10px] font-medium text-blue-700 dark:text-blue-300 capitalize">
            {share.defaultView}
          </span>
          {isRevoked ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-[10px] font-medium text-rose-600 dark:text-rose-400">
              Revoked
            </span>
          ) : isExpired ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Expired
            </span>
          ) : null}
        </div>

        {!isRevoked && (
          <div className="flex items-center gap-1.5 shrink-0">
            {!isExpired && (
              <>
                <button
                  type="button"
                  onClick={onCopy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {isCopied ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={onPreview}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  title="Open read-only viewer"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={isEditing ? onCancelEdit : onStartEdit}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
                isEditing
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Edit version target & expiration"
            >
              <Pencil className="w-3 h-3" />
              <span>{isEditing ? 'Editing' : 'Edit'}</span>
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onRevoke}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
              title="Delete share link"
              aria-label="Delete share link"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{formatExpirationSummary(share.expiresAt)}</span>
        </div>

        {!isRevoked ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
              <ImageIcon className="w-3 h-3 text-slate-400" />
              <span>PNG/SVG Export</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(share.allowDiagramExport)}
              aria-label={`Toggle PNG/SVG diagram export for ${share.label || 'share link'}`}
              disabled={isTogglingExport}
              onClick={onToggleDiagramExport}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
                share.allowDiagramExport
                  ? 'bg-blue-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs transition-transform ${
                  share.allowDiagramExport ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">
            {share.allowDiagramExport
              ? 'PNG/SVG export was enabled'
              : 'PNG/SVG export disabled'}
          </span>
        )}
      </div>

      {isEditing && (
        <ShareLinkEditForm
          share={share}
          publishedVersions={publishedVersions}
          savingEdit={savingEdit}
          editLabel={editLabel}
          editPinnedVersionTag={editPinnedVersionTag}
          editDefaultView={editDefaultView}
          editAllowDiagramExport={editAllowDiagramExport}
          editExpiresMode={editExpiresMode}
          editCustomExpiresAt={editCustomExpiresAt}
          onChangeLabel={onChangeEditLabel}
          onChangePinnedVersionTag={onChangeEditPinnedVersionTag}
          onChangeDefaultView={onChangeEditDefaultView}
          onToggleAllowDiagramExport={onToggleEditAllowDiagramExport}
          onChangeExpiresMode={onChangeEditExpiresMode}
          onChangeCustomExpiresAt={onChangeEditCustomExpiresAt}
          onCancel={onCancelEdit}
          onSubmit={onSubmitEdit}
        />
      )}

      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded border border-slate-200/70 dark:border-slate-700/60 truncate">
        {shareUrl}
      </div>
    </div>
  );
};
