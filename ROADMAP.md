# OwlFlow Product Roadmap

This document serves as the **living product roadmap** for OwlFlow.
- **Adding Items**: Whenever a new capability, enhancement, or edge-case improvement is identified for the future, add it here under the appropriate category.
- **Removing Items**: Once a feature is fully implemented, verified, and committed, **remove it from this roadmap**.

---

## 1. Connectors & Ecosystem Integrations

- [ ] **Slack & Microsoft Teams Connectors**
  - Add native notification connectors for posting rich blocks, interactive messages, and incident alerts to Slack Webhooks/Bots and Microsoft Teams Webhooks.
- [ ] **GitHub REST & GraphQL Connector**
  - Complement the GitLab connector with full GitHub API integration (managing PR comments, labels, status checks, issue dispatch).
- [ ] **Cloud Storage & Event Bus Connectors (AWS S3, SQS, EventBridge)**
  - Native AWS connector actions for reading/writing objects to S3, enqueueing messages to SQS, and emitting custom events to EventBridge.
- [ ] **Relational Database Connector (PostgreSQL / MySQL)**
  - Execute parameterized SQL queries, transactions, and audit inserts within workflow execution pipelines with connection pooling.
- [ ] **Outbound SMTP Email Dispatcher**
  - Deliver automated email notifications and attachments (HTML & plain text) with STARTTLS/Direct TLS support.

---

## 2. Engine Core & DAG Execution

- [ ] **Workflow Fan-Out & Parallel Step Execution**
  - Support parallel branch execution (`parallel: [step1, step2]`) with fan-in barrier synchronization before executing downstream dependent steps.
- [ ] **Sub-Workflow Invocations (`action: owlflow.invoke`)**
  - Allow workflows to trigger and wait for child workflows, enabling modular and reusable automation building blocks.
- [ ] **Resilient State Persistence & Checkpointing**
  - Implement pluggable state storage backends (PostgreSQL, Redis, DynamoDB) to checkpoint workflow state and resume interrupted or long-running executions.
- [ ] **Distributed Execution & Message Queue Ingress**
  - Support worker pools consuming tasks from external queues (Redis Streams, RabbitMQ, AWS SQS) for high-scale enterprise deployments.

---

## 3. Ingress, Security & Triggers

- [ ] **Enhanced Webhook Authentication (JWT & OAuth2 Bearer)**
  - Support bearer token verification, custom header validation, and IP CIDR allowlists on webhook trigger endpoints.
- [ ] **Dynamic Secrets Resolution (Zero-Env Seeding)**
  - Integrate cloud secret managers (`aws-secrets://`, `vault://`, `gcp-secrets://`) for JIT credential retrieval without persisting secrets in workflow manifests.

---

## 4. Developer Experience & Studio UI

- [ ] **Visual Drag-and-Drop Workflow Canvas**
  - Interactive graphical node editor for visually designing, connecting, and configuring workflow steps with real-time YAML bi-directional sync.
- [ ] **Live Execution Debugger & WebSocket Log Streaming**
  - Real-time log streaming and step inspection via WebSocket connection to the running OwlFlow server.

---

## 5. Observability & Telemetry

- [ ] **OpenTelemetry (OTel) Distributed Tracing**
  - Emit W3C TraceContext spans across workflow steps, external connector HTTP requests, and trigger invocations for end-to-end distributed tracing.
- [ ] **Prometheus Metrics Exporter**
  - Native metrics endpoint (`/metrics`) exposing workflow execution durations, step success/failure rates, active triggers, and connector latencies.
