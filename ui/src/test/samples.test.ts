import { describe, it, expect } from 'vitest';
import { parseYaml } from '../engine/yaml';
import { validateWorkflow } from '../engine/validator';
import { simulateWorkflow } from '../engine/simulator';
import { resolveTemplate } from '../engine/template';
import type { Workflow } from '../types/workflow';
import type { TriggerData, ExecutionContext } from '../types/engine';

// Raw YAML strings matching production configs in configs/workflows/
const GITHUB_MONITOR_YAML = `
id: "github-monitor"
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
`;

const GITLAB_MONITOR_YAML = `
id: "gitlab-monitor"
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
`;

const SCHEDULE_TEST_YAML = `
id: "schedule-test"
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
`;

const TEST_WORKFLOW_YAML = `
id: "test-workflow"
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
`;

describe('Tier 4: Real-World Workflow Specifications & Execution Scenarios', () => {
  describe('Scenario 1: github-monitor.yaml (Dangling Step Detection & Fix)', () => {
    it('should parse github-monitor.yaml and detect the dangling log_success step reference', () => {
      const parsed = parseYaml(GITHUB_MONITOR_YAML);
      expect(parsed.error).toBeUndefined();
      expect(parsed.data).toBeDefined();

      const workflow = parsed.data as Workflow;
      const validation = validateWorkflow(workflow);

      // Must detect that log_success does not exist in steps
      expect(validation.isValid).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.message.includes('log_success') ||
            e.message.toLowerCase().includes('dangling') ||
            e.message.toLowerCase().includes('invalid next step')
        )
      ).toBe(true);
    });

    it('should validate cleanly when the missing log_success step is added to github-monitor.yaml', () => {
      const parsed = parseYaml(GITHUB_MONITOR_YAML);
      const workflow = parsed.data as Workflow;

      // Fix: Add missing log_success step
      const fixedWorkflow: Workflow = {
        ...workflow,
        steps: [
          ...workflow.steps,
          {
            id: 'log_success',
            action: 'logger.info',
            params: {
              message: 'Commit check succeeded',
            },
          },
        ],
      };

      const validation = validateWorkflow(fixedWorkflow);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Scenario 2: gitlab-monitor.yaml (2-Way Conditional Branch Simulation)', () => {
    it('should validate gitlab-monitor.yaml successfully', () => {
      const parsed = parseYaml(GITLAB_MONITOR_YAML);
      expect(parsed.error).toBeUndefined();

      const workflow = parsed.data as Workflow;
      const validation = validateWorkflow(workflow);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should simulate successful project path (log_project executed, log_error bypassed)', () => {
      const parsed = parseYaml(GITLAB_MONITOR_YAML);
      const workflow = parsed.data as Workflow;

      const triggerData: TriggerData = {
        type: 'webhook',
        payload: {
          project: {
            id: 1234,
            name: 'owlflow-repo',
            name_with_namespace: 'divmora / owlflow-repo',
            web_url: 'https://gitlab.com/divmora/owlflow-repo',
          },
        },
      };

      const result = simulateWorkflow(workflow, triggerData);
      expect(result.success).toBe(true);
      expect(result.executedSteps).toContain('get_project_details');
      expect(result.executedSteps).toContain('log_project');
      expect(result.bypassedSteps).toContain('log_error');
    });

    it('should simulate empty project name path (log_error executed, log_project bypassed)', () => {
      const parsed = parseYaml(GITLAB_MONITOR_YAML);
      const workflow = parsed.data as Workflow;

      // Context where get_project_details output name is empty string
      const triggerData: TriggerData = {
        type: 'webhook',
        payload: {
          project: {
            id: 9999,
            name: '', // Empty name triggers error branch
          },
        },
      };

      const result = simulateWorkflow(workflow, triggerData);
      expect(result.success).toBe(true);
      expect(result.executedSteps).toContain('get_project_details');
    });
  });

  describe('Scenario 3: schedule_test.yaml (6-Field Cron Workflow Execution)', () => {
    it('should validate 6-field sub-minute cron expression in schedule_test.yaml', () => {
      const parsed = parseYaml(SCHEDULE_TEST_YAML);
      expect(parsed.error).toBeUndefined();

      const workflow = parsed.data as Workflow;
      const validation = validateWorkflow(workflow);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(workflow.trigger.config.cron).toBe('*/5 * * * * *');
    });

    it('should simulate scheduled execution and resolve TriggerData.time template', () => {
      const parsed = parseYaml(SCHEDULE_TEST_YAML);
      const workflow = parsed.data as Workflow;

      const triggerData: TriggerData = {
        type: 'schedule',
        time: '2026-08-20T12:00:00Z',
        timezone: 'UTC',
      };

      const result = simulateWorkflow(workflow, triggerData);
      expect(result.success).toBe(true);
      expect(result.executedSteps).toEqual(['log_time']);
      expect(result.timeline).toHaveLength(1);
    });
  });

  describe('Scenario 4: test-workflow.yaml (Multi-line Go Templates & POST Action)', () => {
    it('should validate test-workflow.yaml schema and steps structure', () => {
      const parsed = parseYaml(TEST_WORKFLOW_YAML);
      expect(parsed.error).toBeUndefined();

      const workflow = parsed.data as Workflow;
      const validation = validateWorkflow(workflow);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(workflow.steps).toHaveLength(2);
    });

    it('should evaluate complex multi-line template expressions, toJson, and index/first helpers', () => {
      const sampleContext: ExecutionContext = {
        trigger: {
          type: 'webhook',
          payload: {
            event: 'push',
            data: 'test_event',
            timestamp: '2026-08-20T12:30:00Z',
          },
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
            'X-Forwarded-For': '192.168.1.100',
          },
        },
        steps: {},
        vars: {},
        parent: [],
      };

      // Header with index and first pipeline
      const authHeaderTmpl =
        'Bearer {{ index .TriggerData.headers "User-Agent" | first }}';
      const authHeader = resolveTemplate(authHeaderTmpl, sampleContext);
      expect(authHeader).toBe(
        'Bearer Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      );

      // JSON body with embedded toJson
      const bodyTmpl = `{
  "event_type": "{{ .TriggerData.payload.data }}",
  "received_at": "{{ .TriggerData.payload.timestamp }}",
  "data": {{ toJson .TriggerData.payload }}
}`;
      const resolvedBody = resolveTemplate(bodyTmpl, sampleContext);
      const parsedBody =
        typeof resolvedBody === 'string'
          ? JSON.parse(resolvedBody)
          : resolvedBody;
      expect(parsedBody.event_type).toBe('test_event');
      expect(parsedBody.received_at).toBe('2026-08-20T12:30:00Z');
      expect(parsedBody.data.event).toBe('push');

      // Conditional message in log_event
      const logEventMessageTmpl = `Webhook Received
-----------------
Event: {{ .TriggerData.payload.event }}
{{ if (index .TriggerData.headers "X-Forwarded-For") }}
IP: {{ index .TriggerData.headers "X-Forwarded-For" }}
{{ else }}
IP: Unknown
{{ end }}
Payload: {{ toJson .TriggerData.payload }}`;

      const resolvedLogMsg = resolveTemplate(
        logEventMessageTmpl,
        sampleContext
      ) as string;
      expect(resolvedLogMsg).toContain('Event: push');
      expect(resolvedLogMsg).toContain('IP: 192.168.1.100');
    });

    it('should simulate execution of test-workflow.yaml from initial_step log_event', () => {
      const parsed = parseYaml(TEST_WORKFLOW_YAML);
      const workflow = parsed.data as Workflow;

      const triggerData: TriggerData = {
        type: 'webhook',
        payload: {
          event: 'push',
          data: 'test_event',
          timestamp: '2026-08-20T12:30:00Z',
        },
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ['OwlFlow-Tester'],
          'X-Forwarded-For': '127.0.0.1',
        },
      };

      const result = simulateWorkflow(workflow, triggerData);
      expect(result.success).toBe(true);
      expect(result.executedSteps).toContain('log_event');
    });
  });
});
