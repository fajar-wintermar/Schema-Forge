import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { zValidate } from '../lib/validation';
import { fetchRemoteDbmlFromUrl } from '../services/fetchUrlService';

const fetchUrlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Please provide a URL.')
    .max(2048, 'URL exceeds maximum length.'),
});

export const fetchUrlRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/', zValidate('query', fetchUrlInputSchema), async (c) => {
    const { url } = c.req.valid('query');
    const result = await fetchRemoteDbmlFromUrl(c, url);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .post('/', zValidate('json', fetchUrlInputSchema), async (c) => {
      const { url } = c.req.valid('json');
      const result = await fetchRemoteDbmlFromUrl(c, url);
      if (!result.ok) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result.data, 200);
    }
  );
