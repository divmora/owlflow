# Templating & Conditions Guide

OwlFlow leverages Go's `text/template` engine with custom extensions to allow dynamic parameter resolution and conditional step transitions.

---

## 1. Execution Context Hierarchy

Inside step parameters (`params`) and transition conditions (`condition`), you can access the following context objects:

```text
.
├── trigger              # Incoming trigger data
│   ├── payload          # Webhook parsed request body (JSON or Form Map)
│   ├── headers          # Webhook HTTP request headers
│   ├── query            # Webhook URL query parameters
│   ├── time             # Scheduled execution timestamp (Schedule trigger)
│   └── timezone         # Configured timezone (Schedule trigger)
├── steps                # Map of previously executed steps
│   └── <step_id>
│       └── output       # Structured result returned by that step's connector
├── vars                 # Top-level workflow variables (from `vars:` block)
└── parent               # Array of outputs from direct parent steps
```

---

## 2. Built-in Template Helpers

The following helper functions are registered in the template engine:

| Helper | Syntax | Example | Description |
| :--- | :--- | :--- | :--- |
| `toJson` | `toJson <data>` | `{{ toJson .trigger.payload }}` | Serializes a map or array to a JSON string. |
| `toPrettyJson` | `toPrettyJson <data>` | `{{ toPrettyJson .steps.fetch.output }}` | Serializes data to indented JSON. |
| `first` | `first <slice>` | `{{ index .trigger.headers "User-Agent" \| first }}` | Returns the first item of a slice or array. |
| `index` | `index <map/slice> <key>` | `{{ index .trigger.headers "X-Forwarded-For" }}` | Safely retrieves an item by key or index. |
| `hasPrefix` | `hasPrefix <str> <prefix>` | `{{ hasPrefix .trigger.payload.ref "refs/heads/" }}` | Checks if a string starts with a given prefix. |

---

## 3. Parameter Templating Examples

### Example A: Accessing Nested Webhook Payload
```yaml
params:
  url: "https://api.github.com/repos/{{ .trigger.payload.repository.full_name }}/issues"
  message: "Commit by {{ .trigger.payload.pusher.name }}: {{ .trigger.payload.head_commit.message }}"
```

### Example B: Passing Previous Step Output
```yaml
params:
  project_id: "{{ .steps.get_project.output.id }}"
  merge_request_iid: "{{ .steps.create_mr.output.iid }}"
```

### Example C: Serializing Complex Objects
```yaml
params:
  body: |
    {
      "event": "{{ .trigger.payload.event }}",
      "details": {{ toJson .trigger.payload.data }}
    }
```

---

## 4. Conditional Transition Syntax (`condition`)

Conditions in `next_steps` determine whether a subsequent step should be enqueued.

### Basic Equality & Inequality
```yaml
next_steps:
  - step_id: "notify_success"
    condition: '{{ .steps.http_check.output.status_code }} == 200'

  - step_id: "notify_failure"
    condition: '{{ .steps.http_check.output.status_code }} != 200'
```

### Boolean Literals & Direct Checks
```yaml
next_steps:
  # Always execute
  - step_id: "cleanup_step"
    condition: 'true'

  # Check boolean step output
  - step_id: "handle_found"
    condition: '{{ .steps.check_namespace.output.found }} == true'
```

### Logical Combinators (`&&` and `||`)
```yaml
next_steps:
  - step_id: "process_release"
    condition: '{{ .trigger.payload.object_kind }} == "tag_push" && {{ .vars.environment }} == "production"'

  - step_id: "fallback_alert"
    condition: '{{ .steps.check_a.output.status }} == "error" || {{ .steps.check_b.output.status }} == "error"'
```

### Prefix Matching & Negation (`hasPrefix`, `!`)
```yaml
next_steps:
  - step_id: "approve_feature_mr"
    condition: 'hasPrefix {{ .trigger.payload.source_branch }} "feat/" && {{ .trigger.payload.author_id }} == 42'

  - step_id: "reject_non_ai_mr"
    condition: '!hasPrefix {{ .trigger.payload.source_branch }} "ai/" && {{ .trigger.payload.target_branch }} == "main"'
```

### Relational Comparisons (`<`, `<=`, `>`, `>=`)
```yaml
next_steps:
  - step_id: "alert_high_latency"
    condition: '{{ .steps.ping.output.duration_ms }} >= 500 && {{ .steps.ping.output.retries }} < 3'
```
