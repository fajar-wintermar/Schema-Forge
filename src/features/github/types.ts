import {
  GithubFileLink,
  GithubRepoLink,
  SchemaModuleFile,
  WorkspaceProject,
} from '@shared/domain/schemaTypes';
import {
  GithubFileResult,
  GithubFolderResult,
} from '../../services/api/remoteService';

export interface GitHubModalProps {
  workspace: WorkspaceProject;
  initialTab?: 'browse' | 'push' | 'migrations';
  onLoadGithubFile: (
    file: GithubFileResult,
    openInNewWorkspace: boolean,
    layoutJson?: string
  ) => void;
  onSyncedGithubFile: (
    link: GithubFileLink,
    updatedDbml?: string,
    layoutJson?: string
  ) => void;
  onLoadGithubFolder?: (
    result: GithubFolderResult,
    openInNewWorkspace: boolean,
    layoutJson?: string
  ) => void;
  onSyncedGithubFolder?: (
    repoLink: GithubRepoLink,
    updatedFiles: SchemaModuleFile[],
    replaceAll?: boolean,
    layoutJson?: string
  ) => void;
  onClose: () => void;
}

export interface BatchPushSummary {
  commitSha: string;
  commitUrl: string;
  branch: string;
  fileCount: number;
}
