export interface GithubRepoMetadata {
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  canPush: boolean;
}

export interface GithubBranchSummary {
  name: string;
  headCommitSha?: string;
}

export interface GithubTreeEntry {
  path: string;
  size: number;
  sha: string;
}

export interface GithubTreeResult {
  entries: GithubTreeEntry[];
  truncated: boolean;
  isEmpty: boolean;
}

export interface GithubFileResult {
  content: string;
  sha: string;
  path: string;
  htmlUrl?: string;
}

export interface GithubCommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  date: string;
  htmlUrl: string;
}

export interface GithubGistFileResult {
  filename: string;
  content: string;
  rawUrl?: string;
}

export interface GithubInlineCommitFileInput {
  cleanPath: string;
  content: string;
}

export interface GithubCommitTreeResult {
  commitSha: string;
  commitUrl: string;
  files: Array<{ path: string; sha: string; htmlUrl: string }>;
}

export interface IGithubGateway {
  getRepository(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<GithubRepoMetadata>;
  listBranches(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<GithubBranchSummary[]>;
  isRepositoryEmpty(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<boolean>;
  getRecursiveTree(
    owner: string,
    repo: string,
    ref: string,
    accessToken?: string,
    options?: { treatEmptyAsEmptyResult?: boolean }
  ): Promise<GithubTreeResult>;
  getFileContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    accessToken?: string
  ): Promise<GithubFileResult>;
  tryGetOptionalFileSha(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    accessToken?: string
  ): Promise<string | undefined>;
  getGistFile(gistId: string): Promise<GithubGistFileResult | null>;
  batchReadBlobs(params: {
    owner: string;
    repo: string;
    items: Array<{ path: string; sha: string }>;
    accessToken?: string;
  }): Promise<Array<{ path: string; content: string; sha: string }>>;
  listCommits(params: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    perPage: number;
    accessToken?: string;
  }): Promise<GithubCommitEntry[]>;
  createInitialReadme(params: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    content: string;
    accessToken: string;
  }): Promise<{ commitSha: string; commitUrl: string }>;
  createBranchRef(params: {
    owner: string;
    repo: string;
    newBranch: string;
    baseSha: string;
    accessToken: string;
  }): Promise<void>;
  getBranchHeadCommitSha(
    owner: string,
    repo: string,
    branch: string,
    accessToken: string
  ): Promise<{ ok: true; sha: string } | { ok: false; status: number; message: string }>;
  getCommitTreeSha(
    owner: string,
    repo: string,
    commitSha: string,
    accessToken: string
  ): Promise<string>;
  getTreeBlobShas(
    owner: string,
    repo: string,
    treeSha: string,
    accessToken: string
  ): Promise<Map<string, string> | null>;
  putSingleFile(params: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    content: string;
    sha?: string;
    accessToken: string;
  }): Promise<{
    sha: string;
    path: string;
    htmlUrl: string;
    commitSha: string;
    commitUrl: string;
  }>;
  putInitialBatchFirstFile(params: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    content: string;
    accessToken: string;
  }): Promise<{
    path: string;
    sha: string;
    htmlUrl: string;
    commitSha: string;
    commitUrl: string;
  }>;
  commitInlineTree(params: {
    owner: string;
    repo: string;
    targetBranch: string;
    baseTreeSha: string;
    parentCommitSha: string;
    message: string;
    files: GithubInlineCommitFileInput[];
    accessToken: string;
    refAdvanceErrorMessage: string;
    conflictOn422?: boolean;
  }): Promise<GithubCommitTreeResult>;
}
