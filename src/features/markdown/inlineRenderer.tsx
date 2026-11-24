import React from 'react';
import { ExternalLink } from 'lucide-react';
import { sanitizeHref } from './markdownUtils';

export function renderInlineMarkdown(
  text: string,
  keyPrefix = 'inl'
): React.ReactNode[] {
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
    if (
      ch === '\\' &&
      i + 1 < text.length &&
      /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])
    ) {
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
            const isExternal =
              href.startsWith('http://') || href.startsWith('https://');
            nodes.push(
              <a
                key={`${keyPrefix}-lnk-${tokenIdx++}`}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/50 hover:decoration-blue-600 dark:hover:decoration-blue-300 font-medium inline-flex items-baseline gap-0.5"
              >
                <span>
                  {renderInlineMarkdown(label, `${keyPrefix}-lnkin-${tokenIdx}`)}
                </span>
                {isExternal && (
                  <ExternalLink className="w-2.5 h-2.5 inline self-center opacity-70" />
                )}
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

    // Italic *text* or boundary-safe _text_
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
        const safeUrl = sanitizeHref(cleanUrl);
        if (safeUrl) {
          flushBuffer();
          nodes.push(
            <a
              key={`${keyPrefix}-auto-${tokenIdx++}`}
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline decoration-blue-400/50 hover:decoration-blue-600"
            >
              {safeUrl}
            </a>
          );
          i += cleanUrl.length;
          continue;
        }
      }
    }

    buffer += ch;
    i++;
  }

  flushBuffer();
  return nodes;
}
