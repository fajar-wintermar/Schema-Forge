import {
  GithubFileLink,
  GithubRepoLink,
  SchemaModuleFile,
  UrlFileLink,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import { computeAutoLayout } from '../../../utils/autoLayout';
import { parseDbml } from '@shared/domain/dbml';
import {
  GithubFileResult,
  GithubFolderResult,
  RemoteFetchResult,
} from '../../../services/api/remoteService';
import {
  createModularStarterWorkspace,
  createSaaSTelemetryWorkspace,
} from '../../../utils/sampleSchemas';
import {
  MERGED_SCHEMA_VIEW_ID,
  mergeSchemaFiles,
  splitDbmlIntoModuleFiles,
} from '../../../utils/schemaModules';
import { parseWorkspaceLayoutJson } from '../../../utils/layoutSync';

interface UseRemoteWorkspaceSyncOptions {
  activeWorkspace: WorkspaceProject | null;
  updateActiveWorkspace: (
    updater: (prev: WorkspaceProject) => WorkspaceProject
  ) => void;
  addAndSelectWorkspace: (ws: WorkspaceProject) => Promise<void>;
  setFocusFit: () => void;
  setEditorWidth: React.Dispatch<React.SetStateAction<number>>;
  setWorkspacesModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showToast: (msg: string) => void;
}

export function useRemoteWorkspaceSync({
  activeWorkspace,
  updateActiveWorkspace,
  addAndSelectWorkspace,
  setFocusFit,
  setEditorWidth,
  setWorkspacesModalOpen,
  showToast,
}: UseRemoteWorkspaceSyncOptions) {
  const handleImportDbml = (nextDbml: string) => {
    if (!activeWorkspace) return;
    const nextParsed = parseDbml(nextDbml);
    const nextPos = computeAutoLayout(nextParsed, activeWorkspace.detailLevel);
    updateActiveWorkspace((ws) => {
      if (ws.schemaFiles && ws.schemaFiles.length > 0) {
        const folder = ws.schemaFolder || 'schema';
        const nextFiles = splitDbmlIntoModuleFiles(nextDbml, folder);
        const merged = mergeSchemaFiles(nextFiles, { schemaFolder: folder });
        return {
          ...ws,
          schemaFiles: nextFiles,
          activeSchemaFile: nextFiles[0]?.path,
          dbml: merged.mergedDbml,
          tablePositions: nextPos,
        };
      }
      return {
        ...ws,
        dbml: nextDbml,
        tablePositions: nextPos,
      };
    });
    setFocusFit();
    showToast(
      `Imported ${nextParsed.tables.length} tables and ${nextParsed.refs.length} relationships`
    );
  };

  const handleLoadUrlResult = async (
    result: RemoteFetchResult,
    openInNewWorkspace: boolean
  ) => {
    if (!activeWorkspace) return;
    const nextParsed = parseDbml(result.content);
    const nextPos = computeAutoLayout(nextParsed, activeWorkspace.detailLevel);
    const now = new Date().toISOString();
    const urlLink: UrlFileLink = {
      url: result.originalUrl,
      resolvedUrl: result.resolvedUrl,
      loadedAt: now,
    };
    const githubLink: GithubFileLink | undefined =
      result.githubMeta && result.githubMeta.sha
        ? {
            owner: result.githubMeta.owner,
            repo: result.githubMeta.repo,
            branch: result.githubMeta.branch,
            path: result.githubMeta.path,
            sha: result.githubMeta.sha,
            htmlUrl: result.githubMeta.htmlUrl,
            lastSyncedDbml: result.content,
            lastSyncedAt: now,
          }
        : undefined;

    if (openInNewWorkspace) {
      const wsName =
        nextParsed.project.name ||
        result.filename.replace(/\.dbml$/i, '') ||
        'Remote DBML';
      const newWs: WorkspaceProject = {
        id: `ws_url_${Date.now()}`,
        name: wsName,
        description: `Loaded from ${result.originalUrl}`,
        dbml: result.content,
        tablePositions: nextPos,
        groupMeta: {},
        stickyNotes: [],
        detailLevel: activeWorkspace.detailLevel,
        versions: [
          {
            id: `ver_${Date.now()}`,
            tag: 'v1.0.0',
            title: 'Loaded from URL',
            description: result.originalUrl,
            dbml: result.content,
            tablePositions: nextPos,
            stickyNotes: [],
            createdAt: now,
            isPublished: true,
          },
        ],
        urlLink,
        githubLink,
        createdAt: now,
        updatedAt: now,
      };
      await addAndSelectWorkspace(newWs);
    } else {
      updateActiveWorkspace((ws) => ({
        ...ws,
        dbml: result.content,
        schemaFiles: undefined,
        activeSchemaFile: undefined,
        githubRepoLink: undefined,
        tablePositions: nextPos,
        urlLink,
        githubLink,
      }));
      setFocusFit();
    }
    showToast(`Loaded ${result.filename} (${nextParsed.tables.length} tables)`);
  };

  const handleLoadGithubFile = async (
    file: GithubFileResult,
    openInNewWorkspace: boolean,
    layoutJson?: string
  ) => {
    if (!activeWorkspace) return;
    const parsedLayout = layoutJson ? parseWorkspaceLayoutJson(layoutJson) : null;
    const effectiveDetailLevel =
      parsedLayout?.detailLevel || activeWorkspace.detailLevel;
    const nextParsed = parseDbml(file.content);
    const autoPos = computeAutoLayout(nextParsed, effectiveDetailLevel);
    const nextPos = parsedLayout
      ? { ...autoPos, ...parsedLayout.tablePositions }
      : autoPos;
    const nextGroupMeta = parsedLayout ? parsedLayout.groupMeta : {};
    const now = new Date().toISOString();
    const githubLink: GithubFileLink = {
      owner: file.owner,
      repo: file.repo,
      branch: file.branch,
      path: file.path,
      sha: file.sha,
      htmlUrl: file.htmlUrl,
      lastSyncedDbml: file.content,
      lastSyncedAt: now,
    };

    if (openInNewWorkspace) {
      const fileLabel =
        file.path.split('/').pop()?.replace(/\.dbml$/i, '') || file.repo;
      const newWs: WorkspaceProject = {
        id: `ws_gh_${Date.now()}`,
        name: `${file.repo} · ${fileLabel}`,
        description: `GitHub: ${file.owner}/${file.repo} (${file.branch})`,
        dbml: file.content,
        tablePositions: nextPos,
        groupMeta: nextGroupMeta,
        stickyNotes: [],
        detailLevel: effectiveDetailLevel,
        versions: [
          {
            id: `ver_${Date.now()}`,
            tag: 'v1.0.0',
            title: `Loaded ${file.path}`,
            description: `${file.owner}/${file.repo}@${file.branch}`,
            dbml: file.content,
            tablePositions: nextPos,
            stickyNotes: [],
            createdAt: now,
            isPublished: true,
          },
        ],
        githubLink,
        createdAt: now,
        updatedAt: now,
      };
      await addAndSelectWorkspace(newWs);
    } else {
      updateActiveWorkspace((ws) => ({
        ...ws,
        dbml: file.content,
        schemaFiles: undefined,
        activeSchemaFile: undefined,
        githubRepoLink: undefined,
        detailLevel: parsedLayout?.detailLevel || ws.detailLevel,
        tablePositions: nextPos,
        groupMeta: parsedLayout ? nextGroupMeta : ws.groupMeta,
        githubLink,
      }));
      setFocusFit();
    }
    showToast(
      `Loaded ${file.path} from ${file.owner}/${file.repo}${
        parsedLayout ? ' (with layout.json)' : ''
      }`
    );
  };

  const handleSyncedGithubFile = (
    link: GithubFileLink,
    updatedDbml?: string,
    layoutJson?: string
  ) => {
    const parsedLayout = layoutJson ? parseWorkspaceLayoutJson(layoutJson) : null;
    updateActiveWorkspace((ws) => {
      if (typeof updatedDbml === 'string') {
        const effectiveDetailLevel = parsedLayout?.detailLevel || ws.detailLevel;
        const nextParsed = parseDbml(updatedDbml);
        const autoPos = computeAutoLayout(nextParsed, effectiveDetailLevel);
        return {
          ...ws,
          dbml: updatedDbml,
          detailLevel: effectiveDetailLevel,
          tablePositions: parsedLayout
            ? { ...autoPos, ...parsedLayout.tablePositions }
            : autoPos,
          groupMeta: parsedLayout ? parsedLayout.groupMeta : ws.groupMeta,
          githubLink: link,
        };
      }
      return {
        ...ws,
        githubLink: link,
      };
    });
    if (typeof updatedDbml === 'string') {
      setFocusFit();
      showToast(
        `Pulled latest ${link.path} from ${link.branch}${
          parsedLayout ? ' + layout.json' : ''
        }`
      );
    } else {
      showToast(
        `Pushed ${link.path} to ${link.owner}/${link.repo} (${link.branch})`
      );
    }
  };

  const handleLoadGithubFolder = async (
    result: GithubFolderResult,
    openInNewWorkspace: boolean,
    layoutJson?: string
  ) => {
    if (!activeWorkspace) return;
    const parsedLayout = layoutJson ? parseWorkspaceLayoutJson(layoutJson) : null;
    const effectiveDetailLevel =
      parsedLayout?.detailLevel || activeWorkspace.detailLevel;
    const now = new Date().toISOString();
    const schemaFiles: SchemaModuleFile[] = result.files.map((f, idx) => ({
      id: `mod_gh_${Date.now()}_${idx}`,
      path: f.path,
      content: f.content,
      sha: f.sha,
      lastSyncedContent: f.content,
      lastSyncedAt: now,
    }));
    const merged = mergeSchemaFiles(schemaFiles, {
      schemaFolder: result.folder,
    });
    const nextParsed = parseDbml(merged.mergedDbml);
    const autoPos = computeAutoLayout(nextParsed, effectiveDetailLevel);
    const nextPos = parsedLayout
      ? { ...autoPos, ...parsedLayout.tablePositions }
      : autoPos;
    const nextGroupMeta = parsedLayout ? parsedLayout.groupMeta : {};
    const repoLink: GithubRepoLink = {
      owner: result.owner,
      repo: result.repo,
      branch: result.branch,
      schemaFolder: result.folder,
      lastSyncedAt: now,
    };
    const defaultActive =
      schemaFiles.find((f) => !/_project\.dbml$/i.test(f.path))?.path ||
      schemaFiles[0]?.path;

    if (openInNewWorkspace) {
      const newWs: WorkspaceProject = {
        id: `ws_gh_folder_${Date.now()}`,
        name: `${result.repo} · ${result.folder}/`,
        description: `Modular GitHub folder: ${result.owner}/${result.repo}/${result.folder}/ (${result.branch})`,
        dbml: merged.mergedDbml,
        schemaFiles,
        activeSchemaFile: defaultActive,
        schemaFolder: result.folder,
        tablePositions: nextPos,
        groupMeta: nextGroupMeta,
        stickyNotes: [],
        detailLevel: effectiveDetailLevel,
        versions: [
          {
            id: `ver_${Date.now()}`,
            tag: 'v1.0.0',
            title: `Loaded ${result.folder}/ (${schemaFiles.length} files)`,
            description: `${result.owner}/${result.repo}@${result.branch}`,
            dbml: merged.mergedDbml,
            tablePositions: nextPos,
            stickyNotes: [],
            createdAt: now,
            isPublished: true,
          },
        ],
        githubRepoLink: repoLink,
        createdAt: now,
        updatedAt: now,
      };
      await addAndSelectWorkspace(newWs);
    } else {
      updateActiveWorkspace((ws) => ({
        ...ws,
        dbml: merged.mergedDbml,
        schemaFiles,
        activeSchemaFile: defaultActive,
        schemaFolder: result.folder,
        detailLevel: parsedLayout?.detailLevel || ws.detailLevel,
        tablePositions: nextPos,
        groupMeta: parsedLayout ? nextGroupMeta : ws.groupMeta,
        githubLink: undefined,
        githubRepoLink: repoLink,
      }));
      setFocusFit();
    }
    showToast(
      `Loaded ${schemaFiles.length} modular files from ${result.owner}/${result.repo}/${result.folder}/${
        parsedLayout ? ' (with layout.json)' : ''
      }`
    );
  };

  const handleSyncedGithubFolder = (
    repoLink: GithubRepoLink,
    updatedFiles: SchemaModuleFile[],
    replaceAll = false,
    layoutJson?: string
  ) => {
    const parsedLayout = layoutJson ? parseWorkspaceLayoutJson(layoutJson) : null;
    const merged = mergeSchemaFiles(updatedFiles, {
      schemaFolder: repoLink.schemaFolder,
    });
    updateActiveWorkspace((ws) => {
      const effectiveDetailLevel = parsedLayout?.detailLevel || ws.detailLevel;
      const nextParsed = parseDbml(merged.mergedDbml);
      const nextActive =
        ws.activeSchemaFile === MERGED_SCHEMA_VIEW_ID ||
        updatedFiles.some((f) => f.path === ws.activeSchemaFile)
          ? ws.activeSchemaFile
          : updatedFiles[0]?.path;
      const computedPositions = replaceAll
        ? parsedLayout
          ? {
              ...computeAutoLayout(nextParsed, effectiveDetailLevel),
              ...parsedLayout.tablePositions,
            }
          : computeAutoLayout(nextParsed, effectiveDetailLevel)
        : ws.tablePositions;
      return {
        ...ws,
        schemaFiles: updatedFiles,
        schemaFolder: repoLink.schemaFolder,
        activeSchemaFile: nextActive,
        dbml: merged.mergedDbml,
        githubLink: undefined,
        githubRepoLink: repoLink,
        detailLevel: replaceAll ? effectiveDetailLevel : ws.detailLevel,
        groupMeta:
          replaceAll && parsedLayout ? parsedLayout.groupMeta : ws.groupMeta,
        tablePositions: computedPositions,
      };
    });
    if (replaceAll) {
      setFocusFit();
      showToast(
        `Pulled ${updatedFiles.length} latest files from ${repoLink.schemaFolder}/ (${repoLink.branch})${
          parsedLayout ? ' + layout.json' : ''
        }`
      );
    } else {
      showToast(
        `Pushed ${repoLink.schemaFolder}/ modules to ${repoLink.owner}/${repoLink.repo} (${repoLink.branch})`
      );
    }
  };

  const handleCreateBlankWorkspace = async (name: string) => {
    const starterDbml = `Project ${name.replace(/[^a-zA-Z0-9_]/g, '') || 'Schema'} {\n  database_type: 'PostgreSQL'\n}\n\nTable users [headercolor: #1e3a8a] {\n  id uuid [pk, not null]\n  email varchar(255) [unique, not null]\n  created_at timestamptz [default: \`now()\`]\n}\n\nTableGroup "Core Domain" [color: #2563EB] {\n  Note: 'Primary application entities'\n  users\n}\n`;
    const parsed = parseDbml(starterDbml);
    const ws: WorkspaceProject = {
      id: `ws_${Date.now()}`,
      name,
      description: 'Custom database schema workspace',
      dbml: starterDbml,
      tablePositions: computeAutoLayout(parsed, 'full'),
      groupMeta: {},
      stickyNotes: [],
      detailLevel: 'full',
      versions: [
        {
          id: `ver_${Date.now()}`,
          tag: 'v1.0.0',
          title: 'Initial Schema',
          description: 'Workspace initialized',
          dbml: starterDbml,
          tablePositions: computeAutoLayout(parsed, 'full'),
          stickyNotes: [],
          createdAt: new Date().toISOString(),
          isPublished: true,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await addAndSelectWorkspace(ws);
    setWorkspacesModalOpen(false);
    showToast(`Created workspace "${name}"`);
  };

  const handleLoadSampleTelemetry = async () => {
    const ws = createSaaSTelemetryWorkspace();
    await addAndSelectWorkspace(ws);
    setWorkspacesModalOpen(false);
    showToast('Loaded Multi-Tenant SaaS Telemetry template');
  };

  const handleCreateModularWorkspace = async () => {
    const ws = createModularStarterWorkspace();
    await addAndSelectWorkspace(ws);
    setEditorWidth((w) => Math.max(w, 580));
    setWorkspacesModalOpen(false);
    showToast('Created modular workspace with schema/*.dbml');
  };

  return {
    handleImportDbml,
    handleLoadUrlResult,
    handleLoadGithubFile,
    handleSyncedGithubFile,
    handleLoadGithubFolder,
    handleSyncedGithubFolder,
    handleCreateBlankWorkspace,
    handleLoadSampleTelemetry,
    handleCreateModularWorkspace,
  };
}
