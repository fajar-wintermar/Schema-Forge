import { ParseError, SchemaModuleFile } from '@shared/domain/schemaTypes';

export const MERGED_SCHEMA_VIEW_ID = '__merged__';

export interface MergeSegment {
  path: string;
  headerLine: number;
  startLine: number;
  endLine: number;
  lineCount: number;
}

export interface MergedSchemaResult {
  mergedDbml: string;
  segments: MergeSegment[];
}

export function cleanFolderPrefix(folder?: string): string {
  const raw = (folder || 'schema').trim().replace(/^\/+|\/+$/g, '');
  return raw || 'schema';
}

export function normalizeModulePath(
  input: string,
  folderPrefix = 'schema'
): string {
  const folder = cleanFolderPrefix(folderPrefix);
  let cleaned = input.trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (!cleaned) cleaned = 'new_table';
  if (!cleaned.toLowerCase().endsWith('.dbml')) {
    cleaned += '.dbml';
  }
  if (!cleaned.includes('/')) {
    cleaned = `${folder}/${cleaned}`;
  }
  return cleaned;
}

export function detectSchemaFolder(files: SchemaModuleFile[]): string {
  if (!files || files.length === 0) return 'schema';
  const dirs = files
    .map((f) => {
      const idx = f.path.lastIndexOf('/');
      return idx >= 0 ? f.path.slice(0, idx) : '';
    })
    .filter(Boolean);
  if (dirs.length === 0) return 'schema';

  // Prefer shortest common directory or most frequent directory
  const counts = new Map<string, number>();
  for (const d of dirs) counts.set(d, (counts.get(d) || 0) + 1);
  let best = dirs[0];
  let bestScore = -1;
  for (const [d, c] of counts.entries()) {
    if (c > bestScore || (c === bestScore && d.length < best.length)) {
      best = d;
      bestScore = c;
    }
  }
  return best;
}

export function mergeSchemaFiles(
  files: SchemaModuleFile[],
  options: { schemaFolder?: string } = {}
): MergedSchemaResult {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const folder = cleanFolderPrefix(
    options.schemaFolder || detectSchemaFolder(sorted)
  );

  if (sorted.length === 0) {
    return {
      mergedDbml: `// AUTO-GENERATED. Add .dbml files inside ${folder}/ to build schema.dbml on the fly.\n`,
      segments: [],
    };
  }

  const lines: string[] = [
    `// AUTO-GENERATED. Edit files in ${folder}/ — merged on the fly by SchemaForge`,
  ];
  const segments: MergeSegment[] = [];

  for (const file of sorted) {
    lines.push('');
    const headerLine = lines.length + 1;
    lines.push(`// ---- ${file.path} ----`);
    const contentLines = file.content.replace(/\r\n?/g, '\n').split('\n');
    // Drop a single trailing empty line if file ends with newline so segments stay tight
    if (contentLines.length > 1 && contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
    }
    const startLine = lines.length + 1;
    lines.push(...contentLines);
    const endLine = lines.length;
    segments.push({
      path: file.path,
      headerLine,
      startLine,
      endLine,
      lineCount: contentLines.length,
    });
  }

  lines.push('');
  return {
    mergedDbml: lines.join('\n'),
    segments,
  };
}

export function mapMergedLineToModule(
  mergedLine: number,
  segments: MergeSegment[]
): { path: string; localLine: number } | null {
  for (const seg of segments) {
    if (mergedLine >= seg.startLine && mergedLine <= seg.endLine) {
      return {
        path: seg.path,
        localLine: mergedLine - seg.startLine + 1,
      };
    }
    if (mergedLine === seg.headerLine) {
      return {
        path: seg.path,
        localLine: 1,
      };
    }
  }
  return null;
}

export function mapMergedErrorsToModules(
  errors: ParseError[],
  segments: MergeSegment[]
): {
  byFile: Record<string, ParseError[]>;
  unmapped: ParseError[];
} {
  const byFile: Record<string, ParseError[]> = {};
  const unmapped: ParseError[] = [];

  for (const seg of segments) {
    byFile[seg.path] = [];
  }

  for (const err of errors) {
    const mapped = mapMergedLineToModule(err.line, segments);
    if (mapped) {
      if (!byFile[mapped.path]) byFile[mapped.path] = [];
      byFile[mapped.path].push({
        line: mapped.localLine,
        message: err.message,
      });
    } else {
      unmapped.push(err);
    }
  }

  return { byFile, unmapped };
}

export function createStarterModuleDbml(filePath: string): string {
  const baseName =
    filePath
      .split('/')
      .pop()
      ?.replace(/\.dbml$/i, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase() || 'new_table';

  return `Table ${baseName} [headercolor: #1e3a8a] {
  id integer [pk, increment]
  name varchar(160) [not null]
  created_at timestamptz [default: \`now()\`]
}
`;
}

export function buildShellMergeScript(schemaFolder = 'schema'): string {
  const folder = cleanFolderPrefix(schemaFolder);
  return `#!/usr/bin/env bash
# build-schema.sh — Auto-merge modular DBML files into schema.dbml
set -e
out="schema.dbml"

echo "// AUTO-GENERATED. Edit files in ${folder}/ and run ./build-schema.sh" > "$out"
for f in $(ls ${folder}/*.dbml | sort); do
  printf "\\n// ---- %s ----\\n" "$f" >> "$out"
  cat "$f" >> "$out"
done
echo "Built $out from $(ls ${folder}/*.dbml | wc -l) files"
`;
}

interface TopBlock {
  kind:
    | 'project'
    | 'table'
    | 'tablepartial'
    | 'enum'
    | 'tablegroup'
    | 'note'
    | 'ref'
    | 'other';
  name?: string;
  refFromTable?: string;
  text: string;
}

const SECTION_HEADER_REGEX = /^\s*\/\/\s*----\s*([^\r\n]+?\.dbml)\s*----\s*$/i;
const AUTO_GENERATED_BANNER_REGEX =
  /^\s*\/\/\s*AUTO-GENERATED\.\s+(?:Edit files in|Add \.dbml files inside)\b/i;

function splitBlocksIntoModuleFiles(
  source: string,
  folderPrefix = 'schema',
  options: { skipEmptyFallback?: boolean } = {}
): SchemaModuleFile[] {
  const folder = cleanFolderPrefix(folderPrefix);
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const blocks: TopBlock[] = [];
  let i = 0;

  const stripQuotes = (s: string) => s.replace(/^["'`]|["'`]$/g, '');

  const collectBlockText = (startIdx: number): { text: string; nextIdx: number } => {
    const collected: string[] = [];
    let braceDepth = 0;
    let seenBrace = false;
    let j = startIdx;

    while (j < lines.length) {
      const line = lines[j];
      collected.push(line);

      // Scan braces outside quoted literals on this line
      let k = 0;
      let inTriple = false;
      while (k < line.length) {
        if (line.slice(k, k + 3) === "'''") {
          inTriple = !inTriple;
          k += 3;
          continue;
        }
        if (inTriple) {
          k++;
          continue;
        }
        const ch = line[k];
        if (ch === "'" || ch === '"' || ch === '`') {
          const q = ch;
          k++;
          while (k < line.length && line[k] !== q) {
            if (line[k] === '\\') k++;
            k++;
          }
          k++;
          continue;
        }
        if (ch === '/' && line[k + 1] === '/') break;
        if (ch === '{') {
          braceDepth++;
          seenBrace = true;
        } else if (ch === '}') {
          braceDepth--;
        }
        k++;
      }

      // Handle multi-line '''...''' spanning multiple lines
      if (!inTriple) {
        const tripleMatches = line.match(/'''/g);
        if (tripleMatches && tripleMatches.length % 2 === 1) {
          j++;
          while (j < lines.length) {
            collected.push(lines[j]);
            if (lines[j].includes("'''")) break;
            j++;
          }
        }
      }

      j++;
      if (seenBrace && braceDepth <= 0) break;
      if (!seenBrace && !lines[j - 1].trim().endsWith('{')) break;
    }

    return { text: collected.join('\n').trim(), nextIdx: j };
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
        while (i < lines.length && !lines[i].includes('*/')) i++;
      }
      i++;
      continue;
    }

    const partialMatch = trimmed.match(
      /^TablePartial\s+((?:"[^"]+"|'[^']+'|[^\s\[{]+))/i
    );
    if (partialMatch) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({
        kind: 'tablepartial',
        name: stripQuotes(partialMatch[1]),
        text,
      });
      i = nextIdx;
      continue;
    }

    const tableMatch = trimmed.match(/^Table\s+((?:"[^"]+"|'[^']+'|[^\s\[{]+))/i);
    if (tableMatch) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({
        kind: 'table',
        name: stripQuotes(tableMatch[1]),
        text,
      });
      i = nextIdx;
      continue;
    }

    if (/^Project\b/i.test(trimmed)) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({ kind: 'project', text });
      i = nextIdx;
      continue;
    }

    if (/^Enum\b/i.test(trimmed)) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({ kind: 'enum', text });
      i = nextIdx;
      continue;
    }

    if (/^TableGroup\b/i.test(trimmed)) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({ kind: 'tablegroup', text });
      i = nextIdx;
      continue;
    }

    if (/^Note\b/i.test(trimmed)) {
      const { text, nextIdx } = collectBlockText(i);
      blocks.push({ kind: 'note', text });
      i = nextIdx;
      continue;
    }

    const refMatch = trimmed.match(/^Ref\b(?:\s+[^\s:{]+)?\s*[:{]\s*([^\s.<>-]+)/i);
    if (/^Ref\b/i.test(trimmed)) {
      const { text, nextIdx } = collectBlockText(i);
      const bodyMatch = text.match(/([a-zA-Z0-9_."']+)\.[a-zA-Z0-9_."']+\s*(?:<>|[><-])/);
      const fromTable = bodyMatch
        ? stripQuotes(bodyMatch[1].split('.').slice(0, -1).join('.') || bodyMatch[1])
        : refMatch
        ? stripQuotes(refMatch[1])
        : undefined;
      blocks.push({
        kind: 'ref',
        refFromTable: fromTable,
        text,
      });
      i = nextIdx;
      continue;
    }

    const { text, nextIdx } = collectBlockText(i);
    blocks.push({ kind: 'other', text });
    i = nextIdx;
  }

  const sharedParts: string[] = [];
  const tableChunks = new Map<string, string[]>();
  const tableOrder: string[] = [];

  for (const b of blocks) {
    if (b.kind === 'table' && b.name) {
      if (!tableChunks.has(b.name)) {
        tableChunks.set(b.name, []);
        tableOrder.push(b.name);
      }
      tableChunks.get(b.name)!.push(b.text);
    } else if (b.kind === 'ref' && b.refFromTable && tableChunks.has(b.refFromTable)) {
      tableChunks.get(b.refFromTable)!.push(b.text);
    } else if (
      b.kind === 'ref' &&
      b.refFromTable &&
      blocks.some((t) => t.kind === 'table' && t.name === b.refFromTable)
    ) {
      if (!tableChunks.has(b.refFromTable)) {
        tableChunks.set(b.refFromTable, []);
        tableOrder.push(b.refFromTable);
      }
      tableChunks.get(b.refFromTable)!.push(b.text);
    } else if (b.text) {
      sharedParts.push(b.text);
    }
  }

  const result: SchemaModuleFile[] = [];
  const usedPaths = new Set<string>();

  if (sharedParts.length > 0) {
    const sharedPath = `${folder}/_project.dbml`;
    usedPaths.add(sharedPath);
    result.push({
      id: `mod_${Date.now()}_project`,
      path: sharedPath,
      content: sharedParts.join('\n\n') + '\n',
    });
  }

  for (const tblName of tableOrder) {
    const chunks = tableChunks.get(tblName) || [];
    if (chunks.length === 0) continue;
    const safeFile =
      tblName.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/\.+/g, '_') || 'table';
    let candidate = `${folder}/${safeFile}.dbml`;
    let n = 2;
    while (usedPaths.has(candidate)) {
      candidate = `${folder}/${safeFile}_${n++}.dbml`;
    }
    usedPaths.add(candidate);
    result.push({
      id: `mod_${Date.now()}_${safeFile}`,
      path: candidate,
      content: chunks.join('\n\n') + '\n',
    });
  }

  if (result.length === 0 && !options.skipEmptyFallback) {
    result.push({
      id: `mod_${Date.now()}_init`,
      path: `${folder}/users.dbml`,
      content: createStarterModuleDbml(`${folder}/users.dbml`),
    });
  }

  return result;
}

export function splitDbmlIntoModuleFiles(
  source: string,
  folderPrefix = 'schema'
): SchemaModuleFile[] {
  const normalized = source.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');

  const hasSectionHeaders = lines.some((line) => SECTION_HEADER_REGEX.test(line));
  if (!hasSectionHeaders) {
    return splitBlocksIntoModuleFiles(source, folderPrefix);
  }

  const folder = cleanFolderPrefix(folderPrefix);
  const preambleLines: string[] = [];
  const rawSections: Array<{ path: string; lines: string[] }> = [];
  let currentSection: { path: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(SECTION_HEADER_REGEX);
    if (match) {
      const cleanedPath = match[1]
        .trim()
        .replace(/^(?:\.\/)+/, '')
        .replace(/^\/+/, '')
        .replace(/\/{2,}/g, '/');
      if (cleanedPath) {
        currentSection = { path: cleanedPath, lines: [] };
        rawSections.push(currentSection);
        continue;
      }
    }

    if (!currentSection) {
      if (!AUTO_GENERATED_BANNER_REGEX.test(line)) {
        preambleLines.push(line);
      }
    } else {
      currentSection.lines.push(line);
    }
  }

  const stamp = Date.now();
  const filesByPath = new Map<string, SchemaModuleFile>();

  rawSections.forEach((sec, idx) => {
    const bodyLines = [...sec.lines];
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') {
      bodyLines.pop();
    }
    const content = bodyLines.length > 0 ? `${bodyLines.join('\n')}\n` : '';

    const existing = filesByPath.get(sec.path);
    if (existing) {
      if (content) {
        const prev = existing.content.replace(/\n+$/, '');
        existing.content = prev ? `${prev}\n\n${content}` : content;
      }
    } else {
      filesByPath.set(sec.path, {
        id: `mod_${stamp}_${idx}`,
        path: sec.path,
        content,
      });
    }
  });

  const preambleText = preambleLines.join('\n').trim();
  if (preambleText) {
    const preambleModules = splitBlocksIntoModuleFiles(preambleText, folder, {
      skipEmptyFallback: true,
    });
    for (const mod of preambleModules) {
      const existing = filesByPath.get(mod.path);
      if (existing) {
        if (/_project\.dbml$/i.test(mod.path)) {
          const prev = existing.content.replace(/\n+$/, '');
          existing.content = prev
            ? `${mod.content.replace(/\n+$/, '')}\n\n${prev}\n`
            : mod.content;
        } else {
          const base = mod.path.replace(/\.dbml$/i, '');
          let n = 2;
          let candidate = `${base}_${n}.dbml`;
          while (filesByPath.has(candidate)) {
            n++;
            candidate = `${base}_${n}.dbml`;
          }
          filesByPath.set(candidate, {
            ...mod,
            id: `mod_${stamp}_pre_${filesByPath.size}`,
            path: candidate,
          });
        }
      } else {
        filesByPath.set(mod.path, {
          ...mod,
          id: `mod_${stamp}_pre_${filesByPath.size}`,
        });
      }
    }
  }

  const result = Array.from(filesByPath.values());
  if (result.length === 0) {
    return splitBlocksIntoModuleFiles(source, folderPrefix);
  }
  return result;
}

export function findModuleDefiningTable(
  files: SchemaModuleFile[],
  tableId: string
): SchemaModuleFile | undefined {
  const escaped = tableId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^\\s*Table\\s+(?:"${escaped}"|'${escaped}'|${escaped})(?:\\s|\\[|\\{|$)`,
    'im'
  );
  return files.find((f) => regex.test(f.content));
}

export function findModuleDefiningTableGroup(
  files: SchemaModuleFile[],
  groupName: string
): SchemaModuleFile | undefined {
  const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `TableGroup\\s+(?:"${escaped}"|'${escaped}'|${escaped})(?:\\s|\\[|\\{)`,
    'i'
  );
  return (
    files.find((f) => regex.test(f.content)) ||
    files.find((f) => /_project\.dbml$/i.test(f.path)) ||
    files.find((f) => /TableGroup\s+/i.test(f.content)) ||
    files[0]
  );
}
