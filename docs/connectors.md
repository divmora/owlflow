# Connectors Reference

Connectors are the modular building blocks that execute actions in an OwlFlow workflow. Each connector exposes a set of actions that take input parameters, perform operations (HTTP calls, API mutations, log writes, data filtering), and return structured outputs.

---

## 1. HTTP Connector (`http`)

Performs standard HTTP requests.

### `http.get`
Executes an HTTP GET request.

**Parameters:**
- `url` (`string`, required): Target URL.

**Output:**
```json
{
  "status_code": 200,
  "body": "string response"
}
```

### `http.post`
Executes an HTTP POST request.

**Parameters:**
- `url` (`string`, required): Target URL.
- `headers` (`map[string]string`, optional): HTTP request headers.
- `body` (`string`, optional): Raw payload string or serialized JSON.

**Output:**
```json
{
  "status_code": 201,
  "body": "{\"id\": 123}"
}
```

---

## 2. GitLab Connector (`gitlab`)

Integrates with the GitLab REST API (v4). Authentication uses the `GITLAB_TOKEN` environment variable or an explicit `token` parameter.

### `gitlab.get_project`
Fetches metadata for a GitLab repository.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID or URL-encoded path.
- `base_url` (`string`, optional): GitLab instance URL (default: `https://gitlab.com/api/v4`).
- `token` (`string`, optional): Personal Access Token (defaults to `GITLAB_TOKEN` env).

**Output:** GitLab Project JSON object (e.g. `id`, `name`, `web_url`, `default_branch`, etc.).

---

### `gitlab.create_merge_request`
Opens a new merge request.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID.
- `source_branch` (`string`, required): Name of the branch containing changes.
- `target_branch` (`string`, required): Branch to merge into.
- `title` (`string`, required): Title of the Merge Request.

---

### `gitlab.add_reviewer`
Assigns a user as a reviewer on an existing MR without overwriting existing reviewers.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.
- `user_id` (`int`, required): GitLab user ID to add as a reviewer.
- `current_reviewer_ids` (`string` / `array`, optional): Optional pre-fetched list of reviewer IDs to skip extra API lookups.

---

### `gitlab.approve_mr`
Approves a Merge Request (with duplicate approval prevention).

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.
- `user_id` (`int`, optional): Approver's user ID to check if already approved.

---

### `gitlab.add_mr_note`
Posts a comment/note to a Merge Request discussion.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.
- `body` (`string`, required): Markdown content for the comment.

---

### `gitlab.close_mr`
Closes an open Merge Request.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.

---

### `gitlab.get_user`
Looks up a GitLab user by username.

**Parameters:**
- `username` (`string`, required): The GitLab username.

---

### `gitlab.check_mr_commit_author`
Checks whether a specific user is the author or committer of any commit in a GitLab Merge Request, with optional commit message filtering.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID or URL-encoded path.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.
- `user` / `target_user` (`string`, optional): Target user (checked against author email, committer email, author name, or username prefix).
- `email` / `author_email` (`string`, optional): Specific author or committer email address.
- `author_name` (`string`, optional): Specific author display name.
- `committer_email` (`string`, optional): Specific committer email address.
- `message_contains` (`string`, optional): Substring to match within commit messages.
- `message_regex` (`string`, optional): Regular expression pattern for commit messages.
- `per_page` (`int`, optional): Number of commits to fetch (default: 100).
- `token` (`string`, optional): GitLab Personal Access Token.
- `base_url` (`string`, optional): GitLab API base URL.

**Output:**
```json
{
  "is_author": true,
  "found": true,
  "match_count": 1,
  "total_commits": 3,
  "matched_commits": [
    {
      "id": "ed899a8ee502938a1c0964b63678b46407a367ea",
      "short_id": "ed899a8e",
      "title": "feat: add oauth service account",
      "author_name": "Alice Developer",
      "author_email": "alice@company.com",
      "committer_name": "Alice Developer",
      "committer_email": "alice@company.com",
      "authored_date": "2026-08-24T10:00:00.000Z",
      "message": "feat: add oauth service account"
    }
  ],
  "latest_commit": {
    "id": "ed899a8ee502938a1c0964b63678b46407a367ea",
    "short_id": "ed899a8e",
    "title": "feat: add oauth service account",
    "author_name": "Alice Developer"
  },
  "all_authors": ["Alice Developer", "Bob Contributor"],
  "all_author_emails": ["alice@company.com", "bob@company.com"],
  "all_committers": ["Alice Developer"],
  "all_committer_emails": ["alice@company.com"]
}
```

---

### `gitlab.get_mr_commits`
Fetches all commits and parsed author/committer metadata for a Merge Request.

**Parameters:**
- `project_id` (`int` / `string`, required): GitLab project ID or URL-encoded path.
- `merge_request_iid` (`int` / `string`, required): Internal IID of the Merge Request.
- `per_page` (`int`, optional): Max commits to retrieve (default: 100).

**Output:**
```json
{
  "total": 2,
  "commits": [ ... ],
  "all_authors": ["Alice Developer", "Bob Contributor"],
  "all_author_emails": ["alice@company.com", "bob@company.com"],
  "all_committers": ["Alice Developer"],
  "all_committer_emails": ["alice@company.com"]
}
```

---

## 3. Jira Connector (`jira`)

Integrates with the Atlassian Jira Cloud REST API (v3). Authentication uses `JIRA_USER` (email) and `JIRA_TOKEN` (API token).

### `jira.transition_issue`
Transitions a Jira issue to a new status workflow state.

**Parameters:**
- `issue_key` (`string`, required): Jira issue key (e.g. `"PROJ-123"`).
- `transition_id` (`int` / `string`, required): Jira workflow transition ID.
- `from_status_id` (`int` / `string`, optional): If specified, verifies current status matches before transitioning; otherwise returns `{"status": "skipped"}`.
- `base_url` (`string`, optional): Base URL (e.g. `https://your-domain.atlassian.net` or `https://api.atlassian.com/ex/jira/<cloud-id>`).

**Output:**
```json
{
  "status": "success"
}
```

---

### `jira.search_issues`
Searches for Jira issues using JQL (Jira Query Language).

**Parameters:**
- `jql` (`string`, required): JQL search query (e.g. `'project = PROJ AND status = "Ready for Test"'`).
- `base_url` (`string`, optional): Base Jira URL.

**Output:**
```json
{
  "total": 3,
  "found": true
}
```

---

### `jira.check_user_comment`
Checks whether a specific user has commented on a Jira issue directly via the REST API (useful when JQL `commenter` / `commentedBy` is disabled or unsupported), with optional body filtering.

**Parameters:**
- `issue_key` (`string`, required): Jira issue key (e.g. `"PROJ-101"`).
- `user` / `target_user` (`string`, optional): Target user identifier (checked across `accountId`, `emailAddress`, `displayName`, and `username` case-insensitively).
- `account_id` (`string`, optional): Specific Atlassian `accountId` to match.
- `email` (`string`, optional): Specific author email address to match.
- `display_name` (`string`, optional): Specific author display name to match.
- `body_contains` (`string`, optional): Substring filter for the comment body.
- `body_regex` (`string`, optional): Regular expression pattern for the comment body.
- `max_results` (`int`, optional): Number of recent comments to fetch (default: 100).
- `base_url` (`string`, optional): Custom Jira base URL.

**Output:**
```json
{
  "commented": true,
  "found": true,
  "match_count": 1,
  "total_comments": 4,
  "matched_comments": [
    {
      "id": "10001",
      "author_name": "Alice Smith",
      "author_email": "alice@example.com",
      "author_account_id": "5b10a2844c20165700ede21g",
      "author_username": "asmith",
      "created": "2026-08-24T10:00:00.000+0000",
      "body_text": "LGTM! Approved for release."
    }
  ],
  "latest_comment": {
    "id": "10001",
    "author_name": "Alice Smith",
    "created": "2026-08-24T10:00:00.000+0000"
  },
  "all_authors": ["Alice Smith", "Bob Jones"],
  "all_author_emails": ["alice@example.com", "bob@example.com"],
  "all_author_account_ids": ["5b10a2844c20165700ede21g", "5c20b3955d30276800fee32h"]
}
```

---

### `jira.get_comments`
Retrieves all comments and parsed author metadata for a Jira issue.

**Parameters:**
- `issue_key` (`string`, required): Jira issue key (e.g. `"PROJ-101"`).
- `max_results` (`int`, optional): Max comments to retrieve (default: 100).
- `base_url` (`string`, optional): Custom Jira base URL.

**Output:**
```json
{
  "total": 2,
  "comments": [
    {
      "id": "10001",
      "author_name": "Alice Smith",
      "author_email": "alice@example.com",
      "body_text": "LGTM!"
    }
  ],
  "all_authors": ["Alice Smith"],
  "all_author_emails": ["alice@example.com"],
  "all_author_account_ids": ["5b10a2844c20165700ede21g"]
}
```

---

## 4. Logger Connector (`logger`)

Outputs structured, timestamped JSON logs to standard output and/or a local/remote Syslog daemon.

### Actions: `logger.info`, `logger.debug`, `logger.warn`, `logger.error`

**Parameters:**
- `message` (`string`, required): Log message text.
- `fields` (`map[string]interface{}`, optional): Key-value metadata attached to the log entry.
- `syslog` (`bool`, optional): When `true`, explicitly sends the log entry to Syslog for this step.

**Environment Variables for Syslog:**
- `SYSLOG_ENABLED`: Set to `"true"` to enable Syslog for all logger steps.
- `SYSLOG_ADDR`: Remote Syslog address (e.g. `"127.0.0.1:514"` or `"syslog.internal:514"`).
- `SYSLOG_NETWORK`: `"udp"` or `"tcp"` (defaults to `"udp"` for remote, or local `/dev/log` socket if empty).
- `SYSLOG_TAG`: Syslog program tag (default: `"owlflow"`).
- `SYSLOG_ONLY`: Set to `"true"` to forward logs exclusively to Syslog and suppress stdout.

**Example Output:**
```json
{
  "timestamp": "2026-08-20T12:00:00Z",
  "level": "INFO",
  "workflow": "github-monitor",
  "message": "PR verified successfully",
  "fields": {
    "repo": "divmora/owlflow",
    "pr_number": 42
  }
}
```

---

## 5. Internal Data Connector (`internal`)

Utilities for transforming, validating, and filtering data within the workflow context.

### `internal.contains`
Checks whether a list contains a specified element.

**Parameters:**
- `list` (`array` / `JSON string`, required): Array to search.
- `item` (`string`, required): Item to check.

**Output:**
```json
{
  "found": true
}
```

---

### `internal.startsWith`
Checks whether a string starts with any prefix from a list.

**Parameters:**
- `list` (`array of strings` / `JSON string`, required): Allowed prefixes.
- `item` (`string`, required): String to test.

**Output:**
```json
{
  "found": true
}
```

---

### `internal.regexMatch`
Tests a string against a regular expression pattern.

**Parameters:**
- `regex` (`string`, required): Regular expression (e.g. `"(?i)^PROJ-\\d+$"`).
- `item` (`string`, required): Input text to match.

**Output:**
```json
{
  "match": true
}
```

---

### `internal.parseJson`
Parses a raw JSON string into a structured object/map.

**Parameters:**
- `data` (`string`, required): Raw JSON string.

---

### `internal.getField`
Extracts a key from a map object.

**Parameters:**
- `data` (`map`, required): Source object.
- `field` (`string`, required): Key name to retrieve.

---

## Writing a Custom Connector

To create a new connector (e.g. `slack` or `aws`):

1. Implement the `Connector` interface in `internal/connectors/`:

```go
package connectors

import "fmt"

type SlackConnector struct{}

func (s *SlackConnector) Execute(action string, params map[string]interface{}) (interface{}, error) {
    switch action {
    case "sendMessage":
        channel := params["channel"].(string)
        text := params["text"].(string)
        // ... perform API call ...
        return map[string]string{"status": "sent"}, nil
    default:
        return nil, fmt.Errorf("unknown action: %s", action)
    }
}

func (s *SlackConnector) Validate(params map[string]interface{}) error {
    if _, ok := params["channel"]; !ok {
        return fmt.Errorf("missing channel parameter")
    }
    return nil
}
```

2. Register the connector in `internal/connectors/base.go`:

```go
var Registry = map[string]Connector{
    "internal": &InternalConnector{},
    "http":     &HTTPConnector{},
    "gitlab":   &GitLabConnector{},
    "jira":     &JiraConnector{},
    "logger":   &LoggerConnector{MinLevel: "info"},
    "slack":    &SlackConnector{}, // Register here
}
```

