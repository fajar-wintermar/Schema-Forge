import { expect, test } from '@playwright/test';
import { parseDbml } from '../../shared/domain/dbml';
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

    // Isolating one domain on the diagram canvas must not filter tables on the Docs page
    const isolateDomainBtn = page
      .locator('button[title="Show only this domain"]')
      .first();
    await expect(isolateDomainBtn).toBeVisible();
    await isolateDomainBtn.click();
    await expect(
      page.locator('button[title="Show all domains"]').first()
    ).toBeVisible();

    const viewGroup = page.getByRole('group', { name: 'Workspace View Mode' });
    await viewGroup.getByRole('button', { name: 'Docs' }).click();

    // Overview page stats & full unfiltered table list
    await expect(page.getByText(/\d+ Tables/)).toBeVisible();
    await expect(page.getByText(/\d+ Fields/)).toBeVisible();
    await expect(
      page.getByText(/Showing tables in selected domain/i)
    ).toHaveCount(0);
    await expect(page.getByText('users').first()).toBeVisible();
    await expect(page.getByText('products').first()).toBeVisible();
    await expect(page.getByText('orders').first()).toBeVisible();

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

  test('Quality Linter diagnostics & Canvas multi-select alignment + drag-to-connect FKs', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    const cmContent = page.locator('.cm-content').first();
    await expect(cmContent).toBeVisible();

    const testSchema = [
      'Table users {',
      '  id int [pk]',
      '  email varchar [unique]',
      '}',
      '',
      'Table orders {',
      '  user_id int',
      '  total_amount decimal',
      '}',
    ].join('\n');

    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(testSchema);

    await expect(page.getByText('Valid DBML syntax')).toBeVisible();

    // Non-blocking quality hints badge should appear in editor footer
    const qualityBtn = page.getByRole('button', { name: /quality hint/i });
    await expect(qualityBtn).toBeVisible();
    await qualityBtn.click();

    const qualityPanel = page.getByRole('region', {
      name: 'Schema Quality Diagnostics',
    });
    await expect(qualityPanel).toBeVisible();
    await expect(qualityPanel.getByText(/Missing PK/)).toBeVisible();
    await expect(qualityPanel.getByText(/Nullable Unique/)).toBeVisible();

    // Filter to warnings only
    await qualityPanel.getByRole('button', { name: /^Warn \(/ }).click();
    await expect(qualityPanel.getByText(/Missing PK/)).toBeVisible();
    await expect(qualityPanel.getByText(/Nullable Unique/)).toBeHidden();

    await qualityPanel
      .getByRole('button', { name: 'Close Schema Quality panel' })
      .click();
    await expect(qualityPanel).toBeHidden();

    // Auto Layout so both cards sit cleanly separated in viewport
    await page.getByRole('button', { name: 'Auto Layout' }).click();

    const usersCard = page.locator('[data-table-card="users"]').first();
    const ordersCard = page.locator('[data-table-card="orders"]').first();
    await expect(usersCard).toBeVisible();
    await expect(ordersCard).toBeVisible();

    // Drag ordersCard horizontally to the right so the two cards are side-by-side
    const initialOrdersBox = await ordersCard.boundingBox();
    expect(initialOrdersBox).not.toBeNull();
    await page.mouse.move(
      initialOrdersBox!.x + initialOrdersBox!.width / 2,
      initialOrdersBox!.y + 18
    );
    await page.mouse.down();
    await page.mouse.move(
      initialOrdersBox!.x + initialOrdersBox!.width / 2 + 340,
      initialOrdersBox!.y + 18,
      { steps: 6 }
    );
    await page.mouse.up();

    // Fit both side-by-side tables cleanly inside the canvas viewport
    await page.getByRole('button', { name: 'Fit diagram to viewport' }).click();

    // orders is already selected from the drag; Shift+Click users to multi-select both
    await usersCard.click({ modifiers: ['Shift'] });

    const alignToolbar = page.getByRole('toolbar', {
      name: 'Multi-select table alignment',
    });
    await expect(alignToolbar).toBeVisible();
    await expect(alignToolbar.getByText('2 selected')).toBeVisible();

    await alignToolbar.getByRole('button', { name: 'Align top' }).click();
    const usersBox = await usersCard.boundingBox();
    const ordersBox = await ordersCard.boundingBox();
    expect(usersBox).not.toBeNull();
    expect(ordersBox).not.toBeNull();
    expect(Math.abs((usersBox?.y ?? 0) - (ordersBox?.y ?? 100))).toBeLessThan(3);

    await alignToolbar
      .getByRole('button', { name: 'Clear multi-selection' })
      .click();
    await expect(alignToolbar).toBeHidden();

    // Drag-to-connect from orders.user_id handle to users.id column row
    const sourceCol = page.locator('[data-fk-col="orders.user_id"]').first();
    await sourceCol.hover();
    const handle = page
      .locator('[data-fk-handle="orders.user_id:left"]')
      .first();
    const targetCol = page.locator('[data-fk-col="users.id"]').first();

    const hBox = await handle.boundingBox();
    const tBox = await targetCol.boundingBox();
    expect(hBox).not.toBeNull();
    expect(tBox).not.toBeNull();

    await page.mouse.move(
      hBox!.x + hBox!.width / 2,
      hBox!.y + hBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      tBox!.x + tBox!.width / 2,
      tBox!.y + tBox!.height / 2,
      { steps: 8 }
    );
    await page.mouse.up();

    await expect(
      page.getByText('Added Ref: orders.user_id > users.id')
    ).toBeVisible();
    const updatedDbml = await cmContent.innerText();
    expect(updatedDbml).toContain('Ref: orders.user_id > users.id');

    expect(pageErrors).toEqual([]);
  });

  test('Enterprise 160-table Canvas Virtualization: Auto-LOD on fit-view and viewport culling on zoom-in', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    const cmContent = page.locator('.cm-content').first();
    await expect(cmContent).toBeVisible();

    // Generate a 160-table enterprise DBML schema across 10 domains
    const blocks: string[] = [];
    const domainTables: string[][] = Array.from({ length: 10 }, () => []);
    for (let i = 0; i < 160; i++) {
      const domainIdx = Math.floor(i / 16);
      const tName = `ent_table_${i}`;
      domainTables[domainIdx].push(tName);
      const fkLine =
        i > 0 && i % 4 !== 0
          ? `\n  parent_id int [ref: > ent_table_${i - 1}.id]`
          : '';
      blocks.push(
        `Table ${tName} {\n  id int [pk]\n  name varchar${fkLine}\n}`
      );
    }
    domainTables.forEach((tbls, dIdx) => {
      blocks.push(`TableGroup domain_${dIdx} {\n  ${tbls.join('\n  ')}\n}`);
    });
    const enterpriseDbml = blocks.join('\n\n');

    await cmContent.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(enterpriseDbml);

    await expect(page.getByText('Valid DBML syntax')).toBeVisible();

    // Switch to Diagram view & run Auto Layout + Fit View
    const viewGroup = page.getByRole('group', { name: 'Workspace View Mode' });
    await viewGroup.getByRole('button', { name: 'Diagram' }).click();

    await page.getByRole('button', { name: 'Auto Layout' }).click();
    await page.getByRole('button', { name: 'Fit diagram to viewport' }).click();

    // Fit view zooms way out on 160 tables -> Minimal/Compact LOD kicks in automatically
    const virtStatus = page.getByLabel('Canvas virtualization status');
    await expect(virtStatus).toBeVisible();
    await expect(virtStatus).toContainText(/160 tables/);
    await expect(virtStatus).toContainText(/LOD/);

    const lodAttrAtOverview = await page
      .locator('[data-table-card]')
      .first()
      .getAttribute('data-lod');
    expect(['minimal', 'compact']).toContain(lodAttrAtOverview);

    // Jump to one specific table via Global Command Palette -> zooms to ~0.9x,
    // triggers viewport culling (< 160 cards mounted) and restores full LOD
    await page
      .getByRole('button', { name: 'Open Global Command Palette' })
      .click();
    const paletteInput = page
      .getByRole('dialog', { name: 'Global Command Palette' })
      .locator('input');
    await paletteInput.fill('ent_table_84');
    await page.keyboard.press('Enter');

    const mountedCardCount = await page.locator('[data-table-card]').count();
    expect(mountedCardCount).toBeGreaterThan(0);
    expect(mountedCardCount).toBeLessThan(120);

    const focusedCard = page
      .locator('[data-table-card="ent_table_84"]')
      .first();
    await expect(focusedCard).toBeVisible();
    await expect(focusedCard).toHaveAttribute('data-lod', 'full');

    expect(pageErrors).toEqual([]);
  });
});
