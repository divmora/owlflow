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
│   │   ├── condition.go          # Condition parser (==, !=, hasPrefix, regexMatch, &&, ||)
│   │   ├── execution.go          # DAG execution queue, retries, and context isolation
│   │   ├── scheduler.go          # Cron scheduler runner with sub-minute & timezone support
│   │   ├── template.go           # Go template helper functions (toJson, first, index)
│   │   └── workflow.go           # Workflow domain types and validation logic
│   ├── logging/                  # Application logging and Syslog integration
│   └── server/                   # Gin HTTP REST API and webhook ingress security
├── pkg/
│   └── version/                  # Version build metadata & introspection
├── ui/                           # Standalone React + Vite + Tailwind CSS Developer UI
│   ├── src/
│   │   ├── components/           # DAG visualizer, code editor, inspector, simulator
│   │   ├── engine/               # Client-side Go-template & condition parser / simulator
│   │   ├── store/                # Zustand global workflow state management
│   │   └── test/                 # Vitest component, unit, and adversarial test suites
│   ├── Dockerfile                # Dev container with pnpm and hot reloading
│   └── package.json              # Managed via pnpm
├── .github/
│   ├── dependabot.yml            # Scheduled dependency maintenance
│   └── workflows/                # Standardized reusable CI/CD workflows
├── .goreleaser.yaml              # Multi-arch binary compilation configuration
├── .release-please-config.json   # Release Please automation configuration
├── .release-please-manifest.json # Semantic release version baseline tracker
├── Dockerfile                    # Minimal multi-stage container for standalone/k8s/ECS
├── Dockerfile.lambda             # AWS Lambda container runtime with Lambda Web Adapter
├── docker-compose.yaml           # Local multi-service orchestration (:8080 backend, :5173 UI)
├── Makefile                      # Standardized build & test automation
├── go.mod / go.sum               # Go dependencies
├── LICENSE                       # Business Source License 1.1 (BSL 1.1)
└── README.md
```

---

## 2. Development & Testing Commands

Always leverage the standardized `Makefile` targets:

### Backend (Go)
```bash
# Verify and tidy dependencies
make dev-setup

# Format source code
make fmt

# Run static analysis
make lint

# Run Go tests with race detector
make test

# Generate HTML code coverage report
make test-coverage

# Build server binary
make build
```

### Frontend UI (`ui/`)
Always use **pnpm** for package management in `ui/`:
```bash
# Install dependencies
make ui-install

# Run Vitest test suites
make ui-test

# Build production bundle (Studio)
make ui-build

# Build full unified GitHub Pages site (Studio + Docs + AI manifests)
make ui-pages
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
  - Relational: `>`, `<`, `>=`, `<=`
  - Helpers: `'hasPrefix {{ .item }} "feature/"'`, `'regexMatch {{ .item }} "^release/.*"'`
  - Logical chaining: `'expr1 && expr2'`, `'expr1 || expr2'`

---

## 4. Agent Working Conventions

1. **Licensing**:
   - OwlFlow is licensed under the **Business Source License 1.1 (BSL 1.1)**.
   - Non-production use (development, CI/CD, evaluation) is free; production use requires a commercial license from DIVMORA Technologies.
   - Changes convert to Apache License 2.0 after three (3) years.
2. **Package Manager**: Use `pnpm` exclusively within `ui/`. Never generate `package-lock.json` or `yarn.lock`.
3. **Git Tracking & `.agents/`**:
   - Ephemeral subagent workspaces (e.g. `.agents/worker_*`, `.agents/auditor_*`) are git-ignored.
   - Persistent customizations, skills, commands, and rules belong in `.agents/skills/`, `.agents/commands/`, `.agents/rules/`, or `.agents/plugins/` and **must** be tracked by git.
4. **Conventional Commits**: Enforce Conventional Commits specification (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`).
5. **Markdown Links**: When referencing codebase files or symbols, use GitHub-style markdown file links with `file://` URIs (e.g. `[main.go](file:///path/to/main.go)`).
6. **Documentation Integrity**: Maintain accuracy across `README.md`, `AGENTS.md`, and `docs/*.md` when adding or modifying connectors, workflow syntax, or endpoints.
