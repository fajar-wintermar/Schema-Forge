import { afterEach, describe, expect, it } from 'vitest';
import type {
  GithubSessionPayload,
  GithubUserSummary,
} from '../../server/domain/entities/types';
import type {
  IRemoteFetcher,
  RemoteHttpFetchResult,
} from '../../server/domain/gateways/IRemoteFetcher';
import { ensureMigrations } from '../../server/infrastructure/persistence/d1/d1Migrator';
import { createLocalSqliteD1 } from '../../server/infrastructure/persistence/sqlite/localSqliteD1';
import { WebCryptoTokenCipher } from '../../server/infrastructure/security/webCryptoTokenCipher';
import { api, type AppEnv } from '../../server/presentation/http/app';

const TEST_ORIGIN = 'https://schemaforge.example';
const TEST_SESSION_SECRET = 'api-route-test-secret-with-high-entropy-98765';

const ALICE: GithubUserSummary = {
  id: 101,
  login: 'alice',
  name: 'Alice',
  avatar_url: 'https://avatars.githubusercontent.com/u/101',
  html_url: 'https://github.com/alice',
};

const BOB: GithubUserSummary = {
  id: 202,
  login: 'bob',
  name: 'Bob',
  avatar_url: 'https://avatars.githubusercontent.com/u/202',
  html_url: 'https://github.com/bob',
};

const closers: Array<() => void> = [];

afterEach(() => {
  while (closers.length > 0) {
    closers.pop()?.();
  }
});

async function createApiEnv(overrides: Partial<AppEnv> = {}): Promise<AppEnv> {
  const sqlite = createLocalSqliteD1(':memory:');
  closers.push(() => sqlite.close());
  await ensureMigrations(sqlite.db);
  return {
    NODE_ENV: 'test',
    APP_URL: TEST_ORIGIN,
    ALLOWED_ORIGIN: TEST_ORIGIN,
    SESSION_SECRET: TEST_SESSION_SECRET,
    GITHUB_CLIENT_ID: 'gh_test_client_id',
    GITHUB_CLIENT_SECRET: 'gh_test_client_secret',
    DB: sqlite.db,
    ...overrides,
  };
}

async function createSessionCookie(
  user: GithubUserSummary,
  jti = `jti_${user.id}_${Date.now()}`
): Promise<string> {
  const cipher = new WebCryptoTokenCipher();
  const token = await cipher.encrypt<GithubSessionPayload>(
    {
      accessToken: `gho_token_${user.login}`,
      user,
      iat: Date.now(),
      jti,
    },
    TEST_SESSION_SECRET
  );
  return `sf_gh_session=${token}`;
}

function apiRequest(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    origin?: string | null;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const headers = new Headers(options.headers);
  if (options.cookie) {
    headers.set('Cookie', options.cookie);
  }
  if (options.origin !== null) {
    headers.set('Origin', options.origin ?? TEST_ORIGIN);
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return new Request(`${TEST_ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe('HTTP API routes', () => {
  it('handles /healthz availability, 404 fallback, security headers, and CORS origin allowlist', async () => {
    const noDbRes = await api.fetch(apiRequest('/healthz'), {
      NODE_ENV: 'test',
      APP_URL: TEST_ORIGIN,
      ALLOWED_ORIGIN: TEST_ORIGIN,
      SESSION_SECRET: TEST_SESSION_SECRET,
    });
    expect(noDbRes.status).toBe(503);
    expect(await noDbRes.json()).toEqual({ status: 'error', db: 'unavailable' });

    const env = await createApiEnv();
    const okRes = await api.fetch(apiRequest('/healthz'), env);
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ status: 'ok', db: 'connected' });
    expect(okRes.headers.get('x-content-type-options')).toBe('nosniff');

    const notFoundRes = await api.fetch(apiRequest('/api/does-not-exist'), env);
    expect(notFoundRes.status).toBe(404);
    expect(await notFoundRes.json()).toEqual({ error: 'API endpoint not found.' });

    const allowedCorsRes = await api.fetch(
      apiRequest('/api/auth/me', { origin: TEST_ORIGIN }),
      env
    );
    expect(allowedCorsRes.headers.get('access-control-allow-origin')).toBe(
      TEST_ORIGIN
    );

    const blockedCorsRes = await api.fetch(
      apiRequest('/api/auth/me', { origin: 'https://evil.example' }),
      env
    );
    expect(blockedCorsRes.headers.get('access-control-allow-origin')).toBeFalsy();
  });

  it('serves auth status, issues bound OAuth state cookies, and escapes callback errors', async () => {
    const env = await createApiEnv();

    const anonMeRes = await api.fetch(apiRequest('/api/auth/me'), env);
    expect(anonMeRes.status).toBe(200);
    expect(await anonMeRes.json()).toMatchObject({
      cloudEnabled: true,
      githubConfigured: true,
      authenticated: false,
      user: null,
    });

    const urlRes = await api.fetch(apiRequest('/api/auth/github/url'), env);
    expect(urlRes.status).toBe(200);
    const urlPayload = (await urlRes.json()) as { url: string };
    const oauthUrl = new URL(urlPayload.url);
    expect(oauthUrl.origin).toBe('https://github.com');
    expect(oauthUrl.searchParams.get('state')).toBeTruthy();
    const setCookieHeader = urlRes.headers.get('set-cookie') || '';
    expect(setCookieHeader).toContain('sf_oauth_state=');
    expect(setCookieHeader.toLowerCase()).toContain('httponly');

    // Callback with XSS payload in error_description must escape HTML and clear state cookie
    const callbackErrRes = await api.fetch(
      apiRequest(
        '/api/auth/github/callback?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
      ),
      env
    );
    expect(callbackErrRes.status).toBe(400);
    const errHtml = await callbackErrRes.text();
    expect(errHtml).not.toContain('<script>alert(1)</script>');
    expect(errHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');

    const aliceCookie = await createSessionCookie(ALICE);
    const authedStatusRes = await api.fetch(
      apiRequest('/api/auth/github/status', { cookie: aliceCookie }),
      env
    );
    expect(authedStatusRes.status).toBe(200);
    expect(await authedStatusRes.json()).toMatchObject({
      configured: true,
      connected: true,
      user: { login: 'alice' },
    });

    const badLogoutRes = await api.fetch(
      apiRequest('/api/auth/github/logout', {
        method: 'POST',
        cookie: aliceCookie,
        origin: 'https://evil.example',
      }),
      env
    );
    expect(badLogoutRes.status).toBe(403);
  });

  it('enforces auth, origin, validation, revision checks, and owner isolation on /api/workspaces', async () => {
    const env = await createApiEnv();
    const aliceCookie = await createSessionCookie(ALICE);
    const bobCookie = await createSessionCookie(BOB);

    const unauthListRes = await api.fetch(apiRequest('/api/workspaces'), env);
    expect(unauthListRes.status).toBe(401);

    const badOriginSaveRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'PUT',
        cookie: aliceCookie,
        origin: 'https://attacker.example',
        body: { name: 'Alice DB', dbml: 'Table users { id int [pk] }' },
      }),
      env
    );
    expect(badOriginSaveRes.status).toBe(403);

    const invalidIdRes = await api.fetch(
      apiRequest('/api/workspaces/invalid$id', {
        method: 'PUT',
        cookie: aliceCookie,
        body: { name: 'Bad ID', dbml: '' },
      }),
      env
    );
    expect(invalidIdRes.status).toBe(400);

    const invalidBodyRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'PUT',
        cookie: aliceCookie,
        body: { name: '   ', dbml: '' },
      }),
      env
    );
    expect(invalidBodyRes.status).toBe(400);

    // Alice saves workspace
    const saveRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'PUT',
        cookie: aliceCookie,
        body: {
          name: 'Alice Commerce',
          description: 'Core tables',
          dbml: 'Table users { id uuid [pk] }',
          detailLevel: 'full',
          versions: [
            {
              id: 'ver_a1',
              tag: 'v1.0.0',
              title: 'Initial',
              description: '',
              dbml: 'Table users { id uuid [pk] }',
              tablePositions: {},
              stickyNotes: [],
              createdAt: '2026-01-01T00:00:00.000Z',
              isPublished: true,
            },
          ],
        },
      }),
      env
    );
    expect(saveRes.status).toBe(200);
    expect(await saveRes.json()).toMatchObject({ ok: true, revision: 1 });

    // Alice lists and gets her workspace
    const aliceListRes = await api.fetch(
      apiRequest('/api/workspaces', { cookie: aliceCookie }),
      env
    );
    expect(aliceListRes.status).toBe(200);
    const aliceListBody = (await aliceListRes.json()) as {
      workspaces: Array<{ id: string; name: string }>;
    };
    expect(aliceListBody.workspaces.map((w) => w.id)).toEqual(['ws_alice_1']);

    const aliceGetRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', { cookie: aliceCookie }),
      env
    );
    expect(aliceGetRes.status).toBe(200);
    const aliceGetBody = (await aliceGetRes.json()) as {
      workspace: { id: string; name: string; versions: Array<{ id: string }> };
    };
    expect(aliceGetBody.workspace.name).toBe('Alice Commerce');
    expect(aliceGetBody.workspace.versions.map((v) => v.id)).toEqual(['ver_a1']);

    // Bob cannot list, read, overwrite, or delete Alice's workspace
    const bobListRes = await api.fetch(
      apiRequest('/api/workspaces', { cookie: bobCookie }),
      env
    );
    expect(
      ((await bobListRes.json()) as { workspaces: unknown[] }).workspaces
    ).toEqual([]);

    const bobGetRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', { cookie: bobCookie }),
      env
    );
    expect(bobGetRes.status).toBe(404);

    const bobPutRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'PUT',
        cookie: bobCookie,
        body: { name: 'Hijacked', dbml: 'Table pwned { id int }' },
      }),
      env
    );
    expect(bobPutRes.status).toBe(403);

    const bobDeleteRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'DELETE',
        cookie: bobCookie,
      }),
      env
    );
    expect(bobDeleteRes.status).toBe(200);
    const aliceStillIntactRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', { cookie: aliceCookie }),
      env
    );
    expect(aliceStillIntactRes.status).toBe(200);

    // Stale revision by Alice returns 409 Conflict
    const conflictRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'PUT',
        cookie: aliceCookie,
        body: {
          name: 'Alice Commerce',
          dbml: 'Table users { id uuid [pk] }',
          cloudRevision: 0,
        },
      }),
      env
    );
    expect(conflictRes.status).toBe(409);

    // Alice deletes her workspace
    const aliceDeleteRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', {
        method: 'DELETE',
        cookie: aliceCookie,
      }),
      env
    );
    expect(aliceDeleteRes.status).toBe(200);
    expect(await aliceDeleteRes.json()).toEqual({ ok: true });

    const afterDeleteRes = await api.fetch(
      apiRequest('/api/workspaces/ws_alice_1', { cookie: aliceCookie }),
      env
    );
    expect(afterDeleteRes.status).toBe(404);
  });

  it('manages share links, public resolution, version switching, and revocation via /api/share*', async () => {
    const env = await createApiEnv();
    const aliceCookie = await createSessionCookie(ALICE);
    const bobCookie = await createSessionCookie(BOB);

    const saveRes = await api.fetch(
      apiRequest('/api/workspaces/ws_share_1', {
        method: 'PUT',
        cookie: aliceCookie,
        body: {
          name: 'Shared Atlas',
          dbml: 'Table live_tbl { id int [pk] }',
          versions: [
            {
              id: 'ver_internal_id_1',
              tag: 'v1.0.0',
              title: 'V1 Release',
              description: 'Snapshot',
              dbml: 'Table v1_tbl { id int [pk] }',
              tablePositions: {},
              stickyNotes: [],
              createdAt: '2026-01-01T00:00:00.000Z',
              isPublished: true,
            },
          ],
        },
      }),
      env
    );
    expect(saveRes.status).toBe(200);

    // Bob cannot create share links on Alice's workspace
    const bobShareRes = await api.fetch(
      apiRequest('/api/workspaces/ws_share_1/shares', {
        method: 'POST',
        cookie: bobCookie,
        body: { label: 'Unauthorized' },
      }),
      env
    );
    expect(bobShareRes.status).toBe(404);

    // Alice creates a share link
    const createShareRes = await api.fetch(
      apiRequest('/api/workspaces/ws_share_1/shares', {
        method: 'POST',
        cookie: aliceCookie,
        body: {
          label: 'Public Docs',
          defaultView: 'docs',
          allowDiagramExport: false,
        },
      }),
      env
    );
    expect(createShareRes.status).toBe(200);
    const { share } = (await createShareRes.json()) as {
      share: { id: string; token: string; allowDiagramExport: boolean };
    };
    expect(share.token).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(share.allowDiagramExport).toBe(false);

    // Public list & update
    const listSharesRes = await api.fetch(
      apiRequest('/api/workspaces/ws_share_1/shares', { cookie: aliceCookie }),
      env
    );
    expect(listSharesRes.status).toBe(200);
    expect(
      ((await listSharesRes.json()) as { shares: unknown[] }).shares
    ).toHaveLength(1);

    const patchShareRes = await api.fetch(
      apiRequest(`/api/workspaces/ws_share_1/shares/${share.id}`, {
        method: 'PATCH',
        cookie: aliceCookie,
        body: { allowDiagramExport: true, defaultView: 'diagram' },
      }),
      env
    );
    expect(patchShareRes.status).toBe(200);
    expect(
      ((await patchShareRes.json()) as { share: { allowDiagramExport: boolean } })
        .share.allowDiagramExport
    ).toBe(true);

    // Public viewer fetches live & published version without auth
    const liveShareRes = await api.fetch(
      apiRequest(`/api/share/${share.token}`),
      env
    );
    expect(liveShareRes.status).toBe(200);
    const livePayload = (await liveShareRes.json()) as {
      content: { parsedSchema: { tables: Array<{ name: string }> } };
      publishedVersions: Array<{ id: string; tag: string }>;
    };
    expect(livePayload.content.parsedSchema.tables.map((t) => t.name)).toEqual([
      'live_tbl',
    ]);
    expect(livePayload.publishedVersions[0].id).toBe('v1.0.0');

    const versionShareRes = await api.fetch(
      apiRequest(`/api/share/${share.token}/v1.0.0`),
      env
    );
    expect(versionShareRes.status).toBe(200);
    const versionPayload = (await versionShareRes.json()) as {
      content: { parsedSchema: { tables: Array<{ name: string }> } };
    };
    expect(
      versionPayload.content.parsedSchema.tables.map((t) => t.name)
    ).toEqual(['v1_tbl']);

    // Unknown or invalid share token handling
    const badTokenRes = await api.fetch(apiRequest('/api/share/bad!'), env);
    expect(badTokenRes.status).toBe(400);
    const missingTokenRes = await api.fetch(
      apiRequest('/api/share/missing_token_12345'),
      env
    );
    expect(missingTokenRes.status).toBe(404);

    // Revoking share blocks further public access
    const revokeRes = await api.fetch(
      apiRequest(`/api/workspaces/ws_share_1/shares/${share.id}`, {
        method: 'DELETE',
        cookie: aliceCookie,
      }),
      env
    );
    expect(revokeRes.status).toBe(200);

    const revokedPublicRes = await api.fetch(
      apiRequest(`/api/share/${share.token}`),
      env
    );
    expect(revokedPublicRes.status).toBe(404);
  });

  it('validates and serves /api/fetch-url while blocking private targets and HTML webpages', async () => {
    const fakeFetcher: IRemoteFetcher = {
      async fetchText(url): Promise<RemoteHttpFetchResult> {
        if (url.endsWith('/page.html')) {
          return {
            resolvedUrl: url,
            status: 200,
            statusText: 'OK',
            ok: true,
            contentType: 'text/html; charset=utf-8',
            bodyText: '<!DOCTYPE html><html><body>Not DBML</body></html>',
          };
        }
        return {
          resolvedUrl: url,
          status: 200,
          statusText: 'OK',
          ok: true,
          contentType: 'text/plain; charset=utf-8',
          bodyText: 'Table remote_users { id uuid [pk] }',
        };
      },
    };
    const env = await createApiEnv({ REMOTE_FETCHER: fakeFetcher });

    const missingUrlRes = await api.fetch(
      apiRequest('/api/fetch-url?url='),
      env
    );
    expect(missingUrlRes.status).toBe(400);

    const ssrfRes = await api.fetch(
      apiRequest('/api/fetch-url', {
        method: 'POST',
        body: { url: 'http://169.254.169.254/latest/meta-data/' },
      }),
      env
    );
    expect(ssrfRes.status).toBe(400);

    const htmlRes = await api.fetch(
      apiRequest('/api/fetch-url', {
        method: 'POST',
        body: { url: 'https://schemas.example/page.html' },
      }),
      env
    );
    expect(htmlRes.status).toBe(422);

    const getOkRes = await api.fetch(
      apiRequest(
        '/api/fetch-url?url=https%3A%2F%2Fschemas.example%2Fcore.dbml'
      ),
      env
    );
    expect(getOkRes.status).toBe(200);
    expect(await getOkRes.json()).toMatchObject({
      content: 'Table remote_users { id uuid [pk] }',
      filename: 'core.dbml',
    });

    const postOkRes = await api.fetch(
      apiRequest('/api/fetch-url', {
        method: 'POST',
        body: { url: 'https://schemas.example/billing.dbml' },
      }),
      env
    );
    expect(postOkRes.status).toBe(200);
    expect(await postOkRes.json()).toMatchObject({
      content: 'Table remote_users { id uuid [pk] }',
      filename: 'billing.dbml',
    });
  });

  it('validates parameters, origin, and auth on /api/github read & write routes', async () => {
    const env = await createApiEnv();

    const badRepoInfoRes = await api.fetch(
      apiRequest('/api/github/repo-info?owner=bad/owner&repo=test'),
      env
    );
    expect(badRepoInfoRes.status).toBe(400);

    const emptyFolderRes = await api.fetch(
      apiRequest('/api/github/folder?owner=acme&repo=schema&folder=/'),
      env
    );
    expect(emptyFolderRes.status).toBe(400);

    const badOriginPushRes = await api.fetch(
      apiRequest('/api/github/push', {
        method: 'POST',
        origin: 'https://evil.example',
        body: {
          owner: 'acme',
          repo: 'schema',
          path: 'schema.dbml',
          branch: 'main',
          message: 'update',
          content: 'Table a { id int }',
        },
      }),
      env
    );
    expect(badOriginPushRes.status).toBe(403);

    const unauthPushRes = await api.fetch(
      apiRequest('/api/github/push', {
        method: 'POST',
        body: {
          owner: 'acme',
          repo: 'schema',
          path: 'schema.dbml',
          branch: 'main',
          message: 'update',
          content: 'Table a { id int }',
        },
      }),
      env
    );
    expect(unauthPushRes.status).toBe(401);

    const emptyBatchRes = await api.fetch(
      apiRequest('/api/github/push-batch', {
        method: 'POST',
        body: {
          owner: 'acme',
          repo: 'schema',
          branch: 'main',
          message: 'update',
          files: [],
        },
      }),
      env
    );
    expect(emptyBatchRes.status).toBe(400);

    const unauthPrRes = await api.fetch(
      apiRequest('/api/github/create-pr', {
        method: 'POST',
        body: {
          owner: 'acme',
          repo: 'schema',
          head: 'feat/db',
          base: 'main',
          title: 'Add table',
        },
      }),
      env
    );
    expect(unauthPrRes.status).toBe(401);
  });
});
