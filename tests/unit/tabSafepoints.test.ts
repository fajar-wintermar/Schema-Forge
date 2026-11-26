import { describe, expect, it } from 'vitest';
import { WorkspaceProject } from '@shared/domain/schemaTypes';
import {
  buildTabSafepoint,
  extractWorkspaceSnapshot,
  formatSafepointBadge,
  isTabSafepointList,
  summarizeSafepointDelta,
} from '../../src/utils/tabSafepoints';

function makeWorkspace(
  overrides: Partial<WorkspaceProject> = {}
): WorkspaceProject {
  return {
    id: 'ws_test',
    name: 'Test Workspace',
    description: '',
    dbml: `Table users {\n  id uuid [pk]\n  email varchar\n}\n`,
    tablePositions: {
      users: { x: 40, y: 60 },
    },
    groupMeta: {},
    stickyNotes: [],
    detailLevel: 'full',
    versions: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Tab Safepoints utility', () => {
  it('reports no changes when workspace matches the baseline snapshot', () => {
    const ws = makeWorkspace();
    const baseline = extractWorkspaceSnapshot(ws);
    const delta = summarizeSafepointDelta(baseline, ws);

    expect(delta.hasChanges).toBe(false);
    expect(delta.summary).toBe('No schema or layout changes');
  });

  it('summarizes DBML edits, moved tables, sticky notes, and detail level changes', () => {
    const initial = makeWorkspace();
    const baseline = extractWorkspaceSnapshot(initial);

    const modified = makeWorkspace({
      dbml: `${initial.dbml}\nTable orders {\n  id uuid [pk]\n}\n`,
      tablePositions: {
        users: { x: 220, y: 140 },
        orders: { x: 480, y: 140 },
      },
      stickyNotes: [
        {
          id: 'sn_1',
          x: 100,
          y: 100,
          width: 220,
          color: 'amber',
          title: 'Review FK',
          content: 'Verify customer FK before release',
          author: 'dev',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      ],
      detailLevel: 'keys',
    });

    const delta = summarizeSafepointDelta(baseline, modified);
    expect(delta.hasChanges).toBe(true);
    expect(delta.summary).toContain('+1 table');
    expect(delta.summary).toContain('Moved 2 tables');
    expect(delta.summary).toContain('+1 sticky note');
    expect(delta.summary).toContain('Detail: keys');
  });

  it('deep-clones snapshot state so subsequent edits do not mutate saved safepoints', () => {
    const ws = makeWorkspace();
    const sp = buildTabSafepoint({
      workspace: ws,
      fromTab: 'split',
      toTab: 'docs',
      reason: 'tab-switch',
      viewState: {
        diagramViewport: { x: 120, y: 80, zoom: 1.1 },
        docsSection: { kind: 'table', tableId: 'users' },
        docsScrollTop: 240,
      },
    });

    ws.tablePositions.users.x = 999;
    ws.dbml = 'Table wiped { id int }';

    expect(sp.snapshot.tablePositions.users.x).toBe(40);
    expect(sp.snapshot.dbml).toContain('Table users');
    expect(sp.viewState.diagramViewport).toEqual({ x: 120, y: 80, zoom: 1.1 });
    expect(formatSafepointBadge(sp)).toBe('Split → Docs');
    expect(isTabSafepointList([sp])).toBe(true);
    expect(isTabSafepointList([{ invalid: true }])).toBe(false);
  });
});
