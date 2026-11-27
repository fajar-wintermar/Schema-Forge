import { describe, expect, it } from 'vitest';
import { executeSaveWorkspace } from '../../server/application/usecases/workspaces/saveWorkspace';
import { ensureMigrations } from '../../server/infrastructure/persistence/d1/d1Migrator';
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
} from '../../server/infrastructure/persistence/d1/d1Types';
import { D1UserRepository } from '../../server/infrastructure/persistence/d1/D1UserRepository';
import { D1WorkspaceRepository } from '../../server/infrastructure/persistence/d1/D1WorkspaceRepository';
import { createLocalSqliteD1 } from '../../server/infrastructure/persistence/sqlite/localSqliteD1';
import { SCHEMA_MIGRATIONS } from '../../server/migrations/registry';

// Cloudflare D1 rejects statements with more than 100 bound parameters.
const D1_MAX_BOUND_PARAMETERS = 100;

const USER = {
  id: 4242,
  login: 'param-limit-user',
  name: null,
  avatar_url: '',
  html_url: '',
};

/** Wraps a database so every statement fails if it binds more than D1 allows. */
function withD1ParameterLimit(db: D1DatabaseLike): D1DatabaseLike {
  const wrapStatement = (
    stmt: D1PreparedStatementLike
  ): D1PreparedStatementLike =>
    new Proxy(stmt, {
      get(target, prop, receiver) {
        if (prop === 'bind') {
          return (...values: unknown[]) => {
            if (values.length > D1_MAX_BOUND_PARAMETERS) {
              throw new Error(
                `D1 limit exceeded: ${values.length} bound parameters`
              );
            }
            return wrapStatement(target.bind(...values));
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => wrapStatement(target.prepare(sql));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function makeVersions(count: number, prefix = 'ver') {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}_${i}`,
    tag: `v${i}`,
    title: `Version ${i}`,
    description: '',
    dbml: `Table t${i} { id int [pk] }`,
    tablePositions: {},
    stickyNotes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    isPublished: false,
  }));
}

async function countVersions(db: D1DatabaseLike, workspaceId: string) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM workspace_versions WHERE workspace_id = ?')
    .bind(workspaceId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

describe('D1 persistence', () => {
  it('saves a workspace with the maximum 100 versions within the D1 parameter limit', async () => {
    const handle = createLocalSqliteD1(':memory:');
    try {
      await ensureMigrations(handle.db);
      const db = withD1ParameterLimit(handle.db);
      const deps = {
        workspaceRepository: new D1WorkspaceRepository(db),
        userRepository: new D1UserRepository(db),
        user: USER,
        rawWorkspaceId: 'ws_param_limit',
      };

      await executeSaveWorkspace({
        ...deps,
        body: { name: 'Big', dbml: '', versions: makeVersions(100) },
      });
      expect(await countVersions(handle.db, 'ws_param_limit')).toBe(100);

      // Re-save with only the last 60: the other 40 must be removed.
      const meta = await deps.workspaceRepository.findMetadataById(
        'ws_param_limit'
      );
      await executeSaveWorkspace({
        ...deps,
        body: {
          name: 'Big',
          dbml: '',
          cloudRevision: meta?.revision,
          versions: makeVersions(100).slice(40),
        },
      });
      expect(await countVersions(handle.db, 'ws_param_limit')).toBe(60);
    } finally {
      handle.close();
    }
  });

  it('runs migrations on a database where an ADD COLUMN migration was applied outside the runner', async () => {
    const handle = createLocalSqliteD1(':memory:');
    try {
      const { db } = handle;
      const [init, shareExportToggle] = SCHEMA_MIGRATIONS;
      expect(shareExportToggle.id).toBe('0002_share_export_toggle');

      // Simulate a production database: 0001 recorded by the runtime runner,
      // 0002's column added by `wrangler d1 migrations apply` but not recorded.
      await db
        .prepare(
          `CREATE TABLE _schema_migrations (
             id TEXT PRIMARY KEY, name TEXT NOT NULL,
             checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`
        )
        .run();
      await db.batch([
        ...init.statements.map((sql) => db.prepare(sql)),
        db
          .prepare('INSERT INTO _schema_migrations VALUES (?, ?, ?, ?)')
          .bind(init.id, init.name, init.checksum, '2026-01-01T00:00:00.000Z'),
      ]);
      await db.prepare(shareExportToggle.statements[0]).run();

      await expect(ensureMigrations(db)).resolves.toBeUndefined();

      const applied = await db
        .prepare('SELECT id FROM _schema_migrations ORDER BY id')
        .all<{ id: string }>();
      expect((applied.results || []).map((r) => r.id)).toEqual(
        SCHEMA_MIGRATIONS.map((m) => m.id)
      );
    } finally {
      handle.close();
    }
  });
});
