import { expect, test } from '@playwright/test';
import { parseDbml } from '../../src/utils/dbmlParser';
import { COMMERCE_V1_DBML } from '../../src/utils/sampleSchemas';

test.describe('SchemaForge E2E Smoke Suite', () => {
  test('Editor flow: editing, Alt+Z word wrap, modular subfolder Split -> Flatten -> Split, and Explorer toggle', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const hmrErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('SendBeforeConnectError')) {
        hmrErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for CodeMirror editor & valid DBML status
    const cmContent = page.locator('.cm-content').first();
    await expect(cmContent).toBeVisible();
    await expect(page.getByText('Valid DBML syntax')).toBeVisible();

    // Verify zero runtime HMR send errors
    expect(hmrErrors).toEqual([]);

    // Toggle word wrap via toolbar button
    const wrapBtn = page.getByRole('button', { name: 'Enable word wrap' });
    await expect(wrapBtn).toBeVisible();
    await expect(wrapBtn).toHaveAttribute('aria-pressed', 'false');
    await wrapBtn.click();

    const disableWrapBtn = page.getByRole('button', {
      name: 'Disable word wrap',
    });
    await expect(disableWrapBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cm-lineWrapping')).toBeVisible();

    // Toggle word wrap off via Alt+Z inside CodeMirror without inserting 'Ω'
    await cmContent.click();
    await page.keyboard.press('Alt+z');
    await expect(
      page.getByRole('button', { name: 'Enable word wrap' })
    ).toHaveAttribute('aria-pressed', 'false');
    const editorTextAfterAltZ = await cmContent.innerText();
    expect(editorTextAfterAltZ).not.toContain('Ω');

    // Split to modular schema/ mode
    await page.getByRole('button', { name: 'Split to schema/' }).click();
    const explorer = page.getByRole('complementary', {
      name: 'Schema File Explorer',
    });
    await expect(explorer).toBeVisible();
    await expect(page.getByText('Valid DBML (merged check)')).toBeVisible();

    // Create a custom nested subfolder module test/new.dbml
    await page
      .getByRole('button', { name: 'New .dbml file in schema/' })
      .click();
    const newFileInput = explorer.locator('input[placeholder$=".dbml"]');
    await newFileInput.fill('test/new.dbml');
    await explorer.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(explorer.getByText('new.dbml')).toBeVisible();
    await expect(explorer.getByText('test', { exact: true })).toBeVisible();

    // Toggle Explorer visibility off and back on from toolbar
    await page
      .getByRole('button', { name: 'Hide schema file explorer' })
      .click();
    await expect(explorer).toBeHidden();

    await page
      .getByRole('button', { name: 'Show schema file explorer' })
      .click();
    await expect(explorer).toBeVisible();

    // Flatten -> Split to schema/ must preserve test/new.dbml folder path
    await explorer.getByRole('button', { name: 'Flatten' }).click();
    await expect(explorer).toBeHidden();
    await expect(page.getByText('Valid DBML syntax')).toBeVisible();

    await page.getByRole('button', { name: 'Split to schema/' }).click();
    await expect(explorer).toBeVisible();
    await expect(explorer.getByText('test', { exact: true })).toBeVisible();
    await expect(explorer.getByText('new.dbml')).toBeVisible();

    // Verify syntax error detection & recovery inside the active file
    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('InvalidKeyword broken_block {');
    await expect(page.getByText(/1 error/i)).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('Diagram flow: view switch, detail visibility, Focus, Ortho routing, Auto Layout, Inspector & Dark Mode', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();

    // Switch to Diagram-only view mode via TopBar
    const viewGroup = page.getByRole('group', { name: 'Workspace View Mode' });
    await viewGroup.getByRole('button', { name: 'Diagram' }).click();

    // Left sidebar auto-opens in Diagram mode; tables render on canvas
    await expect(page.getByText('users').first()).toBeVisible();
    await expect(page.getByText('orders').first()).toBeVisible();

    // Toggle Focus Neighborhood mode
    const focusBtn = page.getByRole('button', { name: 'Focus', exact: true });
    await focusBtn.click();
    await expect(focusBtn).toHaveAttribute('title', /Focus Neighborhood Mode: On/i);

    // Toggle Edge Routing (Curved <-> Ortho)
    const routingBtn = page.getByRole('button', { name: /Curved|Ortho/ });
    const initialRouting = (await routingBtn.innerText()).trim();
    await routingBtn.click();
    const nextRouting = initialRouting === 'Curved' ? 'Ortho' : 'Curved';
    await expect(
      page.getByRole('button', { name: nextRouting, exact: true })
    ).toBeVisible();

    // Change Table Detail Visibility to Keys Only and back to All Fields
    await page.getByRole('button', { name: /All Fields/i }).click();
    await page.getByRole('button', { name: /Keys only/i }).click();
    await expect(page.getByRole('button', { name: /Keys Only/i })).toBeVisible();

    // Trigger Auto Layout
    await page.getByRole('button', { name: 'Auto Layout' }).click();

    // Click a table card in canvas to open InspectorDrawer (via Sidebar Domains or canvas node)
    // Use canvas table header directly
    const usersCardHeader = page
      .locator('main')
      .getByText('users', { exact: true })
      .first();
    await usersCardHeader.click();
    await expect(page.getByText('Table Inspector')).toBeVisible();

    // Toggle Dark Mode
    await page.getByRole('button', { name: 'Switch to Dark Mode' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Switch to Light Mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    expect(pageErrors).toEqual([]);
  });

  test('Docs flow: Overview, section navigation, table detail, and Global Command Palette', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();

    const viewGroup = page.getByRole('group', { name: 'Workspace View Mode' });
    await viewGroup.getByRole('button', { name: 'Docs' }).click();

    // Overview page stats & table list
    await expect(page.getByText(/\d+ Tables/)).toBeVisible();
    await expect(page.getByText(/\d+ Fields/)).toBeVisible();

    // Navigate to Relationships & Enums via Overview links
    await page.getByRole('button', { name: /Enums/ }).first().click();
    await expect(page.getByText('order_status').first()).toBeVisible();

    // Open Global Command Palette via TopBar trigger & jump to a table
    await page
      .getByRole('button', { name: 'Open Global Command Palette' })
      .click();
    const paletteDialog = page.getByRole('dialog', {
      name: 'Global Command Palette',
    });
    const paletteInput = paletteDialog.locator('input');
    await expect(paletteInput).toBeVisible();
    await paletteInput.fill('orders');
    await page.keyboard.press('Enter');

    await expect(page.getByText('order_items').first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('Share flow: create, preview read-only viewer, toggle export, delete hides immediately, and API 404 check', async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Verify real Hono share API returns 404 JSON for an unknown token
    const apiRes = await request.get('/api/share/nonexistent_smoke_token_999');
    expect(apiRes.status()).toBe(404);
    const apiBody = (await apiRes.json()) as { error?: string };
    expect(apiBody.error).toBeTruthy();

    // Deterministic stateful mock for cloud auth, workspace sync, and share links
    interface MockShare {
      id: string;
      token: string;
      workspaceId: string;
      label: string;
      pinnedVersionTag: string | null;
      defaultView: 'docs' | 'diagram';
      allowDiagramExport: boolean;
      createdByLogin: string;
      createdAt: string;
      expiresAt: string | null;
      revokedAt: string | null;
    }

    const shares = new Map<string, MockShare>();
    let seq = 1;
    let savedWorkspaceName = 'Omnichannel Commerce';

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          cloudEnabled: true,
          githubConfigured: true,
          authenticated: true,
          user: {
            id: 42,
            login: 'smoke-tester',
            name: 'Smoke Tester',
            avatarUrl: '',
          },
        }),
      });
    });

    await page.route('**/api/workspaces', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ workspaces: [] }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/workspaces/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/shares') || url.pathname.includes('/shares/')) {
        await route.fallback();
        return;
      }
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as { name?: string };
        if (body?.name) savedWorkspaceName = body.name;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            revision: 1,
            syncedAt: new Date().toISOString(),
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/workspaces/*/shares', async (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split('/');
      const workspaceId = parts[3] || 'ws_smoke';

      if (route.request().method() === 'GET') {
        const active = Array.from(shares.values()).filter(
          (s) => s.workspaceId === workspaceId && !s.revokedAt
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ shares: active }),
        });
        return;
      }

      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          label?: string;
          pinnedVersionTag?: string | null;
          defaultView?: 'docs' | 'diagram';
          allowDiagramExport?: boolean;
        };
        const id = `shr_smoke_${seq}`;
        const token = `sf_smoke_token_${seq}`;
        seq++;
        const record: MockShare = {
          id,
          token,
          workspaceId,
          label: body.label || 'Smoke Share',
          pinnedVersionTag: body.pinnedVersionTag ?? null,
          defaultView: body.defaultView === 'diagram' ? 'diagram' : 'docs',
          allowDiagramExport: Boolean(body.allowDiagramExport),
          createdByLogin: 'smoke-tester',
          createdAt: new Date().toISOString(),
          expiresAt: null,
          revokedAt: null,
        };
        shares.set(id, record);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ share: record }),
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/workspaces/*/shares/*', async (route) => {
      const url = new URL(route.request().url());
      const shareId = decodeURIComponent(url.pathname.split('/').pop() || '');
      const existing = shares.get(shareId);

      if (route.request().method() === 'PATCH') {
        if (!existing) {
          await route.fulfill({ status: 404, body: '{}' });
          return;
        }
        const patch = route.request().postDataJSON() as Partial<MockShare>;
        const updated: MockShare = {
          ...existing,
          ...patch,
        };
        shares.set(shareId, updated);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ share: updated }),
        });
        return;
      }

      if (route.request().method() === 'DELETE') {
        if (!existing) {
          await route.fulfill({ status: 404, body: '{}' });
          return;
        }
        existing.revokedAt = new Date().toISOString();
        shares.set(shareId, existing);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, revokedAt: existing.revokedAt }),
        });
        return;
      }

      await route.continue();
    });

    await page.route('**/api/share/*', async (route) => {
      const url = new URL(route.request().url());
      const token = decodeURIComponent(url.pathname.split('/')[3] || '');
      const matched = Array.from(shares.values()).find((s) => s.token === token);
      if (!matched || matched.revokedAt) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This share link does not exist or has been revoked.',
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          share: {
            id: matched.id,
            token: matched.token,
            label: matched.label,
            pinnedVersionTag: matched.pinnedVersionTag,
            activeVersionTag: null,
            defaultView: matched.defaultView,
            allowDiagramExport: matched.allowDiagramExport,
            workspaceName: savedWorkspaceName,
            workspaceDescription: 'Smoke test shared schema',
            updatedAt: new Date().toISOString(),
            createdByLogin: matched.createdByLogin,
          },
          content: {
            parsedSchema: parseDbml(COMMERCE_V1_DBML),
            tablePositions: {},
            stickyNotes: [],
            detailLevel: 'full',
            groupMeta: {},
          },
          publishedVersions: [],
        }),
      });
    });

    await page.goto('/');
    await expect(page.locator('.cm-content').first()).toBeVisible();

    // Open Share modal
    await page
      .getByRole('button', { name: 'Share', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Share Read-Only Docs & Diagram' })
    ).toBeVisible();

    // Create a share link with PNG/SVG export enabled
    await page
      .getByPlaceholder('e.g. Product & Backend Team')
      .fill('Backend Team Preview');
    await page
      .getByRole('switch', { name: 'Allow Diagram Export (PNG / SVG)' })
      .click();
    await page
      .getByRole('button', { name: 'Generate & Copy Share Link' })
      .click();

    await expect(page.getByText('Share Links (1)')).toBeVisible();
    await expect(page.getByText('Backend Team Preview')).toBeVisible();

    // Preview read-only share route (/share/:token)
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByText('View-Only')).toBeVisible();
    await expect(page.getByRole('button', { name: /Export/ })).toBeVisible();

    // Switch between Docs and Diagram inside read-only SharedViewerPage
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await expect(page.getByText('users', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Docs', exact: true }).click();
    await expect(page.getByText(/\d+ Tables/)).toBeVisible();

    // Return to studio and re-open Share modal
    await page.goBack();
    await expect(page.locator('.cm-content').first()).toBeVisible();

    await page
      .getByRole('button', { name: 'Share', exact: true })
      .first()
      .click();
    await expect(page.getByText('Share Links (1)')).toBeVisible();
    await expect(page.getByText('Backend Team Preview')).toBeVisible();

    // Delete share link -> disappears immediately from list
    await page.getByRole('button', { name: 'Delete share link' }).click();
    await expect(page.getByText('Share Links (0)')).toBeVisible();
    await expect(page.getByText('Backend Team Preview')).toBeHidden();
    await expect(
      page.getByText('No share links created yet for this workspace.')
    ).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
