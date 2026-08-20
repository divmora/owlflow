# Contributing to OwlFlow

Thank you for your interest in contributing to **OwlFlow**! We welcome contributions of all kinds: bug reports, documentation improvements, feature requests, new connectors, and code changes.

---

## Code of Conduct

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to `opensource@divmora.com`.

---

## Conventional Commits

We follow the [Conventional Commits specification](https://www.conventionalcommits.org/) for automated semantic versioning and changelog generation via **Release Please**.

Please format your commit messages as follows:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Supported Types:
- `feat`: A new feature (triggers a MINOR version bump, e.g. `0.1.0` -> `0.2.0`)
- `fix`: A bug fix (triggers a PATCH version bump, e.g. `0.1.0` -> `0.1.1`)
- `docs`: Documentation only changes
- `refactor`: Code changes that neither fix a bug nor add a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Maintenance tasks, dependency updates, CI workflows
- `feat!:` or `fix!:`: Breaking change (triggers a MAJOR version bump)

---

## Development Setup

1. **Prerequisites**:
   - Go 1.22+ installed
   - Git

2. **Clone the repository**:
   ```bash
   git clone git@github.com:divmora/owlflow.git
   cd owlflow
   ```

3. **Install dependencies**:
   ```bash
   go mod download
   ```

4. **Run tests & verify code**:
   ```bash
   go test -v ./...
   go vet ./...
   ```

5. **Build binary**:
   ```bash
   go build -o owlflow cmd/server/main.go
   ```

---

## Pull Request Process

1. Fork the repository and create a new feature branch from `main`:
   ```bash
   git checkout -b feat/my-new-connector
   ```
2. Write clean, tested code and update relevant documentation in `docs/`.
3. Commit using Conventional Commits format.
4. Push your branch and open a Pull Request against `main`.
5. Ensure all GitHub Actions CI checks pass.
