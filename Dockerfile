# Build stage
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Copy dependency graphs
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the Go application for target platform
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -trimpath -ldflags="-s -w" -o main ./cmd/server/main.go

# Final stage
FROM alpine:latest

# Install AWS Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/main ./main

# Copy configurations if they exist
COPY --from=builder /app/configs ./configs

# AWS Lambda Web Adapter uses the PORT environment variable to know which port to proxy requests to.
# The owlflow API server listens on 8080 by default.
ENV PORT=8080

# Run the web service on container startup.
CMD ["./main"]
