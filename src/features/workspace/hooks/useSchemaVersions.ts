import { useMemo } from 'react';
import { SidebarTab } from '../../sidebar/types';
import { SchemaVersion, WorkspaceProject } from '@shared/domain/schemaTypes';
import { computeAutoLayout } from '../../../utils/autoLayout';
import { parseDbml } from '@shared/domain/dbml';
import { splitDbmlIntoModuleFiles } from '../../../utils/schemaModules';
import { generateUniqueId } from '../../../utils/id';

interface UseSchemaVersionsOptions {
  activeWorkspace: WorkspaceProject | null;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  setFocusFit: () => void;
  setSaveVersionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarTab: React.Dispatch<React.SetStateAction<SidebarTab>>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string) => void;
}

export function useSchemaVersions({
  activeWorkspace,
  updateActiveWorkspace,
  setFocusFit,
  setSaveVersionOpen,
  setSidebarTab,
  setSidebarOpen,
  showToast,
}: UseSchemaVersionsOptions) {
  const suggestedVersionTag = useMemo(() => {
    const latest = activeWorkspace?.versions[0]?.tag;
    const m = latest?.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return 'v1.2.0';
    return `v${m[1]}.${Number(m[2]) + 1}.0`;
  }, [activeWorkspace?.versions]);

  const handleSaveVersion = (data: {
    tag: string;
    title: string;
    description: string;
    isPublished: boolean;
  }) => {
    if (!activeWorkspace) return;
    const newVer: SchemaVersion = {
      id: generateUniqueId('ver'),
      tag: data.tag,
      title: data.title,
      description: data.description,
      dbml: activeWorkspace.dbml,
      tablePositions: activeWorkspace.tablePositions,
      stickyNotes: activeWorkspace.stickyNotes,
      createdAt: new Date().toISOString(),
      isPublished: data.isPublished,
    };
    updateActiveWorkspace((ws) => ({
      ...ws,
      versions: [newVer, ...ws.versions],
    }));
    setSaveVersionOpen(false);
    setSidebarTab('versions');
    setSidebarOpen(true);
    showToast(`Saved snapshot ${data.tag}`);
  };

  const handleRestoreVersion = (ver: SchemaVersion) => {
    if (!activeWorkspace) return;
    const backup: SchemaVersion = {
      id: generateUniqueId('ver_backup'),
      tag: `backup-${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      title: `Pre-revert checkpoint (before ${ver.tag})`,
      description: 'Automatic snapshot created before reverting schema.',
      dbml: activeWorkspace.dbml,
      tablePositions: activeWorkspace.tablePositions,
      stickyNotes: activeWorkspace.stickyNotes,
      createdAt: new Date().toISOString(),
      isPublished: false,
    };
    updateActiveWorkspace((ws) => {
      const nextSchemaFiles =
        ws.schemaFiles && ws.schemaFiles.length > 0
          ? splitDbmlIntoModuleFiles(ver.dbml, ws.schemaFolder || 'schema')
          : undefined;
      return {
        ...ws,
        dbml: ver.dbml,
        schemaFiles: nextSchemaFiles,
        activeSchemaFile:
          nextSchemaFiles && nextSchemaFiles.length > 0
            ? nextSchemaFiles[0].path
            : undefined,
        tablePositions:
          Object.keys(ver.tablePositions).length > 0
            ? ver.tablePositions
            : computeAutoLayout(parseDbml(ver.dbml), ws.detailLevel),
        stickyNotes: ver.stickyNotes || ws.stickyNotes,
        versions: [backup, ...ws.versions],
      };
    });
    setFocusFit();
    showToast(`Reverted schema to ${ver.tag}`);
  };

  const handleTogglePublishVersion = (versionId: string) => {
    updateActiveWorkspace((ws) => ({
      ...ws,
      versions: ws.versions.map((v) =>
        v.id === versionId ? { ...v, isPublished: !v.isPublished } : v
      ),
    }));
  };

  return {
    suggestedVersionTag,
    handleSaveVersion,
    handleRestoreVersion,
    handleTogglePublishVersion,
  };
}
