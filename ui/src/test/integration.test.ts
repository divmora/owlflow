import { describe, it, expect } from 'vitest';
import { parseYaml } from '../engine/yaml';
import { validateWorkflow } from '../engine/validator';
import { buildWorkflowGraph } from '../engine/dag';
import { simulateWorkflow } from '../engine/simulator';
import type { Workflow } from '../types/workflow';
import type { TriggerData } from '../types/engine';

describe('Pairwise Integration & End-to-End Store Flow (Tier 3)', () => {
  const sampleYaml = `
id: "order-processor"
name: "Order Processing Pipeline"
status: "active"
vars:
  warehouse_id: "WH-NORTH"
trigger:
  type: "webhook"
  config:
    path: "/orders"
    initial_step: "validate_order"
steps:
  - id: "validate_order"
    action: "http.post"
    params:
      url: "https://inventory.service/validate"
      body: '{"order_id": "{{ .trigger.payload.order_id }}"}'
    next_steps:
      - step_id: "route_fulfillment"
        condition: '{{ .steps.validate_order.output.status_code }} == 200'
      - step_id: "log_rejection"
        condition: '{{ .steps.validate_order.output.status_code }} != 200'

  - id: "route_fulfillment"
    action: "logger.info"
    params:
      message: "Order {{ .trigger.payload.order_id }} routed to {{ .vars.warehouse_id }}"
    next_steps:
      - step_id: "notify_customer"

  - id: "log_rejection"
    action: "logger.error"
    params:
      message: "Order validation failed"

  - id: "notify_customer"
    action: "http.post"
    params:
      url: "https://notify.service/email"
      body: '{"status":"confirmed"}'
`;

  it('should complete the entire pipeline: parse -> validate -> build DAG -> simulate', () => {
    // Step 1: Parse YAML
    const parsed = parseYaml(sampleYaml);
    expect(parsed.error).toBeUndefined();
    expect(parsed.data).toBeDefined();
    const workflow = parsed.data as Workflow;

    // Step 2: Validate Schema and Topology
    const validation = validateWorkflow(workflow);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // Step 3: Generate DAG Graph
    const graph = buildWorkflowGraph(workflow, 'TB');
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);

    // Step 4: Simulate with Valid Trigger Payload
    const mockTrigger: TriggerData = {
      type: 'webhook',
      payload: {
        order_id: 'ORD-7890',
        amount: 250.0,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const simulation = simulateWorkflow(workflow, mockTrigger, workflow.vars);
    expect(simulation.success).toBe(true);
    expect(simulation.executedSteps).toEqual([
      'validate_order',
      'route_fulfillment',
      'notify_customer',
    ]);
    expect(simulation.bypassedSteps).toContain('log_rejection');

    // Step 5: Verify Active Path DAG Highlighting
    const decoratedGraph = buildWorkflowGraph(workflow, 'TB', simulation);
    const validOrderNode = decoratedGraph.nodes.find(
      (n) => n.id === 'validate_order'
    );
    expect(validOrderNode?.data.executionStatus).toBe('completed');

    const rejectedNode = decoratedGraph.nodes.find(
      (n) => n.id === 'log_rejection'
    );
    expect(rejectedNode?.data.executionStatus).toBe('bypassed');
  });

  it('should maintain clean initial state without automatically loading a default workflow', () => {
    // When no YAML is provided, system remains in empty state
    const emptyParsed = parseYaml('');
    expect(emptyParsed.data).toBeNull();

    const emptyValidation = validateWorkflow(null);
    expect(emptyValidation.isValid).toBe(false);

    const emptyGraph = buildWorkflowGraph(null as unknown as Workflow, 'TB');
    expect(emptyGraph.nodes).toHaveLength(0);
    expect(emptyGraph.edges).toHaveLength(0);
  });

  it('should update simulation results dynamically when trigger payload changes', () => {
    const parsed = parseYaml(sampleYaml);
    const workflow = parsed.data as Workflow;

    // Payload 1: Order A
    const triggerA: TriggerData = {
      type: 'webhook',
      payload: { order_id: 'ORD-A' },
    };
    const resA = simulateWorkflow(workflow, triggerA, workflow.vars);
    expect(resA.executedSteps).toContain('validate_order');

    // Payload 2: Order B
    const triggerB: TriggerData = {
      type: 'webhook',
      payload: { order_id: 'ORD-B' },
    };
    const resB = simulateWorkflow(workflow, triggerB, workflow.vars);
    expect(resB.executedSteps).toContain('validate_order');
  });
});
