import { handle } from 'hono/cloudflare-pages';
import { api } from '../../server/api';

export const onRequest = handle(api);
