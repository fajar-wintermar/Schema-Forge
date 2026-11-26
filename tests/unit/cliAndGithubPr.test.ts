import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  introspectSqliteToDbml,
  runSchemaCheck,
  runSchemaExport,
} from '../../cli/cliCore';
import { executeCreateGithubPullRequest } from '../../server/application/usecases/github/createPullRequest';
import type { IGithubGateway } from '../../server/domain/gateways/IGithubGateway';
import {
  UnauthorizedError,
  ValidationError,
} from '../../shared/domain/errors';

const require = createRequire(import.meta.url);
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'schemaforge-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('SchemaForge CLI core engine', () => {
  it('checks modular schema directories, detects breaking changes vs base, and exports formats', async () => {
    const dir = await makeTempDir();
    const baseDir = path.join(dir, 'base-schema');
    const headDir = path.join(dir, 'head-schema');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(headDir, { recursive: true });

    await fs.writeFile(
      path.join(baseDir, '01_users.dbml'),
      `Table users {\n  id uuid [pk]\n  legacy_token text\n}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(headDir, '01_users.dbml'),
      `Table users {\n  id uuid [pk]\n  email varchar [not null, unique]\n}\n`,
      'utf8'
    );

    const checkReport = await runSchemaCheck({
      targetPath: headDir,
      basePath: baseDir,
      strict: true,
    });

    expect(checkReport.ok).toBe(false); // dropped column triggers breaking under --strict
    expect(
      checkReport.breakingChanges.some(
        (b) => b.category === 'column-removed' && b.message.includes('legacy_token')
      )
    ).toBe(true);
    expect(checkReport.markdown).toContain('Potential Breaking Changes');

    const mermaidOut = await runSchemaExport({
      targetPath: headDir,
      format: 'mermaid',
    });
    expect(mermaidOut.content).toContain('erDiagram');

    const htmlOut = await runSchemaExport({
      targetPath: headDir,
      format: 'html',
      title: 'CLI Docs',
    });
    expect(htmlOut.content).toContain('CLI Docs — Schema Documentation');
    expect(htmlOut.content).toContain('class="svg-table" data-table-id="users"');
  });

  it('introspects a live SQLite database into DBML with FKs, indexes, and drift report', async () => {
    const dir = await makeTempDir();
    const sqlitePath = path.join(dir, 'app.sqlite');
    const baselinePath = path.join(dir, 'baseline.dbml');

    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (p: string) => {
        exec: (sql: string) => void;
        close: () => void;
      };
    };

    const db = new DatabaseSync(sqlitePath);
    db.exec(`
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE
      );
      CREATE TABLE members (
        id INTEGER PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member'
      );
      CREATE INDEX idx_members_account ON members(account_id);
    `);
    db.close();

    await fs.writeFile(
      baselinePath,
      `Table accounts {\n  id integer [pk]\n}\n`,
      'utf8'
    );

    const pulled = await introspectSqliteToDbml({
      sourcePath: sqlitePath,
      againstPath: baselinePath,
    });

    expect(pulled.tableCount).toBe(2);
    expect(pulled.refCount).toBe(1);
    expect(pulled.dbml).toContain('Table accounts');
    expect(pulled.dbml).toContain('Table members');
    expect(pulled.dbml).toContain('Ref: members.account_id > accounts.id');
    expect(pulled.driftMarkdown).toContain('members');
  });
});

describe('executeCreateGithubPullRequest usecase', () => {
  const createStubGateway = (): IGithubGateway => ({
    getRepository: vi.fn(),
    listBranches: vi.fn(),
    isRepositoryEmpty: vi.fn(),
    getRecursiveTree: vi.fn(),
    getFileContents: vi.fn(),
    tryGetOptionalFileSha: vi.fn(),
    getGistFile: vi.fn(),
    batchReadBlobs: vi.fn(),
    listCommits: vi.fn(),
    createInitialReadme: vi.fn(),
    createBranchRef: vi.fn(),
    getBranchHeadCommitSha: vi.fn(),
    getCommitTreeSha: vi.fn(),
    getTreeBlobShas: vi.fn(),
    putSingleFile: vi.fn(),
    putInitialBatchFirstFile: vi.fn(),
    commitInlineTree: vi.fn(),
    createPullRequest: vi.fn(async (p) => ({
      number: 42,
      url: `https://github.com/${p.owner}/${p.repo}/pull/42`,
      title: p.title,
      state: 'open',
      headBranch: p.head,
      baseBranch: p.base,
    })),
  });

  it('creates a pull request when authorized and branches differ', async () => {
    const gw = createStubGateway();
    const res = await executeCreateGithubPullRequest({
      githubGateway: gw,
      accessToken: 'gho_test_token',
      body: {
        owner: 'acme',
        repo: 'db-schema',
        title: 'Add billing ledger',
        body: '## Schema Diff',
        head: 'feat/billing',
        base: 'main',
      },
    });

    expect(res.number).toBe(42);
    expect(res.url).toBe('https://github.com/acme/db-schema/pull/42');
    expect(gw.createPullRequest).toHaveBeenCalledOnce();
  });

  it('rejects unauthenticated requests and invalid or identical branches', async () => {
    const gw = createStubGateway();

    await expect(
      executeCreateGithubPullRequest({
        githubGateway: gw,
        body: {
          owner: 'acme',
          repo: 'db',
          title: 'PR',
          head: 'feat',
          base: 'main',
        },
      })
    ).rejects.toThrow(UnauthorizedError);

    await expect(
      executeCreateGithubPullRequest({
        githubGateway: gw,
        accessToken: 'tok',
        body: {
          owner: 'acme',
          repo: 'db',
          title: 'PR',
          head: 'main',
          base: 'main',
        },
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      executeCreateGithubPullRequest({
        githubGateway: gw,
        accessToken: 'tok',
        body: {
          owner: 'acme',
          repo: 'db',
          title: 'PR',
          head: 'bad branch name',
          base: 'main',
        },
      })
    ).rejects.toThrow(ValidationError);
  });
});
