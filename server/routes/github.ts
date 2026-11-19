import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { githubReadRoutes } from './github/readRoutes';
import { githubWriteRoutes } from './github/writeRoutes';

export const githubRoutes = new Hono<{ Bindings: AppEnv }>();

githubRoutes.route('/', githubReadRoutes);
githubRoutes.route('/', githubWriteRoutes);
