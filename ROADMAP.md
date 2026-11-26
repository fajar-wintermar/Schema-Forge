# SchemaForge Product Roadmap & Feature Tiering

> Updated product assessment, **Essential vs. Premium** feature separation, and phased roadmap reflecting **SchemaForge**'s delivered capabilities across Phases 1–3 + CI/CLI tooling, alongside upcoming team & governance milestones.

---

## 1. Current State Assessment

### Strengths (Pros)
- **Clean Architecture & Shared Domain Kernel**: Framework-free `@shared/domain/*` kernel (DBML lexer/parser/mutators, GitHub target parser, share expiration rules, core schema types) shared across Node.js (`server.ts`), Cloudflare Workers (`worker.ts`), Pages Functions (`functions/api/[[route]].ts`), the SchemaForge CLI (`cli/`), and the React SPA.
- **Resilient, Decomposed Frontend UX**: Root and feature-scoped React `ErrorBoundary` fallbacks, consistent async `loading`/`error`/`empty` states, `AbortController` race-condition protection isolated in dedicated hooks, and modularized editor, diagram, docs, GitHub, and sharing subcomponents.
- **Interactive Canvas, Minimap & Layout Pinning**: 150+ table spatial virtualization & 3-tier Auto-LOD, **click/drag interactive Minimap** with collapsed domain indicators, **Lock / Unlock Canvas Layout** mode, **Collapse All / Expand All** domain controls, Focus Neighborhood (`F`), Ortho/Curved/Bundled edges, marquee multi-select, snap alignment guides, and drag-to-connect FKs.
- **Git-Native Schema Workflow & Pull Request Creation**: Two-way GitHub sync (single `.dbml` and modular `schema/**/*.dbml`), **`.schemaforge/layout.json`** layout commit & pull restoration, and in-app **Open Pull Request** flow (`POST /api/github/create-pr`) auto-generating semantic schema diffs, breaking-change callouts, and incremental SQL migrations.
- **Rich Documentation Portal & Interactive HTML Exports**: `dbdocs`-style portal with **Documentation Coverage Meter** (`OverviewPage`), structured **Metadata Tags** (`@pii`, `@owner(...)`, `[Deprecated]`, `[SLA: ...]`, `Tags: ...`), **Write | Split | Preview** Markdown editor, per-domain SVG atlas switcher, **click-to-navigate SVG** with hover FK emphasis, zoom/pan controls, and one-click Notion/Confluence Markdown summaries (with sticky notes cleanly excluded from exports).
- **Broad Ecosystem Interoperability**: Import DBML, PostgreSQL/MySQL/SQL DDL, CSV, URLs, **Prisma**, **Drizzle TypeScript**, and **OpenAPI 3.1 / JSON Schema**; export DBML, PostgreSQL/MySQL DDL, CSV, SVG, PNG, HTML docs atlas, Markdown, **Mermaid ERD (`.mmd`)**, **Prisma**, **Drizzle**, **SQLAlchemy**, and **OpenAPI 3.1**.
- **SchemaForge CLI & CI/CD Automation**: `schemaforge check` (parse, 5-rule quality lint, docs coverage, `--base` breaking-change diffing, PR commenting), `schemaforge pull` (built-in Node 22 `node:sqlite` live introspection + drift reports, `.sql` import), and `schemaforge export`, plus `.github/workflows/schemaforge-pr.yml`.
- **Local-First Security, Offline PWA & Edge Sync**: AES-256-GCM encrypted IndexedDB persistence, installable PWA, optional Cloudflare D1 / Node SQLite sync, and clean revocable, expiring, version-pinned `/share/:token` links.

### Remaining Limitations (Cons)
- **Live PostgreSQL & MySQL Driver Introspection**: `schemaforge pull` currently supports live SQLite (`node:sqlite`) and `.sql` DDL dumps; direct TCP introspection of remote PostgreSQL (`pg_catalog`) and MySQL (`information_schema`) servers requires connecting via external dump/driver adapters.
- **Single-Player Review & Missing Org/RBAC Entitlement Layer**: Share links are view-only and sticky notes are local/unthreaded (no anchored threaded PR review comments, live collaborative cursors, workspace RBAC roles, or automated billing/entitlement gating).
- **GitHub-Only VCS Provider & Optional AI Workflows**: Native Git integration covers GitHub OAuth and PRs (no GitLab/Bitbucket adapters yet), and AI copilot features remain intentionally unimplemented/opt-in only.

---

## 2. Feature Separation: Essential vs. Premium

| Capability Area | Essential *(Core / Free Local-First)* | Premium *(Team / Cloud / Enterprise)* |
| --- | --- | --- |
| **DBML Editor & Spec** | Full CodeMirror 6 IDE, `Alt+Z` wrap, modular `schema/**/*.dbml` Explorer, lossless Flatten/Split *(Delivered)* | Org-wide **Custom Linter Rulesets** & shared partial registries *(Planned)* |
| **Interactive ER Canvas** | 150+ Table Virtualization, Auto-LOD, **Interactive Minimap**, **Lock / Unlock Layout**, Collapse/Expand All `TableGroup`, Focus Mode (`F`), Ortho/Curved/Bundled edges, Marquee & snap alignment, `.schemaforge/layout.json` file format *(Delivered)* | **Anchored Threaded Review Comments** & **Live Collaborative Cursors** *(Planned)* |
| **Quality, Coverage & Diffs** | Core **5-rule Quality Linter**, **Documentation Coverage Meter**, **Metadata Tag Pills** (`@pii`, `@owner`, `[Deprecated]`), visual semantic diff + breaking-change alerts *(Delivered)* | Custom compliance policy gates & automated lock/rewrite risk scoring *(Planned)* |
| **SQL, ORM & Docs Export** | DBML, PG/MySQL DDL, CSV, PNG, SVG, **Interactive HTML Docs Atlas (multi-domain + click-to-navigate)**, **Markdown**, **Mermaid ERD**, **Notion/Confluence copy**, **Prisma / Drizzle / SQLAlchemy / OpenAPI converters**, **Write/Split/Preview Markdown editor** *(Delivered)* | Custom-branded hosted docs portals & white-label PDF themes *(Planned)* |
| **Git, CLI & CI/CD** | GitHub pull/push, **`.schemaforge/layout.json` sync**, **`schemaforge` CLI** (`check`, `pull` SQLite/SQL, `export`) *(Delivered)* | **GitHub PR Creation with Semantic Diffs** *(Delivered — Pro tier)*, **GitHub PR Action** *(Delivered)*, Live PostgreSQL/MySQL network introspection, **GitLab / Bitbucket adapters** *(Planned)* |
| **Cloud & Governance** | Local-first encrypted IndexedDB, offline PWA, local version snapshots (`⌘S`) *(Delivered)* | Cloudflare D1 / SQLite sync & versioned Share Links *(Delivered)*, **Workspace RBAC (Owner/Editor/Viewer)**, **Billing Entitlements**, **SSO/SAML**, **Audit Logs** *(Planned)* |

---

## 3. Phased Product & Engineering Roadmap

### Phase 1 — Core Studio, Spec Parity & Virtualization *(Completed)*
- [x] Full DBML Spec Parity (`TablePartial`, `Checks`, expression `Indexes`, extended `Ref` metadata)
- [x] CodeMirror 6 IDE, Modular `schema/` Explorer & lossless Flatten/Split
- [x] Diagram Decluttering (Focus Mode `F`, Ortho/Curved/Bundled edges, Ungrouped filtering, sticky note export exclusion)
- [x] Interactive Canvas Authoring & 150+ Table Spatial Virtualization + 3-Tier Auto-LOD
- [x] Global Command Palette (`⌘K`), 5-Rule Quality Linter, Offline PWA + AES-GCM IndexedDB

### Phase 2 — Cloud Foundations, Hardening & Clean Architecture *(Completed)*
- [x] Incremental SQL Migration (`ALTER`) Generator (PostgreSQL & MySQL between snapshots & Git commits)
- [x] Optional Cloud Workspaces & GitHub OAuth (Cloudflare D1 / Node `node:sqlite`)
- [x] Shareable Read-Only Docs & Diagram Links (`/share/:token` with pinning, expiration, revocation & export toggle)
- [x] Two-Way GitHub Multi-File `schema/` Sync & Clean Architecture refactor (`@shared/domain/*`, `server/`, `src/`)

### Phase 3 — Interactive Docs, Canvas UX, ORM Ecosystem & GitHub PR Workflow *(Completed)*
- [x] **Interactive Click-to-Navigate SVG & Zoomable Multi-Domain HTML Atlas** (`+`/`−`/`Fit`/`100%`, drag pan, scroll zoom, table/group jump anchors, FK hover highlighting)
- [x] **Interactive Click/Drag Minimap, Collapse/Expand All & Layout Lock Mode**
- [x] **Documentation Coverage Meter, Custom Metadata Tags (`@pii`, `@owner`, `[Deprecated]`, `Tags:`) & Live Split Markdown Preview**
- [x] **Multi-Format Exports & ORM Interop**: Mermaid `.mmd`, Confluence/Notion copy button, Prisma, Drizzle TypeScript, SQLAlchemy 2.0, and OpenAPI 3.1
- [x] **Git-Tracked `.schemaforge/layout.json` Sync & In-App GitHub Pull Request Creation (`POST /api/github/create-pr`)**
- [x] **SchemaForge CLI (`cli/schemaforge.ts`: `check`, `pull` SQLite/SQL, `export`) & GitHub PR Check Workflow (`.github/workflows/schemaforge-pr.yml`)**

---

### Phase 4 — Live Network DB Introspection & Entitlement / RBAC Platform *(Next Up)*
- [ ] **Remote PostgreSQL & MySQL Network Introspection (`schemaforge pull postgres://... | mysql://...`)**
  - Extend CLI `pull` beyond local SQLite & `.sql` DDL dumps using optional database catalog connectors to inspect live PostgreSQL/MySQL schemas and report drift in CI.
- [ ] **Tier Entitlements, Workspace RBAC & Billing Hooks**
  - Add workspace role permissions (`Owner`, `Editor`, `Viewer`), usage quotas on hosted workspaces/share links, and clean entitlement enforcement across Hono routes and UI controls.
- [ ] **GitHub Pages / Static Artifact Docs Deploy Action**
  - Extend `.github/workflows/schemaforge-pr.yml` with a merge-to-`main` job using `schemaforge export --format html` to publish versioned static documentation portals automatically.

### Phase 5 — Multiplayer Review, Multi-VCS & Enterprise Governance *(Future)*
- [ ] **Anchored Threaded Review Comments & Live Presence**
  - Evolve sticky notes into resolvable review threads anchored to tables, columns, or PR branches with optional collaborative cursors.
- [ ] **GitLab & Bitbucket Repository Providers**
  - Abstract `IGithubGateway` into a unified `IVcsGateway` supporting GitLab Merge Requests and Bitbucket Pull Requests.
- [ ] **Enterprise Compliance & Organization Governance**
  - Custom organization linter policies (e.g., enforcing `@owner(...)` and `@pii` tags on customer tables), custom-domain share portals, SSO/SAML, and audit trails.
