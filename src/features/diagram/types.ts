import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  StickyNoteColor,
  TableGroupDef,
  TablePosition,
} from '@shared/domain/schemaTypes';
import { ResolvedEdge } from '../../utils/autoLayout';

export interface DiagramCanvasProps {
  schema: ParsedSchema;
  positions: Record<string, TablePosition>;
  onUpdatePositions: (next: Record<string, TablePosition>) => void;
  detailLevel: DetailLevel;
  onChangeDetailLevel: (level: DetailLevel) => void;
  selectedDomains: string[];
  onChangeSelectedDomains: (domains: string[]) => void;
  selectedTableId: string | null;
  highlightedColumn?: { tableId: string; columnName: string } | null;
  onSelectTable: (tableId: string | null) => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
  onAssignTableToGroup: (
    tableId: string,
    targetGroup: string,
    sourceGroup?: string | null,
    keepInSource?: boolean
  ) => void;
  onEditGroup: (group: TableGroupDef) => void;
  onAutoLayout: () => void;
  onAutoLayoutGroup: (groupName: string) => void;
  stickyNotes: StickyNote[];
  onAddStickyNote: (x: number, y: number) => void;
  onUpdateStickyNote: (id: string, patch: Partial<StickyNote>) => void;
  onDeleteStickyNote: (id: string) => void;
  focusRequest: {
    type: 'table' | 'group' | 'fit';
    id?: string;
    nonce: number;
  } | null;
  darkMode: boolean;
  readOnly?: boolean;
  onResetLayout?: () => void;
  hasCustomLayout?: boolean;
  onCreateRef?: (
    fromTableId: string,
    fromCol: string,
    toTableId: string,
    toCol: string
  ) => void;
  collapsedGroups?: string[];
  onToggleGroupCollapse?: (groupName: string) => void;
  onSetAllGroupsCollapsed?: (collapsed: boolean) => void;
  initialViewport?: ViewportState;
  viewportRestoreRequest?: { viewport: ViewportState; nonce: number } | null;
  onViewportChange?: (viewport: ViewportState) => void;
}

export type CursorMode = 'select' | 'marquee' | 'pan';
export type EdgeRoutingMode = 'bezier' | 'orthogonal';
export type CrossDomainEdgeMode = 'show' | 'bundle' | 'hide';

export interface CrossDomainBundle {
  id: string;
  domainA: string;
  domainB: string;
  color: string;
  edges: ResolvedEdge[];
}

export const CURSOR_MODE_STORAGE_KEY = 'schemaforge_diagram_cursor_mode';
export const EDGE_ROUTING_STORAGE_KEY = 'schemaforge_diagram_edge_routing';
export const CROSS_DOMAIN_EDGE_STORAGE_KEY =
  'schemaforge_diagram_cross_domain_edges';
export const FOCUS_MODE_STORAGE_KEY = 'schemaforge_diagram_focus_mode';
export const AUTO_LOD_STORAGE_KEY = 'schemaforge_diagram_auto_lod';
export const FK_CARDINALITY_STORAGE_KEY =
  'schemaforge_diagram_show_cardinality';
export const LAYOUT_LOCKED_STORAGE_KEY = 'schemaforge_diagram_layout_locked';

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export type DragState =
  | { type: 'pan'; startX: number; startY: number; origX: number; origY: number }
  | {
      type: 'table';
      posKey: string;
      tableId: string;
      startX: number;
      startY: number;
      origPos: TablePosition;
      origGroup: string | null;
    }
  | {
      type: 'multi-table';
      posKeys: string[];
      startX: number;
      startY: number;
      origPositions: Record<string, TablePosition>;
    }
  | {
      type: 'group';
      groupName: string;
      posKeys: string[];
      startX: number;
      startY: number;
      origPositions: Record<string, TablePosition>;
    }
  | {
      type: 'marquee';
      startWorldX: number;
      startWorldY: number;
      currentWorldX: number;
      currentWorldY: number;
      additive: boolean;
      initialSelected: string[];
    }
  | {
      type: 'connect-fk';
      fromPosKey: string;
      fromTableId: string;
      fromCol: string;
      startWorldX: number;
      startWorldY: number;
      currentWorldX: number;
      currentWorldY: number;
    }
  | {
      type: 'note';
      noteId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | null;

export const HEADER_SWATCHES = [
  '#0f172a',
  '#1e3a8a',
  '#0369a1',
  '#065f46',
  '#9a3412',
  '#5b21b6',
  '#9f1239',
  '#374151',
];

export const NOTE_STYLES: Record<
  StickyNoteColor,
  { bg: string; border: string; header: string; text: string }
> = {
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/80',
    border: 'border-amber-300 dark:border-amber-700',
    header: 'bg-amber-100/80 dark:bg-amber-900/50',
    text: 'text-amber-950 dark:text-amber-100',
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-950/80',
    border: 'border-sky-300 dark:border-sky-700',
    header: 'bg-sky-100/80 dark:bg-sky-900/50',
    text: 'text-sky-950 dark:text-sky-100',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/80',
    border: 'border-emerald-300 dark:border-emerald-700',
    header: 'bg-emerald-100/80 dark:bg-emerald-900/50',
    text: 'text-emerald-950 dark:text-emerald-100',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-950/80',
    border: 'border-rose-300 dark:border-rose-700',
    header: 'bg-rose-100/80 dark:bg-rose-900/50',
    text: 'text-rose-950 dark:text-rose-100',
  },
  slate: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    header: 'bg-slate-200/70 dark:bg-slate-700/60',
    text: 'text-slate-900 dark:text-slate-100',
  },
};
