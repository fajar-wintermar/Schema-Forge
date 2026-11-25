import { describe, expect, it } from 'vitest';
import { SchemaModuleFile } from '@shared/domain/schemaTypes';
import {
  detectSchemaFolder,
  findModuleDefiningTable,
  findModuleDefiningTableGroup,
  mapMergedErrorsToModules,
  mapMergedLineToModule,
  mergeSchemaFiles,
  normalizeModulePath,
  splitDbmlIntoModuleFiles,
} from '../../src/utils/schemaModules';

describe('schemaModules', () => {
  it('normalizes module paths while preserving explicit subfolders', () => {
    expect(normalizeModulePath('users', 'schema')).toBe('schema/users.dbml');
    expect(normalizeModulePath('test/new', 'schema')).toBe('test/new.dbml');
    expect(normalizeModulePath('/schema/billing//invoices.dbml', 'schema')).toBe(
      'schema/billing/invoices.dbml'
    );
  });

  it('splits single-file DBML into _project.dbml and per-table modules', () => {
    const singleFile = `Project Shop {
  database_type: 'PostgreSQL'
}

Enum status {
  active
  archived
}

Table users {
  id uuid [pk]
}

Table orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: orders.user_id > users.id

TableGroup Core {
  users
  orders
}
`;

    const files = splitDbmlIntoModuleFiles(singleFile, 'schema');
    const byPath = new Map(files.map((f) => [f.path, f.content]));

    expect(Array.from(byPath.keys())).toEqual([
      'schema/_project.dbml',
      'schema/users.dbml',
      'schema/orders.dbml',
    ]);
    expect(byPath.get('schema/_project.dbml')).toContain('Project Shop');
    expect(byPath.get('schema/_project.dbml')).toContain('Enum status');
    expect(byPath.get('schema/_project.dbml')).toContain('TableGroup Core');
    expect(byPath.get('schema/orders.dbml')).toContain('Table orders');
    expect(byPath.get('schema/orders.dbml')).toContain(
      'Ref: orders.user_id > users.id'
    );
  });

  it('losslessly round-trips custom subfolders, nested modules, and comment-only files across Flatten -> Split', () => {
    const initialFiles: SchemaModuleFile[] = [
      {
        id: '1',
        path: 'schema/_project.dbml',
        content: "Project App {\n  database_type: 'PostgreSQL'\n}\n",
      },
      {
        id: '2',
        path: 'schema/users.dbml',
        content: 'Table users {\n  id uuid [pk]\n}\n',
      },
      {
        id: '3',
        path: 'test/new.dbml',
        content: 'Table custom_audit {\n  id serial [pk]\n  actor text\n}\n',
      },
      {
        id: '4',
        path: 'schema/nested/draft.dbml',
        content: '// draft module placeholder\n',
      },
      {
        id: '5',
        path: 'schema/empty.dbml',
        content: '',
      },
    ];

    const folder = detectSchemaFolder(initialFiles);
    expect(folder).toBe('schema');

    const { mergedDbml } = mergeSchemaFiles(initialFiles, { schemaFolder: folder });
    const resplit = splitDbmlIntoModuleFiles(mergedDbml, folder);

    const normalizeSet = (arr: SchemaModuleFile[]) =>
      arr
        .map((f) => ({ path: f.path, content: f.content }))
        .sort((a, b) => a.path.localeCompare(b.path));

    expect(normalizeSet(resplit)).toEqual(normalizeSet(initialFiles));
  });

  it('merges preamble blocks before section headers without dropping existing custom modules', () => {
    const editedMerged = `// AUTO-GENERATED. Edit files in schema/ — merged on the fly by SchemaForge

Table inline_added {
  id int [pk]
}

// ---- test/new.dbml ----
Table custom_audit {
  id serial [pk]
}
`;
    const resplit = splitDbmlIntoModuleFiles(editedMerged, 'schema');
    const paths = resplit.map((f) => f.path).sort();

    expect(paths).toEqual(['schema/inline_added.dbml', 'test/new.dbml']);
    expect(
      resplit.find((f) => f.path === 'schema/inline_added.dbml')?.content
    ).toContain('Table inline_added');
    expect(resplit.find((f) => f.path === 'test/new.dbml')?.content).toContain(
      'Table custom_audit'
    );
  });

  it('maps merged line numbers and errors back to exact modular files and local lines', () => {
    const files: SchemaModuleFile[] = [
      {
        id: 'a',
        path: 'schema/accounts.dbml',
        content: 'Table accounts {\n  id uuid [pk]\n}\n',
      },
      {
        id: 'b',
        path: 'test/ledger.dbml',
        content: 'Table ledger {\n  id uuid [pk]\n  account_id uuid [ref: > missing.id]\n}\n',
      },
    ];

    const { segments } = mergeSchemaFiles(files, { schemaFolder: 'schema' });
    const ledgerSeg = segments.find((s) => s.path === 'test/ledger.dbml')!;
    expect(ledgerSeg).toBeDefined();

    // Line 3 inside test/ledger.dbml corresponds to startLine + 2
    const mergedErrLine = ledgerSeg.startLine + 2;
    expect(mapMergedLineToModule(mergedErrLine, segments)).toEqual({
      path: 'test/ledger.dbml',
      localLine: 3,
    });

    const mapped = mapMergedErrorsToModules(
      [
        { line: mergedErrLine, message: 'Ref references unknown table "missing"' },
        { line: 1, message: 'Banner issue' },
      ],
      segments
    );

    expect(mapped.byFile['test/ledger.dbml']).toEqual([
      { line: 3, message: 'Ref references unknown table "missing"' },
    ]);
    expect(mapped.unmapped).toEqual([{ line: 1, message: 'Banner issue' }]);
  });

  it('locates modules defining a given Table or TableGroup', () => {
    const files: SchemaModuleFile[] = [
      {
        id: '1',
        path: 'schema/_project.dbml',
        content: 'TableGroup Identity {\n  users\n}\n',
      },
      {
        id: '2',
        path: 'test/users.dbml',
        content: 'Table users {\n  id uuid [pk]\n}\n',
      },
    ];

    expect(findModuleDefiningTable(files, 'users')?.path).toBe('test/users.dbml');
    expect(findModuleDefiningTableGroup(files, 'Identity')?.path).toBe(
      'schema/_project.dbml'
    );
  });
});
