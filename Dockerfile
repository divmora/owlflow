# ==============================================================================
# Build Stage
# ==============================================================================
ARG GO_VERSION=1.25-alpine
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS builder

ARG VERSION=dev
ARG GIT_COMMIT=none
ARG BUILD_DATE=unknown
ARG TARGETOS
ARG TARGETARCH

# Install build dependencies, CA certificates, and timezone data
RUN apk update && apk add --no-cache \
    git \
    ca-certificates \
    tzdata \
    && update-ca-certificates

# Create non-root system user and group (UID/GID 10001)
RUN addgroup -g 10001 -S owlflow && \
    adduser -u 10001 -S -G owlflow -h /home/owlflow -s /sbin/nologin owlflow

WORKDIR /src

# Leverage Docker layer caching for dependencies
COPY go.mod go.sum ./
RUN go mod download && go mod verify

# Copy source tree
COPY . .

# Compile static binary with optimizations and metadata injection
RUN CGO_ENABLED=0 GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} \
    go build -trimpath \
    -ldflags="-s -w \
      -X github.com/divmora/owlflow/pkg/version.Version=${VERSION} \
      -X github.com/divmora/owlflow/pkg/version.GitCommit=${GIT_COMMIT} \
      -X github.com/divmora/owlflow/pkg/version.BuildDate=${BUILD_DATE}" \
    -o /build/owlflow ./cmd/server

# ==============================================================================
# Final Runtime Stage (Standalone / Non-Lambda)
# ==============================================================================
FROM alpine:3.24 AS final

# Install runtime dependencies (certificates, timezone data)
RUN apk update && apk add --no-cache \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Copy user/group definitions
COPY --from=builder /etc/passwd /etc/passwd
COPY --from=builder /etc/group /etc/group

WORKDIR /app

# Copy compiled binary
COPY --from=builder --chown=10001:10001 /build/owlflow /app/owlflow

# Copy default workflow configurations
COPY --from=builder --chown=10001:10001 /src/configs /app/configs

# Set ownership
RUN chown -R 10001:10001 /app

# OCI standard image annotations
LABEL org.opencontainers.image.title="owlflow" \
      org.opencontainers.image.description="Lightweight, high-performance workflow automation engine in Go" \
      org.opencontainers.image.url="https://github.com/divmora/owlflow" \
      org.opencontainers.image.source="https://github.com/divmora/owlflow" \
      org.opencontainers.image.vendor="divmora" \
      org.opencontainers.image.licenses="BSL-1.1"

ENV PORT=8080 \
    USER=owlflow \
    HOME=/home/owlflow \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["/app/owlflow"]
