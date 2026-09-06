# Contributing to OwlFlow

Thank you for your interest in contributing to **OwlFlow**! We welcome contributions, bug reports, feature requests, and documentation improvements.

---

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `opensource@divmora.com`.

---

## Development Prerequisites

- **Go**: Version 1.25 or higher.
- **Node.js**: Version 20 or higher.
- **pnpm**: Version 10 or higher (`corepack enable pnpm`).
- **Git**: Modern version.
- **Make**: Standard build automation tool.
- **Docker**: Optional for container builds and local testing.

---

## Local Development Workflow

### 1. Clone & Build

```bash
git clone git@github.com:divmora/owlflow.git
cd owlflow

# Compile binary into bin/owlflow
make build
```

### 2. Running Unit & Integration Tests

```bash
# Run all Go unit and integration tests with race detector
make test

# Generate HTML code coverage report
make test-coverage
```

### 3. Frontend Developer UI & Studio

```bash
# Install UI dependencies
make ui-install

# Run UI Vitest test suites
make ui-test

# Build UI production bundle
make ui-build

# Build unified GitHub Pages documentation portal & Studio bundle
make ui-pages
```

### 4. Code Formatting & Linting

```bash
# Format Go source code
make fmt

# Run Go static analysis
make lint
```

---

## Available Make Targets

| Target | Description |
|---|---|
| `make build` | Compile server binary into `bin/owlflow` |
| `make test` | Run Go test suite with race detector |
| `make test-coverage` / `make cover` | Generate HTML code coverage report |
| `make fmt` | Format Go source code (`gofmt`) |
| `make lint` | Run Go static analysis (`go vet` and `golangci-lint`) |
| `make dev-setup` | Tidy and verify Go module dependencies |
| `make clean` | Remove binaries, dist bundles, and test coverage files |
| `make ui-install` | Install UI dependencies using `pnpm` |
| `make ui-test` | Run Vitest UI test suites |
| `make ui-build` | Compile Vite UI production bundle |
| `make ui-pages` | Build unified GitHub Pages documentation and Studio bundle |
| `make docker-build` | Build local Docker container image |
| `make docker-build-lambda` | Build AWS Lambda container image (with AWS Lambda Web Adapter) |
| `make docker-build-multiarch` | Build multi-architecture Docker container image |

---

## Conventional Commits

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification for automated release management via Release Please:

```text
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Common Types:
- `feat`: New user-facing feature or connector capability.
- `fix`: Bug fix in engine, connector, or UI.
- `docs`: Documentation site and guide updates.
- `chore`: Dependency bumps, build adjustments, or internal refactoring.
- `test`: Adding or refactoring test suites.
- `ci`: Changes to GitHub Actions workflows or GoReleaser.

---

## Pull Request Guidelines

1. **Branch Naming**: Use descriptive branch names like `feat/sqs-connector` or `fix/cron-timezone`.
2. **Test Coverage**: Ensure all new features or bug fixes are accompanied by unit/mock integration tests.
3. **Clean Verification**: Ensure `make test` and `make ui-test` pass with 0 errors.
4. **Documentation**: Update corresponding `docs/*.md` when modifying schemas, connectors, or behaviors.

---

## Licensing of Contributions

By submitting a pull request or contributing to this repository, you agree that your contributions will be licensed under the project's **Business Source License 1.1 (BSL 1.1)** (and the resulting Apache License 2.0 conversion terms upon each version's Change Date), as detailed in [LICENSE](LICENSE) and [DIVMORA Licensing Policy](https://github.com/divmora/.github/blob/main/LICENSING.md).
