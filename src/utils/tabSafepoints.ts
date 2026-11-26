import {
  DetailLevel,
  GroupCustomMeta,
  SchemaModuleFile,
  StickyNote,
  TablePosition,
  ViewMode,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { parseDbml } from '@shared/domain/dbml';
import type { DocsSection } from '../features/docs/types';
import type { ViewportState } from '../features/diagram/types';
import { computeSchemaDiff } from './schemaDiff';

export interface SafepointWorkspaceSnapshot {
  dbml: string;
  schemaFiles?: SchemaModuleFile[];
  activeSchemaFile?: string;
  tablePositions: Record<string, TablePosition>;
  groupMeta: Record<string, GroupCustomMeta>;
  stickyNotes: StickyNote[];
  detailLevel: DetailLevel;
}

export interface SafepointViewState {
  editorState?: 'normal' | 'maximized' | 'minimized';
  selectedDomains?: string[];
  selectedTableId?: string | null;
  diagramViewport?: ViewportState;
  docsSection?: DocsSection;
  docsScrollTop?: number;
}

export type SafepointReason = 'tab-switch' | 'manual' | 'pre-restore';

export interface TabSafepoint {
  id: string;
  workspaceId: string;
  createdAt: string;
  fromTab: ViewMode;
  toTab: ViewMode;
  reason: SafepointReason;
  summary: string;
  highlights: string[];
  tableCount: number;
  snapshot: SafepointWorkspaceSnapshot;
  viewState: SafepointViewState;
}

export interface SafepointDeltaResult {
  hasChanges: boolean;
  summary: string;
  highlights: string[];
}

export const MAX_SAFEPOINTS_PER_WORKSPACE = 25;

export function tabSafepointMetaKey(workspaceId: string): string {
  return `tabSafepoints_${workspaceId}`;
}

export function extractWorkspaceSnapshot(
  ws: WorkspaceProject
): SafepointWorkspaceSnapshot {
  const clonedPositions: Record<string, TablePosition> = {};
  for (const [k, pos] of Object.entries(ws.tablePositions || {})) {
    clonedPositions[k] = { x: pos.x, y: pos.y };
  }

  const clonedGroupMeta: Record<string, GroupCustomMeta> = {};
  for (const [k, meta] of Object.entries(ws.groupMeta || {})) {
    clonedGroupMeta[k] = { ...meta };
  }

  return {
    dbml: ws.dbml,
    schemaFiles: ws.schemaFiles
      ? ws.schemaFiles.map((f) => ({ ...f }))
      : undefined,
    activeSchemaFile: ws.activeSchemaFile,
    tablePositions: clonedPositions,
    groupMeta: clonedGroupMeta,
    stickyNotes: (ws.stickyNotes || []).map((n) => ({ ...n })),
    detailLevel: ws.detailLevel,
  };
}

function areSchemaFilesEqual(
  a?: SchemaModuleFile[],
  b?: SchemaModuleFile[]
): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].content !== b[i].content) {
      return false;
    }
  }
  return true;
}

function countMovedTables(
  prev: Record<string, TablePosition>,
  next: Record<string, TablePosition>
): number {
  let changed = 0;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (!a && b) {
      changed++;
    } else if (a && b && (Math.abs(a.x - b.x) >= 2 || Math.abs(a.y - b.y) >= 2)) {
      changed++;
    }
  }
  return changed;
}

function countGroupMetaChanges(
  prev: Record<string, GroupCustomMeta>,
  next: Record<string, GroupCustomMeta>
): number {
  let changed = 0;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (Boolean(a?.collapsed) !== Boolean(b?.collapsed)) {
      changed++;
    } else if ((a?.description || '') !== (b?.description || '')) {
      changed++;
    }
  }
  return changed;
}

function analyzeStickyDelta(
  prev: StickyNote[],
  next: StickyNote[]
): { added: number; removed: number; edited: number } {
  const prevMap = new Map(prev.map((n) => [n.id, n]));
  const nextMap = new Map(next.map((n) => [n.id, n]));
  let added = 0;
  let removed = 0;
  let edited = 0;

  for (const [id, n] of nextMap) {
    const p = prevMap.get(id);
    if (!p) {
      added++;
    } else if (
      p.title !== n.title ||
      p.content !== n.content ||
      p.color !== n.color ||
      Math.abs(p.x - n.x) >= 2 ||
      Math.abs(p.y - n.y) >= 2 ||
      Boolean(p.collapsed) !== Boolean(n.collapsed)
    ) {
      edited++;
    }
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removed++;
  }
  return { added, removed, edited };
}

export function summarizeSafepointDelta(
  prev: SafepointWorkspaceSnapshot,
  next: WorkspaceProject
): SafepointDeltaResult {
  const parts: string[] = [];
  const highlights: string[] = [];

  const dbmlChanged = prev.dbml !== next.dbml;
  const filesChanged = !areSchemaFilesEqual(prev.schemaFiles, next.schemaFiles);

  if (dbmlChanged || filesChanged) {
    const diff = computeSchemaDiff(prev.dbml, next.dbml);
    const schemaBits: string[] = [];

    if (diff.summary.tablesAdded > 0) {
      const label = `+${diff.summary.tablesAdded} ${
        diff.summary.tablesAdded === 1 ? 'table' : 'tables'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.summary.tablesRemoved > 0) {
      const label = `-${diff.summary.tablesRemoved} ${
        diff.summary.tablesRemoved === 1 ? 'table' : 'tables'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.summary.tablesModified > 0 && diff.summary.columnsChanged === 0) {
      const label = `~${diff.summary.tablesModified} ${
        diff.summary.tablesModified === 1 ? 'table' : 'tables'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.summary.columnsChanged > 0) {
      const label = `~${diff.summary.columnsChanged} ${
        diff.summary.columnsChanged === 1 ? 'col' : 'cols'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.summary.refsChanged > 0) {
      const label = `~${diff.summary.refsChanged} ${
        diff.summary.refsChanged === 1 ? 'ref' : 'refs'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.summary.groupsChanged > 0) {
      const label = `~${diff.summary.groupsChanged} ${
        diff.summary.groupsChanged === 1 ? 'group' : 'groups'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }
    if (diff.enums.length > 0) {
      const label = `~${diff.enums.length} ${
        diff.enums.length === 1 ? 'enum' : 'enums'
      }`;
      schemaBits.push(label);
      highlights.push(label);
    }

    if (schemaBits.length > 0) {
      parts.push(schemaBits.join(', '));
    } else {
      parts.push('Edited DBML source');
      highlights.push('DBML edit');
    }
  }

  const movedCount = countMovedTables(
    prev.tablePositions,
    next.tablePositions || {}
  );
  if (movedCount > 0) {
    parts.push(`Moved ${movedCount} ${movedCount === 1 ? 'table' : 'tables'}`);
    highlights.push(`Moved ${movedCount}`);
  }

  const groupMetaChanged = countGroupMetaChanges(
    prev.groupMeta,
    next.groupMeta || {}
  );
  if (groupMetaChanged > 0) {
    parts.push(
      `Updated ${groupMetaChanged} ${
        groupMetaChanged === 1 ? 'group' : 'groups'
      }`
    );
    highlights.push('Group state');
  }

  const stickyDelta = analyzeStickyDelta(
    prev.stickyNotes,
    next.stickyNotes || []
  );
  if (stickyDelta.added > 0) {
    parts.push(
      `+${stickyDelta.added} ${
        stickyDelta.added === 1 ? 'sticky note' : 'sticky notes'
      }`
    );
    highlights.push(`+${stickyDelta.added} Sticky`);
  }
  if (stickyDelta.removed > 0) {
    parts.push(
      `-${stickyDelta.removed} ${
        stickyDelta.removed === 1 ? 'sticky note' : 'sticky notes'
      }`
    );
    highlights.push(`-${stickyDelta.removed} Sticky`);
  }
  if (stickyDelta.edited > 0) {
    parts.push(
      `Edited ${stickyDelta.edited} ${
        stickyDelta.edited === 1 ? 'sticky note' : 'sticky notes'
      }`
    );
    highlights.push('Sticky edit');
  }

  if (prev.detailLevel !== next.detailLevel) {
    parts.push(`Detail: ${next.detailLevel}`);
    highlights.push(`Detail: ${next.detailLevel}`);
  }

  const hasChanges = parts.length > 0;
  return {
    hasChanges,
    summary: hasChanges ? parts.join(' · ') : 'No schema or layout changes',
    highlights: highlights.slice(0, 4),
  };
}

export function buildTabSafepoint(options: {
  workspace: WorkspaceProject;
  fromTab: ViewMode;
  toTab: ViewMode;
  reason: SafepointReason;
  previousSnapshot?: SafepointWorkspaceSnapshot | null;
  viewState?: SafepointViewState;
}): TabSafepoint {
  const { workspace, fromTab, toTab, reason, previousSnapshot, viewState } =
    options;
  const snapshot = extractWorkspaceSnapshot(workspace);
  const delta = previousSnapshot
    ? summarizeSafepointDelta(previousSnapshot, workspace)
    : {
        hasChanges: true,
        summary: 'Workspace checkpoint',
        highlights: ['Checkpoint'],
      };

  const parsed = parseDbml(workspace.dbml);

  return {
    id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    workspaceId: workspace.id,
    createdAt: new Date().toISOString(),
    fromTab,
    toTab,
    reason,
    summary:
      delta.hasChanges
        ? delta.summary
        : reason === 'manual'
        ? 'Manual safepoint pinned'
        : reason === 'pre-restore'
        ? 'Pre-restore backup safepoint'
        : 'Tab state checkpoint',
    highlights:
      delta.highlights.length > 0
        ? delta.highlights
        : [
            reason === 'manual'
              ? 'Pinned'
              : reason === 'pre-restore'
              ? 'Backup'
              : 'State',
          ],
    tableCount: parsed.tables.length,
    snapshot,
    viewState: {
      editorState: viewState?.editorState,
      selectedDomains: viewState?.selectedDomains
        ? [...viewState.selectedDomains]
        : undefined,
      selectedTableId: viewState?.selectedTableId,
      diagramViewport: viewState?.diagramViewport
        ? { ...viewState.diagramViewport }
        : undefined,
      docsSection: viewState?.docsSection
        ? { ...viewState.docsSection }
        : undefined,
      docsScrollTop: viewState?.docsScrollTop,
    },
  };
}

export function formatTabLabel(tab: ViewMode): string {
  if (tab === 'split') return 'Split';
  if (tab === 'diagram') return 'Diagram';
  return 'Docs';
}

export function formatSafepointBadge(sp: TabSafepoint): string {
  if (sp.reason === 'manual') {
    return `Pinned (${formatTabLabel(sp.fromTab)})`;
  }
  if (sp.reason === 'pre-restore') {
    return `Pre-restore (${formatTabLabel(sp.fromTab)})`;
  }
  return `${formatTabLabel(sp.fromTab)} → ${formatTabLabel(sp.toTab)}`;
}

export function isTabSafepointList(value: unknown): value is TabSafepoint[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const obj = item as Record<string, unknown>;
    return (
      typeof obj.id === 'string' &&
      typeof obj.workspaceId === 'string' &&
      typeof obj.createdAt === 'string' &&
      typeof obj.fromTab === 'string' &&
      typeof obj.toTab === 'string' &&
      typeof obj.summary === 'string' &&
      Boolean(obj.snapshot && typeof obj.snapshot === 'object')
    );
  });
}
