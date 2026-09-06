# ==============================================================================
# Makefile - OwlFlow Automation Engine
# ==============================================================================

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

# Module & Paths
MODULE       := github.com/divmora/owlflow
BIN_NAME     := owlflow
BIN_DIR      := $(CURDIR)/bin
DIST_DIR     := $(CURDIR)/dist
COVERAGE_DIR := $(CURDIR)/coverage
CMD_PKG      := ./cmd/server

# Version & Build Metadata
VERSION      ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_COMMIT   ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE   ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

# Go Environment
GO_MIN_VERSION := 1.25
GO             ?= go
GOFLAGS        ?=

LDFLAGS := -s -w \
  -X $(MODULE)/pkg/version.Version=$(VERSION) \
  -X $(MODULE)/pkg/version.GitCommit=$(GIT_COMMIT) \
  -X $(MODULE)/pkg/version.BuildDate=$(BUILD_DATE)

# Container Images
DOCKER_REGISTRY      ?= ghcr.io/divmora
DOCKER_IMAGE         ?= $(DOCKER_REGISTRY)/$(BIN_NAME):$(VERSION)
DOCKER_IMAGE_LATEST  ?= $(DOCKER_REGISTRY)/$(BIN_NAME):latest
DOCKER_LAMBDA_IMAGE  ?= $(DOCKER_REGISTRY)/$(BIN_NAME)-lambda:$(VERSION)
DOCKER_LAMBDA_LATEST ?= $(DOCKER_REGISTRY)/$(BIN_NAME)-lambda:latest

# ==============================================================================
# Top-Level Targets
# ==============================================================================

.PHONY: all
all: fmt lint test build ## Run full formatting, linting, tests, and local compilation

# ==============================================================================
# Build Targets
# ==============================================================================

.PHONY: build
build: ## Build server binary for host platform
	@echo "==> Building $(BIN_NAME) ($(VERSION))"
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 $(GO) build $(GOFLAGS) -trimpath -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/$(BIN_NAME) $(CMD_PKG)
	@echo "Compiled binary: $(BIN_DIR)/$(BIN_NAME)"

.PHONY: clean
clean: ## Remove build artifacts, coverage reports, and distribution bundles
	@echo "==> Cleaning build artifacts"
	@rm -rf $(BIN_DIR) $(DIST_DIR) $(COVERAGE_DIR) coverage.out coverage.html dist-docs
	@cd ui && rm -rf dist

# ==============================================================================
# Testing & Verification Targets
# ==============================================================================

.PHONY: test
test: ## Run Go unit tests
	@echo "==> Running Go unit tests"
	$(GO) test -v -race ./...

.PHONY: test-coverage cover
test-coverage: ## Run Go tests with HTML coverage report
	@echo "==> Generating Go test coverage report"
	@mkdir -p $(COVERAGE_DIR)
	$(GO) test -v -race -coverprofile=$(COVERAGE_DIR)/coverage.out -covermode=atomic ./...
	$(GO) tool cover -html=$(COVERAGE_DIR)/coverage.out -o $(COVERAGE_DIR)/coverage.html
	@echo "Coverage report available at $(COVERAGE_DIR)/coverage.html"

cover: test-coverage

.PHONY: fmt
fmt: ## Format Go source code
	@echo "==> Formatting Go source code"
	$(GO) fmt ./...

.PHONY: lint
lint: ## Run Go static analysis (vet and golangci-lint if installed)
	@echo "==> Running static analysis"
	$(GO) vet ./...
	@if command -v golangci-lint >/dev/null 2>&1; then \
		golangci-lint run; \
	fi

.PHONY: dev-setup
dev-setup: ## Verify and tidy Go module dependencies
	@echo "==> Verifying Go module dependencies"
	$(GO) mod tidy
	$(GO) mod verify

# ==============================================================================
# UI Targets
# ==============================================================================

.PHONY: ui-install
ui-install: ## Install UI dependencies with pnpm
	@echo "==> Installing UI dependencies"
	@cd ui && pnpm install

.PHONY: ui-test
ui-test: ## Run UI Vitest test suites
	@echo "==> Running UI tests"
	@cd ui && pnpm test

.PHONY: ui-build
ui-build: ## Build UI production bundle
	@echo "==> Building UI bundle"
	@cd ui && pnpm build

.PHONY: ui-pages
ui-pages: ## Build unified GitHub Pages bundle (Studio + Docs + AI manifests)
	@echo "==> Building unified GitHub Pages bundle"
	@cd ui && pnpm build:pages

# ==============================================================================
# Container Image Targets
# ==============================================================================

.PHONY: docker-build
docker-build: ## Build local Docker container image
	@echo "==> Building Docker image $(DOCKER_IMAGE_LATEST)"
	docker build -t $(DOCKER_IMAGE_LATEST) .

.PHONY: docker-build-lambda
docker-build-lambda: ## Build AWS Lambda container image (with AWS Lambda Web Adapter)
	@echo "==> Building AWS Lambda Docker image $(DOCKER_LAMBDA_LATEST)"
	docker build -f Dockerfile.lambda -t $(DOCKER_LAMBDA_LATEST) .

.PHONY: docker-build-multiarch
docker-build-multiarch: ## Build multi-architecture container images (linux/amd64, linux/arm64)
	@echo "==> Building multi-arch Docker image $(DOCKER_IMAGE_LATEST)"
	docker buildx build --platform linux/amd64,linux/arm64 -t $(DOCKER_IMAGE_LATEST) .

# ==============================================================================
# Help
# ==============================================================================

.PHONY: help
help: ## Display this help message
	@echo "OwlFlow Automation Engine Build Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'
