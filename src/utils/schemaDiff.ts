import {
  CheckDef,
  CheckDiff,
  ColumnDef,
  ColumnDiff,
  EnumDiff,
  GroupDiff,
  IndexDef,
  IndexDiff,
  LineDiffEntry,
  ParsedSchema,
  RefDef,
  RefDiff,
  SchemaDiffResult,
  SqlDialect,
  TableDiff,
} from '../types/schema';
import { parseDbml } from './dbmlParser';
import {
  generateSqlMigration,
  resolveIndexName,
  SqlMigrationOptions,
} from './io/sqlMigration';

export { generateSqlMigration };
export type { SqlMigrationOptions };

export function generateIncrementalSqlMigration(
  dbmlA: string,
  dbmlB: string,
  dialect: SqlDialect = 'postgres',
  options?: SqlMigrationOptions
): string {
  const diff = computeSchemaDiff(dbmlA, dbmlB);
  return generateSqlMigration(diff, dialect, options);
}

function refSignature(r: RefDef): string {
  return `${r.fromTable}.${r.fromColumns.join(',')} ${r.relation} ${r.toTable}.${r.toColumns.join(',')}`;
}

function indexKey(tableName: string, idx: IndexDef): string {
  if (idx.name) return `name:${idx.name}`;
  const items = (
    idx.items ||
    idx.columns.map((c) => ({
      value: c.replace(/^`|`$/g, ''),
      isExpression: c.startsWith('`') && c.endsWith('`'),
    }))
  ).map((it) => `${it.isExpression ? 'expr:' : 'col:'}${it.value}`);
  return `cols:${tableName}:${items.join(',')}${idx.pk ? ':pk' : ''}`;
}

function compareIndexes(
  tableName: string,
  a: IndexDef,
  b: IndexDef
): string[] {
  const changes: string[] = [];
  const nameA = resolveIndexName(tableName, a);
  const nameB = resolveIndexName(tableName, b);
  if (nameA !== nameB) changes.push(`name: ${nameA} -> ${nameB}`);
  if (Boolean(a.unique) !== Boolean(b.unique)) {
    changes.push(b.unique ? 'added unique' : 'removed unique');
  }
  if (Boolean(a.pk) !== Boolean(b.pk)) {
    changes.push(b.pk ? 'added pk' : 'removed pk');
  }
  if ((a.type || '') !== (b.type || '')) {
    changes.push(`type: ${a.type || 'default'} -> ${b.type || 'default'}`);
  }
  const colsA = (a.items?.map((i) => i.value) || a.columns).join(', ');
  const colsB = (b.items?.map((i) => i.value) || b.columns).join(', ');
  if (colsA !== colsB) {
    changes.push(`columns: (${colsA}) -> (${colsB})`);
  }
  return changes;
}

function checkKey(chk: CheckDef): string {
  return chk.name ? `name:${chk.name}` : `expr:${chk.expression.trim()}`;
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
  if ((a.check || '') !== (b.check || '')) {
    changes.push(`check: ${a.check || 'none'} -> ${b.check || 'none'}`);
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
  let indexesChanged = 0;

  for (const id of allTableIds) {
    const tA = mapA.get(id);
    const tB = mapB.get(id);

    if (!tA && tB) {
      tablesAdded++;
      columnsChanged += tB.columns.length;
      indexesChanged += tB.indexes.filter((idx) => !idx.pk).length;
      tableDiffs.push({
        tableId: id,
        status: 'added',
        groupNames: tableGroupMap.get(id) || [],
        after: tB,
        columnDiffs: tB.columns.map((c) => ({
          name: c.name,
          status: 'added',
          changes: [`${c.type}${c.pk ? ' [pk]' : ''}`],
          after: c,
        })),
        indexDiffs: tB.indexes
          .filter((idx) => !idx.pk)
          .map((idx) => ({
            key: indexKey(tB.name, idx),
            name: resolveIndexName(tB.name, idx),
            status: 'added',
            changes: [
              `(${(idx.items?.map((i) => i.value) || idx.columns).join(', ')})${
                idx.unique ? ' [unique]' : ''
              }`,
            ],
            after: idx,
          })),
      });
    } else if (tA && !tB) {
      tablesRemoved++;
      columnsChanged += tA.columns.length;
      indexesChanged += tA.indexes.filter((idx) => !idx.pk).length;
      tableDiffs.push({
        tableId: id,
        status: 'removed',
        groupNames: tableGroupMap.get(id) || [],
        before: tA,
        columnDiffs: tA.columns.map((c) => ({
          name: c.name,
          status: 'removed',
          changes: [`${c.type}`],
          before: c,
        })),
        indexDiffs: tA.indexes
          .filter((idx) => !idx.pk)
          .map((idx) => ({
            key: indexKey(tA.name, idx),
            name: resolveIndexName(tA.name, idx),
            status: 'removed',
            changes: [
              `(${(idx.items?.map((i) => i.value) || idx.columns).join(', ')})`,
            ],
            before: idx,
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

      // Indexes diff
      const idxMapA = new Map(tA.indexes.map((idx) => [indexKey(tA.name, idx), idx]));
      const idxMapB = new Map(tB.indexes.map((idx) => [indexKey(tB.name, idx), idx]));
      const allIdxKeys = Array.from(new Set([...idxMapA.keys(), ...idxMapB.keys()]));
      const indexDiffs: IndexDiff[] = [];

      for (const key of allIdxKeys) {
        const iA = idxMapA.get(key);
        const iB = idxMapB.get(key);
        if (!iA && iB) {
          indexDiffs.push({
            key,
            name: resolveIndexName(tB.name, iB),
            status: 'added',
            changes: [
              `(${(iB.items?.map((i) => i.value) || iB.columns).join(', ')})${
                iB.unique ? ' [unique]' : ''
              }`,
            ],
            after: iB,
          });
        } else if (iA && !iB) {
          indexDiffs.push({
            key,
            name: resolveIndexName(tA.name, iA),
            status: 'removed',
            changes: [
              `(${(iA.items?.map((i) => i.value) || iA.columns).join(', ')})`,
            ],
            before: iA,
          });
        } else if (iA && iB) {
          const changes = compareIndexes(tB.name, iA, iB);
          if (changes.length > 0) {
            indexDiffs.push({
              key,
              name: resolveIndexName(tB.name, iB),
              status: 'modified',
              changes,
              before: iA,
              after: iB,
            });
          }
        }
      }

      // Table checks diff
      const chkMapA = new Map((tA.checks || []).map((c) => [checkKey(c), c]));
      const chkMapB = new Map((tB.checks || []).map((c) => [checkKey(c), c]));
      const allChkKeys = Array.from(new Set([...chkMapA.keys(), ...chkMapB.keys()]));
      const checkDiffs: CheckDiff[] = [];

      for (const key of allChkKeys) {
        const cA = chkMapA.get(key);
        const cB = chkMapB.get(key);
        if (!cA && cB) {
          checkDiffs.push({ key, status: 'added', after: cB });
        } else if (cA && !cB) {
          checkDiffs.push({ key, status: 'removed', before: cA });
        } else if (cA && cB && cA.expression.trim() !== cB.expression.trim()) {
          checkDiffs.push({ key, status: 'modified', before: cA, after: cB });
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

      if (
        colDiffs.length > 0 ||
        indexDiffs.length > 0 ||
        checkDiffs.length > 0 ||
        headerColorChanged ||
        noteChanged
      ) {
        tablesModified++;
        columnsChanged += colDiffs.length;
        indexesChanged += indexDiffs.filter((d) => !(d.before?.pk && d.after?.pk)).length;
        tableDiffs.push({
          tableId: id,
          status: 'modified',
          groupNames: tableGroupMap.get(id) || [],
          headerColorChanged,
          noteChanged,
          before: tA,
          after: tB,
          columnDiffs: colDiffs,
          indexDiffs,
          checkDiffs,
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
      refDiffs.push({ id: rB.id, label: sig, status: 'added', after: rB });
    } else if (rA && !rB) {
      refDiffs.push({ id: rA.id, label: sig, status: 'removed', before: rA });
    } else if (rA && rB) {
      const details: string[] = [];
      if ((rA.onDelete || '') !== (rB.onDelete || '')) {
        details.push(`delete: ${rA.onDelete || 'none'} -> ${rB.onDelete || 'none'}`);
      }
      if ((rA.onUpdate || '') !== (rB.onUpdate || '')) {
        details.push(`update: ${rA.onUpdate || 'none'} -> ${rB.onUpdate || 'none'}`);
      }
      if ((rA.name || '') !== (rB.name || '')) {
        details.push(`name: ${rA.name || 'auto'} -> ${rB.name || 'auto'}`);
      }
      if (details.length > 0) {
        refDiffs.push({
          id: rB.id,
          label: sig,
          status: 'modified',
          detail: details.join('; '),
          before: rA,
          after: rB,
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
        after: eB,
      });
    } else if (eA && !eB) {
      enumDiffs.push({
        name: eId,
        status: 'removed',
        addedValues: [],
        removedValues: eA.values.map((v) => v.name),
        before: eA,
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
          before: eA,
          after: eB,
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
      indexesChanged,
      refsChanged: refDiffs.length,
      groupsChanged: groupDiffs.length,
    },
  };
}

