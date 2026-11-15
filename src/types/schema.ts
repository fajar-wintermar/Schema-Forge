export type DetailLevel = 'full' | 'columns' | 'keys' | 'names';

export type ViewMode = 'split' | 'diagram' | 'docs';

export type RefRelation = '>' | '<' | '-' | '<>';

export interface ColumnDef {
  name: string;
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  defaultValue?: string;
  note?: string;
  line?: number;
}

export interface IndexDef {
  columns: string[];
  name?: string;
  unique?: boolean;
  pk?: boolean;
  type?: string;
  note?: string;
}

export interface TableDef {
  id: string; // schema.name or name
  schema?: string;
  name: string;
  alias?: string;
  headerColor?: string;
  note?: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  line?: number;
}

export interface RefDef {
  id: string;
  name?: string;
  fromTable: string;
  fromColumns: string[];
  relation: RefRelation;
  toTable: string;
  toColumns: string[];
  onDelete?: string;
  onUpdate?: string;
  line?: number;
}

export interface EnumValueDef {
  name: string;
  note?: string;
}

export interface EnumDef {
  id: string;
  schema?: string;
  name: string;
  values: EnumValueDef[];
  line?: number;
}

export interface TableGroupDef {
  id: string;
  name: string;
  color?: string;
  note?: string;
  tables: string[]; // table IDs
  line?: number;
}

export interface ProjectMeta {
  name?: string;
  databaseType?: string;
  note?: string;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParsedSchema {
  project: ProjectMeta;
  tables: TableDef[];
  refs: RefDef[];
  enums: EnumDef[];
  tableGroups: TableGroupDef[];
  errors: ParseError[];
}

export interface TablePosition {
  x: number;
  y: number;
}

export type StickyNoteColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'slate';

export interface StickyNote {
  id: string;
  x: number;
  y: number;
  width: number;
  color: StickyNoteColor;
  title: string;
  content: string;
  author: string;
  updatedAt: string;
  linkedTarget?: string; // e.g. "table:orders" or "group:Order Fulfillment"
  collapsed?: boolean;
}

export interface GroupCustomMeta {
  description?: string;
  collapsed?: boolean;
}

export interface SchemaVersion {
  id: string;
  tag: string;
  title: string;
  description: string;
  dbml: string;
  tablePositions: Record<string, TablePosition>;
  stickyNotes: StickyNote[];
  createdAt: string;
  isPublished: boolean;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  description: string;
  dbml: string;
  tablePositions: Record<string, TablePosition>;
  groupMeta: Record<string, GroupCustomMeta>;
  stickyNotes: StickyNote[];
  detailLevel: DetailLevel;
  versions: SchemaVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ColumnDiff {
  name: string;
  status: 'added' | 'removed' | 'modified';
  changes: string[];
  before?: ColumnDef;
  after?: ColumnDef;
}

export interface TableDiff {
  tableId: string;
  status: 'added' | 'removed' | 'modified';
  groupNames?: string[];
  headerColorChanged?: { from?: string; to?: string };
  noteChanged?: { from?: string; to?: string };
  columnDiffs: ColumnDiff[];
}

export interface RefDiff {
  id: string;
  label: string;
  status: 'added' | 'removed' | 'modified';
  detail?: string;
}

export interface GroupDiff {
  name: string;
  status: 'added' | 'removed' | 'modified';
  addedTables: string[];
  removedTables: string[];
  colorChanged?: { from?: string; to?: string };
  noteChanged?: { from?: string; to?: string };
}

export interface EnumDiff {
  name: string;
  status: 'added' | 'removed' | 'modified';
  addedValues: string[];
  removedValues: string[];
}

export interface LineDiffEntry {
  type: 'context' | 'added' | 'removed';
  lineA?: number;
  lineB?: number;
  text: string;
}

export interface SchemaDiffResult {
  tables: TableDiff[];
  refs: RefDiff[];
  groups: GroupDiff[];
  enums: EnumDiff[];
  lineDiff: LineDiffEntry[];
  summary: {
    tablesAdded: number;
    tablesRemoved: number;
    tablesModified: number;
    columnsChanged: number;
    refsChanged: number;
    groupsChanged: number;
  };
}
