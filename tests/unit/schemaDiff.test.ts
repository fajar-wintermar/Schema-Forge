import { describe, expect, it } from 'vitest';
import { computeSchemaDiff } from '../../src/utils/schemaDiff';

describe('computeSchemaDiff', () => {
  it('detects added, removed, and modified tables, columns, indexes, checks, refs, enums, and groups', () => {
    const baseDbml = `
Enum order_status {
  pending
  paid
}

Table users {
  id uuid [pk]
  email varchar(120) [not null, unique]
  legacy_code varchar(32)

  Indexes {
    email [unique, name: 'uq_users_email']
  }
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
  total bigint [not null]

  Checks {
    \`total >= 0\` [name: 'chk_orders_total']
  }
}

Table temp_cache {
  key text [pk]
}

Ref: orders.user_id > users.id [delete: restrict]

TableGroup Commerce [color: #2563EB] {
  users
  orders
}
`;

    const nextDbml = `
Enum order_status {
  pending
  paid
  shipped
}

Table users {
  id uuid [pk]
  email varchar(255) [not null]
  full_name varchar(160) [not null, default: 'Anonymous']

  Indexes {
    (\`lower(email)\`) [name: 'idx_users_lower_email']
  }
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
  total bigint [not null]

  Checks {
    \`total > 0\` [name: 'chk_orders_total']
  }
}

Table payments {
  id uuid [pk]
  order_id uuid [not null]
}

Ref: orders.user_id > users.id [delete: cascade]
Ref: payments.order_id > orders.id

TableGroup Commerce [color: #059669] {
  Note: 'Updated commerce boundary'
  users
  orders
  payments
}
`;

    const diff = computeSchemaDiff(baseDbml, nextDbml);

    expect(diff.summary).toMatchObject({
      tablesAdded: 1,
      tablesRemoved: 1,
      tablesModified: 2,
    });

    const paymentsDiff = diff.tables.find((t) => t.tableId === 'payments');
    expect(paymentsDiff?.status).toBe('added');

    const tempCacheDiff = diff.tables.find((t) => t.tableId === 'temp_cache');
    expect(tempCacheDiff?.status).toBe('removed');

    const usersDiff = diff.tables.find((t) => t.tableId === 'users');
    expect(usersDiff?.status).toBe('modified');
    expect(
      usersDiff?.columnDiffs.find((c) => c.name === 'full_name')?.status
    ).toBe('added');
    expect(
      usersDiff?.columnDiffs.find((c) => c.name === 'legacy_code')?.status
    ).toBe('removed');
    const emailDiff = usersDiff?.columnDiffs.find((c) => c.name === 'email');
    expect(emailDiff?.status).toBe('modified');
    expect(emailDiff?.changes).toContain('type: varchar(120) -> varchar(255)');
    expect(emailDiff?.changes).toContain('removed unique');

    expect(
      usersDiff?.indexDiffs?.find((i) => i.name === 'uq_users_email')?.status
    ).toBe('removed');
    expect(
      usersDiff?.indexDiffs?.find((i) => i.name === 'idx_users_lower_email')
        ?.status
    ).toBe('added');

    const ordersDiff = diff.tables.find((t) => t.tableId === 'orders');
    expect(ordersDiff?.checkDiffs?.[0].status).toBe('modified');

    const modifiedRef = diff.refs.find(
      (r) => r.label === 'orders.user_id > users.id'
    );
    expect(modifiedRef?.status).toBe('modified');
    expect(modifiedRef?.detail).toContain('delete: restrict -> cascade');

    const addedRef = diff.refs.find(
      (r) => r.label === 'payments.order_id > orders.id'
    );
    expect(addedRef?.status).toBe('added');

    const groupDiff = diff.groups.find((g) => g.name === 'Commerce');
    expect(groupDiff?.status).toBe('modified');
    expect(groupDiff?.addedTables).toEqual(['payments']);
    expect(groupDiff?.colorChanged).toEqual({
      from: '#2563EB',
      to: '#059669',
    });
    expect(groupDiff?.noteChanged?.to).toBe('Updated commerce boundary');

    const enumDiff = diff.enums.find((e) => e.name === 'order_status');
    expect(enumDiff?.status).toBe('modified');
    expect(enumDiff?.addedValues).toEqual(['shipped']);

    expect(diff.lineDiff.some((l) => l.type === 'added')).toBe(true);
    expect(diff.lineDiff.some((l) => l.type === 'removed')).toBe(true);
  });

  it('produces zero structural changes for identical schemas', () => {
    const dbml = `Table items { id int [pk] }`;
    const diff = computeSchemaDiff(dbml, dbml);

    expect(diff.tables).toEqual([]);
    expect(diff.refs).toEqual([]);
    expect(diff.groups).toEqual([]);
    expect(diff.enums).toEqual([]);
    expect(diff.summary).toEqual({
      tablesAdded: 0,
      tablesRemoved: 0,
      tablesModified: 0,
      columnsChanged: 0,
      indexesChanged: 0,
      refsChanged: 0,
      groupsChanged: 0,
    });
  });
});
