import { Context } from 'hono';

export interface AppEnv {
  APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ASSETS?: { fetch: typeof fetch };
}

export type ApiContext = Context<{ Bindings: AppEnv }>;

export interface GithubUserSummary {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GithubSessionPayload {
  accessToken: string;
  user: GithubUserSummary;
  iat: number;
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
