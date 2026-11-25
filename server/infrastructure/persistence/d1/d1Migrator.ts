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

    const now = new Date().toISOString();
    const batchStatements = [
      ...migration.statements.map((sql) => db.prepare(sql)),
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
