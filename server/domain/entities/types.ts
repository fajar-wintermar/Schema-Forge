export interface GithubUserSummary {
  id?: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GithubSessionPayload {
  accessToken: string;
  user: GithubUserSummary;
  iat: number;
  jti?: string;
}

export interface OAuthStatePayload {
  nonce: string;
  exp: number;
}

export interface ParsedGithubUrlMeta {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  rawUrl: string;
}

export interface ServerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  appUrl?: string;
  allowedOrigins: string[];
  sessionSecret?: string;
  githubClientId?: string;
  githubClientSecret?: string;
  geminiApiKey?: string;
}
