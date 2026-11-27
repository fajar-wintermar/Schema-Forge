import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { validateServerEnv } from '../infrastructure/config/serverEnv';
import { ensureMigrations } from '../infrastructure/persistence/d1/d1Migrator';
import { createLocalSqliteD1 } from '../infrastructure/persistence/sqlite/localSqliteD1';
import { NodePinnedRemoteFetcher } from '../infrastructure/remote/nodePinnedRemoteFetcher';
import { api } from '../presentation/http/app';
import { shutdownRateLimiters } from '../presentation/http/middleware/rateLimit';

function readCliFlag(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag && args[i + 1]) return args[i + 1];
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

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

function isHonoPath(rawUrl: string): boolean {
  const urlPath = rawUrl.split('?')[0];
  return urlPath === '/healthz' || urlPath.startsWith('/api/');
}

function setupGracefulShutdown(options: {
  server: http.Server;
  closeDb: () => void;
  closeVite?: () => Promise<void>;
}) {
  let shuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] Received ${signal}. Starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      console.error('[server] Graceful shutdown timed out; forcing exit.');
      options.closeDb();
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    let exitCode = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        options.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
        options.server.closeIdleConnections?.();
      });
    } catch (err) {
      console.error('[server] Error closing HTTP server:', err);
      exitCode = 1;
    }

    if (options.closeVite) {
      try {
        await options.closeVite();
      } catch (err) {
        console.error('[server] Error closing Vite dev server:', err);
        exitCode = 1;
      }
    }

    try {
      shutdownRateLimiters();
      options.closeDb();
    } catch (err) {
      console.error('[server] Error closing database connection:', err);
      exitCode = 1;
    }

    clearTimeout(forceTimer);
    console.log('[server] Shutdown complete.');
    process.exit(exitCode);
  };

  process.once('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });
  process.once('SIGINT', () => {
    void handleSignal('SIGINT');
  });
}

export async function startNodeServer(): Promise<void> {
  const validatedEnv = validateServerEnv(process.env);
  const cliPort = readCliFlag('--port');
  const PORT = Number(
    cliPort ||
      (validatedEnv.NODE_ENV === 'production' ? validatedEnv.PORT : undefined) ||
      3000
  );
  const HOST = readCliFlag('--host') || process.env.HOST || validatedEnv.HOST;

  const localSqlite = createLocalSqliteD1(validatedEnv.DATABASE_URL);
  let closeCalled = false;
  const closeDb = () => {
    if (closeCalled) return;
    closeCalled = true;
    localSqlite.close();
  };

  try {
    await ensureMigrations(localSqlite.db);
    const nodeRemoteFetcher = new NodePinnedRemoteFetcher();
    const honoListener = getRequestListener((request) =>
      api.fetch(request, {
        NODE_ENV: validatedEnv.NODE_ENV,
        DATABASE_URL: validatedEnv.DATABASE_URL,
        GEMINI_API_KEY: validatedEnv.GEMINI_API_KEY,
        APP_URL: validatedEnv.APP_URL,
        ALLOWED_ORIGIN: validatedEnv.ALLOWED_ORIGIN,
        ALLOWED_ORIGINS: validatedEnv.ALLOWED_ORIGINS,
        GITHUB_CLIENT_ID: validatedEnv.GITHUB_CLIENT_ID,
        GITHUB_CLIENT_SECRET: validatedEnv.GITHUB_CLIENT_SECRET,
        SESSION_SECRET: validatedEnv.SESSION_SECRET,
        DB: localSqlite.db,
        REMOTE_FETCHER: nodeRemoteFetcher,
      })
    );

    if (validatedEnv.NODE_ENV !== 'production') {
      process.env.DISABLE_HMR ??= 'true';
      const hmrDisabled = process.env.DISABLE_HMR === 'true';
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: !hmrDisabled,
        },
        appType: 'spa',
      });

      const server = http.createServer(async (req, res) => {
        const urlPath = req.url || '/';
        if (isHonoPath(urlPath)) {
          delete req.headers['x-sf-peer-ip'];
          if (req.socket?.remoteAddress) {
            req.headers['x-sf-peer-ip'] = req.socket.remoteAddress;
          }
          void honoListener(req, res);
          return;
        }
        if (
          hmrDisabled &&
          (urlPath === '/@vite/client' || urlPath.startsWith('/@vite/client?'))
        ) {
          try {
            const result = await vite.transformRequest('/@vite/client');
            if (result) {
              const patched = result.code
                .replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  '/* HMR disabled: WebSocket connect skipped */'
                )
                .replace(
                  'else throw new SendBeforeConnectError("send was called before connect");',
                  'else return;'
                );
              res.writeHead(200, {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'no-cache',
              });
              res.end(patched);
              return;
            }
          } catch {
            // Fall through to Vite middleware
          }
        }
        vite.middlewares(req, res);
      });

      setupGracefulShutdown({
        server,
        closeDb,
        closeVite: () => vite.close(),
      });

      server.listen(PORT, HOST, () => {
        console.log(
          `SchemaForge Hono+Vite dev server running on http://${HOST}:${PORT}`
        );
      });
      return;
    }

    const distDir = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distDir, 'index.html');

    const server = http.createServer((req, res) => {
      const rawUrl = req.url || '/';
      const urlPath = rawUrl.split('?')[0];

      if (isHonoPath(urlPath)) {
        delete req.headers['x-sf-peer-ip'];
        if (req.socket?.remoteAddress) {
          req.headers['x-sf-peer-ip'] = req.socket.remoteAddress;
        }
        void honoListener(req, res);
        return;
      }

      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(urlPath);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      const relPath = decodedPath.replace(/^\/+/, '');
      let filePath = relPath ? path.resolve(distDir, relPath) : indexPath;

      if (filePath !== distDir && !filePath.startsWith(`${distDir}${path.sep}`)) {
        filePath = indexPath;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = indexPath;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      });
      fs.createReadStream(filePath).pipe(res);
    });

    setupGracefulShutdown({ server, closeDb });

    server.listen(PORT, HOST, () => {
      console.log(
        `SchemaForge Hono production server running on http://${HOST}:${PORT}`
      );
    });
  } catch (err) {
    closeDb();
    throw err;
  }
}
