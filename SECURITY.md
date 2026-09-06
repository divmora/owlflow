# Security Policy & Responsible Disclosure

The OwlFlow project team takes the security of our software, connectors, and users seriously.

---

## Supported Versions

We actively support the current release version of OwlFlow with security patches:

| Version | Supported          |
| ------- | ------------------ |
| `0.1.x` | :white_check_mark: |
| `< 0.1` | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability in OwlFlow, please **do not open a public issue**. Instead, report it privately:

1. **Email**: Send detailed vulnerability information to `security@divmora.com`.
2. **GitHub Security Advisory**: Open a private draft security advisory at [github.com/divmora/owlflow/security/advisories/new](https://github.com/divmora/owlflow/security/advisories/new).

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce the issue (proof-of-concept workflow YAML or request payload).
- Any affected components, connectors, or templating logic.
- Any proposed remediation or patch.

---

## Response Timeline

- **Initial Acknowledgment**: Within 48 hours.
- **Vulnerability Assessment & Triage**: Within 5 business days.
- **Remediation & Advisory Release**: Coordinated with the reporter before public disclosure.

---

## Security Best Practices for Users

1. **Webhook Ingress Security**: Always configure and enforce webhook secrets (`secret` in workflow trigger definitions) for GitLab tokens or GitHub HMAC SHA-256 signatures.
2. **Credential Management**: Do not commit secrets, tokens, or API keys directly in workflow YAML files. Leverage environment variables (`{{ .vars.KEY }}`) or IAM roles.
3. **Connector Least Privilege**: Scope third-party API tokens (e.g. `GITLAB_TOKEN`, `JIRA_TOKEN`) to the minimum permissions required for automated execution.
4. **Dry-Run & Simulation**: Use the OwlFlow Studio simulator to validate conditions and template transformations prior to deploying workflows to live production environments.
