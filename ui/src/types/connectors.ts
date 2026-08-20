/**
 * Connector action schemas, documentation, and category metadata
 */

export interface ConnectorParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: any;
}

export interface ConnectorActionDef {
  action: string;
  connector: string;
  displayName: string;
  description: string;
  params: ConnectorParamDef[];
  outputDescription: string;
  exampleOutput: any;
}

export interface ConnectorCategoryDef {
  id: string;
  name: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  accentColor: string;
  actions: ConnectorActionDef[];
}

export const CONNECTOR_CATALOG: Record<string, ConnectorCategoryDef> = {
  http: {
    id: 'http',
    name: 'HTTP / REST',
    description: 'Perform HTTP requests to external APIs and web services',
    badgeBg: 'bg-blue-500/10',
    badgeText: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    accentColor: '#3b82f6',
    actions: [
      {
        action: 'http.get',
        connector: 'http',
        displayName: 'HTTP GET',
        description: 'Send an HTTP GET request to the specified URL',
        params: [
          { name: 'url', type: 'string', required: true, description: 'Target request URL (supports templating)' },
          { name: 'headers', type: 'object', required: false, description: 'Custom HTTP headers map' },
        ],
        outputDescription: 'Object containing HTTP status_code and raw response body',
        exampleOutput: { status_code: 200, body: '{"status": "ok"}' },
      },
      {
        action: 'http.post',
        connector: 'http',
        displayName: 'HTTP POST',
        description: 'Send an HTTP POST request with optional headers and request body',
        params: [
          { name: 'url', type: 'string', required: true, description: 'Target request URL' },
          { name: 'headers', type: 'object', required: false, description: 'HTTP headers map' },
          { name: 'body', type: 'string', required: false, description: 'Request body (string or JSON)' },
        ],
        outputDescription: 'Object containing HTTP status_code and response body',
        exampleOutput: { status_code: 201, body: '{"created": true}' },
      },
    ],
  },
  gitlab: {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Interact with GitLab projects, merge requests, users, and notes',
    badgeBg: 'bg-orange-500/10',
    badgeText: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    accentColor: '#f97316',
    actions: [
      {
        action: 'gitlab.get_project',
        connector: 'gitlab',
        displayName: 'Get Project',
        description: 'Fetch detailed GitLab project metadata by project ID or path',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID or URL-encoded path' },
          { name: 'token', type: 'string', required: false, description: 'GitLab personal access token (defaults to env)' },
          { name: 'base_url', type: 'string', required: false, description: 'GitLab API URL (defaults to https://gitlab.com/api/v4)' },
        ],
        outputDescription: 'GitLab Project resource object',
        exampleOutput: { id: 101, name: 'owlflow-engine', name_with_namespace: 'group/owlflow-engine', web_url: 'https://gitlab.com/group/owlflow-engine', default_branch: 'main' },
      },
      {
        action: 'gitlab.create_merge_request',
        connector: 'gitlab',
        displayName: 'Create Merge Request',
        description: 'Create a new merge request in a GitLab repository',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'source_branch', type: 'string', required: true, description: 'Source branch name' },
          { name: 'target_branch', type: 'string', required: true, description: 'Target branch name' },
          { name: 'title', type: 'string', required: true, description: 'Title of the MR' },
          { name: 'token', type: 'string', required: false, description: 'GitLab token' },
          { name: 'base_url', type: 'string', required: false, description: 'GitLab base API URL' },
        ],
        outputDescription: 'Created Merge Request object',
        exampleOutput: { id: 501, iid: 12, title: 'Feature: Automated Workflow', web_url: 'https://gitlab.com/group/owlflow-engine/-/merge_requests/12' },
      },
      {
        action: 'gitlab.get_user',
        connector: 'gitlab',
        displayName: 'Get User',
        description: 'Lookup a GitLab user profile by username',
        params: [
          { name: 'username', type: 'string', required: true, description: 'GitLab username' },
          { name: 'token', type: 'string', required: false, description: 'GitLab token' },
          { name: 'base_url', type: 'string', required: false, description: 'GitLab base API URL' },
        ],
        outputDescription: 'GitLab User object',
        exampleOutput: { id: 42, username: 'octocat', name: 'Mona Lisa', state: 'active' },
      },
      {
        action: 'gitlab.update_merge_request',
        connector: 'gitlab',
        displayName: 'Update Merge Request',
        description: 'Update merge request reviewers or metadata',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'merge_request_iid', type: 'string', required: true, description: 'MR internal ID (IID)' },
          { name: 'reviewer_ids', type: 'array', required: false, description: 'Array of reviewer user IDs' },
        ],
        outputDescription: 'Updated Merge Request object',
        exampleOutput: { id: 501, iid: 12, reviewers: [{ id: 42, username: 'octocat' }] },
      },
      {
        action: 'gitlab.add_reviewer',
        connector: 'gitlab',
        displayName: 'Add Reviewer',
        description: 'Assign a reviewer to a merge request',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'merge_request_iid', type: 'string', required: true, description: 'MR internal ID' },
          { name: 'user_id', type: 'number', required: true, description: 'User ID to add as reviewer' },
        ],
        outputDescription: 'Status object confirming reviewer assignment',
        exampleOutput: { status: 'success' },
      },
      {
        action: 'gitlab.approve_mr',
        connector: 'gitlab',
        displayName: 'Approve MR',
        description: 'Approve a merge request on behalf of a user or token',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'merge_request_iid', type: 'string', required: true, description: 'MR internal ID' },
        ],
        outputDescription: 'Status confirmation object',
        exampleOutput: { status: 'success' },
      },
      {
        action: 'gitlab.add_mr_note',
        connector: 'gitlab',
        displayName: 'Add MR Note / Comment',
        description: 'Post a comment or review note on a merge request',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'merge_request_iid', type: 'string', required: true, description: 'MR internal ID' },
          { name: 'body', type: 'string', required: true, description: 'Markdown body text' },
        ],
        outputDescription: 'Note object with note ID and timestamp',
        exampleOutput: { id: 999, body: 'LGTM!', created_at: '2026-08-20T12:00:00Z' },
      },
      {
        action: 'gitlab.close_mr',
        connector: 'gitlab',
        displayName: 'Close Merge Request',
        description: 'Close an open merge request',
        params: [
          { name: 'project_id', type: 'string', required: true, description: 'GitLab project ID' },
          { name: 'merge_request_iid', type: 'string', required: true, description: 'MR internal ID' },
        ],
        outputDescription: 'Closed MR object',
        exampleOutput: { status: 'closed' },
      },
    ],
  },
  jira: {
    id: 'jira',
    name: 'Jira Cloud',
    description: 'Transition Jira issues, search JQL, and update status',
    badgeBg: 'bg-sky-500/10',
    badgeText: 'text-sky-400',
    borderColor: 'border-sky-500/30',
    accentColor: '#0284c7',
    actions: [
      {
        action: 'jira.transition_issue',
        connector: 'jira',
        displayName: 'Transition Issue',
        description: 'Transition a Jira issue to a new workflow status',
        params: [
          { name: 'issue_key', type: 'string', required: true, description: 'Jira issue key (e.g. PROJ-123)' },
          { name: 'transition_id', type: 'string', required: true, description: 'Target transition ID or name' },
          { name: 'from_status_id', type: 'string', required: false, description: 'Expected current status ID' },
        ],
        outputDescription: 'Transition execution status',
        exampleOutput: { status: 'success' },
      },
      {
        action: 'jira.search_issues',
        connector: 'jira',
        displayName: 'Search Issues (JQL)',
        description: 'Query Jira issues using standard Jira Query Language (JQL)',
        params: [
          { name: 'jql', type: 'string', required: true, description: 'JQL search query string' },
        ],
        outputDescription: 'Search result summary with count and issue list',
        exampleOutput: { total: 1, found: true, issues: [{ key: 'PROJ-101', summary: 'Sample bug' }] },
      },
    ],
  },
  logger: {
    id: 'logger',
    name: 'Logger',
    description: 'Emit structured log messages at various log levels',
    badgeBg: 'bg-emerald-500/10',
    badgeText: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    accentColor: '#10b981',
    actions: [
      {
        action: 'logger.info',
        connector: 'logger',
        displayName: 'Log INFO',
        description: 'Output a structured log entry at INFO level',
        params: [
          { name: 'message', type: 'string', required: true, description: 'Log message string' },
          { name: 'fields', type: 'object', required: false, description: 'Structured metadata fields' },
          { name: 'syslog', type: 'boolean', required: false, description: 'Forward to syslog facility' },
        ],
        outputDescription: 'Structured log record object',
        exampleOutput: { timestamp: '2026-08-20T12:00:00Z', level: 'INFO', message: 'Workflow completed' },
      },
      {
        action: 'logger.debug',
        connector: 'logger',
        displayName: 'Log DEBUG',
        description: 'Output a structured log entry at DEBUG level',
        params: [
          { name: 'message', type: 'string', required: true, description: 'Debug log message' },
          { name: 'fields', type: 'object', required: false, description: 'Structured metadata fields' },
        ],
        outputDescription: 'Structured log record object',
        exampleOutput: { timestamp: '2026-08-20T12:00:00Z', level: 'DEBUG', message: 'Processing payload' },
      },
      {
        action: 'logger.warn',
        connector: 'logger',
        displayName: 'Log WARN',
        description: 'Output a structured warning log entry',
        params: [
          { name: 'message', type: 'string', required: true, description: 'Warning log message' },
          { name: 'fields', type: 'object', required: false, description: 'Structured metadata fields' },
        ],
        outputDescription: 'Structured log record object',
        exampleOutput: { timestamp: '2026-08-20T12:00:00Z', level: 'WARN', message: 'Non-fatal retry' },
      },
      {
        action: 'logger.error',
        connector: 'logger',
        displayName: 'Log ERROR',
        description: 'Output a structured error log entry',
        params: [
          { name: 'message', type: 'string', required: true, description: 'Error log message' },
          { name: 'fields', type: 'object', required: false, description: 'Structured metadata fields' },
        ],
        outputDescription: 'Structured log record object',
        exampleOutput: { timestamp: '2026-08-20T12:00:00Z', level: 'ERROR', message: 'Step failed' },
      },
    ],
  },
  internal: {
    id: 'internal',
    name: 'Internal Utilities',
    description: 'In-memory JSON manipulation, list inspection, and regex matching',
    badgeBg: 'bg-purple-500/10',
    badgeText: 'text-purple-400',
    borderColor: 'border-purple-500/30',
    accentColor: '#8b5cf6',
    actions: [
      {
        action: 'internal.parseJson',
        connector: 'internal',
        displayName: 'Parse JSON',
        description: 'Deserialize a raw JSON string into a structured JavaScript/JSON object',
        params: [
          { name: 'data', type: 'string', required: true, description: 'Raw JSON string' },
        ],
        outputDescription: 'Parsed object or array',
        exampleOutput: { key: 'value', count: 1 },
      },
      {
        action: 'internal.getField',
        connector: 'internal',
        displayName: 'Get Field',
        description: 'Extract a single field from an object',
        params: [
          { name: 'data', type: 'object', required: true, description: 'Source object' },
          { name: 'field', type: 'string', required: true, description: 'Field name to retrieve' },
        ],
        outputDescription: 'Value of data[field]',
        exampleOutput: 'extracted-value',
      },
      {
        action: 'internal.contains',
        connector: 'internal',
        displayName: 'List Contains',
        description: 'Check if a list or array contains a specific item',
        params: [
          { name: 'list', type: 'array', required: true, description: 'Target array or JSON list string' },
          { name: 'item', type: 'string', required: true, description: 'Item to look for' },
        ],
        outputDescription: 'Object with boolean found indicator',
        exampleOutput: { found: true },
      },
      {
        action: 'internal.startsWith',
        connector: 'internal',
        displayName: 'Starts With Any',
        description: 'Check if a string starts with any prefix in the list',
        params: [
          { name: 'list', type: 'array', required: true, description: 'List of string prefixes' },
          { name: 'item', type: 'string', required: true, description: 'Candidate string' },
        ],
        outputDescription: 'Object with boolean found indicator',
        exampleOutput: { found: true },
      },
      {
        action: 'internal.regexMatch',
        connector: 'internal',
        displayName: 'Regex Match',
        description: 'Test a string against a regular expression pattern',
        params: [
          { name: 'regex', type: 'string', required: true, description: 'Regular expression pattern' },
          { name: 'item', type: 'string', required: true, description: 'Target string' },
        ],
        outputDescription: 'Object with boolean match indicator',
        exampleOutput: { match: true },
      },
    ],
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Send notifications and chat messages to Slack channels',
    badgeBg: 'bg-rose-500/10',
    badgeText: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    accentColor: '#f43f5e',
    actions: [
      {
        action: 'slack.sendMessage',
        connector: 'slack',
        displayName: 'Send Message',
        description: 'Post a chat message to a Slack channel',
        params: [
          { name: 'channel', type: 'string', required: true, description: 'Slack channel name (e.g. #alerts)' },
          { name: 'text', type: 'string', required: true, description: 'Message body text' },
        ],
        outputDescription: 'Delivery status confirmation',
        exampleOutput: { status: 'sent', channel: '#alerts' },
      },
    ],
  },
};

export function getActionMetadata(actionName: string): {
  category: ConnectorCategoryDef;
  action?: ConnectorActionDef;
} | null {
  if (!actionName) return null;
  const [prefix] = actionName.split('.');
  const category = CONNECTOR_CATALOG[prefix];
  if (!category) return null;
  const action = category.actions.find(a => a.action === actionName);
  return { category, action };
}
