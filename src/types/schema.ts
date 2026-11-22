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
  check?: string;
  checkName?: string;
  fromPartial?: string;
  line?: number;
}

export interface IndexColumnItem {
  value: string;
  isExpression: boolean;
}

export interface IndexDef {
  columns: string[];
  items?: IndexColumnItem[];
  name?: string;
  unique?: boolean;
  pk?: boolean;
  type?: string;
  note?: string;
  line?: number;
}

export interface CheckDef {
  name?: string;
  expression: string;
  note?: string;
  line?: number;
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
  checks: CheckDef[];
  appliedPartials?: string[];
  line?: number;
}

export interface TablePartialDef {
  id: string;
  name: string;
  headerColor?: string;
  note?: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
  checks: CheckDef[];
  appliedPartials?: string[];
  settings?: Record<string, string>;
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
  color?: string;
  settings?: Record<string, string>;
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

export interface SchemaNoteDef {
  id: string;
  name: string;
  content: string;
  line?: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParsedSchema {
  project: ProjectMeta;
  tables: TableDef[];
  tablePartials: TablePartialDef[];
  refs: RefDef[];
  enums: EnumDef[];
  tableGroups: TableGroupDef[];
  notes: SchemaNoteDef[];
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

export interface GithubFileLink {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string;
  htmlUrl?: string;
  lastSyncedDbml: string;
  lastSyncedAt: string;
}

export interface GithubRepoLink {
  owner: string;
  repo: string;
  branch: string;
  schemaFolder: string; // e.g. "schema" or "db/schema"
  lastSyncedAt: string;
}

export interface SchemaModuleFile {
  id: string;
  path: string; // e.g. "schema/users.dbml" or "db/schema/orders.dbml"
  content: string;
  sha?: string;
  lastSyncedContent?: string;
  lastSyncedAt?: string;
}

export interface UrlFileLink {
  url: string;
  resolvedUrl?: string;
  loadedAt: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  description: string;
  dbml: string;
  schemaFiles?: SchemaModuleFile[];
  activeSchemaFile?: string; // file.path or "__merged__"
  schemaFolder?: string; // default "schema" or "db/schema"
  tablePositions: Record<string, TablePosition>;
  groupMeta: Record<string, GroupCustomMeta>;
  stickyNotes: StickyNote[];
  detailLevel: DetailLevel;
  versions: SchemaVersion[];
  githubLink?: GithubFileLink;
  githubRepoLink?: GithubRepoLink;
  urlLink?: UrlFileLink;
  createdAt: string;
  updatedAt: string;
  syncOrigin?: 'local' | 'cloud';
  cloudSyncedAt?: string;
  cloudRevision?: number;
}

export interface CloudUser {
  id: string;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface CloudAuthStatusResponse {
  cloudEnabled: boolean;
  githubConfigured: boolean;
  authenticated: boolean;
  user: CloudUser | null;
  callbackUrl: string;
}

export type CloudSyncStatus =
  | 'local'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface ShareLinkRecord {
  id: string;
  token: string;
  workspaceId: string;
  label: string;
  pinnedVersionTag: string | null;
  defaultView: 'docs' | 'diagram';
  allowDiagramExport: boolean;
  createdByLogin: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface SharedWorkspacePayload {
  share: {
    id: string;
    token: string;
    label: string;
    pinnedVersionTag: string | null;
    activeVersionTag: string | null;
    defaultView: 'docs' | 'diagram';
    allowDiagramExport: boolean;
    workspaceName: string;
    workspaceDescription: string;
    updatedAt: string;
    createdByLogin: string;
  };
  content: {
    parsedSchema: ParsedSchema;
    tablePositions: Record<string, TablePosition>;
    stickyNotes: StickyNote[];
    detailLevel: DetailLevel;
    groupMeta: Record<string, GroupCustomMeta>;
  };
  publishedVersions: Array<{
    id: string;
    tag: string;
    title: string;
    description: string;
    createdAt: string;
  }>;
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
