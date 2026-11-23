import { describe, expect, it } from 'vitest';
import { parseDbml } from '../../src/utils/dbmlParser';

describe('parseDbml', () => {
  it('parses Project metadata, Enums, Tables, Indexes, Checks, TableGroups, Refs, and Notes', () => {
    const dbml = `
Project BillingCore {
  database_type: 'PostgreSQL'
  Note: '''
    Multi-tenant billing platform
    with immutable ledger entries.
  '''
}

Enum auth.user_role {
  admin [note: 'Full tenant access']
  member
}

Table auth.users as u [headercolor: #1e3a8a, note: 'Primary accounts'] {
  id uuid [pk, not null]
  email varchar(255) [unique, not null]
  role auth.user_role [default: 'member']
  tags text[]
  created_at timestamptz [default: \`now()\`]

  Indexes {
    email [unique, name: 'uq_users_email']
    (\`lower(email)\`) [name: 'idx_users_lower_email']
    role [type: hash]
  }
}

Table billing.invoices [headercolor: #065f46] {
  id bigint [pk, increment]
  user_id uuid [not null, ref: > u.id, delete: cascade, update: no action]
  amount decimal(12, 2) [not null, check: \`amount >= 0\`]
  status varchar(32) [not null]

  Indexes {
    (user_id, status) [name: 'idx_invoices_user_status']
  }

  Checks {
    \`amount >= 0\` [name: 'chk_invoices_amount_non_negative']
  }
}

TableGroup Identity [color: #2563EB] {
  Note: 'Identity domain'
  u
}

Note architecture_overview {
  '''
  # Billing Architecture
  Ledger invariants are enforced at the database layer.
  '''
}
`;

    const parsed = parseDbml(dbml);

    expect(parsed.errors).toEqual([]);
    expect(parsed.project.name).toBe('BillingCore');
    expect(parsed.project.databaseType).toBe('PostgreSQL');
    expect(parsed.project.note).toContain('Multi-tenant billing platform');

    expect(parsed.enums).toHaveLength(1);
    expect(parsed.enums[0]).toMatchObject({
      id: 'auth.user_role',
      schema: 'auth',
      name: 'user_role',
    });
    expect(parsed.enums[0].values).toEqual([
      { name: 'admin', note: 'Full tenant access' },
      { name: 'member', note: undefined },
    ]);

    expect(parsed.tables).toHaveLength(2);
    const users = parsed.tables.find((t) => t.id === 'auth.users');
    expect(users).toBeDefined();
    expect(users?.schema).toBe('auth');
    expect(users?.name).toBe('users');
    expect(users?.alias).toBe('u');
    expect(users?.headerColor).toBe('#1e3a8a');
    expect(users?.note).toBe('Primary accounts');
    expect(users?.columns.find((c) => c.name === 'tags')?.type).toBe('text[]');

    expect(users?.indexes).toHaveLength(3);
    expect(users?.indexes[0]).toMatchObject({
      name: 'uq_users_email',
      unique: true,
      columns: ['email'],
    });
    expect(users?.indexes[1]).toMatchObject({
      name: 'idx_users_lower_email',
    });
    expect(users?.indexes[1].items?.[0].isExpression).toBe(true);
    expect(users?.indexes[2].type).toBe('hash');

    const invoices = parsed.tables.find((t) => t.id === 'billing.invoices');
    expect(invoices?.columns.find((c) => c.name === 'amount')?.type).toBe(
      'decimal(12, 2)'
    );
    expect(invoices?.checks).toHaveLength(1);
    expect(invoices?.checks?.[0]).toMatchObject({
      name: 'chk_invoices_amount_non_negative',
      expression: 'amount >= 0',
    });

    expect(parsed.refs).toHaveLength(1);
    expect(parsed.refs[0]).toMatchObject({
      fromTable: 'billing.invoices',
      fromColumns: ['user_id'],
      relation: '>',
      toTable: 'auth.users',
      toColumns: ['id'],
      onDelete: 'cascade',
      onUpdate: 'no action',
    });

    expect(parsed.tableGroups).toHaveLength(1);
    expect(parsed.tableGroups[0]).toMatchObject({
      name: 'Identity',
      color: '#2563EB',
      note: 'Identity domain',
      tables: ['auth.users'],
    });

    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].name).toBe('architecture_overview');
    expect(parsed.notes[0].content).toContain('# Billing Architecture');
  });

  it('resolves TablePartial inheritance, column overrides, and nested partials', () => {
    const dbml = `
TablePartial timestamps {
  created_at timestamptz [not null, default: \`now()\`]
  updated_at timestamptz [not null]
}

TablePartial tenant_scoped {
  ~timestamps
  tenant_id uuid [not null, ref: > tenants.id]
}

Table tenants {
  id uuid [pk]
}

Table projects {
  id uuid [pk]
  ~tenant_scoped
  updated_at timestamp [not null, note: 'Overridden precision']
}
`;

    const parsed = parseDbml(dbml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.tablePartials).toHaveLength(2);

    const projects = parsed.tables.find((t) => t.id === 'projects');
    expect(projects).toBeDefined();
    expect(projects?.appliedPartials).toEqual(['tenant_scoped']);
    expect(projects?.columns.map((c) => c.name)).toEqual([
      'created_at',
      'updated_at',
      'tenant_id',
      'id',
    ]);
    const overridden = projects?.columns.find((c) => c.name === 'updated_at');
    expect(overridden?.type).toBe('timestamp');
    expect(overridden?.note).toBe('Overridden precision');

    expect(parsed.refs).toHaveLength(1);
    expect(parsed.refs[0]).toMatchObject({
      fromTable: 'projects',
      fromColumns: ['tenant_id'],
      toTable: 'tenants',
      toColumns: ['id'],
    });
  });

  it('parses composite tuple Refs and named Ref blocks', () => {
    const dbml = `
Table order_headers {
  tenant_id uuid [pk]
  order_no integer [pk]
}

Table order_lines {
  tenant_id uuid
  order_no integer
  line_no integer [pk]
}

Ref fk_lines_header {
  order_lines.(tenant_id, order_no) > order_headers.(tenant_id, order_no) [delete: cascade]
}
`;
    const parsed = parseDbml(dbml);
    expect(parsed.errors).toEqual([]);
    expect(parsed.refs).toHaveLength(1);
    expect(parsed.refs[0]).toMatchObject({
      fromTable: 'order_lines',
      fromColumns: ['tenant_id', 'order_no'],
      relation: '>',
      toTable: 'order_headers',
      toColumns: ['tenant_id', 'order_no'],
      onDelete: 'cascade',
    });
  });

  it('reports syntax and semantic validation errors cleanly', () => {
    const dbml = `
TablePartial cycle_a {
  ~cycle_b
}

TablePartial cycle_b {
  ~cycle_a
}

Table users {
  id uuid [pk]
  id uuid
  broken_col
  Indexes {
    nonexistent_col
  }
}

Table users {
  id uuid [pk]
}

TableGroup Core {
  missing_table
}

Ref: users.id > ghost_table.id
`;
    const parsed = parseDbml(dbml);
    const messages = parsed.errors.map((e) => e.message);

    expect(messages.some((m) => m.includes('Circular TablePartial'))).toBe(true);
    expect(messages.some((m) => m.includes('Duplicate column "id"'))).toBe(true);
    expect(messages.some((m) => m.includes('missing a data type'))).toBe(true);
    expect(
      messages.some((m) => m.includes('Index references unknown column "nonexistent_col"'))
    ).toBe(true);
    expect(messages.some((m) => m.includes('Duplicate table definition "users"'))).toBe(
      true
    );
    expect(
      messages.some((m) =>
        m.includes('TableGroup "Core" references unknown table "missing_table"')
      )
    ).toBe(true);
    expect(
      messages.some((m) => m.includes('Ref references unknown table "ghost_table"'))
    ).toBe(true);
  });
});
