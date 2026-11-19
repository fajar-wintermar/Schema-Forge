import React from 'react';
import {
  AlertTriangle,
  Info,
  Lightbulb,
  ShieldAlert,
} from 'lucide-react';
import { CodeBlockView } from './CodeBlockView';
import { renderInlineMarkdown } from './inlineRenderer';
import {
  isTableSeparatorLine,
  ListNode,
  parseListBlock,
  slugifyHeading,
  splitTableRow,
} from './markdownUtils';

export {
  extractMarkdownHeadings,
  isRichMarkdownNote,
  stripMarkdownToPlainText,
  type MarkdownHeading,
} from './markdownUtils';

const ALERT_STYLES: Record<
  string,
  {
    label: string;
    containerCls: string;
    titleCls: string;
    Icon: React.FC<{ className?: string }>;
  }
> = {
  NOTE: {
    label: 'Note',
    containerCls:
      'border-l-4 border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 border-y border-r border-y-blue-200/70 border-r-blue-200/70 dark:border-y-blue-900/60 dark:border-r-blue-900/60',
    titleCls: 'text-blue-700 dark:text-blue-300',
    Icon: Info,
  },
  TIP: {
    label: 'Tip',
    containerCls:
      'border-l-4 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 border-y border-r border-y-emerald-200/70 border-r-emerald-200/70 dark:border-y-emerald-900/60 dark:border-r-emerald-900/60',
    titleCls: 'text-emerald-700 dark:text-emerald-300',
    Icon: Lightbulb,
  },
  IMPORTANT: {
    label: 'Important',
    containerCls:
      'border-l-4 border-violet-500 bg-violet-50/70 dark:bg-violet-950/30 border-y border-r border-y-violet-200/70 border-r-violet-200/70 dark:border-y-violet-900/60 dark:border-r-violet-900/60',
    titleCls: 'text-violet-700 dark:text-violet-300',
    Icon: Info,
  },
  WARNING: {
    label: 'Warning',
    containerCls:
      'border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 border-y border-r border-y-amber-200/70 border-r-amber-200/70 dark:border-y-amber-900/60 dark:border-r-amber-900/60',
    titleCls: 'text-amber-800 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  CAUTION: {
    label: 'Caution',
    containerCls:
      'border-l-4 border-rose-500 bg-rose-50/70 dark:bg-rose-950/30 border-y border-r border-y-rose-200/70 border-r-rose-200/70 dark:border-y-rose-900/60 dark:border-r-rose-900/60',
    titleCls: 'text-rose-700 dark:text-rose-300',
    Icon: ShieldAlert,
  },
};

function renderListNode(
  list: ListNode,
  compact: boolean,
  keyPrefix: string
): React.ReactNode {
  const Tag = list.ordered ? 'ol' : 'ul';
  return (
    <Tag
      key={keyPrefix}
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`${
        list.ordered ? 'list-decimal' : 'list-disc'
      } pl-5 space-y-1.5 ${
        compact ? 'my-1.5 text-xs' : 'my-2.5 text-[13.5px]'
      } text-slate-700 dark:text-slate-300`}
    >
      {list.items.map((item, idx) => {
        const isTask = item.checked !== undefined;
        return (
          <li
            key={`${keyPrefix}-li-${idx}`}
            className={
              isTask
                ? 'list-none -ml-5 flex items-start gap-2'
                : 'leading-relaxed'
            }
          >
            {isTask && (
              <input
                type="checkbox"
                checked={item.checked}
                readOnly
                className="mt-1 rounded border-slate-300 dark:border-slate-600 text-blue-600 pointer-events-none shrink-0"
              />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div>
                {renderInlineMarkdown(
                  item.lines.join(' '),
                  `${keyPrefix}-item-${idx}`
                )}
              </div>
              {item.sublists.map((sub, sIdx) =>
                renderListNode(sub, compact, `${keyPrefix}-sub-${idx}-${sIdx}`)
              )}
            </div>
          </li>
        );
      })}
    </Tag>
  );
}

export interface MarkdownContentProps {
  content: string;
  inline?: boolean;
  compact?: boolean;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  inline = false,
  compact = false,
  className = '',
}) => {
  if (!content) return null;

  if (inline) {
    return (
      <span className={className}>
        {renderInlineMarkdown(content.replace(/\n+/g, ' '), 'inline')}
      </span>
    );
  }

  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  const seenSlugs = new Map<string, number>();
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block ``` or ~~~
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`~]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2];
      const markerChar = fence[0];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const closeMatch = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (
          closeMatch &&
          closeMatch[1][0] === markerChar &&
          closeMatch[1].length >= fence.length
        ) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push(
        <CodeBlockView
          key={`code-${blockIdx++}`}
          code={codeLines.join('\n')}
          language={lang}
        />
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      blocks.push(
        <hr
          key={`hr-${blockIdx++}`}
          className="my-4 border-slate-200 dark:border-slate-800"
        />
      );
      i++;
      continue;
    }

    // ATX Headings (# .. ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawText = headingMatch[2];
      const plainHeading = rawText
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .trim();
      const baseSlug = slugifyHeading(plainHeading) || `section-${blockIdx}`;
      const count = seenSlugs.get(baseSlug) || 0;
      seenSlugs.set(baseSlug, count + 1);
      const id = count > 0 ? `${baseSlug}-${count}` : baseSlug;

      const headingNodes = renderInlineMarkdown(rawText, `h-${blockIdx}`);
      if (level === 1) {
        blocks.push(
          <h1
            key={`h1-${blockIdx++}`}
            id={id}
            className={`${
              compact
                ? 'text-base mt-3 mb-2'
                : 'text-xl mt-5 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800'
            } font-bold tracking-tight text-slate-900 dark:text-slate-50 first:mt-0`}
          >
            {headingNodes}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2
            key={`h2-${blockIdx++}`}
            id={id}
            className={`${
              compact
                ? 'text-sm mt-3 mb-1.5'
                : 'text-[17px] mt-5 mb-2.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-800'
            } font-bold tracking-tight text-slate-900 dark:text-slate-50 first:mt-0`}
          >
            {headingNodes}
          </h2>
        );
      } else if (level === 3) {
        blocks.push(
          <h3
            key={`h3-${blockIdx++}`}
            id={id}
            className={`${
              compact ? 'text-xs mt-2.5 mb-1' : 'text-[15px] mt-4 mb-2'
            } font-semibold text-slate-900 dark:text-slate-100 first:mt-0`}
          >
            {headingNodes}
          </h3>
        );
      } else {
        blocks.push(
          <h4
            key={`h4-${blockIdx++}`}
            id={id}
            className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-200 mt-3 mb-1.5 first:mt-0"
          >
            {headingNodes}
          </h4>
        );
      }
      i++;
      continue;
    }

    // Blockquote (> ...), including GitHub-style alerts
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const firstQuoteLine = quoteLines[0]?.trim() || '';
      const alertMatch = firstQuoteLine.match(
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i
      );
      if (alertMatch) {
        const alertKey = alertMatch[1].toUpperCase();
        const meta = ALERT_STYLES[alertKey] || ALERT_STYLES.NOTE;
        const AlertIcon = meta.Icon;
        const innerContent = quoteLines.slice(1).join('\n').trim();
        blocks.push(
          <div
            key={`alert-${blockIdx++}`}
            className={`my-3 rounded-r-lg px-4 py-3 space-y-1.5 ${meta.containerCls}`}
          >
            <div
              className={`flex items-center gap-1.5 text-xs font-semibold ${meta.titleCls}`}
            >
              <AlertIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{meta.label}</span>
            </div>
            {innerContent && <MarkdownContent content={innerContent} compact />}
          </div>
        );
      } else {
        blocks.push(
          <blockquote
            key={`bq-${blockIdx++}`}
            className="my-3 pl-4 border-l-4 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 space-y-1.5"
          >
            <MarkdownContent content={quoteLines.join('\n')} compact={compact} />
          </blockquote>
        );
      }
      continue;
    }

    // GFM Table
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      const aligns = isTableSeparatorLine(lines[i + 1])!;
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={`tbl-${blockIdx++}`}
          className="my-3 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto"
        >
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    className={`py-2 px-3 font-semibold ${
                      aligns[hIdx] === 'center'
                        ? 'text-center'
                        : aligns[hIdx] === 'right'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    {renderInlineMarkdown(h, `th-${blockIdx}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
                >
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className={`py-2 px-3 text-slate-600 dark:text-slate-300 ${
                        aligns[cIdx] === 'center'
                          ? 'text-center'
                          : aligns[cIdx] === 'right'
                          ? 'text-right'
                          : 'text-left'
                      }`}
                    >
                      {renderInlineMarkdown(
                        row[cIdx] || '',
                        `td-${blockIdx}-${rIdx}-${cIdx}`
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // List block
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const { node, nextIdx } = parseListBlock(lines, i);
      blocks.push(renderListNode(node, compact, `list-${blockIdx++}`));
      i = nextIdx;
      continue;
    }

    // Indented code block
    if (/^(?: {4}|\t)/.test(line)) {
      const codeLines: string[] = [];
      while (
        i < lines.length &&
        (/^(?: {4}|\t)/.test(lines[i]) || lines[i].trim() === '')
      ) {
        if (lines[i].trim() === '') {
          if (i + 1 >= lines.length || !/^(?: {4}|\t)/.test(lines[i + 1])) break;
          codeLines.push('');
        } else {
          codeLines.push(lines[i].replace(/^(?: {4}|\t)/, ''));
        }
        i++;
      }
      blocks.push(
        <CodeBlockView key={`icode-${blockIdx++}`} code={codeLines.join('\n')} />
      );
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (
        cur.trim() === '' ||
        /^\s*(`{3,}|~{3,})/.test(cur) ||
        /^#{1,6}\s+/.test(cur) ||
        /^\s*>/.test(cur) ||
        /^\s*(?:[-*+]|\d+\.)\s+/.test(cur) ||
        /^\s*(?:[-*_]\s*){3,}$/.test(cur) ||
        (cur.includes('|') &&
          i + 1 < lines.length &&
          isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(cur);
      i++;
    }

    const paragraphNodes: React.ReactNode[] = [];
    paraLines.forEach((pl, pIdx) => {
      const hasHardBreak = pl.endsWith('  ');
      const cleaned = hasHardBreak ? pl.slice(0, -2) : pl;
      if (pIdx > 0) {
        paragraphNodes.push(
          paraLines[pIdx - 1].endsWith('  ') ? (
            <br key={`br-${blockIdx}-${pIdx}`} />
          ) : (
            ' '
          )
        );
      }
      paragraphNodes.push(
        ...renderInlineMarkdown(cleaned, `p-${blockIdx}-${pIdx}`)
      );
    });

    blocks.push(
      <p
        key={`p-${blockIdx++}`}
        className={`${
          compact
            ? 'text-xs my-1.5 leading-relaxed'
            : 'text-[13.5px] my-2.5 leading-7'
        } text-slate-700 dark:text-slate-300 first:mt-0 last:mb-0`}
      >
        {paragraphNodes}
      </p>
    );
  }

  return <div className={`min-w-0 break-words ${className}`}>{blocks}</div>;
};
