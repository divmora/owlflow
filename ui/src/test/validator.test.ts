import { describe, it, expect } from 'vitest';
import { WorkflowValidator } from '../engine/validator';
import { YamlService } from '../engine/yaml';
import { getSampleWorkflow } from '../samples/sampleWorkflows';
import { Workflow } from '../types/workflow';

describe('WorkflowValidator', () => {
  it('validates all clean sample workflows', () => {
    const gitlabWf = getSampleWorkflow('gitlab-monitor')!;
    const parsedGitlab = YamlService.parse(gitlabWf.yaml);
    const gitlabRes = WorkflowValidator.validate(parsedGitlab.data, gitlabWf.yaml, parsedGitlab.cst);
    expect(gitlabRes.isValid).toBe(true);
    expect(gitlabRes.errors).toHaveLength(0);

    const scheduleWf = getSampleWorkflow('schedule-test')!;
    const parsedSchedule = YamlService.parse(scheduleWf.yaml);
    const scheduleRes = WorkflowValidator.validate(parsedSchedule.data, scheduleWf.yaml, parsedSchedule.cst);
    expect(scheduleRes.isValid).toBe(true);
    expect(scheduleRes.errors).toHaveLength(0);

    const testWf = getSampleWorkflow('test-workflow')!;
    const parsedTest = YamlService.parse(testWf.yaml);
    const testRes = WorkflowValidator.validate(parsedTest.data, testWf.yaml, parsedTest.cst);
    expect(testRes.isValid).toBe(true);
    expect(testRes.errors).toHaveLength(0);
    // Note: test-workflow has an orphan step http_post which generates an unreachable warning
    expect(testRes.unreachableStepIds.has('http_post')).toBe(true);
  });

  it('detects dangling step reference in github-monitor.yaml (log_success does not exist in steps)', () => {
    const githubWf = getSampleWorkflow('github-monitor')!;
    const parsedGithub = YamlService.parse(githubWf.yaml);
    const res = WorkflowValidator.validate(parsedGithub.data, githubWf.yaml, parsedGithub.cst);

    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBeGreaterThanOrEqual(1);

    const danglingErr = res.errors.find(e => e.code === 'V-DAG-001');
    expect(danglingErr).toBeDefined();
    expect(danglingErr?.message).toContain('log_success');
  });

  it('flags missing required top-level fields (id, name, trigger, steps)', () => {
    const emptyObj = {};
    const res = WorkflowValidator.validate(emptyObj);
    expect(res.isValid).toBe(false);

    const codes = res.errors.map(e => e.code);
    expect(codes).toContain('V-TOP-001');
    expect(codes).toContain('V-TOP-002');
    expect(codes).toContain('V-TOP-004');
    expect(codes).toContain('V-TOP-005');
  });

  it('validates trigger configurations and initial_step existence', () => {
    const invalidTriggerWf: Partial<Workflow> = {
      id: 'test-trig',
      name: 'Test Trigger',
      status: 'active',
      trigger: {
        type: 'invalid_type' as any,
        config: {
          initial_step: 'non_existent_initial',
        },
      },
      steps: [
        {
          id: 'step1',
          action: 'logger.info',
          params: { message: 'hi' },
        },
      ],
    };

    const res = WorkflowValidator.validate(invalidTriggerWf);
    expect(res.isValid).toBe(false);
    const codes = res.errors.map(e => e.code);
    expect(codes).toContain('V-TRG-001'); // Invalid trigger type
    expect(codes).toContain('V-TRG-002'); // Non-existent initial_step
  });

  it('detects duplicate step IDs', () => {
    const duplicateWf: Partial<Workflow> = {
      id: 'dup-wf',
      name: 'Duplicate Test',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'step1' },
      },
      steps: [
        { id: 'step1', action: 'logger.info', params: { message: 'first' } },
        { id: 'step1', action: 'logger.info', params: { message: 'second' } },
      ],
    };

    const res = WorkflowValidator.validate(duplicateWf);
    expect(res.isValid).toBe(false);
    const dupErr = res.errors.find(e => e.code === 'V-STP-002');
    expect(dupErr).toBeDefined();
    expect(dupErr?.message).toContain('Duplicate step ID');
  });

  it('detects missing required action parameters for catalog connectors', () => {
    const missingParamsWf: Partial<Workflow> = {
      id: 'missing-param-wf',
      name: 'Missing Param',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'http_step' },
      },
      steps: [
        {
          id: 'http_step',
          action: 'http.get',
          // missing 'url'
          params: {},
        },
      ],
    };

    const res = WorkflowValidator.validate(missingParamsWf);
    expect(res.isValid).toBe(false);
    const paramErr = res.errors.find(e => e.code === 'V-STP-005');
    expect(paramErr).toBeDefined();
    expect(paramErr?.message).toContain('requires parameter "url"');
  });

  it('detects step retry and timeout bounds violations', () => {
    const boundsWf: Partial<Workflow> = {
      id: 'bounds-wf',
      name: 'Bounds Test',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'step1' },
      },
      steps: [
        {
          id: 'step1',
          action: 'logger.info',
          params: { message: 'test' },
          retries: 25, // max 10
          timeout: 9999, // max 3600
        },
      ],
    };

    const res = WorkflowValidator.validate(boundsWf);
    expect(res.isValid).toBe(false);
    const retryErr = res.errors.find(e => e.code === 'V-STP-006');
    const timeoutErr = res.errors.find(e => e.code === 'V-STP-007');
    expect(retryErr).toBeDefined();
    expect(timeoutErr).toBeDefined();
  });

  it('detects orphan / unreachable steps', () => {
    const orphanWf: Partial<Workflow> = {
      id: 'orphan-wf',
      name: 'Orphan Test',
      status: 'active',
      trigger: {
        type: 'manual',
        config: { initial_step: 'root' },
      },
      steps: [
        { id: 'root', action: 'logger.info', params: { message: 'root' } },
        { id: 'unreachable_step', action: 'logger.info', params: { message: 'lonely' } },
      ],
    };

    const res = WorkflowValidator.validate(orphanWf);
    expect(res.unreachableStepIds.has('unreachable_step')).toBe(true);
    const warn = res.warnings.find(w => w.code === 'V-DAG-002');
    expect(warn).toBeDefined();
    expect(warn?.message).toContain('unreachable_step');
  });

  it('detects cycles in graph transitions', () => {
    const cycleWf: Partial<Workflow> = {
      id: 'cycle-wf',
      name: 'Cycle Test',
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
          next_steps: [{ step_id: 'stepB' }],
        },
        {
          id: 'stepB',
          action: 'logger.info',
          params: { message: 'B' },
          next_steps: [{ step_id: 'stepC' }],
        },
        {
          id: 'stepC',
          action: 'logger.info',
          params: { message: 'C' },
          next_steps: [{ step_id: 'stepA' }],
        },
      ],
    };

    const res = WorkflowValidator.validate(cycleWf);
    expect(res.cycles.length).toBeGreaterThan(0);
    const cycleWarn = res.warnings.find(w => w.code === 'V-DAG-003');
    expect(cycleWarn).toBeDefined();
  });
});
