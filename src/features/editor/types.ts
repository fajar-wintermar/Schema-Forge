import { ParseError, SchemaModuleFile, TableDef } from '../../types/schema';

export interface DbmlEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: ParseError[];
  scrollToLine?: number | null;
  enumNames?: string[];
  tables?: TableDef[];
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  modKey?: string;
  schemaFiles?: SchemaModuleFile[];
  activeFilePath?: string;
  schemaFolder?: string;
  allErrorsByFile?: Record<string, ParseError[]>;
  onSelectFile?: (path: string) => void;
  onCreateFile?: (path: string, content: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDeleteFile?: (path: string) => void;
  onEnableModularMode?: () => void;
  onFlattenToSingleFile?: () => void;
  onJumpToMergedLine?: (mergedLine: number) => void;
}

export interface SchemaTreeFolderNode {
  kind: 'folder';
  name: string;
  path: string;
  children: SchemaTreeNode[];
  fileCount: number;
  errorCount: number;
}

export interface SchemaTreeFileNode {
  kind: 'file';
  name: string;
  path: string;
  file: SchemaModuleFile;
  matchedTables: string[];
}

export type SchemaTreeNode = SchemaTreeFolderNode | SchemaTreeFileNode;

export interface AutocompleteItem {
  label: string;
  insertText: string;
  kind: 'keyword' | 'type' | 'enum' | 'table' | 'column' | 'setting' | 'snippet';
  detail?: string;
  cursorOffsetBack?: number;
}

export interface HighlightSegment {
  text: string;
  className: string;
}
