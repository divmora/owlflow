# OwlFlow

[![Latest Release](https://img.shields.io/github/v/release/divmora/owlflow?logo=github)](https://github.com/divmora/owlflow/releases)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL_1.1-blue.svg)](https://github.com/divmora/.github/blob/main/LICENSING.md)
[![CI/CD](https://github.com/divmora/owlflow/actions/workflows/ci.yml/badge.svg)](https://github.com/divmora/owlflow/actions)
[![Go Version](https://img.shields.io/github/go-mod/go-version/divmora/owlflow)](go.mod)
[![Live Studio](https://img.shields.io/badge/Live%20Studio-GitHub%20Pages-0284c7?style=flat&logo=github)](https://divmora.github.io/owlflow/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/divmora/owlflow)
[![Security Policy](https://img.shields.io/badge/Security-Policy-green.svg)](SECURITY.md)

**OwlFlow** is a lightweight, high-performance, and extensible workflow automation engine written in Go. It enables event-driven and scheduled workflow execution with declarative YAML/JSON configurations, dynamic templating, conditional branching, and modular connectors.

Try the **[OwlFlow Studio Live Playground](https://divmora.github.io/owlflow/)** directly in your browser.

[Live Studio](https://divmora.github.io/owlflow/) • [Roadmap](ROADMAP.md) • [Documentation](docs/overview.md) • [Ask DeepWiki](https://deepwiki.com/divmora/owlflow)

---

## Key Features

- ⚡ **Declarative Workflows**: Define complex workflows, step transitions, and error handling in clean YAML or JSON.
- 🔀 **Conditional Branching & DAG Execution**: Execute steps sequentially, conditionally, or in parallel branches based on dynamic step outputs.
- ⏰ **Flexible Triggers**:
  - **Webhooks**: REST endpoints supporting payload parsing (`JSON`, `form-data`), header inspection, and secret validation (GitLab token & GitHub HMAC SHA-256 signatures).
  - **Cron Schedules**: Sub-minute and second-precision scheduling with optional timezone support.
- 🔌 **Extensible Connectors**: Built-in connectors for **HTTP**, **GitLab**, **Jira**, **Logger**, and **Internal Data Processing**, with an interface to easily register custom connectors.
- 📝 **Powerful Templating Engine**: Evaluate dynamic parameters and condition expressions using Go templating with built-in helpers (`toJson`, `toPrettyJson`, `first`, `index`, `hasPrefix`, `regexMatch`, `matches`).
- 🖥️ **Developer Studio & Visualizer**: Interactive web UI (React + Vite + Tailwind) hosted on GitHub Pages with real-time YAML validation, interactive DAG flowcharts, built-in Component Guide & Cheat Sheet, and client-side dry-run simulation.
- ☁️ **Cloud Native & Serverless Ready**: Runs seamlessly as a standalone microservice, Docker container, or AWS Lambda function (via AWS Lambda Web Adapter).

---

## Architecture Overview

```
                          ┌────────────────────────┐
                          │   Trigger / Ingestion  │
                          └───────────┬────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        ┌─────────────────────┐               ┌─────────────────────┐
        │   Webhook Ingress   │               │   Cron Scheduler    │
        │  (Gin REST Server)  │               │   (robfig/cron)     │
        └──────────┬──────────┘               └──────────┬──────────┘
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      │
                                      ▼
                          ┌────────────────────────┐
                          │    Execution Engine    │
                          │ - Parameter Resolution │
                          │ - Condition Evaluator  │
                          │ - Retry & Error Handle │
                          └───────────┬────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
        ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
        │     HTTP     │       │    GitLab    │       │     Jira     │
        │  Connector   │       │  Connector   │       │  Connector   │
        └──────────────┘       └──────────────┘       └──────────────┘
               │                      │                      │
               ▼                      ▼                      ▼
        ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
        │    Logger    │       │   Internal   │       │    Custom    │
        │  Connector   │       │ Data Filters │       │  Connectors  │
        └──────────────┘       └──────────────┘       └──────────────┘
```

---

## Directory Structure

```text
owlflow/
├── cmd/
│   └── server/
│       └── main.go               # Application entrypoint & scheduler boot
├── configs/
│   └── workflows/                # Declarative workflow definitions (.yaml / .json)
│       ├── github-monitor.yaml
│       ├── gitlab-monitor.yaml
│       ├── schedule_test.yaml
│       └── test-workflow.yaml
├── docs/                         # Detailed documentation and guides
│   ├── overview.md               # Architecture and execution lifecycle
│   ├── getting-started.md        # Quickstart and setup tutorial
│   ├── configuration.md          # Workflow syntax and schema reference
│   ├── connectors.md             # Built-in connectors reference & custom connectors
│   ├── templating-and-conditions.md # Templating helpers & condition expressions
│   ├── deployment.md             # Docker, AWS (Lambda/ECS), and CloudFormation deployment guide
│   └── ui.md                     # Developer UI and simulator reference
├── internal/
│   ├── connectors/               # Connector implementations
│   │   ├── base.go               # Connector interface and registry
│   │   ├── gitlab.go             # GitLab API actions
│   │   ├── http.go               # Generic HTTP client actions
│   │   ├── internal.go           # JSON/data extraction & regex utilities
│   │   ├── jira.go               # Jira Cloud transitions & search
│   │   └── logger.go             # Structured JSON logger
│   ├── core/                     # Core execution engine
│   │   ├── condition.go          # Condition evaluation & parameter resolution
│   │   ├── execution.go          # Step execution queue & context management
│   │   ├── scheduler.go          # Cron scheduler runner
│   │   ├── template.go           # Go template helper functions
│   │   └── workflow.go           # Workflow domain models and validation
│   └── server/
│       └── api.go                # Gin API routes and webhook security
├── ui/                           # Standalone React + Vite + Tailwind Developer UI
│   ├── src/                      # UI components, DAG canvas, simulator engine
│   ├── Dockerfile                # Dev container with hot reloading
│   └── package.json              # Managed with pnpm
├── AGENTS.md                     # Architecture & guidelines for AI coding agents
├── docker-compose.yaml           # Multi-service local setup (Go engine + UI)
├── Dockerfile                    # Multi-stage container build with Lambda Adapter
├── go.mod
├── go.sum
└── README.md
```

---

## Quick Start

### Option A: Run Pre-Built Docker Image (Multi-Arch AMD64 & ARM64)
```bash
# Run latest image from GitHub Container Registry
docker run -d \
  -p 8080:8080 \
  --name owlflow \
  -v $(pwd)/configs/workflows:/app/configs/workflows \
  ghcr.io/divmora/owlflow:latest
```

### Option B: Download Pre-Compiled Binary
Download the pre-compiled binary for Linux (AMD64/ARM64), macOS (Apple Silicon/Intel), or Windows from [GitHub Releases](https://github.com/divmora/owlflow/releases).

### Option C: Build from Source
```bash
# Clone the repository
git clone git@github.com:divmora/owlflow.git
cd owlflow

# Build binary
go build -o owlflow cmd/server/main.go

# Run
./owlflow
```

### Option D: Run with Docker Compose (Backend + UI)
```bash
docker compose up --build
```
- **Backend API**: `http://localhost:8080`
- **Developer UI**: `http://localhost:5173`

### Trigger a Webhook Workflow
```bash
curl -X POST http://localhost:8080/webhook/test-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ping",
    "data": "test_event",
    "timestamp": "2026-08-20T12:00:00Z"
  }'
```

---

## Example Workflow

Here is a sample webhook workflow with conditional branching and Slack alerting:

```yaml
id: "github-monitor"
name: "GitHub Repository Monitor"
status: "active"

trigger:
  type: "webhook"
  config:
    path: "/github-webhook"
    initial_step: "check_commit"

steps:
  - id: "check_commit"
    action: "http.get"
    params:
      url: "https://api.github.com/repos/{{ .trigger.payload.repo }}/commits"
    next_steps:
      - step_id: "notify_slack"
        condition: '{{ .steps.check_commit.output.status_code }} != 200'
      - step_id: "log_success"
        condition: '{{ .steps.check_commit.output.status_code }} == 200'

  - id: "notify_slack"
    action: "http.post"
    params:
      url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
      headers:
        Content-Type: "application/json"
      body: '{"text": "GitHub API Error: {{ .steps.check_commit.output.body }}"}'

  - id: "log_success"
    action: "logger.info"
    params:
      message: "Successfully verified commits for repo {{ .trigger.payload.repo }}"
```

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port for the HTTP API server | `8080` |
| `GITLAB_TOKEN` | Private / Personal Access Token for GitLab API | _None_ |
| `JIRA_USER` | Jira Cloud username / email | _None_ |
| `JIRA_TOKEN` | Jira Cloud API token / password | _None_ |
| `JIRA_BASE_URL` | Base URL for Jira Cloud instance | _None_ |
| `SYSLOG_ENABLED` | Enable forwarding all logger events to Syslog (`true` / `false`) | `false` |
| `SYSLOG_ADDR` | Remote Syslog host and port (e.g. `127.0.0.1:514`) | _Local socket_ |
| `SYSLOG_NETWORK` | Protocol for remote Syslog (`udp` or `tcp`) | `udp` |
| `SYSLOG_TAG` | Program identifier tag in Syslog messages | `owlflow` |
| `SYSLOG_ONLY` | When `true`, suppresses stdout logging and only outputs to Syslog | `false` |
| `AWS_LAMBDA_FUNCTION_NAME` | Set by AWS Lambda runtime (activates synchronous execution mode) | _None_ |

---

## Documentation

Comprehensive guides and references are available in the [`docs/`](docs/) directory:

- 📖 **[Architecture & Overview](docs/overview.md)**: Deep dive into the execution lifecycle, execution context, and design principles.
- 🚀 **[Getting Started Guide](docs/getting-started.md)**: Step-by-step setup, creating your first workflow, and testing.
- ⚙️ **[Configuration Guide](docs/configuration.md)**: Complete YAML schema, triggers, step options, retries, and variables.
- 🔌 **[Connectors Reference](docs/connectors.md)**: Details on all built-in actions (`http`, `gitlab`, `jira`, `logger`, `internal`) and how to build custom connectors.
- 🔣 **[Templating & Conditions](docs/templating-and-conditions.md)**: Template functions (`toJson`, `first`, `index`, `hasPrefix`), context variables, and condition evaluation syntax.
- 🖥️ **[Developer UI & Visualizer](docs/ui.md)**: Interactive web UI, real-time validator, DAG flowchart, and dry-run simulator.
- 🐳 **[Deployment Guide](docs/deployment.md)**: Running via Docker, Docker Compose, Kubernetes, AWS Lambda (Serverless), ECS Fargate, and CloudFormation.
- 🤖 **[Agent Guidelines](AGENTS.md)**: Architecture, coding conventions, testing procedures, and guidelines for AI coding agents.

---

## Development & Building

OwlFlow provides standardized build and testing automation via `make`:

```bash
# Compile server binary into bin/owlflow
make build

# Run Go unit test suite with race detector
make test

# Generate HTML code coverage report
make test-coverage

# Format Go source code and run static analysis
make fmt
make lint

# Run UI tests and build production assets
make ui-test
make ui-build

# Build unified GitHub Pages documentation and Studio bundle
make ui-pages

# Build container image
make docker-build
```

---

## Contributing & Community

Contributions, bug reports, and feature requests are welcome! Please read our community guidelines:

- 📋 **[Contributing Guide](CONTRIBUTING.md)**: Local setup, Conventional Commits, and pull request checklist.
- 📜 **[Code of Conduct](CODE_OF_CONDUCT.md)**: Standards for a welcoming and respectful community.
- 🔒 **[Security Policy](SECURITY.md)**: Vulnerability disclosure procedure and 48-hour response SLA.

---

## 📄 License & Commercial Use

This project is licensed under the **Business Source License 1.1 (BSL 1.1)**.

- **Non-Production Use**: Free of charge for local development, staging, QA, testing, CI/CD automated validation, educational purposes, and proof-of-concept evaluation.
- **Production Deployments**: Requires a commercial license (EULA) from DIVMORA Technologies.
- **Change Date**: Converts automatically to **Apache License 2.0** three (3) years after the release date of the specific version.

For commercial inquiries and enterprise licensing, please contact **[licensing@divmora.com](mailto:licensing@divmora.com)** or visit **[divmora.com](https://divmora.com)**. See [LICENSE](LICENSE) and [DIVMORA Licensing Policy](https://github.com/divmora/.github/blob/main/LICENSING.md) for full terms.

