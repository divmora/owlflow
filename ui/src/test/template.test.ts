import { describe, it, expect } from 'vitest';
import { GoTemplateEngine, TEMPLATE_FUNCTIONS } from '../engine/template';
import { ExecutionContext } from '../types/workflow';

describe('GoTemplateEngine', () => {
  const engine = new GoTemplateEngine();

  const mockContext: ExecutionContext = {
    trigger: {
      payload: {
        repo: 'divmora/owlflow',
        user: { name: 'Alice', id: 42 },
        items: ['first', 'second', 'third'],
        ref: 'refs/heads/main',
      },
      headers: {
        'User-Agent': ['OwlFlow-Agent/1.0', 'CustomBot'],
        'X-Forwarded-For': '203.0.113.195',
      },
    },
    steps: {
      check_commit: {
        output: {
          status_code: 200,
          body: { commit_hash: 'abc1234' },
        },
      },
    },
    vars: {
      env: 'production',
      is_prod: true,
      debug: false,
    },
    parent: [{ id: 'parent-output' }],
  };

  it('interpolates nested property paths (.trigger.payload.* and .steps.*)', () => {
    const tmpl = 'Repository: {{ .trigger.payload.repo }} by {{ .trigger.payload.user.name }}';
    const res = engine.processStringTemplate(tmpl, mockContext);
    expect(res).toBe('Repository: divmora/owlflow by Alice');

    const stepTmpl = 'Status: {{ .steps.check_commit.output.status_code }}';
    const stepRes = engine.processStringTemplate(stepTmpl, mockContext);
    expect(stepRes).toBe('Status: 200');
  });

  it('supports context aliases (.TriggerData and .inputs and .vars)', () => {
    const tmpl1 = 'Repo: {{ .TriggerData.payload.repo }}';
    expect(engine.processStringTemplate(tmpl1, mockContext)).toBe('Repo: divmora/owlflow');

    const tmpl2 = 'Env: {{ .vars.env }}';
    expect(engine.processStringTemplate(tmpl2, mockContext)).toBe('Env: production');
  });

  it('evaluates toJson and toPrettyJson helper functions', () => {
    const raw = '{{ toJson .trigger.payload.user }}';
    const res = engine.processStringTemplate(raw, mockContext);
    expect(res).toEqual({ name: 'Alice', id: 42 });

    const pretty = TEMPLATE_FUNCTIONS.toPrettyJson({ foo: 'bar' });
    expect(pretty).toContain('\n  "foo": "bar"');
  });

  it('evaluates first and index helper functions in pipelines', () => {
    const tmpl = '{{ index .trigger.headers "User-Agent" | first }}';
    const res = engine.processStringTemplate(tmpl, mockContext);
    expect(res).toBe('OwlFlow-Agent/1.0');
  });

  it('evaluates hasPrefix helper function', () => {
    const tmpl = '{{ hasPrefix .trigger.payload.ref "refs/heads/" }}';
    const res = engine.processStringTemplate(tmpl, mockContext);
    expect(res).toBe('true');
  });

  it('evaluates control blocks ({{ if ... }} ... {{ else }} ... {{ end }})', () => {
    const tmpl1 = '{{ if .vars.is_prod }}PROD{{ else }}DEV{{ end }}';
    expect(engine.processStringTemplate(tmpl1, mockContext)).toBe('PROD');

    const tmpl2 = '{{ if .vars.debug }}DEBUG_MODE{{ else }}NORMAL_MODE{{ end }}';
    expect(engine.processStringTemplate(tmpl2, mockContext)).toBe('NORMAL_MODE');
  });

  it('performs automatic JSON type coercion matching Go parsePotentialJSON', () => {
    const tmpl = '{"status": {{ .steps.check_commit.output.status_code }}, "valid": true}';
    const res = engine.processStringTemplate(tmpl, mockContext);
    expect(typeof res).toBe('object');
    expect(res).toEqual({ status: 200, valid: true });
  });

  it('recursively resolves nested objects and arrays in resolveValue()', () => {
    const params = {
      url: 'https://api.github.com/repos/{{ .trigger.payload.repo }}',
      tags: ['env-{{ .vars.env }}', 'user-{{ .trigger.payload.user.id }}'],
      config: {
        name: '{{ .trigger.payload.user.name }}',
      },
    };

    const resolved = engine.resolveValue(params, mockContext);
    expect(resolved).toEqual({
      url: 'https://api.github.com/repos/divmora/owlflow',
      tags: ['env-production', 'user-42'],
      config: {
        name: 'Alice',
      },
    });
  });
});
