import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1Result,
} from '../d1/d1Types';

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return String(value);
}

function resolveSqliteDatabasePath(configuredUrl?: string): string {
  const raw = (configuredUrl ?? '').trim();
  if (!raw) {
    return path.resolve(process.cwd(), '.data', 'schemaforge-dev.sqlite');
  }
  if (raw.includes('\0')) {
    throw new Error('Invalid DATABASE_URL: null byte is not allowed.');
  }
  if (raw === ':memory:' || raw === 'sqlite::memory:') {
    return ':memory:';
  }
  if (/^(postgres(ql)?|mysql|mariadb|mssql):\/\//i.test(raw)) {
    throw new Error(
      'Unsupported DATABASE_URL scheme for built-in SQLite adapter.'
    );
  }

  let fileTarget = raw;
  if (raw.startsWith('sqlite://')) {
    fileTarget = raw.slice('sqlite://'.length);
  } else if (raw.startsWith('file:')) {
    try {
      fileTarget = decodeURIComponent(new URL(raw).pathname);
    } catch {
      fileTarget = raw.replace(/^file:(\/\/)?/, '');
    }
  }

  if (!fileTarget) {
    throw new Error('Invalid DATABASE_URL: empty SQLite file path.');
  }
  return path.resolve(process.cwd(), fileTarget);
}

class LocalSqlitePreparedStatement implements D1PreparedStatementLike {
  private readonly db: DatabaseSync;
  private readonly query: string;
  private readonly params: SQLInputValue[];

  constructor(
    db: DatabaseSync,
    query: string,
    params: SQLInputValue[] = []
  ) {
    this.db = db;
    this.query = query;
    this.params = params;
  }

  bind(...values: unknown[]): D1PreparedStatementLike {
    return new LocalSqlitePreparedStatement(
      this.db,
      this.query,
      values.map(toSqlValue)
    );
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = stmt.get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) {
      return (row[colName] ?? null) as T | null;
    }
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const results = stmt.all(...this.params) as T[];
    return { results, success: true };
  }

  async run(): Promise<D1Result> {
    const stmt = this.db.prepare(this.query);
    const info = stmt.run(...this.params);
    return {
      results: [],
      success: true,
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
      },
    };
  }
}

export interface LocalSqliteHandle {
  db: D1DatabaseLike;
  close: () => void;
}

export function createLocalSqliteD1(databaseUrl?: string): LocalSqliteHandle {
  const dbPath = resolveSqliteDatabasePath(databaseUrl);
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  let sqlite: DatabaseSync | null = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA busy_timeout = 5000;');
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const activeSqlite = sqlite;
  const db: D1DatabaseLike = {
    prepare(query: string): D1PreparedStatementLike {
      return new LocalSqlitePreparedStatement(activeSqlite, query);
    },
    async batch<T = Record<string, unknown>>(
      statements: D1PreparedStatementLike[]
    ): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      activeSqlite.exec('BEGIN TRANSACTION;');
      try {
        for (const stmt of statements) {
          const r = (await stmt.all()) as D1Result<T>;
          results.push(r);
        }
        activeSqlite.exec('COMMIT;');
        return results;
      } catch (err) {
        activeSqlite.exec('ROLLBACK;');
        throw err;
      }
    },
  };

  const close = () => {
    if (!sqlite) return;
    try {
      sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // Ignore WAL checkpoint errors during shutdown
    }
    try {
      sqlite.close();
    } finally {
      sqlite = null;
    }
  };

  return { db, close };
}
