import type { WorkspaceProject } from '../../../shared/domain/schemaTypes';

export interface WorkspaceOwnershipMetadata {
  id: string;
  ownerUserId: string;
  revision: number;
  createdAt: string;
}

export interface UpsertWorkspaceVersionRecord {
  id: string;
  tag: string;
  title: string;
  description: string;
  dbml: string;
  tablePositionsJson: string;
  stickyNotesJson: string;
  isPublished: boolean;
  createdAt: string;
}

export interface UpsertWorkspaceRecordInput {
  workspaceId: string;
  ownerUserId: string;
  exists: boolean;
  name: string;
  description: string;
  dbml: string;
  schemaFilesJson: string | null;
  activeSchemaFile: string | null;
  schemaFolder: string | null;
  tablePositionsJson: string;
  groupMetaJson: string;
  stickyNotesJson: string;
  detailLevel: string;
  githubLinkJson: string | null;
  githubRepoLinkJson: string | null;
  urlLinkJson: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  versions?: UpsertWorkspaceVersionRecord[];
  clearAllVersions?: boolean;
}

export interface IWorkspaceRepository {
  listByOwner(ownerUserId: string): Promise<WorkspaceProject[]>;
  findByIdForOwner(
    workspaceId: string,
    ownerUserId: string
  ): Promise<WorkspaceProject | null>;
  findMetadataById(
    workspaceId: string
  ): Promise<WorkspaceOwnershipMetadata | null>;
  upsertWithVersions(input: UpsertWorkspaceRecordInput): Promise<void>;
  softDeleteWithShares(
    workspaceId: string,
    ownerUserId: string,
    nowIso: string
  ): Promise<void>;
}
