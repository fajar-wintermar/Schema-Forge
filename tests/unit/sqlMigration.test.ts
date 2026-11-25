import { describe, expect, it } from 'vitest';
import { parseDbml } from '@shared/domain/dbml';
import { exportSchemaToSql, importSqlToDbml } from '../../src/utils/io/sqlIo';
import { generateIncrementalSqlMigration } from '../../src/utils/schemaDiff';

const BASE_DBML = `
Enum invoice_state {
  draft
  issued
}

Table users [note: 'Internal account note that must not appear in SQL'] {
  id bigint [pk, increment]
  email varchar(120) [not null, unique, note: 'Column note excluded from SQL']
  bio text
  legacy_flag boolean

  Indexes {
    email [name: 'idx_users_email']
  }
}

Table orders {
  id uuid [pk]
  user_id bigint [not null]
  amount integer [not null]

  Checks {
    \`amount >= 0\` [name: 'chk_orders_amount']
  }
}

Table scratch_pad {
  id int [pk]
}

Ref: orders.user_id > users.id [delete: restrict]
`;

const TARGET_DBML = `
Enum invoice_state {
  draft
  issued
  paid
}

Enum payment_method {
  card
  wire
}

Table users [note: 'Updated table note also excluded from SQL'] {
  id bigint [pk, increment]
  email varchar(255) [not null]
  bio text [default: '']
  display_name varchar(100) [not null, default: 'User']

  Indexes {
    (\`lower(email)\`) [unique, name: 'uq_users_lower_email']
  }
}

Table orders {
  id uuid [pk]
  user_id bigint [not null]
  amount integer [not null]

  Checks {
    \`amount > 0\` [name: 'chk_orders_amount']
  }
}

Table invoices {
  id serial [pk, increment]
  order_id uuid [not null]
  state invoice_state [not null, default: 'draft']
}

Ref: orders.user_id > users.id [delete: cascade]
Ref: invoices.order_id > orders.id
`;

describe('SQL migration and DDL generation', () => {
  it('generates ordered PostgreSQL ALTER migration statements without emitting DBML notes', () => {
    const sql = generateIncrementalSqlMigration(
      BASE_DBML,
      TARGET_DBML,
      'postgres',
      { baseLabel: 'v1.0.0', targetLabel: 'v1.1.0' }
    );

    expect(sql).toContain('-- Incremental SQL Migration (POSTGRES)');
    expect(sql).toContain('-- Transition: v1.0.0 -> v1.1.0');
    expect(sql).toContain(
      'CREATE TYPE "payment_method" AS ENUM (\'card\', \'wire\');'
    );
    expect(sql).toContain(
      'ALTER TYPE "invoice_state" ADD VALUE IF NOT EXISTS \'paid\';'
    );
    expect(sql).toContain(
      'ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "fk_orders_user_id";'
    );
    expect(sql).toContain('DROP INDEX IF EXISTS "idx_users_email";');
    expect(sql).toContain('CREATE TABLE "invoices" (');
    expect(sql).toContain(
      'ALTER TABLE "users" ADD COLUMN "display_name" varchar(100) NOT NULL DEFAULT \'User\';'
    );
    expect(sql).toContain(
      'ALTER TABLE "users" ALTER COLUMN "email" TYPE varchar(255);'
    );
    expect(sql).toContain(
      'ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "uq_users_email";'
    );
    expect(sql).toContain(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "legacy_flag";'
    );
    expect(sql).toContain(
      'ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "chk_orders_amount";'
    );
    expect(sql).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_amount" CHECK (amount > 0);'
    );
    expect(sql).toContain('DROP TABLE IF EXISTS "scratch_pad";');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_users_lower_email" ON "users" (lower(email));'
    );
    expect(sql).toContain(
      'ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;'
    );
    expect(sql).toContain(
      'ALTER TABLE "invoices" ADD CONSTRAINT "fk_invoices_order_id" FOREIGN KEY ("order_id") REFERENCES "orders" ("id");'
    );

    // Notes must never be exported as SQL COMMENT statements
    expect(sql).not.toMatch(/COMMENT\s+ON\s+(TABLE|COLUMN)/i);
    expect(sql).not.toContain('Internal account note');
    expect(sql).not.toContain('Column note excluded from SQL');
  });

  it('generates MySQL ALTER migration with backticks, MODIFY COLUMN, DROP FOREIGN KEY, and DROP INDEX', () => {
    const sql = generateIncrementalSqlMigration(BASE_DBML, TARGET_DBML, 'mysql');

    expect(sql).toContain('-- Incremental SQL Migration (MYSQL)');
    expect(sql).toContain('ALTER TABLE `orders` DROP FOREIGN KEY `fk_orders_user_id`;');
    expect(sql).toContain('DROP INDEX `idx_users_email` ON `users`;');
    expect(sql).toContain(
      'ALTER TABLE `users` ADD COLUMN `display_name` varchar(100) NOT NULL DEFAULT \'User\';'
    );
    expect(sql).toContain(
      'ALTER TABLE `users` MODIFY COLUMN `email` varchar(255) NOT NULL;'
    );
    expect(sql).toContain('ALTER TABLE `users` DROP INDEX `email`;');
    expect(sql).toContain('ALTER TABLE `users` DROP COLUMN `legacy_flag`;');
    expect(sql).toContain('ALTER TABLE `orders` DROP CHECK `chk_orders_amount`;');
    expect(sql).toContain('DROP TABLE IF EXISTS `scratch_pad`;');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX `uq_users_lower_email` ON `users` (lower(email));'
    );

    expect(sql).not.toMatch(/COMMENT\s+ON\s+(TABLE|COLUMN)/i);
    expect(sql).not.toContain('Updated table note also excluded from SQL');
  });

  it('emits clean no-op notice when no SQL-relevant changes exist (including note-only edits)', () => {
    const noteOnlyBase = `Table users [note: 'Old doc'] { id uuid [pk] }`;
    const noteOnlyNext = `Table users [note: 'New doc'] { id uuid [pk] }`;

    const sql = generateIncrementalSqlMigration(
      noteOnlyBase,
      noteOnlyNext,
      'postgres'
    );
    expect(sql).toContain('-- No schema changes requiring SQL migration detected.');
    expect(sql).not.toMatch(/COMMENT\s+ON/i);
  });

  it('exports full DDL without table/column notes and supports SQL -> DBML import round-trip', () => {
    const parsed = parseDbml(`
Project Demo {
  database_type: 'PostgreSQL'
}

Table accounts [note: 'Excluded doc'] {
  id integer [pk, increment]
  email varchar(180) [unique, not null, note: 'Excluded col doc']
}

Table tokens {
  id uuid [pk]
  account_id integer [not null, ref: > accounts.id]
}
`);

    const ddl = exportSchemaToSql(parsed, 'postgres');
    expect(ddl).toContain('CREATE TABLE "accounts"');
    expect(ddl).toContain('CREATE TABLE "tokens"');
    expect(ddl).toContain('ALTER TABLE "tokens" ADD CONSTRAINT "fk_tokens_account_id"');
    expect(ddl).not.toMatch(/COMMENT\s+ON/i);
    expect(ddl).not.toContain('Excluded doc');
    expect(ddl).not.toContain('Excluded col doc');

    const reimported = importSqlToDbml(ddl);
    const reparsed = parseDbml(reimported);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.tables.map((t) => t.name)).toEqual(['accounts', 'tokens']);
    expect(reparsed.refs).toHaveLength(1);
  });
});
