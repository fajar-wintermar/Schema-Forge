import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  D1Result,
} from '../types';

function toSqlValue(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return String(value);
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

let cachedDb: D1DatabaseLike | null = null;

export function getLocalD1Database(): D1DatabaseLike {
  if (cachedDb) return cachedDb;

  const dataDir = path.resolve(process.cwd(), '.data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'schemaforge-dev.sqlite');

  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  cachedDb = {
    prepare(query: string): D1PreparedStatementLike {
      return new LocalSqlitePreparedStatement(sqlite, query);
    },
    async batch<T = Record<string, unknown>>(
      statements: D1PreparedStatementLike[]
    ): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      sqlite.exec('BEGIN TRANSACTION;');
      try {
        for (const stmt of statements) {
          const r = (await stmt.all()) as D1Result<T>;
          results.push(r);
        }
        sqlite.exec('COMMIT;');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
    },
  };

  return cachedDb;
}
