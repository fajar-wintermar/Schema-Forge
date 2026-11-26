import { ParsedSchema } from '@shared/domain/schemaTypes';

function escapeSingleQuoted(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function toCamelCase(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9]+([a-zA-Z0-9])/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function toPascalCase(raw: string): string {
  const camel = toCamelCase(raw);
  return camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : 'Model';
}

function toSnakeCase(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* 1. PRISMA IMPORT / EXPORT                                                  */
/* -------------------------------------------------------------------------- */

function mapPrismaTypeToDbml(rawType: string): string {
  const base = rawType.replace(/[?[\]]/g, '').trim();
  switch (base) {
    case 'String':
      return 'varchar';
    case 'Int':
      return 'int';
    case 'BigInt':
      return 'bigint';
    case 'Float':
      return 'float';
    case 'Decimal':
      return 'decimal';
    case 'Boolean':
      return 'boolean';
    case 'DateTime':
      return 'timestamp';
    case 'Json':
      return 'jsonb';
    case 'Bytes':
      return 'bytea';
    default:
      return base;
  }
}

function mapDbmlTypeToPrisma(rawType: string): string {
  const base = rawType.toLowerCase().split('(')[0].trim();
  if (base === 'int' || base === 'integer' || base === 'serial' || base === 'smallint') {
    return 'Int';
  }
  if (base === 'bigint' || base === 'bigserial') return 'BigInt';
  if (base === 'boolean' || base === 'bool') return 'Boolean';
  if (base === 'float' || base === 'double' || base === 'real') return 'Float';
  if (base === 'decimal' || base === 'numeric') return 'Decimal';
  if (base.includes('timestamp') || base === 'date' || base === 'datetime') {
    return 'DateTime';
  }
  if (base === 'json' || base === 'jsonb') return 'Json';
  if (base === 'bytea' || base === 'blob') return 'Bytes';
  if (
    base === 'varchar' ||
    base === 'text' ||
    base === 'char' ||
    base === 'uuid' ||
    base.startsWith('character')
  ) {
    return 'String';
  }
  return toPascalCase(rawType);
}

export function importPrismaToDbml(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  const refs: string[] = [];
  const enumNames = new Set<string>();

  // Collect enums first
  for (const line of lines) {
    const em = line.match(/^\s*enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (em) enumNames.add(em[1]);
  }

  let i = 0;
  while (i < lines.length) {
    const docComments: string[] = [];
    while (i < lines.length && lines[i].trim().startsWith('///')) {
      docComments.push(lines[i].trim().replace(/^\/\/\/\s?/, ''));
      i++;
    }
    if (i >= lines.length) break;
    const line = lines[i].trim();

    const enumMatch = line.match(/^enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (enumMatch) {
      const enumName = enumMatch[1];
      out.push(`Enum ${enumName} {`);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const val = lines[i].trim().split(/\s+/)[0];
        if (val && !val.startsWith('//')) {
          out.push(`  ${val}`);
        }
        i++;
      }
      out.push('}');
      out.push('');
      i++;
      continue;
    }

    const modelMatch = line.match(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (modelMatch) {
      const modelName = modelMatch[1];
      const tableName = toSnakeCase(modelName) || modelName;
      const indexes: string[] = [];
      const tableCols: string[] = [];
      let fieldDocs: string[] = [];
      i++;

      while (i < lines.length && !lines[i].trim().startsWith('}')) {
        const raw = lines[i].trim();
        i++;
        if (!raw) {
          fieldDocs = [];
          continue;
        }
        if (raw.startsWith('///')) {
          fieldDocs.push(raw.replace(/^\/\/\/\s?/, ''));
          continue;
        }
        if (raw.startsWith('//')) continue;

        const idxMatch = raw.match(/^@@(index|unique)\(\[([^\]]+)\]/);
        if (idxMatch) {
          const cols = idxMatch[2]
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);
          if (cols.length > 0) {
            const colExpr = cols.length === 1 ? cols[0] : `(${cols.join(', ')})`;
            indexes.push(
              idxMatch[1] === 'unique' ? `    ${colExpr} [unique]` : `    ${colExpr}`
            );
          }
          fieldDocs = [];
          continue;
        }
        if (raw.startsWith('@@')) {
          fieldDocs = [];
          continue;
        }

        const fm = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+([^\s]+)(.*)$/);
        if (!fm) {
          fieldDocs = [];
          continue;
        }
        const [, fieldName, rawType, rest] = fm;
        const relationMatch = rest.match(
          /@relation\([^)]*fields:\s*\[([^\]]+)\][^)]*references:\s*\[([^\]]+)\]/
        );
        if (relationMatch) {
          const targetModel = rawType.replace(/[?[\]]/g, '');
          const targetTable = toSnakeCase(targetModel) || targetModel;
          const fromCols = relationMatch[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          const toCols = relationMatch[2]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          if (fromCols.length > 0 && toCols.length > 0) {
            refs.push(
              `Ref: ${tableName}.${fromCols[0]} > ${targetTable}.${toCols[0]}`
            );
          }
          fieldDocs = [];
          continue;
        }

        // Skip back-relation array/object fields without scalar type unless enum
        const baseType = rawType.replace(/[?[\]]/g, '');
        const isScalarOrEnum =
          enumNames.has(baseType) ||
          /^(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)$/.test(
            baseType
          );
        if (!isScalarOrEnum && !rest.includes('@id') && !rest.includes('@default')) {
          fieldDocs = [];
          continue;
        }

        const isNullable = rawType.endsWith('?');
        const dbmlType = enumNames.has(baseType)
          ? baseType
          : mapPrismaTypeToDbml(rawType);
        const settings: string[] = [];
        if (rest.includes('@id')) settings.push('pk');
        if (!isNullable && !rest.includes('@id')) settings.push('not null');
        if (rest.includes('@unique')) settings.push('unique');
        const defMatch = rest.match(/@default\(([^)]+)\)/);
        if (defMatch) {
          const dv = defMatch[1].trim();
          if (dv === 'autoincrement()') settings.push('increment');
          else if (dv === 'now()' || dv === 'uuid()' || dv === 'cuid()') {
            settings.push(`default: \`${dv}\``);
          } else if (dv === 'true' || dv === 'false' || /^-?\d+(\.\d+)?$/.test(dv)) {
            settings.push(`default: ${dv}`);
          } else {
            settings.push(`default: '${escapeSingleQuoted(dv.replace(/^"|"$/g, ''))}'`);
          }
        }
        if (fieldDocs.length > 0) {
          settings.push(`note: '${escapeSingleQuoted(fieldDocs.join(' '))}'`);
          fieldDocs = [];
        }
        const attrPart = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
        tableCols.push(`  ${fieldName} ${dbmlType}${attrPart}`);
      }

      out.push(`Table ${tableName} {`);
      out.push(...tableCols);
      if (indexes.length > 0) {
        out.push('');
        out.push('  Indexes {');
        out.push(...indexes);
        out.push('  }');
      }
      if (docComments.length > 0) {
        out.push(`  Note: '${escapeSingleQuoted(docComments.join('\n'))}'`);
      }
      out.push('}');
      out.push('');
      continue;
    }

    i++;
  }

  if (refs.length > 0) {
    out.push(...refs);
    out.push('');
  }

  return out.join('\n').trim() + '\n';
}

export function exportSchemaToPrisma(schema: ParsedSchema): string {
  const lines: string[] = [
    '// Generated by SchemaForge',
    'datasource db {',
    `  provider = "${
      schema.project.databaseType?.toLowerCase().includes('mysql')
        ? 'mysql'
        : 'postgresql'
    }"`,
    '  url      = env("DATABASE_URL")',
    '}',
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
  ];

  const enumSet = new Set(schema.enums.map((e) => e.name.toLowerCase()));

  for (const en of schema.enums) {
    lines.push(`enum ${toPascalCase(en.name)} {`);
    for (const v of en.values) {
      lines.push(`  ${v.name}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const t of schema.tables) {
    if (t.note) {
      for (const noteLine of t.note.trim().split(/\r?\n/)) {
        lines.push(`/// ${noteLine}`);
      }
    }
    const modelName = toPascalCase(t.name);
    lines.push(`model ${modelName} {`);

    const outgoing = schema.refs.filter((r) => r.fromTable === t.id);

    for (const c of t.columns) {
      if (c.note) {
        lines.push(`  /// ${c.note.replace(/\r?\n/g, ' ')}`);
      }
      const baseType = c.type.toLowerCase().split('(')[0].trim();
      const prismaType = enumSet.has(baseType)
        ? toPascalCase(c.type)
        : mapDbmlTypeToPrisma(c.type);
      const optional = !c.pk && !c.notNull ? '?' : '';
      const attrs: string[] = [];
      if (c.pk) attrs.push('@id');
      if (c.increment) attrs.push('@default(autoincrement())');
      else if (c.defaultValue) {
        const dv = c.defaultValue.trim();
        if (/^(now\(\)|CURRENT_TIMESTAMP)$/i.test(dv)) attrs.push('@default(now())');
        else if (/^uuid/i.test(dv)) attrs.push('@default(uuid())');
        else if (dv === 'true' || dv === 'false' || /^-?\d+(\.\d+)?$/.test(dv)) {
          attrs.push(`@default(${dv})`);
        } else {
          attrs.push(`@default("${dv.replace(/^['"]|['"]$/g, '')}")`);
        }
      }
      if (c.unique && !c.pk) attrs.push('@unique');
      lines.push(
        `  ${c.name} ${prismaType}${optional}${
          attrs.length > 0 ? ' ' + attrs.join(' ') : ''
        }`
      );
    }

    for (const ref of outgoing) {
      const targetModel = toPascalCase(ref.toTable.split('.').pop() || ref.toTable);
      const relField = toCamelCase(ref.toTable.split('.').pop() || ref.toTable);
      lines.push(
        `  ${relField} ${targetModel} @relation(fields: [${ref.fromColumns.join(
          ', '
        )}], references: [${ref.toColumns.join(', ')}])`
      );
    }

    for (const idx of t.indexes) {
      if (idx.pk) continue;
      const fn = idx.unique ? '@@unique' : '@@index';
      lines.push(`  ${fn}([${idx.columns.join(', ')}])`);
    }

    lines.push(`  @@map("${t.name}")`);
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* 2. DRIZZLE TYPESCRIPT IMPORT / EXPORT                                      */
/* -------------------------------------------------------------------------- */

function mapDrizzleBuilderToDbml(builder: string): string {
  switch (builder) {
    case 'serial':
      return 'serial';
    case 'bigserial':
      return 'bigint';
    case 'integer':
    case 'int':
      return 'int';
    case 'bigint':
      return 'bigint';
    case 'smallint':
      return 'smallint';
    case 'boolean':
      return 'boolean';
    case 'text':
      return 'text';
    case 'varchar':
    case 'char':
      return 'varchar';
    case 'uuid':
      return 'uuid';
    case 'timestamp':
    case 'datetime':
      return 'timestamp';
    case 'date':
      return 'date';
    case 'numeric':
    case 'decimal':
      return 'decimal';
    case 'real':
    case 'doublePrecision':
    case 'float':
      return 'float';
    case 'json':
    case 'jsonb':
      return 'jsonb';
    default:
      return builder;
  }
}

export function importDrizzleToDbml(source: string): string {
  const out: string[] = [];
  const refs: string[] = [];

  // Map JS variable names -> SQL table names
  const varToTable = new Map<string, string>();
  const tableHeaderRegex =
    /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{/g;
  let hm: RegExpExecArray | null;
  while ((hm = tableHeaderRegex.exec(source)) !== null) {
    varToTable.set(hm[1], hm[2]);
  }

  // Parse pgEnum / mysqlEnum
  const enumRegex =
    /(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*pgEnum\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\[([^\]]+)\]\s*\)/g;
  let em: RegExpExecArray | null;
  while ((em = enumRegex.exec(source)) !== null) {
    const vals = em[3]
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean);
    out.push(`Enum ${em[2]} {`);
    for (const v of vals) out.push(`  ${v}`);
    out.push('}');
    out.push('');
  }

  // Parse each table object literal using brace matching
  tableHeaderRegex.lastIndex = 0;
  while ((hm = tableHeaderRegex.exec(source)) !== null) {
    const tableName = hm[2];
    const bodyStart = hm.index + hm[0].length;
    let depth = 1;
    let idx = bodyStart;
    while (idx < source.length && depth > 0) {
      if (source[idx] === '{') depth++;
      else if (source[idx] === '}') depth--;
      idx++;
    }
    const body = source.slice(bodyStart, idx - 1);
    const lines = body.split(/\r?\n/);

    out.push(`Table ${tableName} {`);
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const colMatch = trimmed.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(.*)$/
      );
      if (!colMatch) continue;
      const [, propName, builder, args, chain] = colMatch;
      const sqlColMatch = args.match(/^['"`]([^'"`]+)['"`]/);
      const colName = sqlColMatch ? sqlColMatch[1] : toSnakeCase(propName) || propName;
      const dbmlType = mapDrizzleBuilderToDbml(builder);

      const settings: string[] = [];
      if (chain.includes('.primaryKey(')) settings.push('pk');
      if (chain.includes('.notNull(') && !chain.includes('.primaryKey(')) {
        settings.push('not null');
      }
      if (chain.includes('.unique(')) settings.push('unique');
      if (builder === 'serial' || builder === 'bigserial') {
        settings.push('increment');
      }
      const defMatch = chain.match(/\.default\(([^)]+)\)/);
      if (defMatch) {
        const dv = defMatch[1].trim();
        if (/^['"`]/.test(dv)) {
          settings.push(`default: '${escapeSingleQuoted(dv.slice(1, -1))}'`);
        } else {
          settings.push(`default: ${dv}`);
        }
      } else if (chain.includes('.defaultNow(')) {
        settings.push('default: `now()`');
      } else if (chain.includes('.defaultRandom(')) {
        settings.push('default: `gen_random_uuid()`');
      }

      const refMatch = chain.match(
        /\.references\(\s*\(\)\s*=>\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/
      );
      if (refMatch) {
        const targetTable = varToTable.get(refMatch[1]) || toSnakeCase(refMatch[1]);
        const targetCol = toSnakeCase(refMatch[2]) || refMatch[2];
        refs.push(`Ref: ${tableName}.${colName} > ${targetTable}.${targetCol}`);
      }

      const attrPart = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
      out.push(`  ${colName} ${dbmlType}${attrPart}`);
    }
    out.push('}');
    out.push('');
  }

  if (refs.length > 0) {
    out.push(...refs);
    out.push('');
  }

  return out.join('\n').trim() + '\n';
}

function mapDbmlTypeToDrizzle(rawType: string, colName: string): string {
  const base = rawType.toLowerCase().split('(')[0].trim();
  if (base === 'serial') return `serial('${colName}')`;
  if (base === 'bigserial') return `bigserial('${colName}', { mode: 'number' })`;
  if (base === 'uuid') return `uuid('${colName}')`;
  if (base === 'int' || base === 'integer' || base === 'smallint') {
    return `integer('${colName}')`;
  }
  if (base === 'bigint') return `bigint('${colName}', { mode: 'number' })`;
  if (base === 'boolean' || base === 'bool') return `boolean('${colName}')`;
  if (base === 'text') return `text('${colName}')`;
  if (base.includes('timestamp') || base === 'datetime') {
    return `timestamp('${colName}')`;
  }
  if (base === 'date') return `date('${colName}')`;
  if (base === 'decimal' || base === 'numeric') return `numeric('${colName}')`;
  if (base === 'float' || base === 'double' || base === 'real') {
    return `doublePrecision('${colName}')`;
  }
  if (base === 'json' || base === 'jsonb') return `jsonb('${colName}')`;
  return `varchar('${colName}', { length: 255 })`;
}

export function exportSchemaToDrizzle(schema: ParsedSchema): string {
  const lines: string[] = [
    "import {",
    "  pgTable,",
    "  pgEnum,",
    "  uuid,",
    "  varchar,",
    "  text,",
    "  integer,",
    "  bigint,",
    "  serial,",
    "  bigserial,",
    "  boolean,",
    "  timestamp,",
    "  date,",
    "  numeric,",
    "  doublePrecision,",
    "  jsonb,",
    "} from 'drizzle-orm/pg-core';",
    '',
  ];

  const enumMap = new Map(
    schema.enums.map((e) => [e.name.toLowerCase(), `${toCamelCase(e.name)}Enum`])
  );

  for (const en of schema.enums) {
    const varName = `${toCamelCase(en.name)}Enum`;
    const vals = en.values.map((v) => `'${escapeSingleQuoted(v.name)}'`).join(', ');
    lines.push(`export const ${varName} = pgEnum('${en.name}', [${vals}]);`);
  }
  if (schema.enums.length > 0) lines.push('');

  const fkMap = new Map<string, { toTable: string; toCol: string }>();
  for (const ref of schema.refs) {
    ref.fromColumns.forEach((col, i) => {
      fkMap.set(`${ref.fromTable}.${col}`, {
        toTable: ref.toTable,
        toCol: ref.toColumns[i] || ref.toColumns[0] || 'id',
      });
    });
  }

  for (const t of schema.tables) {
    const varName = toCamelCase(t.name) || 'table';
    if (t.note) {
      lines.push(`/** ${t.note.replace(/\*\//g, '* /').replace(/\r?\n/g, ' ')} */`);
    }
    lines.push(`export const ${varName} = pgTable('${t.name}', {`);
    for (const c of t.columns) {
      const enumVar = enumMap.get(c.type.toLowerCase().split('(')[0].trim());
      let expr = enumVar
        ? `${enumVar}('${c.name}')`
        : mapDbmlTypeToDrizzle(c.type, c.name);
      if (c.pk) expr += '.primaryKey()';
      if (c.notNull && !c.pk) expr += '.notNull()';
      if (c.unique && !c.pk) expr += '.unique()';
      if (c.defaultValue) {
        const dv = c.defaultValue.trim();
        if (/^(now\(\)|CURRENT_TIMESTAMP)$/i.test(dv)) expr += '.defaultNow()';
        else if (/^gen_random_uuid|uuid/i.test(dv)) expr += '.defaultRandom()';
        else if (dv === 'true' || dv === 'false' || /^-?\d+(\.\d+)?$/.test(dv)) {
          expr += `.default(${dv})`;
        } else {
          expr += `.default('${escapeSingleQuoted(dv.replace(/^['"]|['"]$/g, ''))}')`;
        }
      }
      const fk = fkMap.get(`${t.id}.${c.name}`);
      if (fk) {
        const targetVar = toCamelCase(fk.toTable.split('.').pop() || fk.toTable);
        const targetProp = toCamelCase(fk.toCol);
        expr += `.references(() => ${targetVar}.${targetProp})`;
      }
      lines.push(`  ${toCamelCase(c.name)}: ${expr},`);
    }
    lines.push('});');
    lines.push('');
  }

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* 3. SQLALCHEMY EXPORT                                                       */
/* -------------------------------------------------------------------------- */

function mapDbmlTypeToSqlAlchemy(rawType: string): { pyType: string; saCol: string } {
  const base = rawType.toLowerCase().split('(')[0].trim();
  if (base === 'int' || base === 'integer' || base === 'serial' || base === 'bigint' || base === 'smallint') {
    return { pyType: 'int', saCol: base === 'bigint' ? 'BigInteger' : 'Integer' };
  }
  if (base === 'boolean' || base === 'bool') {
    return { pyType: 'bool', saCol: 'Boolean' };
  }
  if (base === 'float' || base === 'double' || base === 'real' || base === 'decimal' || base === 'numeric') {
    return { pyType: 'float', saCol: base === 'decimal' || base === 'numeric' ? 'Numeric' : 'Float' };
  }
  if (base.includes('timestamp') || base === 'datetime' || base === 'date') {
    return { pyType: 'datetime', saCol: 'DateTime' };
  }
  if (base === 'json' || base === 'jsonb') {
    return { pyType: 'dict', saCol: 'JSON' };
  }
  if (base === 'text') {
    return { pyType: 'str', saCol: 'Text' };
  }
  return { pyType: 'str', saCol: 'String(255)' };
}

export function exportSchemaToSqlAlchemy(schema: ParsedSchema): string {
  const lines: string[] = [
    'from datetime import datetime',
    'from typing import Optional',
    'from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, BigInteger, JSON, Numeric, String, Text',
    'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column',
    '',
    'class Base(DeclarativeBase):',
    '    pass',
    '',
  ];

  const fkMap = new Map<string, string>();
  for (const ref of schema.refs) {
    ref.fromColumns.forEach((col, i) => {
      const targetCol = ref.toColumns[i] || ref.toColumns[0] || 'id';
      fkMap.set(`${ref.fromTable}.${col}`, `${ref.toTable}.${targetCol}`);
    });
  }

  for (const t of schema.tables) {
    const className = toPascalCase(t.name);
    lines.push(`class ${className}(Base):`);
    lines.push(`    __tablename__ = "${t.name}"`);
    if (t.note) {
      lines.push(`    """${t.note.replace(/"""/g, "'''").trim()}"""`);
    }
    lines.push('');

    for (const c of t.columns) {
      const { pyType, saCol } = mapDbmlTypeToSqlAlchemy(c.type);
      const isNullable = !c.pk && !c.notNull;
      const mappedType = isNullable ? `Optional[${pyType}]` : pyType;
      const args: string[] = [saCol];
      const fk = fkMap.get(`${t.id}.${c.name}`);
      if (fk) args.push(`ForeignKey("${fk}")`);
      if (c.pk) args.push('primary_key=True');
      if (c.unique && !c.pk) args.push('unique=True');
      if (isNullable) args.push('nullable=True');
      if (c.note) {
        args.push(`comment="${c.note.replace(/"/g, "'").replace(/\r?\n/g, ' ')}"`);
      }
      lines.push(`    ${c.name}: Mapped[${mappedType}] = mapped_column(${args.join(', ')})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/* -------------------------------------------------------------------------- */
/* 4. OPENAPI / JSON SCHEMA IMPORT & EXPORT                                   */
/* -------------------------------------------------------------------------- */

function mapJsonSchemaPropToDbml(prop: Record<string, unknown>): string {
  const format = typeof prop.format === 'string' ? prop.format : '';
  const type = typeof prop.type === 'string' ? prop.type : 'string';
  if (format === 'uuid') return 'uuid';
  if (format === 'date-time') return 'timestamp';
  if (format === 'date') return 'date';
  if (type === 'integer') return format === 'int64' ? 'bigint' : 'int';
  if (type === 'number') return 'decimal';
  if (type === 'boolean') return 'boolean';
  if (type === 'object' || type === 'array') return 'jsonb';
  return 'varchar';
}

export function importOpenApiToDbml(source: string): string {
  let doc: unknown;
  try {
    doc = JSON.parse(source);
  } catch {
    throw new Error('OpenAPI / JSON Schema input must be valid JSON.');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Invalid OpenAPI / JSON Schema object.');
  }
  const root = doc as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  const schemasObj =
    (components?.schemas as Record<string, unknown> | undefined) ||
    (root.definitions as Record<string, unknown> | undefined) ||
    (root.properties ? { SchemaModel: root } : undefined);

  if (!schemasObj || typeof schemasObj !== 'object') {
    throw new Error(
      'Could not find components.schemas, definitions, or properties in JSON input.'
    );
  }

  const out: string[] = [];
  const refs: string[] = [];

  for (const [name, rawDef] of Object.entries(schemasObj)) {
    if (!rawDef || typeof rawDef !== 'object' || Array.isArray(rawDef)) continue;
    const def = rawDef as Record<string, unknown>;
    if (Array.isArray(def.enum)) {
      out.push(`Enum ${name} {`);
      for (const val of def.enum) {
        out.push(`  ${String(val).replace(/\s+/g, '_')}`);
      }
      out.push('}');
      out.push('');
      continue;
    }

    const props = def.properties as Record<string, unknown> | undefined;
    if (!props || typeof props !== 'object') continue;
    const required = new Set<string>(
      Array.isArray(def.required) ? def.required.map(String) : []
    );
    const tableName = toSnakeCase(name) || name;
    out.push(`Table ${tableName} {`);
    for (const [propName, rawProp] of Object.entries(props)) {
      if (!rawProp || typeof rawProp !== 'object' || Array.isArray(rawProp)) continue;
      const p = rawProp as Record<string, unknown>;
      const settings: string[] = [];
      let colType = mapJsonSchemaPropToDbml(p);
      if (typeof p.$ref === 'string') {
        const refName = p.$ref.split('/').pop() || 'id';
        colType = 'uuid';
        refs.push(
          `Ref: ${tableName}.${propName} > ${toSnakeCase(refName) || refName}.id`
        );
      }
      if (propName === 'id') settings.push('pk');
      else if (required.has(propName)) settings.push('not null');
      if (typeof p.description === 'string' && p.description.trim()) {
        settings.push(`note: '${escapeSingleQuoted(p.description.trim())}'`);
      }
      const attrPart = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
      out.push(`  ${propName} ${colType}${attrPart}`);
    }
    if (typeof def.description === 'string' && def.description.trim()) {
      out.push(`  Note: '${escapeSingleQuoted(def.description.trim())}'`);
    }
    out.push('}');
    out.push('');
  }

  if (refs.length > 0) {
    out.push(...refs);
    out.push('');
  }

  return out.join('\n').trim() + '\n';
}

export function exportSchemaToOpenApi(schema: ParsedSchema): string {
  const schemas: Record<string, unknown> = {};

  for (const en of schema.enums) {
    schemas[toPascalCase(en.name)] = {
      type: 'string',
      enum: en.values.map((v) => v.name),
    };
  }

  for (const t of schema.tables) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const c of t.columns) {
      const base = c.type.toLowerCase().split('(')[0].trim();
      const prop: Record<string, unknown> = {};
      if (base === 'uuid') {
        prop.type = 'string';
        prop.format = 'uuid';
      } else if (base === 'int' || base === 'integer' || base === 'serial' || base === 'smallint') {
        prop.type = 'integer';
      } else if (base === 'bigint' || base === 'bigserial') {
        prop.type = 'integer';
        prop.format = 'int64';
      } else if (base === 'float' || base === 'double' || base === 'real' || base === 'decimal' || base === 'numeric') {
        prop.type = 'number';
      } else if (base === 'boolean' || base === 'bool') {
        prop.type = 'boolean';
      } else if (base.includes('timestamp') || base === 'datetime') {
        prop.type = 'string';
        prop.format = 'date-time';
      } else if (base === 'date') {
        prop.type = 'string';
        prop.format = 'date';
      } else if (base === 'json' || base === 'jsonb') {
        prop.type = 'object';
      } else {
        prop.type = 'string';
      }
      if (c.note) prop.description = c.note;
      properties[c.name] = prop;
      if (c.pk || c.notNull) required.push(c.name);
    }

    schemas[toPascalCase(t.name)] = {
      type: 'object',
      ...(t.note ? { description: t.note } : {}),
      ...(required.length > 0 ? { required } : {}),
      properties,
    };
  }

  return (
    JSON.stringify(
      {
        openapi: '3.1.0',
        info: {
          title: schema.project.name || 'SchemaForge Schema API',
          version: '1.0.0',
          ...(schema.project.note ? { description: schema.project.note } : {}),
        },
        components: { schemas },
      },
      null,
      2
    ) + '\n'
  );
}
