import React, { useEffect, useRef, useState } from 'react';
import { Check, Columns2, Eye, PencilLine, Trash2, X } from 'lucide-react';
import { MarkdownContent } from '../../markdown/MarkdownContent';

interface InlineNoteEditorProps {
  initialValue: string;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  onSave: (nextValue: string) => void;
  onCancel: () => void;
}

type EditorMode = 'write' | 'split' | 'preview';

export const InlineNoteEditor: React.FC<InlineNoteEditorProps> = ({
  initialValue,
  label,
  placeholder = 'Write documentation note (Markdown supported)...',
  compact = false,
  onSave,
  onCancel,
}) => {
  const [draft, setDraft] = useState(initialValue);
  const [mode, setMode] = useState<EditorMode>(compact ? 'write' : 'split');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (mode === 'preview') return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onSave(draft.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className={`rounded-xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 shadow-xs ${
        compact ? 'p-2.5 space-y-2' : 'p-4 space-y-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          {label && <span>{label}</span>}
          <span className="font-normal text-slate-400">
            Markdown + tags (@pii, @owner(Team)) · Ctrl/⌘+Enter
          </span>
        </div>
        <div
          role="group"
          aria-label="Note editor preview mode"
          className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800"
        >
          {(
            [
              { id: 'write' as const, label: 'Write', Icon: PencilLine },
              { id: 'split' as const, label: 'Split', Icon: Columns2 },
              { id: 'preview' as const, label: 'Preview', Icon: Eye },
            ] as const
          ).map(({ id, label: btnLabel, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium transition-colors ${
                mode === id
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{btnLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={
          mode === 'split'
            ? 'grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch'
            : ''
        }
      >
        {mode !== 'preview' && (
          <textarea
            ref={textareaRef}
            rows={compact ? 4 : 7}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y min-h-[92px]"
          />
        )}

        {mode !== 'write' && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2 overflow-y-auto max-h-72 min-h-[92px]">
            {draft.trim() ? (
              <MarkdownContent content={draft} compact={compact} />
            ) : (
              <p className="text-[11px] italic text-slate-400">
                Live Markdown preview will appear here as you type...
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {initialValue.trim().length > 0 && (
            <button
              type="button"
              onClick={() => onSave('')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Note</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>Cancel</span>
          </button>
          <button
            type="button"
            onClick={() => onSave(draft.trim())}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Check className="w-3 h-3" />
            <span>Save Note</span>
          </button>
        </div>
      </div>
    </div>
  );
};
