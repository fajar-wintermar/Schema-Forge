# SchemaForge Product Roadmap

> Product evaluation, current-state pros & cons, and phased roadmap for evolving **SchemaForge** from a local-first DBML studio into a full team schema engineering platform.

---

## 1. Current State Assessment

### Strengths (Pros)
- **Unified Text + Diagram + Docs Workflow**: A single DBML source drives the live CodeMirror 6 IDE editor, interactive ERD canvas, and engineering documentation portal.
- **Modular DBML + Real GitHub Integration**: Supports splitting schemas into domain modules (`schema/*.dbml`) with cross-file error line mapping, conflict detection, branch initialization, batched Git commits, commit history inspection, and incremental SQL migration generation.
- **Incremental SQL Migrations (`ALTER`)**: Compares any two saved version snapshots or Git commits to generate runnable PostgreSQL and MySQL `ALTER TABLE`, `CREATE/DROP INDEX`, enum, and foreign-key migration scripts.
- **Domain-First Visual Organization & Focus Tools**: `TableGroup` containers (plus explicit filtering/export for **Ungrouped** tables on the canvas), multi-domain shared tables, Focus Neighborhood mode (`F`), orthogonal/curved/bundled edge routing, custom table header colors, and sticky architecture notes.
- **Rich Documentation Portal & Offline PWA + Cloud Sync**: Renders GitHub-flavored Markdown docs, persists locally in AES-GCM encrypted IndexedDB with full offline PWA support, and optionally syncs to Cloudflare D1 with versioned shareable read-only links (and toggleable PNG/SVG exports).

### Current Limitations (Cons)
- **Direct-Push GitHub Flow Only**: Supports pushing commits directly to branches and comparing Git commits, but lacks an in-app **Create Branch & Open Pull Request** flow and CI automation.
- **Layout Metadata Outside Git**: Table coordinates (`tablePositions`) and sticky notes live in IndexedDB / Cloudflare D1 rather than a tracked `.schemaforge/layout.json` file in Git repositories.
- **DBML-First Schema Input/Output**: Supports DBML, SQL DDL, incremental SQL migrations, CSV, SVG, and PNG, while third-party ORM importers/exporters (Prisma, Drizzle, OpenAPI) are not yet built.
- **Standalone Annotations**: Sticky notes attach to tables or domains on the canvas, but do not yet support threaded, resolvable PR review conversations.

---

## 2. Phased Product Roadmap

### Phase 1 — Core Power & Spec Completeness (Weeks 1–4)
*Goal: Deliver maximum daily engineering value without requiring backend database infrastructure.*

- [x] **Incremental SQL Migration (`ALTER`) Generator**
  - Extend `schemaDiff` to emit `ALTER TABLE ... ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, enum, and foreign-key `ALTER` statements between any two saved snapshots or Git commits (PostgreSQL & MySQL).
- [x] **Full DBML Spec Parity**
  - Add parser, semantic validator, diagram, and docs support for `TablePartial`, `Checks` blocks, expression-based `Indexes`, and extended inline `Ref` metadata.
- [x] **Diagram Focus & Visual Decluttering**
  - **Focus Neighborhood Mode**: Clicking a table highlights its 1-hop upstream/downstream relationships and dims unrelated tables and edges.
  - **Orthogonal Edge Routing**: Optional right-angle connector routing alongside curved Béziers.
  - **Cross-Domain Edge Toggles**: Option to hide or bundle cross-domain links on crowded canvases.
- [x] **Global Command Palette (`Cmd/Ctrl + K`)**
  - Instant fuzzy search and jump to any table, column, domain, Markdown note, or `.dbml` module across Editor, Diagram, and Docs views.

---

### Phase 2 — IDE Ergonomics & Team Git Workflows (Weeks 5–10)
*Goal: Remove friction for engineering teams adopting SchemaForge inside existing repositories.*

- [x] **CodeMirror 6 Editor Upgrade**
  - Replace the `<textarea>` + `<pre>` highlight overlay with CodeMirror 6 while keeping the existing DBML syntax theme, modular file explorer, and schema-aware autocomplete.
  - Unlocks multi-cursor editing, collapsible `Table`/`TableGroup`/`Note` blocks, bracket matching, and smooth performance on 5,000+ line schemas.
- [ ] **GitHub Pull Request & Diff Review Flow**
  - Add a **Create Branch & Open Pull Request** flow in `GitHubModal`, pre-filling the PR description with SchemaForge's semantic `schemaDiff` summary (tables, columns, refs, enums, and domains changed).
- [ ] **Expanded Schema Importers & Code Exporters**
  - Client-side importers for **Prisma (`schema.prisma`)**, **Drizzle TypeScript schemas**, and **JSON Schema / OpenAPI**.
  - Code generators/exporters for Prisma, Drizzle, TypeORM, and SQLAlchemy models.

---

### Phase 3 — Shared Layouts, Cloud Sync & Collaboration (Months 3–5)
*Goal: Evolve SchemaForge from a single-browser workbench into a collaborative team platform.*

- [ ] **Git-Tracked Layout & Sticky Metadata (`.schemaforge/layout.json`)**
  - Optionally include `.schemaforge/layout.json` (table coordinates, sticky notes, view settings) in GitHub batch pushes and folder pulls so teammates share identical diagram layouts with zero cloud lock-in.
- [x] **Optional Cloud Workspaces & Authentication**
  - Sync workspaces, layout coordinates, sticky notes, and published versions across devices while keeping local `IndexedDB` mode available for offline/anonymous work.
- [x] **Shareable Read-Only Docs & Diagram Links**
  - Generate clean, shareable links for specific workspaces or published schema versions (e.g., `v1.2.0`) for product, data, and backend teams.
- [ ] **Anchored Review Comments**
  - Evolve sticky notes into threaded, resolvable review comments anchored to specific tables, columns, or PR branches.

---

### Phase 4 — CI/CD Automation & Ecosystem (Months 6+)
*Goal: Embed SchemaForge directly into CI pipelines and multi-tool engineering stacks.*

- [ ] **SchemaForge CLI & GitHub Action**
  - Validate and merge `schema/*.dbml` modules in CI.
  - Post semantic schema diffs and rendered SVG/PNG diagram previews onto Pull Requests automatically.
  - Auto-publish updated static Schema Docs on merge to `main`.
- [ ] **Multi-VCS Support**
  - Add **GitLab** and **Bitbucket** adapters alongside GitHub using a shared repository provider interface.
- [ ] **Live Database Introspection Bridge**
  - Lightweight local CLI (`npx schemaforge pull <connection-url>`) to introspect PostgreSQL, MySQL, or SQLite catalogs directly into a workspace or modular DBML folder.

---

## 3. Recommended Priority Order (Highest Leverage Next)

1. **`.schemaforge/layout.json` in GitHub Sync + "Open Pull Request" Flow** — Unlocks shared team diagram layouts and PR review workflows using GitHub alone.
2. **Prisma / Drizzle / OpenAPI Importers & ORM Exporters** — Expands adoption across full-stack TypeScript and Python teams.
3. **Anchored Review Comments** — Evolve sticky notes into threaded, resolvable discussions on tables, columns, and branches.
4. **SchemaForge CLI & GitHub Action** — Automate modular DBML validation, PR diff summaries, and static Docs publishing in CI.
5. **Multi-VCS Support & Live Database Introspection Bridge** — Add GitLab/Bitbucket adapters and `npx schemaforge pull <connection-url>` catalog introspection.
