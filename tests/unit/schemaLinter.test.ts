import { describe, expect, it } from 'vitest';
import { parseDbml } from '@shared/domain/dbml';
import { lintSchemaQuality } from '../../src/utils/schemaLinter';

describe('lintSchemaQuality', () => {
  it('returns zero issues for a well-indexed, consistent snake_case schema', () => {
    const dbml = `
Table users {
  id uuid [pk]
  email varchar [unique, not null]
  parent_user_id uuid [ref: > users.id]

  Indexes {
    parent_user_id
  }
}

Table orders {
  id uuid [pk]
  user_id uuid [not null, ref: > users.id]
  created_at timestamp [not null]

  Indexes {
    (user_id, created_at)
  }
}
`;
    const schema = parseDbml(dbml);
    expect(schema.errors).toEqual([]);
    const result = lintSchemaQuality(schema);
    expect(result.issues).toEqual([]);
    expect(result.warningCount).toBe(0);
    expect(result.infoCount).toBe(0);
    expect(result.dominantNamingStyle).toBe('snake_case');
  });

  it('flags tables missing primary keys and unindexed foreign-key columns', () => {
    const dbml = `
Table users {
  id int [pk]
}

Table audit_logs {
  user_id int [ref: > users.id]
  action varchar
}
`;
    const result = lintSchemaQuality(parseDbml(dbml));
    const rules = result.issues.map((i) => i.ruleId);
    expect(rules).toContain('missing-pk');
    expect(rules).toContain('unindexed-fk');
    expect(result.warningCount).toBe(2);
  });

  it('recognizes composite PK indexes and prefix Indexes as covering FKs', () => {
    const dbml = `
Table users {
  id int [pk]
}

Table roles {
  id int [pk]
}

Table user_roles {
  user_id int [ref: > users.id]
  role_id int [ref: > roles.id]

  Indexes {
    (user_id, role_id) [pk]
    role_id
  }
}
`;
    const result = lintSchemaQuality(parseDbml(dbml));
    expect(result.issues.filter((i) => i.ruleId === 'missing-pk')).toHaveLength(0);
    expect(result.issues.filter((i) => i.ruleId === 'unindexed-fk')).toHaveLength(0);
  });

  it('flags nullable unique columns without not null', () => {
    const dbml = `
Table accounts {
  id int [pk]
  external_ref varchar [unique]
  slug varchar [unique, not null]
}
`;
    const result = lintSchemaQuality(parseDbml(dbml));
    const nullableUniques = result.issues.filter(
      (i) => i.ruleId === 'nullable-unique'
    );
    expect(nullableUniques).toHaveLength(1);
    expect(nullableUniques[0].columnName).toBe('external_ref');
    expect(nullableUniques[0].severity).toBe('info');
  });

  it('flags inconsistent snake_case vs camelCase naming across tables and columns', () => {
    const dbml = `
Table user_profiles {
  id int [pk]
  first_name varchar
  last_name varchar
  avatarUrl varchar
}

Table OrderItems {
  id int [pk]
  order_id int
}
`;
    const result = lintSchemaQuality(parseDbml(dbml));
    expect(result.dominantNamingStyle).toBe('snake_case');
    const namingIssues = result.issues.filter(
      (i) => i.ruleId === 'naming-convention'
    );
    expect(namingIssues.length).toBe(2);
    expect(namingIssues.some((i) => i.columnName === 'avatarUrl')).toBe(true);
    expect(namingIssues.some((i) => i.tableId === 'OrderItems')).toBe(true);
  });

  it('detects multi-table circular FK cycles while allowing self-referential tree FKs', () => {
    const dbml = `
Table categories {
  id int [pk]
  parent_id int [ref: > categories.id]

  Indexes {
    parent_id
  }
}

Table departments {
  id int [pk]
  lead_employee_id int [ref: > employees.id]

  Indexes {
    lead_employee_id
  }
}

Table employees {
  id int [pk]
  department_id int [ref: > departments.id]

  Indexes {
    department_id
  }
}
`;
    const result = lintSchemaQuality(parseDbml(dbml));
    const circularIssues = result.issues.filter(
      (i) => i.ruleId === 'circular-fk'
    );
    expect(circularIssues).toHaveLength(1);
    expect(circularIssues[0].message).toContain('departments');
    expect(circularIssues[0].message).toContain('employees');
  });
});
