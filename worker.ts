import type { ExecutionContext } from 'hono';
import { api, AppEnv } from './server/api';

export default {
  async fetch(
    request: Request,
    env: AppEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, ctx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return api.fetch(request, env, ctx);
  },
};
