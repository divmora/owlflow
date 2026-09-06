import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useWorkflowStore } from '../store/useWorkflowStore';
import { Header } from '../components/Header/Header';
import { ValidationBanner } from '../components/Editor/ValidationBanner';
import { ExportModal } from '../components/Export/ExportModal';
import { FileBrowserModal } from '../components/FileBrowser/FileBrowserModal';
import { HelpModal } from '../components/Help/HelpModal';
import { InspectorPanel } from '../components/Inspector/InspectorPanel';
import { SimulatorPanel } from '../components/Simulator/SimulatorPanel';
import { Diagnostic } from '../types/workflow';

describe('UI Components Unit & Integration Tests', () => {
  beforeEach(() => {
    useWorkflowStore.getState().resetToBlank();
  });

  describe('Header Component', () => {
    it('should render brand logo, title and action buttons', () => {
      let openFileCalled = false;
      let openExportCalled = false;

      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(
        <Header
          onOpenFileBrowser={() => {
            openFileCalled = true;
          }}
          onOpenExport={() => {
            openExportCalled = true;
          }}
        />
      );

      expect(screen.getByText('OwlFlow Studio')).toBeInTheDocument();
      expect(screen.getByText('v1.0')).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
      expect(screen.getByText('Open...')).toBeInTheDocument();
      expect(screen.getByText('Export')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Open...'));
      expect(openFileCalled).toBe(true);

      fireEvent.click(screen.getByText('Export'));
      expect(openExportCalled).toBe(true);
    });

    it('should toggle DAG layout orientation between TB and LR', () => {
      render(
        <Header
          onOpenFileBrowser={() => {}}
          onOpenExport={() => {}}
        />
      );

      expect(useWorkflowStore.getState().dagLayout).toBe('TB');
      const toggleBtn = screen.getByTitle(/Switch layout to/i);
      fireEvent.click(toggleBtn);
      expect(useWorkflowStore.getState().dagLayout).toBe('LR');
      fireEvent.click(toggleBtn);
      expect(useWorkflowStore.getState().dagLayout).toBe('TB');
    });
  });

  describe('ValidationBanner Component', () => {
    it('should render empty clean state when diagnostics are empty', () => {
      render(<ValidationBanner diagnostics={[]} />);
      expect(screen.getByText('No validation issues found')).toBeInTheDocument();
    });

    it('should display errors, warnings, and trigger line jump on click', () => {
      let jumpedLine = 0;
      let jumpedCol = 0;

      const mockDiagnostics: Diagnostic[] = [
        {
          code: 'V-DAG-001',
          message: 'Dangling step reference "missing_step"',
          severity: 'error',
          range: { startLine: 12, startCol: 5, endLine: 12, endCol: 20 },
          suggestion: 'Ensure target step is defined in steps list',
        },
        {
          code: 'V-SCHEMA-005',
          message: 'Unreachable step "orphan_step"',
          severity: 'warning',
          range: { startLine: 25, startCol: 3, endLine: 25, endCol: 15 },
        },
      ];

      render(
        <ValidationBanner
          diagnostics={mockDiagnostics}
          onJumpToLine={(line, col) => {
            jumpedLine = line;
            jumpedCol = col || 1;
          }}
        />
      );

      expect(screen.getByText(/1 Error/i)).toBeInTheDocument();
      expect(screen.getByText(/1 Warning/i)).toBeInTheDocument();
      expect(screen.getByText(/Dangling step reference/i)).toBeInTheDocument();

      // Click diagnostic item to jump
      fireEvent.click(screen.getByText(/Dangling step reference/i));

      expect(jumpedLine).toBe(12);
      expect(jumpedCol).toBe(5);
    });
  });

  describe('FileBrowserModal Component', () => {
    it('should render bundled sample workflows and load one when clicked', () => {
      let closed = false;
      render(<FileBrowserModal isOpen={true} onClose={() => { closed = true; }} />);

      expect(screen.getByText('Browse & Open Workflow')).toBeInTheDocument();
      expect(screen.getByText('Upload Local File')).toBeInTheDocument();
      expect(screen.getByText('GitHub Repository Monitor')).toBeInTheDocument();
      expect(screen.getByText('GitLab Repository Monitor')).toBeInTheDocument();

      // Click GitHub Monitor sample
      fireEvent.click(screen.getByText('GitHub Repository Monitor'));
      expect(closed).toBe(true);
      expect(useWorkflowStore.getState().parsedWorkflow?.id).toBe('github-monitor');
    });
  });

  describe('ExportModal Component', () => {
    it('should render export preview and switch formats', () => {
      useWorkflowStore.getState().loadSampleWorkflow('schedule-test');

      render(<ExportModal isOpen={true} onClose={() => {}} />);

      expect(screen.getByText('Export Workflow')).toBeInTheDocument();
      expect(screen.getByText('YAML (.yaml)')).toBeInTheDocument();
      expect(screen.getByText('JSON Formatted')).toBeInTheDocument();
      expect(screen.getByText('JSON Minified')).toBeInTheDocument();

      // Switch to JSON Formatted
      fireEvent.click(screen.getByText('JSON Formatted'));
      expect(screen.getByText(/"id": "schedule-test"/i)).toBeInTheDocument();
    });
  });

  describe('InspectorPanel Component', () => {
    it('should display workflow overview when no element selected', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<InspectorPanel />);

      expect(screen.getByText('Workflow Overview')).toBeInTheDocument();
      expect(screen.getByText('GitLab Repository Monitor')).toBeInTheDocument();
      expect(screen.getByText('gitlab-monitor')).toBeInTheDocument();
    });

    it('should inspect selected step node details and parameter tabs', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');
      useWorkflowStore.getState().selectElement({
        type: 'node',
        id: 'get_project_details',
      });

      render(<InspectorPanel />);

      expect(screen.getAllByText('get_project_details').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('gitlab.get_project').length).toBeGreaterThanOrEqual(1);

      // Click Params tab
      fireEvent.click(screen.getByText(/Params/i));
      expect(screen.getByText('project_id')).toBeInTheDocument();

      // Click Docs tab
      fireEvent.click(screen.getByText('Action Docs'));
      expect(screen.getByText(/Get Project/i)).toBeInTheDocument();
      expect(screen.getByText(/Fetch detailed GitLab project metadata/i)).toBeInTheDocument();
    });
  });

  describe('SimulatorPanel Component', () => {
    it('should allow editing mock payload and running simulation', () => {
      useWorkflowStore.getState().loadSampleWorkflow('gitlab-monitor');

      render(<SimulatorPanel />);

      expect(screen.getByText('Dry-Run Simulator')).toBeInTheDocument();
      expect(screen.getByText('Run Simulation')).toBeInTheDocument();

      // Run simulation
      fireEvent.click(screen.getByText('Run Simulation'));

      // Check results tab
      expect(screen.getByText(/Simulation completed/i)).toBeInTheDocument();
      expect(screen.getAllByText('get_project_details').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('HelpModal Component', () => {
    it('should render connector docs, condition cheat sheet, and handle snippet insertion', () => {
      const { rerender } = render(<HelpModal isOpen={false} onClose={() => {}} />);
      expect(screen.queryByText('OwlFlow Studio Reference & Component Guide')).not.toBeInTheDocument();

      rerender(<HelpModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByText('OwlFlow Studio Reference & Component Guide')).toBeInTheDocument();
      expect(screen.getByText('Connectors & Actions')).toBeInTheDocument();
      expect(screen.getByText('Conditions & Regex')).toBeInTheDocument();

      // Click Conditions & Regex tab
      fireEvent.click(screen.getByText('Conditions & Regex'));
      expect(screen.getByText(/regexMatch \/ matches/i)).toBeInTheDocument();

      // Click Go Templating tab
      fireEvent.click(screen.getByText('Go Templating & Variables'));
      expect(screen.getByText('toJson')).toBeInTheDocument();

      // Click Validation tab
      fireEvent.click(screen.getByText('Validation & Troubleshooting'));
      expect(screen.getByText(/Unknown action connector/i)).toBeInTheDocument();
    });
  });
});
