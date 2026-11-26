import { ParsedSchema } from '@shared/domain/schemaTypes';

export type MetadataTagTone =
  | 'pii'
  | 'deprecated'
  | 'owner'
  | 'sla'
  | 'default';

export interface MetadataTag {
  key: string;
  value?: string;
  label: string;
  tone: MetadataTagTone;
}

function resolveTagTone(key: string): MetadataTagTone {
  const lower = key.toLowerCase();
  if (lower === 'pii' || lower === 'phi' || lower === 'pci' || lower === 'sensitive') {
    return 'pii';
  }
  if (lower === 'deprecated' || lower === 'legacy' || lower === 'sunset') {
    return 'deprecated';
  }
  if (lower === 'owner' || lower === 'team' || lower === 'domain-owner') {
    return 'owner';
  }
  if (lower === 'sla' || lower === 'tier' || lower === 'retention') {
    return 'sla';
  }
  return 'default';
}

function formatTagLabel(key: string, value?: string): string {
  const cleanKey = key.trim();
  const normalizedKey =
    cleanKey.toLowerCase() === 'pii' ||
    cleanKey.toLowerCase() === 'phi' ||
    cleanKey.toLowerCase() === 'pci' ||
    cleanKey.toLowerCase() === 'sla'
      ? cleanKey.toUpperCase()
      : cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1);
  return value ? `${normalizedKey}: ${value.trim()}` : normalizedKey;
}

/**
 * Extracts structured metadata tags from DBML Note strings without colliding
 * with Markdown headings or email addresses.
 *
 * Supported syntax inside notes:
 * - `@pii`, `@deprecated`, `@internal`
 * - `@owner(Billing)`, `@sla(99.9%)`, `@retention(7y)`
 * - `[PII]`, `[Deprecated]`, `[Owner: Billing]`
 * - `Tags: PII, Core, Owner:Billing`
 */
export function extractMetadataTags(note?: string): MetadataTag[] {
  if (!note || !note.trim()) return [];

  const found = new Map<string, MetadataTag>();
  const addTag = (rawKey: string, rawValue?: string) => {
    const key = rawKey.trim();
    if (!key) return;
    const value = rawValue?.trim() || undefined;
    const dedupeKey = `${key.toLowerCase()}::${(value || '').toLowerCase()}`;
    if (found.has(dedupeKey)) return;
    found.set(dedupeKey, {
      key: key.toLowerCase(),
      value,
      label: formatTagLabel(key, value),
      tone: resolveTagTone(key),
    });
  };

  // Strip fenced code blocks so examples inside ```...``` don't produce tags
  const stripped = note.replace(/```[\s\S]*?```/g, ' ');

  // 1. @key(value) or @key (at line start or preceded by whitespace/punctuation, not emails)
  const atTagRegex = /(?:^|[\s,(])@([a-zA-Z][a-zA-Z0-9_-]*)(?:\(([^)\n]+)\))?/g;
  let m: RegExpExecArray | null;
  while ((m = atTagRegex.exec(stripped)) !== null) {
    addTag(m[1], m[2]);
  }

  // 2. Standalone bracket annotations like [PII], [Deprecated], [Owner: Billing]
  // Ignore Markdown links [label](url) and GFM alerts [!NOTE]
  const bracketRegex = /\[([^[\]\n!][^\][\n]{0,48})\](?!\()/g;
  while ((m = bracketRegex.exec(stripped)) !== null) {
    const inside = m[1].trim();
    if (!inside) continue;
    const kv = inside.match(/^([a-zA-Z][a-zA-Z0-9_-]{1,20})\s*:\s*(.+)$/);
    if (kv) {
      addTag(kv[1], kv[2]);
    } else if (/^(pii|phi|pci|deprecated|internal|legacy|sensitive|core|audit)$/i.test(inside)) {
      addTag(inside);
    }
  }

  // 3. Explicit "Tags: a, b, Owner:Team" line
  const lines = stripped.split(/\r?\n/);
  for (const line of lines) {
    const tagLine = line.match(/^\s*tags\s*:\s*(.+)$/i);
    if (!tagLine) continue;
    for (const part of tagLine[1].split(',')) {
      const token = part.trim();
      if (!token) continue;
      const kv = token.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.+)$/);
      if (kv) {
        addTag(kv[1], kv[2]);
      } else {
        addTag(token);
      }
    }
  }

  return Array.from(found.values());
}

export function collectSchemaTagCatalog(schema: ParsedSchema): Array<{
  label: string;
  tone: MetadataTagTone;
  count: number;
}> {
  const counts = new Map<
    string,
    { label: string; tone: MetadataTagTone; count: number }
  >();

  for (const t of schema.tables) {
    const seenInTable = new Set<string>();
    for (const tag of extractMetadataTags(t.note)) {
      if (!seenInTable.has(tag.label)) {
        seenInTable.add(tag.label);
        const cur = counts.get(tag.label) || {
          label: tag.label,
          tone: tag.tone,
          count: 0,
        };
        cur.count++;
        counts.set(tag.label, cur);
      }
    }
    for (const c of t.columns) {
      for (const tag of extractMetadataTags(c.note)) {
        if (!seenInTable.has(tag.label)) {
          seenInTable.add(tag.label);
          const cur = counts.get(tag.label) || {
            label: tag.label,
            tone: tag.tone,
            count: 0,
          };
          cur.count++;
          counts.set(tag.label, cur);
        }
      }
    }
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}
