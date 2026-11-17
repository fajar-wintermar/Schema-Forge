import { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export interface AppEnv {
  APP_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ASSETS?: { fetch: typeof fetch };
}

type ApiContext = Context<{ Bindings: AppEnv }>;

function getEnv(c: ApiContext, key: keyof AppEnv): string {
  const bindingVal = c.env?.[key];
  if (typeof bindingVal === 'string' && bindingVal.trim()) {
    return bindingVal.trim();
  }
  const procEnv = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const nodeVal = procEnv?.[key];
  return typeof nodeVal === 'string' ? nodeVal.trim() : '';
}

function getAppUrl(c: ApiContext): string {
  const envUrl = getEnv(c, 'APP_URL');
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/+$/, '');
  }
  return new URL(c.req.url).origin;
}

function getCallbackUrl(c: ApiContext): string {
  return `${getAppUrl(c)}/api/auth/github/callback`;
}

function getSessionSecret(c: ApiContext): string {
  return (
    getEnv(c, 'SESSION_SECRET') ||
    getEnv(c, 'GITHUB_CLIENT_SECRET') ||
    'schemaforge-ephemeral-session-key'
  );
}

// ---------- Web-Standard Base64 & Web Crypto Helpers (Node + Cloudflare Edge) ----------

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', secretBytes);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptToken<T>(payload: T, secret: string): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  const encrypted = new Uint8Array(encryptedBuf);
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);
  return bytesToBase64Url(combined);
}

async function decryptToken<T>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const raw = base64UrlToBytes(token);
    if (raw.length < 28) return null;
    const iv = new Uint8Array(raw.subarray(0, 12));
    const body = new Uint8Array(raw.subarray(12));
    const key = await deriveAesKey(secret);
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      body
    );
    const text = new TextDecoder().decode(decryptedBuf);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function randomHex(byteLen = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLen));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Domain Types & Helpers ----------

interface GithubUserSummary {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

interface GithubSessionPayload {
  accessToken: string;
  user: GithubUserSummary;
  iat: number;
}

interface OAuthStatePayload {
  nonce: string;
  exp: number;
}

async function getGithubSession(
  c: ApiContext
): Promise<GithubSessionPayload | null> {
  const secret = getSessionSecret(c);
  const headerToken = c.req.header('x-github-session');
  if (headerToken && headerToken.trim()) {
    const parsed = await decryptToken<GithubSessionPayload>(
      headerToken.trim(),
      secret
    );
    if (parsed?.accessToken && parsed.user?.login) return parsed;
  }
  const cookieToken = getCookie(c, 'sf_gh_session');
  if (cookieToken) {
    const parsed = await decryptToken<GithubSessionPayload>(
      cookieToken,
      secret
    );
    if (parsed?.accessToken && parsed.user?.login) return parsed;
  }
  return null;
}

function isDisallowedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  return false;
}

function encodeGithubPath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

interface ParsedGithubUrlMeta {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  rawUrl: string;
}

function parseGithubFileUrl(inputUrl: string): ParsedGithubUrlMeta | null {
  try {
    const u = new URL(inputUrl);
    if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        const [owner, repo, , branch, ...rest] = parts;
        const filePath = decodeURIComponent(rest.join('/'));
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: filePath,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join('/')}`,
        };
      }
    }
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const [owner, repo, branch, ...rest] = parts;
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: decodeURIComponent(rest.join('/')),
          rawUrl: inputUrl,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function githubApiFetch(
  endpoint: string,
  accessToken?: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SchemaForge-DBML-Studio',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers,
  });
}

// ---------- Shared Hono API Router ----------

export const api = new Hono<{ Bindings: AppEnv }>();

// 1. GitHub OAuth Routes

api.get('/api/auth/github/status', async (c) => {
  const session = await getGithubSession(c);
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  return c.json({
    configured: Boolean(clientId && clientSecret),
    connected: Boolean(session),
    user: session?.user || null,
    callbackUrl: getCallbackUrl(c),
  });
});

api.get('/api/auth/github/url', async (c) => {
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return c.json(
      {
        error:
          'GitHub OAuth is not configured on the server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
        callbackUrl: getCallbackUrl(c),
      },
      400
    );
  }

  // Stateless encrypted state works seamlessly across Cloudflare Worker isolates
  const state = await encryptToken<OAuthStatePayload>(
    { nonce: randomHex(16), exp: Date.now() + 10 * 60 * 1000 },
    getSessionSecret(c)
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(c),
    scope: 'repo',
    state,
  });

  return c.json({
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
  });
});

async function handleGithubCallback(c: ApiContext) {
  const code = c.req.query('code') || '';
  const state = c.req.query('state') || '';
  const oauthError =
    c.req.query('error_description') || c.req.query('error') || '';

  const sendErrorHtml = (msg: string) => {
    const safeMsg = JSON.stringify(msg);
    return c.html(
      `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <h3>GitHub Authentication Failed</h3>
    <p>${msg.replace(/</g, '&lt;')}</p>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'github', error: ${safeMsg} }, '*');
      }
    </script>
  </body>
</html>`,
      400
    );
  };

  if (oauthError) {
    return sendErrorHtml(oauthError);
  }

  const secret = getSessionSecret(c);
  const parsedState = state
    ? await decryptToken<OAuthStatePayload>(state, secret)
    : null;

  if (!code || !parsedState || parsedState.exp < Date.now()) {
    return sendErrorHtml(
      'Invalid or expired OAuth state. Please try connecting again.'
    );
  }

  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');

  try {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: getCallbackUrl(c),
        }),
      }
    );

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return sendErrorHtml(
        tokenData.error_description ||
          tokenData.error ||
          'Failed to exchange authorization code with GitHub.'
      );
    }

    const userRes = await githubApiFetch('/user', tokenData.access_token);
    if (!userRes.ok) {
      return sendErrorHtml('Failed to fetch GitHub user profile.');
    }

    const userRaw = (await userRes.json()) as {
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    };

    const user: GithubUserSummary = {
      login: userRaw.login,
      name: userRaw.name,
      avatar_url: userRaw.avatar_url,
      html_url: userRaw.html_url,
    };

    const sessionToken = await encryptToken<GithubSessionPayload>(
      {
        accessToken: tokenData.access_token,
        user,
        iat: Date.now(),
      },
      secret
    );

    setCookie(c, 'sf_gh_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    const payloadJson = JSON.stringify({
      type: 'OAUTH_AUTH_SUCCESS',
      provider: 'github',
      sessionToken,
      user,
    });

    return c.html(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <p>Connected to GitHub as <strong>@${user.login.replace(/</g, '&lt;')}</strong>. Closing window...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payloadJson}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
  } catch (err) {
    return sendErrorHtml(
      err instanceof Error ? err.message : 'Unexpected OAuth callback error.'
    );
  }
}

api.get('/api/auth/github/callback', handleGithubCallback);
api.get('/api/auth/github/callback/', handleGithubCallback);

api.post('/api/auth/github/logout', (c) => {
  deleteCookie(c, 'sf_gh_session', {
    secure: true,
    sameSite: 'None',
    path: '/',
  });
  return c.json({ ok: true });
});

// 2. Fetch DBML from Any URL

async function handleFetchUrl(c: ApiContext) {
  let bodyUrl = '';
  if (c.req.method === 'POST') {
    const body = await c.req.json<{ url?: unknown }>().catch(() => ({}));
    if (typeof (body as { url?: unknown }).url === 'string') {
      bodyUrl = (body as { url: string }).url;
    }
  }
  const rawInput = bodyUrl || c.req.query('url') || '';
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return c.json({ error: 'Please provide a URL.' }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return c.json(
      { error: 'Invalid URL format. Include https:// or http://' },
      400
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return c.json(
      { error: 'Only http:// and https:// URLs are supported.' },
      400
    );
  }

  if (isDisallowedHostname(parsedUrl.hostname)) {
    return c.json(
      { error: 'Local or private network URLs are not allowed.' },
      400
    );
  }

  try {
    let targetUrl = parsedUrl.toString();
    const githubMeta = parseGithubFileUrl(targetUrl);
    if (githubMeta) {
      targetUrl = githubMeta.rawUrl;
    } else if (
      (parsedUrl.hostname === 'gist.github.com' ||
        parsedUrl.hostname === 'www.gist.github.com') &&
      !parsedUrl.pathname.endsWith('/raw')
    ) {
      const gistParts = parsedUrl.pathname.split('/').filter(Boolean);
      const gistId = gistParts[1] || gistParts[0];
      if (gistId) {
        const gistApiRes = await githubApiFetch(
          `/gists/${encodeURIComponent(gistId)}`
        );
        if (gistApiRes.ok) {
          const gistJson = (await gistApiRes.json()) as {
            files?: Record<
              string,
              { filename: string; content?: string; raw_url?: string }
            >;
          };
          const files = Object.values(gistJson.files || {});
          const dbmlFile =
            files.find((f) => f.filename.toLowerCase().endsWith('.dbml')) ||
            files[0];
          if (dbmlFile?.content) {
            return c.json({
              content: dbmlFile.content,
              originalUrl: trimmed,
              resolvedUrl: dbmlFile.raw_url || targetUrl,
              filename: dbmlFile.filename,
              githubMeta: null,
            });
          }
        }
      }
      targetUrl = `${targetUrl.replace(/\/+$/, '')}/raw`;
    }

    const session = await getGithubSession(c);
    if (githubMeta && session) {
      const ghRes = await githubApiFetch(
        `/repos/${encodeURIComponent(githubMeta.owner)}/${encodeURIComponent(
          githubMeta.repo
        )}/contents/${encodeGithubPath(githubMeta.path)}?ref=${encodeURIComponent(
          githubMeta.branch
        )}`,
        session.accessToken
      );
      if (ghRes.ok) {
        const fileData = (await ghRes.json()) as {
          content?: string;
          sha: string;
          html_url?: string;
          name?: string;
        };
        if (fileData.content) {
          const decoded = decodeBase64Utf8(fileData.content);
          return c.json({
            content: decoded,
            originalUrl: trimmed,
            resolvedUrl: targetUrl,
            filename:
              fileData.name ||
              githubMeta.path.split('/').pop() ||
              'schema.dbml',
            githubMeta: {
              ...githubMeta,
              sha: fileData.sha,
              htmlUrl: fileData.html_url,
            },
          });
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SchemaForge-DBML-Studio',
        Accept: 'text/plain, text/x-dbml, application/octet-stream, */*',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return c.json(
        {
          error: `Remote server returned HTTP ${response.status} ${response.statusText}`,
        },
        response.status as 400
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (text.length > 5 * 1024 * 1024) {
      return c.json({ error: 'Remote file exceeds 5 MB limit.' }, 413);
    }

    if (
      contentType.includes('text/html') &&
      /^\s*<!doctype html|^\s*<html/i.test(text)
    ) {
      return c.json(
        {
          error:
            'The URL returned an HTML webpage instead of a raw DBML file. Use a raw file URL or a GitHub blob URL.',
        },
        422
      );
    }

    const pathParts = new URL(targetUrl).pathname.split('/').filter(Boolean);
    const filename =
      decodeURIComponent(pathParts[pathParts.length - 1] || '') ||
      'remote-schema.dbml';

    let enrichedGithubMeta:
      | (ParsedGithubUrlMeta & { sha?: string; htmlUrl?: string })
      | null = githubMeta;
    if (githubMeta) {
      try {
        const metaRes = await githubApiFetch(
          `/repos/${encodeURIComponent(githubMeta.owner)}/${encodeURIComponent(
            githubMeta.repo
          )}/contents/${encodeGithubPath(githubMeta.path)}?ref=${encodeURIComponent(
            githubMeta.branch
          )}`,
          session?.accessToken
        );
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as {
            sha?: string;
            html_url?: string;
          };
          enrichedGithubMeta = {
            ...githubMeta,
            sha: metaJson.sha,
            htmlUrl: metaJson.html_url,
          };
        }
      } catch {
        // Ignore optional metadata lookup errors
      }
    }

    return c.json({
      content: text,
      originalUrl: trimmed,
      resolvedUrl: targetUrl,
      filename,
      githubMeta: enrichedGithubMeta,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error
            ? err.name === 'AbortError'
              ? 'Timed out waiting for URL response (15s).'
              : err.message
            : 'Failed to fetch remote DBML file.',
      },
      502
    );
  }
}

api.get('/api/fetch-url', handleFetchUrl);
api.post('/api/fetch-url', handleFetchUrl);

// 3. GitHub Repository, Tree, File & Push Proxy

api.get('/api/github/repos', async (c) => {
  const session = await getGithubSession(c);
  if (!session) {
    return c.json({ error: 'Not authenticated with GitHub.' }, 401);
  }

  try {
    const ghRes = await githubApiFetch(
      '/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member',
      session.accessToken
    );
    const data = await ghRes.json();
    if (!ghRes.ok) {
      return c.json(
        {
          error:
            (data as { message?: string }).message ||
            'Failed to load GitHub repositories.',
        },
        ghRes.status as 400
      );
    }

    const repos = (
      data as Array<{
        id: number;
        full_name: string;
        name: string;
        owner: { login: string; avatar_url: string };
        private: boolean;
        default_branch: string;
        description: string | null;
        html_url: string;
        updated_at: string;
        permissions?: { push?: boolean };
      }>
    ).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      owner: r.owner.login,
      name: r.name,
      private: r.private,
      default_branch: r.default_branch,
      description: r.description,
      html_url: r.html_url,
      updated_at: r.updated_at,
      canPush: r.permissions?.push ?? true,
    }));

    return c.json({ repos });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'GitHub API error.' },
      502
    );
  }
});

api.get('/api/github/repo-info', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  if (!owner || !repo) {
    return c.json({ error: 'Missing owner or repo parameter.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const [repoRes, branchesRes] = await Promise.all([
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        session?.accessToken
      ),
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
        session?.accessToken
      ),
    ]);

    const repoJson = (await repoRes.json()) as {
      full_name?: string;
      default_branch?: string;
      private?: boolean;
      html_url?: string;
      permissions?: { push?: boolean };
      message?: string;
    };

    if (!repoRes.ok) {
      return c.json(
        {
          error: repoJson.message || 'Repository not found or inaccessible.',
        },
        repoRes.status as 400
      );
    }

    const branchesRaw = branchesRes.ok
      ? ((await branchesRes.json()) as Array<{ name: string }>)
      : [];

    return c.json({
      full_name: repoJson.full_name,
      owner,
      repo,
      default_branch: repoJson.default_branch || 'main',
      private: Boolean(repoJson.private),
      html_url: repoJson.html_url,
      canPush: Boolean(session && (repoJson.permissions?.push ?? true)),
      branches: branchesRaw.map((b) => b.name),
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to inspect repository.',
      },
      502
    );
  }
});

api.get('/api/github/tree', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  const branch = (c.req.query('branch') || 'main').trim();

  if (!owner || !repo || !branch) {
    return c.json({ error: 'Missing owner, repo, or branch.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      session?.accessToken
    );

    const treeJson = (await treeRes.json()) as {
      tree?: Array<{ path: string; type: string; size?: number; sha: string }>;
      truncated?: boolean;
      message?: string;
    };

    if (!treeRes.ok) {
      return c.json(
        { error: treeJson.message || 'Failed to read repository file tree.' },
        treeRes.status as 400
      );
    }

    const files = (treeJson.tree || [])
      .filter((item) => item.type === 'blob')
      .map((item) => ({
        path: item.path,
        size: item.size || 0,
        sha: item.sha,
        isDbml: item.path.toLowerCase().endsWith('.dbml'),
      }))
      .sort((a, b) => {
        if (a.isDbml !== b.isDbml) return a.isDbml ? -1 : 1;
        return a.path.localeCompare(b.path);
      });

    return c.json({
      files,
      truncated: Boolean(treeJson.truncated),
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch file tree.' },
      502
    );
  }
});

api.get('/api/github/file', async (c) => {
  const owner = (c.req.query('owner') || '').trim();
  const repo = (c.req.query('repo') || '').trim();
  const filePath = (c.req.query('path') || '').trim();
  const ref = (c.req.query('ref') || '').trim();

  if (!owner || !repo || !filePath) {
    return c.json({ error: 'Missing owner, repo, or path.' }, 400);
  }

  const session = await getGithubSession(c);
  try {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const fileRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}${refQuery}`,
      session?.accessToken
    );

    const fileJson = (await fileRes.json()) as {
      type?: string;
      content?: string;
      sha?: string;
      path?: string;
      html_url?: string;
      message?: string;
    };

    if (!fileRes.ok) {
      return c.json(
        { error: fileJson.message || 'Failed to read file from GitHub.' },
        fileRes.status as 400
      );
    }

    if (fileJson.type !== 'file' || typeof fileJson.content !== 'string') {
      return c.json({ error: 'Target path is not a readable text file.' }, 400);
    }

    const decoded = decodeBase64Utf8(fileJson.content);

    return c.json({
      content: decoded,
      sha: fileJson.sha || '',
      path: fileJson.path || filePath,
      branch: ref || 'main',
      htmlUrl: fileJson.html_url,
      owner,
      repo,
    });
  } catch (err) {
    return c.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to fetch GitHub file.',
      },
      502
    );
  }
});

api.post('/api/github/push', async (c) => {
  const session = await getGithubSession(c);
  if (!session) {
    return c.json(
      { error: 'Please connect your GitHub account before pushing changes.' },
      401
    );
  }

  const body = await c.req.json<{
    owner?: string;
    repo?: string;
    path?: string;
    branch?: string;
    message?: string;
    content?: string;
    expectedSha?: string;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  }>();

  const {
    owner,
    repo,
    path: filePath,
    branch,
    message,
    content,
    expectedSha,
    createNewBranch,
    newBranchName,
    forceWithLatestSha,
  } = body;

  if (
    !owner ||
    !repo ||
    !filePath ||
    !branch ||
    !message?.trim() ||
    typeof content !== 'string'
  ) {
    return c.json(
      {
        error:
          'Missing required fields: owner, repo, path, branch, message, content.',
      },
      400
    );
  }

  try {
    let targetBranch = branch.trim();

    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!cleanBranch || /[\s~^:?*\[]/.test(cleanBranch)) {
        return c.json(
          {
            error:
              'Please enter a valid new branch name (no spaces or special characters).',
          },
          400
        );
      }

      const refRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.accessToken
      );
      const refData = (await refRes.json()) as {
        object?: { sha: string };
        message?: string;
      };
      if (!refRes.ok || !refData.object?.sha) {
        return c.json(
          {
            error:
              refData.message ||
              `Unable to resolve base branch "${targetBranch}".`,
          },
          (refRes.status || 400) as 400
        );
      }

      const createRefRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/refs`,
        session.accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: `refs/heads/${cleanBranch}`,
            sha: refData.object.sha,
          }),
        }
      );

      const createRefJson = (await createRefRes.json()) as { message?: string };
      if (!createRefRes.ok) {
        return c.json(
          {
            error:
              createRefJson.message ||
              `Failed to create branch "${cleanBranch}".`,
          },
          createRefRes.status as 400
        );
      }
      targetBranch = cleanBranch;
    }

    let shaToUse = expectedSha || undefined;

    if (forceWithLatestSha) {
      const latestRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodeGithubPath(filePath)}?ref=${encodeURIComponent(
          targetBranch
        )}`,
        session.accessToken
      );
      if (latestRes.ok) {
        const latestJson = (await latestRes.json()) as { sha?: string };
        shaToUse = latestJson.sha;
      } else if (latestRes.status === 404) {
        shaToUse = undefined;
      }
    }

    const putBody: Record<string, string> = {
      message: message.trim(),
      content: encodeBase64Utf8(content),
      branch: targetBranch,
    };
    if (shaToUse) {
      putBody.sha = shaToUse;
    }

    const putRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}`,
      session.accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      }
    );

    const putJson = (await putRes.json()) as {
      content?: { sha: string; path: string; html_url: string };
      commit?: { sha: string; html_url: string };
      message?: string;
    };

    if (putRes.status === 409) {
      return c.json(
        {
          code: 'SHA_CONFLICT',
          error:
            'This file has been modified on GitHub since you loaded it. Pull the latest changes or push to overwrite.',
        },
        409
      );
    }

    if (!putRes.ok || !putJson.content || !putJson.commit) {
      return c.json(
        { error: putJson.message || 'Failed to push commit to GitHub.' },
        putRes.status as 400
      );
    }

    return c.json({
      sha: putJson.content.sha,
      path: putJson.content.path,
      branch: targetBranch,
      htmlUrl: putJson.content.html_url,
      commitSha: putJson.commit.sha,
      commitUrl: putJson.commit.html_url,
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'GitHub push failed.' },
      502
    );
  }
});
