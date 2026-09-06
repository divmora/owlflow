# Workflow Configuration Guide

OwlFlow workflows are defined declaratively in YAML or JSON files located in the `configs/workflows/` directory.

---

## Workflow File Schema

Below is the complete specification for a workflow configuration:

```yaml
id: "my-workflow-id"                  # (Required) Unique workflow identifier (must match filename without extension)
name: "Human Readable Workflow Name"  # (Required) Name of the workflow
status: "active"                      # (Required) "active", "disabled", or "draft"

# Optional: Workflow-level variables accessible in all steps via {{ .vars.<key> }}
vars:
  api_endpoint: "https://api.example.com/v1"
  alert_channel: "#engineering-alerts"
  max_items: 50
  allowed_roles:
    - "admin"
    - "lead"

# Trigger definition
trigger:
  type: "webhook"                     # (Required) "webhook" or "schedule"
  config:
    path: "/my-webhook-endpoint"      # Route path
    initial_step: "step_one"          # (Required) ID of the first step to execute
    secret: "optional_webhook_secret" # (Optional) Secret for HMAC signature or token verification
    # For schedule trigger:
    # cron: "*/15 * * * * *"          # 6-field cron expression (with seconds)
    # timezone: "America/New_York"    # Optional IANA timezone

# Step definitions
steps:
  - id: "step_one"                    # (Required) Unique step identifier within this workflow
    action: "connector.action"        # (Required) Format: "<connector_name>.<action_name>"
    retries: 3                        # (Optional) Max retry attempts with exponential backoff (default: 1)
    timeout: 30                       # (Optional) Timeout in seconds
    pass_output: true                 # (Optional) If true, stores output for child steps (default: false)
    params:                           # (Required/Optional depending on action) Input parameters
      key: "value"
      templated_key: "{{ .trigger.payload.user_id }}"
    
    # Conditional or direct transitions to child steps
    next_steps:
      - step_id: "step_two_success"
        condition: '{{ .steps.step_one.output.status }} == "success"'
      - step_id: "step_two_failure"
        condition: '{{ .steps.step_one.output.status }} != "success"'

  - id: "step_two_success"
    action: "logger.info"
    params:
      message: "Step one succeeded!"

  - id: "step_two_failure"
    action: "logger.error"
    params:
      message: "Step one failed!"
```

---

## Field Reference

### 1. Top-Level Fields

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `id` | `string` | **Yes** | Unique identifier for the workflow. Should match the filename (e.g. `test.yaml` ➔ `id: "test"`). |
| `name` | `string` | **Yes** | Human-readable name displayed in logs and monitoring. |
| `status` | `string` | **Yes** | Workflow state: `active` (runs on trigger), `disabled` (ignored), or `draft`. |
| `vars` | `map[string]interface{}` | No | Top-level constants and parameters accessible as `{{ .vars.<key> }}`. |
| `trigger` | `object` | **Yes** | Trigger configuration. |
| `steps` | `array` | **Yes** | Array of steps defining the execution DAG. |

---

## 2. Trigger Configuration

### Webhook Trigger (`type: "webhook"`)

Webhooks listen on HTTP `POST /webhook/:id` where `:id` is the workflow `id`.

```yaml
trigger:
  type: "webhook"
  config:
    path: "/github-hook"
    initial_step: "validate_payload"
    secret: "your-shared-secret-token" # Optional
```

#### Webhook Authentication & Security:
1. **GitLab Webhook Token**: If `X-Gitlab-Token` header is present, OwlFlow compares it against `secret`.
2. **GitHub HMAC SHA-256**: If `X-Hub-Signature-256` header is present (`sha256=<hex>`), OwlFlow calculates the HMAC-SHA256 of the raw body using `secret` and validates it with constant-time comparison (`hmac.Equal`).
3. **No Secret**: If `secret` is omitted or empty, all incoming POST requests to the webhook route are accepted.

---

### Schedule Trigger (`type: "schedule"`)

Scheduled workflows are triggered periodically based on standard cron syntax with second precision (6 fields).

```yaml
trigger:
  type: "schedule"
  config:
    cron: "0 */5 * * * *"        # Runs at minute 0, every 5 minutes
    timezone: "UTC"               # Optional (e.g. "Asia/Kolkata", "America/Los_Angeles")
    initial_step: "run_healthcheck"
```

#### Cron Syntax (6 fields):
```text
┌───────────── second (0 - 59)
│ ┌───────────── minute (0 - 59)
│ │ ┌───────────── hour (0 - 23)
│ │ │ ┌───────────── day of month (1 - 31)
│ │ │ │ ┌───────────── month (1 - 12)
│ │ │ │ │ ┌───────────── day of week (0 - 6, 0 = Sunday)
│ │ │ │ │ │
* * * * * *
```
- `"*/10 * * * * *"`: Every 10 seconds
- `"0 0 * * * *"`: Every hour on the hour
- `"0 0 12 * * *"`: Every day at 12:00 PM (noon)

---

## 3. Step Configuration

```yaml
steps:
  - id: "fetch_user"
    action: "http.get"
    retries: 3
    timeout: 10
    pass_output: true
    params:
      url: "https://api.example.com/users/{{ .trigger.payload.user_id }}"
    next_steps:
      - step_id: "check_user"
        condition: '{{ .steps.fetch_user.output.status_code }} == 200'
```

| Field | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `id` | `string` | _Required_ | Unique identifier for the step within this workflow. |
| `action` | `string` | _Required_ | Action identifier in `<connector>.<action>` format (e.g. `http.get`, `jira.transition_issue`). |
| `retries` | `int` | `1` | Number of retry attempts upon connector failure. Retries use exponential backoff (`1s`, `2s`, `4s`, ...). |
| `timeout` | `int` | `0` | Execution timeout in seconds. |
| `pass_output` | `bool` | `false` | When true, output is preserved in `ParentOutputs`. Step output is always recorded in `{{ .steps.<id>.output }}` regardless of this setting. |
| `params` | `map` | `{}` | Parameter values passed to the connector. Values support Go templating strings. |
| `next_steps` | `array` | `[]` | List of candidate transitions to execute next. |

---

## 4. Next Step Transitions & Conditions

Each entry in `next_steps` points to a target `step_id` and an optional boolean `condition`:

```yaml
next_steps:
  # Unconditional transition (always runs)
  - step_id: "log_event"

  # Direct boolean condition
  - step_id: "handle_success"
    condition: '{{ .steps.fetch_user.output.status_code }} == 200'

  # Complex logical expression
  - step_id: "handle_admin"
    condition: 'hasPrefix {{ .trigger.payload.source_branch }} "feat/" && {{ .vars.environment }} == "production"'
```

If multiple `next_steps` match, OwlFlow creates separate parallel execution branches for each matching step with an isolated context.

