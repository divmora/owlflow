# OwlFlow

[![Go Version](https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat&logo=go)](https://golang.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**OwlFlow** is a lightweight, high-performance, and extensible workflow automation engine written in Go. It enables event-driven and scheduled workflow execution with declarative YAML/JSON configurations, dynamic templating, conditional branching, and modular connectors.

---

## Key Features

- ⚡ **Declarative Workflows**: Define complex workflows, step transitions, and error handling in clean YAML or JSON.
- 🔀 **Conditional Branching & DAG Execution**: Execute steps sequentially, conditionally, or in parallel branches based on dynamic step outputs.
- ⏰ **Flexible Triggers**:
  - **Webhooks**: REST endpoints supporting payload parsing (`JSON`, `form-data`), header inspection, and secret validation (GitLab token & GitHub HMAC SHA-256 signatures).
  - **Cron Schedules**: Sub-minute and second-precision scheduling with optional timezone support.
- 🔌 **Extensible Connectors**: Built-in connectors for **HTTP**, **GitLab**, **Jira**, **Logger**, and **Internal Data Processing**, with an interface to easily register custom connectors.
- 📝 **Powerful Templating Engine**: Evaluate dynamic parameters and condition expressions using Go templating with built-in helpers (`toJson`, `toPrettyJson`, `first`, `index`, `hasPrefix`).
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
│   └── deployment.md             # Docker and AWS Lambda deployment guide
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
- 🐳 **[Deployment Guide](docs/deployment.md)**: Running via Docker, Kubernetes, and AWS Lambda (with AWS Lambda Web Adapter).

---

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or submit a Pull Request.

---

## License

This project is licensed under the [MIT License](LICENSE).
