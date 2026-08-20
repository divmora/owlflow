/**
 * OwlFlow Workflow Schema and AST Interfaces
 */

export type WorkflowStatus = 'active' | 'disabled' | 'draft';

export type TriggerType = 'webhook' | 'schedule' | 'manual';

export interface WebhookTriggerConfig {
  initial_step: string;
  path?: string;
  secret?: string;
  [key: string]: any;
}

export interface ScheduleTriggerConfig {
  initial_step: string;
  cron: string;
  timezone?: string;
  [key: string]: any;
}

export interface ManualTriggerConfig {
  initial_step: string;
  description?: string;
  [key: string]: any;
}

export interface Trigger {
  type: TriggerType;
  config: WebhookTriggerConfig | ScheduleTriggerConfig | ManualTriggerConfig | Record<string, any>;
}

export interface NextStep {
  step_id: string;
  condition?: string;
}

export interface Step {
  id: string;
  action: string;
  params?: Record<string, any>;
  next_steps?: NextStep[];
  pass_output?: boolean;
  retries?: number;
  timeout?: number;
  [key: string]: any;
}

export interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  vars?: Record<string, any>;
  trigger: Trigger;
  steps: Step[];
  [key: string]: any;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  path?: (string | number)[];
  range?: DiagnosticRange;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  diagnostics: Diagnostic[];
  reachableStepIds: Set<string>;
  unreachableStepIds: Set<string>;
  cycles: string[][];
}

export interface ExecutionContext {
  trigger: {
    payload?: any;
    headers?: Record<string, string | string[] | any>;
    query?: Record<string, any>;
    time?: string;
    timezone?: string;
    type?: string;
    [key: string]: any;
  };
  steps: Record<string, { output: any; [key: string]: any }>;
  vars: Record<string, any>;
  parent: any[];
  // Compatibility aliases
  TriggerData?: any;
  inputs?: any;
  variables?: any;
  [key: string]: any;
}

export type StepExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'bypassed' | 'skipped';

export interface StepExecution {
  stepId: string;
  action: string;
  status: 'success' | 'failed';
  startedAt: string;
  durationMs: number;
  resolvedParams: Record<string, any>;
  output: any;
  error?: string;
}

export interface TransitionExecution {
  fromStepId: string;
  toStepId: string;
  condition?: string;
  evaluatedResult: boolean;
  status: 'active' | 'bypassed' | 'error';
  error?: string;
}

export interface SimulationInput {
  type?: TriggerType;
  payload: Record<string, any>;
  headers?: Record<string, string | string[] | any>;
  query?: Record<string, any>;
  time?: string;
  timezone?: string;
}

export interface StepTimelineEntry {
  stepId: string;
  action: string;
  status: 'success' | 'failed' | 'bypassed';
  startedAt: string;
  durationMs: number;
  resolvedParams: Record<string, any>;
  output: any;
  error?: string;
}

export interface SimulationResult {
  executionId?: string;
  success?: boolean;
  status?: 'completed' | 'failed' | 'cycle_terminated';
  executedSteps?: string[];
  bypassedSteps?: string[];
  unreachedSteps?: string[];
  executedStepIds?: string[];
  bypassedStepIds?: string[];
  unreachedStepIds?: string[];
  activeEdgeIds?: string[];
  bypassedEdgeIds?: string[];
  stepOutputs: Record<string, any>;
  errors?: Record<string, any>;
  timeline?: StepTimelineEntry[];
  executionLogs?: StepExecution[];
  transitionLogs?: TransitionExecution[];
  finalContext?: ExecutionContext;
}

export interface SimulationState {
  isRunning: boolean;
  input: SimulationInput;
  initialVars: Record<string, any>;
  stepMockOverrides: Record<string, any>;
  result: SimulationResult | null;
}
