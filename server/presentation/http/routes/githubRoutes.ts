import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { githubReadRoutes } from './githubReadRoutes';
import { githubWriteRoutes } from './githubWriteRoutes';

export const githubRoutes = new Hono<{ Bindings: AppEnv }>()
  .route('/', githubReadRoutes)
  .route('/', githubWriteRoutes);
