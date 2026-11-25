import {
  isTableSeparatorLine,
  ListNode,
  parseListBlock,
  sanitizeHref,
  slugifyHeading,
  splitTableRow,
} from '../../features/markdown/markdownUtils';
import { highlightCode } from '../codeHighlight';

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALERT_META: Record<string, { label: string; cls: string }> = {
  NOTE: { label: 'Note', cls: 'alert-note' },
  TIP: { label: 'Tip', cls: 'alert-tip' },
  IMPORTANT: { label: 'Important', cls: 'alert-important' },
  WARNING: { label: 'Warning', cls: 'alert-warning' },
  CAUTION: { label: 'Caution', cls: 'alert-caution' },
};

export function renderInlineMdToHtml(text: string): string {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Escaped markdown punctuation
    if (
      ch === '\\' &&
      i + 1 < text.length &&
      /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])
    ) {
      out += escapeHtml(text[i + 1]);
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
        const codeContent = text.slice(i + tickCount, closeIdx).trim();
        out += `<code class="inline-code">${escapeHtml(codeContent)}</code>`;
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
            out += `<img class="md-img" src="${escapeHtml(
              href
            )}" alt="${escapeHtml(alt)}" loading="lazy" />`;
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
          const href = sanitizeHref(text.slice(closeBracket + 2, closeParen));
          if (href) {
            const isExternal =
              href.startsWith('http://') || href.startsWith('https://');
            const attrs = isExternal
              ? ' target="_blank" rel="noopener noreferrer"'
              : '';
            out += `<a class="md-link" href="${escapeHtml(
              href
            )}"${attrs}>${renderInlineMdToHtml(label)}</a>`;
            i = closeParen + 1;
            continue;
          }
        }
      }
    }

    // Bold **text** or boundary-safe __text__
    if ((ch === '*' && text[i + 1] === '*') || (ch === '_' && text[i + 1] === '_')) {
      const marker = ch + ch;
      const prevChar = i > 0 ? text[i - 1] : '';
      const validBoundary = marker === '**' || !/[a-zA-Z0-9]/.test(prevChar);
      if (validBoundary) {
        const closeIdx = text.indexOf(marker, i + 2);
        if (closeIdx > i + 2) {
          const nextAfter = text[closeIdx + 2] || '';
          const closeBoundary =
            marker === '**' || !/[a-zA-Z0-9]/.test(nextAfter);
          if (closeBoundary) {
            out += `<strong>${renderInlineMdToHtml(
              text.slice(i + 2, closeIdx)
            )}</strong>`;
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
        out += `<del class="md-del">${renderInlineMdToHtml(
          text.slice(i + 2, closeIdx)
        )}</del>`;
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
          out += `<em>${renderInlineMdToHtml(text.slice(i + 1, closeIdx))}</em>`;
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
      const urlMatch = text.slice(i).match(/^https?:\/\/[^\s<>)\]]+/);
      if (urlMatch) {
        const cleanUrl = urlMatch[0].replace(/[.,;:!?]+$/, '');
        const safeUrl = sanitizeHref(cleanUrl);
        if (safeUrl) {
          out += `<a class="md-link" href="${escapeHtml(
            safeUrl
          )}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeUrl)}</a>`;
          i += cleanUrl.length;
          continue;
        }
      }
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function renderCodeBlockHtml(code: string, rawLanguage?: string): string {
  const highlighted = highlightCode(code, rawLanguage);
  const showLineNumbers = highlighted.lines.length > 1;
  const displayLang =
    rawLanguage?.trim() || highlighted.language || 'text';

  const linesHtml = highlighted.lines
    .map((tokens, lineIdx) => {
      const isDiffAdded = tokens.length === 1 && tokens[0].type === 'added';
      const isDiffRemoved =
        tokens.length === 1 && tokens[0].type === 'removed';
      const rowClass = isDiffAdded
        ? 'code-line diff-added'
        : isDiffRemoved
        ? 'code-line diff-removed'
        : 'code-line';

      const lineNumHtml = showLineNumbers
        ? `<span class="code-line-num" aria-hidden="true">${lineIdx + 1}</span>`
        : '';

      const tokensHtml = tokens
        .map(
          (tok) =>
            `<span class="tok-${tok.type}">${escapeHtml(tok.text)}</span>`
        )
        .join('');

      return `<div class="${rowClass}">${lineNumHtml}<span class="code-line-text">${tokensHtml}</span></div>`;
    })
    .join('');

  return `<div class="code-block">
    <div class="code-block-head">
      <div class="code-block-lang">
        <span>${escapeHtml(displayLang)}</span>
        ${
          highlighted.autoDetected && highlighted.language !== 'text'
            ? '<span class="code-auto">auto</span>'
            : ''
        }
      </div>
      <button type="button" class="code-copy-btn" data-copy-code>Copy</button>
    </div>
    <pre class="code-block-pre"><code>${linesHtml}</code></pre>
  </div>`;
}

function renderListNodeHtml(list: ListNode): string {
  const tag = list.ordered ? 'ol' : 'ul';
  const startAttr =
    list.ordered && list.start !== 1 ? ` start="${list.start}"` : '';
  const itemsHtml = list.items
    .map((item) => {
      const isTask = item.checked !== undefined;
      const checkbox = isTask
        ? `<input type="checkbox" class="md-task-box" disabled${
            item.checked ? ' checked' : ''
          } />`
        : '';
      const subHtml = item.sublists.map(renderListNodeHtml).join('');
      return `<li class="${isTask ? 'md-task-item' : ''}">${checkbox}<div class="md-list-body"><div>${renderInlineMdToHtml(
        item.lines.join(' ')
      )}</div>${subHtml}</div></li>`;
    })
    .join('');
  return `<${tag} class="md-list"${startAttr}>${itemsHtml}</${tag}>`;
}

export function renderSafeMarkdownToHtml(
  markdown?: string,
  idPrefix = 'md'
): string {
  if (!markdown || !markdown.trim()) return '';
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  const seenSlugs = new Map<string, number>();
  let i = 0;

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
      html.push(renderCodeBlockHtml(codeLines.join('\n'), lang));
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      html.push('<hr class="md-hr" />');
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
      const baseSlug = slugifyHeading(plainHeading) || 'section';
      const count = seenSlugs.get(baseSlug) || 0;
      seenSlugs.set(baseSlug, count + 1);
      const id =
        count > 0 ? `${idPrefix}-${baseSlug}-${count}` : `${idPrefix}-${baseSlug}`;
      html.push(
        `<h${level} id="${escapeHtml(id)}" class="md-h${level}">${renderInlineMdToHtml(
          rawText
        )}</h${level}>`
      );
      i++;
      continue;
    }

    // Blockquote & GitHub-style alerts
    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const firstLine = quoteLines[0]?.trim() || '';
      const alertMatch = firstLine.match(
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i
      );
      if (alertMatch) {
        const meta = ALERT_META[alertMatch[1].toUpperCase()] || ALERT_META.NOTE;
        const inner = quoteLines.slice(1).join('\n').trim();
        html.push(
          `<div class="md-alert ${meta.cls}"><div class="md-alert-title">${
            meta.label
          }</div>${
            inner ? renderSafeMarkdownToHtml(inner, `${idPrefix}-al`) : ''
          }</div>`
        );
      } else {
        html.push(
          `<blockquote class="md-quote">${renderSafeMarkdownToHtml(
            quoteLines.join('\n'),
            `${idPrefix}-bq`
          )}</blockquote>`
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
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        lines[i].includes('|')
      ) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thHtml = headers
        .map((h, hIdx) => {
          const align = aligns[hIdx] || 'left';
          return `<th style="text-align:${align}">${renderInlineMdToHtml(
            h
          )}</th>`;
        })
        .join('');
      const bodyHtml = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((_, cIdx) => {
                const align = aligns[cIdx] || 'left';
                return `<td style="text-align:${align}">${renderInlineMdToHtml(
                  row[cIdx] || ''
                )}</td>`;
              })
              .join('')}</tr>`
        )
        .join('');
      html.push(
        `<div class="md-table-wrap"><table><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
      );
      continue;
    }

    // List block
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const { node, nextIdx } = parseListBlock(lines, i);
      html.push(renderListNodeHtml(node));
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
      html.push(renderCodeBlockHtml(codeLines.join('\n')));
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

    let paraHtml = '';
    paraLines.forEach((pl, pIdx) => {
      const hasHardBreak = pl.endsWith('  ');
      const cleaned = hasHardBreak ? pl.slice(0, -2) : pl;
      if (pIdx > 0) {
        paraHtml += paraLines[pIdx - 1].endsWith('  ') ? '<br/>' : ' ';
      }
      paraHtml += renderInlineMdToHtml(cleaned);
    });

    html.push(`<p>${paraHtml}</p>`);
  }

  return html.join('\n');
}
