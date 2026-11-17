import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Info,
  Lightbulb,
  ShieldAlert,
} from 'lucide-react';
import { highlightCode, TOKEN_CLASS_MAP } from '../utils/codeHighlight';

export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function sanitizeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return null;
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  if (!markdown) return [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const headings: MarkdownHeading[] = [];
  let inFence = false;
  let fenceChar = '';
  const seenSlugs = new Map<string, number>();

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        inFence = false;
        fenceChar = '';
      }
      continue;
    }
    if (inFence) continue;

    const hMatch = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const rawText = hMatch[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_~]/g, '').trim();
      const baseSlug = slugifyHeading(rawText) || `section-${headings.length + 1}`;
      const count = seenSlugs.get(baseSlug) || 0;
      seenSlugs.set(baseSlug, count + 1);
      const id = count > 0 ? `${baseSlug}-${count}` : baseSlug;
      headings.push({ level, text: rawText, id });
    }
  }
  return headings;
}

export function isRichMarkdownNote(note?: string): boolean {
  if (!note) return false;
  if (note.includes('\n')) return true;
  if (note.length >= 160) return true;
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*\*|\|)/.test(note.trim());
}

export function stripMarkdownToPlainText(markdown?: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s*(\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])?/gim, '')
    .replace(/^[-*+]\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderInlineMarkdown(text: string, keyPrefix = 'inl'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let buffer = '';
  let tokenIdx = 0;

  const flushBuffer = () => {
    if (buffer) {
      nodes.push(buffer);
      buffer = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Escaped character
    if (ch === '\\' && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    // Inline code `...` or ``...``
    if (ch === '`') {
      let tickCount = 1;
      while (text[i + tickCount] === '`') tickCount++;
      const delim = '`'.repeat(tickCount);
      const closeIdx = text.indexOf(delim, i + tickCount);
      if (closeIdx !== -1) {
        flushBuffer();
        const codeContent = text.slice(i + tickCount, closeIdx).trim();
        nodes.push(
          <code
            key={`${keyPrefix}-code-${tokenIdx++}`}
            className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 font-mono text-[0.85em] text-rose-700 dark:text-rose-300 break-words"
          >
            {codeContent}
          </code>
        );
        i = closeIdx + tickCount;
        continue;
      }
    }

    // Image ![alt](url)
    if (ch === '!' && text[i + 1] === '[') {
      const closeBracket = text.indexOf(']', i + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const alt = text.slice(i + 2, closeBracket);
          const href = sanitizeHref(text.slice(closeBracket + 2, closeParen));
          if (href) {
            flushBuffer();
            nodes.push(
              <img
                key={`${keyPrefix}-img-${tokenIdx++}`}
                src={href}
                alt={alt}
                loading="lazy"
                className="inline-block max-w-full rounded-lg border border-slate-200 dark:border-slate-700 my-1"
              />
            );
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Link [label](url)
    if (ch === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const rawUrl = text.slice(closeBracket + 2, closeParen);
          const href = sanitizeHref(rawUrl);
          if (href) {
            flushBuffer();
            const isExternal = href.startsWith('http://') || href.startsWith('https://');
            nodes.push(
              <a
                key={`${keyPrefix}-lnk-${tokenIdx++}`}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/50 hover:decoration-blue-600 dark:hover:decoration-blue-300 font-medium inline-flex items-baseline gap-0.5"
              >
                <span>{renderInlineMarkdown(label, `${keyPrefix}-lnkin-${tokenIdx}`)}</span>
                {isExternal && <ExternalLink className="w-2.5 h-2.5 inline self-center opacity-70" />}
              </a>
            );
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bold **text** or __text__
    if ((ch === '*' && text[i + 1] === '*') || (ch === '_' && text[i + 1] === '_')) {
      const marker = ch + ch;
      const prevChar = i > 0 ? text[i - 1] : '';
      const validBoundary = marker === '**' || !/[a-zA-Z0-9]/.test(prevChar);
      if (validBoundary) {
        const closeIdx = text.indexOf(marker, i + 2);
        if (closeIdx > i + 2) {
          const nextAfter = text[closeIdx + 2] || '';
          const closeBoundary = marker === '**' || !/[a-zA-Z0-9]/.test(nextAfter);
          if (closeBoundary) {
            flushBuffer();
            const inner = text.slice(i + 2, closeIdx);
            nodes.push(
              <strong
                key={`${keyPrefix}-b-${tokenIdx++}`}
                className="font-semibold text-slate-900 dark:text-slate-50"
              >
                {renderInlineMarkdown(inner, `${keyPrefix}-bin-${tokenIdx}`)}
              </strong>
            );
            i = closeIdx + 2;
            continue;
          }
        }
      }
    }

    // Strikethrough ~~text~~
    if (ch === '~' && text[i + 1] === '~') {
      const closeIdx = text.indexOf('~~', i + 2);
      if (closeIdx > i + 2) {
        flushBuffer();
        const inner = text.slice(i + 2, closeIdx);
        nodes.push(
          <del
            key={`${keyPrefix}-del-${tokenIdx++}`}
            className="line-through text-slate-400 dark:text-slate-500"
          >
            {renderInlineMarkdown(inner, `${keyPrefix}-delin-${tokenIdx}`)}
          </del>
        );
        i = closeIdx + 2;
        continue;
      }
    }

    // Italic *text* or boundary-safe _text_ (never corrupts snake_case identifiers)
    if (ch === '*' || ch === '_') {
      const prevChar = i > 0 ? text[i - 1] : '';
      const nextChar = text[i + 1] || '';
      const canOpen =
        nextChar &&
        !/\s/.test(nextChar) &&
        (ch === '*' || !/[a-zA-Z0-9_]/.test(prevChar));
      if (canOpen) {
        let searchFrom = i + 1;
        let closeIdx = -1;
        while (searchFrom < text.length) {
          const found = text.indexOf(ch, searchFrom);
          if (found === -1) break;
          const beforeClose = text[found - 1];
          const afterClose = text[found + 1] || '';
          const validClose =
            !/\s/.test(beforeClose) &&
            text[found + 1] !== ch &&
            (ch === '*' || !/[a-zA-Z0-9_]/.test(afterClose));
          if (validClose) {
            closeIdx = found;
            break;
          }
          searchFrom = found + 1;
        }
        if (closeIdx > i + 1) {
          flushBuffer();
          const inner = text.slice(i + 1, closeIdx);
          nodes.push(
            <em key={`${keyPrefix}-em-${tokenIdx++}`} className="italic">
              {renderInlineMarkdown(inner, `${keyPrefix}-emin-${tokenIdx}`)}
            </em>
          );
          i = closeIdx + 1;
          continue;
        }
      }
    }

    // Bare URL autolink
    if (
      (text.startsWith('https://', i) || text.startsWith('http://', i)) &&
      (i === 0 || /[\s(]/.test(text[i - 1]))
    ) {
      const rest = text.slice(i);
      const urlMatch = rest.match(/^https?:\/\/[^\s<>)\]]+/);
      if (urlMatch) {
        const cleanUrl = urlMatch[0].replace(/[.,;:!?]+$/, '');
        flushBuffer();
        nodes.push(
          <a
            key={`${keyPrefix}-auto-${tokenIdx++}`}
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/50 hover:decoration-blue-600"
          >
            {cleanUrl}
          </a>
        );
        i += cleanUrl.length;
        continue;
      }
    }

    buffer += ch;
    i++;
  }

  flushBuffer();
  return nodes;
}

const CodeBlockView: React.FC<{ code: string; language?: string }> = ({
  code,
  language,
}) => {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(
    () => highlightCode(code, language),
    [code, language]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };

  const showLineNumbers = highlighted.lines.length > 1;
  const displayLang = language?.trim() || highlighted.language || 'text';

  return (
    <div className="my-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-sm">
      <div className="px-3.5 py-1.5 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="font-mono uppercase tracking-wider text-[10px] text-slate-300">
            {displayLang}
          </span>
          {highlighted.autoDetected && highlighted.language !== 'text' && (
            <span className="text-[9px] font-mono text-slate-500">auto</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="py-3 px-3.5 overflow-x-auto text-xs leading-relaxed font-mono text-slate-100">
        <code className="block min-w-max">
          {highlighted.lines.map((tokens, lineIdx) => {
            const isDiffAdded =
              tokens.length === 1 && tokens[0].type === 'added';
            const isDiffRemoved =
              tokens.length === 1 && tokens[0].type === 'removed';
            const rowTint = isDiffAdded
              ? 'bg-emerald-500/12 -mx-3.5 px-3.5'
              : isDiffRemoved
              ? 'bg-rose-500/12 -mx-3.5 px-3.5'
              : '';
            return (
              <div
                key={lineIdx}
                className={`flex min-h-[1.625em] ${rowTint}`}
              >
                {showLineNumbers && (
                  <span
                    aria-hidden="true"
                    className="select-none w-7 pr-3 text-right text-slate-600 shrink-0 tabular-nums"
                  >
                    {lineIdx + 1}
                  </span>
                )}
                <span className="flex-1 whitespace-pre">
                  {tokens.map((tok, tokIdx) => (
                    <span
                      key={tokIdx}
                      className={TOKEN_CLASS_MAP[tok.type]}
                    >
                      {tok.text}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
};

interface ListNode {
  ordered: boolean;
  start: number;
  items: Array<{
    indent: number;
    checked?: boolean;
    lines: string[];
    sublists: ListNode[];
  }>;
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparatorLine(line: string): Array<'left' | 'center' | 'right'> | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return null;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return null;
  const aligns: Array<'left' | 'center' | 'right'> = [];
  for (const c of cells) {
    if (!/^:?-{1,}:?$/.test(c)) return null;
    if (c.startsWith(':') && c.endsWith(':')) aligns.push('center');
    else if (c.endsWith(':')) aligns.push('right');
    else aligns.push('left');
  }
  return aligns;
}

function parseListBlock(
  lines: string[],
  startIdx: number
): { node: ListNode; nextIdx: number } {
  const getIndent = (s: string) => s.match(/^(\s*)/)?.[1].length || 0;
  const matchListLine = (s: string) =>
    s.match(/^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/);

  const firstMatch = matchListLine(lines[startIdx])!;
  const baseIndent = firstMatch[1].length;
  const ordered = Boolean(firstMatch[3]);
  const startNum = firstMatch[3] ? Number(firstMatch[3]) : 1;
  const node: ListNode = { ordered, start: startNum, items: [] };

  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      // Look ahead to see if list continues at same or deeper indent
      if (i + 1 < lines.length && matchListLine(lines[i + 1])) {
        const nextIndent = getIndent(lines[i + 1]);
        if (nextIndent >= baseIndent) {
          i++;
          continue;
        }
      }
      break;
    }

    const m = matchListLine(line);
    if (m) {
      const indent = m[1].length;
      const isOrdered = Boolean(m[3]);
      if (indent < baseIndent) break;

      if (indent === baseIndent && isOrdered === ordered) {
        let body = m[4];
        let checked: boolean | undefined;
        const taskMatch = body.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          checked = taskMatch[1].toLowerCase() === 'x';
          body = taskMatch[2];
        }
        node.items.push({
          indent,
          checked,
          lines: [body],
          sublists: [],
        });
        i++;
        continue;
      }

      if (indent > baseIndent && node.items.length > 0) {
        const sub = parseListBlock(lines, i);
        node.items[node.items.length - 1].sublists.push(sub.node);
        i = sub.nextIdx;
        continue;
      }

      break;
    }

    // Continuation line for current list item
    if (node.items.length > 0 && getIndent(line) > baseIndent) {
      node.items[node.items.length - 1].lines.push(line.trim());
      i++;
      continue;
    }

    break;
  }

  return { node, nextIdx: i };
}

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
            className={isTask ? 'list-none -ml-5 flex items-start gap-2' : 'leading-relaxed'}
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
              <div>{renderInlineMarkdown(item.lines.join(' '), `${keyPrefix}-item-${idx}`)}</div>
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

interface MarkdownContentProps {
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

    // Blank line
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
        if (closeMatch && closeMatch[1][0] === markerChar && closeMatch[1].length >= fence.length) {
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
              compact ? 'text-base mt-3 mb-2' : 'text-xl mt-5 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800'
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
              compact ? 'text-sm mt-3 mb-1.5' : 'text-[17px] mt-5 mb-2.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-800'
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
      const alertMatch = firstQuoteLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i);
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
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.titleCls}`}>
              <AlertIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{meta.label}</span>
            </div>
            {innerContent && (
              <MarkdownContent content={innerContent} compact />
            )}
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
                <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
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
                      {renderInlineMarkdown(row[cIdx] || '', `td-${blockIdx}-${rIdx}-${cIdx}`)}
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

    // List block (-, *, +, or 1.)
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const { node, nextIdx } = parseListBlock(lines, i);
      blocks.push(renderListNode(node, compact, `list-${blockIdx++}`));
      i = nextIdx;
      continue;
    }

    // Indented code block (4+ spaces or tab)
    if (/^(?: {4}|\t)/.test(line)) {
      const codeLines: string[] = [];
      while (
        i < lines.length &&
        (/^(?: {4}|\t)/.test(lines[i]) || lines[i].trim() === '')
      ) {
        if (lines[i].trim() === '') {
          // Stop if next line isn't indented code
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

    // Paragraph (collect consecutive non-block lines)
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
        (cur.includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
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
          compact ? 'text-xs my-1.5 leading-relaxed' : 'text-[13.5px] my-2.5 leading-7'
        } text-slate-700 dark:text-slate-300 first:mt-0 last:mb-0`}
      >
        {paragraphNodes}
      </p>
    );
  }

  return <div className={`min-w-0 break-words ${className}`}>{blocks}</div>;
};
