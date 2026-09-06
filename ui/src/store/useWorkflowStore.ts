import { create } from 'zustand';
import { DryRunSimulationEngine } from '../engine/simulator';
import { WorkflowValidator } from '../engine/validator';
import { YamlService } from '../engine/yaml';
import { getSampleWorkflow } from '../samples/sampleWorkflows';
import { Diagnostic, SimulationInput, SimulationResult, ValidationResult, Workflow } from '../types/workflow';

export interface SelectedElement {
  type: 'node' | 'edge' | 'trigger';
  id: string;
  data?: any;
}

export interface WorkflowState {
  // Source Code State
  rawYaml: string;
  activeFileName: string | null;
  sourceType: 'yaml' | 'json';

  // Parsed & Validation State
  parsedWorkflow: Workflow | null;
  validationResult: ValidationResult | null;
  diagnostics: Diagnostic[];
  isValid: boolean;

  // Visual Graph & Selection State
  dagLayout: 'TB' | 'LR';
  selectedElement: SelectedElement | null;
  activeTab: 'inspector' | 'simulator';

  // Simulation State
  simulationInput: SimulationInput;
  simulationVars: Record<string, any>;
  stepMockOverrides: Record<string, any>;
  simulationResult: SimulationResult | null;
  isSimulating: boolean;

  // Actions
  setRawYaml: (content: string) => void;
  loadSampleWorkflow: (sampleId: string) => void;
  loadFromFile: (fileName: string, content: string) => void;
  selectElement: (element: SelectedElement | null) => void;
  setDagLayout: (layout: 'TB' | 'LR') => void;
  setActiveTab: (tab: 'inspector' | 'simulator') => void;
  setSimulationInput: (input: Partial<SimulationInput>) => void;
  setSimulationVars: (vars: Record<string, any>) => void;
  setStepMockOverride: (stepId: string, output: any) => void;
  runSimulation: () => SimulationResult | null;
  resetSimulation: () => void;
  resetToBlank: () => void;
}

const DEFAULT_SIMULATION_INPUT: SimulationInput = {
  payload: {},
  headers: {},
  query: {},
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Clean initial state (no autoload)
  rawYaml: '',
  activeFileName: null,
  sourceType: 'yaml',

  parsedWorkflow: null,
  validationResult: null,
  diagnostics: [],
  isValid: true,

  dagLayout: 'TB',
  selectedElement: null,
  activeTab: 'inspector',

  simulationInput: DEFAULT_SIMULATION_INPUT,
  simulationVars: {},
  stepMockOverrides: {},
  simulationResult: null,
  isSimulating: false,

  setRawYaml: (content: string) => {
    if (!content || !content.trim()) {
      set({
        rawYaml: content,
        parsedWorkflow: null,
        validationResult: null,
        diagnostics: [],
        isValid: true,
        simulationResult: null,
      });
      return;
    }

    const parseRes = YamlService.parse(content);
    const parsedData = parseRes.data as Workflow | null;

    let diagnostics: Diagnostic[] = [];
    let valResult: ValidationResult | null = null;

    if (parseRes.error) {
      diagnostics.push({
        code: 'V-YAML-001',
        message: parseRes.error.message,
        severity: 'error',
        range: parseRes.error.line
          ? {
              startLine: parseRes.error.line,
              startCol: parseRes.error.col || 1,
              endLine: parseRes.error.line,
              endCol: (parseRes.error.col || 1) + 5,
            }
          : undefined,
      });
    }

    if (parsedData) {
      valResult = WorkflowValidator.validate(parsedData, content, parseRes.cst);
      diagnostics = [...diagnostics, ...valResult.diagnostics];
    }

    const hasErrors = diagnostics.some(d => d.severity === 'error');

    set({
      rawYaml: content,
      parsedWorkflow: parsedData,
      validationResult: valResult,
      diagnostics,
      isValid: !hasErrors,
    });
  },

  loadSampleWorkflow: (sampleId: string) => {
    const sample = getSampleWorkflow(sampleId);
    if (!sample) return;

    const parseRes = YamlService.parse(sample.yaml);
    const parsedData = parseRes.data as Workflow | null;
    const valResult = parsedData ? WorkflowValidator.validate(parsedData, sample.yaml, parseRes.cst) : null;
    const diagnostics = valResult ? valResult.diagnostics : [];
    const hasErrors = diagnostics.some(d => d.severity === 'error');

    set({
      rawYaml: sample.yaml,
      activeFileName: sample.filename,
      parsedWorkflow: parsedData,
      validationResult: valResult,
      diagnostics,
      isValid: !hasErrors,
      selectedElement: null,
      simulationResult: null,
      simulationInput: {
        payload: sample.defaultPayload || {},
        headers: sample.defaultHeaders || {},
        query: {},
      },
      simulationVars: sample.defaultVars || {},
    });
  },

  loadFromFile: (fileName: string, content: string) => {
    const parseRes = YamlService.parse(content);
    const parsedData = parseRes.data as Workflow | null;
    const valResult = parsedData ? WorkflowValidator.validate(parsedData, content, parseRes.cst) : null;
    let diagnostics: Diagnostic[] = parseRes.error
      ? [
          {
            code: 'V-YAML-001',
            message: parseRes.error.message,
            severity: 'error',
          },
        ]
      : [];
    if (valResult) {
      diagnostics = [...diagnostics, ...valResult.diagnostics];
    }

    const hasErrors = diagnostics.some(d => d.severity === 'error');

    set({
      rawYaml: content,
      activeFileName: fileName,
      parsedWorkflow: parsedData,
      validationResult: valResult,
      diagnostics,
      isValid: !hasErrors,
      selectedElement: null,
      simulationResult: null,
    });
  },

  selectElement: (element: SelectedElement | null) => {
    set({ selectedElement: element });
  },

  setDagLayout: (layout: 'TB' | 'LR') => {
    set({ dagLayout: layout });
  },

  setActiveTab: (tab: 'inspector' | 'simulator') => {
    set({ activeTab: tab });
  },

  setSimulationInput: (input: Partial<SimulationInput>) => {
    set(state => ({
      simulationInput: {
        ...state.simulationInput,
        ...input,
      },
    }));
  },

  setSimulationVars: (vars: Record<string, any>) => {
    set({ simulationVars: vars });
  },

  setStepMockOverride: (stepId: string, output: any) => {
    set(state => ({
      stepMockOverrides: {
        ...state.stepMockOverrides,
        [stepId]: output,
      },
    }));
  },

  runSimulation: () => {
    const { parsedWorkflow, simulationInput, simulationVars, stepMockOverrides } = get();
    if (!parsedWorkflow) return null;

    set({ isSimulating: true });
    try {
      const engine = new DryRunSimulationEngine();
      const result = engine.simulate({
        workflow: parsedWorkflow,
        triggerInput: simulationInput,
        initialVars: simulationVars,
        stepMockOverrides,
      });

      set({ simulationResult: result, isSimulating: false });
      return result;
    } catch {
      set({ isSimulating: false });
      return null;
    }
  },

  resetSimulation: () => {
    set({ simulationResult: null });
  },

  resetToBlank: () => {
    set({
      rawYaml: '',
      activeFileName: null,
      parsedWorkflow: null,
      validationResult: null,
      diagnostics: [],
      isValid: true,
      selectedElement: null,
      simulationResult: null,
      simulationInput: DEFAULT_SIMULATION_INPUT,
      simulationVars: {},
      stepMockOverrides: {},
    });
  },
}));
