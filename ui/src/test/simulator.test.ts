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

  it('executes jira.check_user_comment and branches conditionally based on output', () => {
    // 1. Action output check
    const checkAlice = executeMockAction('jira.check_user_comment', {
      issue_key: 'PROJ-101',
      user: 'qa-lead@company.com',
    });
    expect(checkAlice.output.commented).toBe(true);
    expect(checkAlice.output.found).toBe(true);

    const checkUnknown = executeMockAction('jira.check_user_comment', {
      issue_key: 'PROJ-101',
      user: 'unknown-user@company.com',
    });
    expect(checkUnknown.output.commented).toBe(false);
    expect(checkUnknown.output.found).toBe(false);

    // 2. Workflow dry-run simulation branching
    const jiraCommentWorkflow: Workflow = {
      id: 'jira-comment-test',
      name: 'Jira Comment Test',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'verify_comment' },
      },
      steps: [
        {
          id: 'verify_comment',
          action: 'jira.check_user_comment',
          params: {
            issue_key: 'PROJ-101',
            user: 'qa-lead@company.com',
          },
          next_steps: [
            {
              step_id: 'on_commented',
              condition: '{{ .steps.verify_comment.output.commented }} == true',
            },
            {
              step_id: 'on_not_commented',
              condition: '{{ .steps.verify_comment.output.commented }} == false',
            },
          ],
        },
        {
          id: 'on_commented',
          action: 'logger.info',
          params: { message: 'Comment verified!' },
        },
        {
          id: 'on_not_commented',
          action: 'logger.warn',
          params: { message: 'No comment found.' },
        },
      ],
    };

    // Positive case -> on_commented executed, on_not_commented bypassed
    const posResult = engine.simulate({
      workflow: jiraCommentWorkflow,
      triggerInput: { payload: {} },
    });

    expect(posResult.status).toBe('completed');
    expect(posResult.executedStepIds).toContain('verify_comment');
    expect(posResult.executedStepIds).toContain('on_commented');
    expect(posResult.bypassedStepIds).toContain('on_not_commented');
    expect(posResult.activeEdgeIds).toContain('verify_comment->on_commented');
    expect(posResult.bypassedEdgeIds).toContain('verify_comment->on_not_commented');

    // Negative case override -> on_not_commented executed, on_commented bypassed
    const negResult = engine.simulate({
      workflow: jiraCommentWorkflow,
      triggerInput: { payload: {} },
      stepMockOverrides: {
        verify_comment: {
          commented: false,
          found: false,
          match_count: 0,
        },
      },
    });

    expect(negResult.status).toBe('completed');
    expect(negResult.executedStepIds).toContain('verify_comment');
    expect(negResult.executedStepIds).toContain('on_not_commented');
    expect(negResult.bypassedStepIds).toContain('on_commented');
    expect(negResult.activeEdgeIds).toContain('verify_comment->on_not_commented');
    expect(negResult.bypassedEdgeIds).toContain('verify_comment->on_commented');
  });

  it('executes gitlab.check_mr_commit_author and branches conditionally', () => {
    // 1. Mock action execution check
    const checkAlice = executeMockAction('gitlab.check_mr_commit_author', {
      project_id: 'group/repo',
      merge_request_iid: 10,
      user: 'alice@company.com',
    });
    expect(checkAlice.output.is_author).toBe(true);
    expect(checkAlice.output.found).toBe(true);

    const checkUnknown = executeMockAction('gitlab.check_mr_commit_author', {
      project_id: 'group/repo',
      merge_request_iid: 10,
      user: 'unknown@company.com',
    });
    expect(checkUnknown.output.is_author).toBe(false);
    expect(checkUnknown.output.found).toBe(false);

    // 2. Workflow dry-run simulation branching
    const gitlabCommitWorkflow: Workflow = {
      id: 'gitlab-commit-author-check',
      name: 'GitLab Commit Author Check',
      status: 'active',
      trigger: {
        type: 'webhook',
        config: { initial_step: 'verify_author' },
      },
      steps: [
        {
          id: 'verify_author',
          action: 'gitlab.check_mr_commit_author',
          params: {
            project_id: '123',
            merge_request_iid: '42',
            user: 'alice@company.com',
          },
          next_steps: [
            {
              step_id: 'on_author_found',
              condition: '{{ .steps.verify_author.output.is_author }} == true',
            },
            {
              step_id: 'on_author_missing',
              condition: '{{ .steps.verify_author.output.is_author }} == false',
            },
          ],
        },
        {
          id: 'on_author_found',
          action: 'logger.info',
          params: { message: 'Author confirmed in MR commits' },
        },
        {
          id: 'on_author_missing',
          action: 'logger.warn',
          params: { message: 'Required user is not a commit author' },
        },
      ],
    };

    const res = engine.simulate({
      workflow: gitlabCommitWorkflow,
      triggerInput: { payload: {} },
    });

    expect(res.status).toBe('completed');
    expect(res.executedStepIds).toContain('verify_author');
    expect(res.executedStepIds).toContain('on_author_found');
    expect(res.bypassedStepIds).toContain('on_author_missing');
    expect(res.activeEdgeIds).toContain('verify_author->on_author_found');
    expect(res.bypassedEdgeIds).toContain('verify_author->on_author_missing');
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
