import {
  DetailLevel,
  GroupCustomMeta,
  TablePosition,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';

export const SCHEMAFORGE_LAYOUT_PATH = '.schemaforge/layout.json';

export interface SerializedWorkspaceLayout {
  version: 1;
  detailLevel?: DetailLevel;
  tablePositions: Record<string, TablePosition>;
  groupMeta: Record<string, GroupCustomMeta>;
}

export function serializeWorkspaceLayoutJson(
  workspace: Pick<
    WorkspaceProject,
    'detailLevel' | 'tablePositions' | 'groupMeta'
  >
): string {
  const sortedPositions: Record<string, TablePosition> = {};
  for (const key of Object.keys(workspace.tablePositions || {}).sort()) {
    const pos = workspace.tablePositions[key];
    if (
      pos &&
      typeof pos.x === 'number' &&
      Number.isFinite(pos.x) &&
      typeof pos.y === 'number' &&
      Number.isFinite(pos.y)
    ) {
      sortedPositions[key] = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
      };
    }
  }

  const sortedGroupMeta: Record<string, GroupCustomMeta> = {};
  for (const key of Object.keys(workspace.groupMeta || {}).sort()) {
    const meta = workspace.groupMeta[key];
    if (!meta) continue;
    const cleaned: GroupCustomMeta = {};
    if (typeof meta.collapsed === 'boolean') cleaned.collapsed = meta.collapsed;
    if (typeof meta.description === 'string' && meta.description.trim()) {
      cleaned.description = meta.description.trim();
    }
    if (Object.keys(cleaned).length > 0) {
      sortedGroupMeta[key] = cleaned;
    }
  }

  const payload: SerializedWorkspaceLayout = {
    version: 1,
    detailLevel: workspace.detailLevel,
    tablePositions: sortedPositions,
    groupMeta: sortedGroupMeta,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

export function parseWorkspaceLayoutJson(
  raw: string
): SerializedWorkspaceLayout | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    const tablePositions: Record<string, TablePosition> = {};
    if (
      obj.tablePositions &&
      typeof obj.tablePositions === 'object' &&
      !Array.isArray(obj.tablePositions)
    ) {
      for (const [k, v] of Object.entries(
        obj.tablePositions as Record<string, unknown>
      )) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        const pt = v as Record<string, unknown>;
        if (
          typeof pt.x === 'number' &&
          Number.isFinite(pt.x) &&
          typeof pt.y === 'number' &&
          Number.isFinite(pt.y)
        ) {
          tablePositions[k] = { x: pt.x, y: pt.y };
        }
      }
    }

    const groupMeta: Record<string, GroupCustomMeta> = {};
    if (
      obj.groupMeta &&
      typeof obj.groupMeta === 'object' &&
      !Array.isArray(obj.groupMeta)
    ) {
      for (const [k, v] of Object.entries(
        obj.groupMeta as Record<string, unknown>
      )) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        const gm = v as Record<string, unknown>;
        const next: GroupCustomMeta = {};
        if (typeof gm.collapsed === 'boolean') next.collapsed = gm.collapsed;
        if (typeof gm.description === 'string') next.description = gm.description;
        groupMeta[k] = next;
      }
    }

    const detailLevel =
      obj.detailLevel === 'full' ||
      obj.detailLevel === 'columns' ||
      obj.detailLevel === 'keys' ||
      obj.detailLevel === 'names'
        ? obj.detailLevel
        : undefined;

    return {
      version: 1,
      detailLevel,
      tablePositions,
      groupMeta,
    };
  } catch {
    return null;
  }
}
