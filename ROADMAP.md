# SchemaForge Product Roadmap & Feature Tiering

> Updated product assessment, **Essential vs. Premium** feature separation, and phased roadmap reflecting **SchemaForge**'s current Clean Architecture codebase, security/production hardening, and upcoming team & ecosystem milestones.

---

## 1. Current State Assessment

### Strengths (Pros)
- **Clean Architecture & Shared Domain Kernel**: Framework-free `@shared/domain/*` kernel (DBML lexer/parser/mutators, GitHub target parser, share expiration rules, core schema types) shared across Node.js (`server.ts`), Cloudflare Workers (`worker.ts`), Pages Functions (`functions/api/[[route]].ts`), and the React SPA—with strict backend layering (`domain/`, `application/`, `infrastructure/`, `presentation/http/`) and frontend separation (`services/`, `hooks/`, decomposed `features/` and `components/`).
- **Resilient, Decomposed Frontend UX**: Root and feature-scoped React `ErrorBoundary` fallbacks, consistent async `loading`/`error`/`empty` states, `AbortController` race-condition protection isolated in dedicated hooks (`src/hooks/`, `src/features/*/hooks/`), and modularized editor, diagram, docs, and sharing subcomponents.
- **Production & Security Hardening**: Startup Zod environment validation (`server/infrastructure/config/serverEnv.ts`), `@hono/zod-validator` payload & header validation, `secureHeaders()`, explicit origin `cors()`, `hono-rate-limiter`, tiered `bodyLimit()` protections, sanitized global `onError` responses, SSRF-safe remote URL fetching, parameterized D1/SQLite queries, `/healthz` DB probes, and graceful `SIGTERM`/`SIGINT` shutdown.
- **Unified Text + Diagram + Docs Studio**: A single DBML source drives the resizable/maximizable CodeMirror 6 IDE (`Alt+Z` word wrap, code folding, autocomplete, find/replace, go-to-line), interactive ERD canvas, and `dbdocs`-style engineering documentation portal with Global Command Palette (`⌘K` / `Ctrl+K`).
- **Lossless Modular DBML & Real GitHub Sync**: Supports `schema/*.dbml` modules with custom nested subfolders, lossless Flatten/Split round-tripping, toggleable Explorer, cross-file diagnostic jumps, branch creation/switching, batched Git commits, and commit history comparison.
- **Enterprise-Scale 150+ Table Canvas Virtualization**: Tile-quantized spatial viewport culling, 3-tier automatic Level-of-Detail (`full` / `compact` / `minimal`), `requestAnimationFrame`-coalesced 60fps panning/zooming, live minimap camera viewport frame, marquee/Shift multi-select, real-time snap alignment guides, align/distribute actions, and drag-to-connect FK creation.
- **Domain-First Visual Organization**: `TableGroup` containers, explicit **Ungrouped** filtering and domain-scoped exports (without altering Docs), multi-domain shared tables, Focus Neighborhood (`F`), Curved/Orthogonal edge routing, Cross-Domain Show/Bundle/Hide, custom header colors, and sticky notes.
- **Incremental SQL Migrations (`ALTER`) & Schema Quality Linter**: Emits PostgreSQL and MySQL `ALTER TABLE`, index, enum, and FK migration scripts between any two saved snapshots or Git commits (excluding doc notes from `.sql` DDL), paired with a non-blocking 5-rule Schema Quality Analyzer.
- **Local-First Security, Offline PWA & Edge Sync**: Persists offline in AES-256-GCM encrypted IndexedDB with full PWA installability, plus optional Cloudflare D1 / Node SQLite sync and clean revocable, expiring, version-pinned share links (`/share/:token`).
- **Automated Regression Suite**: Backed by Vitest unit tests (30 tests across 7 suites) and Playwright E2E smoke tests (6 full workflow suites, including 160-table canvas virtualization).

### Current Limitations (Cons)
- **Direct-Push GitHub Flow & Layout Outside Git**: Pushes commits cleanly to branches, but lacks an in-app **Create Branch & Open Pull Request** flow and does not yet persist `tablePositions` / `stickyNotes` inside `.schemaforge/layout.json` in Git.
- **DBML + PostgreSQL/MySQL Format Boundaries**: Supports DBML, PG/MySQL DDL, SQL migrations, CSV, SVG, and PNG, while modern ORM/API formats (**Prisma**, **Drizzle**, **TypeORM**, **SQLAlchemy**, **OpenAPI**) and standalone **static HTML/Markdown doc bundles** are not yet supported.
- **AI Gateway Scaffolded Without Live Product Workflows**: Server-side `IAiGateway` / `GeminiAiGateway` infrastructure and rate-limited `/api/ai/*` & `/api/gemini/*` guards are in place, but AI-assisted schema generation, documentation drafting, or SQL migration review features are not yet wired into the application or UI.
- **No Live DB Introspection or CI/CD Automation**: Static parsing and diagnostics work offline, but there is no CLI (`npx schemaforge`) or GitHub Action yet to introspect live databases, detect schema drift, or post PR diff previews automatically.
- **Single-Player Collaboration & Missing Entitlement Layer**: Share links are view-only and sticky notes are standalone (no threaded PR review comments, live presence, or workspace RBAC). Cloud sync, versioned share portals, and commit-level migrations exist without a formal **Essential vs. Premium** entitlement boundary or org/seat management.

---

## 2. Feature Separation: Essential vs. Premium

*Packaging Principle: **Essential** delivers a complete, fast, zero-friction local-first DBML studio so solo developers never hit paywalls on core modeling or canvas performance. **Premium** monetizes team workflows, cloud hosting, ecosystem codegen, AI/CI/CD automation, and governance.*

| Capability Area | Essential *(Core / Free Local-First)* | Premium *(Team / Cloud / Enterprise)* |
| --- | --- | --- |
| **DBML Editor & Spec** | **CodeMirror 6 IDE** (full DBML spec: `TablePartial`, `Checks`, expression `Indexes`, inline `Ref`), `Alt+Z` wrap, folding, autocomplete, find/replace, go-to-line *(Delivered)* | Shared team **Schema Templates**, **Custom Linter Rulesets** (org naming/compliance policies), and cross-repo partial registries *(Planned)* |
| **Modular Workspaces** | Single-file & modular `schema/**/*.dbml` Explorer, lossless Flatten/Split, cross-file error mapping *(Delivered)* | Multi-workspace **Team Organization Catalogs** & shared domain governance across services *(Planned)* |
| **Interactive ER Canvas** | **150+ Table Virtualization** (culling + Auto-LOD + 60fps pan/zoom), Auto Layout, `TableGroup` + Ungrouped filtering, Focus Mode (`F`), Ortho/Curved/Bundled edges, Marquee multi-select, snap alignment, drag-to-connect FKs, Minimap, local Sticky Notes *(Delivered)* | **Git-Tracked `.schemaforge/layout.json`** team layout sync *(Planned)*, **Anchored Threaded Review Comments**, and **Live Collaborative Cursors** *(Planned)* |
| **Quality & Diffs** | Core **5-rule Schema Quality Linter** (unindexed FK, missing PK, naming drift, nullable unique, FK cycles) + visual semantic diff between local drafts *(Delivered)* | **Breaking-Change Risk Analyzer** (lock/data-loss checks), custom team lint severity enforcement, and PR diff reports *(Planned)* |
| **SQL & Code Import / Export** | Import DBML, PG/MySQL `CREATE TABLE`, CSV, URL; Export DBML, PG/MySQL DDL, CSV, PNG, SVG (including domain-scoped export) *(Delivered)* | **Incremental `ALTER` Migration Studio** across Git commits & snapshots *(Delivered — move to Team/Pro tier)*; **ORM & API Importers/Exporters** (Prisma, Drizzle, TypeORM, SQLAlchemy, OpenAPI, Mermaid) & **Static HTML/MD Docs Bundles** *(Planned)* |
| **Engineering Docs & Search** | Full `dbdocs`-style local Docs Portal, GFM Markdown notes, Global Command Palette (`⌘K`) *(Delivered)* | **Private Hosted Team Docs Portals**, custom branding/domains, and **Shareable Versioned Links** with expiration, revocation & export controls *(Delivered — tier gate planned)* |
| **Persistence, Security & Sync** | Local-first **AES-256-GCM IndexedDB**, offline **PWA** install, local version snapshots (`⌘S`) *(Delivered)* | **Cloudflare D1 / SQLite Cloud Sync**, **Workspace RBAC** (Owner/Editor/Viewer), **SSO/SAML**, and **Audit Logs** *(Sync Delivered; RBAC/SSO Planned)* |
| **Git, CI/CD & Live DB** | Basic **GitHub Single-File Pull/Push** & URL loader (`?url=`) *(Delivered)* | **Multi-File `schema/` Batch Git Sync** *(Delivered)*, **Open PR with Semantic Diff** *(Planned)*, **GitLab/Bitbucket**, **SchemaForge CLI & GitHub Action**, and **Live DB Introspection + Drift Detection** *(Planned)* |

---

## 3. Phased Product & Engineering Roadmap

### Phase 1 — Core Studio, Spec Parity & Virtualization (`Essential` — Completed)
*Goal: Best-in-class offline-capable DBML editor, documenter, and high-scale diagrammer.*
- [x] **Full DBML Spec Parity** (`TablePartial`, `Checks`, expression `Indexes`, extended `Ref` metadata)
- [x] **CodeMirror 6 Editor, Modular `schema/` Explorer & Word Wrap (`Alt+Z`)** with lossless nested-folder Flatten/Split
- [x] **Diagram Decluttering & Domain Focus** (Focus Mode `F`, Ortho/Curved edges, Cross-Domain Show/Bundle/Hide, Ungrouped filtering & scoped export)
- [x] **Interactive Canvas Authoring** (Marquee/Shift multi-select, snap alignment guides, Align/Distribute bar, drag-to-connect FK `Ref:` insertion)
- [x] **150+ Table Canvas Virtualization** (Tile-quantized spatial culling, 3-tier Auto-LOD, rAF pan/zoom, minimap viewport frame)
- [x] **Global Command Palette (`⌘K`)**, **Schema Quality Linter (5 core rules)**, **Offline PWA + Encrypted IndexedDB**, and **Automated Vitest + Playwright Regression Suite**

---

### Phase 2 — Cloud Foundations, Hardening & Clean Architecture (`Completed`)
*Goal: Establish cloud persistence, clean sharing, security hardening, and maintainable Clean Architecture.*
- [x] **Incremental SQL Migration (`ALTER`) Generator** (PostgreSQL & MySQL `ALTER TABLE`, indexes, enums, FKs between snapshots and Git commits)
- [x] **Optional Cloud Workspaces & GitHub OAuth** (Cloudflare D1 / Node.js `node:sqlite` sync across devices)
- [x] **Shareable Read-Only Docs & Diagram Links** (`/share/:token` with version pinning, expiration, revocation, and PNG/SVG export toggles)
- [x] **Two-Way GitHub Multi-File `schema/` Sync** (Batched folder commits, branch management, and commit SHA comparison)
- [x] **Security & Production Hardening** (Zod startup `serverEnv`, `@hono/zod-validator`, `secureHeaders()`, strict `cors()`, `hono-rate-limiter`, `bodyLimit()`, sanitized `onError`, `/healthz` DB probe, graceful `SIGTERM` shutdown)
- [x] **Full Clean Architecture & Frontend Refactor** (`@shared/domain/*` kernel, `server/{domain,application,infrastructure,presentation}`, `src/{services,hooks,features,components}`, Error Boundaries, `AbortController` hooks, and decomposed `DiagramCanvas` / `ShareModal`)

---

### Phase 3 — Git-Native PR Workflow & Ecosystem Interoperability (`Next Up`)
*Goal: Eliminate team friction in Git reviews and unlock adoption across non-DBML stacks.*
- [ ] **Git-Tracked Layout & Sticky Metadata (`.schemaforge/layout.json`)** `[Essential]`
  - Optionally commit `.schemaforge/layout.json` (table coordinates, sticky notes, canvas settings) alongside `schema/*.dbml` so any teammate cloning the repo gets identical diagram layouts with zero cloud dependency.
- [ ] **GitHub Pull Request & Semantic Diff Flow** `[Premium]`
  - Add **Create Branch & Open Pull Request** inside `GitHubModal`, auto-generating PR bodies with SchemaForge's semantic `schemaDiff` summary and breaking-change callouts.
- [ ] **Expanded ORM / API Importers & Exporters** `[Premium]`
  - Client-side importers for **Prisma (`schema.prisma`)**, **Drizzle TypeScript**, and **JSON Schema / OpenAPI**.
  - Exporters for **Prisma**, **Drizzle**, **TypeORM**, **SQLAlchemy**, **Mermaid ERD**, and downloadable **Static HTML / Markdown Docs Bundles**.

---

### Phase 4 — Entitlement Architecture, CI/CD & Live DB Bridge (`Monetization & DevOps`)
*Goal: Enforce Essential vs. Premium tiers cleanly and embed SchemaForge into automated pipelines.*
- [ ] **Tier Entitlements, Workspace RBAC & Billing Hooks** `[Platform]`
  - Introduce a unified capability/entitlement config (`essential` vs `premium`), usage limits on hosted shares/cloud workspaces, and workspace role permissions (`Owner`, `Editor`, `Viewer`).
- [ ] **SchemaForge CLI & GitHub Action** `[Premium]`
  - `npx schemaforge check` in CI to validate modular `schema/*.dbml`, lint schema quality rules, flag destructive `ALTER` drops, post PR comment diffs + SVG/PNG previews, and auto-deploy static docs on merge to `main`.
- [ ] **Live Database Introspection & Drift Detection** `[Premium]`
  - `npx schemaforge pull <connection-url>` to introspect PostgreSQL, MySQL, or SQLite catalogs into DBML and highlight schema drift against the repository baseline.

---

### Phase 5 — Multiplayer Review, AI Workflows & Enterprise Governance (`Scale`)
*Goal: Full team review collaboration, AI-assisted schema modeling, and multi-provider enterprise compliance.*
- [ ] **Anchored Review Comments & Live Presence** `[Premium]`
  - Upgrade sticky notes into threaded, resolvable review comments anchored to specific tables, columns, or PR branches, with optional live cursors.
- [ ] **Server-Side AI Schema Copilot (on `IAiGateway`)** `[Premium]`
  - Wire the existing `GeminiAiGateway` infrastructure into explicit opt-in workflows (NL-to-DBML drafting, migration safety explanations, and table/column doc suggestions).
- [ ] **Multi-VCS Adapters & Enterprise Governance** `[Premium]`
  - Add **GitLab** and **Bitbucket** adapters via a shared repository provider interface, **SSO/SAML**, custom team linter policies, custom-domain share portals, and audit logs.

---

## 4. Recommended Execution Priority (Highest Leverage Next)

1. **`.schemaforge/layout.json` in GitHub Sync + "Open Pull Request" Flow** — Completes the Git-native engineering loop immediately on top of existing `GitHubModal` and `schemaDiff` code.
2. **Prisma / Drizzle / OpenAPI Importers & ORM/Static Docs Bundle Exporters** — Strongest top-of-funnel growth and clear Premium conversion driver for TypeScript/Python backend teams.
3. **Tier Entitlement Config + Workspace RBAC** — Establishes clean separation between free local-first features and paid Team/Cloud capabilities before launching hosted plans.
4. **SchemaForge CLI / GitHub Action & Live DB Introspection Bridge** — Locks SchemaForge into daily CI/CD and production database workflows.
5. **Anchored Review Comments, AI Copilot & Multi-VCS** — Rounds out multiplayer collaboration, AI-assisted workflows, and the enterprise tier.
