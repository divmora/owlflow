import { describe, it, expect } from 'vitest';
import { DryRunSimulationEngine, executeMockAction } from '../engine/simulator';
import { YamlService } from '../engine/yaml';
import { getSampleWorkflow } from '../samples/sampleWorkflows';
import { Workflow } from '../types/workflow';

describe('DryRunSimulationEngine', () => {
  const engine = new DryRunSimulationEngine();

  it('simulates gitlab-monitor.yaml with valid project data (branches to log_project)', () => {
    const sample = getSampleWorkflow('gitlab-monitor')!;
    const parsed = YamlService.parse(sample.yaml).data as Workflow;

    const result = engine.simulate({
      workflow: parsed,
      triggerInput: {
        payload: {
          project: {
            id: 12345,
            name: 'owlflow-engine',
            name_with_namespace: 'group/owlflow-engine',
            web_url: 'https://gitlab.com/group/owlflow-engine',
          },
        },
      },
    });

    expect(result.status).toBe('completed');
    expect(result.executedStepIds).toContain('get_project_details');
    expect(result.executedStepIds).toContain('log_project');
    expect(result.bypassedStepIds).toContain('log_error');

    expect(result.activeEdgeIds).toContain('get_project_details->log_project');
    expect(result.bypassedEdgeIds).toContain('get_project_details->log_error');
  });

  it('simulates gitlab-monitor.yaml when project is not found / empty name (branches to log_error)', () => {
    const sample = getSampleWorkflow('gitlab-monitor')!;
    const parsed = YamlService.parse(sample.yaml).data as Workflow;

    const result = engine.simulate({
      workflow: parsed,
      triggerInput: {
        payload: { project: { id: 999 } },
      },
      stepMockOverrides: {
        get_project_details: {
          id: 0,
          name: '',
          web_url: '',
        },
      },
    });

    expect(result.status).toBe('completed');
    expect(result.executedStepIds).toContain('get_project_details');
    expect(result.executedStepIds).toContain('log_error');
    expect(result.bypassedStepIds).toContain('log_project');

    expect(result.activeEdgeIds).toContain('get_project_details->log_error');
    expect(result.bypassedEdgeIds).toContain('get_project_details->log_project');
  });

  it('simulates github-monitor.yaml branching with HTTP status code mocks', () => {
    const sample = getSampleWorkflow('github-monitor')!;
    const parsed = YamlService.parse(sample.yaml).data as Workflow;

    // Simulation 1: HTTP 500 error -> notifies slack
    const errResult = engine.simulate({
      workflow: parsed,
      triggerInput: {
        payload: { repo: 'divmora/owlflow' },
      },
      stepMockOverrides: {
        check_commit: {
          status_code: 500,
          body: 'Internal Server Error',
        },
      },
    });

    expect(errResult.executedStepIds).toContain('check_commit');
    expect(errResult.executedStepIds).toContain('notify_slack');
    expect(errResult.activeEdgeIds).toContain('check_commit->notify_slack');

    // Simulation 2: HTTP 200 success -> bypasses notify_slack
    const successResult = engine.simulate({
      workflow: parsed,
      triggerInput: {
        payload: { repo: 'divmora/owlflow' },
      },
      stepMockOverrides: {
        check_commit: {
          status_code: 200,
          body: 'OK',
        },
      },
    });

    expect(successResult.executedStepIds).toContain('check_commit');
    expect(successResult.bypassedStepIds).toContain('notify_slack');
    expect(successResult.bypassedEdgeIds).toContain('check_commit->notify_slack');
  });

  it('simulates schedule_test.yaml single-step execution', () => {
    const sample = getSampleWorkflow('schedule-test')!;
    const parsed = YamlService.parse(sample.yaml).data as Workflow;

    const result = engine.simulate({
      workflow: parsed,
      triggerInput: {
        type: 'schedule',
        payload: {},
        time: '2026-08-20T12:00:00Z',
      },
    });

    expect(result.status).toBe('completed');
    expect(result.executedStepIds).toEqual(['log_time']);
    expect(result.executionLogs).toHaveLength(1);
    expect(result.executionLogs?.[0].resolvedParams.message).toContain('2026-08-20T12:00:00Z');
  });

  it('simulates test-workflow.yaml log_event execution with headers and template conditionals', () => {
    const sample = getSampleWorkflow('test-workflow')!;
    const parsed = YamlService.parse(sample.yaml).data as Workflow;

    const result = engine.simulate({
      workflow: parsed,
      triggerInput: {
        payload: {
          event: 'deployment_success',
          data: 'release-1.0',
          timestamp: '2026-08-20T12:00:00Z',
        },
        headers: {
          'User-Agent': ['OwlFlow/1.0'],
          'X-Forwarded-For': '198.51.100.1',
        },
      },
    });

    expect(result.status).toBe('completed');
    expect(result.executedStepIds).toContain('log_event');
    expect(result.unreachedStepIds).toContain('http_post');

    const logStep = result.executionLogs?.find(l => l.stepId === 'log_event');
    expect(logStep).toBeDefined();
    expect(logStep?.resolvedParams.message).toContain('Event: deployment_success');
    expect(logStep?.resolvedParams.message).toContain('IP: 198.51.100.1');
    expect(logStep?.resolvedParams.message).toContain('User Agent: [\"OwlFlow/1.0\"]');
  });

  it('executes internal connector actions accurately', () => {
    // 1. parseJson
    const parseRes = executeMockAction('internal.parseJson', { data: '{"count": 10, "name": "test"}' });
    expect(parseRes.output).toEqual({ count: 10, name: 'test' });

    // 2. getField
    const fieldRes = executeMockAction('internal.getField', { data: { key1: 'value1' }, field: 'key1' });
    expect(fieldRes.output).toBe('value1');

    // 3. contains
    const containsRes1 = executeMockAction('internal.contains', { list: ['admin', 'dev'], item: 'admin' });
    expect(containsRes1.output).toEqual({ found: true });

    const containsRes2 = executeMockAction('internal.contains', { list: ['admin', 'dev'], item: 'guest' });
    expect(containsRes2.output).toEqual({ found: false });

    // 4. startsWith
    const startsRes = executeMockAction('internal.startsWith', { list: ['feat/', 'fix/'], item: 'feat/auth' });
    expect(startsRes.output).toEqual({ found: true });

    // 5. regexMatch
    const regexRes = executeMockAction('internal.regexMatch', { regex: '^PROJ-[0-9]+$', item: 'PROJ-123' });
    expect(regexRes.output).toEqual({ match: true });
  });

  it('guards against infinite loops in cyclic workflows via maxExecutionSteps limit', () => {
    const cyclicWorkflow: Workflow = {
      id: 'loop-wf',
      name: 'Loop Workflow',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'stepA' },
      },
      steps: [
        {
          id: 'stepA',
          action: 'logger.info',
          params: { message: 'A' },
          next_steps: [{ step_id: 'stepB', condition: 'true' }],
        },
        {
          id: 'stepB',
          action: 'logger.info',
          params: { message: 'B' },
          next_steps: [{ step_id: 'stepA', condition: 'true' }],
        },
      ],
    };

    const res = engine.simulate({
      workflow: cyclicWorkflow,
      triggerInput: { payload: {} },
      maxExecutionSteps: 50,
    });

    expect(res.status).toBe('cycle_terminated');
  });
});
