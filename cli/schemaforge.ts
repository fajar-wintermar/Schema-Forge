#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CliExportFormat,
  introspectSqliteToDbml,
  postGithubPrComment,
  runSchemaCheck,
  runSchemaExport,
} from './cliCore';

function printHelp() {
  console.log(`SchemaForge CLI

Usage:
  schemaforge check <path> [options]     Validate DBML/directory, run linter, check docs coverage & semantic diff
  schemaforge pull <source> [options]    Introspect live SQLite DB (.sqlite/.db) or .sql DDL into DBML
  schemaforge export <path> [options]    Export DBML workspace to HTML docs, Markdown, SVG, Mermaid, SQL, Prisma, Drizzle, SQLAlchemy, OpenAPI

Check Options:
  --base <path>          Compare against a baseline .dbml file or schema directory
  --strict               Exit with code 1 on linter warnings or breaking schema changes
  --dialect postgres|mysql
  --json                 Emit JSON report
  --markdown             Emit Markdown PR summary report
  --pr-comment           Post or update Markdown report on GitHub PR (uses GITHUB_TOKEN env var)
  --repo <owner/repo>    GitHub repository slug for --pr-comment
  --pr <number>          Pull request number for --pr-comment

Pull Options:
  --out <file.dbml>      Write generated DBML to file (prints to stdout if omitted)
  --against <path>       Compare introspected DBML against baseline DBML to detect schema drift

Export Options:
  --format <fmt>         html | md | svg | mermaid | sql | postgres | mysql | prisma | drizzle | sqlalchemy | openapi | dbml
  --out <file>           Output file path (prints to stdout if omitted)
  --dark                 Use dark theme for HTML/SVG export
  --title <text>         Custom document or diagram title
`);
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function getPositionalArgs(args: string[]): string[] {
  const valueFlags = new Set([
    '--base',
    '--dialect',
    '--repo',
    '--pr',
    '--out',
    '--against',
    '--format',
    '--title',
  ]);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) {
      i++;
      continue;
    }
    if (args[i].startsWith('-')) continue;
    out.push(args[i]);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    printHelp();
    process.exit(0);
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const positional = getPositionalArgs(rest);

  if (command === 'check') {
    const targetPath = positional[0] || 'schema';
    const basePath = getFlag(rest, '--base');
    const strict = hasFlag(rest, '--strict');
    const dialect = (getFlag(rest, '--dialect') === 'mysql'
      ? 'mysql'
      : 'postgres') as 'postgres' | 'mysql';

    const report = await runSchemaCheck({
      targetPath,
      basePath,
      strict,
      dialect,
    });

    if (hasFlag(rest, '--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else if (hasFlag(rest, '--markdown')) {
      console.log(report.markdown);
    } else {
      console.log(
        `SchemaForge Check: ${report.source} (${report.fileCount} files, ${report.tableCount} tables, ${report.refCount} refs)`
      );
      console.log(
        `Docs Coverage: ${report.coverage.overallPct}% (${report.coverage.tables.documented}/${report.coverage.tables.total} tables, ${report.coverage.columns.documented}/${report.coverage.columns.total} columns)`
      );
      console.log(
        `Linter: ${report.lint.warningCount} warning(s), ${report.lint.infoCount} info note(s)`
      );
      if (report.parseErrors.length > 0) {
        console.error(`Parse errors (${report.parseErrors.length}):`);
        for (const err of report.parseErrors) {
          console.error(`  Line ${err.line}: ${err.message}`);
        }
      }
      if (report.breakingChanges.length > 0) {
        console.warn(`Breaking/caution changes (${report.breakingChanges.length}):`);
        for (const bc of report.breakingChanges) {
          console.warn(`  [${bc.severity.toUpperCase()}] ${bc.message}`);
        }
      }
    }

    if (hasFlag(rest, '--pr-comment')) {
      const repoSlug = getFlag(rest, '--repo') || process.env.GITHUB_REPOSITORY;
      const prRaw = getFlag(rest, '--pr');
      const token = process.env.GITHUB_TOKEN;
      if (!token || !repoSlug || !prRaw) {
        console.error(
          'Skipping PR comment: requires --repo owner/repo, --pr <number>, and GITHUB_TOKEN env var.'
        );
      } else {
        const comment = await postGithubPrComment({
          repoSlug,
          prNumber: Number(prRaw),
          body: report.markdown,
          token,
        });
        console.error(`Updated GitHub PR comment: ${comment.url}`);
      }
    }

    process.exit(report.ok ? 0 : 1);
  }

  if (command === 'pull') {
    const sourcePath = positional[0];
    if (!sourcePath) {
      console.error('Missing source SQLite or SQL file path. Example: schemaforge pull app.sqlite --out schema.dbml');
      process.exit(1);
    }
    const outPath = getFlag(rest, '--out');
    const againstPath = getFlag(rest, '--against');

    const result = await introspectSqliteToDbml({
      sourcePath,
      againstPath,
    });

    if (outPath) {
      await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
      await fs.writeFile(path.resolve(outPath), result.dbml, 'utf8');
      console.log(
        `Wrote ${result.tableCount} tables (${result.refCount} refs) to ${outPath}`
      );
    } else {
      process.stdout.write(result.dbml);
    }

    if (result.driftMarkdown) {
      console.error('\n' + result.driftMarkdown);
    }
    process.exit(0);
  }

  if (command === 'export') {
    const targetPath = positional[0] || 'schema';
    const format = (getFlag(rest, '--format') || 'md').toLowerCase() as CliExportFormat;
    const outPath = getFlag(rest, '--out');
    const darkMode = hasFlag(rest, '--dark');
    const title = getFlag(rest, '--title');

    const exported = await runSchemaExport({
      targetPath,
      format,
      darkMode,
      title,
    });

    if (outPath) {
      await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
      await fs.writeFile(path.resolve(outPath), exported.content, 'utf8');
      console.log(`Exported ${format} bundle to ${outPath}`);
    } else {
      process.stdout.write(exported.content);
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
