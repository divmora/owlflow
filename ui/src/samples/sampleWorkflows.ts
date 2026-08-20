export interface SampleWorkflow {
  id: string;
  name: string;
  filename: string;
  description: string;
  triggerType: 'webhook' | 'schedule' | 'manual';
  yaml: string;
  defaultPayload?: Record<string, any>;
  defaultHeaders?: Record<string, any>;
  defaultVars?: Record<string, any>;
}

export const SAMPLE_WORKFLOWS: SampleWorkflow[] = [
  {
    id: 'github-monitor',
    name: 'GitHub Repository Monitor',
    filename: 'github-monitor.yaml',
    description: 'Monitors GitHub repository commits via webhook and notifies Slack on errors or logs on success',
    triggerType: 'webhook',
    defaultPayload: {
      repo: 'divmora/owlflow',
      pusher: {
        name: 'dev-user',
      },
    },
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'push',
    },
    yaml: `id: "github-monitor"
name: "GitHub Repository Monitor"
status: "disabled"
trigger:
  type: "webhook"
  config:
    path: "/github-webhook"
    initial_step: "check_commit"
steps:
  - id: "check_commit"
    action: "http.get"
    params:
      url: "https://api.github.com/repos/{{ .trigger.payload.repo }}/commits"
    next_steps:
      - step_id: "notify_slack"
        condition: '{{ .steps.check_commit.output.status_code }} != 200'
      - step_id: "log_success"
        condition: '{{ .steps.check_commit.output.status_code }} == 200'

  - id: "notify_slack"
    action: "slack.sendMessage"
    params:
      channel: "#alerts"
      text: "GitHub API Error: {{ .steps.check_commit.output.body }}"
`,
  },
  {
    id: 'gitlab-monitor',
    name: 'GitLab Repository Monitor',
    filename: 'gitlab-monitor.yaml',
    description: 'Fetches GitLab project details and branches into logger.info or logger.error based on project presence',
    triggerType: 'webhook',
    defaultPayload: {
      project: {
        id: 9876,
        name: 'owlflow-app',
        name_with_namespace: 'divmora / owlflow-app',
        web_url: 'https://gitlab.com/divmora/owlflow-app',
      },
    },
    defaultHeaders: {
      'Content-Type': 'application/json',
      'X-Gitlab-Event': 'Push Hook',
    },
    yaml: `id: "gitlab-monitor"
name: "GitLab Repository Monitor"
status: "disabled"
trigger:
  type: "webhook"
  config:
    path: "/gitlab-webhook"
    initial_step: "get_project_details"
steps:
  - id: "get_project_details"
    action: "gitlab.get_project"
    params:
      project_id: "{{ .trigger.payload.project.id }}"
    next_steps:
      - step_id: "log_project"
        condition: '{{ .steps.get_project_details.output.name }} != ""'
      - step_id: "log_error"
        condition: '{{ .steps.get_project_details.output.name }} == ""'

  - id: "log_project"
    action: "logger.info"
    params:
      message: "Processing GitLab Project: {{ .steps.get_project_details.output.name_with_namespace }}"
      fields:
        url: "{{ .steps.get_project_details.output.web_url }}"

  - id: "log_error"
    action: "logger.error"
    params:
      message: "Failed to fetch GitLab project details"
`,
  },
  {
    id: 'schedule-test',
    name: 'Schedule Test',
    filename: 'schedule_test.yaml',
    description: 'Scheduled cron workflow that executes every 5 seconds and logs execution timestamps',
    triggerType: 'schedule',
    defaultPayload: {
      type: 'schedule',
      time: '2026-08-20T13:30:00Z',
      timezone: 'UTC',
    },
    yaml: `id: "schedule-test"
name: "Schedule Test"
status: "disabled"
trigger:
  type: "schedule"
  config:
    cron: "*/5 * * * * *"
    initial_step: "log_time"
steps:
  - id: "log_time"
    action: "logger.info"
    params:
      message: "Scheduled workflow executed at {{ .TriggerData.time }}"
    pass_output: false
`,
  },
  {
    id: 'test-workflow',
    name: 'Test workflow',
    filename: 'test-workflow.yaml',
    description: 'Multi-step workflow demonstrating complex Go templating, JSON serialization, headers, and if-else logic',
    triggerType: 'webhook',
    defaultPayload: {
      event: 'push_event',
      data: 'feature_branch_update',
      timestamp: '2026-08-20T13:30:00Z',
    },
    defaultHeaders: {
      'User-Agent': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
      'X-Forwarded-For': ['203.0.113.195'],
      'Content-Type': ['application/json'],
    },
    yaml: `id: "test-workflow"
name: "Test workflow"
status: "disabled"
trigger:
  type: "webhook"
  config:
    path: "/test-workflow"
    initial_step: "log_event"
steps:
  - id: "http_post"
    action: "http.post"
    params:
      url: "https://api.example.com/webhook"
      headers:
        Content-Type: "application/json"
        Authorization: "Bearer {{ index .TriggerData.headers \\"User-Agent\\" | first }}"
      body: |
        {
          "event_type": "{{ .TriggerData.payload.data }}",
          "received_at": "{{ .TriggerData.payload.timestamp }}",
          "data": {{ toJson .TriggerData.payload }}
        }
    retries: 2
    pass_output: false

  - id: "log_event"
    action: "logger.info"
    params:
      message: |
        Webhook Received
        -----------------
        Event: {{ .TriggerData.payload.event }}
        {{ if (index .TriggerData.headers "X-Forwarded-For") }}
        IP: {{ index .TriggerData.headers "X-Forwarded-For" }}
        {{ else }}
        IP: Unknown
        {{ end }}
        User Agent: {{ index .TriggerData.headers "User-Agent" }}
        Payload: {{ toJson .TriggerData.payload }}
    pass_output: false
`,
  },
];

export function getSampleWorkflow(id: string): SampleWorkflow | undefined {
  return SAMPLE_WORKFLOWS.find(s => s.id === id || s.filename === id);
}
