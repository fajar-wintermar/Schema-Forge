import { ParseError, SchemaModuleFile, TableDef } from '@shared/domain/schemaTypes';
import { SchemaLintIssue, SchemaLintResult } from '../../utils/schemaLinter';

export interface DbmlEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: ParseError[];
  lintResult?: SchemaLintResult;
  onJumpToLintIssue?: (issue: SchemaLintIssue) => void;
  scrollToLine?: number | null;
  enumNames?: string[];
  partialNames?: string[];
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
