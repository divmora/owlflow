# Architecture & Overview

**OwlFlow** is a lightweight, declarative workflow automation engine written in Go. It is designed to ingest triggers (such as incoming Webhooks and Cron timers), evaluate dynamic condition trees, resolve input parameters via a templating engine, and invoke modular connectors to execute actions across external services and APIs.

---

## High-Level Architecture

OwlFlow is divided into distinct, decoupled subsystems:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                               OWLFLOW ENGINE                             │
│                                                                          │
│  ┌───────────────────────────┐           ┌────────────────────────────┐  │
│  │     Webhook Ingress       │           │       Cron Scheduler       │  │
│  │   - Gin REST Endpoints    │           │    - robfig/cron runner    │  │
│  │   - Security & Signatures │           │    - Timezone resolution   │  │
│  └─────────────┬─────────────┘           └─────────────┬──────────────┘  │
│                │                                       │                 │
│                └───────────────────┬───────────────────┘                 │
│                                    ▼                                     │
│                     ┌─────────────────────────────┐                      │
│                     │       Workflow Loader       │                      │
│                     │  - Reads configs/workflows  │                      │
│                     │  - Validates Step DAG & IDs │                      │
│                     └──────────────┬──────────────┘                      │
│                                    ▼                                     │
│                     ┌─────────────────────────────┐                      │
│                     │       Executor Engine       │                      │
│                     │  - Context Isolation/Copies │                      │
│                     │  - Breadth-First Traversal  │                      │
│                     │  - Retry Loop & Backoff     │                      │
│                     └──────────────┬──────────────┘                      │
│                                    │                                     │
│        ┌───────────────────────────┼───────────────────────────┐         │
│        ▼                           ▼                           ▼         │
│  ┌───────────┐               ┌───────────┐               ┌───────────┐   │
│  │ Templater │               │ Condition │               │ Connector │   │
│  │  Engine   │               │ Evaluator │               │ Registry  │   │
│  └───────────┘               └───────────┘               └───────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Ingress & Triggers
- **Webhook Trigger (`type: "webhook"`)**:
  - Implemented via a high-throughput Gin router.
  - Automatically loads and parses request bodies (JSON, query strings, form data) and headers into the `TriggerData` context.
  - Supports token authentication (`X-Gitlab-Token`) and HMAC SHA-256 signature verification (`X-Hub-Signature-256`).
- **Schedule Trigger (`type: "schedule"`)**:
  - Powered by `robfig/cron/v3` supporting second-level cron granularity (6-field syntax).
  - Handles timezone conversion via Go's `time.LoadLocation`.

### 2. Workflow Validation & Loading
- Workflows are defined in YAML/JSON in the `configs/workflows/` directory.
- On startup or on-demand webhook execution, workflows are loaded and validated:
  - Verifies that the designated `initial_step` exists in the step definition map.
  - Verifies that all `next_steps` target valid step IDs.
  - Verifies workflow status (`active`, `disabled`, `draft`).

### 3. Execution Engine & Context Isolation
- **Breadth-First Traversal (Queue-based)**:
  Workflows support Directed Acyclic Graph (DAG) structures. If multiple `next_steps` conditions match, each matching step is enqueued for execution with an isolated branch context.
- **Deep-Copied Execution Context**:
  To prevent race conditions and cross-branch data corruption during parallel branch execution, `ExecutionContext` is deeply cloned for each branch:
  ```go
  type ExecutionContext struct {
      WorkflowID    string
      ExecutionID   string
      TriggerData   map[string]interface{} // Incoming payload, headers, query
      StepsData     map[string]interface{} // Outputs of previously executed steps
      Vars          map[string]interface{} // Workflow-level variables
      ParentOutputs []interface{}          // Direct parent step output
  }
  ```
- **Execution Modes**:
  - **Standard Server Mode**: Webhooks are acknowledged asynchronously with HTTP `202 Accepted` while execution continues in a background goroutine.
  - **AWS Lambda Serverless Mode**: When `AWS_LAMBDA_FUNCTION_NAME` is detected, execution runs synchronously and returns HTTP `200 OK` once completed to prevent AWS Lambda freezing before background goroutines finish.

### 4. Parameter Resolution & Templating
- Step parameters support nested Go template strings (`{{ .trigger.payload.id }}`).
- Custom template functions are available:
  - `toJson`, `toPrettyJson`: Serialize variables to JSON strings.
  - `first`: Extracts the first element of an array/slice.
  - `index`: Safe dynamic map/slice indexing.
  - `hasPrefix`: Prefix checking helper.
- If a rendered string produces valid JSON, it is automatically decoded into Go native types (maps/arrays).

### 5. Condition Evaluator
Transitions between steps in `next_steps` can define conditional expressions. Expressions are parsed and evaluated using:
- Boolean comparison operators: `==`, `!=`
- Logical operators: `&&`, `||`
- Functions: `hasPrefix <str> <prefix>`
- Direct boolean output from template rendering.

### 6. Connector Registry & Retries
- All connectors implement the standard `Connector` interface:
  ```go
  type Connector interface {
      Execute(action string, params map[string]interface{}) (interface{}, error)
      Validate(params map[string]interface{}) error
  }
  ```
- Connectors support exponential backoff retries per step (`retries: N`).

---

## Execution Lifecycle Example

```text
Incoming Webhook POST /webhook/github-monitor
  │
  ├─ 1. Authenticate secret / signature
  ├─ 2. Parse payload & headers into TriggerData
  ├─ 3. Instantiate ExecutionContext with Workflow.Vars
  ├─ 4. Enqueue initial_step ("check_commit")
  │
  ├──► [Execute Step: check_commit] (Action: http.get)
  │      - Render URL template with TriggerData
  │      - Execute HTTP GET request
  │      - Save output to StepsData["check_commit"].output
  │
  ├──► [Evaluate Next Steps Conditions]
  │      - Condition: '{{ .steps.check_commit.output.status_code }} != 200' -> False
  │      - Condition: '{{ .steps.check_commit.output.status_code }} == 200' -> True
  │      - Enqueue matching next step: "log_success"
  │
  └──► [Execute Step: log_success] (Action: logger.info)
         - Render message parameter
         - Write structured JSON log entry to stdout
         - Workflow execution completes
```

