import {
  CheckDef,
  ColumnDef,
  IndexDef,
  RefDef,
  SchemaDiffResult,
  SqlDialect,
  TableDef,
} from '../../types/schema';

export interface SqlMigrationOptions {
  baseLabel?: string;
  targetLabel?: string;
}

function q(ident: string, dialect: SqlDialect): string {
  return dialect === 'mysql' ? `\`${ident}\`` : `"${ident}"`;
}

function qTable(nameOrId: string, dialect: SqlDialect, schema?: string): string {
  if (schema) {
    const bare = nameOrId.startsWith(`${schema}.`)
      ? nameOrId.slice(schema.length + 1)
      : nameOrId;
    return `${q(schema, dialect)}.${q(bare, dialect)}`;
  }
  const parts = nameOrId.split('.');
  if (parts.length > 1) {
    return parts.map((p) => q(p, dialect)).join('.');
  }
  return q(nameOrId, dialect);
}

function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''");
}

function formatDefaultExpr(defaultValue: string): string {
  if (defaultValue.startsWith('`') && defaultValue.endsWith('`')) {
    return defaultValue.slice(1, -1);
  }
  if (
    /^\d+(\.\d+)?$|^(true|false|null|now\(\)|current_timestamp|current_date)$/i.test(
      defaultValue
    )
  ) {
    return defaultValue;
  }
  return `'${escapeSqlString(defaultValue)}'`;
}

function resolveSqlType(col: ColumnDef, dialect: SqlDialect): string {
  if (col.increment) {
    if (dialect === 'postgres') {
      return /^bigint$/i.test(col.type) ? 'BIGSERIAL' : 'SERIAL';
    }
    return `${col.type} AUTO_INCREMENT`;
  }
  return col.type;
}

function formatColumnDefinition(
  col: ColumnDef,
  dialect: SqlDialect,
  options: { includeUnique?: boolean; includeNotNull?: boolean } = {}
): string {
  const { includeUnique = true, includeNotNull = true } = options;
  const parts: string[] = [resolveSqlType(col, dialect)];
  if (includeNotNull && (col.notNull || col.pk)) {
    parts.push('NOT NULL');
  }
  if (includeUnique && col.unique && !col.pk) {
    parts.push('UNIQUE');
  }
  if (col.defaultValue !== undefined && col.defaultValue !== '') {
    parts.push(`DEFAULT ${formatDefaultExpr(col.defaultValue)}`);
  }
  if (col.check) {
    const expr = col.check.replace(/^`|`$/g, '');
    parts.push(`CHECK (${expr})`);
  }
  return parts.join(' ');
}

function resolveIndexItems(idx: IndexDef) {
  return (
    idx.items ||
    idx.columns.map((c) => ({
      value: c.replace(/^`|`$/g, ''),
      isExpression: c.startsWith('`') && c.endsWith('`'),
    }))
  );
}

export function resolveIndexName(tableName: string, idx: IndexDef): string {
  if (idx.name) return idx.name;
  const items = resolveIndexItems(idx);
  const rawSuffix = items
    .map((it) =>
      it.value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_|_$/g, '')
    )
    .filter(Boolean)
    .join('_');
  const bareTable = tableName.includes('.')
    ? tableName.split('.').slice(1).join('_')
    : tableName;
  return `idx_${bareTable}_${rawSuffix || 'expr'}`;
}

function formatCreateIndex(
  table: TableDef,
  idx: IndexDef,
  dialect: SqlDialect
): string {
  const items = resolveIndexItems(idx);
  const idxName = resolveIndexName(table.name, idx);
  const uniq = idx.unique ? 'UNIQUE ' : '';
  const usingClause =
    dialect === 'postgres' && idx.type ? ` USING ${idx.type}` : '';
  const colsExpr = items
    .map((it) => (it.isExpression ? it.value : q(it.value, dialect)))
    .join(', ');
  const tableIdent = qTable(table.name, dialect, table.schema);
  return `CREATE ${uniq}INDEX ${q(idxName, dialect)} ON ${tableIdent}${usingClause} (${colsExpr});`;
}

function formatDropIndex(
  table: TableDef,
  idx: IndexDef,
  dialect: SqlDialect
): string {
  const idxName = resolveIndexName(table.name, idx);
  if (dialect === 'mysql') {
    const tableIdent = qTable(table.name, dialect, table.schema);
    return `DROP INDEX ${q(idxName, dialect)} ON ${tableIdent};`;
  }
  const qualifiedIdx = table.schema
    ? `${q(table.schema, dialect)}.${q(idxName, dialect)}`
    : q(idxName, dialect);
  return `DROP INDEX IF EXISTS ${qualifiedIdx};`;
}

function resolveFkParts(r: RefDef) {
  const childTable = r.relation === '<' ? r.toTable : r.fromTable;
  const childCols = r.relation === '<' ? r.toColumns : r.fromColumns;
  const parentTable = r.relation === '<' ? r.fromTable : r.toTable;
  const parentCols = r.relation === '<' ? r.fromColumns : r.toColumns;
  const fkName =
    r.name || `fk_${childTable.replace(/\./g, '_')}_${childCols.join('_')}`;
  return { childTable, childCols, parentTable, parentCols, fkName };
}

function formatAddForeignKey(r: RefDef, dialect: SqlDialect): string {
  const { childTable, childCols, parentTable, parentCols, fkName } =
    resolveFkParts(r);
  let stmt = `ALTER TABLE ${qTable(childTable, dialect)} ADD CONSTRAINT ${q(
    fkName,
    dialect
  )} FOREIGN KEY (${childCols
    .map((c) => q(c, dialect))
    .join(', ')}) REFERENCES ${qTable(parentTable, dialect)} (${parentCols
    .map((c) => q(c, dialect))
    .join(', ')})`;
  if (r.onDelete) stmt += ` ON DELETE ${r.onDelete.toUpperCase()}`;
  if (r.onUpdate) stmt += ` ON UPDATE ${r.onUpdate.toUpperCase()}`;
  return `${stmt};`;
}

function formatDropForeignKey(r: RefDef, dialect: SqlDialect): string {
  const { childTable, fkName } = resolveFkParts(r);
  if (dialect === 'mysql') {
    return `ALTER TABLE ${qTable(childTable, dialect)} DROP FOREIGN KEY ${q(
      fkName,
      dialect
    )};`;
  }
  return `ALTER TABLE ${qTable(childTable, dialect)} DROP CONSTRAINT IF EXISTS ${q(
    fkName,
    dialect
  )};`;
}

function formatCreateTable(table: TableDef, dialect: SqlDialect): string[] {
  const out: string[] = [];
  const tableIdent = qTable(table.name, dialect, table.schema);
  const colLines: string[] = [];
  const pkCols = table.columns.filter((c) => c.pk).map((c) => c.name);

  for (const col of table.columns) {
    colLines.push(
      `  ${q(col.name, dialect)} ${formatColumnDefinition(col, dialect)}`
    );
  }

  if (pkCols.length > 0) {
    colLines.push(
      `  PRIMARY KEY (${pkCols.map((c) => q(c, dialect)).join(', ')})`
    );
  }

  for (const chk of table.checks || []) {
    const expr = chk.expression.replace(/^`|`$/g, '');
    if (chk.name) {
      colLines.push(
        `  CONSTRAINT ${q(chk.name, dialect)} CHECK (${expr})`
      );
    } else {
      colLines.push(`  CHECK (${expr})`);
    }
  }

  out.push(`CREATE TABLE ${tableIdent} (`);
  out.push(colLines.join(',\n'));
  out.push(');');

  return out;
}

function formatCheckConstraintName(table: TableDef, chk: CheckDef, idx = 0): string {
  if (chk.name) return chk.name;
  const slug = chk.expression
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
  const bare = table.name.includes('.')
    ? table.name.split('.').slice(1).join('_')
    : table.name;
  return `chk_${bare}_${slug || idx}`;
}

export function generateSqlMigration(
  diff: SchemaDiffResult,
  dialect: SqlDialect = 'postgres',
  options: SqlMigrationOptions = {}
): string {
  const sections: string[] = [];
  const header: string[] = [
    `-- Incremental SQL Migration (${dialect.toUpperCase()})`,
    `-- Generated by SchemaForge`,
  ];
  if (options.baseLabel || options.targetLabel) {
    header.push(
      `-- Transition: ${options.baseLabel || 'Base'} -> ${
        options.targetLabel || 'Target'
      }`
    );
  }
  header.push(
    `-- Summary: +${diff.summary.tablesAdded} tables, ~${diff.summary.tablesModified} modified, -${diff.summary.tablesRemoved} removed, ${diff.summary.columnsChanged} column changes, ${diff.summary.indexesChanged} index changes, ${diff.summary.refsChanged} FK changes`
  );
  sections.push(header.join('\n'));

  // 1. Enum creations & extensions
  const enumUpStatements: string[] = [];
  const enumDropStatements: string[] = [];
  for (const ed of diff.enums) {
    const enumIdent = ed.after?.schema
      ? qTable(ed.after.name, dialect, ed.after.schema)
      : ed.before?.schema
      ? qTable(ed.before.name, dialect, ed.before.schema)
      : qTable(ed.name, dialect);

    if (ed.status === 'added') {
      if (dialect === 'postgres') {
        const vals = (ed.after?.values.map((v) => v.name) || ed.addedValues)
          .map((v) => `'${escapeSqlString(v)}'`)
          .join(', ');
        enumUpStatements.push(`CREATE TYPE ${enumIdent} AS ENUM (${vals});`);
      } else {
        enumUpStatements.push(
          `-- MySQL uses inline column ENUM(...) types; enum "${ed.name}" added (${ed.addedValues.join(
            ', '
          )}).`
        );
      }
    } else if (ed.status === 'modified') {
      if (dialect === 'postgres') {
        for (const val of ed.addedValues) {
          enumUpStatements.push(
            `ALTER TYPE ${enumIdent} ADD VALUE IF NOT EXISTS '${escapeSqlString(
              val
            )}';`
          );
        }
        if (ed.removedValues.length > 0) {
          enumUpStatements.push(
            `-- NOTE: PostgreSQL does not support DROP VALUE on ENUM (${
              ed.name
            }). Removed values (${ed.removedValues.join(
              ', '
            )}) require creating a replacement enum type.`
          );
        }
      } else {
        enumUpStatements.push(
          `-- MySQL: Enum "${ed.name}" changed (+${ed.addedValues.length} / -${ed.removedValues.length}). Update referencing column ENUM(...) definitions if applicable.`
        );
      }
    } else if (ed.status === 'removed' && dialect === 'postgres') {
      enumDropStatements.push(`DROP TYPE IF EXISTS ${enumIdent};`);
    }
  }
  if (enumUpStatements.length > 0) {
    sections.push(`-- 1. Enum Types\n${enumUpStatements.join('\n')}`);
  }

  // 2. Drop removed & modified foreign keys first (to unlock table/column/index drops)
  const fkDropStatements: string[] = [];
  for (const rd of diff.refs) {
    if (rd.status === 'removed' && rd.before) {
      fkDropStatements.push(formatDropForeignKey(rd.before, dialect));
    } else if (rd.status === 'modified' && rd.before) {
      fkDropStatements.push(formatDropForeignKey(rd.before, dialect));
    }
  }
  if (fkDropStatements.length > 0) {
    sections.push(
      `-- 2. Drop Removed / Modified Foreign Keys\n${fkDropStatements.join('\n')}`
    );
  }

  // 3. Drop removed & modified indexes on modified tables
  const indexDropStatements: string[] = [];
  for (const td of diff.tables) {
    if (td.status !== 'modified' || !td.before) continue;
    for (const id of td.indexDiffs || []) {
      if (id.before?.pk) continue;
      if ((id.status === 'removed' || id.status === 'modified') && id.before) {
        indexDropStatements.push(formatDropIndex(td.before, id.before, dialect));
      }
    }
  }
  if (indexDropStatements.length > 0) {
    sections.push(
      `-- 3. Drop Removed / Modified Indexes\n${indexDropStatements.join('\n')}`
    );
  }

  // 4. Create added tables
  const createTableStatements: string[] = [];
  for (const td of diff.tables) {
    if (td.status === 'added' && td.after) {
      createTableStatements.push(...formatCreateTable(td.after, dialect));
      createTableStatements.push('');
    }
  }
  if (createTableStatements.length > 0) {
    sections.push(
      `-- 4. Create Added Tables\n${createTableStatements.join('\n').trim()}`
    );
  }

  // 5. Alter modified tables (columns, PKs, checks, comments)
  const alterTableStatements: string[] = [];
  for (const td of diff.tables) {
    if (td.status !== 'modified' || !td.before || !td.after) continue;
    const tableBefore = td.before;
    const tableAfter = td.after;
    const tableIdent = qTable(tableAfter.name, dialect, tableAfter.schema);
    const tblStmts: string[] = [];

    // Table-level CHECK removals/modifications before column edits
    (td.checkDiffs || []).forEach((cd, idx) => {
      if ((cd.status === 'removed' || cd.status === 'modified') && cd.before) {
        const chkName = formatCheckConstraintName(tableBefore, cd.before, idx);
        if (dialect === 'postgres') {
          tblStmts.push(
            `ALTER TABLE ${tableIdent} DROP CONSTRAINT IF EXISTS ${q(
              chkName,
              dialect
            )};`
          );
        } else {
          tblStmts.push(
            `ALTER TABLE ${tableIdent} DROP CHECK ${q(chkName, dialect)};`
          );
        }
      }
    });

    // Primary key set change detection
    const pkBefore = tableBefore.columns.filter((c) => c.pk).map((c) => c.name);
    const pkAfter = tableAfter.columns.filter((c) => c.pk).map((c) => c.name);
    const pkChanged = pkBefore.join(',') !== pkAfter.join(',');
    if (pkChanged && pkBefore.length > 0) {
      if (dialect === 'postgres') {
        const bareName = tableBefore.name.includes('.')
          ? tableBefore.name.split('.').slice(1).join('_')
          : tableBefore.name;
        tblStmts.push(
          `ALTER TABLE ${tableIdent} DROP CONSTRAINT IF EXISTS ${q(
            `${bareName}_pkey`,
            dialect
          )};`
        );
      } else {
        tblStmts.push(`ALTER TABLE ${tableIdent} DROP PRIMARY KEY;`);
      }
    }

    // Column additions & modifications
    for (const cd of td.columnDiffs) {
      if (cd.status === 'added' && cd.after) {
        tblStmts.push(
          `ALTER TABLE ${tableIdent} ADD COLUMN ${q(
            cd.after.name,
            dialect
          )} ${formatColumnDefinition(cd.after, dialect)};`
        );
      } else if (cd.status === 'modified' && cd.before && cd.after) {
        const before = cd.before;
        const after = cd.after;
        const colIdent = q(after.name, dialect);

        if (dialect === 'postgres') {
          const typeBefore = resolveSqlType(before, 'postgres');
          const typeAfter = resolveSqlType(after, 'postgres');
          if (typeBefore !== typeAfter) {
            if (after.increment && !before.increment) {
              tblStmts.push(
                `-- NOTE: PostgreSQL SERIAL conversion may require creating a sequence and attaching DEFAULT nextval(...)`
              );
            }
            tblStmts.push(
              `ALTER TABLE ${tableIdent} ALTER COLUMN ${colIdent} TYPE ${after.type};`
            );
          }

          const defBefore = before.defaultValue ?? '';
          const defAfter = after.defaultValue ?? '';
          if (defBefore !== defAfter) {
            if (defAfter !== '') {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} ALTER COLUMN ${colIdent} SET DEFAULT ${formatDefaultExpr(
                  defAfter
                )};`
              );
            } else {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} ALTER COLUMN ${colIdent} DROP DEFAULT;`
              );
            }
          }

          const nnBefore = Boolean(before.notNull || before.pk);
          const nnAfter = Boolean(after.notNull || after.pk);
          if (nnBefore !== nnAfter) {
            tblStmts.push(
              `ALTER TABLE ${tableIdent} ALTER COLUMN ${colIdent} ${
                nnAfter ? 'SET NOT NULL' : 'DROP NOT NULL'
              };`
            );
          }

          if (before.unique !== after.unique) {
            const bareName = tableAfter.name.includes('.')
              ? tableAfter.name.split('.').slice(1).join('_')
              : tableAfter.name;
            const uqName = `uq_${bareName}_${after.name}`;
            if (after.unique && !after.pk) {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} ADD CONSTRAINT ${q(
                  uqName,
                  dialect
                )} UNIQUE (${colIdent});`
              );
            } else if (!after.unique && before.unique && !before.pk) {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} DROP CONSTRAINT IF EXISTS ${q(
                  uqName,
                  dialect
                )};`
              );
            }
          }

          if ((before.check || '') !== (after.check || '')) {
            const bareName = tableAfter.name.includes('.')
              ? tableAfter.name.split('.').slice(1).join('_')
              : tableAfter.name;
            const chkName =
              after.checkName ||
              before.checkName ||
              `chk_${bareName}_${after.name}`;
            if (before.check) {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} DROP CONSTRAINT IF EXISTS ${q(
                  chkName,
                  dialect
                )};`
              );
            }
            if (after.check) {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} ADD CONSTRAINT ${q(
                  chkName,
                  dialect
                )} CHECK (${after.check.replace(/^`|`$/g, '')});`
              );
            }
          }
        } else {
          // MySQL: MODIFY COLUMN requires full column specification
          const structuralChanged =
            before.type !== after.type ||
            before.increment !== after.increment ||
            before.notNull !== after.notNull ||
            before.pk !== after.pk ||
            (before.defaultValue || '') !== (after.defaultValue || '') ||
            (before.check || '') !== (after.check || '') ||
            before.unique !== after.unique;

          if (structuralChanged) {
            tblStmts.push(
              `ALTER TABLE ${tableIdent} MODIFY COLUMN ${colIdent} ${formatColumnDefinition(
                after,
                'mysql',
                { includeUnique: !before.unique && after.unique }
              )};`
            );
            if (before.unique && !after.unique && !before.pk) {
              tblStmts.push(
                `ALTER TABLE ${tableIdent} DROP INDEX ${colIdent};`
              );
            }
          }
        }
      }
    }

    // Column drops
    for (const cd of td.columnDiffs) {
      if (cd.status === 'removed' && cd.before) {
        if (dialect === 'postgres') {
          tblStmts.push(
            `ALTER TABLE ${tableIdent} DROP COLUMN IF EXISTS ${q(
              cd.before.name,
              dialect
            )};`
          );
        } else {
          tblStmts.push(
            `ALTER TABLE ${tableIdent} DROP COLUMN ${q(
              cd.before.name,
              dialect
            )};`
          );
        }
      }
    }

    // Add updated Primary Key if PK changed and new PK exists
    if (pkChanged && pkAfter.length > 0) {
      tblStmts.push(
        `ALTER TABLE ${tableIdent} ADD PRIMARY KEY (${pkAfter
          .map((c) => q(c, dialect))
          .join(', ')});`
      );
    }

    // Table-level CHECK additions/modifications
    (td.checkDiffs || []).forEach((cd, idx) => {
      if ((cd.status === 'added' || cd.status === 'modified') && cd.after) {
        const expr = cd.after.expression.replace(/^`|`$/g, '');
        const chkName = formatCheckConstraintName(tableAfter, cd.after, idx);
        tblStmts.push(
          `ALTER TABLE ${tableIdent} ADD CONSTRAINT ${q(
            chkName,
            dialect
          )} CHECK (${expr});`
        );
      }
    });

    if (tblStmts.length > 0) {
      alterTableStatements.push(`-- Table: ${tableAfter.id}`);
      alterTableStatements.push(...tblStmts);
    }
  }
  if (alterTableStatements.length > 0) {
    sections.push(
      `-- 5. Alter Modified Tables\n${alterTableStatements.join('\n')}`
    );
  }

  // 6. Drop removed tables
  const dropTableStatements: string[] = [];
  for (const td of diff.tables) {
    if (td.status === 'removed' && td.before) {
      dropTableStatements.push(
        `DROP TABLE IF EXISTS ${qTable(
          td.before.name,
          dialect,
          td.before.schema
        )};`
      );
    }
  }
  if (dropTableStatements.length > 0) {
    sections.push(
      `-- 6. Drop Removed Tables\n${dropTableStatements.join('\n')}`
    );
  }

  // 7. Create indexes on added & modified tables
  const indexCreateStatements: string[] = [];
  for (const td of diff.tables) {
    if (td.status === 'added' && td.after) {
      for (const idx of td.after.indexes) {
        if (idx.pk) continue;
        indexCreateStatements.push(formatCreateIndex(td.after, idx, dialect));
      }
    } else if (td.status === 'modified' && td.after) {
      for (const id of td.indexDiffs || []) {
        if (id.after?.pk) continue;
        if ((id.status === 'added' || id.status === 'modified') && id.after) {
          indexCreateStatements.push(
            formatCreateIndex(td.after, id.after, dialect)
          );
        }
      }
    }
  }
  if (indexCreateStatements.length > 0) {
    sections.push(
      `-- 7. Create Added / Modified Indexes\n${indexCreateStatements.join('\n')}`
    );
  }

  // 8. Add new & modified foreign keys
  const fkAddStatements: string[] = [];
  for (const rd of diff.refs) {
    if ((rd.status === 'added' || rd.status === 'modified') && rd.after) {
      fkAddStatements.push(formatAddForeignKey(rd.after, dialect));
    }
  }
  if (fkAddStatements.length > 0) {
    sections.push(
      `-- 8. Add / Update Foreign Keys\n${fkAddStatements.join('\n')}`
    );
  }

  // 9. Drop removed enums (PostgreSQL, after columns & tables are removed)
  if (enumDropStatements.length > 0) {
    sections.push(`-- 9. Drop Removed Enum Types\n${enumDropStatements.join('\n')}`);
  }

  if (sections.length === 1) {
    sections.push('-- No schema changes requiring SQL migration detected.');
  }

  return sections.join('\n\n') + '\n';
}
