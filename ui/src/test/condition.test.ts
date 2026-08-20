import { describe, it, expect } from 'vitest';
import { ConditionEvaluator } from '../engine/condition';
import { ExecutionContext } from '../types/workflow';

describe('ConditionEvaluator', () => {
  const evaluator = new ConditionEvaluator();

  const mockContext: ExecutionContext = {
    trigger: {
      payload: {
        repo: 'divmora/owlflow',
        branch: 'feat/new-ui',
        action: 'opened',
        count: 5,
      },
      headers: {
        'X-Status': 'OK',
      },
    },
    steps: {
      check_commit: {
        output: {
          status_code: 200,
          name: 'owlflow-step',
        },
      },
      error_step: {
        output: {
          status_code: 500,
          name: '',
        },
      },
    },
    vars: {
      env: 'production',
      is_active: true,
    },
    parent: [],
  };

  it('evaluates empty conditions as true', () => {
    expect(evaluator.evaluate('', mockContext).result).toBe(true);
    expect(evaluator.evaluate(undefined, mockContext).result).toBe(true);
    expect(evaluator.evaluate('   ', mockContext).result).toBe(true);
  });

  it('evaluates equality and inequality operators (==, !=)', () => {
    expect(
      evaluator.evaluate('{{ .steps.check_commit.output.status_code }} == 200', mockContext).result
    ).toBe(true);

    expect(
      evaluator.evaluate('{{ .steps.check_commit.output.status_code }} != 200', mockContext).result
    ).toBe(false);

    expect(
      evaluator.evaluate('{{ .steps.error_step.output.status_code }} != 200', mockContext).result
    ).toBe(true);

    expect(
      evaluator.evaluate('{{ .steps.error_step.output.name }} == ""', mockContext).result
    ).toBe(true);

    expect(
      evaluator.evaluate('{{ .steps.check_commit.output.name }} != ""', mockContext).result
    ).toBe(true);
  });

  it('evaluates relational comparison operators (<, <=, >, >=)', () => {
    expect(evaluator.evaluate('{{ .trigger.payload.count }} > 3', mockContext).result).toBe(true);
    expect(evaluator.evaluate('{{ .trigger.payload.count }} >= 5', mockContext).result).toBe(true);
    expect(evaluator.evaluate('{{ .trigger.payload.count }} < 5', mockContext).result).toBe(false);
    expect(evaluator.evaluate('{{ .trigger.payload.count }} <= 5', mockContext).result).toBe(true);
  });

  it('evaluates hasPrefix expressions in prefix and function formats', () => {
    expect(
      evaluator.evaluate('hasPrefix {{ .trigger.payload.branch }} "feat/"', mockContext).result
    ).toBe(true);

    expect(
      evaluator.evaluate('hasPrefix {{ .trigger.payload.branch }} "fix/"', mockContext).result
    ).toBe(false);

    expect(
      evaluator.evaluate('hasPrefix(trigger.payload.branch, "feat/")', mockContext).result
    ).toBe(true);
  });

  it('evaluates logical operators (&&, ||, !)', () => {
    expect(
      evaluator.evaluate(
        '{{ .steps.check_commit.output.status_code }} == 200 && {{ .vars.env }} == "production"',
        mockContext
      ).result
    ).toBe(true);

    expect(
      evaluator.evaluate(
        '{{ .steps.check_commit.output.status_code }} == 500 || {{ .steps.error_step.output.status_code }} == 500',
        mockContext
      ).result
    ).toBe(true);

    expect(
      evaluator.evaluate(
        '!hasPrefix(trigger.payload.branch, "fix/")',
        mockContext
      ).result
    ).toBe(true);
  });

  it('evaluates boolean literals directly', () => {
    expect(evaluator.evaluate('true', mockContext).result).toBe(true);
    expect(evaluator.evaluate('false', mockContext).result).toBe(false);
    expect(evaluator.evaluate('{{ .vars.is_active }}', mockContext).result).toBe(true);
  });

  it('handles missing properties gracefully without throwing unhandled exceptions', () => {
    const res = evaluator.evaluate('{{ .trigger.payload.missing_key }} == null', mockContext);
    expect(res.result).toBe(true);
  });
});
