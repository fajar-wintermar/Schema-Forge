import { Hono } from 'hono';
import type { AppEnv } from './types';
import { authRoutes } from './routes/auth';
import { fetchUrlRoutes } from './routes/fetchUrl';
import { githubRoutes } from './routes/github';

export type { AppEnv } from './types';

export const api = new Hono<{ Bindings: AppEnv }>();

api.route('/', authRoutes);
api.route('/', fetchUrlRoutes);
api.route('/', githubRoutes);
