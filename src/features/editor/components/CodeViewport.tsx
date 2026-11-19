import React from 'react';
import { ParseError } from '../../../types/schema';
import { HighlightSegment } from '../types';

interface CodeViewportProps {
  value: string;
  lines: string[];
  lineStartOffsets: number[];
  highlightedLines: HighlightSegment[][];
  errorsByLine: Map<number, ParseError[]>;
  scrollToLine?: number | null;
  gotoHighlightLine: number | null;
  findMatches: Array<{ start: number; end: number }>;
  safeMatchIdx: number;
  isMergedPreview: boolean;
  hasJumpToMerged: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onScrollDismissAutocomplete: () => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onJumpFromMergedCursor: () => void;
}

export const CodeViewport: React.FC<CodeViewportProps> = ({
  value,
  lines,
  lineStartOffsets,
  highlightedLines,
  errorsByLine,
  scrollToLine,
  gotoHighlightLine,
  findMatches,
  safeMatchIdx,
  isMergedPreview,
  hasJumpToMerged,
  scrollContainerRef,
  textareaRef,
  onScrollDismissAutocomplete,
  onChange,
  onKeyDown,
  onJumpFromMergedCursor,
}) => {
  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScrollDismissAutocomplete}
      className="flex-1 flex min-h-0 overflow-auto relative"
    >
      <div className="sticky left-0 z-20 w-11 shrink-0 py-3 pb-8 pr-2 text-right font-mono text-[12px] leading-[20px] text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800/80 select-none tabular-nums h-fit min-h-full">
        {lines.map((_, idx) => {
          const lineNum = idx + 1;
          const lineErrs = errorsByLine.get(lineNum);
          const hasErr = Boolean(lineErrs && lineErrs.length > 0);
          const isActiveLine =
            scrollToLine === lineNum || gotoHighlightLine === lineNum;
          return (
            <div
              key={lineNum}
              title={
                lineErrs ? lineErrs.map((e) => e.message).join(' | ') : undefined
              }
              className={`h-[20px] leading-[20px] flex items-center justify-end gap-0.5 ${
                hasErr
                  ? 'text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/40'
                  : isActiveLine
                  ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/30'
                  : ''
              }`}
            >
              {hasErr && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              )}
              <span>{lineNum}</span>
            </div>
          );
        })}
      </div>

      <div className="relative flex-1 min-w-max h-fit min-h-full">
        <pre
          aria-hidden="true"
          style={{ tabSize: 2, fontVariantLigatures: 'none' }}
          className="m-0 py-3 pb-8 px-3 pr-8 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre pointer-events-none select-none"
        >
          {highlightedLines.map((segs, lineIdx) => {
            const lineNum = lineIdx + 1;
            const hasErr = errorsByLine.has(lineNum);
            const isHighlighted =
              scrollToLine === lineNum || gotoHighlightLine === lineNum;
            const lineStart = lineStartOffsets[lineIdx] || 0;
            const lineLen = lines[lineIdx]?.length || 0;
            const lineEnd = lineStart + lineLen;

            const lineMatchSpans: Array<{
              start: number;
              end: number;
              isActive: boolean;
            }> = [];
            if (findMatches.length > 0 && lineLen > 0) {
              for (let mi = 0; mi < findMatches.length; mi++) {
                const m = findMatches[mi];
                if (m.end <= lineStart) continue;
                if (m.start >= lineEnd) break;
                lineMatchSpans.push({
                  start: Math.max(m.start, lineStart),
                  end: Math.min(m.end, lineEnd),
                  isActive: mi === safeMatchIdx,
                });
              }
            }

            let renderedSegments: React.ReactNode;
            if (segs.length === 0) {
              renderedSegments = <span>{'\u200b'}</span>;
            } else if (lineMatchSpans.length === 0) {
              renderedSegments = segs.map((seg, sIdx) => (
                <span key={sIdx} className={seg.className}>
                  {seg.text}
                </span>
              ));
            } else {
              const nodes: React.ReactNode[] = [];
              let cursor = lineStart;
              segs.forEach((seg, sIdx) => {
                const segStart = cursor;
                const segEnd = segStart + seg.text.length;
                cursor = segEnd;

                let pos = segStart;
                for (const ms of lineMatchSpans) {
                  if (ms.end <= pos || ms.start >= segEnd) continue;
                  if (ms.start > pos) {
                    nodes.push(
                      <span key={`${sIdx}-${pos}`} className={seg.className}>
                        {seg.text.slice(pos - segStart, ms.start - segStart)}
                      </span>
                    );
                  }
                  const hiStart = Math.max(pos, ms.start);
                  const hiEnd = Math.min(segEnd, ms.end);
                  nodes.push(
                    <span
                      key={`${sIdx}-m-${hiStart}`}
                      className={`${seg.className} ${
                        ms.isActive
                          ? 'bg-orange-400/55 dark:bg-orange-500/55 rounded-[2px]'
                          : 'bg-amber-300/45 dark:bg-amber-500/35 rounded-[2px]'
                      }`}
                    >
                      {seg.text.slice(hiStart - segStart, hiEnd - segStart)}
                    </span>
                  );
                  pos = hiEnd;
                }
                if (pos < segEnd) {
                  nodes.push(
                    <span key={`${sIdx}-tail-${pos}`} className={seg.className}>
                      {seg.text.slice(pos - segStart)}
                    </span>
                  );
                }
              });
              renderedSegments = nodes;
            }

            return (
              <div
                key={lineIdx}
                className={`h-[20px] leading-[20px] ${
                  hasErr
                    ? 'bg-rose-50/80 dark:bg-rose-950/30 border-b border-rose-500/60 -mx-3 px-3'
                    : isHighlighted
                    ? 'bg-blue-50/80 dark:bg-blue-950/30 -mx-3 px-3'
                    : ''
                }`}
              >
                {renderedSegments}
              </div>
            );
          })}
        </pre>

        <textarea
          ref={textareaRef}
          value={value}
          readOnly={isMergedPreview}
          onChange={onChange}
          onClick={onScrollDismissAutocomplete}
          onDoubleClick={() => {
            if (isMergedPreview && hasJumpToMerged) {
              onJumpFromMergedCursor();
            }
          }}
          onBlur={() => {
            window.setTimeout(onScrollDismissAutocomplete, 140);
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop !== 0) el.scrollTop = 0;
            if (el.scrollLeft !== 0) el.scrollLeft = 0;
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          wrap="off"
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="DBML Source Code Editor"
          style={{ tabSize: 2, fontVariantLigatures: 'none' }}
          className="dbml-editor-textarea absolute inset-0 z-10 w-full h-full m-0 py-3 pb-8 px-3 pr-8 border-0 font-mono font-normal text-[12.5px] leading-[20px] whitespace-pre bg-transparent text-transparent caret-slate-900 dark:caret-slate-100 resize-none focus:outline-none overflow-hidden selection:bg-blue-500/30 selection:text-transparent"
        />
      </div>
    </div>
  );
};
