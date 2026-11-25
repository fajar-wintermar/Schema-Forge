import React, { lazy, Suspense } from 'react';
import { DiagramCanvas } from '../features/diagram/DiagramCanvas';
import type { DocsSection } from '../features/docs/types';
import { DbmlEditor } from '../features/editor/DbmlEditor';
import { DbmlEditorProps } from '../features/editor/types';
import {
  DetailLevel,
  ParsedSchema,
  StickyNote,
  TableGroupDef,
  TablePosition,
  ViewMode,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { AsyncLoadingState } from './AsyncStateView';
import { ErrorBoundary } from './ErrorBoundary';
import { MinimizedEditorRail } from './MinimizedEditorRail';

const DocsView = lazy(() =>
  import('../features/docs/DocsView').then((m) => ({ default: m.DocsView }))
);

interface WorkspaceViewportProps {
  workspace: WorkspaceProject;
  parsedSchema: ParsedSchema;
  viewMode: ViewMode;
  editorState: 'normal' | 'maximized' | 'minimized';
  editorWidth: number;
  startSplitResize: (e: React.PointerEvent) => void;
  onChangeEditorState: (state: 'normal' | 'maximized' | 'minimized') => void;
  editorBaseProps: Omit<
    DbmlEditorProps,
    'isMaximized' | 'onToggleMaximize' | 'onMinimize'
  >;
  isModular: boolean;
  activeSchemaFilePath?: string;
  modKey: string;
  darkMode: boolean;

  docsNavOpen: boolean;
  onToggleDocsNav: () => void;
  docsSectionRequest: { section: DocsSection; nonce: number } | null;
  onSelectTableFromDocs: (tableId: string) => void;

  effectiveSelectedDomains: string[];
  selectedTableId: string | null;
  highlightedColumn: { tableId: string; columnName: string } | null;
  focusRequest: {
    type: 'table' | 'group' | 'fit';
    id?: string;
    nonce: number;
  } | null;
  onUpdatePositions: (next: Record<string, TablePosition>) => void;
  onChangeDetailLevel: (level: DetailLevel) => void;
  onChangeSelectedDomains: (domains: string[]) => void;
  onSelectTableOnCanvas: (tableId: string | null) => void;
  onChangeTableHeaderColor: (tableId: string, color: string | null) => void;
  onAssignTableToGroup: (
    tableId: string,
    targetGroupName: string | null,
    sourceGroupName?: string | null,
    keepInSource?: boolean
  ) => void;
  onEditGroup: (group: TableGroupDef) => void;
  onAutoLayout: () => void;
  onAutoLayoutGroup: (groupName: string) => void;
  onAddStickyNote: (x: number, y: number) => void;
  onUpdateStickyNote: (id: string, patch: Partial<StickyNote>) => void;
  onDeleteStickyNote: (id: string) => void;
  onCreateRef: (
    fromTable: string,
    fromCol: string,
    toTable: string,
    toCol: string
  ) => void;
}

export const WorkspaceViewport: React.FC<WorkspaceViewportProps> = ({
  workspace,
  parsedSchema,
  viewMode,
  editorState,
  editorWidth,
  startSplitResize,
  onChangeEditorState,
  editorBaseProps,
  isModular,
  activeSchemaFilePath,
  modKey,
  darkMode,
  docsNavOpen,
  onToggleDocsNav,
  docsSectionRequest,
  onSelectTableFromDocs,
  effectiveSelectedDomains,
  selectedTableId,
  highlightedColumn,
  focusRequest,
  onUpdatePositions,
  onChangeDetailLevel,
  onChangeSelectedDomains,
  onSelectTableOnCanvas,
  onChangeTableHeaderColor,
  onAssignTableToGroup,
  onEditGroup,
  onAutoLayout,
  onAutoLayoutGroup,
  onAddStickyNote,
  onUpdateStickyNote,
  onDeleteStickyNote,
  onCreateRef,
}) => {
  if (viewMode === 'docs') {
    return (
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
        <ErrorBoundary
          title="Documentation view crashed"
          description="Could not render schema documentation for the current state."
          resetKeys={[workspace.id, viewMode]}
        >
          <Suspense
            fallback={
              <AsyncLoadingState
                message="Loading documentation..."
                className="flex-1"
              />
            }
          >
            <DocsView
              schema={parsedSchema}
              stickyNotes={workspace.stickyNotes}
              navOpen={docsNavOpen}
              onToggleNav={onToggleDocsNav}
              modKey={modKey}
              sectionRequest={docsSectionRequest}
              onSelectTable={onSelectTableFromDocs}
            />
          </Suspense>
        </ErrorBoundary>
      </main>
    );
  }

  if (viewMode === 'split' && editorState === 'maximized') {
    return (
      <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
        <div className="flex-1 w-full h-full min-w-0 flex overflow-hidden">
          <ErrorBoundary
            title="DBML Editor encountered an error"
            resetKeys={[workspace.id, activeSchemaFilePath, editorState]}
          >
            <DbmlEditor
              {...editorBaseProps}
              isMaximized={true}
              onToggleMaximize={() => onChangeEditorState('normal')}
              onMinimize={() => onChangeEditorState('minimized')}
            />
          </ErrorBoundary>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
      {viewMode === 'split' && editorState === 'minimized' && (
        <MinimizedEditorRail
          modKey={modKey}
          isModular={isModular}
          activeSchemaFilePath={activeSchemaFilePath}
          errorCount={parsedSchema.errors.length}
          onRestore={() => onChangeEditorState('normal')}
          onMaximize={() => onChangeEditorState('maximized')}
        />
      )}

      {viewMode === 'split' && editorState === 'normal' && (
        <>
          <div
            style={{ width: editorWidth }}
            className="shrink-0 min-w-0 h-full hidden md:flex overflow-hidden"
          >
            <ErrorBoundary
              compact
              title="DBML Editor encountered an error"
              resetKeys={[workspace.id, activeSchemaFilePath, editorState]}
            >
              <DbmlEditor
                {...editorBaseProps}
                isMaximized={false}
                onToggleMaximize={() => onChangeEditorState('maximized')}
                onMinimize={() => onChangeEditorState('minimized')}
              />
            </ErrorBoundary>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize code editor"
            onPointerDown={startSplitResize}
            title="Drag to resize editor"
            className="relative z-20 w-2 -mx-1 shrink-0 hidden md:flex items-center justify-center cursor-col-resize select-none touch-none group"
          >
            <div className="w-0.5 h-full bg-transparent group-hover:bg-blue-500/60 group-active:bg-blue-500 transition-colors" />
          </div>
        </>
      )}

      <ErrorBoundary
        title="Diagram Canvas encountered an error"
        description="A rendering error occurred in the ER diagram canvas."
        resetKeys={[workspace.id, viewMode, workspace.detailLevel]}
      >
        <DiagramCanvas
          schema={parsedSchema}
          positions={workspace.tablePositions}
          onUpdatePositions={onUpdatePositions}
          detailLevel={workspace.detailLevel}
          onChangeDetailLevel={onChangeDetailLevel}
          selectedDomains={effectiveSelectedDomains}
          onChangeSelectedDomains={onChangeSelectedDomains}
          selectedTableId={selectedTableId}
          highlightedColumn={highlightedColumn}
          onSelectTable={onSelectTableOnCanvas}
          onChangeTableHeaderColor={onChangeTableHeaderColor}
          onAssignTableToGroup={onAssignTableToGroup}
          onEditGroup={onEditGroup}
          onAutoLayout={onAutoLayout}
          onAutoLayoutGroup={onAutoLayoutGroup}
          stickyNotes={workspace.stickyNotes}
          onAddStickyNote={onAddStickyNote}
          onUpdateStickyNote={onUpdateStickyNote}
          onDeleteStickyNote={onDeleteStickyNote}
          onCreateRef={onCreateRef}
          focusRequest={focusRequest}
          darkMode={darkMode}
        />
      </ErrorBoundary>
    </main>
  );
};
