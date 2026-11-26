import { describe, expect, it } from 'vitest';
import { parseDbml } from '@shared/domain/dbml';
import {
  exportGroupSummaryMarkdown,
  exportSchemaToMermaid,
} from '../../src/utils/io/mermaidExport';
import {
  exportSchemaToDrizzle,
  exportSchemaToOpenApi,
  exportSchemaToPrisma,
  exportSchemaToSqlAlchemy,
  importDrizzleToDbml,
  importOpenApiToDbml,
  importPrismaToDbml,
} from '../../src/utils/io/ormConverters';

const SAMPLE_DBML = `
Project Shop {
  database_type: 'PostgreSQL'
  Note: 'Shop database'
}

Enum order_status {
  pending
  paid
}

Table users {
  id uuid [pk]
  email varchar(255) [not null, unique, note: 'Primary email']
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
  status order_status [not null]
  total decimal [not null]

  Indexes {
    user_id
  }
}

Ref: orders.user_id > users.id

TableGroup Commerce [color: #2563EB] {
  Note: 'Order lifecycle'
  users
  orders
}
`;

describe('Mermaid ERD & group summary exports', () => {
  it('exports valid Mermaid erDiagram syntax and scoped Notion/Confluence summary markdown', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const mermaid = exportSchemaToMermaid(schema, { title: 'Shop ERD' });

    expect(mermaid).toContain('erDiagram');
    expect(mermaid).toContain('users {');
    expect(mermaid).toContain('uuid id PK');
    expect(mermaid).toContain('orders }o--|| users');

    const md = exportGroupSummaryMarkdown(schema, 'Commerce');
    expect(md).toContain('# Commerce');
    expect(md).toContain('## `users`');
    expect(md).toContain('```mermaid');
  });
});

describe('ORM & API importers and exporters', () => {
  it('converts DBML <-> Prisma schema cleanly', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const prisma = exportSchemaToPrisma(schema);
    expect(prisma).toContain('enum OrderStatus');
    expect(prisma).toContain('model Users');
    expect(prisma).toContain('@relation(fields: [user_id], references: [id])');

    const reimported = importPrismaToDbml(prisma);
    const parsed = parseDbml(reimported);
    expect(parsed.tables.some((t) => t.id === 'users')).toBe(true);
    expect(parsed.tables.some((t) => t.id === 'orders')).toBe(true);
    expect(parsed.refs.length).toBeGreaterThanOrEqual(1);
  });

  it('converts DBML <-> Drizzle TypeScript schema cleanly', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const drizzle = exportSchemaToDrizzle(schema);
    expect(drizzle).toContain("pgEnum('order_status'");
    expect(drizzle).toContain("export const users = pgTable('users'");
    expect(drizzle).toContain('.references(() => users.id)');

    const reimported = importDrizzleToDbml(drizzle);
    const parsed = parseDbml(reimported);
    expect(parsed.tables.map((t) => t.id)).toEqual(
      expect.arrayContaining(['users', 'orders'])
    );
    expect(parsed.refs.some((r) => r.fromTable === 'orders' && r.toTable === 'users')).toBe(
      true
    );
  });

  it('exports SQLAlchemy 2.0 Mapped models cleanly', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const py = exportSchemaToSqlAlchemy(schema);
    expect(py).toContain('class Users(Base):');
    expect(py).toContain('ForeignKey("users.id")');
    expect(py).toContain('primary_key=True');
  });

  it('converts DBML <-> OpenAPI 3.1 JSON Schema cleanly', () => {
    const schema = parseDbml(SAMPLE_DBML);
    const openapiStr = exportSchemaToOpenApi(schema);
    const doc = JSON.parse(openapiStr) as {
      openapi: string;
      components: { schemas: Record<string, unknown> };
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.schemas.Users).toBeDefined();

    const reimported = importOpenApiToDbml(openapiStr);
    const parsed = parseDbml(reimported);
    expect(parsed.tables.map((t) => t.id)).toEqual(
      expect.arrayContaining(['users', 'orders'])
    );
  });
});
