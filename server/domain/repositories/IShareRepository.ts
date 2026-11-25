import type {
  DetailLevel,
  GroupCustomMeta,
  ShareLinkRecord,
  StickyNote,
  TablePosition,
} from '../../../shared/domain/schemaTypes';

export interface ShareWorkspaceSnapshot {
  id: string;
  name: string;
  description: string;
  dbml: string;
  tablePositions: Record<string, TablePosition>;
  stickyNotes: StickyNote[];
  detailLevel: DetailLevel;
  groupMeta: Record<string, GroupCustomMeta>;
  updatedAt: string;
}

export interface ShareVersionSnapshot {
  id: string;
  tag: string;
  title: string;
  description: string;
  dbml: string;
  tablePositions: Record<string, TablePosition>;
  stickyNotes: StickyNote[];
  createdAt: string;
}

export interface CreateShareRecordInput {
  id: string;
  token: string;
  workspaceId: string;
  ownerUserId: string;
  label: string;
  pinnedVersionTag: string | null;
  defaultView: 'docs' | 'diagram';
  allowDiagramExport: boolean;
  createdByLogin: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface UpdateShareRecordInput {
  shareId: string;
  workspaceId: string;
  ownerUserId: string;
  label: string;
  pinnedVersionTag: string | null;
  defaultView: 'docs' | 'diagram';
  allowDiagramExport: boolean;
  expiresAt: string | null;
}

export interface IShareRepository {
  workspaceExistsForOwner(
    workspaceId: string,
    ownerUserId: string
  ): Promise<boolean>;
  versionTagExists(
    workspaceId: string,
    ownerUserId: string,
    tag: string
  ): Promise<string | null>;
  listActiveByWorkspace(
    workspaceId: string,
    ownerUserId: string
  ): Promise<ShareLinkRecord[]>;
  createShareLink(input: CreateShareRecordInput): Promise<ShareLinkRecord>;
  findByIdForWorkspace(
    shareId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ShareLinkRecord | null>;
  updateShareLink(input: UpdateShareRecordInput): Promise<ShareLinkRecord>;
  revokeShareLink(
    shareId: string,
    workspaceId: string,
    ownerUserId: string,
    revokedAt: string
  ): Promise<boolean>;
  findByToken(token: string): Promise<ShareLinkRecord | null>;
  findActiveWorkspaceById(
    workspaceId: string
  ): Promise<ShareWorkspaceSnapshot | null>;
  listPublishedVersions(workspaceId: string): Promise<ShareVersionSnapshot[]>;
  findPinnedVersion(
    workspaceId: string,
    tag: string
  ): Promise<ShareVersionSnapshot | null>;
}
