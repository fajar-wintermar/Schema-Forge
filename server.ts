import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { api } from './server/api';
import { getLocalD1Database } from './server/lib/localSqliteD1';

function readCliFlag(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

const cliPort = readCliFlag('--port');
const PORT = Number(
  cliPort ||
    (process.env.NODE_ENV === 'production' ? process.env.PORT : undefined) ||
    3000
);
const HOST = readCliFlag('--host') || process.env.HOST || '0.0.0.0';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

async function startServer() {
  const localDb = getLocalD1Database();
  const honoListener = getRequestListener((request) =>
    api.fetch(request, { DB: localDb })
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    const server = http.createServer((req, res) => {
      const urlPath = req.url || '/';
      if (urlPath.startsWith('/api/')) {
        void honoListener(req, res);
        return;
      }
      vite.middlewares(req, res);
    });

    server.listen(PORT, HOST, () => {
      console.log(`SchemaForge Hono+Vite dev server running on http://${HOST}:${PORT}`);
    });
    return;
  }

  const distDir = path.resolve(process.cwd(), 'dist');
  const indexPath = path.join(distDir, 'index.html');

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    const urlPath = rawUrl.split('?')[0];

    if (urlPath.startsWith('/api/')) {
      void honoListener(req, res);
      return;
    }

    const safeRel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, '');
    let filePath = path.join(distDir, safeRel === '/' ? 'index.html' : safeRel);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = indexPath;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(PORT, HOST, () => {
    console.log(`SchemaForge Hono production server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
