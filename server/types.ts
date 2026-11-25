import { Context } from 'hono';

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: D1Meta;
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[]
  ): Promise<D1Result<T>[]>;
}

export interface AppEnv {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  DB?: D1DatabaseLike;
  ASSETS?: { fetch: typeof fetch };
}

export type ApiContext = Context<{ Bindings: AppEnv }>;

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
