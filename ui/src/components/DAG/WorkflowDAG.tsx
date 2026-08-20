import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Node,
  Edge,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';

import { useWorkflowStore } from '../../store/useWorkflowStore';
import { CustomStepNode } from './CustomStepNode';
import { CustomTriggerNode } from './CustomTriggerNode';
import { CustomConditionEdge } from './CustomConditionEdge';
import { CONNECTOR_CATALOG } from '../../types/connectors';
import {
  GitFork,
  ArrowDownUp,
  ArrowLeftRight,
  Maximize2,
} from 'lucide-react';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;

const nodeTypes = {
  stepNode: CustomStepNode,
  triggerNode: CustomTriggerNode,
};

const edgeTypes = {
  conditionEdge: CustomConditionEdge,
  default: CustomConditionEdge,
};

const DAGInner: React.FC = () => {
  const {
    parsedWorkflow,
    dagLayout,
    setDagLayout,
    simulationResult,
    selectedElement,
    selectElement,
    setActiveTab,
  } = useWorkflowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  // Layout calculation using Dagre
  const computeLayout = useCallback(() => {
    if (!parsedWorkflow) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: dagLayout,
      nodesep: dagLayout === 'TB' ? 60 : 70,
      ranksep: dagLayout === 'TB' ? 80 : 100,
      marginx: 50,
      marginy: 50,
    });
    g.setDefaultEdgeLabel(() => ({}));

    const computedNodes: Node[] = [];
    const computedEdges: Edge[] = [];

    const executedSteps = new Set(
      simulationResult?.executedSteps || simulationResult?.executedStepIds || []
    );
    const bypassedSteps = new Set(
      simulationResult?.bypassedSteps || simulationResult?.bypassedStepIds || []
    );
    const activeEdgeIds = new Set(simulationResult?.activeEdgeIds || []);
    const bypassedEdgeIds = new Set(simulationResult?.bypassedEdgeIds || []);

    // 1. Add Trigger Node if configured
    const trigger = parsedWorkflow.trigger;
    const initialStep = trigger?.config?.initial_step;

    if (trigger) {
      const triggerId = '__trigger__';
      g.setNode(triggerId, { width: NODE_WIDTH, height: 90 });

      computedNodes.push({
        id: triggerId,
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: {
          id: triggerId,
          triggerType: trigger.type,
          config: trigger.config,
          initialStep,
          layout: dagLayout,
        },
        selected: selectedElement?.type === 'trigger' || selectedElement?.id === triggerId,
      });

      // Edge from Trigger to Initial Step
      if (initialStep) {
        const triggerEdgeId = `${triggerId}->${initialStep}`;
        g.setEdge(triggerId, initialStep);

        const isInitialStepExecuted = executedSteps.has(initialStep);
        computedEdges.push({
          id: triggerEdgeId,
          source: triggerId,
          target: initialStep,
          type: 'conditionEdge',
          data: {
            condition: '',
            isActive: simulationResult ? isInitialStepExecuted : false,
            isBypassed: false,
          },
          selected: selectedElement?.id === triggerEdgeId,
        });
      }
    }

    // 2. Add Step Nodes
    if (Array.isArray(parsedWorkflow.steps)) {
      for (const step of parsedWorkflow.steps) {
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

        computedNodes.push({
          id: step.id,
          type: 'stepNode',
          position: { x: 0, y: 0 },
          data: {
            id: step.id,
            action: step.action,
            connectorType,
            step,
            executionStatus,
            output: simulationResult?.stepOutputs?.[step.id],
            layout: dagLayout,
          },
          selected: selectedElement?.type === 'node' && selectedElement?.id === step.id,
        });
      }

      // 3. Add Transitions (next_steps Edges)
      for (const step of parsedWorkflow.steps) {
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

          computedEdges.push({
            id: edgeId,
            source: step.id,
            target: next.step_id,
            type: 'conditionEdge',
            data: {
              condition: next.condition,
              isActive,
              isBypassed,
              sourceStep: step,
              targetStepId: next.step_id,
            },
            selected: selectedElement?.type === 'edge' && selectedElement?.id === edgeId,
          });
        }
      }
    }

    // 4. Compute Dagre coordinates
    dagre.layout(g);

    for (const node of computedNodes) {
      const dagreNode = g.node(node.id);
      if (dagreNode) {
        node.position = {
          x: dagreNode.x - NODE_WIDTH / 2,
          y: dagreNode.y - (node.type === 'triggerNode' ? 45 : NODE_HEIGHT / 2),
        };
      }
    }

    setNodes(computedNodes);
    setEdges(computedEdges);

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 50);
  }, [parsedWorkflow, dagLayout, simulationResult, selectedElement, fitView, setNodes, setEdges]);

  useEffect(() => {
    computeLayout();
  }, [computeLayout]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'triggerNode') {
        selectElement({ type: 'trigger', id: node.id, data: node.data });
      } else {
        selectElement({ type: 'node', id: node.id, data: node.data });
      }
      setActiveTab('inspector');
    },
    [selectElement, setActiveTab]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectElement({ type: 'edge', id: edge.id, data: edge.data });
      setActiveTab('inspector');
    },
    [selectElement, setActiveTab]
  );

  const onPaneClick = useCallback(() => {
    selectElement(null);
  }, [selectElement]);

  const nodeColor = (node: Node) => {
    if (node.type === 'triggerNode') return '#6366f1';
    const connector = node.data?.connectorType as string;
    return CONNECTOR_CATALOG[connector]?.accentColor || '#64748b';
  };

  if (!parsedWorkflow) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 text-slate-500 p-8 select-none">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 mb-3 shadow-inner">
          <GitFork className="h-8 w-8 text-slate-600" />
        </div>
        <p className="text-sm font-medium text-slate-400">No active workflow to display</p>
        <p className="text-xs text-slate-600 mt-1 max-w-xs text-center">
          Open a sample or write your YAML workflow definition in the editor to visualize its DAG.
        </p>
      </div>
    );
  }

  const stepCount = parsedWorkflow.steps?.length || 0;

  return (
    <div className="h-full w-full relative bg-slate-950 overflow-hidden">
      {/* Top Floating Controls Bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 select-none">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-800 text-xs font-semibold text-slate-200 shadow-lg">
          <GitFork className="h-3.5 w-3.5 text-sky-400" />
          <span>DAG Flowchart</span>
          <span className="text-[10px] font-mono text-slate-400 ml-1 px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
        </div>

        {/* Orientation Toggle */}
        <button
          onClick={() => setDagLayout(dagLayout === 'TB' ? 'LR' : 'TB')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white shadow-lg transition"
          title={`Switch layout orientation (currently ${dagLayout})`}
        >
          {dagLayout === 'TB' ? (
            <>
              <ArrowDownUp className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-[11px]">TB</span>
            </>
          ) : (
            <>
              <ArrowLeftRight className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-[11px]">LR</span>
            </>
          )}
        </button>

        {/* Fit View Button */}
        <button
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          className="p-1.5 rounded-lg bg-slate-900/90 backdrop-blur-md border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white shadow-lg transition"
          title="Fit view to graph"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* React Flow Component */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#33415540"
        />

        <Controls
          className="!bg-slate-900 !border-slate-800 !shadow-xl !rounded-lg overflow-hidden [&>button]:!bg-slate-900 [&>button]:!border-slate-800 [&>button]:!text-slate-300 hover:[&>button]:!text-white hover:[&>button]:!bg-slate-800"
        />

        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={2}
          nodeBorderRadius={6}
          maskColor="rgba(2, 6, 23, 0.75)"
          className="!bg-slate-900/90 !border-slate-800 !rounded-lg !shadow-xl !bottom-3 !right-3"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>
    </div>
  );
};

export const WorkflowDAG: React.FC = () => {
  return (
    <ReactFlowProvider>
      <DAGInner />
    </ReactFlowProvider>
  );
};
