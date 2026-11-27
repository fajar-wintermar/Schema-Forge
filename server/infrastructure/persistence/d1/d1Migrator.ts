import type { D1DatabaseLike } from './d1Types';
import { SCHEMA_MIGRATIONS } from '../../../migrations/registry';

export interface AppliedMigrationRecord {
  id: string;
  name: string;
  checksum: string;
  applied_at: string;
}

const MIGRATIONS_HISTORY_TABLE_SQL = `CREATE TABLE IF NOT EXISTS _schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

const migrationStateByDb = new WeakMap<D1DatabaseLike, Promise<void>>();

const ADD_COLUMN_PATTERN =
  /^\s*ALTER\s+TABLE\s+["`]?(\w+)["`]?\s+ADD\s+(?:COLUMN\s+)?["`]?(\w+)["`]?/i;

/**
 * True when `sql` is an `ALTER TABLE ... ADD COLUMN` whose column already
 * exists. That happens when a migration was applied outside this runner (for
 * example with `wrangler d1 migrations apply`) and so was never recorded in
 * `_schema_migrations`. SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running
 * the statement would fail with "duplicate column name" and block every
 * request that waits on migrations.
 */
async function isAlreadyAppliedAddColumn(
  db: D1DatabaseLike,
  sql: string
): Promise<boolean> {
  const match = ADD_COLUMN_PATTERN.exec(sql);
  if (!match) return false;
  const [, table, column] = match;
  const info = await db
    .prepare(`PRAGMA table_info("${table}")`)
    .all<{ name: string }>();
  return (info.results || []).some(
    (row) => row.name.toLowerCase() === column.toLowerCase()
  );
}

async function runMigrationsInternal(db: D1DatabaseLike): Promise<void> {
  await db.prepare(MIGRATIONS_HISTORY_TABLE_SQL).run();

  const existing = await db
    .prepare('SELECT id, checksum FROM _schema_migrations ORDER BY id ASC')
    .all<{ id: string; checksum: string }>();

  const appliedIds = new Set((existing.results || []).map((row) => row.id));

  for (const migration of SCHEMA_MIGRATIONS) {
    if (appliedIds.has(migration.id)) {
      continue;
    }

    const pendingStatements: string[] = [];
    for (const sql of migration.statements) {
      if (!(await isAlreadyAppliedAddColumn(db, sql))) {
        pendingStatements.push(sql);
      }
    }

    const now = new Date().toISOString();
    const batchStatements = [
      ...pendingStatements.map((sql) => db.prepare(sql)),
      db
        .prepare(
          `INSERT OR IGNORE INTO _schema_migrations (id, name, checksum, applied_at)
           VALUES (?, ?, ?, ?)`
        )
        .bind(migration.id, migration.name, migration.checksum, now),
    ];

    await db.batch(batchStatements);
    appliedIds.add(migration.id);
  }
}

export function ensureMigrations(db: D1DatabaseLike): Promise<void> {
  const existingPromise = migrationStateByDb.get(db);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = runMigrationsInternal(db).catch((err) => {
    migrationStateByDb.delete(db);
    throw err;
  });

  migrationStateByDb.set(db, promise);
  return promise;
}

export async function listAppliedMigrations(
  db: D1DatabaseLike
): Promise<AppliedMigrationRecord[]> {
  await ensureMigrations(db);
  const res = await db
    .prepare(
      'SELECT id, name, checksum, applied_at FROM _schema_migrations ORDER BY id ASC'
    )
    .all<AppliedMigrationRecord>();
  return res.results || [];
}
