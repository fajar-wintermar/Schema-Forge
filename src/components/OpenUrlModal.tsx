import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Globe,
  Link2,
  Loader2,
  X,
} from 'lucide-react';
import { UrlFileLink } from '../types/schema';
import { isAbortError } from '../utils/apiClient';
import { fetchDbmlFromUrl, RemoteFetchResult } from '../utils/remoteService';

interface OpenUrlModalProps {
  currentUrlLink?: UrlFileLink;
  onLoadUrlResult: (
    result: RemoteFetchResult,
    openInNewWorkspace: boolean
  ) => void;
  onClose: () => void;
}

export const OpenUrlModal: React.FC<OpenUrlModalProps> = ({
  currentUrlLink,
  onLoadUrlResult,
  onClose,
}) => {
  const [urlInput, setUrlInput] = useState(currentUrlLink?.url || '');
  const [openAsNew, setOpenAsNew] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const activeShareTarget = urlInput.trim() || currentUrlLink?.url || '';
  const shareableViewerUrl =
    activeShareTarget && typeof window !== 'undefined'
      ? `${window.location.origin}/?url=${encodeURIComponent(activeShareTarget)}`
      : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = urlInput.trim();
    if (!target) {
      setError('Enter a DBML URL to load.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchDbmlFromUrl(target, controller.signal);
      if (controller.signal.aborted) return;
      onLoadUrlResult(result, openAsNew);
      onClose();
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : 'Failed to load DBML from URL.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareableViewerUrl) return;
    try {
      await navigator.clipboard.writeText(shareableViewerUrl);
      setCopiedShare(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedShare(false);
      }, 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                Open DBML from URL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Load any raw .dbml file, GitHub file URL, or GitHub Gist
              </p>
            </div>
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
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              DBML File URL
            </label>
            <div className="relative">
              <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="url"
                required
                autoFocus
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setError(null);
                }}
                placeholder="https://github.com/owner/repo/blob/main/schema.dbml"
                className="w-full pl-8 pr-3 py-2 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              GitHub blob URLs are automatically resolved to raw content and linked for syncing.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="urlTargetMode"
                checked={openAsNew}
                onChange={() => setOpenAsNew(true)}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Open in new workspace</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="radio"
                name="urlTargetMode"
                checked={!openAsNew}
                onChange={() => setOpenAsNew(false)}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Replace current workspace</span>
            </label>
          </div>

          {shareableViewerUrl && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Direct Viewer Link
                </span>
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {copiedShare ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {shareableViewerUrl}
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? 'Loading...' : 'Load DBML'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
