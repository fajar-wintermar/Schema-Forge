import { Hono } from 'hono';
import { z } from 'zod';
import { executeFetchRemoteDbml } from '../../../application/usecases/remote/fetchRemoteDbml';
import { createRequestContainer } from '../container';
import { zValidate } from '../middleware/validation';
import type { AppEnv } from '../types';

const fetchUrlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Please provide a URL.')
    .max(2048, 'URL exceeds maximum length.'),
});

export const fetchUrlRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/', zValidate('query', fetchUrlInputSchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const { url } = c.req.valid('query');
    const result = await executeFetchRemoteDbml({
      githubGateway: container.githubGateway,
      remoteFetcher: container.remoteFetcher,
      accessToken: session?.accessToken,
      rawUrlInput: url,
    });
    return c.json(result, 200);
  })
  .post('/', zValidate('json', fetchUrlInputSchema), async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const { url } = c.req.valid('json');
    const result = await executeFetchRemoteDbml({
      githubGateway: container.githubGateway,
      remoteFetcher: container.remoteFetcher,
      accessToken: session?.accessToken,
      rawUrlInput: url,
    });
    return c.json(result, 200);
  });
