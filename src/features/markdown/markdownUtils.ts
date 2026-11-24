export interface MarkdownHeading {
  level: number;
  text: string;
  id: string;
}

export interface ListNode {
  ordered: boolean;
  start: number;
  items: Array<{
    indent: number;
    checked?: boolean;
    lines: string[];
    sublists: ListNode[];
  }>;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function sanitizeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith('//')) {
    return null;
  }
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:'
    ) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
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
      const rawText = hMatch[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .trim();
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

export function splitTableRow(line: string): string[] {
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

export function isTableSeparatorLine(
  line: string
): Array<'left' | 'center' | 'right'> | null {
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

export function parseListBlock(
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

    if (node.items.length > 0 && getIndent(line) > baseIndent) {
      node.items[node.items.length - 1].lines.push(line.trim());
      i++;
      continue;
    }

    break;
  }

  return { node, nextIdx: i };
}
