# Deployment Guide

OwlFlow can be deployed as a standard standalone service, inside a Docker container, in Kubernetes, on AWS ECS Fargate, or as a Serverless function on AWS Lambda.

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

## 3. AWS Deployment (Lambda & ECS Fargate)

OwlFlow provides comprehensive AWS deployment support for both serverless event-driven execution (AWS Lambda) and continuous daemon workloads (AWS ECS Fargate).

### Serverless AWS Lambda (with AWS Lambda Web Adapter)
1. The dedicated `Dockerfile.lambda` bundles the AWS Lambda Web Adapter into `/opt/extensions/lambda-adapter`.
2. When deployed to Lambda as a Container Image, the adapter intercepts invocations from the **Lambda Function URL** or API Gateway, converts them into standard HTTP requests on `PORT 8080`, and proxies responses back.
3. OwlFlow automatically detects `AWS_LAMBDA_FUNCTION_NAME` and switches from asynchronous execution to synchronous execution so the Lambda container does not freeze prematurely before background goroutines finish.

---

### Automated Deployment via CloudFormation (Recommended)

Official, production-ready CloudFormation templates are maintained in the [**divmora/cloudformation-templates**](https://github.com/divmora/cloudformation-templates) repository under [`owlflow/`](https://github.com/divmora/cloudformation-templates/tree/main/owlflow):

- **[`owlflow-lambda.yaml`](https://github.com/divmora/cloudformation-templates/blob/main/owlflow/owlflow-lambda.yaml)** *(Serverless / Event-driven)*:
  - **Lambda Function URL**: Direct public or IAM-authenticated HTTPS webhook ingress without requiring an API Gateway or ALB.
  - **VPC Deployment Support**: Optional placement into VPC private subnets (`VpcSubnetIds`, `VpcSecurityGroupIds`) for interacting with internal self-hosted GitLab, private databases, or internal networks.
  - **Auto-Configured Roles & Logging**: Configures least-privilege IAM execution roles, automatic VPC ENI permissions (`AWSLambdaVPCAccessExecutionRole`), and CloudWatch log groups with retention policies.
- **[`owlflow-ecs-fargate.yaml`](https://github.com/divmora/cloudformation-templates/blob/main/owlflow/owlflow-ecs-fargate.yaml)** *(Continuous Daemon / Cron)*:
  - For long-running cron scheduler daemons, sub-minute workflows, or continuous high-frequency execution on AWS ECS Fargate.

#### Quick Deploy with CloudFormation:

```bash
# 1. Build and push container image to Amazon ECR
docker build -f Dockerfile.lambda -t <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow-lambda:latest .
docker push <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow-lambda:latest

# 2. Deploy standard serverless stack
aws cloudformation deploy \
  --template-file owlflow/owlflow-lambda.yaml \
  --stack-name owlflow-lambda-prod \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    EnvironmentName=prod \
    ImageUri=<your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow-lambda:latest \
    AuthType=NONE \
    GitLabToken="glpat-xxxxxxxxxxxxxxxxxxxx"

# Or deploy inside a private VPC:
#   --parameter-overrides \
#     VpcSubnetIds="subnet-0123456789abcdef0,subnet-0fedcba9876543210" \
#     VpcSecurityGroupIds="sg-0123456789abcdef0" \
#     ...
```

For full parameter references, VPC routing notes, and ECS Fargate deployment instructions, see [**cloudformation-templates/owlflow/README.md**](https://github.com/divmora/cloudformation-templates/blob/main/owlflow/README.md).

---

### Manual AWS Lambda Deployment

If deploying manually via the AWS CLI or AWS Console:

1. Build and tag the Lambda Docker image:
   ```bash
   docker build -f Dockerfile.lambda -t <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow-lambda:latest .
   ```
2. Authenticate and push to Amazon ECR:
   ```bash
   aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.<region>.amazonaws.com
   docker push <your-account-id>.dkr.ecr.<region>.amazonaws.com/owlflow-lambda:latest
   ```
3. Create a Lambda Function with package type **Image**.
4. Configure a **Function URL** (Auth type `NONE` for webhook ingress or `AWS_IAM` for SigV4) or an API Gateway HTTP API.
5. (Optional) Configure VPC subnets and security groups under **Configuration > VPC**.
6. Set environment variables in the Lambda configuration:
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
