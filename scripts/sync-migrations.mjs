import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'migrations');
const OUTPUT_FILE = path.join(ROOT_DIR, 'server', 'migrations', 'registry.ts');

/**
 * Splits a SQLite/D1 migration SQL file into individual executable statements.
 * Respects string literals, quoted identifiers, line/block comments, and CREATE TRIGGER blocks.
 */
function splitSqlStatements(rawSql) {
  const sql = rawSql.replace(/\r\n/g, '\n');
  const statements = [];

  let current = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inTriggerBody = false;

  const isWordBoundary = (ch) => !ch || !/[A-Za-z0-9_]/.test(ch);

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += '\n';
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inBacktick) {
      current += ch;
      if (ch === '`' && next === '`') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '`') {
        inBacktick = false;
      }
      i += 1;
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '`') {
      inBacktick = true;
      current += ch;
      i += 1;
      continue;
    }

    if (!inTriggerBody && isWordBoundary(sql[i - 1])) {
      const slice = sql.slice(i, i + 32).toUpperCase();
      if (/^CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/.test(slice)) {
        // Track trigger block once BEGIN starts inside this statement
        inTriggerBody = true;
      }
    }

    if (inTriggerBody && ch === ';') {
      const trimmedUpper = current.trimEnd().toUpperCase();
      if (/\bEND$/.test(trimmedUpper) && /\bBEGIN\b/.test(trimmedUpper)) {
        const stmt = current.trim();
        if (stmt) statements.push(stmt);
        current = '';
        inTriggerBody = false;
        i += 1;
        continue;
      }
    }

    if (!inTriggerBody && ch === ';') {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

function deriveMigrationName(fileName, rawSql) {
  const firstLine = rawSql.replace(/\r\n/g, '\n').split('\n')[0]?.trim() || '';
  if (firstLine.startsWith('--')) {
    const cleaned = firstLine.replace(/^--\s*/, '').trim();
    if (cleaned) return cleaned;
  }
  const base = fileName.replace(/\.sql$/i, '');
  return base.replace(/^\d+[_-]?/, '').replace(/[_-]+/g, ' ') || base;
}

function syncMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  }

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  const migrations = sqlFiles.map((fileName) => {
    const fullPath = path.join(MIGRATIONS_DIR, fileName);
    const rawSql = fs.readFileSync(fullPath, 'utf8');
    const normalizedSql = rawSql.replace(/\r\n/g, '\n').trim();
    const id = fileName.replace(/\.sql$/i, '');
    const name = deriveMigrationName(fileName, rawSql);
    const checksum = crypto
      .createHash('sha256')
      .update(normalizedSql)
      .digest('hex')
      .slice(0, 16);
    const statements = splitSqlStatements(rawSql);

    if (statements.length === 0) {
      throw new Error(`Migration file "${fileName}" contains no SQL statements.`);
    }

    return {
      id,
      file: `migrations/${fileName}`,
      name,
      checksum,
      statements,
    };
  });

  const rendered = `// AUTO-GENERATED BY scripts/sync-migrations.mjs FROM /migrations/*.sql
// DO NOT EDIT THIS FILE MANUALLY — create or update .sql files in /migrations/ instead.

export interface SchemaMigration {
  /** Immutable, lexicographically ordered migration ID (filename without .sql). */
  id: string;
  /** Source SQL file path relative to repository root. */
  file: string;
  /** Human-readable description recorded in _schema_migrations. */
  name: string;
  /** SHA-256 checksum prefix of the source .sql file. */
  checksum: string;
  /** Ordered SQL statements extracted from the source .sql file. */
  statements: string[];
}

export const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = ${JSON.stringify(
    migrations,
    null,
    2
  )};
`;

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  const existing = fs.existsSync(OUTPUT_FILE)
    ? fs.readFileSync(OUTPUT_FILE, 'utf8')
    : null;

  if (existing !== rendered) {
    fs.writeFileSync(OUTPUT_FILE, rendered, 'utf8');
    console.log(
      `[migrations] Synced ${migrations.length} SQL migration(s) from /migrations -> server/migrations/registry.ts`
    );
  }
}

syncMigrations();
