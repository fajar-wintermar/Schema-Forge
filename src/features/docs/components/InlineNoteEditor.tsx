import React, { useEffect, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';

interface InlineNoteEditorProps {
  initialValue: string;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  onSave: (nextValue: string) => void;
  onCancel: () => void;
}

export const InlineNoteEditor: React.FC<InlineNoteEditorProps> = ({
  initialValue,
  label,
  placeholder = 'Write documentation note (Markdown supported)...',
  compact = false,
  onSave,
  onCancel,
}) => {
  const [draft, setDraft] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

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
        compact ? 'p-2.5 space-y-2' : 'p-4 space-y-2.5'
      }`}
    >
      {label && (
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          <span>{label}</span>
          <span className="font-normal text-slate-400">
            Markdown supported · Ctrl/⌘+Enter to save
          </span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={compact ? 3 : 5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
      />
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
