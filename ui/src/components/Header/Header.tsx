import React from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { SAMPLE_WORKFLOWS } from '../../samples/sampleWorkflows';
import {
  GitFork,
  Play,
  FilePlus,
  FolderOpen,
  Download,
  ArrowDownUp,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface HeaderProps {
  onOpenFileBrowser: () => void;
  onOpenExport: () => void;
  onOpenHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenFileBrowser,
  onOpenExport,
  onOpenHelp = () => {},
}) => {
  const {
    rawYaml,
    activeFileName,
    parsedWorkflow,
    diagnostics,
    isValid,
    dagLayout,
    setDagLayout,
    loadSampleWorkflow,
    resetToBlank,
    runSimulation,
    setActiveTab,
    isSimulating,
  } = useWorkflowStore();

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const handleNewWorkflow = () => {
    if (rawYaml.trim() && !window.confirm('Clear current workflow and start a new blank definition?')) {
      return;
    }
    resetToBlank();
  };

  const handleSimulate = () => {
    setActiveTab('simulator');
    runSimulation();
  };

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-30">
      {/* Left: Brand & Workflow Identity */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/10">
          <GitFork className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              OwlFlow Studio
            </h1>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
              v1.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-xs font-mono">
            {activeFileName || (parsedWorkflow?.id ? `${parsedWorkflow.id}.yaml` : 'No workflow loaded')}
          </p>
        </div>
      </div>

      {/* Center: File Actions & Sample Dropdown */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleNewWorkflow}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
          title="Create New Blank Workflow"
        >
          <FilePlus className="h-3.5 w-3.5 text-sky-400" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          onClick={onOpenFileBrowser}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
          title="Open File or Sample"
        >
          <FolderOpen className="h-3.5 w-3.5 text-sky-400" />
          <span className="hidden sm:inline">Open...</span>
        </button>

        {/* Sample Selector Dropdown */}
        <div className="relative hidden md:flex items-center">
          <select
            className="bg-slate-800/80 border border-slate-700/80 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer transition hover:bg-slate-750"
            value={
              SAMPLE_WORKFLOWS.find((s) => s.filename === activeFileName || s.id === parsedWorkflow?.id)?.id || ''
            }
            onChange={(e) => {
              if (e.target.value) {
                loadSampleWorkflow(e.target.value);
              }
            }}
          >
            <option value="">-- Choose Sample --</option>
            {SAMPLE_WORKFLOWS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.filename})
              </option>
            ))}
          </select>
          <Sparkles className="h-3.5 w-3.5 text-amber-400 absolute left-2.5 pointer-events-none" />
        </div>

        <button
          onClick={onOpenExport}
          disabled={!rawYaml.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/80 transition"
          title="Export as YAML / JSON"
        >
          <Download className="h-3.5 w-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          onClick={onOpenHelp}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition shadow-sm"
          title="Open In-App Component & Syntax Guide"
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Docs &amp; Guide</span>
        </button>

        <a
          href="./docs/index.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
          title="Open Full Documentation Portal in New Tab"
        >
          <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
          <span>Full Docs ↗</span>
        </a>

        <a
          href="./llms.txt"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition"
          title="View AI / LLM Sitemap Manifest"
        >
          <Sparkles className="h-3.5 w-3.5 text-purple-400" />
          <span>llms.txt</span>
        </a>
      </div>

      {/* Right: Layout Toggle, Validation Status & Simulate Button */}
      <div className="flex items-center gap-2.5">
        {/* Layout Orientation Toggle */}
        <button
          onClick={() => setDagLayout(dagLayout === 'TB' ? 'LR' : 'TB')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 transition"
          title={`Switch layout to ${dagLayout === 'TB' ? 'Left-to-Right (LR)' : 'Top-to-Bottom (TB)'}`}
        >
          {dagLayout === 'TB' ? (
            <>
              <ArrowDownUp className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden lg:inline text-[11px]">Top-Bottom</span>
            </>
          ) : (
            <>
              <ArrowLeftRight className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden lg:inline text-[11px]">Left-Right</span>
            </>
          )}
        </button>

        {/* Validation Status Indicator */}
        {rawYaml.trim() ? (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
              isValid
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            }`}
          >
            {isValid ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden md:inline">Valid Schema</span>
                {warningCount > 0 && (
                  <span className="text-[10px] text-amber-400 font-mono">({warningCount}w)</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                <span>
                  {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
                </span>
                {warningCount > 0 && (
                  <span className="text-[10px] text-amber-400 font-mono">({warningCount}w)</span>
                )}
              </>
            )}
          </div>
        ) : null}

        {/* Simulate Action Button */}
        <button
          onClick={handleSimulate}
          disabled={!parsedWorkflow || !isValid || isSimulating}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-sky-500/20 transition active:scale-95"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Simulate</span>
        </button>
      </div>
    </header>
  );
};
