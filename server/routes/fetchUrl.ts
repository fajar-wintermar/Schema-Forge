import { Hono } from 'hono';
import { validator } from 'hono/validator';
import type { AppEnv } from '../types';
import { isRecord } from '../lib/http';
import { fetchRemoteDbmlFromUrl } from '../services/fetchUrlService';

const fetchUrlQueryValidator = validator('query', (value, c) => {
  const raw = value.url;
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) {
    return c.json({ error: 'Please provide a URL.' }, 400);
  }
  return { url };
});

const fetchUrlJsonValidator = validator('json', (value, c) => {
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url.trim()) {
    return c.json({ error: 'Please provide a URL.' }, 400);
  }
  return { url: value.url };
});

export const fetchUrlRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/', fetchUrlQueryValidator, async (c) => {
    const { url } = c.req.valid('query');
    const result = await fetchRemoteDbmlFromUrl(c, url);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  })
  .post('/', fetchUrlJsonValidator, async (c) => {
    const { url } = c.req.valid('json');
    const result = await fetchRemoteDbmlFromUrl(c, url);
    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result.data, 200);
  });
