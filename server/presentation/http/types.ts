import type { Context } from 'hono';
import type { D1DatabaseLike } from '../../infrastructure/persistence/d1/d1Types';

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
