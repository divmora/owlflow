import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useWorkflowStore } from '../store/useWorkflowStore';
import { App } from '../App';
import { Header } from '../components/Header/Header';
import { ValidationBanner } from '../components/Editor/ValidationBanner';
import { WorkflowDAG } from '../components/DAG/WorkflowDAG';
import { InspectorPanel } from '../components/Inspector/InspectorPanel';
import { SimulatorPanel } from '../components/Simulator/SimulatorPanel';
import { ExportModal } from '../components/Export/ExportModal';
import { FileBrowserModal } from '../components/FileBrowser/FileBrowserModal';

import { parseYaml } from '../engine/yaml';
import { validateWorkflow } from '../engine/validator';
import { buildWorkflowGraph } from '../engine/dag';
import { getSampleWorkflow, SAMPLE_WORKFLOWS } from '../samples/sampleWorkflows';
import { Workflow } from '../types/workflow';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockImplementation(() => Promise.resolve()),
  },
});

// Mock URL.createObjectURL and URL.revokeObjectURL for downloads
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

// Mock window.confirm
vi.spyOn(window, 'confirm').mockImplementation(() => true);

describe('Challenger 2: UI & Workflows Adversarial Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkflowStore.getState().resetToBlank();
  });

  /* =========================================================================
   * TARGET 1: Clean Initial State (starts empty without autoloading default workflow)
   * ========================================================================= */
  describe('Target 1: Clean Initial State Verification', () => {
    it('initializes store with empty/blank state and no default workflow loaded', () => {
      const state = useWorkflowStore.getState();

      expect(state.rawYaml).toBe('');
      expect(state.activeFileName).toBeNull();
      expect(state.parsedWorkflow).toBeNull();
      expect(state.validationResult).toBeNull();
      expect(state.diagnostics).toEqual([]);
      expect(state.isValid).toBe(true);
      expect(state.selectedElement).toBeNull();
      expect(state.simulationResult).toBeNull();
      expect(state.dagLayout).toBe('TB');
    });

    it('renders clean initial state hero in App component when no workflow is loaded', () => {
      render(<App />);

      expect(screen.getByText('OwlFlow Studio')).toBeInTheDocument();
      expect(screen.getByText('No workflow loaded')).toBeInTheDocument();
      expect(screen.getAllByText('OwlFlow Workflow Studio').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Upload or Browse File')).toBeInTheDocument();
      expect(screen.getByText('Load GitHub Sample')).toBeInTheDocument();
      expect(screen.getByText('Explore Bundled Samples')).toBeInTheDocument();

      // All 4 bundled sample cards should be displayed in the initial state view
      expect(screen.getByText('GitHub Repository Monitor')).toBeInTheDocument();
      expect(screen.getByText('GitLab Repository Monitor')).toBeInTheDocument();
      expect(screen.getByText('Schedule Test')).toBeInTheDocument();
      expect(screen.getByText('Test workflow')).toBeInTheDocument();
    });

    it('renders clean placeholder in DAG canvas when workflow is empty', () => {
      render(<WorkflowDAG />);

      expect(screen.getByText('No active workflow to display')).toBeInTheDocument();
      expect(
        screen.getByText(/Open a sample or write your YAML workflow definition/i)
      ).toBeInTheDocument();
    });

    it('renders clean validation banner when no diagnostics exist', () => {
      render(<ValidationBanner diagnostics={[]} />);

      expect(screen.getByText('No validation issues found')).toBeInTheDocument();
      expect(screen.getByText('OwlFlow Specification v1.0')).toBeInTheDocument();
    });

    it('resetToBlank action completely restores clean state after workflow was loaded', () => {
      // Load a workflow
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');
      expect(useWorkflowStore.getState().parsedWorkflow).not.toBeNull();
      expect(useWorkflowStore.getState().rawYaml.length).toBeGreaterThan(0);

      // Reset
      useWorkflowStore.getState().resetToBlank();

      const state = useWorkflowStore.getState();
      expect(state.rawYaml).toBe('');
      expect(state.parsedWorkflow).toBeNull();
      expect(state.activeFileName).toBeNull();
      expect(state.diagnostics).toEqual([]);
      expect(state.simulationResult).toBeNull();
    });
  });

  /* =========================================================================
   * TARGET 2: Loading and Rendering All 4 Production Workflows
   * ========================================================================= */
  describe('Target 2: Sample Workflows Loading & Rendering in configs/workflows/', () => {
    // 2.1 github-monitor.yaml (dangling step diagnostic)
    describe('2.1 github-monitor.yaml (Dangling Step Diagnostic)', () => {
      const githubSample = getSampleWorkflow('github-monitor')!;

      it('parses github-monitor.yaml and emits V-DAG-001 dangling step diagnostic for log_success', () => {
        const parsed = parseYaml(githubSample.yaml);
        expect(parsed.data).toBeDefined();

        const valResult = validateWorkflow(parsed.data, githubSample.yaml, parsed.cst);
        expect(valResult.isValid).toBe(false);

        const danglingError = valResult.errors.find((e) => e.code === 'V-DAG-001');
        expect(danglingError).toBeDefined();
        expect(danglingError?.message).toContain('log_success');
        expect(danglingError?.message).toContain('dangling reference');
        expect(danglingError?.suggestion).toContain('Ensure "log_success" is defined');
      });

      it('displays dangling step error in store diagnostics and Header status banner', () => {
        useWorkflowStore.getState().loadSampleWorkflow('github-monitor');

        const state = useWorkflowStore.getState();
        expect(state.isValid).toBe(false);
        expect(state.diagnostics.some((d) => d.code === 'V-DAG-001')).toBe(true);

        render(<Header onOpenFileBrowser={() => {}} onOpenExport={() => {}} />);
        expect(screen.getByText(/1 Error/i)).toBeInTheDocument();
      });

      it('generates DAG graph with nodes for check_commit & notify_slack plus trigger node', () => {
        const parsed = parseYaml(githubSample.yaml).data as Workflow;
        const graph = buildWorkflowGraph(parsed, 'TB');

        expect(graph.nodes.map((n) => n.id)).toEqual(['check_commit', 'notify_slack']);
        expect(graph.edges).toHaveLength(2);
        expect(graph.edges.map((e) => `${e.source}->${e.target}`)).toContain(
          'check_commit->notify_slack'
        );
        expect(graph.edges.map((e) => `${e.source}->${e.target}`)).toContain(
          'check_commit->log_success'
        );
      });
    });

    // 2.2 gitlab-monitor.yaml (2-way branch layout and condition labels)
    describe('2.2 gitlab-monitor.yaml (2-Way Branch Layout & Condition Labels)', () => {
      const gitlabSample = getSampleWorkflow('gitlab-monitor')!;

      it('validates gitlab-monitor.yaml cleanly without errors', () => {
        const parsed = parseYaml(gitlabSample.yaml);
        const valResult = validateWorkflow(parsed.data, gitlabSample.yaml, parsed.cst);
        expect(valResult.isValid).toBe(true);
        expect(valResult.errors).toHaveLength(0);
      });

      it('generates 2-way conditional branching graph with condition expressions', () => {
        const parsed = parseYaml(gitlabSample.yaml).data as Workflow;
        const graph = buildWorkflowGraph(parsed, 'TB');

        expect(graph.nodes).toHaveLength(3);
        const nodeIds = graph.nodes.map((n) => n.id);
        expect(nodeIds).toContain('get_project_details');
        expect(nodeIds).toContain('log_project');
        expect(nodeIds).toContain('log_error');

        // Check edge conditions
        const successEdge = graph.edges.find(
          (e) => e.source === 'get_project_details' && e.target === 'log_project'
        );
        expect(successEdge?.data?.condition).toContain(
          '{{ .steps.get_project_details.output.name }} !='
        );

        const errorEdge = graph.edges.find(
          (e) => e.source === 'get_project_details' && e.target === 'log_error'
        );
        expect(errorEdge?.data?.condition).toContain(
          '{{ .steps.get_project_details.output.name }} =='
        );
      });
    });

    // 2.3 schedule_test.yaml (schedule trigger rendering)
    describe('2.3 schedule_test.yaml (Schedule Trigger Rendering)', () => {
      const scheduleSample = getSampleWorkflow('schedule-test')!;

      it('validates 6-field cron schedule trigger in schedule_test.yaml', () => {
        const parsed = parseYaml(scheduleSample.yaml);
        const valResult = validateWorkflow(parsed.data, scheduleSample.yaml, parsed.cst);
        expect(valResult.isValid).toBe(true);
        expect(valResult.errors).toHaveLength(0);

        const wf = parsed.data as Workflow;
        expect(wf.trigger.type).toBe('schedule');
        expect(wf.trigger.config.cron).toBe('*/5 * * * * *');
        expect(wf.trigger.config.initial_step).toBe('log_time');
      });

      it('loads schedule-test into store and inspects trigger properties', () => {
        useWorkflowStore.getState().loadSampleWorkflow('schedule-test');

        const state = useWorkflowStore.getState();
        expect(state.parsedWorkflow?.trigger?.type).toBe('schedule');

        // Select trigger node
        useWorkflowStore.getState().selectElement({
          type: 'trigger',
          id: '__trigger__',
        });

        render(<InspectorPanel />);
        expect(screen.getByText('Trigger Inspector')).toBeInTheDocument();
        expect(screen.getAllByText('schedule').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('*/5 * * * * *')).toBeInTheDocument();
        expect(screen.getByText('log_time')).toBeInTheDocument();
      });
    });

    // 2.4 test-workflow.yaml (multi-line template step rendering)
    describe('2.4 test-workflow.yaml (Multi-Line Template Step Rendering)', () => {
      const testWfSample = getSampleWorkflow('test-workflow')!;

      it('validates test-workflow.yaml schema with http_post and log_event', () => {
        const parsed = parseYaml(testWfSample.yaml);
        const valResult = validateWorkflow(parsed.data, testWfSample.yaml, parsed.cst);
        expect(valResult.isValid).toBe(true);
        expect(valResult.errors).toHaveLength(0);

        const wf = parsed.data as Workflow;
        expect(wf.steps).toHaveLength(2);
        expect(wf.steps.find((s) => s.id === 'http_post')).toBeDefined();
        expect(wf.steps.find((s) => s.id === 'log_event')).toBeDefined();
      });

      it('renders multi-line template expressions in Inspector panel parameters', () => {
        useWorkflowStore.getState().loadSampleWorkflow('test-workflow');
        useWorkflowStore.getState().selectElement({
          type: 'node',
          id: 'log_event',
        });

        render(<InspectorPanel />);

        // Switch to Params tab
        fireEvent.click(screen.getByText(/Params/i));
        expect(screen.getByText('message')).toBeInTheDocument();
        expect(screen.getAllByText('Template').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  /* =========================================================================
   * TARGET 3: DAG Flowchart, Dagre TB / LR Layout, Zoom, Pan, Minimap
   * ========================================================================= */
  describe('Target 3: DAG Flowchart Generation & Layout Switching', () => {
    it('computes distinct valid coordinates when switching between TB and LR orientations', () => {
      const sample = getSampleWorkflow('gitlab-monitor')!;
      const parsed = parseYaml(sample.yaml).data as Workflow;

      const tbGraph = buildWorkflowGraph(parsed, 'TB');
      const lrGraph = buildWorkflowGraph(parsed, 'LR');

      expect(tbGraph.nodes).toHaveLength(3);
      expect(lrGraph.nodes).toHaveLength(3);

      // In TB layout, y coordinates increase down the execution chain
      const tbRoot = tbGraph.nodes.find((n) => n.id === 'get_project_details')!;
      const tbLeaf = tbGraph.nodes.find((n) => n.id === 'log_project')!;
      expect(tbLeaf.position.y).toBeGreaterThan(tbRoot.position.y);

      // In LR layout, x coordinates increase across the execution chain
      const lrRoot = lrGraph.nodes.find((n) => n.id === 'get_project_details')!;
      const lrLeaf = lrGraph.nodes.find((n) => n.id === 'log_project')!;
      expect(lrLeaf.position.x).toBeGreaterThan(lrRoot.position.x);
    });

    it('toggles layout orientation via Header button and updates Zustand store', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<Header onOpenFileBrowser={() => {}} onOpenExport={() => {}} />);

      expect(useWorkflowStore.getState().dagLayout).toBe('TB');

      const toggleBtn = screen.getByTitle(/Switch layout to Left-to-Right/i);
      fireEvent.click(toggleBtn);
      expect(useWorkflowStore.getState().dagLayout).toBe('LR');

      fireEvent.click(toggleBtn);
      expect(useWorkflowStore.getState().dagLayout).toBe('TB');
    });

    it('renders DAG canvas controls and step badges in WorkflowDAG component', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<WorkflowDAG />);

      expect(screen.getByText('DAG Flowchart')).toBeInTheDocument();
      expect(screen.getByText(/3 steps/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Switch layout orientation/i)).toBeInTheDocument();
      expect(screen.getByTitle(/Fit view to graph/i)).toBeInTheDocument();
    });
  });

  /* =========================================================================
   * TARGET 4: Inspector Panel (Parameters, Action Docs, Condition Expressions)
   * ========================================================================= */
  describe('Target 4: Inspector Panel Comprehensive Inspection', () => {
    it('displays Workflow Overview when no specific element is selected', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<InspectorPanel />);

      expect(screen.getByText('Workflow Overview')).toBeInTheDocument();
      expect(screen.getByText('GitLab Repository Monitor')).toBeInTheDocument();
      expect(screen.getByText('gitlab-monitor')).toBeInTheDocument();
      expect(screen.getByText('Total Steps:')).toBeInTheDocument();
    });

    it('displays Trigger Inspector when trigger element is selected', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');
      useWorkflowStore.getState().selectElement({
        type: 'trigger',
        id: '__trigger__',
      });

      render(<InspectorPanel />);

      expect(screen.getByText('Trigger Inspector')).toBeInTheDocument();
      expect(screen.getByText('Trigger Type:')).toBeInTheDocument();
      expect(screen.getAllByText('webhook').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Endpoint Path:')).toBeInTheDocument();
      expect(screen.getByText('/gitlab-webhook')).toBeInTheDocument();
    });

    it('displays Transition Inspector and condition expression when edge is selected', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');
      useWorkflowStore.getState().selectElement({
        type: 'edge',
        id: 'get_project_details->log_project',
        data: {
          condition: '{{ .steps.get_project_details.output.name }} != ""',
        },
      });

      render(<InspectorPanel />);

      expect(screen.getByText('Transition Inspector')).toBeInTheDocument();
      expect(screen.getByText('Source Step:')).toBeInTheDocument();
      expect(screen.getByText('get_project_details')).toBeInTheDocument();
      expect(screen.getByText('Target Step:')).toBeInTheDocument();
      expect(screen.getByText('log_project')).toBeInTheDocument();
      expect(screen.getByText('Condition Expression')).toBeInTheDocument();
      expect(
        screen.getByText('{{ .steps.get_project_details.output.name }} != ""')
      ).toBeInTheDocument();
    });

    it('inspects step node tabs: Details, Params, Action Docs, Branching, and Raw AST', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');
      useWorkflowStore.getState().selectElement({
        type: 'node',
        id: 'get_project_details',
      });

      render(<InspectorPanel />);

      // 1. Details Tab
      expect(screen.getAllByText('get_project_details').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('gitlab.get_project').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Connector:')).toBeInTheDocument();
      expect(screen.getByText('Retries:')).toBeInTheDocument();

      // 2. Params Tab
      fireEvent.click(screen.getByText(/Params/i));
      expect(screen.getByText('project_id')).toBeInTheDocument();
      expect(screen.getByText('{{ .trigger.payload.project.id }}')).toBeInTheDocument();

      // 3. Action Docs Tab
      fireEvent.click(screen.getByText('Action Docs'));
      expect(screen.getByText('Get Project')).toBeInTheDocument();
      expect(screen.getByText(/Fetch detailed GitLab project metadata/i)).toBeInTheDocument();
      expect(screen.getByText('Parameters Schema')).toBeInTheDocument();
      expect(screen.getByText('Output Schema')).toBeInTheDocument();

      // 4. Branching Tab
      fireEvent.click(screen.getByText(/Branching/i));
      expect(screen.getByText('log_project')).toBeInTheDocument();
      expect(screen.getByText('log_error')).toBeInTheDocument();

      // 5. Raw AST Tab
      fireEvent.click(screen.getByText('Raw AST'));
      expect(screen.getByText('Step AST Object')).toBeInTheDocument();
    });
  });

  /* =========================================================================
   * TARGET 5: Condition Simulator with Mock Payloads & Path Highlighting
   * ========================================================================= */
  describe('Target 5: Condition Simulator with Mock Payloads & Active Path Highlighting', () => {
    it('simulates gitlab-monitor happy path and highlights active vs bypassed paths', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      // Set valid project payload
      useWorkflowStore.getState().setSimulationInput({
        payload: {
          project: {
            id: 4567,
            name: 'my-production-app',
            name_with_namespace: 'group/my-production-app',
            web_url: 'https://gitlab.com/group/my-production-app',
          },
        },
      });

      const result = useWorkflowStore.getState().runSimulation();
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);

      // Verify active and bypassed steps
      expect(result?.executedSteps).toContain('get_project_details');
      expect(result?.executedSteps).toContain('log_project');
      expect(result?.bypassedSteps).toContain('log_error');

      // Verify decorated DAG graph
      const parsed = useWorkflowStore.getState().parsedWorkflow!;
      const graph = buildWorkflowGraph(parsed, 'TB', result);

      const activeStepNode = graph.nodes.find((n) => n.id === 'log_project');
      expect(activeStepNode?.data.executionStatus).toBe('completed');

      const bypassedStepNode = graph.nodes.find((n) => n.id === 'log_error');
      expect(bypassedStepNode?.data.executionStatus).toBe('bypassed');

      const activeEdge = graph.edges.find(
        (e) => e.source === 'get_project_details' && e.target === 'log_project'
      );
      expect(activeEdge?.data?.isActive).toBe(true);

      const bypassedEdge = graph.edges.find(
        (e) => e.source === 'get_project_details' && e.target === 'log_error'
      );
      expect(bypassedEdge?.data?.isBypassed).toBe(true);
    });

    it('simulates gitlab-monitor error branch when project name is empty', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      // Set empty name payload
      useWorkflowStore.getState().setSimulationInput({
        payload: {
          project: {
            id: 0,
            name: '', // Empty name triggers log_error branch
            web_url: '',
          },
        },
      });

      const result = useWorkflowStore.getState().runSimulation();
      expect(result?.success).toBe(true);
      expect(result?.executedSteps).toContain('get_project_details');
      expect(result?.executedSteps).toContain('log_error');
      expect(result?.bypassedSteps).toContain('log_project');
    });

    it('simulates github-monitor HTTP error branch vs success branch', () => {
      useWorkflowStore.getState().loadSampleWorkflow('github-monitor');

      // 1. Error simulation (status_code: 500)
      useWorkflowStore.getState().setStepMockOverride('check_commit', {
        status_code: 500,
        body: 'Repository Not Found',
      });

      const errResult = useWorkflowStore.getState().runSimulation();
      expect(errResult?.executedSteps).toContain('check_commit');
      expect(errResult?.executedSteps).toContain('notify_slack');
      expect(errResult?.activeEdgeIds).toContain('check_commit->notify_slack');

      // 2. Success simulation (status_code: 200)
      useWorkflowStore.getState().setStepMockOverride('check_commit', {
        status_code: 200,
        body: 'Success',
      });

      const successResult = useWorkflowStore.getState().runSimulation();
      expect(successResult?.executedSteps).toContain('check_commit');
      expect(successResult?.bypassedSteps).toContain('notify_slack');
      expect(successResult?.bypassedEdgeIds).toContain('check_commit->notify_slack');
    });

    it('renders simulation panel controls, timeline, and results subtab', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<SimulatorPanel />);

      expect(screen.getByText('Dry-Run Simulator')).toBeInTheDocument();
      expect(screen.getByText('Run Simulation')).toBeInTheDocument();
      expect(screen.getByText('Mock Inputs')).toBeInTheDocument();
      expect(screen.getByText('Results')).toBeInTheDocument();

      // Run simulation via UI button
      fireEvent.click(screen.getByText('Run Simulation'));

      // Check results tab rendered
      expect(screen.getByText(/Simulation completed/i)).toBeInTheDocument();
      expect(screen.getByText('Executed Path')).toBeInTheDocument();
      expect(screen.getByText('Bypassed Steps')).toBeInTheDocument();
      expect(screen.getByText('Step Execution Timeline')).toBeInTheDocument();
    });
  });

  /* =========================================================================
   * TARGET 6: Export to YAML/JSON and Clipboard Copy
   * ========================================================================= */
  describe('Target 6: Export to YAML/JSON and Clipboard Operations', () => {
    it('renders ExportModal and switches between YAML, JSON Formatted, and JSON Minified formats', () => {
      useWorkflowStore.getState().loadSampleWorkflow('schedule-test');

      render(<ExportModal isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('Export Workflow')).toBeInTheDocument();
      expect(screen.getByText('YAML (.yaml)')).toBeInTheDocument();
      expect(screen.getByText('JSON Formatted')).toBeInTheDocument();
      expect(screen.getByText('JSON Minified')).toBeInTheDocument();

      // Default is YAML
      expect(screen.getByText(/schedule-test\.yaml/i)).toBeInTheDocument();

      // Switch to JSON Formatted
      fireEvent.click(screen.getByText('JSON Formatted'));
      expect(screen.getByText(/schedule-test\.json/i)).toBeInTheDocument();
      expect(screen.getByText(/"cron": "\*\/5 \* \* \* \* \*"/i)).toBeInTheDocument();

      // Switch to JSON Minified
      fireEvent.click(screen.getByText('JSON Minified'));
      expect(screen.getByText(/schedule-test\.json/i)).toBeInTheDocument();
    });

    it('triggers clipboard write when Copy to Clipboard button is clicked in ExportModal', async () => {
      useWorkflowStore.getState().loadSampleWorkflow('schedule-test');

      render(<ExportModal isOpen={true} onClose={() => {}} />);

      const copyBtn = screen.getByText('Copy to Clipboard');
      fireEvent.click(copyBtn);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        useWorkflowStore.getState().rawYaml
      );
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    it('triggers file download when Download File button is clicked in ExportModal', () => {
      useWorkflowStore.getState().loadSampleWorkflow('schedule-test');

      render(<ExportModal isOpen={true} onClose={() => {}} />);

      const downloadBtn = screen.getByText('Download File');
      fireEvent.click(downloadBtn);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * File Browser Modal Integration
   * ========================================================================= */
  describe('File Browser Modal Integration', () => {
    it('renders all bundled samples and allows selection to load into workspace', () => {
      let isModalOpen = true;
      render(
        <FileBrowserModal
          isOpen={isModalOpen}
          onClose={() => {
            isModalOpen = false;
          }}
        />
      );

      expect(screen.getByText('Browse & Open Workflow')).toBeInTheDocument();
      expect(screen.getByText('Upload Local File')).toBeInTheDocument();
      expect(screen.getByText('Bundled Sample Workflows')).toBeInTheDocument();

      for (const sample of SAMPLE_WORKFLOWS) {
        expect(screen.getByText(sample.name)).toBeInTheDocument();
      }

      // Click Test workflow sample
      fireEvent.click(screen.getByText('Test workflow'));
      expect(useWorkflowStore.getState().parsedWorkflow?.id).toBe('test-workflow');
      expect(useWorkflowStore.getState().activeFileName).toBe('test-workflow.yaml');
    });
  });
});
