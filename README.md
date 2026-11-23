# SchemaForge — DBML Viewer, ER Diagrammer & Database Docs Studio
<div>
<img align="left" src="public/pwa-192x192.png" width="100">
<b>SchemaForge</b> is an interactive DBML (Database Markup Language) editor, ER diagrammer, and engineering documentation studio built for teams working on complex, multi-domain schemas. It pairs a modular CodeMirror 6 DBML workspace with business-domain clustering, visual decluttering tools, dbdocs-style documentation, local-first IndexedDB persistence, optional Cloudflare D1 cloud sync, shareable read-only schema links, and two-way GitHub repository synchronization.
<br clear="left"/>
<br clear="left"/>
</div>

## Key Features

### DBML Editor & Modular Schemas
- **CodeMirror 6 IDE Experience**: Custom DBML syntax highlighting, multi-cursor editing, collapsible code folding (`Table`, `TableGroup`, `TablePartial`, `Note`), bracket matching, context-aware autocomplete (`Ctrl+Space`), real-time syntax & semantic diagnostics, **Find** (`⌘F` / `Ctrl+F`), **Find & Replace** (`⌘H` / `Ctrl+H`), and **Go to Line** (`⌘G` / `Ctrl+G`).
- **Full DBML Spec Support**:
  - `Table`, `Enum`, `Ref` (inline and block relationships with `delete`, `update`, and `color` metadata)
  - `TableGroup` business domains with accent colors and notes
  - `TablePartial` reusable column/index mixins (`~partial_name`)
  - `Checks` blocks and column-level check constraints
  - Composite & expression-based `Indexes`
  - Standalone project and domain Markdown `Note` blocks
- **Modular `.dbml` File Workspace**: Organize large schemas across multiple `schema/*.dbml` modules with split, merge, rename, create, delete, and merged read-only preview support.

### Interactive ER Diagram & Visual Decluttering
- **Business-Domain Table Groups (`TableGroup`) & Ungrouped Filtering**: Cluster tables into functional domains, assign shared core tables (e.g., `users`, `organizations`, `audit_logs`) to multiple domains simultaneously, reorder columns/tables, and filter visibility on the diagram canvas (`All Domains` vs. `Only Selected`, including dedicated filtering and visibility toggles for **Ungrouped** tables without affecting Docs).
- **Focus Neighborhood Mode (`F`)**: Click any table to isolate its 1-hop upstream and downstream relationships while dimming unrelated tables, edges, groups, and sticky notes.
- **Orthogonal & Curved Edge Routing**: Switch between curved Bézier connectors (`Curved`) and right-angle orthogonal routing (`Ortho`) on the canvas toolbar.
- **Cross-Domain Edge Toggles**: Choose **Show**, **Bundle** (collapses edges between domain pairs into labeled summary trunks), or **Hide** on crowded multi-domain canvases.
- **Canvas Controls**: Switch between **Select** (`V`) and **Pan** (`H`) modes, toggle **Grid Snap** and **Minimap**, switch table detail visibility (**All Fields**, **Keys Only**, **Names Only**), customize table header colors, attach color-coded **Sticky Notes**, and run **Auto Layout** (globally or per domain/ungrouped group).

### Global Command Palette (`⌘K` / `Ctrl+K`)
- Instant fuzzy search across tables, columns, business domains (`TableGroup`), `TablePartial` mixins, Markdown & sticky notes, `.dbml` modules, and quick actions.
- Jump straight to the selected item in **Diagram** (`Enter`), **Editor** (`⇧Enter`), or **Docs** (`Alt+Enter`).

### Engineering Docs & Markdown Portal
- **dbdocs-Style Documentation**: Collapsible left navigation tree (`⌘J` / `Ctrl+J` for `All Tables` or `By Domain`), paginated **Schema Overview**, **Table** and **Domain** detail pages, **Partials** explorer, **Enumerated Types** usage matrix, **Foreign Key Relationships** matrix, and **All Notes** hub.
- **GitHub-Flavored Markdown**: Supports tables, syntax-highlighted fenced code blocks, callout alerts, read-time estimates, and sticky section outlines.

### Local-First Persistence, Offline PWA, Cloud Sync & Shareable Links
- **Installable Offline PWA**: Includes Web App Manifest, Service Worker app-shell precaching (`vite-plugin-pwa`), desktop/mobile **Install App** prompt (plus iOS Safari Add to Home Screen guide), and live offline connectivity indicator—so you can install SchemaForge to your computer and keep editing, diagramming, and exporting even without internet.
- **Local-First Encrypted IndexedDB Storage**: Works offline out of the box—persists workspaces, diagram coordinates, sticky notes, GitHub link metadata, and version snapshots in browser **IndexedDB** (`SchemaForgeLocalDB`), encrypted at rest with non-extractable **AES-256-GCM** Web Crypto keys.
- **Optional Cloud Workspaces (Cloudflare D1)**: Sign in with GitHub to sync workspaces, layout positions, sticky notes, and saved versions across devices via **Cloudflare D1** (or local SQLite in Node.js development).
- **Shareable View-Only Links (`/share/:token` & `/share/:token/:versionTag`)**: Generate and edit clean view-only Docs and ER Diagram URLs pointing either to the live workspace or pinned to a published version (e.g., `v1.2.0`), with preset or custom date/time expiration, one-click revocation, and a per-link toggle to enable or disable **PNG / SVG** diagram exports. Viewers can inspect docs, browse and temporarily rearrange the diagram layout, and export PNG/SVG snapshots (when enabled) without copying or accessing the underlying DBML source.
- **Version History, Changelog & Incremental SQL Migrations (`ALTER`)**: Save draft or published snapshots (`⌘S` / `Ctrl+S`), revert with automatic pre-revert checkpoints, inspect semantic or raw line-by-line diffs between any two snapshots, and generate syntax-highlighted **Incremental SQL Migrations** (`ALTER TABLE ... ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, enum updates, and `ALTER TABLE ... FOREIGN KEY` statements) for **PostgreSQL** and **MySQL** with one-click copy and `.sql` download.

### GitHub Sync, Commit Migrations, URL Loader & Scoped Export
- **Two-Way GitHub Repository Sync & Git Commit Migrations**: Sign in via GitHub OAuth, browse repositories/branches/files, load single `.dbml` files or multi-file `schema/*.dbml` folders, preview schema diffs & incremental SQL migrations before committing, compare **any two Git commits** (or a commit vs. Working Draft) to emit PostgreSQL/MySQL `ALTER` migrations, reconcile remote SHA updates, and commit/push to existing or new branches.
- **View DBML from URL**: Load public `.dbml` files from raw URLs, GitHub `blob` URLs, or GitHub Gists via **Open URL** or `?url=<encoded_url>`.
- **Import & Scoped Domain Export**:
  - **Import**: DBML, PostgreSQL/MySQL/SQL DDL (`CREATE TABLE`, `ALTER TABLE ... FOREIGN KEY`), CSV column definitions, and remote `.dbml` URLs.
  - **Export**: DBML, PostgreSQL/MySQL DDL, CSV data dictionary, **SVG**, and **high-resolution PNG** — export the **All Domains & Tables** workspace or scope any export strictly to **Selected Domains** (including **Ungrouped** tables).

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **UI Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Modular feature architecture and strict static typing |
| **Build Tool & PWA** | [Vite 8](https://vite.dev/) (`@vitejs/plugin-react`, `vite-plugin-pwa`) | Fast bundling, dev middleware integration, Web App Manifest, and offline Service Worker precaching |
| **Styling & Motion** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) + [Motion](https://motion.dev/) | Utility-first styling, dark/light themes, and smooth UI transitions |
| **Code Editor** | [CodeMirror 6](https://codemirror.net/) (`@codemirror/*`, `@lezer/highlight`) | Multi-cursor DBML editor, custom syntax highlighting, folding, linting, and search |
| **Icons** | [Lucide React](https://lucide.dev/) | Vector icons across editor, canvas, docs, and modals |
| **API & Edge Backend** | [Hono 4](https://hono.dev/) (`hono`, `@hono/node-server`) | Unified `/api/*` router running on Cloudflare Workers, Cloudflare Pages Functions, and Node.js |
| **Cloud & Local Persistence** | [Cloudflare D1](https://developers.cloudflare.com/d1/) + `node:sqlite` + Browser IndexedDB | Local-first offline storage (`SchemaForgeLocalDB`) with optional cross-device D1 sync & sharing |
| **Auth & Security** | GitHub OAuth + Web Crypto API (`crypto.subtle` AES-GCM) | Stateless encrypted `HttpOnly; Secure; SameSite=None; Partitioned` session cookies, origin checks, and parameterized SQL |
| **DBML & Diagram Engine** | Custom TypeScript modules (`src/utils/`) | DBML parser/validator, fuzzy command search, semantic diffing, auto-layout, SQL/CSV converters, and SVG/PNG exporter |

---

## Project Structure

```text
.
├── index.html                        # HTML entry point, favicon, and metadata
├── package.json                      # Dependencies and npm scripts
├── vite.config.ts                    # Vite configuration (React, Tailwind v4, HMR toggle)
├── tsconfig.json                     # TypeScript compiler configuration
├── wrangler.jsonc                    # Cloudflare Workers + Static Assets + D1 binding config
├── worker.ts                         # Cloudflare Worker entry point (/api/* + ASSETS)
├── server.ts                         # Node.js entry point (@hono/node-server + local SQLite D1 shim)
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
├── server/
│   ├── api.ts                        # Shared Hono API app + automatic D1 migration middleware
│   ├── types.ts                      # Edge-compatible Bindings, Env, and D1 interface types
│   ├── migrations/
│   │   └── registry.ts               # Auto-generated from migrations/*.sql by sync-migrations.mjs
│   ├── lib/
│   │   ├── crypto.ts                 # AES-GCM token encryption & mutating request origin verification
│   │   ├── dbHelpers.ts              # Parameterized user upsert & workspace/share row serializers
│   │   ├── githubClient.ts           # GitHub REST API wrapper with timeout & error handling
│   │   ├── localSqliteD1.ts          # Node.js 22+ built-in node:sqlite adapter implementing D1DatabaseLike
│   │   └── migrator.ts               # EF Core-style auto-migrator with _schema_migrations history tracking
│   └── routes/
│       ├── auth.ts                   # GitHub OAuth login, callback, logout & /api/auth/me
│       ├── fetchUrl.ts               # Safe remote DBML URL / GitHub blob / Gist proxy
│       ├── github/                   # GitHub repos, branches, commit history, single-file & folder sync handlers
│       ├── share.ts                  # Owner share-link management & public read-only /api/share/:token
│       └── workspaces.ts             # Authenticated /api/workspaces CRUD synced to D1
└── src/
    ├── main.tsx                      # Application bootstrap
    ├── App.tsx                       # Root workspace orchestration & /share/:token routing
    ├── index.css                     # Global Tailwind v4 styles and scrollbar/editor rules
    ├── types/
    │   └── schema.ts                 # Core TypeScript models (Workspace, ParsedSchema, ShareLink, SchemaDiffResult)
    ├── db/
    │   ├── localCrypto.ts            # AES-256-GCM sealing/unsealing for local storage
    │   └── localDb.ts                # Encrypted IndexedDB wrapper for offline workspaces & preferences
    ├── components/
    │   ├── BrandLogo.tsx             # Brand mark component
    │   ├── InspectorDrawer.tsx       # Table, domain, header-color, and sticky-note inspector
    │   ├── OpenUrlModal.tsx          # Load DBML from raw URL / GitHub / Gist & build ?url= links
    │   ├── SqlMigrationViewer.tsx    # Incremental ALTER SQL migration viewer (PostgreSQL/MySQL), copy & .sql export
    │   └── TopBar.tsx                # Responsive grouped navigation: workspace switcher, Cmd+K palette, Sync & I/O menu, Share & Save CTA
    ├── features/
    │   ├── app/                      # Global shortcut hook & root app helpers
    │   ├── command/                  # Global Command Palette modal & fuzzy search engine
    │   ├── diagram/                  # ER canvas, TableCards, DomainFilterBar, Focus mode, orthogonal/bundled edges, minimap
    │   ├── docs/                     # dbdocs-style Schema, Domain, Table, Partials, Enums, Refs & Notes views
    │   ├── editor/                   # CodeMirror 6 DBML editor, custom grammar/highlighter, diagnostics, folder explorer
    │   ├── github/                   # GitHub OAuth modal, repo/branch/folder browser, commit SQL migrations, diff preview & push
    │   ├── markdown/                 # GFM Markdown parser, callouts, read-time & syntax highlighter
    │   ├── pwa/                      # PWA install prompt hook/button & offline connectivity banner
    │   ├── share/                    # Read-only SharedViewerPage (/share/:token & /share/:token/:versionTag)
    │   ├── sidebar/                  # Left sidebar for Domains, Modules, Version History & Schema Changelog (Semantic, SQL ALTER, Raw)
    │   └── workspace/                # IndexedDB + Cloud D1 workspace store & modals (Workspaces, Share, Scoped Export, Shortcuts)
    └── utils/
        ├── dbml/                     # DBML tokenizer, parser, mutators, AST helpers & sample schemas
        ├── highlight/                # Syntax highlighting utilities for SQL, DBML & code blocks
        ├── io/                       # Auto-layout, edge geometry, SQL/CSV/DBML converters, SQL ALTER migration generator, SVG/PNG export
        ├── cloudService.ts           # Client API calls for D1 workspaces & share links
        ├── remoteService.ts          # Client API calls for auth state, URL proxy & GitHub sync/commits
        ├── schemaDiff.ts             # Semantic, index, FK, line-level diff & incremental SQL migration generator
        └── schemaModules.ts          # Multi-file .dbml module splitting & merging helpers
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

Core editing, diagramming, docs, local IndexedDB workspaces, and loading public DBML URLs work without any configuration. To enable **GitHub OAuth**, **GitHub repository sync**, and **authenticated Cloud Sync / Share Links**:

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Create a GitHub OAuth App at <https://github.com/settings/developers> with callback URL:
   - `http://localhost:3000/api/auth/github/callback`
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (and optionally `SESSION_SECRET`) in `.env`.

### 3. Start the Development Server

```bash
npm run dev
```

This runs `tsx server.ts`, starting the Hono API (auto-applying pending migrations from `server/migrations/registry.ts` into `.data/schemaforge-dev.sqlite` with `_schema_migrations` tracking) and Vite dev middleware at **`http://localhost:3000`**.

### 4. Type-Check & Lint

Run TypeScript type checking across the frontend, Hono API, and Cloudflare Worker entry points:

```bash
npm run lint
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
| `H` | Switch to **Pan** cursor mode (drag anywhere to pan the canvas) |
| `F` | Toggle **Focus Neighborhood Mode** (isolate 1-hop upstream/downstream tables) |

---

## Deploying to Production

SchemaForge compiles to static frontend assets (`dist/`) paired with a Web-Standard Hono backend (`server/api.ts`) for **Cloudflare Workers + D1**, **Cloudflare Pages**, or **Node.js / Docker**.

### 1. Verify Type Safety and Build

```bash
npm run lint
npm run build
```

---

### 2. Deploy to Cloudflare Workers + D1 (Recommended)

`wrangler.jsonc` is preconfigured for **Cloudflare Workers with Static Assets** and **Cloudflare D1** (`run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`, and `migrations_dir: "migrations"`).

#### A. Provision D1 (if deploying a new fork/account)
1. Create a D1 database (`npx wrangler d1 create schema-forge-db` or via **Cloudflare Dashboard → Storage & Databases → D1 SQL Database**) and set its `database_id` in `wrangler.jsonc` (or bind `DB` in Worker Settings).
2. **SQL-Driven Automatic Migrations (`migrations/*.sql` → `_schema_migrations`)**: Simply add numbered `.sql` files in `migrations/` (e.g., `0002_add_feature.sql`). Running `npm run build` (including inside Cloudflare Workers Builds) automatically parses `migrations/*.sql` into `server/migrations/registry.ts`, and on the first request after deploy, pending migrations apply atomically and record themselves in `_schema_migrations`. You can also optionally run `npx wrangler d1 migrations apply schema-forge-db --remote` if using Wrangler CLI.

#### B. Configure Secrets & GitHub OAuth Callback
Add the following **Variables and Secrets** in the Cloudflare Dashboard (**Worker → Settings → Variables and Secrets**) or via Wrangler CLI:
- `GITHUB_CLIENT_ID` — GitHub OAuth App Client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App Client Secret
- `SESSION_SECRET` *(recommended)* — Random secret string for encrypting session cookies across Worker isolates
- `APP_URL` *(optional)* — Only required if serving behind a custom reverse-proxy origin

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
3. Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` under **Pages → Settings → Environment variables**.
4. Register `https://<your-pages-project>.pages.dev/api/auth/github/callback` in your GitHub OAuth App settings.

---

### 4. Deploy with Node.js / Docker

To self-host `server.ts` with Node.js `>= 22.x` (SQLite persistence is stored at `LOCAL_SQLITE_PATH` or `.data/schema-forge.sqlite`):

```bash
npm run build
NODE_ENV=production npm start
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
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
EXPOSE 3000
CMD ["node", "server.ts"]
```

---

### Clean Build Artifacts

```bash
npm run clean
```
