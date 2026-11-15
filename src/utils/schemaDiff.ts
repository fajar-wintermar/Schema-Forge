import {
  ColumnDef,
  ColumnDiff,
  EnumDiff,
  GroupDiff,
  LineDiffEntry,
  ParsedSchema,
  RefDef,
  RefDiff,
  SchemaDiffResult,
  TableDiff,
} from '../types/schema';
import { parseDbml } from './dbmlParser';

function refSignature(r: RefDef): string {
  return `${r.fromTable}.${r.fromColumns.join(',')} ${r.relation} ${r.toTable}.${r.toColumns.join(',')}`;
}

function diffLines(textA: string, textB: string): LineDiffEntry[] {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const n = linesA.length;
  const m = linesB.length;

  // Simple LCS DP for reasonable DBML file sizes
  if (n * m > 250000) {
    // Fallback quick diff for huge files
    const result: LineDiffEntry[] = [];
    const maxLen = Math.max(n, m);
    for (let i = 0; i < maxLen; i++) {
      if (i < n && i < m && linesA[i] === linesB[i]) {
        result.push({ type: 'context', lineA: i + 1, lineB: i + 1, text: linesA[i] });
      } else {
        if (i < n) result.push({ type: 'removed', lineA: i + 1, text: linesA[i] });
        if (i < m) result.push({ type: 'added', lineB: i + 1, text: linesB[i] });
      }
    }
    return result;
  }

  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (linesA[i] === linesB[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const entries: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (linesA[i] === linesB[j]) {
      entries.push({ type: 'context', lineA: i + 1, lineB: j + 1, text: linesA[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      entries.push({ type: 'removed', lineA: i + 1, text: linesA[i] });
      i++;
    } else {
      entries.push({ type: 'added', lineB: j + 1, text: linesB[j] });
      j++;
    }
  }
  while (i < n) {
    entries.push({ type: 'removed', lineA: i + 1, text: linesA[i] });
    i++;
  }
  while (j < m) {
    entries.push({ type: 'added', lineB: j + 1, text: linesB[j] });
    j++;
  }

  return entries;
}

function compareColumns(a: ColumnDef, b: ColumnDef): string[] {
  const changes: string[] = [];
  if (a.type !== b.type) changes.push(`type: ${a.type} -> ${b.type}`);
  if (a.pk !== b.pk) changes.push(b.pk ? 'added PK' : 'removed PK');
  if (a.unique !== b.unique) changes.push(b.unique ? 'added unique' : 'removed unique');
  if (a.notNull !== b.notNull) changes.push(b.notNull ? 'added not null' : 'removed not null');
  if (a.increment !== b.increment) changes.push(b.increment ? 'added increment' : 'removed increment');
  if ((a.defaultValue || '') !== (b.defaultValue || '')) {
    changes.push(`default: ${a.defaultValue || 'none'} -> ${b.defaultValue || 'none'}`);
  }
  if ((a.note || '') !== (b.note || '')) {
    changes.push('note updated');
  }
  return changes;
}

export function computeSchemaDiff(dbmlA: string, dbmlB: string): SchemaDiffResult {
  const schemaA: ParsedSchema = parseDbml(dbmlA);
  const schemaB: ParsedSchema = parseDbml(dbmlB);

  const tableGroupMap = new Map<string, string[]>();
  const addGroupRef = (tableId: string, groupName: string) => {
    if (!tableGroupMap.has(tableId)) tableGroupMap.set(tableId, []);
    const arr = tableGroupMap.get(tableId)!;
    if (!arr.includes(groupName)) arr.push(groupName);
  };
  for (const g of schemaB.tableGroups) {
    for (const t of g.tables) addGroupRef(t, g.name);
  }
  for (const g of schemaA.tableGroups) {
    for (const t of g.tables) addGroupRef(t, g.name);
  }

  const mapA = new Map(schemaA.tables.map((t) => [t.id, t]));
  const mapB = new Map(schemaB.tables.map((t) => [t.id, t]));
  const allTableIds = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));

  const tableDiffs: TableDiff[] = [];
  let tablesAdded = 0;
  let tablesRemoved = 0;
  let tablesModified = 0;
  let columnsChanged = 0;

  for (const id of allTableIds) {
    const tA = mapA.get(id);
    const tB = mapB.get(id);

    if (!tA && tB) {
      tablesAdded++;
      columnsChanged += tB.columns.length;
      tableDiffs.push({
        tableId: id,
        status: 'added',
        groupNames: tableGroupMap.get(id) || [],
        columnDiffs: tB.columns.map((c) => ({
          name: c.name,
          status: 'added',
          changes: [`${c.type}${c.pk ? ' [pk]' : ''}`],
          after: c,
        })),
      });
    } else if (tA && !tB) {
      tablesRemoved++;
      columnsChanged += tA.columns.length;
      tableDiffs.push({
        tableId: id,
        status: 'removed',
        groupNames: tableGroupMap.get(id) || [],
        columnDiffs: tA.columns.map((c) => ({
          name: c.name,
          status: 'removed',
          changes: [`${c.type}`],
          before: c,
        })),
      });
    } else if (tA && tB) {
      const colMapA = new Map(tA.columns.map((c) => [c.name, c]));
      const colMapB = new Map(tB.columns.map((c) => [c.name, c]));
      const allCols = Array.from(new Set([...colMapA.keys(), ...colMapB.keys()]));
      const colDiffs: ColumnDiff[] = [];

      for (const colName of allCols) {
        const cA = colMapA.get(colName);
        const cB = colMapB.get(colName);
        if (!cA && cB) {
          colDiffs.push({
            name: colName,
            status: 'added',
            changes: [`${cB.type}${cB.notNull ? ' [not null]' : ''}`],
            after: cB,
          });
        } else if (cA && !cB) {
          colDiffs.push({
            name: colName,
            status: 'removed',
            changes: [`${cA.type}`],
            before: cA,
          });
        } else if (cA && cB) {
          const changes = compareColumns(cA, cB);
          if (changes.length > 0) {
            colDiffs.push({
              name: colName,
              status: 'modified',
              changes,
              before: cA,
              after: cB,
            });
          }
        }
      }

      const headerColorChanged =
        (tA.headerColor || '') !== (tB.headerColor || '')
          ? { from: tA.headerColor, to: tB.headerColor }
          : undefined;

      const noteChanged =
        (tA.note || '') !== (tB.note || '')
          ? { from: tA.note, to: tB.note }
          : undefined;

      if (colDiffs.length > 0 || headerColorChanged || noteChanged) {
        tablesModified++;
        columnsChanged += colDiffs.length;
        tableDiffs.push({
          tableId: id,
          status: 'modified',
          groupNames: tableGroupMap.get(id) || [],
          headerColorChanged,
          noteChanged,
          columnDiffs: colDiffs,
        });
      }
    }
  }

  // Refs diff
  const refMapA = new Map(schemaA.refs.map((r) => [refSignature(r), r]));
  const refMapB = new Map(schemaB.refs.map((r) => [refSignature(r), r]));
  const allRefSigs = Array.from(new Set([...refMapA.keys(), ...refMapB.keys()]));
  const refDiffs: RefDiff[] = [];

  for (const sig of allRefSigs) {
    const rA = refMapA.get(sig);
    const rB = refMapB.get(sig);
    if (!rA && rB) {
      refDiffs.push({ id: rB.id, label: sig, status: 'added' });
    } else if (rA && !rB) {
      refDiffs.push({ id: rA.id, label: sig, status: 'removed' });
    } else if (rA && rB) {
      if ((rA.onDelete || '') !== (rB.onDelete || '') || (rA.onUpdate || '') !== (rB.onUpdate || '')) {
        refDiffs.push({
          id: rB.id,
          label: sig,
          status: 'modified',
          detail: `delete: ${rA.onDelete || 'none'} -> ${rB.onDelete || 'none'}`,
        });
      }
    }
  }

  // TableGroups diff
  const gMapA = new Map(schemaA.tableGroups.map((g) => [g.name, g]));
  const gMapB = new Map(schemaB.tableGroups.map((g) => [g.name, g]));
  const allGroupNames = Array.from(new Set([...gMapA.keys(), ...gMapB.keys()]));
  const groupDiffs: GroupDiff[] = [];

  for (const gName of allGroupNames) {
    const gA = gMapA.get(gName);
    const gB = gMapB.get(gName);
    if (!gA && gB) {
      groupDiffs.push({
        name: gName,
        status: 'added',
        addedTables: gB.tables,
        removedTables: [],
      });
    } else if (gA && !gB) {
      groupDiffs.push({
        name: gName,
        status: 'removed',
        addedTables: [],
        removedTables: gA.tables,
      });
    } else if (gA && gB) {
      const setA = new Set(gA.tables);
      const setB = new Set(gB.tables);
      const addedTables = gB.tables.filter((t) => !setA.has(t));
      const removedTables = gA.tables.filter((t) => !setB.has(t));
      const colorChanged =
        (gA.color || '') !== (gB.color || '')
          ? { from: gA.color, to: gB.color }
          : undefined;
      const noteChanged =
        (gA.note || '') !== (gB.note || '')
          ? { from: gA.note, to: gB.note }
          : undefined;

      if (addedTables.length > 0 || removedTables.length > 0 || colorChanged || noteChanged) {
        groupDiffs.push({
          name: gName,
          status: 'modified',
          addedTables,
          removedTables,
          colorChanged,
          noteChanged,
        });
      }
    }
  }

  // Enums diff
  const eMapA = new Map(schemaA.enums.map((e) => [e.id, e]));
  const eMapB = new Map(schemaB.enums.map((e) => [e.id, e]));
  const allEnums = Array.from(new Set([...eMapA.keys(), ...eMapB.keys()]));
  const enumDiffs: EnumDiff[] = [];

  for (const eId of allEnums) {
    const eA = eMapA.get(eId);
    const eB = eMapB.get(eId);
    if (!eA && eB) {
      enumDiffs.push({
        name: eId,
        status: 'added',
        addedValues: eB.values.map((v) => v.name),
        removedValues: [],
      });
    } else if (eA && !eB) {
      enumDiffs.push({
        name: eId,
        status: 'removed',
        addedValues: [],
        removedValues: eA.values.map((v) => v.name),
      });
    } else if (eA && eB) {
      const valsA = new Set(eA.values.map((v) => v.name));
      const valsB = new Set(eB.values.map((v) => v.name));
      const addedValues = eB.values.map((v) => v.name).filter((v) => !valsA.has(v));
      const removedValues = eA.values.map((v) => v.name).filter((v) => !valsB.has(v));
      if (addedValues.length > 0 || removedValues.length > 0) {
        enumDiffs.push({
          name: eId,
          status: 'modified',
          addedValues,
          removedValues,
        });
      }
    }
  }

  return {
    tables: tableDiffs,
    refs: refDiffs,
    groups: groupDiffs,
    enums: enumDiffs,
    lineDiff: diffLines(dbmlA, dbmlB),
    summary: {
      tablesAdded,
      tablesRemoved,
      tablesModified,
      columnsChanged,
      refsChanged: refDiffs.length,
      groupsChanged: groupDiffs.length,
    },
  };
}
