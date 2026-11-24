import React, { lazy, Suspense } from 'react';
import {
  CommandItem,
  CommandTargetView,
} from '../features/command/commandSearch';
import {
  CloudAuthStatusResponse,
  GithubFileLink,
  GithubRepoLink,
  ParsedSchema,
  SchemaModuleFile,
  TableGroupDef,
  ViewMode,
  WorkspaceProject,
} from '../types/schema';
import {
  GithubFileResult,
  GithubFolderResult,
  RemoteFetchResult,
} from '../utils/remoteService';
import { ErrorBoundary } from './ErrorBoundary';

const CommandPaletteModal = lazy(() =>
  import('../features/command/CommandPaletteModal').then((m) => ({
    default: m.CommandPaletteModal,
  }))
);
const GitHubModal = lazy(() =>
  import('../features/github/GitHubModal').then((m) => ({
    default: m.GitHubModal,
  }))
);
const OpenUrlModal = lazy(() =>
  import('./OpenUrlModal').then((m) => ({ default: m.OpenUrlModal }))
);
const TableGroupModal = lazy(() =>
  import('../features/workspace/modals/TableGroupModal').then((m) => ({
    default: m.TableGroupModal,
  }))
);
const SaveVersionModal = lazy(() =>
  import('../features/workspace/modals/SaveVersionModal').then((m) => ({
    default: m.SaveVersionModal,
  }))
);
const ImportExportModal = lazy(() =>
  import('../features/workspace/modals/ImportExportModal').then((m) => ({
    default: m.ImportExportModal,
  }))
);
const WorkspacesModal = lazy(() =>
  import('../features/workspace/modals/WorkspacesModal').then((m) => ({
    default: m.WorkspacesModal,
  }))
);
const ShortcutsModal = lazy(() =>
  import('../features/workspace/modals/ShortcutsModal').then((m) => ({
    default: m.ShortcutsModal,
  }))
);
const ShareModal = lazy(() =>
  import('../features/workspace/modals/ShareModal').then((m) => ({
    default: m.ShareModal,
  }))
);

interface AppModalsProps {
  activeWorkspace: WorkspaceProject;
  workspaces: WorkspaceProject[];
  parsedSchema: ParsedSchema;
  allTableIds: string[];
  effectiveSelectedDomains: string[];
  activeSchemaFolder?: string;
  suggestedVersionTag: string;
  cloudAuth: CloudAuthStatusResponse | null;
  viewMode: ViewMode;
  darkMode: boolean;
  modKey: string;

  groupModalState: { open: boolean; group: TableGroupDef | null };
  saveVersionOpen: boolean;
  importExportOpen: boolean;
  workspacesModalOpen: boolean;
  shareModalOpen: boolean;
  shortcutsOpen: boolean;
  openUrlOpen: boolean;
  githubModalOpen: boolean;
  commandPaletteOpen: boolean;

  onCloseGroupModal: () => void;
  onSaveGroupModal: (data: {
    name: string;
    color: string;
    note: string;
    tables: string[];
    oldName?: string;
  }) => void;
  onCloseSaveVersion: () => void;
  onSaveVersion: (data: {
    tag: string;
    title: string;
    description: string;
    isPublished: boolean;
  }) => void;
  onCloseImportExport: () => void;
  onImportDbml: (dbml: string, openInNewWorkspace: boolean, nameHint?: string) => void;
  onLoadUrlResult: (res: RemoteFetchResult, openInNewWorkspace: boolean) => void;
  onCloseOpenUrl: () => void;
  onCloseGithubModal: () => void;
  onLoadGithubFile: (file: GithubFileResult, openInNewWorkspace: boolean) => void;
  onSyncedGithubFile: (meta: GithubFileLink, dbml?: string) => void;
  onLoadGithubFolder: (folderResult: GithubFolderResult, openInNewWorkspace: boolean) => void;
  onSyncedGithubFolder: (
    repoLink: GithubRepoLink,
    files: SchemaModuleFile[],
    replaceWorkspaceContent?: boolean
  ) => void;
  onCloseWorkspacesModal: () => void;
  onSelectWorkspace: (id: string) => void;
  onCreateBlankWorkspace: (name: string) => void;
  onLoadSampleTelemetry: () => void;
  onCreateModularWorkspace: () => void;
  onDeleteWorkspace: (id: string) => void;
  onConnectCloudAccount: () => Promise<void>;
  onLogoutCloudAccount: () => Promise<void>;
  onSyncWorkspaceToCloud: (id?: string) => Promise<WorkspaceProject | null>;
  onSyncAllLocalWorkspacesToCloud: () => Promise<number>;
  onRefreshCloudSync: () => Promise<void>;
  onCloseShareModal: () => void;
  onOpenPreviewShare: (token: string, pinnedVersionTag?: string | null) => void;
  onCloseCommandPalette: () => void;
  onSelectCommand: (item: CommandItem, target?: CommandTargetView) => void;
  onCloseShortcuts: () => void;
  onShowToast: (msg: string) => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  activeWorkspace,
  workspaces,
  parsedSchema,
  allTableIds,
  effectiveSelectedDomains,
  activeSchemaFolder,
  suggestedVersionTag,
  cloudAuth,
  viewMode,
  darkMode,
  modKey,
  groupModalState,
  saveVersionOpen,
  importExportOpen,
  workspacesModalOpen,
  shareModalOpen,
  shortcutsOpen,
  openUrlOpen,
  githubModalOpen,
  commandPaletteOpen,
  onCloseGroupModal,
  onSaveGroupModal,
  onCloseSaveVersion,
  onSaveVersion,
  onCloseImportExport,
  onImportDbml,
  onLoadUrlResult,
  onCloseOpenUrl,
  onCloseGithubModal,
  onLoadGithubFile,
  onSyncedGithubFile,
  onLoadGithubFolder,
  onSyncedGithubFolder,
  onCloseWorkspacesModal,
  onSelectWorkspace,
  onCreateBlankWorkspace,
  onLoadSampleTelemetry,
  onCreateModularWorkspace,
  onDeleteWorkspace,
  onConnectCloudAccount,
  onLogoutCloudAccount,
  onSyncWorkspaceToCloud,
  onSyncAllLocalWorkspacesToCloud,
  onRefreshCloudSync,
  onCloseShareModal,
  onOpenPreviewShare,
  onCloseCommandPalette,
  onSelectCommand,
  onCloseShortcuts,
  onShowToast,
}) => (
  <ErrorBoundary
    compact
    title="Unable to render dialog"
    resetKeys={[
      activeWorkspace.id,
      groupModalState.open,
      saveVersionOpen,
      importExportOpen,
      workspacesModalOpen,
      shareModalOpen,
      shortcutsOpen,
      openUrlOpen,
      githubModalOpen,
      commandPaletteOpen,
    ]}
    onReset={() => {
      onCloseGroupModal();
      onCloseSaveVersion();
      onCloseImportExport();
      onCloseWorkspacesModal();
      onCloseShareModal();
      onCloseShortcuts();
      onCloseOpenUrl();
      onCloseGithubModal();
      onCloseCommandPalette();
    }}
  >
    <Suspense fallback={null}>
      {groupModalState.open && (
        <TableGroupModal
          initialGroup={groupModalState.group}
          allTableIds={allTableIds}
          onClose={onCloseGroupModal}
          onSave={onSaveGroupModal}
        />
      )}

      {saveVersionOpen && (
        <SaveVersionModal
          suggestedTag={suggestedVersionTag}
          onClose={onCloseSaveVersion}
          onSave={onSaveVersion}
        />
      )}

      {importExportOpen && (
        <ImportExportModal
          projectName={activeWorkspace.name}
          dbml={activeWorkspace.dbml}
          schema={parsedSchema}
          positions={activeWorkspace.tablePositions}
          detailLevel={activeWorkspace.detailLevel}
          stickyNotes={activeWorkspace.stickyNotes}
          selectedDomains={effectiveSelectedDomains}
          darkMode={darkMode}
          onImportDbml={(nextDbml) => onImportDbml(nextDbml, false)}
          onImportUrlResult={(res) => onLoadUrlResult(res, false)}
          onClose={onCloseImportExport}
        />
      )}

      {openUrlOpen && (
        <OpenUrlModal
          currentUrlLink={activeWorkspace.urlLink}
          onLoadUrlResult={onLoadUrlResult}
          onClose={onCloseOpenUrl}
        />
      )}

      {githubModalOpen && (
        <GitHubModal
          workspace={activeWorkspace}
          onLoadGithubFile={onLoadGithubFile}
          onSyncedGithubFile={onSyncedGithubFile}
          onLoadGithubFolder={onLoadGithubFolder}
          onSyncedGithubFolder={onSyncedGithubFolder}
          onClose={onCloseGithubModal}
        />
      )}

      {workspacesModalOpen && (
        <WorkspacesModal
          workspaces={workspaces}
          activeId={activeWorkspace.id}
          cloudAuth={cloudAuth}
          onSelectWorkspace={onSelectWorkspace}
          onCreateBlank={onCreateBlankWorkspace}
          onLoadSampleTelemetry={onLoadSampleTelemetry}
          onCreateModularProject={onCreateModularWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          onConnectCloud={onConnectCloudAccount}
          onLogoutCloud={onLogoutCloudAccount}
          onSyncWorkspace={(id) => onSyncWorkspaceToCloud(id)}
          onSyncAllLocal={onSyncAllLocalWorkspacesToCloud}
          onClose={onCloseWorkspacesModal}
        />
      )}

      {shareModalOpen && (
        <ShareModal
          workspace={activeWorkspace}
          cloudAuth={cloudAuth}
          onConnectCloud={async () => {
            await onConnectCloudAccount();
            await onRefreshCloudSync();
          }}
          onSyncWorkspaceToCloud={() => onSyncWorkspaceToCloud(activeWorkspace.id)}
          onOpenPreviewShare={onOpenPreviewShare}
          onClose={onCloseShareModal}
          onShowToast={onShowToast}
        />
      )}

      {commandPaletteOpen && (
        <CommandPaletteModal
          open={commandPaletteOpen}
          schema={parsedSchema}
          stickyNotes={activeWorkspace.stickyNotes}
          schemaFiles={activeWorkspace.schemaFiles}
          schemaFolder={activeSchemaFolder}
          viewMode={viewMode}
          modKey={modKey}
          onClose={onCloseCommandPalette}
          onSelectCommand={onSelectCommand}
        />
      )}

      {shortcutsOpen && (
        <ShortcutsModal modKey={modKey} onClose={onCloseShortcuts} />
      )}
    </Suspense>
  </ErrorBoundary>
);
