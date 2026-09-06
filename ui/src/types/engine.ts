import { ExecutionContext as WorkflowExecutionContext, SimulationResult as WorkflowSimulationResult, Workflow } from './workflow';

export type TriggerData = {
  type?: string;
  payload?: any;
  headers?: Record<string, string | string[] | any>;
  query?: Record<string, any>;
  time?: string;
  timezone?: string;
  [key: string]: any;
};

export type ExecutionContext = WorkflowExecutionContext;

export interface YamlError {
  message: string;
  line?: number;
  col?: number;
  pos?: number;
}

export interface YamlParseResult<T = any> {
  data: T | null;
  error?: YamlError;
  cst?: any;
}

export type ASTNode =
  | { type: 'BinaryOp'; operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'; left: ASTNode; right: ASTNode }
  | { type: 'UnaryOp'; operator: '!'; argument: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] }
  | { type: 'Literal'; value: string | number | boolean | null }
  | { type: 'PropertyAccess'; path: string[] };

export interface ConditionEvaluationResult {
  result: boolean;
  error?: string;
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

export type SimulationResult = WorkflowSimulationResult;

export interface SimulationOptions {
  workflow: Workflow;
  triggerInput: TriggerData;
  initialVars?: Record<string, any>;
  stepMockOverrides?: Record<string, any>;
  maxExecutionSteps?: number;
}
