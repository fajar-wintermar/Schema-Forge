import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const noteBodyRef = useRef<HTMLDivElement | null>(null);

  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const { preview, words, readMins } = useMemo(() => {
    const info = trimNotePreview(content, 240);
    const mins = Math.max(1, Math.round(info.words / 200));
    return { preview: info.preview, words: info.words, readMins: mins };
  }, [content]);

  useEffect(() => {
    if (!expanded) {
      setActiveHeadingId(null);
      return;
    }
    const outer = scrollContainerRef?.current;
    if (!outer || headings.length < 2) return;

    const updateActiveHeading = () => {
      const bodyEl = noteBodyRef.current;
      if (!bodyEl) return;
      const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
      const thresholdTop = outer.getBoundingClientRect().top + stickyHeight + 28;
      let currentId: string | null = headings[0]?.id ?? null;
      for (const h of headings) {
        const escaped =
          typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(h.id) : h.id;
        const el = bodyEl.querySelector(`#${escaped}`);
        if (el instanceof HTMLElement && el.getBoundingClientRect().top <= thresholdTop) {
          currentId = h.id;
        }
      }
      setActiveHeadingId(currentId);
    };

    updateActiveHeading();
    outer.addEventListener('scroll', updateActiveHeading, { passive: true });
    return () => {
      outer.removeEventListener('scroll', updateActiveHeading);
    };
  }, [expanded, headings, scrollContainerRef]);

  const scrollToHeading = (id: string) => {
    const escaped =
      typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
    const bodyEl = noteBodyRef.current;
    if (!bodyEl) return;
    const target = bodyEl.querySelector(`#${escaped}`);
    if (!(target instanceof HTMLElement)) return;

    const outer = scrollContainerRef?.current;
    if (outer) {
      const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
      const offset =
        target.getBoundingClientRect().top -
        outer.getBoundingClientRect().top +
        outer.scrollTop -
        stickyHeight -
        16;
      outer.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveHeadingId(id);
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-10 shrink-0 rounded-t-[11px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs"
      >
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 rounded-t-[11px] flex flex-wrap items-center justify-between gap-3">
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

        {expanded && headings.length >= 2 && (
          <div className="px-6 py-2.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] shrink-0">
              Contents
            </span>
            {headings.map((h) => {
              const isActive = activeHeadingId === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => scrollToHeading(h.id)}
                  className={`text-left transition-colors ${
                    isActive
                      ? 'font-semibold text-blue-600 dark:text-blue-400'
                      : h.level === 1
                      ? 'font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400'
                      : h.level === 2
                      ? 'text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
                  }`}
                >
                  {h.text}
                </button>
              );
            })}
          </div>
        )}
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
          className="px-6 py-4 rounded-b-[11px] cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors space-y-2"
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
        <div
          ref={noteBodyRef}
          className="px-6 py-5 lg:px-8 lg:py-6 rounded-b-[11px]"
        >
          <div className="max-w-4xl">
            <MarkdownContent content={content} />
          </div>
        </div>
      )}
    </section>
  );
};
