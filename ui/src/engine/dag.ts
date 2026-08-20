import dagre from '@dagrejs/dagre';
import { SimulationResult } from '../types/engine';
import { Workflow } from '../types/workflow';

export interface DagNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: {
    id: string;
    action?: string;
    connectorType?: string;
    step?: any;
    executionStatus?: 'completed' | 'bypassed' | 'failed' | 'unreached';
    output?: any;
    [key: string]: any;
  };
}

export interface DagEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: {
    condition?: string;
    isActive?: boolean;
    isBypassed?: boolean;
    [key: string]: any;
  };
  animated?: boolean;
}

export interface DagGraphResult {
  nodes: DagNode[];
  edges: DagEdge[];
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

/**
 * Builds directed acyclic graph representation and computes hierarchical layout
 */
export function buildWorkflowGraph(
  workflow: Workflow | null | undefined,
  layout: 'TB' | 'LR' = 'TB',
  simulationResult?: Partial<SimulationResult> | null | any
): DagGraphResult {
  if (!workflow || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    return { nodes: [], edges: [] };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: layout,
    nodesep: 50,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  const executedSteps = new Set(simulationResult?.executedSteps || simulationResult?.executedStepIds || []);
  const bypassedSteps = new Set(simulationResult?.bypassedSteps || simulationResult?.bypassedStepIds || []);
  const activeEdgeIds = new Set(simulationResult?.activeEdgeIds || []);
  const bypassedEdgeIds = new Set(simulationResult?.bypassedEdgeIds || []);

  // 1. Add nodes
  for (const step of workflow.steps) {
    if (!step || !step.id) continue;

    g.setNode(step.id, { width: NODE_WIDTH, height: NODE_HEIGHT });

    const [connectorType] = (step.action || '').split('.');

    let executionStatus: 'completed' | 'bypassed' | 'failed' | 'unreached' | undefined;
    if (simulationResult) {
      if (executedSteps.has(step.id)) {
        executionStatus = 'completed';
      } else if (bypassedSteps.has(step.id)) {
        executionStatus = 'bypassed';
      } else {
        executionStatus = 'unreached';
      }
    }

    nodes.push({
      id: step.id,
      position: { x: 0, y: 0 },
      data: {
        id: step.id,
        action: step.action,
        connectorType,
        step,
        executionStatus,
        output: simulationResult?.stepOutputs?.[step.id],
      },
    });
  }

  // 2. Add edges
  for (const step of workflow.steps) {
    if (!step || !step.id || !Array.isArray(step.next_steps)) continue;

    for (const next of step.next_steps) {
      if (!next || !next.step_id) continue;

      const edgeId = `${step.id}->${next.step_id}`;
      g.setEdge(step.id, next.step_id);

      let isActive = false;
      let isBypassed = false;

      if (simulationResult) {
        if (activeEdgeIds.has(edgeId) || (executedSteps.has(step.id) && executedSteps.has(next.step_id))) {
          isActive = true;
        } else if (bypassedEdgeIds.has(edgeId) || bypassedSteps.has(next.step_id)) {
          isBypassed = true;
        }
      }

      edges.push({
        id: edgeId,
        source: step.id,
        target: next.step_id,
        label: next.condition,
        data: {
          condition: next.condition,
          isActive,
          isBypassed,
        },
        animated: isActive,
      });
    }
  }

  // 3. Compute layout
  dagre.layout(g);

  // 4. Assign computed positions
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      node.position = {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges };
}
