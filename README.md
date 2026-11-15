# SchemaForge — DBML Viewer & Database Documentation Studio

**SchemaForge** is an interactive DBML (Database Markup Language) viewer, ER diagrammer, and database documentation studio. Designed for teams working on complex, multi-domain schemas, it brings together a real-time code editor, business-domain grouping, interactive diagramming, version auditing, and full schema documentation in a single local-first workspace.

---

## What This Project Is For

SchemaForge helps engineers, architects, and product teams design, explore, document, and audit relational database schemas using standard DBML syntax:

- **Business-Domain Table Groups (`TableGroup`)**: Organize large schemas into customizable functional domains with custom accent colors and notes.
- **Multi-Domain Table Assignment**: Assign shared core tables (e.g., `users`, `organizations`, `audit_logs`) to multiple business domains simultaneously, with drag-and-drop reordering and domain filtering (`Show All` vs. `Selected Only`).
- **Group-Aware Auto-Layout**: Intelligently arranges `TableGroup` clusters and tables to minimize foreign-key edge crossings, while supporting manual drag-and-drop adjustments and per-domain re-layout.
- **Interactive Diagram Canvas**: Pan, zoom, inspect relationships, customize table header colors (`headercolor`), attach color-coded **Sticky Notes**, and switch diagram field visibility (**All table fields**, **Keys only**, **Table names only**).
- **Focused Docs View**: Dedicated documentation view with an independent Docs-only table visibility toggle (**Full**, **All Fields**, **Keys Only**, **Names Only**), column/constraint tables, enum references, and relationship matrices.
- **DBML Code Editor**: Syntax highlighting, line numbers, minimize/maximize/split-resize modes, context-aware autocomplete (`Ctrl+Space`), and real-time syntax + semantic error checking with clickable line diagnostics.
- **Global Search (`⌘K` / `Ctrl+K`)**: Instantly find tables, columns, or business domains across the entire workspace and highlight them on the canvas.
- **Version History & Schema Changelog**: Save local snapshots (draft or published), revert to any historical version with automatic pre-revert checkpoints, and compare any two versions via semantic or raw line-by-line diffs.
- **Local-First Persistence**: Automatically persists workspaces, diagram coordinates, sticky notes, and version snapshots across sessions using browser **IndexedDB** (`SchemaForgeLocalDB`).
- **Import & Export**:
  - **Import**: DBML, PostgreSQL/MySQL/SQL DDL (`CREATE TABLE`, `ALTER TABLE ... FOREIGN KEY`), and CSV column definitions.
  - **Export**: DBML, SQL DDL, CSV data dictionary, **SVG**, and **high-resolution PNG**.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **UI Framework** | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) | Component architecture, state management, and strict static typing |
| **Build Tool & Dev Server** | [Vite 8](https://vite.dev/) (`@vitejs/plugin-react`) | Fast bundling, ES module dev server, and production static build |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`) | Utility-first styling with dark/light theme support |
| **Icons** | [Lucide React](https://lucide.dev/) | Crisp vector icons across toolbars, canvas, and sidebar |
| **Persistence** | Browser IndexedDB (`src/db/localDb.ts`) | Offline-capable client-side storage for workspaces, layouts, and snapshots |
| **DBML & Diagram Engine** | Custom TypeScript modules (`src/utils/`) | DBML tokenizer/parser, semantic validator, diff engine, auto-layout, SQL/CSV converters, and SVG/PNG renderer |

---

## Project Structure

```text
.
├── index.html                  # HTML entry point and metadata
├── package.json                # Dependencies and npm scripts
├── vite.config.ts              # Vite configuration (React, Tailwind v4, alias, HMR toggle)
├── tsconfig.json               # TypeScript compiler configuration
├── .env.example                # Optional environment variable template
└── src/
    ├── main.tsx                # Application bootstrap
    ├── App.tsx                 # Root workspace orchestration, keyboard shortcuts, and state sync
    ├── index.css               # Global Tailwind v4 import and custom editor/scrollbar rules
    ├── types/
    │   └── schema.ts           # Core TypeScript interfaces (ParsedSchema, TableDef, RefDef, etc.)
    ├── db/
    │   └── localDb.ts          # IndexedDB wrapper for saving/loading workspaces & preferences
    ├── components/
    │   ├── TopBar.tsx          # Navigation, workspace switcher, global search, view switcher, actions
    │   ├── Sidebar.tsx         # Domains manager, Version History, and Schema Changelog diff viewer
    │   ├── DbmlEditor.tsx      # Syntax-highlighted DBML editor with autocomplete & error diagnostics
    │   ├── DiagramCanvas.tsx   # Interactive pan/zoom ERD canvas, TableGroups, cards, sticky notes
    │   ├── DocsView.tsx        # Structured schema documentation view with independent detail toggle
    │   ├── InspectorDrawer.tsx # Contextual table/domain/color/sticky-note inspector
    │   └── Modals.tsx          # Import/Export, Save Version, TableGroup, Workspaces, Shortcuts modals
    └── utils/
        ├── dbmlParser.ts       # DBML parser, syntax/reference validator, and AST-like text mutators
        ├── autoLayout.ts       # Group-aware barycentric/grid layout & multi-domain instance builder
        ├── schemaDiff.ts       # Semantic & line-level schema diff generator
        ├── importExport.ts     # SQL DDL, CSV, DBML, SVG, and high-resolution PNG import/export
        └── sampleSchemas.ts    # Built-in starter and multi-tenant SaaS telemetry templates
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

### 2. Configure Environment (Optional)

SchemaForge runs entirely in the browser with IndexedDB and does not require API keys or a database server to run locally. If your deployment uses custom environment variables, copy the template:

```bash
cp .env.example .env
```

### 3. Start the Development Server

```bash
npm run dev
```

The Vite development server starts at **`http://localhost:3000`** (bound to `0.0.0.0:3000`).

### 4. Type-Check & Lint

Run TypeScript static type checking across the codebase before committing or deploying:

```bash
npm run lint
```

### Useful Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Focus Global Search |
| `⌘B` / `Ctrl+B` | Toggle Left Sidebar *(locked hidden in Docs view)* |
| `⌘\` / `Ctrl+\` | Toggle / Minimize Code Editor |
| `⌘⇧E` / `Ctrl+Shift+E` | Maximize / Restore Code Editor |
| `⌘S` / `Ctrl+S` | Save Version Snapshot |
| `⌘I` / `Ctrl+I` | Open Import / Export Modal |
| `Ctrl+Space` | Trigger DBML Autocomplete inside Editor |

---

## Deploying to Production

SchemaForge compiles into a standalone static single-page application (`dist/`), making it straightforward to deploy on any static host, CDN, or containerized web server.

### 1. Verify Type Safety and Build

```bash
npm run lint
npm run build
```

`npm run build` bundles and minifies the application into the `/dist` directory.

### 2. Preview the Production Build Locally

Test the compiled `dist/` output before shipping:

```bash
npm run preview
```

### 3. Host the `/dist` Bundle

Because SchemaForge is a pure client-side React + Vite application with IndexedDB persistence, you can deploy the generated `/dist` folder directly to any platform:

- **Vercel / Netlify / Cloudflare Pages**:
  - **Build command**: `npm run build`
  - **Output directory**: `dist`
  - **Node version**: `20.x`
- **Nginx / Caddy / Static Bucket (S3, GCS)**:
  - Upload the contents of `dist/` to your web root or bucket and serve `index.html` as the entry point.
- **Docker / Cloud Run (Nginx example)**:

  ```dockerfile
  FROM node:20-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM nginx:alpine
  COPY --from=builder /app/dist /usr/share/nginx/html
  EXPOSE 80
  CMD ["nginx", "-g", "daemon off;"]
  ```

### Clean Build Artifacts

To remove build outputs locally:

```bash
npm run clean
```
