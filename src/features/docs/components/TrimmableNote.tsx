import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MarkdownContent } from '../../../components/MarkdownContent';
import { trimNotePreview } from '../noteUtils';

export interface TrimmableNoteProps {
  content: string;
  compact?: boolean;
  inlineShort?: boolean;
  maxChars?: number;
  defaultExpanded?: boolean;
}

export const TrimmableNote: React.FC<TrimmableNoteProps> = ({
  content,
  compact = false,
  inlineShort = false,
  maxChars = 180,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { preview, isTrimmed } = useMemo(
    () => trimNotePreview(content, maxChars),
    [content, maxChars]
  );

  if (!isTrimmed) {
    return (
      <MarkdownContent
        content={content}
        inline={inlineShort}
        compact={!inlineShort && compact}
      />
    );
  }

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(true);
          }
        }}
        className="group cursor-pointer text-left space-y-1"
      >
        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
          {preview}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 group-hover:underline">
          <ChevronDown className="w-3 h-3" />
          <span>Show full note</span>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <MarkdownContent content={content} compact={compact} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(false);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
      >
        <ChevronUp className="w-3 h-3" />
        <span>Trim note</span>
      </button>
    </div>
  );
};
