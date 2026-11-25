# SchemaForge — DBML Viewer, ER Diagrammer & Database Docs Studio
<div>
<img align="left" src="public/pwa-192x192.png" width="100">
<b>SchemaForge</b> is an interactive DBML (Database Markup Language) editor, ER diagrammer, and engineering documentation studio built for teams working on complex, multi-domain schemas. It pairs a modular CodeMirror 6 DBML workspace with business-domain clustering, visual decluttering tools, dbdocs-style documentation, local-first encrypted IndexedDB persistence, optional Cloudflare D1 / SQLite cloud sync, shareable read-only schema links, and two-way GitHub repository synchronization—structured on a Clean Architecture core shared across Node.js, Cloudflare Workers, and Cloudflare Pages.
<br clear="left"/>
<br clear="left"/>
</div>

## Key Features

### DBML Editor, Quality Linter & Modular Schemas
- **CodeMirror 6 IDE Experience**: Custom DBML syntax highlighting, multi-cursor editing, collapsible code folding (`Table`, `TableGroup`, `TablePartial`, `Note`), bracket matching, **Word Wrap toggle (`Alt+Z` / `⌥Z`)**, context-aware autocomplete (`Ctrl+Space`), real-time syntax & semantic diagnostics, **Find** (`⌘F` / `Ctrl+F`), **Find & Replace** (`⌘H` / `Ctrl+H`), **Go to Line** (`⌘G` / `Ctrl+G`), resizable split pane, maximize/restore (`⌘⇧E`), and minimize rail (`⌘\`).
- **Schema Quality Linter & Best-Practice Analyzer**: Non-blocking diagnostics drawer in the editor footer flagging unindexed foreign-key columns, tables missing primary keys, inconsistent `snake_case`/`camelCase` naming, nullable unique keys, and multi-table circular FK cycles—with severity filters (`All` / `Warn` / `Info`) and click-to-jump to the exact line and canvas column.
- **Full DBML Spec Support**:
  - `Table`, `Enum`, `Ref` (inline and block relationships with `delete`, `update`, and `color` metadata)
  - `TableGroup` business domains with accent colors and notes
  - `TablePartial` reusable column/index mixins (`~partial_name`)
  - `Checks` blocks and column-level check constraints
  - Composite & expression-based `Indexes`
  - Standalone project and domain Markdown `Note` blocks
- **Lossless Modular `.dbml` Workspace**: Organize large schemas across `schema/*.dbml` modules and custom nested subfolders with a toggleable **Explorer**, lossless Flatten/Split round-tripping that preserves folder paths, cross-file error jumping, and merged read-only preview support.

### Interactive ER Diagram, Visual Authoring & 150+ Table Virtualization
- **150+ Table Canvas Virtualization**: Engineered for massive enterprise schemas with tile-quantized spatial viewport culling, 3-tier automatic Level-of-Detail (**Full / Compact / Minimal** LOD with an **Auto LOD** toggle), `requestAnimationFrame`-coalesced 60fps panning/zooming, `8%–200%` zoom range, and a minimap with a live camera viewport frame.
- **Interactive Multi-Select, Alignment & Drag-to-Connect FKs**: Use **Box (`M`)** marquee selection or `Shift+Click` / `Shift+Drag` to select multiple tables, drag groups together with real-time **Snap Alignment Guides**, align/distribute via the floating **Multi-Select Alignment Bar**, and drag from any column row port handle to another column to insert a DBML `Ref:` automatically.
- **Business-Domain Table Groups (`TableGroup`) & Ungrouped Filtering**: Cluster tables into functional domains, assign shared core tables (e.g., `users`, `organizations`, `audit_logs`) to multiple domains simultaneously, reorder columns/tables, and filter visibility on the diagram canvas (`All Domains` vs. `Only Selected`, including dedicated filtering and visibility toggles for **Ungrouped** tables without affecting Docs).
- **Focus Neighborhood Mode (`F`)**: Click any table to isolate its 1-hop upstream and downstream relationships while dimming unrelated tables, edges, groups, and sticky notes.
- **Orthogonal & Curved Edge Routing**: Switch between curved Bézier connectors (`Curved`) and right-angle orthogonal routing (`Ortho`) on the canvas toolbar.
- **Cross-Domain Edge Toggles**: Choose **Show**, **Bundle** (collapses edges between domain pairs into labeled summary trunks), or **Hide** on crowded multi-domain canvases.
- **Canvas Controls**: Switch between **Select** (`V`), **Box** (`M`), and **Pan** (`H`) modes, toggle **Grid Snap** and **Minimap**, switch table detail visibility (**All Fields**, **Keys Only**, **Names Only**), customize table header colors, attach color-coded **Sticky Notes**, and run **Auto Layout** (globally or per domain/ungrouped group).

### Global Command Palette (`⌘K` / `Ctrl+K`)
- Instant fuzzy search across tables, columns, business domains (`TableGroup`), `TablePartial` mixins, Markdown & sticky notes, `.dbml` modules, and quick actions.
- Jump straight to the selected item in **Diagram** (`Enter`), **Editor** (`⇧Enter`), or **Docs** (`Alt+Enter`).

### Engineering Docs & Markdown Portal
- **dbdocs-Style Documentation**: Collapsible left navigation tree (`⌘J` / `Ctrl+J` for `All Tables` or `By Domain`), paginated **Schema Overview**, **Table** and **Domain** detail pages, **Partials** explorer, **Enumerated Types** usage matrix, **Foreign Key Relationships** matrix, and **All Notes** hub.
- **GitHub-Flavored Markdown**: Supports tables, syntax-highlighted fenced code blocks, callout alerts, read-time estimates, and sticky section outlines.

### Local-First Persistence, Offline PWA, Cloud Sync & Shareable Links
- **Installable Offline PWA**: Includes Web App Manifest, Service Worker app-shell precaching (`vite-plugin-pwa`), desktop/mobile **Install App** prompt (plus iOS Safari Add to Home Screen guide), and live offline connectivity indicator—so you can install SchemaForge to your computer and keep editing, diagramming, and exporting even without internet.
- **Local-First Encrypted IndexedDB Storage**: Works offline out of the box—persists workspaces, diagram coordinates, sticky notes, GitHub link metadata, and version snapshots in browser **IndexedDB** (`SchemaForgeLocalDB`), encrypted at rest with non-extractable **AES-256-GCM** Web Crypto keys.
- **Optional Cloud Workspaces (Cloudflare D1 / Node.js SQLite)**: Sign in with GitHub to sync workspaces, layout positions, sticky notes, and saved versions across devices via **Cloudflare D1** (or local `node:sqlite` in Node.js self-hosted/dev mode).
- **Shareable View-Only Links (`/share/:token` & `/share/:token/:versionTag`)**: Generate and edit clean view-only Docs and ER Diagram URLs pointing either to the live workspace or pinned to a published version (e.g., `v1.2.0`), with preset or custom date/time expiration, one-click revocation, and a per-link toggle to enable or disable **PNG / SVG** diagram exports. Viewers can inspect docs, browse and temporarily rearrange the diagram layout, and export PNG/SVG snapshots (when enabled) without copying or accessing the underlying DBML source.
- **Version History, Changelog & Incremental SQL Migrations (`ALTER`)**: Save draft or published snapshots (`⌘S` / `Ctrl+S`), revert with automatic pre-revert checkpoints, inspect semantic or raw line-by-line diffs between any two snapshots, and generate syntax-highlighted **Incremental SQL Migrations** (`ALTER TABLE ... ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, enum updates, and `ALTER TABLE ... FOREIGN KEY` statements) for **PostgreSQL** and **MySQL** with one-click copy and `.sql` download.

### GitHub Sync, Commit Migrations, URL Loader & Scoped Export
- **Two-Way GitHub Repository Sync & Git Commit Migrations**: Sign in via GitHub OAuth, browse repositories/branches/files, load single `.dbml` files or multi-file `schema/*.dbml` folders, preview schema diffs & incremental SQL migrations before committing, compare **any two Git commits** (or a commit vs. Working Draft) to emit PostgreSQL/MySQL `ALTER` migrations, reconcile remote SHA updates, and commit/push to existing or new branches.
- **View DBML from URL**: Load public `.dbml` files from raw URLs, GitHub `blob` URLs, or GitHub Gists via **Open URL** or `?url=<encoded_url>`.
- **Import & Scoped Domain Export**:
  - **Import**: DBML, PostgreSQL/MySQL/SQL DDL (`CREATE TABLE`, `ALTER TABLE ... FOREIGN KEY`), CSV column definitions, and remote `.dbml` URLs.
  - **Export**: DBML, PostgreSQL/MySQL DDL, CSV data dictionary, **SVG**, and **high-resolution PNG** — export the **All Domains & Tables** workspace or scope any export strictly to **Selected Domains** (including **Ungrouped** tables).

### Architecture, Security & Production Hardening
- **Clean Architecture & Shared Domain Kernel**: Framework-free `@shared/domain/*` kernel (DBML lexer/parser/mutators, GitHub target parser, share expiration rules, core schema types) consumed across both backend (`server/domain/`, `server/application/`, `server/infrastructure/`, `server/presentation/`) and frontend (`src/services/`, `src/hooks/`, `src/features/`, `src/components/`).
- **Resilient Frontend State**: Root and feature-level React `ErrorBoundary` isolation, standardized async `loading`/`error`/`empty` states, and `AbortController` cancellation inside dedicated hooks (`src/hooks/` and `src/features/*/hooks/`) with zero direct network calls inside UI components.
- **Hardened HTTP & Runtime Guarantees**: Startup Zod environment validation (`server/infrastructure/config/serverEnv.ts`), `@hono/zod-validator` request/header validation, `secureHeaders()`, explicit origin `cors()`, `hono-rate-limiter` + `bodyLimit()` (256 KB on auth/URL/AI routes; 10 MB on workspace routes), sanitized `app.onError`, SSRF-safe remote URL fetching, parameterized SQL queries, `/healthz` DB connectivity check, and graceful `SIGTERM`/`SIGINT` HTTP + DB shutdown.

### Product Tiering & Roadmap
- See [`ROADMAP.md`](./ROADMAP.md) for current product pros & cons, **Essential** (local-first solo studio) vs. **Premium** (team, CI/CD & cloud platform) feature separation, and upcoming engineering milestones.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **UI Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Decomposed feature modules, Error Boundaries, and strict static typing |
| **Build Tool & PWA** | [Vite 8](https://vite.dev/) (`@vitejs/plugin-react`, `vite-plugin-pwa`) | Fast bundling, dev middleware integration, Web App Manifest, and offline Service Worker precaching |
| **Styling & Motion** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) + [Motion](https://motion.dev/) | Utility-first styling, dark/light themes, and smooth UI transitions |
| **Code Editor** | [CodeMirror 6](https://codemirror.net/) (`@codemirror/*`, `@lezer/highlight`) | Multi-cursor DBML editor, custom syntax highlighting, folding, linting, and search |
| **Icons** | [Lucide React](https://lucide.dev/) | Vector icons across editor, canvas, docs, and modals |
| **API & Edge Backend** | [Hono 4](https://hono.dev/) (`hono`, `@hono/node-server`, `@hono/zod-validator`, `hono-rate-limiter`, `zod`) | Clean-Architecture `/api/*` + `/healthz` router running on Cloudflare Workers, Pages Functions, and Node.js |
| **Cloud & Local Persistence** | [Cloudflare D1](https://developers.cloudflare.com/d1/) + `node:sqlite` + Browser IndexedDB | Local-first offline storage (`SchemaForgeLocalDB`) with optional cross-device D1/SQLite sync & sharing |
| **Auth & Security** | GitHub OAuth + Web Crypto API (`crypto.subtle` AES-GCM) | Stateless encrypted `HttpOnly; Secure; SameSite=None; Partitioned` session cookies, strict CORS/origin checks, SSRF protection, and parameterized SQL |
| **Shared Domain & Engine** | `@shared/domain/*` + `src/utils/` + `src/features/diagram/` | Shared DBML lexer/parser/mutators, quality linter, fuzzy search, semantic diffing, auto-layout, spatial virtualization/LOD, SQL/CSV converters, and SVG/PNG exporter |
| **Automated Testing** | [Vitest 5](https://vitest.dev/) + [Playwright](https://playwright.dev/) | Unit tests (DBML parser, modular round-trips, diffs, SQL migrations, linter, canvas geometry/virtualization) + full browser E2E smoke suite |

---

## Project Structure

```text
.
├── index.html                        # HTML entry point, favicon, and metadata
├── package.json                      # Dependencies and npm scripts
├── README.md                         # Project documentation
├── ROADMAP.md                        # Product evaluation, Essential vs. Premium feature matrix & phased roadmap
├── vitest.config.ts                  # Vitest unit test runner configuration
├── playwright.config.ts              # Playwright E2E smoke test configuration
├── vite.config.ts                    # Vite configuration (React, Tailwind v4, PWA, @shared alias)
├── tsconfig.json                     # TypeScript compiler configuration (@shared/* & @/* paths)
├── wrangler.jsonc                    # Cloudflare Workers + Static Assets + D1 binding config
├── worker.ts                         # Cloudflare Worker entry point (/api/*, /healthz & ASSETS)
├── server.ts                         # Node.js launcher calling server/bootstrap/nodeServer.ts
├── .env.example                      # Environment variable template
├── migrations/
│   ├── 0001_init.sql                 # Initial D1 schema (users, workspaces, versions, share_links)
│   └── 0002_share_export_toggle.sql  # Per-share PNG/SVG diagram export toggle column
├── scripts/
│   └── sync-migrations.mjs           # Reads migrations/*.sql and generates server/migrations/registry.ts
├── public/
│   ├── favicon.svg                   # Application SVG favicon
│   ├── pwa-192x192.png               # PWA home screen icon (192x192)
│   ├── pwa-512x512.png               # PWA splash/launcher icon (512x512)
│   ├── pwa-maskable-512x512.png      # Maskable Android adaptive icon (safe-zone padded)
│   └── apple-touch-icon.png          # iOS Safari home screen icon (180x180)
├── functions/
│   └── api/
│       └── [[route]].ts              # Cloudflare Pages Functions catch-all adapter for Hono
├── shared/
│   └── domain/
│       ├── dbml/                     # Framework-free DBML lexer, parser, mutators & public index
│       ├── github/                   # GitHub repo/blob/URL target parser
│       ├── share/                    # Share link expiration calculation & validation helpers
│       ├── errors.ts                 # Shared domain/application error types
│       └── schemaTypes.ts            # Core TypeScript domain models (Workspace, ParsedSchema, ShareLink, SchemaDiffResult)
├── server/
│   ├── types.ts                      # Runtime edge bindings & server environment types
│   ├── migrations/
│   │   └── registry.ts               # Auto-generated from migrations/*.sql by sync-migrations.mjs
│   ├── bootstrap/
│   │   └── nodeServer.ts             # Node.js HTTP + Vite dev/static server, startup env validation & SIGTERM/SIGINT shutdown
│   ├── domain/
│   │   ├── entities/                 # Server domain entity & config contracts
│   │   ├── gateways/                 # Interfaces for AI, GitHub, OAuth, remote fetcher & token cipher
│   │   ├── policies/                 # Pure domain policies (URL/SSRF safety, user identity, type guards)
│   │   └── repositories/             # Persistence interfaces (IUserRepository, IWorkspaceRepository, IShareRepository)
│   ├── application/
│   │   └── usecases/                 # Pure use-cases for auth, workspaces, shares, github & remote URL fetching
│   ├── infrastructure/
│   │   ├── ai/                       # Server-side Gemini AI gateway (@google/genai)
│   │   ├── config/                   # Zod-validated serverEnv.ts startup configuration
│   │   ├── github/                   # Fetch-based GitHub REST API & OAuth gateways
│   │   ├── persistence/
│   │   │   ├── d1/                   # Cloudflare D1 repositories, row mappers & _schema_migrations auto-migrator
│   │   │   └── sqlite/               # Node.js built-in node:sqlite adapter implementing D1DatabaseLike
│   │   ├── remote/                   # Safe HTTP remote DBML fetcher with SSRF guards
│   │   └── security/                 # AES-GCM token cipher implementation
│   └── presentation/
│       └── http/
│           ├── app.ts                # Hono app: secureHeaders, CORS, /healthz, rate limits, body limits & route mounting
│           ├── container.ts          # Dependency injection container wiring gateways/repos into use-cases
│           ├── middleware/           # Zod validation, hono-rate-limiter & sanitized errorMapper
│           ├── routes/               # Thin HTTP adapters (auth, fetchUrl, github, share, workspaces)
│           ├── security/             # Explicit CORS origin & cookie/origin helpers
│           └── views/                # OAuth popup callback HTML template
├── src/
│   ├── main.tsx                      # Application bootstrap with root ErrorBoundary
│   ├── App.tsx                       # Root workspace orchestration & /share/:token routing
│   ├── index.css                     # Global Tailwind v4 styles and scrollbar/editor rules
│   ├── services/
│   │   ├── api/                      # Typed Hono hc<AppType> apiClient, cloudService & remoteService
│   │   └── storage/                  # AES-256-GCM localCrypto & IndexedDB localDb persistence
│   ├── hooks/                        # Shared async & UI hooks (useFetchRemoteDbml, useSplitResize, useShareRoute, etc.)
│   ├── components/                   # Shared UI components (TopBar, WorkspaceViewport, AppModals, InspectorDrawer, OpenUrlModal, SqlMigrationViewer, ErrorBoundary, AsyncStateView)
│   ├── features/
│   │   ├── app/                      # Global shortcut hook & root app helpers
│   │   ├── command/                  # Global Command Palette modal & fuzzy search engine
│   │   ├── diagram/                  # ER canvas, interaction/viewport/preference hooks, virtualization/LOD engine, alignment bar, minimap
│   │   ├── docs/                     # dbdocs-style Schema, Domain, Table, Partials, Enums, Refs & Notes views
│   │   ├── editor/                   # CodeMirror 6 DBML editor, QualityLinterPanel, syntax highlighter, folder explorer
│   │   ├── github/                   # GitHub OAuth modal, repo/branch/folder browser, commit diff/SQL migrations hook & tabs
│   │   ├── markdown/                 # GFM Markdown parser, callouts, read-time & syntax highlighter
│   │   ├── pwa/                      # PWA install prompt hook/button & offline connectivity banner
│   │   ├── share/                    # Read-only SharedViewerPage & usePublicShareLoader hook
│   │   ├── sidebar/                  # Left sidebar for Domains, Version History & Schema Changelog (Semantic, SQL ALTER, Raw)
│   │   └── workspace/                # IndexedDB/Cloud store, useWorkspaceShares hook & modals (ShareModal subcomponents, Workspaces, Import/Export, TableGroup, SaveVersion)
│   └── utils/
│       ├── highlight/                # Syntax highlighting utilities for SQL, DBML & code blocks
│       ├── io/                       # Auto-layout, edge geometry, SQL/CSV/DBML converters, SQL ALTER migration generator, SVG/PNG export
│       ├── autoLayout.ts             # Domain-aware & group-level auto-layout engine
│       ├── codeHighlight.ts          # Unified syntax highlight entrypoint
│       ├── importExport.ts           # Export orchestration helpers (PNG/SVG/SQL/CSV/DBML)
│       ├── sampleSchemas.ts          # Built-in starter & modular SaaS telemetry schemas
│       ├── schemaDiff.ts             # Semantic, index, FK, line-level diff & incremental SQL migration generator
│       ├── schemaLinter.ts           # Schema Quality Linter (unindexed FKs, missing PKs, naming drift, nullable uniques, FK cycles)
│       ├── schemaModules.ts          # Multi-file .dbml module splitting & merging helpers
│       └── urlSafety.ts              # Client URL & OAuth origin validation helpers
└── tests/
    ├── unit/                         # Vitest unit suites (parser, modules, diffs, SQL migrations, linter, canvas geometry & virtualization)
    └── e2e/                          # Playwright browser smoke tests (Editor, Diagram, Docs, Share, Linter/Canvas, 160-table Virtualization)
```

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** `>= 22.x` *(required for built-in `node:sqlite` used to emulate Cloudflare D1 locally during development)*
- **npm** (or **bun**, lockfile included as `bun.lock`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment *(Optional for Local Editing / Required for GitHub OAuth & Cloud Sync)*

Core editing, diagramming, docs, local IndexedDB workspaces, and loading public DBML URLs work without any configuration. To enable **GitHub OAuth**, **GitHub repository sync**, **Cloud Sync / Share Links**, or explicit **CORS origins**:

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Create a GitHub OAuth App at <https://github.com/settings/developers> with callback URL:
   - `http://localhost:3000/api/auth/github/callback`
3. Configure `.env` as needed:
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` — GitHub OAuth credentials
   - `SESSION_SECRET` — High-entropy secret (`>= 16` chars; required in production)
   - `ALLOWED_ORIGIN` / `APP_URL` — Explicit allowed origin(s) and public app URL
   - `DATABASE_URL` — Optional SQLite path or DSN (defaults to `.data/schemaforge-dev.sqlite` in dev or `.data/schema-forge.sqlite` in production)
   - `GEMINI_API_KEY` — Optional server-side Gemini API key (validated at startup if set; never exposed to the frontend)

### 3. Start the Development Server

```bash
npm run dev
```

This runs `node scripts/sync-migrations.mjs && tsx server.ts`, starting the Hono API (auto-applying pending migrations from `server/migrations/registry.ts` into local SQLite with `_schema_migrations` tracking) and Vite dev middleware at **`http://localhost:3000`**.

### 4. Type-Check & Lint

Run migration sync and TypeScript type checking across `shared/`, `server/`, `src/`, `worker.ts`, and `functions/`:

```bash
npm run lint
```

### 5. Run Automated Tests (Vitest + Playwright)

```bash
# Run unit test suites (DBML parser, modular round-trip, diff, SQL ALTER, linter, canvas geometry & virtualization)
npm test

# Run unit tests in watch mode
npm run test:watch

# Run Playwright browser E2E smoke tests
npm run test:e2e

# Run full regression suite (Vitest + Playwright)
npm run test:all
```

---

## Keyboard Shortcuts

### Global & Editor

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Open Global Command Palette (jump to tables, columns, domains, notes, or `.dbml` modules) |
| `⌘B` / `Ctrl+B` | Toggle Left Sidebar *(hidden in Docs view)* |
| `⌘J` / `Ctrl+J` | Toggle Docs Navigation Tree *(in Docs view)* |
| `⌘\` / `Ctrl+\` | Toggle / Minimize Code Editor |
| `⌘⇧E` / `Ctrl+Shift+E` | Maximize / Restore Code Editor |
| `Alt+Z` / `⌥Z` | Toggle Word Wrap in Code Editor |
| `⌘F` / `Ctrl+F` | Find text in Code Editor |
| `⌘H` / `Ctrl+H` | Find & Replace in Code Editor |
| `⌘G` / `Ctrl+G` | Go to Line (`line` or `line:col`) in Code Editor |
| `⌘S` / `Ctrl+S` | Save Version Snapshot |
| `⌘I` / `Ctrl+I` | Open Import / Export Studio |
| `Ctrl+Space` | Trigger DBML Autocomplete inside Code Editor |
| `Esc` | Close active modal or palette |

### Diagram Canvas

| Shortcut | Action |
| --- | --- |
| `V` | Switch to **Select** cursor mode (click & drag tables, groups, and notes) |
| `M` | Switch to **Box** marquee multi-select mode (drag rectangle to select multiple tables) |
| `H` | Switch to **Pan** cursor mode (drag anywhere to pan the canvas) |
| `Shift + Click / Drag` | Add/toggle tables in multi-selection or draw additive marquee box |
| `F` | Toggle **Focus Neighborhood Mode** (isolate 1-hop upstream/downstream tables) |
| `Esc` | Clear multi-selection or exit Focus Neighborhood Mode |

---

## Deploying to Production

SchemaForge compiles to static frontend assets (`dist/`) paired with a Web-Standard Hono backend (`server/presentation/http/app.ts`) for **Cloudflare Workers + D1**, **Cloudflare Pages**, or **Node.js / Docker**, and exposes `GET /healthz` for database connectivity checks.

### 1. Verify Type Safety and Build

```bash
npm run lint
npm run build
```

---

### 2. Deploy to Cloudflare Workers + D1 (Recommended)

`wrangler.jsonc` is preconfigured for **Cloudflare Workers with Static Assets** and **Cloudflare D1** (`run_worker_first: ["/api/*", "/healthz"]`, `not_found_handling: "single-page-application"`, and `migrations_dir: "migrations"`).

#### A. Provision D1 (if deploying a new fork/account)
1. Create a D1 database (`npx wrangler d1 create schema-forge-db` or via **Cloudflare Dashboard → Storage & Databases → D1 SQL Database**) and set its `database_id` in `wrangler.jsonc` (or bind `DB` in Worker Settings).
2. **SQL-Driven Automatic Migrations (`migrations/*.sql` → `_schema_migrations`)**: Simply add numbered `.sql` files in `migrations/` (e.g., `0003_add_feature.sql`). Running `npm run build` (including inside Cloudflare Workers Builds) automatically parses `migrations/*.sql` into `server/migrations/registry.ts`, and on the first request after deploy, pending migrations apply atomically and record themselves in `_schema_migrations`. You can also optionally run `npx wrangler d1 migrations apply schema-forge-db --remote` if using Wrangler CLI.

#### B. Configure Secrets & GitHub OAuth Callback
Add the following **Variables and Secrets** in the Cloudflare Dashboard (**Worker → Settings → Variables and Secrets**) or via Wrangler CLI:
- `GITHUB_CLIENT_ID` — GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App Client Secret
- `SESSION_SECRET` — High-entropy secret string for encrypting session cookies across Worker isolates
- `ALLOWED_ORIGIN` *(recommended)* — Explicit allowed browser origin(s) for CORS & mutating requests
- `APP_URL` *(optional)* — Public app URL if serving behind a custom reverse-proxy origin

Register your production callback URL in **GitHub Developer Settings → OAuth Apps**:
- `https://<your-worker-subdomain-or-custom-domain>/api/auth/github/callback`

#### C. Deploy via Cloudflare Workers Builds (Git) or CLI
- **Cloudflare Workers Builds (No CLI needed)**: Connect your Git repository with Build command `npm run build` and Deploy command `npx wrangler deploy`.
- **CLI**:
  ```bash
  npm run build
  npx wrangler secret put GITHUB_CLIENT_ID
  npx wrangler secret put GITHUB_CLIENT_SECRET
  npx wrangler secret put SESSION_SECRET
  npx wrangler deploy
  ```

---

### 3. Deploy to Cloudflare Pages (with Pages Functions)

`functions/api/[[route]].ts` automatically routes `/api/*` requests to the shared Hono backend:

1. In **Workers & Pages → Create → Pages → Connect to Git**, configure:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
2. Bind your D1 database as `DB` under **Pages → Settings → Bindings** (if using Cloud Sync & Shareable Links) and apply migrations with `npx wrangler d1 migrations apply <db-name> --remote`.
3. Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, and `ALLOWED_ORIGIN` under **Pages → Settings → Environment variables**.
4. Register `https://<your-pages-project>.pages.dev/api/auth/github/callback` in your GitHub OAuth App settings.

---

### 4. Deploy with Node.js / Docker

To self-host `server.ts` with Node.js `>= 22.x` (SQLite persistence is configured via `DATABASE_URL` or defaults to `.data/schema-forge.sqlite`, with `/healthz` health probing and graceful `SIGTERM`/`SIGINT` shutdown):

```bash
npm run build
NODE_ENV=production SESSION_SECRET=replace-with-strong-secret npm start
```

Example `Dockerfile`:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
EXPOSE 3000
CMD ["node", "server.ts"]
```

---

## Scripts Reference

| Script | Command | Description |
| --- | --- | --- |
| `sync:migrations` | `node scripts/sync-migrations.mjs` | Generates `server/migrations/registry.ts` from `migrations/*.sql` |
| `dev` | `node scripts/sync-migrations.mjs && tsx server.ts` | Starts Hono + Vite dev server on port `3000` |
| `start` | `node server.ts` | Runs production Node.js server (`dist/` + `/api/*` + `/healthz`) |
| `build` | `node scripts/sync-migrations.mjs && vite build` | Syncs SQL migrations and builds static + PWA bundle into `dist/` |
| `lint` | `node scripts/sync-migrations.mjs && tsc --noEmit` | Runs full-project TypeScript type checking |
| `test` | `vitest run` | Runs unit test suite |
| `test:watch` | `vitest` | Runs unit tests in watch mode |
| `test:e2e` | `playwright test` | Runs Playwright browser E2E smoke suite |
| `test:all` | `vitest run && playwright test` | Runs both Vitest and Playwright suites |
| `clean` | `rm -rf dist server.js` | Cleans build artifacts |
