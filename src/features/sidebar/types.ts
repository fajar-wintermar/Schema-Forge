import {
  ParsedSchema,
  SchemaVersion,
  TableGroupDef,
} from '@shared/domain/schemaTypes';

export type SidebarTab = 'domains' | 'versions' | 'changelog';

export interface SidebarProps {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  schema: ParsedSchema;
  currentDbml: string;
  versions: SchemaVersion[];
  selectedDomains: string[];
  onChangeSelectedDomains: (domains: string[]) => void;
  selectedTableId: string | null;
  onSelectTable: (tableId: string) => void;
  onFocusGroupOnCanvas: (groupName: string) => void;
  onCreateGroup: () => void;
  onEditGroup: (group: TableGroupDef) => void;
  onDeleteGroup: (groupName: string) => void;
  onAutoLayoutGroup: (groupName: string) => void;
  onMoveTableToGroup: (
    tableId: string,
    targetGroup: string | null,
    sourceGroup?: string | null,
    keepInSource?: boolean
  ) => void;
  onRemoveTableFromGroup: (tableId: string, groupName: string) => void;
  onReorderGroups: (orderedGroupNames: string[]) => void;
  onReorderTableInGroup: (groupName: string, orderedTables: string[]) => void;
  onSaveVersion: () => void;
  onRestoreVersion: (version: SchemaVersion) => void;
  onTogglePublishVersion: (versionId: string) => void;
}
