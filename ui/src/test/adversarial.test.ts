import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../engine/validator';
import { YamlService } from '../engine/yaml';
import { GoTemplateEngine, resolveParams } from '../engine/template';
import { ConditionEvaluator } from '../engine/condition';
import { DryRunSimulationEngine, simulateWorkflow } from '../engine/simulator';
import { buildWorkflowGraph } from '../engine/dag';
import { ExecutionContext, Workflow } from '../types/workflow';

describe('Adversarial Stress Test Suite', () => {

  // =========================================================================
  // FOCUS AREA 1: Schema & Graph Validator Adversarial Testing
  // =========================================================================
  describe('1. Schema & Graph Topology Validator', () => {

    it('rejects null, undefined, and primitive roots with V-TOP-000', () => {
      const inputs = [null, undefined, 'string', 12345, true, false];
      for (const input of inputs) {
        const res = validateWorkflow(input);
        expect(res.isValid).toBe(false);
        expect(res.errors.some(e => e.code === 'V-TOP-000')).toBe(true);
      }
    });

    it('rejects array roots as invalid workflows', () => {
      const res = validateWorkflow([1, 2, 3]);
      expect(res.isValid).toBe(false);
      expect(res.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('flags missing or invalid workflow IDs (V-TOP-001)', () => {
      const invalidIds = ['', '   ', 'invalid id with spaces', 'id/with/slashes', 'id@special!', 'id.with.dots'];
      for (const id of invalidIds) {
        const wf: Partial<Workflow> = {
          id,
          name: 'Valid Name',
          trigger: { type: 'manual', config: { initial_step: 's1' } },
          steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
        };
        const res = validateWorkflow(wf);
        expect(res.isValid).toBe(false);
        expect(res.errors.some(e => e.code === 'V-TOP-001')).toBe(true);
      }

      // Valid IDs
      const validIds = ['valid-id', 'valid_id_123', 'WORKFLOW-99'];
      for (const id of validIds) {
        const wf: Partial<Workflow> = {
          id,
          name: 'Valid Name',
          trigger: { type: 'manual', config: { initial_step: 's1' } },
          steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
        };
        const res = validateWorkflow(wf);
        expect(res.errors.some(e => e.code === 'V-TOP-001')).toBe(false);
      }
    });

    it('flags missing or whitespace-only workflow name (V-TOP-002)', () => {
      const wf: Partial<Workflow> = {
        id: 'valid-id',
        name: '   ',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      const res = validateWorkflow(wf);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.code === 'V-TOP-002')).toBe(true);
    });

    it('flags invalid workflow status (V-TOP-003)', () => {
      const wf: any = {
        id: 'valid-id',
        name: 'Valid Name',
        status: 'running', // Not in 'active' | 'disabled' | 'draft'
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      const res = validateWorkflow(wf);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.code === 'V-TOP-003')).toBe(true);
    });

    it('flags missing or malformed trigger definitions (V-TOP-004, V-TRG-001, V-TRG-002)', () => {
      // 1. Missing trigger
      const noTrig: Partial<Workflow> = {
        id: 'valid-id',
        name: 'Valid Name',
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(noTrig).errors.some(e => e.code === 'V-TOP-004')).toBe(true);

      // 2. Invalid trigger type
      const badType: any = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'kafka', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(badType).errors.some(e => e.code === 'V-TRG-001')).toBe(true);

      // 3. Missing trigger config
      const noConfig: any = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual' },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(noConfig).errors.some(e => e.code === 'V-TRG-002')).toBe(true);
    });

    it('flags missing or invalid initial_step (V-TRG-002)', () => {
      // 1. Empty initial_step
      const emptyInit: Partial<Workflow> = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: '' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(emptyInit).errors.some(e => e.code === 'V-TRG-002')).toBe(true);

      // 2. Non-existent initial_step target
      const missingInit: Partial<Workflow> = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: 'does_not_exist' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      const res = validateWorkflow(missingInit);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.code === 'V-TRG-002' && e.message.includes('does not exist'))).toBe(true);
    });

    it('validates schedule cron expressions (5-field and 6-field valid, others rejected) (V-TRG-003)', () => {
      const testCron = (cron: string, shouldBeValid: boolean) => {
        const wf: Partial<Workflow> = {
          id: 'cron-wf',
          name: 'Cron Test',
          trigger: { type: 'schedule', config: { initial_step: 's1', cron } },
          steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
        };
        const res = validateWorkflow(wf);
        const hasCronError = res.errors.some(e => e.code === 'V-TRG-003');
        expect(hasCronError).toBe(!shouldBeValid);
      };

      // Valid cron expressions
      testCron('* * * * *', true); // 5-field
      testCron('0 12 * * ?', true); // 5-field
      testCron('*/5 * * * * *', true); // 6-field
      testCron('0 0 12 1 1 ?', true); // 6-field

      // Invalid cron expressions
      testCron('', false); // empty
      testCron('   ', false);
      testCron('* *', false); // 2 fields
      testCron('* * * *', false); // 4 fields
      testCron('* * * * * * *', false); // 7 fields
    });

    it('flags warnings for webhook path without leading slash (V-TRG-004)', () => {
      const wf: Partial<Workflow> = {
        id: 'webhook-wf',
        name: 'Webhook Test',
        trigger: { type: 'webhook', config: { initial_step: 's1', path: 'api/v1/webhook' } },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      const res = validateWorkflow(wf);
      expect(res.warnings.some(w => w.code === 'V-TRG-004')).toBe(true);
    });

    it('flags empty steps list and malformed step items (V-TOP-005, V-STP-000, V-STP-001)', () => {
      // 1. Empty steps array
      const emptySteps: Partial<Workflow> = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [],
      };
      expect(validateWorkflow(emptySteps).errors.some(e => e.code === 'V-TOP-005')).toBe(true);

      // 2. Non-object step element
      const badStepItem: any = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [null, 'not-an-object', { id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(badStepItem).errors.some(e => e.code === 'V-STP-000')).toBe(true);

      // 3. Step missing ID
      const missingStepId: any = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(missingStepId).errors.some(e => e.code === 'V-STP-001')).toBe(true);

      // 4. Step ID with invalid characters
      const invalidStepId: any = {
        id: 'valid-id',
        name: 'Valid Name',
        trigger: { type: 'manual', config: { initial_step: 's1 space' } },
        steps: [{ id: 's1 space', action: 'logger.info', params: { message: 'hi' } }],
      };
      expect(validateWorkflow(invalidStepId).errors.some(e => e.code === 'V-STP-001')).toBe(true);
    });

    it('detects duplicate step IDs (V-STP-002)', () => {
      const dupWf: Partial<Workflow> = {
        id: 'dup-wf',
        name: 'Duplicate Test',
        trigger: { type: 'manual', config: { initial_step: 'step1' } },
        steps: [
          { id: 'step1', action: 'logger.info', params: { message: 'first' } },
          { id: 'step2', action: 'logger.info', params: { message: 'middle' } },
          { id: 'step1', action: 'logger.info', params: { message: 'duplicate' } },
        ],
      };
      const res = validateWorkflow(dupWf);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.code === 'V-STP-002')).toBe(true);
    });

    it('validates connector action syntax and required parameters (V-STP-003, V-STP-004, V-STP-005)', () => {
      // 1. Missing action or action without dot
      const badActionSyntax: Partial<Workflow> = {
        id: 'action-wf',
        name: 'Action Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'invalidActionWithoutDot', params: {} }],
      };
      expect(validateWorkflow(badActionSyntax).errors.some(e => e.code === 'V-STP-003')).toBe(true);

      // 2. Unrecognized connector prefix (warning)
      const unknownPrefix: Partial<Workflow> = {
        id: 'action-wf',
        name: 'Action Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'customconnector.doAction', params: {} }],
      };
      expect(validateWorkflow(unknownPrefix).warnings.some(w => w.code === 'V-STP-004')).toBe(true);

      // 3. Unknown action on standard connector (warning)
      const unknownAction: Partial<Workflow> = {
        id: 'action-wf',
        name: 'Action Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'http.unknown_method', params: {} }],
      };
      expect(validateWorkflow(unknownAction).warnings.some(w => w.code === 'V-STP-004')).toBe(true);

      // 4. Missing required parameter for catalog action (error) - e.g. http.get requires 'url'
      const missingParam: Partial<Workflow> = {
        id: 'action-wf',
        name: 'Action Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'http.get', params: {} }], // missing 'url'
      };
      expect(validateWorkflow(missingParam).errors.some(e => e.code === 'V-STP-005')).toBe(true);

      // 5. Missing required parameter for slack.sendMessage (requires 'channel' and 'text')
      const missingSlackParam: Partial<Workflow> = {
        id: 'action-wf',
        name: 'Action Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [{ id: 's1', action: 'slack.sendMessage', params: { channel: '#general' } }], // missing 'text'
      };
      expect(validateWorkflow(missingSlackParam).errors.some(e => e.code === 'V-STP-005')).toBe(true);
    });

    it('enforces retry bounds [0..10] and timeout bounds [0..3600] (V-STP-006, V-STP-007)', () => {
      const testBounds = (retries?: any, timeout?: any, expectRetryErr = false, expectTimeoutErr = false) => {
        const wf: Partial<Workflow> = {
          id: 'bounds-wf',
          name: 'Bounds Test',
          trigger: { type: 'manual', config: { initial_step: 's1' } },
          steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' }, retries, timeout }],
        };
        const res = validateWorkflow(wf);
        expect(res.errors.some(e => e.code === 'V-STP-006')).toBe(expectRetryErr);
        expect(res.errors.some(e => e.code === 'V-STP-007')).toBe(expectTimeoutErr);
      };

      // Valid bounds
      testBounds(0, 0, false, false);
      testBounds(5, 60, false, false);
      testBounds(10, 3600, false, false);

      // Invalid retries
      testBounds(-1, 60, true, false);
      testBounds(11, 60, true, false);
      testBounds(2.5, 60, true, false); // float
      testBounds('5' as any, 60, true, false); // string

      // Invalid timeout
      testBounds(3, -1, false, true);
      testBounds(3, 3601, false, true);
      testBounds(3, 10.5, false, true); // float
      testBounds(3, '60' as any, false, true); // string
    });

    it('detects dangling references in next_steps (V-DAG-001)', () => {
      const danglingWf: Partial<Workflow> = {
        id: 'dangling-wf',
        name: 'Dangling Test',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [
          {
            id: 's1',
            action: 'logger.info',
            params: { message: 'hi' },
            next_steps: [{ step_id: 'non_existent_s2' }],
          },
        ],
      };
      const res = validateWorkflow(danglingWf);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.code === 'V-DAG-001' && e.message.includes('non_existent_s2'))).toBe(true);
    });

    it('detects orphan / unreachable steps from initial_step (V-DAG-002)', () => {
      const orphanWf: Partial<Workflow> = {
        id: 'orphan-wf',
        name: 'Orphan Test',
        trigger: { type: 'manual', config: { initial_step: 'root' } },
        steps: [
          { id: 'root', action: 'logger.info', params: { message: 'root' } },
          { id: 'orphan1', action: 'logger.info', params: { message: 'orphan' } },
          { id: 'orphan2', action: 'logger.info', params: { message: 'orphan' }, next_steps: [{ step_id: 'orphan1' }] },
        ],
      };
      const res = validateWorkflow(orphanWf);
      expect(res.unreachableStepIds.has('orphan1')).toBe(true);
      expect(res.unreachableStepIds.has('orphan2')).toBe(true);
      expect(res.reachableStepIds.has('root')).toBe(true);
      expect(res.warnings.filter(w => w.code === 'V-DAG-002')).toHaveLength(2);
    });

    it('detects simple cycles, multi-node cycles, and disconnected cycles (V-DAG-003)', () => {
      // 1. Self cycle: A -> A
      const selfLoop: Partial<Workflow> = {
        id: 'self-loop',
        name: 'Self Loop',
        trigger: { type: 'manual', config: { initial_step: 'A' } },
        steps: [{ id: 'A', action: 'logger.info', params: { message: 'A' }, next_steps: [{ step_id: 'A' }] }],
      };
      expect(validateWorkflow(selfLoop).warnings.some(w => w.code === 'V-DAG-003')).toBe(true);

      // 2. 2-node cycle: A -> B -> A
      const twoNodeCycle: Partial<Workflow> = {
        id: 'cycle-2',
        name: '2 Node Cycle',
        trigger: { type: 'manual', config: { initial_step: 'A' } },
        steps: [
          { id: 'A', action: 'logger.info', params: { message: 'A' }, next_steps: [{ step_id: 'B' }] },
          { id: 'B', action: 'logger.info', params: { message: 'B' }, next_steps: [{ step_id: 'A' }] },
        ],
      };
      expect(validateWorkflow(twoNodeCycle).warnings.some(w => w.code === 'V-DAG-003')).toBe(true);

      // 3. 3-node cycle: A -> B -> C -> A
      const threeNodeCycle: Partial<Workflow> = {
        id: 'cycle-3',
        name: '3 Node Cycle',
        trigger: { type: 'manual', config: { initial_step: 'A' } },
        steps: [
          { id: 'A', action: 'logger.info', params: { message: 'A' }, next_steps: [{ step_id: 'B' }] },
          { id: 'B', action: 'logger.info', params: { message: 'B' }, next_steps: [{ step_id: 'C' }] },
          { id: 'C', action: 'logger.info', params: { message: 'C' }, next_steps: [{ step_id: 'A' }] },
        ],
      };
      expect(validateWorkflow(threeNodeCycle).warnings.some(w => w.code === 'V-DAG-003')).toBe(true);

      // 4. Disconnected cycle: Initial step A -> B, but orphan C <-> D forms a cycle
      const disconnectedCycle: Partial<Workflow> = {
        id: 'cycle-disc',
        name: 'Disconnected Cycle',
        trigger: { type: 'manual', config: { initial_step: 'A' } },
        steps: [
          { id: 'A', action: 'logger.info', params: { message: 'A' }, next_steps: [{ step_id: 'B' }] },
          { id: 'B', action: 'logger.info', params: { message: 'B' } },
          { id: 'C', action: 'logger.info', params: { message: 'C' }, next_steps: [{ step_id: 'D' }] },
          { id: 'D', action: 'logger.info', params: { message: 'D' }, next_steps: [{ step_id: 'C' }] },
        ],
      };
      const discRes = validateWorkflow(disconnectedCycle);
      expect(discRes.warnings.some(w => w.code === 'V-DAG-003')).toBe(true);
      expect(discRes.unreachableStepIds.has('C')).toBe(true);
      expect(discRes.unreachableStepIds.has('D')).toBe(true);
    });

    it('does NOT falsely flag cycles in valid diamond / fan-in DAG topologies', () => {
      // Diamond: A -> B, A -> C; B -> D, C -> D
      const diamondWf: Partial<Workflow> = {
        id: 'diamond-wf',
        name: 'Diamond DAG',
        trigger: { type: 'manual', config: { initial_step: 'A' } },
        steps: [
          { id: 'A', action: 'logger.info', params: { message: 'A' }, next_steps: [{ step_id: 'B' }, { step_id: 'C' }] },
          { id: 'B', action: 'logger.info', params: { message: 'B' }, next_steps: [{ step_id: 'D' }] },
          { id: 'C', action: 'logger.info', params: { message: 'C' }, next_steps: [{ step_id: 'D' }] },
          { id: 'D', action: 'logger.info', params: { message: 'D' } },
        ],
      };
      const res = validateWorkflow(diamondWf);
      expect(res.isValid).toBe(true);
      expect(res.cycles).toHaveLength(0);
      expect(res.warnings.filter(w => w.code === 'V-DAG-003')).toHaveLength(0);
    });

    it('scales up and validates a large 50-step linear DAG within milliseconds', () => {
      const stepCount = 50;
      const steps: any[] = [];
      for (let i = 0; i < stepCount; i++) {
        steps.push({
          id: `step_${i}`,
          action: 'logger.info',
          params: { message: `Step ${i}` },
          next_steps: i < stepCount - 1 ? [{ step_id: `step_${i + 1}` }] : [],
        });
      }

      const largeWf: Partial<Workflow> = {
        id: 'large-50-step-wf',
        name: 'Large 50 Step Workflow',
        trigger: { type: 'manual', config: { initial_step: 'step_0' } },
        steps,
      };

      const start = performance.now();
      const res = validateWorkflow(largeWf);
      const duration = performance.now() - start;

      expect(res.isValid).toBe(true);
      expect(res.reachableStepIds.size).toBe(50);
      expect(res.unreachableStepIds.size).toBe(0);
      expect(duration).toBeLessThan(100); // Should execute under 100ms
    });

    it('maps diagnostics to exact line and column ranges via YamlService CST', () => {
      const rawYaml = `id: test-wf
name: Test Workflow
status: active
trigger:
  type: manual
  config:
    initial_step: missing_init_step
steps:
  - id: step1
    action: logger.info
    params:
      message: hello
`;
      const parseRes = YamlService.parse(rawYaml);
      const valRes = validateWorkflow(parseRes.data, rawYaml, parseRes.cst);
      expect(valRes.isValid).toBe(false);

      const initErr = valRes.errors.find(e => e.code === 'V-TRG-002');
      expect(initErr).toBeDefined();
      expect(initErr?.range).toBeDefined();
      expect(initErr?.range?.startLine).toBeGreaterThanOrEqual(6);
    });
  });

  // =========================================================================
  // FOCUS AREA 2: Go-Template Resolver Adversarial Testing
  // =========================================================================
  describe('2. Go-Template Expression Resolver', () => {
    const engine = new GoTemplateEngine();

    const complexContext: ExecutionContext = {
      trigger: {
        payload: {
          commit: {
            id: 'fa12bc456e789',
            author: { name: 'Dev', email: 'dev@example.com' },
          },
          numbers: [10, 20, 30],
          nested: {
            deep: {
              target: 'target-value',
            },
          },
        },
        headers: {
          'X-Correlation-Id': 'corr-9988',
          'Accept-Language': ['en-US', 'fr-FR'],
        },
        query: {
          page: 2,
          filter: 'active',
        },
      },
      steps: {
        s1: {
          output: {
            status: '200',
            status_code: 200,
            body: { result: 'ok', items: ['apple', 'banana'] },
          },
        },
        s2: {
          output: null,
        },
      },
      vars: {
        env: 'staging',
        is_authenticated: true,
        count: 42,
        config: { timeout_sec: 15 },
      },
      parent: [{ step: 's1', output: 'parent-data' }],
    };

    it('resolves complex deep paths with aliases (.inputs, .TriggerData, .variables)', () => {
      // .inputs alias
      expect(engine.processStringTemplate('Commit: {{ .inputs.payload.commit.id }}', complexContext))
        .toBe('Commit: fa12bc456e789');

      // .TriggerData alias
      expect(engine.processStringTemplate('Header: {{ .TriggerData.headers.X-Correlation-Id }}', complexContext))
        .toBe('Header: corr-9988');

      // .variables alias
      expect(engine.processStringTemplate('Env: {{ .variables.env }}', complexContext))
        .toBe('Env: staging');

      // Deep step output
      expect(engine.processStringTemplate('Result: {{ .steps.s1.output.body.result }}', complexContext))
        .toBe('Result: ok');
    });

    it('safely handles nonexistent properties without throwing errors', () => {
      expect(engine.processStringTemplate('{{ .inputs.payload.nonexistent.deep.path }}', complexContext))
        .toBe('');
      expect(engine.processStringTemplate('{{ .steps.s2.output.field }}', complexContext))
        .toBe('');
      expect(engine.processStringTemplate('{{ .steps.nonexistent_step.output }}', complexContext))
        .toBe('');
      expect(engine.processStringTemplate('{{ .vars.missing_var }}', complexContext))
        .toBe('');
    });

    it('evaluates helper functions (toJson, toPrettyJson, first, index, hasPrefix)', () => {
      // toJson
      const jsonRes = engine.processStringTemplate('{{ toJson .vars.config }}', complexContext);
      expect(jsonRes).toEqual({ timeout_sec: 15 });

      // toJson on primitive/array
      const jsonArrRes = engine.processStringTemplate('{{ toJson .trigger.payload.numbers }}', complexContext);
      expect(jsonArrRes).toEqual([10, 20, 30]);

      // first
      expect(engine.processStringTemplate('{{ first .trigger.payload.numbers }}', complexContext))
        .toBe('10');
      expect(engine.processStringTemplate('{{ first .trigger.headers.Accept-Language }}', complexContext))
        .toBe('en-US');

      // index
      expect(engine.processStringTemplate('{{ index .trigger.headers "X-Correlation-Id" }}', complexContext))
        .toBe('corr-9988');
      expect(engine.processStringTemplate('{{ index .trigger.payload.numbers 1 }}', complexContext))
        .toBe('20');

      // hasPrefix
      expect(engine.processStringTemplate('{{ hasPrefix .steps.s1.output.status "2" }}', complexContext))
        .toBe('true');
      expect(engine.processStringTemplate('{{ hasPrefix .steps.s1.output.status "5" }}', complexContext))
        .toBe('false');
    });

    it('evaluates pipeline chains with multiple pipe operations', () => {
      // .trigger.headers.Accept-Language | first
      expect(engine.processStringTemplate('{{ .trigger.headers.Accept-Language | first }}', complexContext))
        .toBe('en-US');

      // .vars.config | toJson
      const pipedJson = engine.processStringTemplate('{{ .vars.config | toJson }}', complexContext);
      expect(pipedJson).toEqual({ timeout_sec: 15 });

      // index pipeline
      expect(engine.processStringTemplate('{{ index .trigger.headers "Accept-Language" | first }}', complexContext))
        .toBe('en-US');
    });

    it('evaluates control blocks (if / else / end)', () => {
      const ifTrue = engine.processStringTemplate(
        '{{ if .vars.is_authenticated }}AUTH_SUCCESS{{ else }}AUTH_REQUIRED{{ end }}',
        complexContext
      );
      expect(ifTrue).toBe('AUTH_SUCCESS');

      const ifFalse = engine.processStringTemplate(
        '{{ if .vars.nonexistent }}PRESENT{{ else }}MISSING{{ end }}',
        complexContext
      );
      expect(ifFalse).toBe('MISSING');
    });

    it('handles multiple interpolations in a single string', () => {
      const urlTemplate = 'https://api.github.com/repos/{{ .trigger.payload.commit.author.name }}/project/pulls?page={{ .trigger.query.page }}&env={{ .vars.env }}';
      const rendered = engine.processStringTemplate(urlTemplate, complexContext);
      expect(rendered).toBe('https://api.github.com/repos/Dev/project/pulls?page=2&env=staging');
    });

    it('handles malformed templates and unclosed tags gracefully without crashing', () => {
      // Unclosed tag
      expect(() => engine.processStringTemplate('Broken: {{ .vars.env', complexContext)).not.toThrow();
      expect(engine.processStringTemplate('Broken: {{ .vars.env', complexContext)).toBe('Broken: {{ .vars.env');

      // Empty expression
      expect(() => engine.processStringTemplate('Empty: {{ }}', complexContext)).not.toThrow();

      // Unknown function fallback
      expect(() => engine.processStringTemplate('{{ unknownFunc .vars.env }}', complexContext)).not.toThrow();
    });

    it('auto-deserializes valid JSON output structures in resolveValue()', () => {
      const template = '{\n  "status": {{ .steps.s1.output.status_code }},\n  "env": "{{ .vars.env }}"\n}';
      const res = engine.processStringTemplate(template, complexContext);
      expect(typeof res).toBe('object');
      expect(res).toEqual({ status: 200, env: 'staging' });
    });

    it('recursively resolves complex nested arrays and maps in resolveParams()', () => {
      const params = {
        headers: {
          Authorization: 'Bearer {{ .vars.env }}',
          'X-Page': '{{ .trigger.query.page }}',
        },
        payload: {
          user: '{{ .trigger.payload.commit.author.name }}',
          meta: ['item-{{ .vars.count }}', 'commit-{{ .trigger.payload.commit.id }}'],
        },
      };

      const resolved = resolveParams(params, complexContext);
      expect(resolved).toEqual({
        headers: {
          Authorization: 'Bearer staging',
          'X-Page': '2',
        },
        payload: {
          user: 'Dev',
          meta: ['item-42', 'commit-fa12bc456e789'],
        },
      });
    });
  });

  // =========================================================================
  // FOCUS AREA 3: Condition Evaluator Adversarial Testing
  // =========================================================================
  describe('3. Condition Expression Evaluator', () => {
    const evaluator = new ConditionEvaluator();

    const ctx: ExecutionContext = {
      trigger: {
        payload: {
          branch: 'feature/login-page',
          tag: 'v1.2.0',
          pr_id: 104,
          score: 87.5,
          is_draft: false,
          user: 'alice',
          empty_str: '',
          count: -5,
        },
      },
      steps: {
        fetch_api: {
          output: {
            status_code: 200,
            status_str: '200',
            error_message: null,
          },
        },
        failed_step: {
          output: {
            status_code: 503,
            error_message: 'Service Unavailable',
          },
        },
      },
      vars: {
        environment: 'production',
        max_retries: 3,
        flag_enabled: true,
      },
      parent: [],
    };

    it('evaluates boolean literals, empty strings, and null inputs', () => {
      expect(evaluator.evaluate('', ctx).result).toBe(true);
      expect(evaluator.evaluate('   ', ctx).result).toBe(true);
      expect(evaluator.evaluate(undefined, ctx).result).toBe(true);
      expect(evaluator.evaluate('true', ctx).result).toBe(true);
      expect(evaluator.evaluate('false', ctx).result).toBe(false);
      expect(evaluator.evaluate('1', ctx).result).toBe(true);
      expect(evaluator.evaluate('0', ctx).result).toBe(false);
    });

    it('evaluates equality and inequality (==, !=) with type resilience', () => {
      // String equality
      expect(evaluator.evaluate('{{ .vars.environment }} == "production"', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .vars.environment }} == "staging"', ctx).result).toBe(false);

      // Number equality
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_code }} == 200', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_code }} == 404', ctx).result).toBe(false);

      // String vs Number equality
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_str }} == 200', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_code }} == "200"', ctx).result).toBe(true);

      // Inequality
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_code }} != 500', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .steps.fetch_api.output.status_code }} != 200', ctx).result).toBe(false);

      // Empty string comparison
      expect(evaluator.evaluate('{{ .trigger.payload.empty_str }} == ""', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .trigger.payload.user }} != ""', ctx).result).toBe(true);
    });

    it('evaluates relational comparison operators (<, <=, >, >=) with floats and negative numbers', () => {
      // Greater than
      expect(evaluator.evaluate('{{ .trigger.payload.pr_id }} > 100', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .trigger.payload.pr_id }} > 200', ctx).result).toBe(false);

      // Greater than or equal
      expect(evaluator.evaluate('{{ .trigger.payload.pr_id }} >= 104', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .trigger.payload.score }} >= 87.5', ctx).result).toBe(true);

      // Less than
      expect(evaluator.evaluate('{{ .vars.max_retries }} < 5', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .vars.max_retries }} < 3', ctx).result).toBe(false);

      // Less than or equal
      expect(evaluator.evaluate('{{ .vars.max_retries }} <= 3', ctx).result).toBe(true);

      // Negative number comparison
      expect(evaluator.evaluate('{{ .trigger.payload.count }} < 0', ctx).result).toBe(true);
      expect(evaluator.evaluate('{{ .trigger.payload.count }} > -10', ctx).result).toBe(true);
    });

    it('evaluates hasPrefix in both prefix and functional forms', () => {
      // Prefix form
      expect(evaluator.evaluate('hasPrefix {{ .trigger.payload.branch }} "feature/"', ctx).result).toBe(true);
      expect(evaluator.evaluate('hasPrefix {{ .trigger.payload.branch }} "hotfix/"', ctx).result).toBe(false);

      // Functional form
      expect(evaluator.evaluate('hasPrefix(trigger.payload.branch, "feature/")', ctx).result).toBe(true);
      expect(evaluator.evaluate('hasPrefix(trigger.payload.tag, "v1.")', ctx).result).toBe(true);
    });

    it('evaluates logical operators (&&, ||, !)', () => {
      // Logical AND (&&)
      expect(
        evaluator.evaluate(
          '{{ .vars.environment }} == "production" && {{ .steps.fetch_api.output.status_code }} == 200',
          ctx
        ).result
      ).toBe(true);

      expect(
        evaluator.evaluate(
          '{{ .vars.environment }} == "production" && {{ .steps.fetch_api.output.status_code }} == 500',
          ctx
        ).result
      ).toBe(false);

      // Logical OR (||)
      expect(
        evaluator.evaluate(
          '{{ .steps.fetch_api.output.status_code }} == 500 || {{ .steps.fetch_api.output.status_code }} == 200',
          ctx
        ).result
      ).toBe(true);

      expect(
        evaluator.evaluate(
          '{{ .steps.fetch_api.output.status_code }} == 400 || {{ .steps.fetch_api.output.status_code }} == 500',
          ctx
        ).result
      ).toBe(false);

      // Logical NOT (!)
      expect(
        evaluator.evaluate('!hasPrefix(trigger.payload.branch, "hotfix/")', ctx).result
      ).toBe(true);
    });

    it('handles missing/undefined properties gracefully without throwing', () => {
      const res1 = evaluator.evaluate('{{ .trigger.payload.nonexistent_key }} == ""', ctx);
      expect(res1.result).toBe(true);

      const res2 = evaluator.evaluate('{{ .trigger.payload.nonexistent_key }} == null', ctx);
      expect(res2.result).toBe(true);
    });
  });

  // =========================================================================
  // FOCUS AREA 4: Simulation Engine Adversarial Testing
  // =========================================================================
  describe('4. Simulation Engine', () => {
    const engine = new DryRunSimulationEngine();

    it('handles multi-branch fan-out where multiple branch conditions evaluate to true', () => {
      const fanOutWf: Workflow = {
        id: 'fan-out-wf',
        name: 'Fan Out Workflow',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'root' },
        },
        steps: [
          {
            id: 'root',
            action: 'logger.info',
            params: { message: 'Root step' },
            next_steps: [
              { step_id: 'branch_a', condition: 'true' },
              { step_id: 'branch_b', condition: 'true' },
            ],
          },
          {
            id: 'branch_a',
            action: 'logger.info',
            params: { message: 'Branch A' },
          },
          {
            id: 'branch_b',
            action: 'logger.info',
            params: { message: 'Branch B' },
          },
        ],
      };

      const result = engine.simulate({
        workflow: fanOutWf,
        triggerInput: { payload: {} },
      });

      expect(result.status).toBe('completed');
      expect(result.executedStepIds).toContain('root');
      expect(result.executedStepIds).toContain('branch_a');
      expect(result.executedStepIds).toContain('branch_b');
      expect(result.activeEdgeIds).toContain('root->branch_a');
      expect(result.activeEdgeIds).toContain('root->branch_b');
      expect(result.bypassedStepIds).toHaveLength(0);
    });

    it('handles dead-end branches when all conditions evaluate to false', () => {
      const deadEndWf: Workflow = {
        id: 'dead-end-wf',
        name: 'Dead End Workflow',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'root' },
        },
        steps: [
          {
            id: 'root',
            action: 'logger.info',
            params: { message: 'Root' },
            next_steps: [
              { step_id: 'branch_a', condition: 'false' },
              { step_id: 'branch_b', condition: 'false' },
            ],
          },
          { id: 'branch_a', action: 'logger.info', params: { message: 'A' } },
          { id: 'branch_b', action: 'logger.info', params: { message: 'B' } },
        ],
      };

      const result = engine.simulate({
        workflow: deadEndWf,
        triggerInput: { payload: {} },
      });

      expect(result.status).toBe('completed');
      expect(result.executedStepIds).toEqual(['root']);
      expect(result.bypassedStepIds).toContain('branch_a');
      expect(result.bypassedStepIds).toContain('branch_b');
      expect(result.bypassedEdgeIds).toContain('root->branch_a');
      expect(result.bypassedEdgeIds).toContain('root->branch_b');
    });

    it('safely breaks infinite cycles and returns cycle_terminated status', () => {
      const cycleWf: Workflow = {
        id: 'cycle-wf',
        name: 'Cycle Workflow',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'step1' },
        },
        steps: [
          {
            id: 'step1',
            action: 'logger.info',
            params: { message: 'Step 1' },
            next_steps: [{ step_id: 'step2', condition: 'true' }],
          },
          {
            id: 'step2',
            action: 'logger.info',
            params: { message: 'Step 2' },
            next_steps: [{ step_id: 'step1', condition: 'true' }],
          },
        ],
      };

      const result = engine.simulate({
        workflow: cycleWf,
        triggerInput: { payload: {} },
        maxExecutionSteps: 20,
      });

      expect(result.status).toBe('cycle_terminated');
      expect(result.success).toBe(false);
      expect(result.executionLogs?.length).toBeGreaterThan(15);
    });

    it('passes outputs from upstream steps to downstream step parameters across multiple steps', () => {
      const multiStepPassingWf: Workflow = {
        id: 'multi-step-wf',
        name: 'Multi Step Workflow',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'step_1' },
        },
        steps: [
          {
            id: 'step_1',
            action: 'gitlab.get_user',
            params: { username: 'alice' },
            next_steps: [{ step_id: 'step_2' }],
          },
          {
            id: 'step_2',
            action: 'internal.parseJson',
            params: { data: '{"user_id": {{ .steps.step_1.output.id }}, "role": "admin"}' },
            next_steps: [{ step_id: 'step_3' }],
          },
          {
            id: 'step_3',
            action: 'logger.info',
            params: {
              message: 'Role: {{ .steps.step_2.output.role }} for User: {{ .steps.step_2.output.user_id }}',
            },
          },
        ],
      };

      const result = engine.simulate({
        workflow: multiStepPassingWf,
        triggerInput: { payload: {} },
      });

      expect(result.status).toBe('completed');
      expect(result.executedStepIds).toEqual(['step_1', 'step_2', 'step_3']);

      const step3Log = result.executionLogs?.find(l => l.stepId === 'step_3');
      expect(step3Log).toBeDefined();
      expect(step3Log?.resolvedParams.message).toBe('Role: admin for User: 42');
    });

    it('supports user step mock overrides', () => {
      const overrideWf: Workflow = {
        id: 'override-wf',
        name: 'Override Workflow',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'step1' },
        },
        steps: [
          {
            id: 'step1',
            action: 'gitlab.get_user',
            params: { username: 'alice' },
            next_steps: [{ step_id: 'step2' }],
          },
          {
            id: 'step2',
            action: 'logger.info',
            params: {
              message: 'Mocked username: {{ .steps.step1.output.username }}',
            },
          },
        ],
      };

      const result = engine.simulate({
        workflow: overrideWf,
        triggerInput: { payload: {} },
        stepMockOverrides: {
          step1: { id: 999, username: 'custom_mock_user' },
        },
      });

      expect(result.status).toBe('completed');
      const step2Log = result.executionLogs?.find(l => l.stepId === 'step2');
      expect(step2Log?.resolvedParams.message).toBe('Mocked username: custom_mock_user');
    });

    it('handles diamond DAG simulation with convergence', () => {
      const diamondWf: Workflow = {
        id: 'diamond-sim',
        name: 'Diamond Simulation',
        status: 'active',
        trigger: { type: 'manual', config: { initial_step: 'root' } },
        steps: [
          {
            id: 'root',
            action: 'logger.info',
            params: { message: 'Root' },
            next_steps: [
              { step_id: 'branch_a', condition: 'true' },
              { step_id: 'branch_b', condition: 'true' },
            ],
          },
          {
            id: 'branch_a',
            action: 'logger.info',
            params: { message: 'A' },
            next_steps: [{ step_id: 'join_step' }],
          },
          {
            id: 'branch_b',
            action: 'logger.info',
            params: { message: 'B' },
            next_steps: [{ step_id: 'join_step' }],
          },
          {
            id: 'join_step',
            action: 'logger.info',
            params: { message: 'Join' },
          },
        ],
      };

      const result = engine.simulate({
        workflow: diamondWf,
        triggerInput: { payload: {} },
      });

      expect(result.status).toBe('completed');
      expect(result.executedStepIds).toContain('root');
      expect(result.executedStepIds).toContain('branch_a');
      expect(result.executedStepIds).toContain('branch_b');
      expect(result.executedStepIds).toContain('join_step');
    });

    it('gracefully handles missing or non-existent initial_step during simulation', () => {
      const invalidInitWf: Workflow = {
        id: 'bad-init-wf',
        name: 'Bad Init',
        status: 'active',
        trigger: {
          type: 'manual',
          config: { initial_step: 'non_existent' },
        },
        steps: [{ id: 's1', action: 'logger.info', params: { message: 'hi' } }],
      };

      const result = engine.simulate({
        workflow: invalidInitWf,
        triggerInput: { payload: {} },
      });

      expect(result.status).toBe('failed');
      expect(result.success).toBe(false);
      expect(result.executedStepIds).toHaveLength(0);
    });
  });

  // =========================================================================
  // FOCUS AREA 5: DAG Graph Builder & Visualization Mapping
  // =========================================================================
  describe('5. DAG Graph Builder & Auto-Layout', () => {
    it('handles empty and null workflow definitions', () => {
      expect(buildWorkflowGraph(null)).toEqual({ nodes: [], edges: [] });
      expect(buildWorkflowGraph(undefined)).toEqual({ nodes: [], edges: [] });
      expect(buildWorkflowGraph({ id: 'empty', name: 'Empty', steps: [] } as any)).toEqual({ nodes: [], edges: [] });
    });

    it('generates DAG nodes and edges with connector types and conditions', () => {
      const wf: Workflow = {
        id: 'dag-wf',
        name: 'DAG Test',
        status: 'active',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [
          {
            id: 's1',
            action: 'http.get',
            params: { url: 'https://example.com' },
            next_steps: [{ step_id: 's2', condition: '{{ .steps.s1.output.status }} == 200' }],
          },
          {
            id: 's2',
            action: 'logger.info',
            params: { message: 'success' },
          },
        ],
      };

      const graph = buildWorkflowGraph(wf, 'TB');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);

      expect(graph.nodes[0].data.connectorType).toBe('http');
      expect(graph.nodes[1].data.connectorType).toBe('logger');
      expect(graph.edges[0].label).toBe('{{ .steps.s1.output.status }} == 200');
    });

    it('decorates nodes and edges with simulation results (active vs bypassed)', () => {
      const wf: Workflow = {
        id: 'dag-wf',
        name: 'DAG Test',
        status: 'active',
        trigger: { type: 'manual', config: { initial_step: 's1' } },
        steps: [
          {
            id: 's1',
            action: 'logger.info',
            params: { message: 'Root' },
            next_steps: [
              { step_id: 's_active', condition: 'true' },
              { step_id: 's_bypassed', condition: 'false' },
            ],
          },
          { id: 's_active', action: 'logger.info', params: { message: 'Active' } },
          { id: 's_bypassed', action: 'logger.info', params: { message: 'Bypassed' } },
        ],
      };

      const simResult = simulateWorkflow(wf, { payload: {} });
      const graph = buildWorkflowGraph(wf, 'TB', simResult);

      const activeNode = graph.nodes.find(n => n.id === 's_active');
      const bypassedNode = graph.nodes.find(n => n.id === 's_bypassed');

      expect(activeNode?.data.executionStatus).toBe('completed');
      expect(bypassedNode?.data.executionStatus).toBe('bypassed');

      const activeEdge = graph.edges.find(e => e.id === 's1->s_active');
      const bypassedEdge = graph.edges.find(e => e.id === 's1->s_bypassed');

      expect(activeEdge?.data?.isActive).toBe(true);
      expect(bypassedEdge?.data?.isBypassed).toBe(true);
    });
  });
});
