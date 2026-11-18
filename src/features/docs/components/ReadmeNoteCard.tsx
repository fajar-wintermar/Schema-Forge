import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import {
  MarkdownContent,
  extractMarkdownHeadings,
} from '../../../components/MarkdownContent';
import { trimNotePreview } from '../noteUtils';

export interface ReadmeNoteCardProps {
  title: string;
  subtitle?: string;
  content: string;
  accentColor?: string;
  defaultExpanded?: boolean;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export const ReadmeNoteCard: React.FC<ReadmeNoteCardProps> = ({
  title,
  subtitle,
  content,
  accentColor,
  defaultExpanded = true,
  scrollContainerRef,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const { preview, words, readMins } = useMemo(() => {
    const info = trimNotePreview(content, 240);
    const mins = Math.max(1, Math.round(info.words / 200));
    return { preview: info.preview, words: info.words, readMins: mins };
  }, [content]);

  const scrollToHeading = (id: string) => {
    const container = scrollContainerRef?.current;
    if (!container) return;
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    const target = container.querySelector(`#${escaped}`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {accentColor ? (
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: accentColor }}
            />
          ) : (
            <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </span>
          {subtitle && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {subtitle}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
          <span className="tabular-nums hidden sm:inline">
            {words} words · ~{readMins} min read
          </span>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Trim note</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Show full note</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!expanded ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded(true);
            }
          }}
          className="px-6 py-4 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors space-y-2"
        >
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed max-w-4xl">
            {preview}
          </p>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            <span>Click to read full note</span>
            <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      ) : (
        <>
          {headings.length >= 2 && (
            <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                Contents
              </span>
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => scrollToHeading(h.id)}
                  className={`text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${
                    h.level === 1
                      ? 'font-semibold text-slate-700 dark:text-slate-200'
                      : h.level === 2
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {h.text}
                </button>
              ))}
            </div>
          )}
          <div className="px-6 py-5 lg:px-8 lg:py-6">
            <div className="max-w-4xl">
              <MarkdownContent content={content} />
            </div>
          </div>
        </>
      )}
    </section>
  );
};
