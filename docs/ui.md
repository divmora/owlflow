# Developer Studio & Workflow Visualizer

OwlFlow includes an interactive, standalone developer web UI located in [`ui/`](../ui/) built with **React**, **Vite**, **Tailwind CSS**, and **React Flow**.

- 🌐 **Live Web Playground**: [https://divmora.github.io/owlflow/](https://divmora.github.io/owlflow/)
- 🚀 **Automated Deployment**: Built and deployed automatically to GitHub Pages via GitHub Actions on every merge to `main` and version release tag.

---

## Key Features

1. **Clean Workflow Workspace**:
   - Starts in a clean slate without automatically loading default workflows.
   - **File Browser / Loader**: Browse and open workflows from `configs/workflows/` or upload local `.yaml` / `.json` files directly from your computer.

2. **Interactive Component Guide & Cheat Sheet**:
   - Built-in documentation modal accessible directly from the header (`Docs & Guide`).
   - Searchable dictionary of all 5 connectors (`http`, `gitlab`, `jira`, `logger`, `internal`), parameter shapes, return schemas, and 1-click step snippet insertion.
   - Condition & regex syntax reference (`==`, `!=`, `<`, `<=`, `>`, `>=`, `hasPrefix`, `regexMatch`, `matches`, `!`, `&&`, `||`).
   - Common validation error troubleshooting guide.

3. **Real-Time Schema Validation**:
   - Embedded code editor with syntax highlighting, line numbers, and live error markers.
   - Real-time OwlFlow validation verifying trigger types, connector actions (`http.*`, `gitlab.*`, `jira.*`, `logger.*`, `internal.*`), required fields, retry bounds, and broken `step_id` references.

4. **Interactive DAG Flowchart**:
   - Directed acyclic graph (DAG) automatically rendered using React Flow.
   - Color-coded node badges by connector type (HTTP, GitLab, Jira, Logger, Internal).
   - Condition badges on transition edges showing branching rules (`==`, `!=`, `hasPrefix`, `regexMatch`, `&&`, `||`).
   - Auto-layout, zoom, pan, and minimap navigation.

5. **Node & Edge Inspector**:
   - Click any step node to view action documentation, resolved parameters, retry count, and timeout limits.
   - Click any transition edge to inspect condition expressions and branch targets.

6. **Client-Side Dry-Run Simulator**:
   - Provide mock trigger payloads (JSON body, HTTP headers, query parameters) and initial workflow variables.
   - Client-side Go-template resolution and condition evaluation.
   - Step-by-step or full execution trace highlighting the active execution path in green and skipped branches in gray.

7. **Export & Sharing**:
   - Export formatted YAML or JSON, or copy directly to clipboard.

---

## Quick Start

### Live Web Playground (No Installation)
Visit **[https://divmora.github.io/owlflow/](https://divmora.github.io/owlflow/)**

### Using pnpm (Local Dev)
```bash
cd ui
pnpm install
pnpm dev
```
Open **http://localhost:5173** in your browser.

### Using Docker Compose (Full Stack)
```bash
# Starts both the Go engine on :8080 and Developer UI on :5173
docker compose up --build
```

### Running Tests & Building
```bash
cd ui
pnpm test     # Run all Vitest suites
pnpm build    # Production build
```

---

## Directory Structure (`ui/`)

```text
ui/
├── src/
│   ├── components/
│   │   ├── DAG/                  # React Flow canvas, custom step/trigger nodes, condition edges
│   │   ├── Editor/               # Monaco/Code editor & live validation banner
│   │   ├── Inspector/            # Node and edge parameter inspector panel
│   │   ├── Simulator/            # Dry-run execution simulator drawer
│   │   ├── FileBrowser/          # Workflow file selector and uploader modal
│   │   └── Export/               # YAML/JSON export modal
│   ├── engine/                   # Client-side validation, template, and condition simulator
│   ├── store/                    # Zustand global workflow state
│   └── test/                     # Vitest test suites (130+ tests)
├── Dockerfile                    # Hot-reloading development container
└── package.json                  # Managed via pnpm
```
