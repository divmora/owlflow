import React, { useState, useRef } from 'react';
import { useWorkflowStore } from './store/useWorkflowStore';
import { Header } from './components/Header/Header';
import { WorkflowEditor, WorkflowEditorHandle } from './components/Editor/WorkflowEditor';
import { WorkflowDAG } from './components/DAG/WorkflowDAG';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { SimulatorPanel } from './components/Simulator/SimulatorPanel';
import { FileBrowserModal } from './components/FileBrowser/FileBrowserModal';
import { ExportModal } from './components/Export/ExportModal';
import { HelpModal } from './components/Help/HelpModal';
import { SAMPLE_WORKFLOWS } from './samples/sampleWorkflows';
import {
  FileCode,
  Sliders,
  Play,
  UploadCloud,
  Sparkles,
  ArrowRight,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    rawYaml,
    loadSampleWorkflow,
    activeTab,
    setActiveTab,
  } = useWorkflowStore();

  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  const editorRef = useRef<WorkflowEditorHandle>(null);

  const handleOpenSample = (sampleId: string) => {
    loadSampleWorkflow(sampleId);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* Top Application Header */}
      <Header
        onOpenFileBrowser={() => setIsFileBrowserOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        {!rawYaml.trim() ? (
          /* Clean Initial State (No workflow auto-loaded) */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-center overflow-y-auto">
            <div className="max-w-2xl w-full flex flex-col items-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center mb-5 shadow-xl shadow-sky-500/20 ring-1 ring-white/20">
                <FileCode className="h-8 w-8 text-white" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
                OwlFlow Workflow Studio
              </h2>
              <p className="text-sm text-slate-400 max-w-lg mb-8 leading-relaxed">
                Design, validate, visualize interactive DAG execution graphs, and dry-run simulate OwlFlow workflows with Go-template expressions and conditional transitions.
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setIsFileBrowserOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/25 transition active:scale-95"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>Upload or Browse File</span>
                </button>

                <button
                  onClick={() => setIsHelpOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-sky-400 font-semibold text-xs border border-sky-500/30 transition active:scale-95"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Component Guide &amp; Cheat Sheet</span>
                </button>

                <button
                  onClick={() => loadSampleWorkflow('github-monitor')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs border border-slate-700 transition active:scale-95"
                >
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Load GitHub Sample</span>
                </button>
              </div>

              {/* Sample Workflows Quick Grid */}
              <div className="w-full">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 text-left">
                  Explore Bundled Samples
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {SAMPLE_WORKFLOWS.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => handleOpenSample(sample.id)}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-sky-500/50 hover:bg-slate-850 cursor-pointer transition group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-200 group-hover:text-sky-400 transition">
                            {sample.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                            {sample.triggerType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                          {sample.description}
                        </p>
                      </div>

                      <div className="pt-2.5 mt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-500">{sample.filename}</span>
                        <span className="flex items-center gap-1 text-sky-400 font-medium group-hover:translate-x-0.5 transition-transform">
                          <span>Load</span>
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Active 3-Column Studio Layout */
          <div className="flex-1 flex overflow-hidden relative">
            {/* Left Column: Monaco Code Editor & Real-time Validation */}
            {isLeftPanelOpen ? (
              <div className="w-[34%] min-w-[320px] max-w-[500px] h-full flex flex-col relative z-20 border-r border-slate-800">
                <WorkflowEditor ref={editorRef} />
              </div>
            ) : null}

            {/* Left Panel Toggle Tab */}
            <button
              onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
              className="absolute top-3 left-0 z-30 p-1.5 rounded-r-lg bg-slate-900/90 border border-l-0 border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white shadow-lg transition"
              style={{ left: isLeftPanelOpen ? 'calc(34% - 1px)' : '0px' }}
              title={isLeftPanelOpen ? 'Collapse Editor Panel' : 'Expand Editor Panel'}
            >
              {isLeftPanelOpen ? (
                <PanelLeftClose className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftOpen className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Middle Column: Interactive DAG Flowchart Canvas */}
            <div className="flex-1 h-full flex flex-col relative overflow-hidden bg-slate-950">
              <WorkflowDAG />
            </div>

            {/* Right Panel Toggle Tab */}
            <button
              onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
              className="absolute top-3 right-0 z-30 p-1.5 rounded-l-lg bg-slate-900/90 border border-r-0 border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white shadow-lg transition"
              style={{ right: isRightPanelOpen ? 'calc(30% - 1px)' : '0px' }}
              title={isRightPanelOpen ? 'Collapse Side Panel' : 'Expand Side Panel'}
            >
              {isRightPanelOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Right Column: Multi-Tab Inspector & Simulator Panel */}
            {isRightPanelOpen ? (
              <div className="w-[30%] min-w-[300px] max-w-[460px] h-full flex flex-col border-l border-slate-800 bg-slate-900/60 z-20">
                {/* Top Tab Bar: Inspector vs Simulator */}
                <div className="h-10 px-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0 select-none">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab('inspector')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                        activeTab === 'inspector'
                          ? 'bg-slate-800 text-sky-400 shadow-sm border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sliders className="h-3.5 w-3.5" />
                      <span>Inspector</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('simulator')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition ${
                        activeTab === 'simulator'
                          ? 'bg-slate-800 text-sky-400 shadow-sm border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Simulator</span>
                    </button>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-hidden">
                  {activeTab === 'inspector' ? <InspectorPanel /> : <SimulatorPanel />}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Modals */}
      <FileBrowserModal
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
      />
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </div>
  );
};
