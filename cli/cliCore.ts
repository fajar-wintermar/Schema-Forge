import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseDbml } from '@shared/domain/dbml';
import { ParsedSchema, SchemaModuleFile, TablePosition } from '../shared/domain/schemaTypes';
import { computeAutoLayout } from '../src/utils/autoLayout';
import { computeDocsCoverage, DocsCoverageReport } from '../src/utils/docsCoverage';
import { parseWorkspaceLayoutJson, SCHEMAFORGE_LAYOUT_PATH } from '../src/utils/layoutSync';
import {
  buildSchemaDiffMarkdownSummary,
  BreakingSchemaChange,
  computeSchemaDiff,
  detectBreakingSchemaChanges,
} from '../src/utils/schemaDiff';
import { lintSchemaQuality, SchemaLintResult } from '../src/utils/schemaLinter';
import { mergeSchemaFiles } from '../src/utils/schemaModules';
import { exportSchemaToDbml } from '../src/utils/io/dbmlIo';
import { buildDiagramSvg } from '../src/utils/io/diagramExport';
import { DiagramSlice, exportSchemaToHtml, exportSchemaToMarkdown } from '../src/utils/io/docsExport';
import { exportSchemaToMermaid } from '../src/utils/io/mermaidExport';
import {
  exportSchemaToDrizzle,
  exportSchemaToOpenApi,
  exportSchemaToPrisma,
  exportSchemaToSqlAlchemy,
  importDrizzleToDbml,
  importOpenApiToDbml,
  importPrismaToDbml,
} from '../src/utils/io/ormConverters';
import { exportSchemaToSql, importSqlToDbml } from '../src/utils/io/sqlIo';

const require = createRequire(import.meta.url);

export type CliExportFormat =
  | 'html'
  | 'md'
  | 'markdown'
  | 'svg'
  | 'mermaid'
  | 'mmd'
  | 'sql'
  | 'postgres'
  | 'mysql'
  | 'prisma'
  | 'drizzle'
  | 'sqlalchemy'
  | 'openapi'
  | 'dbml';

export interface LoadedSchemaBundle {
  dbml: string;
  schema: ParsedSchema;
  sourceLabel: string;
  fileCount: number;
  positions: Record<string, TablePosition>;
  collapsedGroups: string[];
}

async function collectDbmlFilesRecursive(
  dirPath: string,
  rootDir: string,
  out: SchemaModuleFile[]
): Promise<void> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await collectDbmlFilesRecursive(full, rootDir, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dbml')) {
      const content = await fs.readFile(full, 'utf8');
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      out.push({
        id: rel,
        path: rel,
        content,
      });
    }
  }
}

async function tryReadSiblingLayout(targetPath: string): Promise<{
  tablePositions?: Record<string, TablePosition>;
  collapsedGroups?: string[];
}> {
  const candidates = [
    path.join(targetPath, SCHEMAFORGE_LAYOUT_PATH),
    path.join(path.dirname(targetPath), SCHEMAFORGE_LAYOUT_PATH),
    path.join(process.cwd(), SCHEMAFORGE_LAYOUT_PATH),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed = parseWorkspaceLayoutJson(raw);
      if (parsed) {
        const collapsedGroups = Object.entries(parsed.groupMeta)
          .filter(([, meta]) => Boolean(meta?.collapsed))
          .map(([name]) => name);
        return { tablePositions: parsed.tablePositions, collapsedGroups };
      }
    } catch {
      // ignore missing layout file
    }
  }
  return {};
}

export async function loadSchemaInput(targetPath: string): Promise<LoadedSchemaBundle> {
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved);
  const layoutHint = await tryReadSiblingLayout(resolved);

  let dbml = '';
  let fileCount = 1;

  if (stat.isDirectory()) {
    const files: SchemaModuleFile[] = [];
    await collectDbmlFilesRecursive(resolved, resolved, files);
    if (files.length === 0) {
      throw new Error(`No .dbml files found in directory "${targetPath}".`);
    }
    const merged = mergeSchemaFiles(files, {
      schemaFolder: path.basename(resolved) || 'schema',
    });
    dbml = merged.mergedDbml;
    fileCount = files.length;
  } else {
    const raw = await fs.readFile(resolved, 'utf8');
    const lower = resolved.toLowerCase();
    if (lower.endsWith('.prisma')) {
      dbml = importPrismaToDbml(raw);
    } else if (lower.endsWith('.sql')) {
      dbml = importSqlToDbml(raw);
    } else if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
      dbml = importOpenApiToDbml(raw);
    } else if (lower.endsWith('.ts') || lower.endsWith('.mts')) {
      dbml = importDrizzleToDbml(raw);
    } else {
      dbml = raw;
    }
  }

  const schema = parseDbml(dbml);
  const autoPos = computeAutoLayout(schema, 'full');
  const positions = layoutHint.tablePositions
    ? { ...autoPos, ...layoutHint.tablePositions }
    : autoPos;

  return {
    dbml,
    schema,
    sourceLabel: targetPath,
    fileCount,
    positions,
    collapsedGroups: layoutHint.collapsedGroups || [],
  };
}

export interface SchemaCheckReport {
  ok: boolean;
  source: string;
  fileCount: number;
  tableCount: number;
  refCount: number;
  parseErrors: Array<{ line: number; message: string }>;
  lint: SchemaLintResult;
  coverage: DocsCoverageReport;
  breakingChanges: BreakingSchemaChange[];
  diffSummary?: {
    tablesAdded: number;
    tablesRemoved: number;
    tablesModified: number;
    columnsChanged: number;
    indexesChanged: number;
    refsChanged: number;
  };
  markdown: string;
}

export async function runSchemaCheck(options: {
  targetPath: string;
  basePath?: string;
  strict?: boolean;
  dialect?: 'postgres' | 'mysql';
}): Promise<SchemaCheckReport> {
  const target = await loadSchemaInput(options.targetPath);
  const parseErrors = target.schema.errors.map((e) => ({
    line: e.line,
    message: e.message,
  }));
  const lint = lintSchemaQuality(target.schema);
  const coverage = computeDocsCoverage(target.schema);

  let breakingChanges: BreakingSchemaChange[] = [];
  let diffSummary: SchemaCheckReport['diffSummary'];
  let diffMarkdown = '';

  if (options.basePath) {
    const base = await loadSchemaInput(options.basePath);
    const diff = computeSchemaDiff(base.dbml, target.dbml);
    breakingChanges = detectBreakingSchemaChanges(diff);
    diffSummary = {
      tablesAdded: diff.summary.tablesAdded,
      tablesRemoved: diff.summary.tablesRemoved,
      tablesModified: diff.summary.tablesModified,
      columnsChanged: diff.summary.columnsChanged,
      indexesChanged: diff.summary.indexesChanged,
      refsChanged: diff.summary.refsChanged,
    };
    diffMarkdown = buildSchemaDiffMarkdownSummary(diff, {
      title: 'Schema Diff vs. Base',
      includeSql: true,
      dialect: options.dialect || 'postgres',
      baseLabel: options.basePath,
      targetLabel: options.targetPath,
    });
  }

  const hasHardBreaking = breakingChanges.some((b) => b.severity === 'breaking');
  const ok =
    parseErrors.length === 0 &&
    (!options.strict || (lint.warningCount === 0 && !hasHardBreaking));

  const mdLines: string[] = [
    `<!-- schemaforge-pr-check -->`,
    `## ${ok ? '✅' : '⚠️'} SchemaForge Schema Check`,
    '',
    `- **Source:** \`${options.targetPath}\` (${target.fileCount} ${
      target.fileCount === 1 ? 'file' : 'files'
    })`,
    `- **Model:** ${target.schema.tables.length} tables · ${target.schema.refs.length} relationships · ${target.schema.tableGroups.length} domains`,
    `- **Docs Coverage:** ${coverage.overallPct}% (${coverage.tables.documented}/${coverage.tables.total} tables · ${coverage.columns.documented}/${coverage.columns.total} columns documented)`,
    `- **Quality Linter:** ${lint.warningCount} warning(s), ${lint.infoCount} info note(s)`,
  ];

  if (parseErrors.length > 0) {
    mdLines.push('');
    mdLines.push('### Parse Errors');
    for (const err of parseErrors.slice(0, 20)) {
      mdLines.push(`- Line ${err.line}: ${err.message}`);
    }
  }

  if (lint.issues.length > 0) {
    mdLines.push('');
    mdLines.push('### Quality Linter Findings');
    for (const issue of lint.issues.slice(0, 15)) {
      mdLines.push(
        `- **[${issue.severity.toUpperCase()}]** \`${issue.ruleId}\`: ${issue.message}`
      );
    }
    if (lint.issues.length > 15) {
      mdLines.push(`- …and ${lint.issues.length - 15} more issues`);
    }
  }

  if (diffMarkdown) {
    mdLines.push('');
    mdLines.push(diffMarkdown.trim());
  }

  return {
    ok,
    source: options.targetPath,
    fileCount: target.fileCount,
    tableCount: target.schema.tables.length,
    refCount: target.schema.refs.length,
    parseErrors,
    lint,
    coverage,
    breakingChanges,
    diffSummary,
    markdown: mdLines.join('\n').trim() + '\n',
  };
}

function quoteDbmlIdent(name: string): string {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

function escapeDbmlSingleQuoted(val: string): string {
  return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export async function introspectSqliteToDbml(options: {
  sourcePath: string;
  againstPath?: string;
}): Promise<{
  dbml: string;
  tableCount: number;
  refCount: number;
  driftMarkdown?: string;
}> {
  const { sourcePath, againstPath } = options;

  let dbml = '';

  if (sourcePath.toLowerCase().endsWith('.sql')) {
    const rawSql = await fs.readFile(path.resolve(sourcePath), 'utf8');
    dbml = importSqlToDbml(rawSql);
  } else {
    type SqliteDatabaseSync = new (path: string, opts?: { readOnly?: boolean }) => {
      prepare: (sql: string) => { all: (...params: unknown[]) => Record<string, unknown>[] };
      close: () => void;
    };
    const sqliteMod = require('node:sqlite') as { DatabaseSync: SqliteDatabaseSync };
    const resolvedDb =
      sourcePath === ':memory:' ? ':memory:' : path.resolve(sourcePath);
    const db = new sqliteMod.DatabaseSync(resolvedDb, {
      readOnly: resolvedDb !== ':memory:',
    });

    try {
      const tableRows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all();

      const lines: string[] = [
        `Project ${quoteDbmlIdent(
          path.basename(sourcePath, path.extname(sourcePath)) || 'SQLiteSchema'
        )} {`,
        `  database_type: 'SQLite'`,
        `}`,
        '',
      ];
      const refs: string[] = [];

      for (const row of tableRows) {
        const tableName = String(row.name || '');
        if (!tableName) continue;
        const safePragmaName = tableName.replace(/"/g, '""');

        const cols = db.prepare(`PRAGMA table_info("${safePragmaName}")`).all();
        const fkRows = db.prepare(`PRAGMA foreign_key_list("${safePragmaName}")`).all();
        const idxRows = db.prepare(`PRAGMA index_list("${safePragmaName}")`).all();

        const singleUniqueCols = new Set<string>();
        const multiIndexes: Array<{ name: string; unique: boolean; cols: string[] }> = [];

        for (const idx of idxRows) {
          const origin = String(idx.origin || '');
          const idxName = String(idx.name || '');
          const unique = Number(idx.unique || 0) === 1;
          if (!idxName || origin === 'pk') continue;
          const idxCols = db
            .prepare(`PRAGMA index_info("${idxName.replace(/"/g, '""')}")`)
            .all()
            .sort((a, b) => Number(a.seqno || 0) - Number(b.seqno || 0))
            .map((ic) => String(ic.name || ''))
            .filter(Boolean);
          if (idxCols.length === 1 && unique && origin === 'u') {
            singleUniqueCols.add(idxCols[0]);
          } else if (idxCols.length > 0) {
            multiIndexes.push({ name: idxName, unique, cols: idxCols });
          }
        }

        const pkCols = cols.filter((c) => Number(c.pk || 0) > 0);
        const compositePk = pkCols.length > 1;

        lines.push(`Table ${quoteDbmlIdent(tableName)} {`);
        for (const col of cols) {
          const colName = String(col.name || '');
          const colType = String(col.type || 'text').trim() || 'text';
          const isPk = !compositePk && Number(col.pk || 0) > 0;
          const notNull = Number(col.notnull || 0) === 1;
          const dflt = col.dflt_value;

          const attrs: string[] = [];
          if (isPk) attrs.push('pk');
          if (notNull && !isPk) attrs.push('not null');
          if (singleUniqueCols.has(colName)) attrs.push('unique');
          if (dflt !== null && dflt !== undefined && String(dflt).trim() !== '') {
            const rawDflt = String(dflt).trim();
            if (/^\d+(\.\d+)?$/.test(rawDflt) || /^(true|false)$/i.test(rawDflt)) {
              attrs.push(`default: ${rawDflt}`);
            } else if (/^'.*'$/.test(rawDflt)) {
              attrs.push(`default: ${rawDflt}`);
            } else {
              attrs.push(`default: ${escapeDbmlSingleQuoted(rawDflt)}`);
            }
          }

          lines.push(
            `  ${quoteDbmlIdent(colName)} ${colType}${
              attrs.length > 0 ? ` [${attrs.join(', ')}]` : ''
            }`
          );
        }

        if (compositePk || multiIndexes.length > 0) {
          lines.push('');
          lines.push('  Indexes {');
          if (compositePk) {
            const orderedPk = pkCols
              .sort((a, b) => Number(a.pk || 0) - Number(b.pk || 0))
              .map((c) => quoteDbmlIdent(String(c.name || '')));
            lines.push(`    (${orderedPk.join(', ')}) [pk]`);
          }
          for (const idx of multiIndexes) {
            const colExpr =
              idx.cols.length === 1
                ? quoteDbmlIdent(idx.cols[0])
                : `(${idx.cols.map(quoteDbmlIdent).join(', ')})`;
            const idxAttrs: string[] = [`name: '${idx.name.replace(/'/g, "\\'")}'`];
            if (idx.unique) idxAttrs.push('unique');
            lines.push(`    ${colExpr} [${idxAttrs.join(', ')}]`);
          }
          lines.push('  }');
        }

        lines.push('}');
        lines.push('');

        for (const fk of fkRows) {
          const fromCol = String(fk.from || '');
          const toTable = String(fk.table || '');
          const toCol = String(fk.to || 'id') || 'id';
          if (fromCol && toTable) {
            const opts: string[] = [];
            const onDel = String(fk.on_delete || '').toLowerCase();
            const onUpd = String(fk.on_update || '').toLowerCase();
            if (onDel && onDel !== 'no action') opts.push(`delete: ${onDel}`);
            if (onUpd && onUpd !== 'no action') opts.push(`update: ${onUpd}`);
            refs.push(
              `Ref: ${quoteDbmlIdent(tableName)}.${quoteDbmlIdent(
                fromCol
              )} > ${quoteDbmlIdent(toTable)}.${quoteDbmlIdent(toCol)}${
                opts.length > 0 ? ` [${opts.join(', ')}]` : ''
              }`
            );
          }
        }
      }

      if (refs.length > 0) {
        lines.push(...refs);
        lines.push('');
      }

      dbml = lines.join('\n').trimEnd() + '\n';
    } finally {
      db.close();
    }
  }

  const parsed = parseDbml(dbml);
  let driftMarkdown: string | undefined;
  if (againstPath) {
    const baseline = await loadSchemaInput(againstPath);
    const diff = computeSchemaDiff(baseline.dbml, dbml);
    driftMarkdown = buildSchemaDiffMarkdownSummary(diff, {
      title: `Schema Drift: ${againstPath} vs. ${sourcePath}`,
      includeSql: true,
      baseLabel: againstPath,
      targetLabel: sourcePath,
    });
  }

  return {
    dbml,
    tableCount: parsed.tables.length,
    refCount: parsed.refs.length,
    driftMarkdown,
  };
}

export async function runSchemaExport(options: {
  targetPath: string;
  format: CliExportFormat;
  darkMode?: boolean;
  title?: string;
}): Promise<{ content: string; extension: string }> {
  const bundle = await loadSchemaInput(options.targetPath);
  const title =
    options.title?.trim() || bundle.schema.project.name || 'Database Schema';

  switch (options.format) {
    case 'html': {
      const { svg } = buildDiagramSvg({
        schema: bundle.schema,
        positions: bundle.positions,
        detailLevel: 'full',
        darkMode: Boolean(options.darkMode),
        title,
        collapsedGroups: bundle.collapsedGroups,
      });
      const domainDiagrams: DiagramSlice[] = bundle.schema.tableGroups.map((g) => ({
        id: g.name,
        label: g.name,
        color: g.color,
        svg: buildDiagramSvg({
          schema: bundle.schema,
          positions: bundle.positions,
          detailLevel: 'full',
          darkMode: Boolean(options.darkMode),
          title: `${title} · ${g.name}`,
          selectedDomains: [g.name],
          collapsedGroups: bundle.collapsedGroups,
        }).svg,
      }));
      return {
        content: exportSchemaToHtml(bundle.schema, {
          title,
          svgDiagram: svg,
          domainDiagrams,
          darkMode: Boolean(options.darkMode),
        }),
        extension: 'docs.html',
      };
    }
    case 'md':
    case 'markdown':
      return {
        content: exportSchemaToMarkdown(bundle.schema, { title }),
        extension: 'docs.md',
      };
    case 'svg':
      return {
        content: buildDiagramSvg({
          schema: bundle.schema,
          positions: bundle.positions,
          detailLevel: 'full',
          darkMode: Boolean(options.darkMode),
          title,
          collapsedGroups: bundle.collapsedGroups,
        }).svg,
        extension: 'svg',
      };
    case 'mermaid':
    case 'mmd':
      return {
        content: exportSchemaToMermaid(bundle.schema),
        extension: 'mmd',
      };
    case 'sql':
    case 'postgres':
      return {
        content: exportSchemaToSql(bundle.schema, 'postgres'),
        extension: 'postgres.sql',
      };
    case 'mysql':
      return {
        content: exportSchemaToSql(bundle.schema, 'mysql'),
        extension: 'mysql.sql',
      };
    case 'prisma':
      return {
        content: exportSchemaToPrisma(bundle.schema),
        extension: 'prisma',
      };
    case 'drizzle':
      return {
        content: exportSchemaToDrizzle(bundle.schema),
        extension: 'schema.ts',
      };
    case 'sqlalchemy':
      return {
        content: exportSchemaToSqlAlchemy(bundle.schema),
        extension: 'models.py',
      };
    case 'openapi':
      return {
        content: exportSchemaToOpenApi(bundle.schema),
        extension: 'openapi.json',
      };
    case 'dbml':
      return {
        content: exportSchemaToDbml(bundle.schema),
        extension: 'dbml',
      };
  }
}

export async function postGithubPrComment(params: {
  repoSlug: string;
  prNumber: number;
  body: string;
  token: string;
}): Promise<{ id: number; url: string }> {
  const [owner, repo] = params.repoSlug.split('/');
  if (!owner || !repo || !Number.isFinite(params.prNumber)) {
    throw new Error('Invalid --repo owner/repo or --pr number.');
  }
  const marker = '<!-- schemaforge-pr-check -->';
  const commentsUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/issues/${params.prNumber}/comments`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'SchemaForge-CLI',
    Authorization: `Bearer ${params.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const listRes = await fetch(`${commentsUrl}?per_page=50`, { headers });
  let existingCommentId: number | null = null;
  if (listRes.ok) {
    const existing = (await listRes.json()) as Array<{
      id: number;
      body?: string;
    }>;
    const match = existing.find((c) => (c.body || '').includes(marker));
    if (match) existingCommentId = match.id;
  }

  const targetEndpoint = existingCommentId
    ? `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/issues/comments/${existingCommentId}`
    : commentsUrl;
  const method = existingCommentId ? 'PATCH' : 'POST';

  const res = await fetch(targetEndpoint, {
    method,
    headers,
    body: JSON.stringify({ body: params.body }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR comment failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { id: number; html_url: string };
  return { id: json.id, url: json.html_url };
}
