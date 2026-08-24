import { SimulationOptions, SimulationResult, StepTimelineEntry, TriggerData } from '../types/engine';
import { ExecutionContext, Step, StepExecution, TransitionExecution, Workflow } from '../types/workflow';
import { ConditionEvaluator } from './condition';
import { GoTemplateEngine } from './template';

/**
 * Executes or mocks a connector action
 */
export function executeMockAction(
  action: string,
  resolvedParams: Record<string, any>,
  userMockOverride?: any,
  context?: ExecutionContext
): { output: any; error?: string } {
  if (userMockOverride !== undefined) {
    return { output: userMockOverride };
  }

  const [connector, actionName] = (action || '').split('.');

  switch (connector) {
    case 'internal': {
      switch (actionName) {
        case 'parseJson': {
          try {
            const raw = resolvedParams.data;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return { output: parsed };
          } catch (e: any) {
            return { output: null, error: `parseJson error: ${e.message}` };
          }
        }
        case 'getField': {
          const data = resolvedParams.data;
          const field = resolvedParams.field;
          if (data && typeof data === 'object') {
            return { output: data[field] };
          }
          return { output: null, error: `getField: field "${field}" not found` };
        }
        case 'contains': {
          let list = resolvedParams.list;
          if (typeof list === 'string') {
            try { list = JSON.parse(list); } catch { list = [list]; }
          }
          const item = resolvedParams.item;
          const found = Array.isArray(list) && list.includes(item);
          return { output: { found } };
        }
        case 'startsWith': {
          let list = resolvedParams.list;
          if (typeof list === 'string') {
            try { list = JSON.parse(list); } catch { list = [list]; }
          }
          const item = String(resolvedParams.item || '');
          const found = Array.isArray(list) && list.some(prefix => item.startsWith(String(prefix)));
          return { output: { found } };
        }
        case 'regexMatch': {
          try {
            const re = new RegExp(resolvedParams.regex);
            const match = re.test(String(resolvedParams.item || ''));
            return { output: { match } };
          } catch (e: any) {
            return { output: { match: false }, error: `regex error: ${e.message}` };
          }
        }
      }
      break;
    }

    case 'logger': {
      return {
        output: {
          timestamp: new Date().toISOString(),
          level: (actionName || 'info').toUpperCase(),
          message: resolvedParams.message || '',
          fields: resolvedParams.fields || {},
        },
      };
    }

    case 'http': {
      return {
        output: {
          status_code: 200,
          body: JSON.stringify({ message: `Mock ${actionName ? actionName.toUpperCase() : 'HTTP'} Success`, url: resolvedParams.url, body: resolvedParams.body }),
        },
      };
    }

    case 'gitlab': {
      switch (actionName) {
        case 'get_project': {
          if (context?.trigger?.payload?.project) {
            return { output: context.trigger.payload.project };
          }
          return {
            output: {
              id: resolvedParams.project_id || 101,
              name: 'sample-project',
              name_with_namespace: 'group/sample-project',
              web_url: 'https://gitlab.com/group/sample-project',
              default_branch: 'main',
            },
          };
        }
        case 'create_merge_request':
          return {
            output: {
              id: 201,
              iid: 1,
              title: resolvedParams.title || 'New Merge Request',
              web_url: 'https://gitlab.com/group/sample-project/-/merge_requests/1',
            },
          };
        case 'get_user':
          return {
            output: {
              id: 42,
              username: resolvedParams.username || 'developer',
              name: 'Sample Developer',
              state: 'active',
            },
          };
        case 'add_reviewer':
        case 'approve_mr':
          return { output: { status: 'success' } };
        case 'close_mr':
          return { output: { status: 'closed' } };
        case 'add_mr_note':
          return { output: { id: 501, body: resolvedParams.body } };
      }
      break;
    }

    case 'jira': {
      switch (actionName) {
        case 'transition_issue':
          return { output: { status: 'success' } };
        case 'search_issues':
          return {
            output: {
              total: 1,
              found: true,
              issues: [{ key: 'PROJ-101', fields: { summary: 'Sample Mock Issue' } }],
            },
          };
        case 'get_comments':
          return {
            output: {
              total: 2,
              comments: [
                {
                  id: '1001',
                  author_name: 'QA Lead',
                  author_email: 'qa-lead@company.com',
                  author_account_id: 'acc-qa-123',
                  created: '2026-08-24T10:00:00.000Z',
                  body_text: 'LGTM! Approved for release.',
                },
                {
                  id: '1002',
                  author_name: 'Lead Developer',
                  author_email: 'dev@company.com',
                  author_account_id: 'acc-dev-456',
                  created: '2026-08-24T09:00:00.000Z',
                  body_text: 'Ready for verification.',
                },
              ],
              all_authors: ['QA Lead', 'Lead Developer'],
              all_author_emails: ['qa-lead@company.com', 'dev@company.com'],
              all_author_account_ids: ['acc-qa-123', 'acc-dev-456'],
            },
          };
        case 'check_user_comment': {
          const target = String(resolvedParams.user || resolvedParams.email || resolvedParams.account_id || resolvedParams.display_name || '').toLowerCase();
          const mockComments = [
            {
              id: '1001',
              author_name: 'QA Lead',
              author_email: 'qa-lead@company.com',
              author_account_id: 'acc-qa-123',
              created: '2026-08-24T10:00:00.000Z',
              body_text: 'LGTM! Approved for release.',
            },
            {
              id: '1002',
              author_name: 'Lead Developer',
              author_email: 'dev@company.com',
              author_account_id: 'acc-dev-456',
              created: '2026-08-24T09:00:00.000Z',
              body_text: 'Ready for verification.',
            },
          ];

          const matched = mockComments.filter((c) => {
            if (!target) return true;
            return (
              c.author_email.toLowerCase() === target ||
              c.author_name.toLowerCase() === target ||
              c.author_account_id.toLowerCase() === target ||
              c.author_email.toLowerCase().includes(target) ||
              c.author_name.toLowerCase().includes(target)
            );
          });

          const commented = matched.length > 0;
          return {
            output: {
              commented,
              found: commented,
              match_count: matched.length,
              total_comments: mockComments.length,
              matched_comments: matched,
              latest_comment: matched[0] || null,
              all_authors: ['QA Lead', 'Lead Developer'],
              all_author_emails: ['qa-lead@company.com', 'dev@company.com'],
              all_author_account_ids: ['acc-qa-123', 'acc-dev-456'],
            },
          };
        }
      }
      break;
    }

    case 'slack': {
      return {
        output: {
          status: 'sent',
          channel: resolvedParams.channel || '#general',
        },
      };
    }
  }

  return { output: { status: 'success', action } };
}

/**
 * BFS Dry-Run Simulation Engine
 */
export class DryRunSimulationEngine {
  private templateEngine = new GoTemplateEngine();
  private conditionEvaluator = new ConditionEvaluator();

  public simulate(options: SimulationOptions): SimulationResult {
    const executionId = 'sim-' + Math.random().toString(36).substring(2, 9);
    const wf = options.workflow;
    const maxSteps = options.maxExecutionSteps || 500;

    const stepIdMap = new Map<string, Step>();
    for (const step of wf.steps || []) {
      if (step.id) stepIdMap.set(step.id, step);
    }

    const initialStep = wf.trigger?.config?.initial_step;
    if (!initialStep || !stepIdMap.has(initialStep)) {
      return this.createEmptyResult(executionId, 'failed', wf);
    }

    const rootContext: ExecutionContext = {
      trigger: {
        payload: options.triggerInput?.payload || {},
        headers: options.triggerInput?.headers || {},
        query: options.triggerInput?.query || {},
        time: options.triggerInput?.time || new Date().toISOString(),
        timezone: options.triggerInput?.timezone || 'UTC',
        type: options.triggerInput?.type || wf.trigger?.type,
      },
      steps: {},
      vars: { ...(wf.vars || {}), ...(options.initialVars || {}) },
      parent: [],
    };

    interface QueueState {
      stepId: string;
      context: ExecutionContext;
      parentStepId?: string;
    }

    const queue: QueueState[] = [{ stepId: initialStep, context: this.cloneContext(rootContext) }];
    const executedStepIdsSet = new Set<string>();
    const executedStepOrder: string[] = [];
    const activeEdgeIdsSet = new Set<string>();
    const bypassedEdgeIdsSet = new Set<string>();
    const stepOutputs: Record<string, any> = {};
    const executionLogs: StepExecution[] = [];
    const transitionLogs: TransitionExecution[] = [];
    const timeline: StepTimelineEntry[] = [];

    let totalStepsProcessed = 0;
    let terminatedDueToCycle = false;

    while (queue.length > 0) {
      if (totalStepsProcessed++ >= maxSteps) {
        terminatedDueToCycle = true;
        break;
      }

      const currentState = queue.shift()!;
      const step = stepIdMap.get(currentState.stepId);
      if (!step) continue;

      const currentCtx = currentState.context;

      // 1. Parameter interpolation
      const startTime = performance.now();
      let resolvedParams: Record<string, any> = {};
      let paramError: string | undefined;

      try {
        resolvedParams = this.templateEngine.resolveValue(step.params || {}, currentCtx);
      } catch (err: any) {
        paramError = err.message || 'Param resolution error';
      }

      // 2. Execute / Mock action
      const userMock = options.stepMockOverrides?.[step.id];
      const { output, error: execError } = executeMockAction(step.action, resolvedParams, userMock, currentCtx);
      const durationMs = Math.round(performance.now() - startTime);

      const status = (paramError || execError) ? 'failed' : 'success';

      executedStepIdsSet.add(step.id);
      if (!executedStepOrder.includes(step.id)) {
        executedStepOrder.push(step.id);
      }
      stepOutputs[step.id] = output;

      const logEntry: StepExecution = {
        stepId: step.id,
        action: step.action,
        status,
        startedAt: new Date().toISOString(),
        durationMs,
        resolvedParams,
        output,
        error: paramError || execError,
      };
      executionLogs.push(logEntry);

      timeline.push({
        stepId: step.id,
        action: step.action,
        status,
        startedAt: logEntry.startedAt,
        durationMs,
        resolvedParams,
        output,
        error: paramError || execError,
      });

      // 3. Isolated context update for child branches
      const nextContext = this.cloneContext(currentCtx);
      nextContext.steps[step.id] = { output };
      nextContext.parent = [output];

      // 4. Evaluate Next Steps
      for (const next of step.next_steps || []) {
        const edgeId = `${step.id}->${next.step_id}`;
        const { result: isConditionMet, error: condErr } = this.conditionEvaluator.evaluate(
          next.condition,
          nextContext
        );

        if (isConditionMet) {
          activeEdgeIdsSet.add(edgeId);
          bypassedEdgeIdsSet.delete(edgeId);

          transitionLogs.push({
            fromStepId: step.id,
            toStepId: next.step_id,
            condition: next.condition,
            evaluatedResult: true,
            status: 'active',
          });

          queue.push({
            stepId: next.step_id,
            context: this.cloneContext(nextContext),
            parentStepId: step.id,
          });
        } else {
          if (!activeEdgeIdsSet.has(edgeId)) {
            bypassedEdgeIdsSet.add(edgeId);
          }

          transitionLogs.push({
            fromStepId: step.id,
            toStepId: next.step_id,
            condition: next.condition,
            evaluatedResult: false,
            status: condErr ? 'error' : 'bypassed',
            error: condErr,
          });
        }
      }
    }

    // Compute bypassed and unreached steps
    const allStepIds = new Set((wf.steps || []).map(s => s.id));
    const bypassedStepIds: string[] = [];
    const unreachedStepIds: string[] = [];

    for (const stepId of allStepIds) {
      if (!executedStepIdsSet.has(stepId)) {
        const hasBypassedIncomingEdge = Array.from(bypassedEdgeIdsSet).some(e => e.endsWith(`->${stepId}`));
        if (hasBypassedIncomingEdge) {
          bypassedStepIds.push(stepId);
        } else {
          unreachedStepIds.push(stepId);
        }
      }
    }

    const isSuccess = !terminatedDueToCycle && !executionLogs.some(l => l.status === 'failed');

    return {
      executionId,
      success: isSuccess,
      status: terminatedDueToCycle ? 'cycle_terminated' : (isSuccess ? 'completed' : 'failed'),
      executedSteps: executedStepOrder,
      bypassedSteps: bypassedStepIds,
      unreachedSteps: unreachedStepIds,
      executedStepIds: executedStepOrder,
      bypassedStepIds,
      unreachedStepIds,
      activeEdgeIds: Array.from(activeEdgeIdsSet),
      bypassedEdgeIds: Array.from(bypassedEdgeIdsSet),
      stepOutputs,
      timeline,
      executionLogs,
      transitionLogs,
      finalContext: rootContext,
    };
  }

  private cloneContext(ctx: ExecutionContext): ExecutionContext {
    return {
      trigger: JSON.parse(JSON.stringify(ctx.trigger || {})),
      steps: JSON.parse(JSON.stringify(ctx.steps || {})),
      vars: JSON.parse(JSON.stringify(ctx.vars || {})),
      parent: JSON.parse(JSON.stringify(ctx.parent || [])),
    };
  }

  private createEmptyResult(
    executionId: string,
    status: 'failed',
    wf: Partial<Workflow>
  ): SimulationResult {
    return {
      executionId,
      success: false,
      status,
      executedSteps: [],
      bypassedSteps: [],
      unreachedSteps: (wf.steps || []).map(s => s.id),
      executedStepIds: [],
      bypassedStepIds: [],
      unreachedStepIds: (wf.steps || []).map(s => s.id),
      activeEdgeIds: [],
      bypassedEdgeIds: [],
      stepOutputs: {},
      timeline: [],
      executionLogs: [],
      transitionLogs: [],
      finalContext: { trigger: {}, steps: {}, vars: {}, parent: [] },
    };
  }
}

export function simulateWorkflow(
  workflow: Workflow,
  triggerData: TriggerData,
  initialVars?: Record<string, any>,
  stepMockOverrides?: Record<string, any>,
  maxExecutionSteps?: number
): SimulationResult {
  const engine = new DryRunSimulationEngine();
  return engine.simulate({
    workflow,
    triggerInput: triggerData,
    initialVars,
    stepMockOverrides,
    maxExecutionSteps,
  });
}
