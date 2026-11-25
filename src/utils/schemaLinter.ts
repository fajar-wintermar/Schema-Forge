import { ParsedSchema, TableDef } from '@shared/domain/schemaTypes';

export type LintRuleId =
  | 'unindexed-fk'
  | 'missing-pk'
  | 'naming-convention'
  | 'nullable-unique'
  | 'circular-fk';

export type LintSeverity = 'warning' | 'info';

export type NamingStyle = 'snake_case' | 'camelCase' | 'PascalCase' | 'neutral';

export interface SchemaLintIssue {
  id: string;
  ruleId: LintRuleId;
  severity: LintSeverity;
  title: string;
  message: string;
  suggestion: string;
  tableId?: string;
  columnName?: string;
  line?: number;
}

export interface SchemaLintResult {
  issues: SchemaLintIssue[];
  warningCount: number;
  infoCount: number;
  dominantNamingStyle: 'snake_case' | 'camelCase' | null;
}

export function classifyIdentifierNaming(name: string): NamingStyle {
  const bare = name.trim();
  if (!bare) return 'neutral';
  if (bare.includes('_')) {
    return 'snake_case';
  }
  if (/^[A-Z][a-zA-Z0-9]*$/.test(bare) && /[a-z]/.test(bare)) {
    return 'PascalCase';
  }
  if (/^[a-z][a-z0-9]*[A-Z][a-zA-Z0-9]*$/.test(bare)) {
    return 'camelCase';
  }
  return 'neutral';
}

export function toSnakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export function toCamelCase(name: string): string {
  const lower = name.includes('_')
    ? name.toLowerCase().replace(/_+([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())
    : name.charAt(0).toLowerCase() + name.slice(1);
  return lower.replace(/_+$/g, '');
}

function normalizeIdxColName(col: string): string {
  return col.trim().replace(/^["'`]|["'`]$/g, '');
}

function tableHasPrimaryKey(table: TableDef): boolean {
  if (table.columns.some((c) => c.pk)) return true;
  return table.indexes.some((idx) => Boolean(idx.pk));
}

function isFkColumnsIndexed(table: TableDef, fkCols: string[]): boolean {
  if (fkCols.length === 0) return true;

  if (fkCols.length === 1) {
    const colName = fkCols[0];
    const col = table.columns.find((c) => c.name === colName);
    if (col && (col.pk || col.unique)) return true;
  }

  for (const idx of table.indexes) {
    const idxCols = idx.columns.map(normalizeIdxColName);
    if (idxCols.length < fkCols.length) continue;
    let prefixMatch = true;
    for (let i = 0; i < fkCols.length; i++) {
      if (idxCols[i] !== fkCols[i]) {
        prefixMatch = false;
        break;
      }
    }
    if (prefixMatch) return true;
  }

  // Composite PK defined via inline [pk] columns (only covers if single PK col, handled above,
  // or if all PK columns match fkCols in order)
  const pkCols = table.columns.filter((c) => c.pk).map((c) => c.name);
  if (pkCols.length >= fkCols.length && pkCols.length > 0) {
    const matchesPkPrefix = fkCols.every((c, idx) => pkCols[idx] === c);
    if (matchesPkPrefix) return true;
  }

  return false;
}

export function lintSchemaQuality(schema: ParsedSchema): SchemaLintResult {
  const issues: SchemaLintIssue[] = [];
  const tableMap = new Map<string, TableDef>(schema.tables.map((t) => [t.id, t]));

  // 1. Missing primary keys
  for (const table of schema.tables) {
    if (!tableHasPrimaryKey(table)) {
      issues.push({
        id: `missing-pk:${table.id}`,
        ruleId: 'missing-pk',
        severity: 'warning',
        title: 'Table missing primary key',
        message: `Table "${table.id}" has no primary key column or [pk] index.`,
        suggestion:
          'Add a [pk] column (e.g. id uuid [pk]) or define a composite key inside Indexes { (col_a, col_b) [pk] }.',
        tableId: table.id,
        line: table.line,
      });
    }
  }

  // 2. Unindexed foreign keys
  const seenFkPairs = new Set<string>();
  const fkEdges: Array<{ childId: string; parentId: string; line?: number }> = [];

  for (const ref of schema.refs) {
    let childId: string | null = null;
    let childCols: string[] = [];
    let parentId: string | null = null;

    if (ref.relation === '>') {
      childId = ref.fromTable;
      childCols = ref.fromColumns;
      parentId = ref.toTable;
    } else if (ref.relation === '<') {
      childId = ref.toTable;
      childCols = ref.toColumns;
      parentId = ref.fromTable;
    } else if (ref.relation === '-') {
      const fromTable = tableMap.get(ref.fromTable);
      const toTable = tableMap.get(ref.toTable);
      const fromIsPk =
        fromTable &&
        ref.fromColumns.length > 0 &&
        ref.fromColumns.every((c) => fromTable.columns.find((col) => col.name === c)?.pk);
      const toIsPk =
        toTable &&
        ref.toColumns.length > 0 &&
        ref.toColumns.every((c) => toTable.columns.find((col) => col.name === c)?.pk);

      if (toIsPk && !fromIsPk) {
        childId = ref.fromTable;
        childCols = ref.fromColumns;
        parentId = ref.toTable;
      } else if (fromIsPk && !toIsPk) {
        childId = ref.toTable;
        childCols = ref.toColumns;
        parentId = ref.fromTable;
      } else {
        childId = ref.fromTable;
        childCols = ref.fromColumns;
        parentId = ref.toTable;
      }
    }

    if (!childId || !parentId || childCols.length === 0) continue;

    if (childId !== parentId) {
      fkEdges.push({ childId, parentId, line: ref.line });
    }

    const childTable = tableMap.get(childId);
    if (!childTable) continue;

    const fkKey = `${childId}::${childCols.join(',')}`;
    if (seenFkPairs.has(fkKey)) continue;
    seenFkPairs.add(fkKey);

    if (!isFkColumnsIndexed(childTable, childCols)) {
      const colObj = childTable.columns.find((c) => c.name === childCols[0]);
      const colLabel =
        childCols.length === 1
          ? `${childId}.${childCols[0]}`
          : `${childId}.(${childCols.join(', ')})`;
      const indexSnippet =
        childCols.length === 1 ? childCols[0] : `(${childCols.join(', ')})`;
      issues.push({
        id: `unindexed-fk:${fkKey}`,
        ruleId: 'unindexed-fk',
        severity: 'warning',
        title: 'Unindexed foreign key',
        message: `Foreign key ${colLabel} referencing ${parentId} has no covering index.`,
        suggestion: `Add "${indexSnippet}" inside ${childId}'s Indexes { ... } block to speed up joins and cascading deletes.`,
        tableId: childId,
        columnName: childCols[0],
        line: colObj?.line ?? ref.line ?? childTable.line,
      });
    }
  }

  // 3. Nullable unique keys
  for (const table of schema.tables) {
    const uniqueIndexedSingleCols = new Set<string>();
    for (const idx of table.indexes) {
      if (idx.unique && !idx.pk && idx.columns.length === 1) {
        uniqueIndexedSingleCols.add(normalizeIdxColName(idx.columns[0]));
      }
    }

    for (const col of table.columns) {
      const isUniqueCol = col.unique || uniqueIndexedSingleCols.has(col.name);
      if (isUniqueCol && !col.pk && !col.notNull) {
        issues.push({
          id: `nullable-unique:${table.id}.${col.name}`,
          ruleId: 'nullable-unique',
          severity: 'info',
          title: 'Nullable unique column',
          message: `Column "${table.id}.${col.name}" is marked [unique] without [not null].`,
          suggestion:
            'Add [not null] if duplicate NULL rows are unintended, or verify partial/NULLS NOT DISTINCT index behavior in your target dialect.',
          tableId: table.id,
          columnName: col.name,
          line: col.line ?? table.line,
        });
      }
    }
  }

  // 4. Naming convention consistency (snake_case vs camelCase)
  interface IdentifierSample {
    kind: 'table' | 'column';
    name: string;
    style: NamingStyle;
    tableId: string;
    columnName?: string;
    line?: number;
  }
  const samples: IdentifierSample[] = [];
  let snakeCount = 0;
  let camelCount = 0;
  let pascalCount = 0;

  for (const table of schema.tables) {
    const tStyle = classifyIdentifierNaming(table.name);
    samples.push({
      kind: 'table',
      name: table.name,
      style: tStyle,
      tableId: table.id,
      line: table.line,
    });
    if (tStyle === 'snake_case') snakeCount++;
    else if (tStyle === 'camelCase') camelCount++;
    else if (tStyle === 'PascalCase') pascalCount++;

    for (const col of table.columns) {
      const cStyle = classifyIdentifierNaming(col.name);
      samples.push({
        kind: 'column',
        name: col.name,
        style: cStyle,
        tableId: table.id,
        columnName: col.name,
        line: col.line ?? table.line,
      });
      if (cStyle === 'snake_case') snakeCount++;
      else if (cStyle === 'camelCase') camelCount++;
      else if (cStyle === 'PascalCase') pascalCount++;
    }
  }

  let dominantNamingStyle: 'snake_case' | 'camelCase' | null = null;
  if (snakeCount > 0 || camelCount > 0) {
    dominantNamingStyle = snakeCount >= camelCount ? 'snake_case' : 'camelCase';
  }

  const hasNamingMix =
    dominantNamingStyle !== null &&
    ((dominantNamingStyle === 'snake_case' && (camelCount > 0 || pascalCount > 0)) ||
      (dominantNamingStyle === 'camelCase' && (snakeCount > 0 || pascalCount > 0)));

  if (hasNamingMix && dominantNamingStyle) {
    for (const sample of samples) {
      if (sample.style === 'neutral' || sample.style === dominantNamingStyle) {
        continue;
      }
      const suggestedName =
        dominantNamingStyle === 'snake_case'
          ? toSnakeCase(sample.name)
          : toCamelCase(sample.name);
      const locationLabel =
        sample.kind === 'table'
          ? `Table "${sample.tableId}"`
          : `Column "${sample.tableId}.${sample.columnName}"`;

      issues.push({
        id: `naming-convention:${sample.kind}:${sample.tableId}${
          sample.columnName ? `.${sample.columnName}` : ''
        }`,
        ruleId: 'naming-convention',
        severity: 'info',
        title: 'Inconsistent identifier naming',
        message: `${locationLabel} uses ${sample.style} while the schema predominantly uses ${dominantNamingStyle}.`,
        suggestion: `Consider renaming "${sample.name}" to "${suggestedName}" for consistent ${dominantNamingStyle} naming.`,
        tableId: sample.tableId,
        columnName: sample.columnName,
        line: sample.line,
      });
    }
  }

  // 5. Circular FK cycles (multi-table directed cycles along child -> parent FK edges)
  const adj = new Map<string, Array<{ target: string; line?: number }>>();
  for (const edge of fkEdges) {
    if (!adj.has(edge.childId)) adj.set(edge.childId, []);
    const existing = adj.get(edge.childId)!;
    if (!existing.some((e) => e.target === edge.parentId)) {
      existing.push({ target: edge.parentId, line: edge.line });
    }
  }

  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited, 1=visiting, 2=done
  const stack: string[] = [];
  const stackLine = new Map<string, number | undefined>();
  const seenCycles = new Set<string>();

  const dfs = (node: string) => {
    state.set(node, 1);
    stack.push(node);

    for (const next of adj.get(node) || []) {
      const nextState = state.get(next.target) || 0;
      if (nextState === 1) {
        const idx = stack.indexOf(next.target);
        if (idx !== -1) {
          const cycleNodes = stack.slice(idx);
          if (cycleNodes.length >= 2) {
            // Canonicalize cycle rotation to avoid duplicates
            let minIdx = 0;
            for (let i = 1; i < cycleNodes.length; i++) {
              if (cycleNodes[i] < cycleNodes[minIdx]) minIdx = i;
            }
            const rotated = [
              ...cycleNodes.slice(minIdx),
              ...cycleNodes.slice(0, minIdx),
            ];
            const cycleKey = rotated.join('->');
            if (!seenCycles.has(cycleKey)) {
              seenCycles.add(cycleKey);
              const firstTable = tableMap.get(rotated[0]);
              const displayChain = [...rotated, rotated[0]].join(' → ');
              issues.push({
                id: `circular-fk:${cycleKey}`,
                ruleId: 'circular-fk',
                severity: 'warning',
                title: 'Circular foreign-key dependency',
                message: `Circular FK cycle detected: ${displayChain}.`,
                suggestion:
                  'Break the cycle with a nullable/deferred FK, move the circular edge into a join/link table, or verify insert/drop ordering.',
                tableId: rotated[0],
                line: next.line ?? stackLine.get(rotated[0]) ?? firstTable?.line,
              });
            }
          }
        }
      } else if (nextState === 0) {
        stackLine.set(next.target, next.line);
        dfs(next.target);
      }
    }

    stack.pop();
    state.set(node, 2);
  };

  for (const table of schema.tables) {
    if ((state.get(table.id) || 0) === 0 && adj.has(table.id)) {
      dfs(table.id);
    }
  }

  // Deterministic sort: warnings first, then line number, then id
  issues.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'warning' ? -1 : 1;
    }
    const lineA = a.line ?? Number.MAX_SAFE_INTEGER;
    const lineB = b.line ?? Number.MAX_SAFE_INTEGER;
    if (lineA !== lineB) return lineA - lineB;
    return a.id.localeCompare(b.id);
  });

  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return {
    issues,
    warningCount,
    infoCount,
    dominantNamingStyle,
  };
}
