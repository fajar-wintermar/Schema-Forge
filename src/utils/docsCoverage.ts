import { ParsedSchema, TableDef, TableGroupDef } from '@shared/domain/schemaTypes';

export interface DocsCoverageMetric {
  documented: number;
  total: number;
  pct: number;
}

export interface DocsCoverageReport {
  tables: DocsCoverageMetric;
  columns: DocsCoverageMetric;
  groups: DocsCoverageMetric;
  overallPct: number;
  undocumentedTables: TableDef[];
  undocumentedGroups: TableGroupDef[];
  undocumentedColumnCount: number;
}

function pctOf(documented: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((documented / total) * 100);
}

export function computeDocsCoverage(schema: ParsedSchema): DocsCoverageReport {
  const undocumentedTables = schema.tables.filter(
    (t) => !t.note || !t.note.trim()
  );
  const documentedTablesCount = schema.tables.length - undocumentedTables.length;

  let totalColumns = 0;
  let documentedColumns = 0;
  for (const t of schema.tables) {
    for (const c of t.columns) {
      totalColumns++;
      if (c.note && c.note.trim()) {
        documentedColumns++;
      }
    }
  }

  const undocumentedGroups = schema.tableGroups.filter(
    (g) => !g.note || !g.note.trim()
  );
  const documentedGroupsCount =
    schema.tableGroups.length - undocumentedGroups.length;

  const totalItems =
    schema.tables.length + totalColumns + schema.tableGroups.length;
  const documentedItems =
    documentedTablesCount + documentedColumns + documentedGroupsCount;

  return {
    tables: {
      documented: documentedTablesCount,
      total: schema.tables.length,
      pct: pctOf(documentedTablesCount, schema.tables.length),
    },
    columns: {
      documented: documentedColumns,
      total: totalColumns,
      pct: pctOf(documentedColumns, totalColumns),
    },
    groups: {
      documented: documentedGroupsCount,
      total: schema.tableGroups.length,
      pct: pctOf(documentedGroupsCount, schema.tableGroups.length),
    },
    overallPct: pctOf(documentedItems, totalItems),
    undocumentedTables,
    undocumentedGroups,
    undocumentedColumnCount: totalColumns - documentedColumns,
  };
}
