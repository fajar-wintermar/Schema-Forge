# SchemaForge Product Roadmap

> Product evaluation, current-state pros & cons, and phased roadmap for evolving **SchemaForge** from a local-first DBML studio into a full team schema engineering platform.

---

## 1. Current State Assessment

### Strengths (Pros)
- **Unified Text + Diagram + Docs Workflow**: A single DBML source drives the live CodeMirror 6 IDE editor (with `Alt+Z` word wrap, folding, autocomplete, find/replace, and go-to-line), interactive ERD canvas, and engineering documentation portal.
- **Lossless Modular DBML + Real GitHub Integration**: Supports splitting schemas into `schema/*.dbml` modules and custom nested subfolders with lossless Flatten/Split round-tripping, a toggleable Explorer panel, cross-file error mapping, branch initialization, batched Git commits, commit history comparison, and incremental SQL migrations.
- **Incremental SQL Migrations (`ALTER`)**: Compares any two saved version snapshots or Git commits to generate clean PostgreSQL and MySQL `ALTER TABLE`, `CREATE/DROP INDEX`, enum, and foreign-key migration scripts (keeping DBML documentation notes out of `.sql` DDL files).
- **Domain-First Visual Organization & Focus Tools**: `TableGroup` containers (plus explicit filtering and scoped export for **Ungrouped** tables on the canvas without altering Docs), multi-domain shared tables, Focus Neighborhood mode (`F`), orthogonal/curved/bundled edge routing, custom table header colors, and sticky architecture notes.
- **Local-First Security, Offline PWA & Edge Cloud Sync**: Persists locally in AES-256-GCM encrypted IndexedDB with full offline PWA support (including iOS & Firefox install guides), responsive grouped TopBar navigation, and optional Cloudflare D1 / Node SQLite sync with clean revocable/deletable versioned share links.

### Current Limitations (Cons)
- **No Automated Test Suite in Repo**: Core engines (`dbmlParser`, `schemaModules`, `schemaDiff`, `sqlMigration`) and UI workflows currently rely on manual/ad-hoc checks and `tsc` rather than an automated Vitest + Playwright regression suite.
- **Direct-Push GitHub Flow & Layout Outside Git**: Supports pushing commits directly to branches and comparing Git commits, but lacks an in-app **Create Branch & Open Pull Request** flow and does not yet track `tablePositions` / `stickyNotes` in `.schemaforge/layout.json` inside Git.
- **DBML/SQL-Centric Import/Export Only**: Supports DBML, PostgreSQL/MySQL DDL, incremental SQL migrations, CSV, SVG, and PNG, while ORM/API formats (Prisma, Drizzle, TypeORM, SQLAlchemy, OpenAPI, Mermaid ERD, and standalone static HTML/Markdown doc bundles) are not yet available.
- **No Built-In Schema Quality Linter or Live DB Introspection**: Detects syntax/reference errors, but does not warn on schema design issues (e.g., unindexed foreign keys, missing PKs, naming drift, circular FKs) or introspect live databases directly.
- **Limited Canvas Authoring Gestures**: Supports dragging individual tables/groups and editing via DBML/Inspector, but lacks multi-table box selection, alignment guides, and visual drag-from-column-to-column FK creation.
- **No Threaded Collaboration**: Share links are view-only and sticky notes are standalone annotations rather than threaded, resolvable PR review discussions.

---

## 2. Phased Product Roadmap

### Phase 1 — Core Power & Spec Completeness (Completed)
*Goal: Deliver maximum daily engineering value without requiring backend database infrastructure.*

- [x] **Incremental SQL Migration (`ALTER`) Generator**
  - Emit `ALTER TABLE ... ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, enum, and foreign-key `ALTER` statements between any two saved snapshots or Git commits (PostgreSQL & MySQL), keeping documentation notes out of exported `.sql` files.
- [x] **Full DBML Spec Parity**
  - Parser, semantic validator, diagram, and docs support for `TablePartial`, `Checks` blocks, expression-based `Indexes`, and extended inline `Ref` metadata.
- [x] **Diagram Focus, Ungrouped Filtering & Visual Decluttering**
  - **Focus Neighborhood Mode (`F`)**, **Orthogonal Edge Routing**, **Cross-Domain Edge Show/Bundle/Hide**, and dedicated **Ungrouped** table filtering + domain-scoped DBML/SQL/CSV/PNG/SVG exports.
- [x] **Global Command Palette (`Cmd/Ctrl + K`)**
  - Instant fuzzy search and jump to any table, column, domain, Markdown note, or `.dbml` module across Editor, Diagram, and Docs views.

---

### Phase 2 — IDE Ergonomics, Canvas Authoring & Quality Checks (Next Up)
*Goal: Remove daily friction for solo engineers and teams working on large schemas.*

- [x] **CodeMirror 6 Editor, Explorer Toggle & Word Wrap (`Alt+Z`)**
  - CodeMirror 6 with DBML syntax theme, collapsible blocks, bracket matching, `Alt+Z` / `⌥Z` word wrap toggle, toggleable modular Explorer, and lossless subfolder preservation across Flatten/Split.
- [ ] **Schema Quality Linter & Best-Practice Analyzer**
  - Non-blocking diagnostics panel flagging unindexed foreign-key columns, tables without primary keys, inconsistent `snake_case`/`camelCase` naming, nullable unique keys, and circular FK cycles.
- [ ] **Interactive Canvas Multi-Select, Alignment & Drag-to-Connect FKs**
  - Marquee/Shift multi-select for tables, snap alignment guides (align left/top/distribute), and dragging from a column handle to another column to insert a DBML `Ref` automatically.
- [ ] **Automated Regression Suite (Vitest + Playwright)**
  - Unit tests for DBML parsing, lossless modular round-tripping, semantic diffs, and PostgreSQL/MySQL `ALTER` SQL generation, plus Playwright smoke tests for Editor/Diagram/Docs/Share flows.
- [ ] **GitHub Pull Request & Diff Review Flow**
  - Add a **Create Branch & Open Pull Request** flow in `GitHubModal`, pre-filling the PR description with SchemaForge's semantic `schemaDiff` summary (tables, columns, refs, enums, and domains changed).
- [ ] **Expanded Schema Importers & Code Exporters**
  - Client-side importers for **Prisma (`schema.prisma`)**, **Drizzle TypeScript schemas**, and **JSON Schema / OpenAPI**.
  - Exporters for **Prisma**, **Drizzle**, **TypeORM**, **SQLAlchemy**, **Mermaid ERD**, and downloadable **static HTML / Markdown documentation bundles**.

---

### Phase 3 — Shared Layouts, Cloud Sync & Collaboration
*Goal: Evolve SchemaForge into a seamless multi-engineer team workspace.*

- [ ] **Git-Tracked Layout & Sticky Metadata (`.schemaforge/layout.json`)**
  - Optionally include `.schemaforge/layout.json` (table coordinates, sticky notes, view settings) in GitHub batch pushes and folder pulls so teammates share identical diagram layouts with zero cloud lock-in.
- [x] **Optional Cloud Workspaces & Authentication**
  - Sync workspaces, layout coordinates, sticky notes, and published versions across devices via Cloudflare D1 / Node SQLite while keeping local AES-GCM `IndexedDB` mode available for offline/anonymous work.
- [x] **Shareable Read-Only Docs & Diagram Links**
  - Generate, edit, expire, and delete clean shareable links for live workspaces or pinned versions (e.g., `v1.2.0`) with toggleable PNG/SVG export permissions.
- [ ] **Anchored Review Comments & Live Presence**
  - Evolve sticky notes into threaded, resolvable review comments anchored to specific tables, columns, or PR branches, with optional collaborative cursors.
- [ ] **150+ Table Canvas Virtualization**
  - Viewport culling and level-of-detail rendering for smooth 60fps panning/zooming on massive enterprise schemas.

---

### Phase 4 — CI/CD Automation & Ecosystem
*Goal: Embed SchemaForge directly into CI pipelines and live database workflows.*

- [ ] **SchemaForge CLI & GitHub Action**
  - Validate and merge `schema/*.dbml` modules in CI, check for breaking migration changes, post semantic schema diffs + rendered SVG/PNG previews onto Pull Requests, and auto-publish static Schema Docs on merge to `main`.
- [ ] **Live Database Introspection Bridge**
  - Lightweight local CLI (`npx schemaforge pull <connection-url>`) to introspect PostgreSQL, MySQL, or SQLite catalogs directly into a workspace or modular `schema/*.dbml` folder.
- [ ] **Multi-VCS Support**
  - Add **GitLab** and **Bitbucket** adapters alongside GitHub using a shared repository provider interface.

---

## 3. Recommended Priority Order (Highest Leverage Next)

1. **Automated Test Suite (Vitest + Playwright) + Schema Quality Linter** — Protects parser/SQL-migration correctness and immediately catches real DB design mistakes (like missing FK indexes) before migrations hit production.
2. **`.schemaforge/layout.json` in GitHub Sync + "Open Pull Request" Flow** — Unlocks shared team diagram layouts and PR review workflows using GitHub alone.
3. **Interactive Canvas Drag-to-Connect FKs & Multi-Select Alignment** — Makes visual schema editing feel as fast as DBML coding.
4. **Prisma / Drizzle / OpenAPI Importers + ORM & Static Docs Bundle Exporters** — Expands adoption across full-stack TypeScript, Python, and API-first teams.
5. **SchemaForge CLI / GitHub Action & Live DB Introspection Bridge** — Integrates SchemaForge into CI/CD checks and existing production databases.
