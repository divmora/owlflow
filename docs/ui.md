# Developer UI & Workflow Visualizer

OwlFlow includes an interactive, standalone developer web UI located in [`ui/`](../ui/) built with **React**, **Vite**, **Tailwind CSS**, and **React Flow**.

It enables engineers to write, validate, inspect, and test-run workflow definitions visually without needing to trigger live webhooks or schedule actual cron jobs.

---

## Key Features

1. **Clean Workflow Workspace**:
   - Starts in a clean slate without automatically loading default workflows.
   - **File Browser / Loader**: Browse and open workflows from `configs/workflows/` or upload local `.yaml` / `.json` files directly from your computer.

2. **Real-Time Schema Validation**:
   - Embedded code editor with syntax highlighting, line numbers, and live error markers.
   - Real-time OwlFlow validation verifying trigger types, connector actions (`http.*`, `gitlab.*`, `jira.*`, `logger.*`, `internal.*`), required fields, retry bounds, and broken `step_id` references.

3. **Interactive DAG Flowchart**:
   - Directed acyclic graph (DAG) automatically rendered using React Flow.
   - Color-coded node badges by connector type (HTTP, GitLab, Jira, Logger, Internal).
   - Condition badges on transition edges showing branching rules (`==`, `!=`, `hasPrefix`, `&&`, `||`).
   - Auto-layout, zoom, pan, and minimap navigation.

4. **Node & Edge Inspector**:
   - Click any step node to view action documentation, resolved parameters, retry count, and timeout limits.
   - Click any transition edge to inspect condition expressions and branch targets.

5. **Client-Side Dry-Run Simulator**:
   - Provide mock trigger payloads (JSON body, HTTP headers, query parameters) and initial workflow variables.
   - Client-side Go-template resolution and condition evaluation.
   - Step-by-step or full execution trace highlighting the active execution path in green and skipped branches in gray.

6. **Export & Sharing**:
   - Export formatted YAML or JSON, or copy directly to clipboard.

---

## Quick Start

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
