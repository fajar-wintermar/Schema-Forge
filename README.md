# SchemaForge — DBML Viewer & Database Documentation Studio

**SchemaForge** is an interactive DBML (Database Markup Language) viewer, ER diagrammer, and database documentation studio. Designed for teams working on complex, multi-domain schemas, it combines a syntax-highlighted DBML editor, business-domain grouping, interactive diagramming, dbdocs-style documentation, local-first version history, URL schema loading, and two-way GitHub repository sync.

---

## What This Project Is For

SchemaForge helps engineers, architects, and product teams design, explore, document, and collaborate on relational database schemas using standard DBML syntax:

- **Business-Domain Table Groups (`TableGroup`)**: Organize large schemas into customizable functional domains with custom accent colors and notes.
- **Multi-Domain Table Assignment**: Assign shared core tables (e.g., `users`, `organizations`, `audit_logs`) to multiple business domains simultaneously, with drag-and-drop reordering and domain filtering (`Show All` vs. `Selected Only`).
- **Group-Aware Auto-Layout**: Intelligently arranges `TableGroup` clusters and tables to minimize foreign-key edge crossings, while supporting manual drag-and-drop adjustments and per-domain re-layout.
- **Interactive Diagram Canvas**: Pan, zoom, inspect relationships, customize table header colors (`headercolor`), attach color-coded **Sticky Notes**, run **Auto Layout**, and switch diagram field visibility (**All Fields**, **Keys only**, **Names only**).
- **dbdocs-Style Docs View**: Full-width documentation view with a collapsible left table navigation tree (`All Tables` or `By Domain`, toggled via `⌘J` / `Ctrl+J`), dedicated **Schema Overview** (paginated), **Table Detail** views, structured **Enumerated Types** table with column usages, **Foreign Key Relationships** matrix, and **Cardinality Legend**.
- **DBML Code Editor**: Syntax highlighting, line numbers, minimize/maximize/split-resize modes, context-aware autocomplete (`Ctrl+Space`), **Find** (`⌘F` / `Ctrl+F`), **Find & Replace** (`⌘H` / `Ctrl+H`), **Go to Line** (`⌘G` / `Ctrl+G`, supports `line:col`), and real-time syntax + semantic error checking.
- **View DBML from URL**: Load remote `.dbml` files directly from any public raw URL, GitHub file URL (`blob`), or GitHub Gist via the **Open URL** modal, **Import / Export → URL**, or directly via `?url=<encoded_url>` query links.
- **GitHub Repository Load & Push**: Connect your GitHub account via OAuth, browse repositories/branches/files, load `.dbml` schemas, preview schema & line diffs, pull remote updates, and commit & push edits back to the linked branch or a new branch.
- **Global Search (`⌘K` / `Ctrl+K`)**: Instantly find tables, columns, or business domains across the entire workspace and focus them on the canvas.
- **Version History & Schema Changelog**: Save local snapshots (draft or published), revert to any historical version with automatic pre-revert checkpoints, and compare any two versions via semantic or raw line-by-line diffs.
- **Local-First Persistence**: Automatically persists workspaces, diagram coordinates, sticky notes, GitHub link metadata, and version snapshots across sessions using browser **IndexedDB** (`SchemaForgeLocalDB`).
- **Import & Export**:
  - **Import**: DBML, PostgreSQL/MySQL/SQL DDL (`CREATE TABLE`, `ALTER TABLE ... FOREIGN KEY`), CSV column definitions, and remote `.dbml` URLs.
  - **Export**: DBML, PostgreSQL/MySQL DDL, CSV data dictionary, **SVG**, and **high-resolution PNG**.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **UI Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Component architecture, state management, and strict static typing |
| **Build Tool & Dev Server** | [Vite 8](https://vite.dev/) (`@vitejs/plugin-react`) | Fast bundling, ES module dev middleware, and production static build |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) | Utility-first styling with dark/light theme support |
| **Icons** | [Lucide React](https://lucide.dev/) | Crisp vector icons across toolbars, canvas, docs, and modals |
| **API & Edge Backend** | [Hono](https://hono.dev/) (`hono`, `@hono/node-server`) | Unified `/api/*` router running identically on Node.js, Cloudflare Workers, and Cloudflare Pages Functions |
| **Auth & Security** | Web Crypto API (`crypto.subtle` AES-GCM) | Stateless encrypted OAuth `state` and `HttpOnly; SameSite=None; Secure` GitHub session tokens |
| **Remote & Git Sync** | GitHub OAuth + REST Contents/Git APIs & URL Proxy | CORS-safe remote DBML fetching, repo/branch/file browsing, conflict detection (`SHA`), and commit/push |
| **Client Persistence** | Browser IndexedDB (`src/db/localDb.ts`) | Offline-capable client-side storage for workspaces, layouts, and snapshots |
| **DBML & Diagram Engine** | Custom TypeScript modules (`src/utils/`) | DBML tokenizer/parser, semantic validator, diff engine, auto-layout, SQL/CSV converters, and SVG/PNG renderer |

---

## Project Structure

```text
.
├── index.html                        # HTML entry point, favicon, and metadata
├── package.json                      # Dependencies and npm scripts
├── vite.config.ts                    # Vite configuration (React, Tailwind v4, alias, HMR toggle)
├── tsconfig.json                     # TypeScript compiler configuration
├── wrangler.jsonc                    # Cloudflare Workers + Static Assets + Previews configuration
├── worker.ts                         # Cloudflare Worker entry point (/api/* + ASSETS)
├── server.ts                         # Node.js entry point (@hono/node-server + Vite dev / dist prod)
├── .env.example                      # Environment variable template (APP_URL, GITHUB_CLIENT_ID, etc.)
├── public/
│   └── favicon.svg                   # Application SVG favicon
├── server/
│   └── api.ts                        # Shared Web-Standard Hono API (/api/fetch-url, /api/auth/github/*, /api/github/*)
├── functions/
│   └── api/
│       └── [[route]].ts              # Cloudflare Pages Functions catch-all adapter for Hono
└── src/
    ├── main.tsx                      # Application bootstrap
    ├── App.tsx                       # Root workspace orchestration, ?url= loader, shortcuts, and state sync
    ├── index.css                     # Global Tailwind v4 import and custom editor/scrollbar rules
    ├── types/
    │   └── schema.ts                 # Core TypeScript interfaces (ParsedSchema, GithubFileLink, UrlFileLink, etc.)
    ├── db/
    │   └── localDb.ts                # IndexedDB wrapper for saving/loading workspaces & preferences
    ├── components/
    │   ├── BrandLogo.tsx             # Custom SVG brand mark
    │   ├── TopBar.tsx                # Navigation, workspace switcher, search, view switcher, Open URL, GitHub, Export
    │   ├── Sidebar.tsx               # Domains manager, Version History, and Schema Changelog diff viewer
    │   ├── DbmlEditor.tsx            # Syntax-highlighted DBML editor with autocomplete, Find/Replace, Go to Line
    │   ├── DiagramCanvas.tsx         # Interactive pan/zoom ERD canvas, TableGroups, cards, Auto Layout, sticky notes
    │   ├── DocsView.tsx              # Full-width dbdocs-style documentation view with collapsible nav tree
    │   ├── InspectorDrawer.tsx       # Contextual table/domain/color/sticky-note inspector
    │   ├── OpenUrlModal.tsx          # Load DBML from raw URL / GitHub / Gist & copy shareable viewer links
    │   ├── GitHubModal.tsx           # GitHub OAuth sign-in, repo/branch/file browser, diff preview & push
    │   └── Modals.tsx                # Import/Export, Save Version, TableGroup, Workspaces, Shortcuts modals
    └── utils/
        ├── dbmlParser.ts             # DBML parser, syntax/reference validator, and AST-like text mutators
        ├── autoLayout.ts             # Group-aware barycentric/grid layout & multi-domain instance builder
        ├── schemaDiff.ts             # Semantic & line-level schema diff generator
        ├── importExport.ts           # SQL DDL, CSV, DBML, SVG, and high-resolution PNG import/export
        ├── remoteService.ts          # Client API wrapper for /api/fetch-url and /api/github/*
        └── sampleSchemas.ts          # Built-in starter and multi-tenant SaaS telemetry templates
```

---

## Getting Started (Local Development)

### Prerequisites

- **Node.js** `>= 20.x` (LTS recommended)
- **npm** (or **bun**, lockfile included as `bun.lock`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional for Local / Required for GitHub OAuth)

Core editing, diagramming, docs, and loading public DBML URLs work without any API keys. To enable **GitHub OAuth login and pushing commits**:

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

This runs `tsx server.ts`, starting the Hono API + Vite dev server at **`http://localhost:3000`** (bound to `0.0.0.0:3000`).

### 4. Type-Check & Lint

Run TypeScript static type checking across the frontend, Hono API, and Cloudflare entry points before committing or deploying:

```bash
npm run lint
```

### Useful Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Focus Global Search |
| `⌘B` / `Ctrl+B` | Toggle Left Sidebar *(locked hidden in Docs view)* |
| `⌘J` / `Ctrl+J` | Toggle Docs Navigation Tree *(in Docs view)* |
| `⌘\` / `Ctrl+\` | Toggle / Minimize Code Editor |
| `⌘⇧E` / `Ctrl+Shift+E` | Maximize / Restore Code Editor |
| `⌘F` / `Ctrl+F` | Find text in Code Editor |
| `⌘H` / `Ctrl+H` | Find & Replace in Code Editor |
| `⌘G` / `Ctrl+G` | Go to Line (`line` or `line:col`) in Code Editor |
| `⌘S` / `Ctrl+S` | Save Version Snapshot |
| `⌘I` / `Ctrl+I` | Open Import / Export Modal |
| `Ctrl+Space` | Trigger DBML Autocomplete inside Editor |

---

## Deploying to Production

SchemaForge includes a unified Hono backend (`server/api.ts`) so both the React SPA (`dist/`) and `/api/*` endpoints (URL proxy + GitHub OAuth/Sync/Push) run cleanly on **Cloudflare Workers**, **Cloudflare Pages**, or **Node.js / Docker**.

### 1. Verify Type Safety and Build

```bash
npm run lint
npm run build
```

`npm run build` compiles and minifies the frontend bundle into `/dist`.

---

### 2. Deploy to Cloudflare Workers (Recommended — Configured via `wrangler.jsonc`)

The repository includes `wrangler.jsonc` (`name: "schema-forge"`, `main: "worker.ts"`) configured for **Cloudflare Workers with Static Assets** and **`wrangler preview`** support (`run_worker_first: ["/api/*"]`, `not_found_handling: "single-page-application"`, and `previews: {}`).

#### Option A: Cloudflare Workers Builds (Git Integration)
1. In the **Cloudflare Dashboard**, go to **Workers & Pages → Create → Import a repository**.
2. Configure the build settings:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
   - **Preview command** *(if using branch/PR previews)*: `npx wrangler preview`
3. Add **Variables and Secrets** under **Worker → Settings → Variables and Secrets** *(and Preview environment secrets if testing OAuth on previews)*:
   - `GITHUB_CLIENT_ID` — Your GitHub OAuth App Client ID
   - `GITHUB_CLIENT_SECRET` — Your GitHub OAuth App Client Secret
   - `SESSION_SECRET` *(optional, recommended)* — Random string used to sign/encrypt session cookies across deployments
   - `APP_URL` *(optional)* — Only needed if using a custom proxy domain; otherwise automatically derived from the request origin
4. Update `"name"` in `wrangler.jsonc` if your Worker uses a different name in Cloudflare.
5. Register your Cloudflare callback URL in **GitHub Developer Settings → OAuth Apps** (<https://github.com/settings/developers>):
   - `https://<your-worker-subdomain-or-custom-domain>/api/auth/github/callback`

#### Option B: Deploy from CLI with Wrangler
```bash
npm run build
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

---

### 3. Deploy to Cloudflare Pages (with Pages Functions)

If you prefer **Cloudflare Pages**, `functions/api/[[route]].ts` automatically wires `/api/*` to the shared Hono router:

1. In **Workers & Pages → Create → Pages → Connect to Git**, configure:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
2. Add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `SESSION_SECRET` under **Pages → Settings → Environment variables** (Production and Preview).
3. Register `https://<your-pages-project>.pages.dev/api/auth/github/callback` in your GitHub OAuth App settings.

---

### 4. Deploy with Node.js / Docker / Cloud Run

To self-host the full-stack server (`server.ts`) with Node.js:

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
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
EXPOSE 3000
CMD ["node", "server.ts"]
```

---

### Clean Build Artifacts

To remove build outputs locally:

```bash
npm run clean
```
