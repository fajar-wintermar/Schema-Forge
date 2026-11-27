import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ConflictError,
  PayloadTooLargeError,
  ValidationError,
} from '../../shared/domain/errors';
import { executeCompleteGithubOAuth } from '../../server/application/usecases/auth/completeGithubOAuth';
import { executeStartGithubOAuth } from '../../server/application/usecases/auth/startGithubOAuth';
import { executeResolvePublicShare } from '../../server/application/usecases/shares/resolvePublicShare';
import { executeSaveWorkspace } from '../../server/application/usecases/workspaces/saveWorkspace';
import type {
  GithubSessionPayload,
  GithubUserSummary,
  ServerConfig,
} from '../../server/domain/entities/types';
import type { IOAuthGateway } from '../../server/domain/gateways/IOAuthGateway';
import { isDisallowedHostname } from '../../server/domain/policies/urlSafetyPolicy';
import { validateServerEnv } from '../../server/infrastructure/config/serverEnv';
import { ensureMigrations } from '../../server/infrastructure/persistence/d1/d1Migrator';
import { D1ShareRepository } from '../../server/infrastructure/persistence/d1/D1ShareRepository';
import { D1UserRepository } from '../../server/infrastructure/persistence/d1/D1UserRepository';
import { D1WorkspaceRepository } from '../../server/infrastructure/persistence/d1/D1WorkspaceRepository';
import { createLocalSqliteD1 } from '../../server/infrastructure/persistence/sqlite/localSqliteD1';
import { SafeHttpRemoteFetcher } from '../../server/infrastructure/remote/safeHttpRemoteFetcher';
import { WebCryptoTokenCipher } from '../../server/infrastructure/security/webCryptoTokenCipher';
import { api, type AppEnv } from '../../server/presentation/http/app';
import {
  getSessionSecret,
  SESSION_MAX_AGE_MS,
} from '../../server/presentation/http/security/httpSecurity';

const TEST_SESSION_SECRET = 'test-session-secret-with-high-entropy-0123456789';

const USER_A: GithubUserSummary = {
  id: 1001,
  login: 'alice',
  name: 'Alice',
  avatar_url: 'https://avatars.githubusercontent.com/u/1001',
  html_url: 'https://github.com/alice',
};

const USER_B: GithubUserSummary = {
  id: 2002,
  login: 'bob',
  name: 'Bob',
  avatar_url: 'https://avatars.githubusercontent.com/u/2002',
  html_url: 'https://github.com/bob',
};

function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    nodeEnv: 'test',
    appUrl: 'https://schemaforge.example',
    allowedOrigins: ['https://schemaforge.example'],
    sessionSecret: TEST_SESSION_SECRET,
    githubClientId: 'gh_client_test',
    githubClientSecret: 'gh_secret_test',
    geminiApiKey: 'gemini_test_key',
    ...overrides,
  };
}

function createFakeOAuthGateway(user: GithubUserSummary): IOAuthGateway {
  return {
    buildAuthorizeUrl({ clientId, callbackUrl, state }) {
      const qs = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        scope: 'repo',
        state,
      });
      return `https://github.com/login/oauth/authorize?${qs.toString()}`;
    },
    async exchangeCodeForAccessToken() {
      return `gho_token_for_${user.login}`;
    },
    async fetchUserProfile() {
      return user;
    },
  };
}

describe('Server security, workspace ownership, OAuth & fetcher protections', () => {
  const closers: Array<() => void> = [];

  afterEach(() => {
    while (closers.length > 0) {
      const fn = closers.pop();
      fn?.();
    }
  });

  async function setupInMemoryDb() {
    const sqlite = createLocalSqliteD1(':memory:');
    closers.push(sqlite.close);
    await ensureMigrations(sqlite.db);
    return sqlite.db;
  }

  it('prevents User B from overwriting User A saved versions or hijacking share links via version ID collision', async () => {
    const db = await setupInMemoryDb();
    const userRepo = new D1UserRepository(db);
    const workspaceRepo = new D1WorkspaceRepository(db);
    const shareRepo = new D1ShareRepository(db);

    const sharedCollisionId = 'ver_shared_collision_id';

    await executeSaveWorkspace({
      workspaceRepository: workspaceRepo,
      userRepository: userRepo,
      user: USER_A,
      rawWorkspaceId: 'ws_alice',
      body: {
        name: 'Alice Workspace',
        dbml: 'Table alice_table { id int [pk] }',
        versions: [
          {
            id: sharedCollisionId,
            tag: 'v1.0.0',
            title: 'Alice Snapshot',
            description: 'Alice original schema',
            dbml: 'Table alice_secret_schema { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            isPublished: true,
          },
        ],
      },
    });

    await shareRepo.createShareLink({
      id: 'share_a_1',
      token: 'sharetokenalice1234',
      workspaceId: 'ws_alice',
      ownerUserId: 'gh_1001',
      label: 'Public Alice',
      pinnedVersionTag: 'v1.0.0',
      defaultView: 'docs',
      allowDiagramExport: false,
      createdByLogin: 'alice',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    });

    // Attacker (User B) saves their own workspace using User A's version ID
    await executeSaveWorkspace({
      workspaceRepository: workspaceRepo,
      userRepository: userRepo,
      user: USER_B,
      rawWorkspaceId: 'ws_bob',
      body: {
        name: 'Bob Workspace',
        dbml: 'Table bob_table { id int [pk] }',
        versions: [
          {
            id: sharedCollisionId,
            tag: 'v9.9.9',
            title: 'Attacker Overwrite',
            description: 'Injected description',
            dbml: 'Table attacker_pwned { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-02T00:00:00.000Z',
            isPublished: true,
          },
        ],
      },
    });

    const aliceWs = await workspaceRepo.findByIdForOwner('ws_alice', 'gh_1001');
    expect(aliceWs).not.toBeNull();
    expect(aliceWs?.versions).toHaveLength(1);
    expect(aliceWs?.versions[0].title).toBe('Alice Snapshot');
    expect(aliceWs?.versions[0].dbml).toContain('alice_secret_schema');

    const resolvedShare = await executeResolvePublicShare({
      shareRepository: shareRepo,
      rawToken: 'sharetokenalice1234',
    });
    expect(
      resolvedShare.content.parsedSchema.tables.map((t) => t.name)
    ).toEqual(['alice_secret_schema']);
  });

  it('masks internal DB version IDs in public unpinned share payloads', async () => {
    const db = await setupInMemoryDb();
    const userRepo = new D1UserRepository(db);
    const workspaceRepo = new D1WorkspaceRepository(db);
    const shareRepo = new D1ShareRepository(db);

    await executeSaveWorkspace({
      workspaceRepository: workspaceRepo,
      userRepository: userRepo,
      user: USER_A,
      rawWorkspaceId: 'ws_alice_public',
      body: {
        name: 'Alice Public',
        dbml: 'Table orders { id int [pk] }',
        versions: [
          {
            id: 'ver_internal_secret_uuid_123',
            tag: 'v1.0.0',
            title: 'Initial Release',
            description: '',
            dbml: 'Table orders { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            isPublished: true,
          },
        ],
      },
    });

    await shareRepo.createShareLink({
      id: 'share_a_2',
      token: 'sharetokenpublic5678',
      workspaceId: 'ws_alice_public',
      ownerUserId: 'gh_1001',
      label: 'Live',
      pinnedVersionTag: null,
      defaultView: 'docs',
      allowDiagramExport: false,
      createdByLogin: 'alice',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
    });

    const payload = await executeResolvePublicShare({
      shareRepository: shareRepo,
      rawToken: 'sharetokenpublic5678',
    });
    expect(payload.publishedVersions).toHaveLength(1);
    expect(payload.publishedVersions[0].id).toBe('v1.0.0');
    expect(payload.publishedVersions[0].id).not.toBe(
      'ver_internal_secret_uuid_123'
    );
  });

  it('enforces optimistic cloudRevision conflicts, prunes removed versions, and blocks malformed version wipes', async () => {
    const db = await setupInMemoryDb();
    const userRepo = new D1UserRepository(db);
    const workspaceRepo = new D1WorkspaceRepository(db);

    const first = await executeSaveWorkspace({
      workspaceRepository: workspaceRepo,
      userRepository: userRepo,
      user: USER_A,
      rawWorkspaceId: 'ws_rev',
      body: {
        name: 'Rev Test',
        dbml: 'Table users { id int [pk] }',
        versions: [
          {
            id: 'ver_1',
            tag: 'v1.0.0',
            title: 'V1',
            description: '',
            dbml: 'Table users { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            isPublished: true,
          },
          {
            id: 'ver_2',
            tag: 'v1.1.0',
            title: 'V2',
            description: '',
            dbml: 'Table users { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-02T00:00:00.000Z',
            isPublished: true,
          },
        ],
      },
    });
    expect(first.revision).toBe(1);

    // Malformed version array must reject cleanly instead of wiping saved versions
    await expect(
      executeSaveWorkspace({
        workspaceRepository: workspaceRepo,
        userRepository: userRepo,
        user: USER_A,
        rawWorkspaceId: 'ws_rev',
        body: {
          name: 'Rev Test',
          dbml: 'Table users { id int [pk] }',
          cloudRevision: 1,
          versions: [{ id: 'bad/id', tag: '', title: '' }],
        },
      })
    ).rejects.toBeInstanceOf(ValidationError);

    // Client deletes ver_1 and saves ver_2 with matching revision 1 -> revision becomes 2
    const second = await executeSaveWorkspace({
      workspaceRepository: workspaceRepo,
      userRepository: userRepo,
      user: USER_A,
      rawWorkspaceId: 'ws_rev',
      body: {
        name: 'Rev Test',
        dbml: 'Table users { id int [pk] }',
        cloudRevision: 1,
        versions: [
          {
            id: 'ver_2',
            tag: 'v1.1.0',
            title: 'V2',
            description: '',
            dbml: 'Table users { id int [pk] }',
            tablePositions: {},
            stickyNotes: [],
            createdAt: '2026-01-02T00:00:00.000Z',
            isPublished: true,
          },
        ],
      },
    });
    expect(second.revision).toBe(2);

    const saved = await workspaceRepo.findByIdForOwner('ws_rev', 'gh_1001');
    expect(saved?.versions.map((v) => v.id)).toEqual(['ver_2']);

    // Stale save with old cloudRevision=1 must fail with 409 ConflictError
    await expect(
      executeSaveWorkspace({
        workspaceRepository: workspaceRepo,
        userRepository: userRepo,
        user: USER_A,
        rawWorkspaceId: 'ws_rev',
        body: {
          name: 'Stale Overwrite',
          dbml: 'Table stale { id int [pk] }',
          cloudRevision: 1,
        },
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects expired sessions, ignores x-github-session headers, and invalidates sessions on logout', async () => {
    const db = await setupInMemoryDb();
    const cipher = new WebCryptoTokenCipher();
    const envBindings: AppEnv = {
      NODE_ENV: 'test',
      APP_URL: 'https://schemaforge.example',
      ALLOWED_ORIGIN: 'https://schemaforge.example',
      SESSION_SECRET: TEST_SESSION_SECRET,
      GITHUB_CLIENT_ID: 'gh_client_test',
      GITHUB_CLIENT_SECRET: 'gh_secret_test',
      DB: db,
    };

    const expiredCookieToken = await cipher.encrypt<GithubSessionPayload>(
      {
        accessToken: 'gho_expired',
        user: USER_A,
        iat: Date.now() - SESSION_MAX_AGE_MS - 60_000,
        jti: 'jti_expired_1',
      },
      TEST_SESSION_SECRET
    );

    const expiredRes = await api.fetch(
      new Request('https://schemaforge.example/api/auth/me', {
        headers: {
          Cookie: `sf_gh_session=${expiredCookieToken}`,
        },
      }),
      envBindings
    );
    const expiredBody = (await expiredRes.json()) as { authenticated: boolean };
    expect(expiredBody.authenticated).toBe(false);

    const validToken = await cipher.encrypt<GithubSessionPayload>(
      {
        accessToken: 'gho_valid',
        user: USER_A,
        iat: Date.now(),
        jti: 'jti_active_1',
      },
      TEST_SESSION_SECRET
    );

    // Legacy header-only replay must fail when no HttpOnly cookie is present
    const headerOnlyRes = await api.fetch(
      new Request('https://schemaforge.example/api/workspaces', {
        headers: {
          'x-github-session': validToken,
        },
      }),
      envBindings
    );
    expect(headerOnlyRes.status).toBe(401);

    // Valid cookie succeeds
    const validRes = await api.fetch(
      new Request('https://schemaforge.example/api/auth/me', {
        headers: {
          Cookie: `sf_gh_session=${validToken}`,
        },
      }),
      envBindings
    );
    const validBody = (await validRes.json()) as {
      authenticated: boolean;
      user: GithubUserSummary | null;
    };
    expect(validBody.authenticated).toBe(true);
    expect(validBody.user?.login).toBe('alice');

    // Logout revokes the jti on the server
    const logoutRes = await api.fetch(
      new Request('https://schemaforge.example/api/auth/github/logout', {
        method: 'POST',
        headers: {
          Origin: 'https://schemaforge.example',
          Cookie: `sf_gh_session=${validToken}`,
          'X-Requested-With': 'SchemaForge',
        },
      }),
      envBindings
    );
    expect(logoutRes.status).toBe(200);

    // Replaying the exact same cookie token after logout must be rejected
    const replayAfterLogoutRes = await api.fetch(
      new Request('https://schemaforge.example/api/workspaces', {
        headers: {
          Cookie: `sf_gh_session=${validToken}`,
        },
      }),
      envBindings
    );
    expect(replayAfterLogoutRes.status).toBe(401);
  });

  it('blocks OAuth login CSRF when state cookie is missing or mismatched', async () => {
    const db = await setupInMemoryDb();
    const cipher = new WebCryptoTokenCipher();
    const config = createTestConfig();
    const oauthGateway = createFakeOAuthGateway(USER_A);

    const startA = await executeStartGithubOAuth({
      config,
      sessionSecret: TEST_SESSION_SECRET,
      callbackUrl: 'https://schemaforge.example/api/auth/github/callback',
      tokenCipher: cipher,
      oauthGateway,
    });
    const startB = await executeStartGithubOAuth({
      config,
      sessionSecret: TEST_SESSION_SECRET,
      callbackUrl: 'https://schemaforge.example/api/auth/github/callback',
      tokenCipher: cipher,
      oauthGateway,
    });

    const stateA = new URL(startA.url).searchParams.get('state') || '';

    // Missing browser cookie -> rejected
    const noCookie = await executeCompleteGithubOAuth(
      {
        config,
        sessionSecret: TEST_SESSION_SECRET,
        callbackUrl: 'https://schemaforge.example/api/auth/github/callback',
        tokenCipher: cipher,
        oauthGateway,
        userRepository: new D1UserRepository(db),
      },
      { code: 'gh_code_1', state: stateA, cookieState: '', oauthError: '' }
    );
    expect(noCookie.ok).toBe(false);

    // Mismatched cookie nonce -> rejected
    const mismatched = await executeCompleteGithubOAuth(
      {
        config,
        sessionSecret: TEST_SESSION_SECRET,
        callbackUrl: 'https://schemaforge.example/api/auth/github/callback',
        tokenCipher: cipher,
        oauthGateway,
        userRepository: new D1UserRepository(db),
      },
      {
        code: 'gh_code_1',
        state: stateA,
        cookieState: startB.stateBindingToken,
        oauthError: '',
      }
    );
    expect(mismatched.ok).toBe(false);

    // Matching cookie nonce -> accepted
    const matched = await executeCompleteGithubOAuth(
      {
        config,
        sessionSecret: TEST_SESSION_SECRET,
        callbackUrl: 'https://schemaforge.example/api/auth/github/callback',
        tokenCipher: cipher,
        oauthGateway,
        userRepository: new D1UserRepository(db),
      },
      {
        code: 'gh_code_1',
        state: stateA,
        cookieState: startA.stateBindingToken,
        oauthError: '',
      }
    );
    expect(matched.ok).toBe(true);
  });

  it('requires dedicated SESSION_SECRET in production instead of falling back to GITHUB_CLIENT_SECRET', () => {
    expect(() =>
      validateServerEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'sqlite://./.data/test.sqlite',
        GEMINI_API_KEY: 'real_gemini_key',
        ALLOWED_ORIGIN: 'https://schemaforge.example',
        GITHUB_CLIENT_ID: 'gh_id',
        GITHUB_CLIENT_SECRET: 'gh_secret_only',
      })
    ).toThrow(/SESSION_SECRET/);

    expect(() =>
      getSessionSecret(
        createTestConfig({
          nodeEnv: 'production',
          sessionSecret: undefined,
          githubClientSecret: 'gh_secret_only',
        })
      )
    ).toThrow(/SESSION_SECRET/);
  });

  it('blocks DNS rebinding to private IPs, trailing-dot bypasses, and oversized streaming responses', async () => {
    expect(isDisallowedHostname('localhost.')).toBe(true);
    expect(isDisallowedHostname('metadata.google.internal.')).toBe(true);
    expect(isDisallowedHostname('ff02::1')).toBe(true);

    // DNS resolving a public-looking hostname to 127.0.0.1 must be rejected
    const rebindFetcher = new SafeHttpRemoteFetcher({
      dnsLookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    await expect(
      rebindFetcher.fetchText('https://rebind.attacker.example/schema.dbml', {
        timeoutMs: 3000,
        maxRedirects: 3,
        maxBytes: 1024,
        isDisallowedHostname,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    // Real streaming HTTP server verifying chunked > maxBytes abort without buffering whole stream
    const server = http.createServer((req, res) => {
      if (req.url === '/large-stream') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        for (let i = 0; i < 20; i++) {
          res.write('A'.repeat(256));
        }
        res.end();
        return;
      }
      if (req.url === '/redirect-private') {
        res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Table ok { id int [pk] }');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => {
      server.close();
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const testServerFetcher = new SafeHttpRemoteFetcher();
    const allowLocalInStreamTest = (host: string) => {
      if (host === '127.0.0.1') return false;
      return isDisallowedHostname(host);
    };

    await expect(
      testServerFetcher.fetchText(`http://127.0.0.1:${port}/large-stream`, {
        timeoutMs: 3000,
        maxRedirects: 3,
        maxBytes: 1024,
        isDisallowedHostname: allowLocalInStreamTest,
      })
    ).rejects.toBeInstanceOf(PayloadTooLargeError);

    await expect(
      testServerFetcher.fetchText(`http://127.0.0.1:${port}/redirect-private`, {
        timeoutMs: 3000,
        maxRedirects: 3,
        maxBytes: 1024,
        isDisallowedHostname: allowLocalInStreamTest,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    const okResult = await testServerFetcher.fetchText(
      `http://127.0.0.1:${port}/ok`,
      {
        timeoutMs: 3000,
        maxRedirects: 3,
        maxBytes: 1024,
        isDisallowedHostname: allowLocalInStreamTest,
      }
    );
    expect(okResult.ok).toBe(true);
    expect(okResult.bodyText).toBe('Table ok { id int [pk] }');
  });
});
