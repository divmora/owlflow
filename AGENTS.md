# AGENTS.md — Agent Guidelines & Architecture Guide

Welcome to **OwlFlow**. This repository contains a lightweight, high-performance workflow automation engine written in Go, accompanied by a standalone developer UI in React, Vite, and Tailwind CSS.

This document provides essential architecture overviews, coding conventions, testing procedures, and guidelines for AI coding agents and human contributors.

---

## 1. Codebase Architecture

```text
owlflow/
├── cmd/server/main.go            # Backend server entrypoint & cron scheduler boot
├── configs/workflows/            # Sample & default workflow YAML definitions
├── docs/                         # Detailed architecture, connector, and deployment guides
├── internal/
│   ├── connectors/               # Modular connector registry (HTTP, GitLab, Jira, Logger, Internal)
│   │   ├── base.go               # Connector interface and global registry
│   │   ├── gitlab.go             # GitLab v4 API operations
│   │   ├── http.go               # Generic HTTP client (GET, POST, etc.)
│   │   ├── internal.go           # Internal data filtering (contains, startsWith, regexMatch, parseJson)
│   │   ├── jira.go               # Jira Cloud REST v3 operations
│   │   └── logger.go             # Structured JSON logger connector
│   ├── core/                     # Workflow execution engine
│   │   ├── condition.go          # Condition parser (==, !=, hasPrefix, &&, ||)
│   │   ├── execution.go          # DAG execution queue, retries, and context isolation
│   │   ├── scheduler.go          # Cron scheduler runner with sub-minute & timezone support
│   │   ├── template.go           # Go template helper functions (toJson, first, index)
│   │   └── workflow.go           # Workflow domain types and validation logic
│   ├── logging/                  # Application logging and Syslog integration
│   └── server/                   # Gin HTTP REST API and webhook ingress security
├── ui/                           # Standalone React + Vite + Tailwind CSS Developer UI
│   ├── src/
│   │   ├── components/           # DAG visualizer, code editor, inspector, simulator
│   │   ├── engine/               # Client-side Go-template & condition parser / simulator
│   │   ├── store/                # Zustand global workflow state management
│   │   └── test/                 # Vitest component, unit, and adversarial test suites
│   ├── Dockerfile                # Dev container with pnpm and hot reloading
│   └── package.json              # Managed via pnpm
├── Dockerfile                    # Multi-stage Go container with AWS Lambda Web Adapter
├── docker-compose.yaml           # Local multi-service orchestration (:8080 backend, :5173 UI)
├── go.mod / go.sum               # Go dependencies
└── README.md
```

---

## 2. Development & Testing Commands

### Backend (Go)
```bash
# Verify dependencies
go mod verify

# Run static analysis
go vet ./...

# Run Go tests
go test -v ./...

# Build server binary
go build -o owlflow cmd/server/main.go
```

### Frontend UI (`ui/`)
Always use **pnpm** for package management in `ui/`:
```bash
cd ui

# Install dependencies
pnpm install

# Run dev server (http://localhost:5173)
pnpm dev

# Run Vitest test suites
pnpm test

# Build production bundle (Studio)
pnpm build

# Build full unified GitHub Pages site (Studio + Docs + AI manifests)
pnpm build:pages
```

### Multi-Service (Docker Compose)
```bash
# Start Go engine (:8080) and Developer UI (:5173)
docker compose up --build
```

---

## 3. Core Engine Specification

### Workflow Schema
- Workflows are defined in YAML/JSON with `id`, `name`, `status` (`active`, `disabled`, `draft`), `vars`, `trigger`, and `steps`.
- **Triggers**: `webhook` (with `path`, `initial_step`, optional `secret`), `schedule` (with `cron`, optional `timezone`), or `manual`.
- **Steps**: `id`, `action` (`<connector>.<method>`), `params`, `next_steps` (with optional `condition`), `retries`, and `timeout`.

### Templating & Conditions
- Parameter values support Go templates: `{{ .trigger.payload.foo }}`, `{{ .steps.step_id.output.bar }}`, `{{ .vars.key }}`.
- Condition expressions support:
  - Boolean literals: `'true'`, `'false'`
  - Comparisons: `'{{ .steps.check.output.status }} == 200'`, `'{{ .output }} != "error"'`
  - Helpers: `'hasPrefix {{ .item }} "feature/"'`
  - Logical chaining: `'expr1 && expr2'`, `'expr1 || expr2'`

---

## 4. Agent Working Conventions

1. **Package Manager**: Use `pnpm` exclusively within `ui/`. Never generate `package-lock.json` or `yarn.lock`.
2. **Git Tracking & `.agents/`**:
   - Ephemeral subagent workspaces (e.g. `.agents/worker_*`, `.agents/auditor_*`) are git-ignored.
   - Persistent customizations, skills, commands, and rules belong in `.agents/skills/`, `.agents/commands/`, `.agents/rules/`, or `.agents/plugins/` and **must** be tracked by git.
3. **Markdown Links**: When referencing codebase files or symbols, use GitHub-style markdown file links with `file://` URIs (e.g. `[main.go](file:///path/to/main.go)`).
4. **Documentation Integrity**: Maintain accuracy across `README.md`, `AGENTS.md`, and `docs/*.md` when adding or modifying connectors, workflow syntax, or endpoints.
