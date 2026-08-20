# Deployment Guide

OwlFlow can be deployed as a standard standalone service, inside a Docker container, in Kubernetes, or as a Serverless function on AWS Lambda.

---

## 1. Standalone Binary Deployment

Build the binary for your target architecture:

```bash
# Linux (amd64)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o owlflow cmd/server/main.go

# macOS (Apple Silicon)
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o owlflow cmd/server/main.go
```

Run as a systemd service (`/etc/systemd/system/owlflow.service`):

```ini
[Unit]
Description=OwlFlow Automation Engine
After=network.target

[Service]
Type=simple
User=owlflow
WorkingDirectory=/opt/owlflow
ExecStart=/opt/owlflow/owlflow
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=GITLAB_TOKEN=your_token

[Install]
WantedBy=multi-user.target
```

---

## 2. Docker Container Deployment

OwlFlow includes a multi-stage `Dockerfile` optimized for minimal image size and fast startup.

### Build Docker Image
```bash
docker build -t owlflow:latest .
```

### Run Docker Container
```bash
docker run -d \
  -p 8080:8080 \
  --name owlflow \
  -e PORT=8080 \
  -e GITLAB_TOKEN="your_token" \
  -v $(pwd)/configs/workflows:/app/configs/workflows \
  owlflow:latest
```

### Docker Compose (Backend Engine + Developer UI)
```yaml
services:
  owlflow:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: owlflow-server
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - GITLAB_TOKEN=${GITLAB_TOKEN:-}
      - JIRA_USER=${JIRA_USER:-}
      - JIRA_TOKEN=${JIRA_TOKEN:-}
      - JIRA_BASE_URL=${JIRA_BASE_URL:-}
    volumes:
      - ./configs/workflows:/app/configs/workflows
    restart: unless-stopped

  ui:
    build:
      context: ./ui
      dockerfile: Dockerfile
    container_name: owlflow-ui
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8080
    volumes:
      - ./ui:/app
      - /app/node_modules
    restart: unless-stopped
    depends_on:
      - owlflow
```

Run both services with:
```bash
docker compose up --build
```

---

## 3. AWS Lambda Deployment (Serverless)

OwlFlow natively supports **AWS Lambda** using the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter).

### How it Works:
1. The included `Dockerfile` copies the AWS Lambda Adapter binary to `/opt/extensions/lambda-adapter`.
2. When deployed to Lambda as a Container Image, the adapter intercepts API Gateway / Function URL invocations, converts them into standard HTTP requests on `PORT 8080`, and proxies the responses back.
3. OwlFlow automatically detects `AWS_LAMBDA_FUNCTION_NAME` and switches from asynchronous execution to synchronous execution so the Lambda container does not freeze prematurely before background goroutines finish.

### Deploy to AWS Lambda:
1. Build and tag the Docker image:
   ```bash
   docker build -t <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow:latest .
   ```
2. Authenticate and push to Amazon ECR:
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.<region>.amazonaws.com
   docker push <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow:latest
   ```
3. Create a Lambda Function with package type **Image**.
4. Configure Function URL or API Gateway HTTP API.
5. Set environment variables in the Lambda configuration:
   - `PORT=8080`
   - `AWS_LWA_INVOKE_MODE=buffered`
   - `GITLAB_TOKEN`, `JIRA_USER`, etc.

---

## 4. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: owlflow
spec:
  replicas: 2
  selector:
    matchLabels:
      app: owlflow
  template:
    metadata:
      labels:
        app: owlflow
    spec:
      containers:
        - name: owlflow
          image: owlflow:latest
          ports:
            - containerPort: 8080
          env:
            - name: PORT
              value: "8080"
          volumeMounts:
            - name: workflow-configs
              mountPath: /app/configs/workflows
      volumes:
        - name: workflow-configs
          configMap:
            name: owlflow-workflows
---
apiVersion: v1
kind: Service
metadata:
  name: owlflow-service
spec:
  selector:
    app: owlflow
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP
```
