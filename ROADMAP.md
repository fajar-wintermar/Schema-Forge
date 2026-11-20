# SchemaForge Product Roadmap

> Product evaluation, current-state pros & cons, and phased roadmap for evolving **SchemaForge** from a local-first DBML studio into a full team schema engineering platform.

---

## 1. Current State Assessment

### Strengths (Pros)
- **Unified Text + Diagram + Docs Workflow**: A single DBML source drives the live code editor, interactive ERD canvas, and engineering documentation portal.
- **Modular DBML + Real GitHub Integration**: Supports splitting schemas into domain modules (`schema/*.dbml`) with cross-file error line mapping, conflict detection, branch initialization, and batched Git commits.
- **Domain-First Visual Organization**: `TableGroup` containers, multi-domain shared tables, custom table header colors, sticky architecture notes, cursor mode switching (interact vs. pan), semantic zoom/detail levels, and domain-aware auto-layout.
- **Rich Documentation Portal**: Renders GitHub-flavored Markdown (tables, syntax-highlighted code blocks, callouts/alerts, sticky `CONTENTS` outlines, and read-time stats) for projects, domains, and tables.
- **Fast, Portable Stack**: React + TypeScript + Hono runtime compatible with Node.js and Cloudflare Workers/Pages, backed by zero-setup browser `IndexedDB` persistence.

### Current Limitations (Cons)
- **Local-Only Persistence**: Workspaces, diagram coordinates (`tablePositions`), sticky notes, and version snapshots live in browser `IndexedDB`; switching devices or collaborating requires manual GitHub sync or exports.
- **Custom `<textarea>` Editor Limits**: Lightweight and fast, with Find/Replace, Go-to-Line, and DBML autocomplete, but lacks native multi-cursor editing, block code folding, bracket matching, and granular undo history on programmatic edits.
- **Partial DBML & SQL Dialect Coverage**: Core DBML is covered, while `TablePartial`, `Checks` blocks, composite/expression indexes, and incremental `ALTER` SQL migration scripts are not yet supported.
- **Visual Density on Very Large Schemas**: Diagrams with 100+ tables and heavy cross-domain foreign keys need focus-isolation and cleaner connector routing options.
- **Direct-Push GitHub Flow Only**: Supports pushing commits directly to branches, but lacks an in-app Pull Request workflow and CI automation.

---

## 2. Phased Product Roadmap

### Phase 1 — Core Power & Spec Completeness (Weeks 1–4)
*Goal: Deliver maximum daily engineering value without requiring backend database infrastructure.*

- [ ] **Incremental SQL Migration (`ALTER`) Generator**
  - Extend `schemaDiff` to emit `ALTER TABLE ... ADD/DROP/ALTER COLUMN`, `CREATE/DROP INDEX`, and foreign-key `ALTER` statements between any two saved snapshots or Git commits (PostgreSQL & MySQL).
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
- [ ] **Optional Cloud Workspaces & Authentication**
  - Sync workspaces, layout coordinates, sticky notes, and published versions across devices while keeping local `IndexedDB` mode available for offline/anonymous work.
- [ ] **Shareable Read-Only Docs & Diagram Links**
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

1. **Incremental SQL Migration (`ALTER`) Export + Focus-on-Selection Dimming** — Immediate day-to-day utility boost with zero new infrastructure.
2. **`.schemaforge/layout.json` in GitHub Sync + "Open Pull Request" Flow** — Unlocks shared team workflows using GitHub alone.
3. **CodeMirror 6 Migration** — Eliminates custom textarea limitations before schemas scale larger.
4. **Prisma / Drizzle Importers & Exporters** — Expands adoption across full-stack TypeScript teams.
5. **Cloud Persistence & Shareable Docs Links** — Turns SchemaForge into an organization-wide architecture portal.
