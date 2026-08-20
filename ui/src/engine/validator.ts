import { CONNECTOR_CATALOG } from '../types/connectors';
import { Diagnostic, DiagnosticSeverity, Step, ValidationResult, Workflow } from '../types/workflow';
import { YamlService } from './yaml';

/**
 * OwlFlow Real-Time Schema & Graph Topology Validator
 */
export class WorkflowValidator {
  /**
   * Validates a workflow object against the OwlFlow AST specification and DAG topology
   */
  public static validate(
    workflow: unknown,
    rawContent?: string,
    cstDoc?: any
  ): ValidationResult {
    const diagnostics: Diagnostic[] = [];

    const addDiagnostic = (
      code: string,
      message: string,
      severity: DiagnosticSeverity,
      path: (string | number)[],
      suggestion?: string
    ) => {
      const range = YamlService.findNodeRange(cstDoc, path, rawContent);
      diagnostics.push({
        code,
        message,
        severity,
        path,
        range,
        suggestion,
      });
    };

    if (!workflow || typeof workflow !== 'object') {
      addDiagnostic('V-TOP-000', 'Workflow definition must be an object', 'error', []);
      return {
        isValid: false,
        errors: diagnostics.filter(d => d.severity === 'error'),
        warnings: diagnostics.filter(d => d.severity === 'warning'),
        diagnostics,
        reachableStepIds: new Set(),
        unreachableStepIds: new Set(),
        cycles: [],
      };
    }

    const wf = workflow as Partial<Workflow>;

    // 1. Top-Level Validations
    if (!wf.id || typeof wf.id !== 'string' || !wf.id.trim()) {
      addDiagnostic('V-TOP-001', 'Workflow "id" is required and cannot be empty', 'error', ['id'], 'Add an "id: string" to the workflow.');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(wf.id)) {
      addDiagnostic('V-TOP-001', `Workflow id "${wf.id}" contains invalid characters. Use alphanumeric, hyphens, and underscores.`, 'error', ['id']);
    }

    if (!wf.name || typeof wf.name !== 'string' || !wf.name.trim()) {
      addDiagnostic('V-TOP-002', 'Workflow "name" is required and cannot be empty', 'error', ['name'], 'Add a "name: string" to the workflow.');
    }

    if (wf.status !== undefined) {
      if (!['active', 'disabled', 'draft'].includes(wf.status)) {
        addDiagnostic('V-TOP-003', `Invalid status "${wf.status}". Must be 'active', 'disabled', or 'draft'.`, 'error', ['status']);
      }
    }

    if (!wf.trigger || typeof wf.trigger !== 'object') {
      addDiagnostic('V-TOP-004', 'Workflow "trigger" object is required', 'error', ['trigger'], 'Define a trigger block with type and config.');
    }

    if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
      addDiagnostic('V-TOP-005', 'Workflow "steps" must be a non-empty array with at least one step', 'error', ['steps'], 'Define at least one step in the steps array.');
    }

    // 2. Trigger Validations
    let initialStepId: string | undefined;
    if (wf.trigger && typeof wf.trigger === 'object') {
      const trigger = wf.trigger;
      if (!['webhook', 'schedule', 'manual'].includes(trigger.type)) {
        addDiagnostic('V-TRG-001', `Invalid trigger type "${trigger.type}". Must be 'webhook', 'schedule', or 'manual'.`, 'error', ['trigger', 'type']);
      }

      if (!trigger.config || typeof trigger.config !== 'object') {
        addDiagnostic('V-TRG-002', 'Trigger "config" object is required', 'error', ['trigger', 'config']);
      } else {
        initialStepId = trigger.config.initial_step;
        if (!initialStepId || typeof initialStepId !== 'string' || !initialStepId.trim()) {
          addDiagnostic('V-TRG-002', 'Trigger config must specify "initial_step"', 'error', ['trigger', 'config', 'initial_step'], 'Set initial_step to the ID of the entry step.');
        }

        if (trigger.type === 'schedule') {
          const cron = trigger.config.cron;
          if (!cron || typeof cron !== 'string' || !cron.trim()) {
            addDiagnostic('V-TRG-003', 'Schedule trigger requires a "cron" expression in config', 'error', ['trigger', 'config', 'cron']);
          } else {
            const parts = cron.trim().split(/\s+/);
            if (parts.length < 5 || parts.length > 6) {
              addDiagnostic('V-TRG-003', `Invalid cron expression "${cron}". Expected 5 or 6 fields.`, 'error', ['trigger', 'config', 'cron']);
            }
          }
        }

        if (trigger.type === 'webhook' && trigger.config.path) {
          if (typeof trigger.config.path === 'string' && !trigger.config.path.startsWith('/')) {
            addDiagnostic('V-TRG-004', 'Webhook path should start with "/"', 'warning', ['trigger', 'config', 'path']);
          }
        }
      }
    }

    // 3. Step Structure & Duplicate ID Checks
    const stepIdMap = new Map<string, { step: Step; index: number }>();
    const adjacencyList = new Map<string, string[]>();

    if (Array.isArray(wf.steps)) {
      const seenIds = new Set<string>();

      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        if (!step || typeof step !== 'object') {
          addDiagnostic('V-STP-000', `Step at index ${i} must be an object`, 'error', ['steps', i]);
          continue;
        }

        if (!step.id || typeof step.id !== 'string' || !step.id.trim()) {
          addDiagnostic('V-STP-001', `Step at index ${i} is missing a required "id"`, 'error', ['steps', i, 'id']);
          continue;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(step.id)) {
          addDiagnostic('V-STP-001', `Step ID "${step.id}" contains invalid characters. Use alphanumeric, hyphens, and underscores.`, 'error', ['steps', i, 'id']);
        }

        if (seenIds.has(step.id)) {
          addDiagnostic('V-STP-002', `Duplicate step ID: "${step.id}"`, 'error', ['steps', i, 'id'], 'Step IDs must be globally unique within the workflow.');
        } else {
          seenIds.add(step.id);
          stepIdMap.set(step.id, { step, index: i });
          adjacencyList.set(step.id, []);
        }

        if (!step.action || typeof step.action !== 'string' || !step.action.trim()) {
          addDiagnostic('V-STP-003', `Step "${step.id}" is missing required "action"`, 'error', ['steps', i, 'action']);
        } else if (!step.action.includes('.')) {
          addDiagnostic('V-STP-003', `Action "${step.action}" must follow "<connector>.<action>" format (e.g. "http.get", "logger.info")`, 'error', ['steps', i, 'action']);
        } else {
          // Check connector catalog
          const [prefix, actionName] = step.action.split('.');
          const category = CONNECTOR_CATALOG[prefix];
          if (!category) {
            addDiagnostic('V-STP-004', `Unrecognized connector prefix "${prefix}" in action "${step.action}"`, 'warning', ['steps', i, 'action']);
          } else {
            const actionDef = category.actions.find(a => a.action === step.action);
            if (!actionDef) {
              addDiagnostic('V-STP-004', `Unknown action "${actionName}" for connector "${prefix}"`, 'warning', ['steps', i, 'action']);
            } else {
              // Check required parameters
              const params = step.params || {};
              for (const paramDef of actionDef.params) {
                if (paramDef.required && (params[paramDef.name] === undefined || params[paramDef.name] === null || params[paramDef.name] === '')) {
                  addDiagnostic(
                    'V-STP-005',
                    `Action "${step.action}" requires parameter "${paramDef.name}"`,
                    'error',
                    ['steps', i, 'params', paramDef.name],
                    `Provide required parameter "${paramDef.name}": ${paramDef.description}`
                  );
                }
              }
            }
          }
        }

        if (step.retries !== undefined) {
          if (typeof step.retries !== 'number' || step.retries < 0 || step.retries > 10 || !Number.isInteger(step.retries)) {
            addDiagnostic('V-STP-006', `Step "${step.id}" retries must be an integer between 0 and 10`, 'error', ['steps', i, 'retries']);
          }
        }

        if (step.timeout !== undefined) {
          if (typeof step.timeout !== 'number' || step.timeout < 0 || step.timeout > 3600 || !Number.isInteger(step.timeout)) {
            addDiagnostic('V-STP-007', `Step "${step.id}" timeout must be a non-negative integer <= 3600 seconds`, 'error', ['steps', i, 'timeout']);
          }
        }
      }
    }

    // 4. Initial Step Target Existence
    if (initialStepId && !stepIdMap.has(initialStepId)) {
      addDiagnostic('V-TRG-002', `Trigger initial_step "${initialStepId}" does not exist in steps definition`, 'error', ['trigger', 'config', 'initial_step']);
    }

    // 5. Graph Adjacency & Dangling Next Steps Checks
    if (Array.isArray(wf.steps)) {
      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        if (!step || !step.id || !Array.isArray(step.next_steps)) continue;

        for (let j = 0; j < step.next_steps.length; j++) {
          const next = step.next_steps[j];
          if (!next || typeof next !== 'object') {
            addDiagnostic('V-DAG-001', `Step "${step.id}" next_step[${j}] must be an object`, 'error', ['steps', i, 'next_steps', j]);
            continue;
          }

          if (!next.step_id || typeof next.step_id !== 'string' || !next.step_id.trim()) {
            addDiagnostic('V-DAG-001', `Step "${step.id}" next_step[${j}] has empty step_id`, 'error', ['steps', i, 'next_steps', j, 'step_id']);
            continue;
          }

          if (!stepIdMap.has(next.step_id)) {
            addDiagnostic(
              'V-DAG-001',
              `Step "${step.id}" references non-existent step: "${next.step_id}" (dangling reference)`,
              'error',
              ['steps', i, 'next_steps', j, 'step_id'],
              `Ensure "${next.step_id}" is defined in the steps array.`
            );
          } else {
            adjacencyList.get(step.id)?.push(next.step_id);
          }
        }
      }
    }

    // 6. Reachability Analysis (BFS from initial_step)
    const reachableStepIds = new Set<string>();
    if (initialStepId && stepIdMap.has(initialStepId)) {
      const queue = [initialStepId];
      reachableStepIds.add(initialStepId);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adjacencyList.get(curr) || [];
        for (const next of neighbors) {
          if (!reachableStepIds.has(next)) {
            reachableStepIds.add(next);
            queue.push(next);
          }
        }
      }
    }

    const unreachableStepIds = new Set<string>();
    for (const [stepId, item] of stepIdMap.entries()) {
      if (!reachableStepIds.has(stepId)) {
        unreachableStepIds.add(stepId);
        addDiagnostic(
          'V-DAG-002',
          `Step "${stepId}" is orphan/unreachable from initial step "${initialStepId || 'undefined'}"`,
          'warning',
          ['steps', item.index, 'id'],
          `Connect an existing step to "${stepId}" via next_steps or set it as the initial_step.`
        );
      }
    }

    // 7. Cycle Detection (DFS Color Algorithm)
    const cycles: string[][] = [];
    const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
    const pathStack: string[] = [];

    function dfs(u: string) {
      visited.set(u, 1);
      pathStack.push(u);

      const neighbors = adjacencyList.get(u) || [];
      for (const v of neighbors) {
        if (visited.get(v) === 1) {
          const cycleStartIndex = pathStack.indexOf(v);
          if (cycleStartIndex !== -1) {
            const cyclePath = [...pathStack.slice(cycleStartIndex), v];
            cycles.push(cyclePath);
            addDiagnostic(
              'V-DAG-003',
              `Cycle detected in workflow: ${cyclePath.join(' -> ')}`,
              'warning',
              ['steps'],
              'Ensure conditional transitions terminate to avoid infinite loops during execution.'
            );
          }
        } else if (!visited.get(v)) {
          dfs(v);
        }
      }

      pathStack.pop();
      visited.set(u, 2);
    }

    for (const stepId of stepIdMap.keys()) {
      if (!visited.get(stepId)) {
        dfs(stepId);
      }
    }

    const errors = diagnostics.filter(d => d.severity === 'error');
    const warnings = diagnostics.filter(d => d.severity === 'warning');

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      diagnostics,
      reachableStepIds,
      unreachableStepIds,
      cycles,
    };
  }
}

export function validateWorkflow(
  workflow: unknown,
  rawContent?: string,
  cstDoc?: any
): ValidationResult {
  return WorkflowValidator.validate(workflow, rawContent, cstDoc);
}
