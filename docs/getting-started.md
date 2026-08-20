# Getting Started with OwlFlow

This guide walks you through setting up OwlFlow, configuring environment variables, running the engine, and building your first scheduled and webhook-triggered workflows.

---

## 1. Prerequisites

- **Go 1.22 or higher** (tested on Go 1.25)
- **Git**
- Optional: **Docker** (for containerized execution)
- Optional: `curl` or Postman (for testing webhooks)

---

## 2. Installation & Build

Clone the repository and build the binary:

```bash
# Clone the repository
git clone git@github.com:divmora/owlflow.git
cd owlflow

# Download Go dependencies
go mod download

# Build the executable
go build -o owlflow cmd/server/main.go
```

---

## 3. Configuration & Environment Variables

OwlFlow reads credentials and configuration from environment variables. You can set them in your terminal or create a `.env` file for local development:

```bash
# Optional: Set API server port (default: 8080)
export PORT=8080

# Optional: Integrations
export GITLAB_TOKEN="your_gitlab_pat_token"
export JIRA_USER="your-email@example.com"
export JIRA_TOKEN="your_jira_api_token"
export JIRA_BASE_URL="https://your-domain.atlassian.net"
```

---

## 4. Running OwlFlow

Run the compiled binary:

```bash
./owlflow
```

You will see the startup logs:
- Workflows loaded from `./configs/workflows/`
- Scheduled workflows initialized with the cron engine
- REST API server listening on `:8080`

---

## 5. Creating Your First Workflows

### Example A: Scheduled Workflow (Cron Trigger)

1. Create a new file named `configs/workflows/cron-demo.yaml`:

```yaml
id: "cron-demo"
name: "Cron Demo Workflow"
status: "active"

trigger:
  type: "schedule"
  config:
    cron: "*/10 * * * * *" # Runs every 10 seconds
    timezone: "UTC"        # Optional timezone
    initial_step: "say_hello"

steps:
  - id: "say_hello"
    action: "logger.info"
    params:
      message: "OwlFlow heartbeat ping at {{ .trigger.time }}"
      fields:
        source: "cron-engine"
        status: "healthy"
```

2. Start or restart OwlFlow. Every 10 seconds, you will see a structured JSON log in your console:
```json
{"timestamp":"2026-08-20T12:00:10Z","level":"INFO","message":"OwlFlow heartbeat ping at 2026-08-20 12:00:10.001 UTC","fields":{"source":"cron-engine","status":"healthy"}}
```

---

### Example B: Webhook Workflow (HTTP Post & Slack Alert)

1. Create a file named `configs/workflows/webhook-demo.yaml`:

```yaml
id: "webhook-demo"
name: "Webhook Demo Workflow"
status: "active"

trigger:
  type: "webhook"
  config:
    path: "/webhook-demo"
    initial_step: "log_incoming"

steps:
  - id: "log_incoming"
    action: "logger.info"
    params:
      message: "Received webhook for user: {{ .trigger.payload.user.name }}"
      fields:
        email: "{{ .trigger.payload.user.email }}"
        action: "{{ .trigger.payload.action }}"
    next_steps:
      - step_id: "check_user_role"
        condition: 'true'

  - id: "check_user_role"
    action: "internal.contains"
    params:
      list:
        - "admin"
        - "maintainer"
      item: "{{ .trigger.payload.user.role }}"
    next_steps:
      - step_id: "log_admin_event"
        condition: '{{ .steps.check_user_role.output.found }} == true'
      - step_id: "log_standard_event"
        condition: '{{ .steps.check_user_role.output.found }} == false'

  - id: "log_admin_event"
    action: "logger.warn"
    params:
      message: "Admin privileged action triggered by {{ .trigger.payload.user.name }}"

  - id: "log_standard_event"
    action: "logger.info"
    params:
      message: "Standard action triggered by {{ .trigger.payload.user.name }}"
```

2. Trigger the webhook endpoint with `curl`:

```bash
curl -X POST http://localhost:8080/webhook/webhook-demo \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deploy",
    "user": {
      "name": "Alex",
      "email": "alex@example.com",
      "role": "admin"
    }
  }'
```

3. Response:
```json
{"status":"accepted"}
```
And check your terminal to see the step execution flow through `log_incoming` ➔ `check_user_role` ➔ `log_admin_event`.

---

## 6. Troubleshooting & Tips

- **Workflow Status**: Ensure `status: "active"` is set in your YAML file. Workflows marked `disabled` or `draft` will not run.
- **File Name vs ID**: The YAML file name should match the `id` field (e.g. `webhook-demo.yaml` with `id: "webhook-demo"`).
- **Viewing Logs**: Logger connector writes structured JSON logs to stdout with fields and timestamps.

