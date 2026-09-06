import { describe, it, expect } from 'vitest';
import { buildWorkflowGraph } from '../engine/dag';
import type { Workflow } from '../types/workflow';
import type { SimulationResult } from '../types/engine';

describe('DAG Flowchart Generator & Layout Test Suite', () => {
  const sampleWorkflow: Workflow = {
    id: 'sample-dag-wf',
    name: 'Sample DAG Workflow',
    status: 'active',
    trigger: {
      type: 'webhook',
      config: {
        initial_step: 'step_fetch',
      },
    },
    steps: [
      {
        id: 'step_fetch',
        action: 'http.get',
        params: { url: 'https://example.com/api' },
        next_steps: [
          {
            step_id: 'step_success_log',
            condition: '{{ .steps.step_fetch.output.status_code }} == 200',
          },
          {
            step_id: 'step_error_log',
            condition: '{{ .steps.step_fetch.output.status_code }} != 200',
          },
        ],
      },
      {
        id: 'step_success_log',
        action: 'logger.info',
        params: { message: 'Success' },
        next_steps: [{ step_id: 'step_jira' }],
      },
      {
        id: 'step_error_log',
        action: 'logger.error',
        params: { message: 'Error' },
      },
      {
        id: 'step_jira',
        action: 'jira.transition_issue',
        params: { issue_key: 'PROJ-1', transition_id: '21' },
      },
    ],
  };

  describe('Tier 1: Graph Topology & Node/Edge Generation', () => {
    it('should generate nodes corresponding to each step in the workflow', () => {
      const { nodes } = buildWorkflowGraph(sampleWorkflow, 'TB');
      expect(nodes).toHaveLength(4);

      const nodeIds = nodes.map((n) => n.id);
      expect(nodeIds).toContain('step_fetch');
      expect(nodeIds).toContain('step_success_log');
      expect(nodeIds).toContain('step_error_log');
      expect(nodeIds).toContain('step_jira');
    });

    it('should assign correct connector categories and action data to nodes', () => {
      const { nodes } = buildWorkflowGraph(sampleWorkflow, 'TB');

      const httpNode = nodes.find((n) => n.id === 'step_fetch');
      expect(httpNode?.data.action).toBe('http.get');
      expect(httpNode?.data.connectorType).toBe('http');

      const loggerNode = nodes.find((n) => n.id === 'step_success_log');
      expect(loggerNode?.data.action).toBe('logger.info');
      expect(loggerNode?.data.connectorType).toBe('logger');

      const jiraNode = nodes.find((n) => n.id === 'step_jira');
      expect(jiraNode?.data.action).toBe('jira.transition_issue');
      expect(jiraNode?.data.connectorType).toBe('jira');
    });

    it('should generate directed edges corresponding to next_steps transitions', () => {
      const { edges } = buildWorkflowGraph(sampleWorkflow, 'TB');
      expect(edges).toHaveLength(3);

      const edgePairs = edges.map((e) => `${e.source}->${e.target}`);
      expect(edgePairs).toContain('step_fetch->step_success_log');
      expect(edgePairs).toContain('step_fetch->step_error_log');
      expect(edgePairs).toContain('step_success_log->step_jira');
    });

    it('should attach condition text as edge labels or data properties', () => {
      const { edges } = buildWorkflowGraph(sampleWorkflow, 'TB');

      const successEdge = edges.find(
        (e) => e.source === 'step_fetch' && e.target === 'step_success_log'
      );
      expect(successEdge?.data?.condition).toContain(
        '{{ .steps.step_fetch.output.status_code }} == 200'
      );

      const errorEdge = edges.find(
        (e) => e.source === 'step_fetch' && e.target === 'step_error_log'
      );
      expect(errorEdge?.data?.condition).toContain(
        '{{ .steps.step_fetch.output.status_code }} != 200'
      );
    });

    it('should compute valid auto-layout coordinates for TB and LR orientations', () => {
      const tbGraph = buildWorkflowGraph(sampleWorkflow, 'TB');
      expect(tbGraph.nodes.every((n) => typeof n.position.x === 'number')).toBe(
        true
      );
      expect(tbGraph.nodes.every((n) => typeof n.position.y === 'number')).toBe(
        true
      );

      const lrGraph = buildWorkflowGraph(sampleWorkflow, 'LR');
      expect(lrGraph.nodes.every((n) => typeof n.position.x === 'number')).toBe(
        true
      );
      expect(lrGraph.nodes.every((n) => typeof n.position.y === 'number')).toBe(
        true
      );
    });
  });

  describe('Tier 2: Empty Workflows, Highlighting & Boundary Handling', () => {
    it('should return empty nodes and edges for empty or invalid workflow', () => {
      const emptyWf: Workflow = {
        id: 'empty',
        name: 'Empty',
        status: 'active',
        trigger: { type: 'manual', config: { initial_step: '' } },
        steps: [],
      };

      const result = buildWorkflowGraph(emptyWf, 'TB');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle single isolated node workflow with 0 edges', () => {
      const singleNodeWf: Workflow = {
        id: 'single',
        name: 'Single',
        status: 'active',
        trigger: { type: 'manual', config: { initial_step: 'single_step' } },
        steps: [{ id: 'single_step', action: 'logger.info' }],
      };

      const result = buildWorkflowGraph(singleNodeWf, 'TB');
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
      expect(result.nodes[0].id).toBe('single_step');
    });

    it('should decorate nodes and edges with execution simulation states (active vs bypassed)', () => {
      const mockSimulationResult: Partial<SimulationResult> = {
        success: true,
        executedSteps: ['step_fetch', 'step_success_log', 'step_jira'],
        bypassedSteps: ['step_error_log'],
        stepOutputs: {
          step_fetch: { status_code: 200 },
          step_success_log: { logged: true },
          step_jira: { status: 'success' },
        },
        errors: {},
        timeline: [],
      };

      const { nodes, edges } = buildWorkflowGraph(
        sampleWorkflow,
        'TB',
        mockSimulationResult
      );

      const executedNode = nodes.find((n) => n.id === 'step_success_log');
      expect(executedNode?.data.executionStatus).toBe('completed');

      const bypassedNode = nodes.find((n) => n.id === 'step_error_log');
      expect(bypassedNode?.data.executionStatus).toBe('bypassed');

      const activeEdge = edges.find(
        (e) => e.source === 'step_fetch' && e.target === 'step_success_log'
      );
      expect(activeEdge?.data?.isActive).toBe(true);

      const bypassedEdge = edges.find(
        (e) => e.source === 'step_fetch' && e.target === 'step_error_log'
      );
      expect(bypassedEdge?.data?.isBypassed).toBe(true);
    });
  });
});
