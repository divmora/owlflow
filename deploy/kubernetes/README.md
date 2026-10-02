# Kubernetes Deployment Guide for OwlFlow

This directory provides production-ready Kubernetes manifests for deploying the **OwlFlow** automation engine as a continuous, scalable daemon service.

---

## 1. Directory Structure

```text
deploy/kubernetes/
├── namespace.yaml           # Dedicated 'owlflow' namespace
├── configmap.yaml           # Workflow definitions mounted into /app/configs/workflows
├── secret.yaml.example      # Template for API credentials and webhook secrets
├── deployment.yaml          # 2-replica Deployment with non-root securityContext and probes
├── service.yaml             # ClusterIP service exposing port 8080
├── ingress.yaml             # Ingress with TLS termination for webhook endpoints
├── hpa.yaml                 # HorizontalPodAutoscaler (CPU 75%, Memory 80%)
├── kustomization.yaml       # Kustomize entrypoint
└── README.md                # Deployment documentation
```

---

## 2. Prerequisites

- A running Kubernetes cluster (v1.24+)
- `kubectl` configured with cluster access
- (Optional) NGINX Ingress Controller & cert-manager for TLS termination
- (Optional) Metrics Server enabled for HorizontalPodAutoscaler (HPA)

---

## 3. Quickstart Deployment

### Step 1: Configure Secrets
Copy the sample secret file and update with your credentials:

```bash
cp deploy/kubernetes/secret.yaml.example deploy/kubernetes/secret.yaml
# Edit secret.yaml with your tokens:
# - GITLAB_TOKEN
# - JIRA_USER, JIRA_TOKEN, JIRA_BASE_URL
kubectl apply -f deploy/kubernetes/secret.yaml
```

### Step 2: Deploy with Kustomize

Deploy all resources with a single command:

```bash
kubectl apply -k deploy/kubernetes/
```

### Step 3: Verify Deployment

Check that pods, services, and health probes are passing:

```bash
# Check pod rollout status
kubectl rollout status deployment/owlflow -n owlflow

# List pods
kubectl get pods -n owlflow

# Check service
kubectl get svc -n owlflow

# Check health endpoint from within cluster or via port-forward
kubectl port-forward svc/owlflow 8080:8080 -n owlflow
curl http://localhost:8080/healthz
# Expected: {"status":"ok","time":"..."}
```

---

## 4. Workflow Management via ConfigMap

Workflows are loaded dynamically by OwlFlow from `/app/configs/workflows`. In Kubernetes, you can manage workflows declaratively without rebuilding container images:

1. Add your workflow YAML files under the `data` field in `deploy/kubernetes/configmap.yaml`:
   ```yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: owlflow-workflows
     namespace: owlflow
   data:
     my-workflow.yaml: |
       id: "my-workflow"
       name: "Production Pipeline Automation"
       status: "active"
       trigger:
         type: "webhook"
         config:
           initial_step: "notify"
       steps:
         - id: "notify"
           action: "logger.info"
           params:
             message: "Workflow executed via Kubernetes"
   ```
2. Apply the updated ConfigMap:
   ```bash
   kubectl apply -f deploy/kubernetes/configmap.yaml
   ```
3. Restart the deployment to reload:
   ```bash
   kubectl rollout restart deployment/owlflow -n owlflow
   ```

---

## 5. Security & Reliability Features

- **Non-Root Execution**: Runs as non-root user `10001:10001` with `readOnlyRootFilesystem: true` and all Linux capabilities dropped (`drop: [ALL]`).
- **Health Probes**: Integrated `/healthz` (liveness) and `/readyz` (readiness) endpoints for zero-downtime rolling updates.
- **Autoscaling**: Automatic horizontal scaling between 2 and 10 replicas based on CPU and memory thresholds.
