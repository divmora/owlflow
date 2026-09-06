import React, { useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';

export const SimulatorPanel: React.FC = () => {
  const {
    parsedWorkflow,
    simulationInput,
    setSimulationInput,
    simulationVars,
    setSimulationVars,
    simulationResult,
    runSimulation,
    resetSimulation,
    isSimulating,
  } = useWorkflowStore();

  const [activeSubTab, setActiveSubTab] = useState<'inputs' | 'results'>('inputs');
  const [inputCategory, setInputCategory] = useState<'payload' | 'headers' | 'query' | 'vars'>('payload');
  const [expandedTimelineStep, setExpandedTimelineStep] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Local text states for JSON editing to allow freeform typing
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(simulationInput.payload || {}, null, 2)
  );
  const [headersText, setHeadersText] = useState<string>(
    JSON.stringify(simulationInput.headers || {}, null, 2)
  );
  const [queryText, setQueryText] = useState<string>(
    JSON.stringify(simulationInput.query || {}, null, 2)
  );
  const [varsText, setVarsText] = useState<string>(
    JSON.stringify(simulationVars || {}, null, 2)
  );

  // Handle Input Changes
  const handlePayloadChange = (text: string) => {
    setPayloadText(text);
    try {
      const parsed = JSON.parse(text);
      setSimulationInput({ payload: parsed });
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON in payload: ${e.message}`);
    }
  };

  const handleHeadersChange = (text: string) => {
    setHeadersText(text);
    try {
      const parsed = JSON.parse(text);
      setSimulationInput({ headers: parsed });
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON in headers: ${e.message}`);
    }
  };

  const handleQueryChange = (text: string) => {
    setQueryText(text);
    try {
      const parsed = JSON.parse(text);
      setSimulationInput({ query: parsed });
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON in query: ${e.message}`);
    }
  };

  const handleVarsChange = (text: string) => {
    setVarsText(text);
    try {
      const parsed = JSON.parse(text);
      setSimulationVars(parsed);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Invalid JSON in vars: ${e.message}`);
    }
  };

  const handleRun = () => {
    const res = runSimulation();
    if (res) {
      setActiveSubTab('results');
      // Expand first executed step by default
      const firstStep = res.executedSteps?.[0] || res.executedStepIds?.[0];
      if (firstStep) setExpandedTimelineStep(firstStep);
    }
  };

  const handleCopyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executedStepIds = simulationResult?.executedStepIds || simulationResult?.executedSteps || [];
  const bypassedStepIds = simulationResult?.bypassedStepIds || simulationResult?.bypassedSteps || [];

  return (
    <div className="h-full w-full flex flex-col bg-slate-900/50 overflow-hidden select-none">
      {/* Simulator Header & Controls */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Play className="h-4 w-4 fill-current" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100">Dry-Run Simulator</h3>
              <p className="text-[11px] text-slate-400">Mock inputs & client-side evaluation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {simulationResult && (
              <button
                onClick={resetSimulation}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 transition"
                title="Reset simulation results"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              onClick={handleRun}
              disabled={!parsedWorkflow || isSimulating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed shadow transition active:scale-95"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{isSimulating ? 'Simulating...' : 'Run Simulation'}</span>
            </button>
          </div>
        </div>

        {/* Sub-tabs: Inputs vs Results */}
        <div className="flex items-center gap-1 mt-3 border-b border-slate-800 text-[11px] font-medium">
          <button
            onClick={() => setActiveSubTab('inputs')}
            className={`pb-1.5 px-2.5 border-b-2 transition ${
              activeSubTab === 'inputs'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Mock Inputs
          </button>
          <button
            onClick={() => setActiveSubTab('results')}
            className={`pb-1.5 px-2.5 border-b-2 transition flex items-center gap-1.5 ${
              activeSubTab === 'results'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Results</span>
            {simulationResult && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {/* SUBTAB 1: Mock Inputs Form */}
        {activeSubTab === 'inputs' && (
          <div className="space-y-3 flex flex-col h-full">
            {/* Input Category Pills */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setInputCategory('payload')}
                className={`flex-1 py-1 rounded text-center transition font-mono text-[10px] ${
                  inputCategory === 'payload'
                    ? 'bg-slate-800 text-sky-300 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Payload
              </button>
              <button
                onClick={() => setInputCategory('headers')}
                className={`flex-1 py-1 rounded text-center transition font-mono text-[10px] ${
                  inputCategory === 'headers'
                    ? 'bg-slate-800 text-sky-300 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Headers
              </button>
              <button
                onClick={() => setInputCategory('query')}
                className={`flex-1 py-1 rounded text-center transition font-mono text-[10px] ${
                  inputCategory === 'query'
                    ? 'bg-slate-800 text-sky-300 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Query
              </button>
              <button
                onClick={() => setInputCategory('vars')}
                className={`flex-1 py-1 rounded text-center transition font-mono text-[10px] ${
                  inputCategory === 'vars'
                    ? 'bg-slate-800 text-sky-300 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Variables
              </button>
            </div>

            {/* Error Message if invalid JSON */}
            {jsonError && (
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            {/* JSON Code Input Area */}
            <div className="flex-1 flex flex-col min-h-[220px]">
              <div className="text-[11px] font-semibold text-slate-400 mb-1 flex items-center justify-between">
                <span>
                  {inputCategory === 'payload' && 'Trigger Payload (.trigger.payload)'}
                  {inputCategory === 'headers' && 'HTTP Headers (.trigger.headers)'}
                  {inputCategory === 'query' && 'Query Parameters (.trigger.query)'}
                  {inputCategory === 'vars' && 'Workflow Initial Variables (.vars)'}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">JSON</span>
              </div>

              <textarea
                value={
                  inputCategory === 'payload'
                    ? payloadText
                    : inputCategory === 'headers'
                    ? headersText
                    : inputCategory === 'query'
                    ? queryText
                    : varsText
                }
                onChange={(e) => {
                  if (inputCategory === 'payload') handlePayloadChange(e.target.value);
                  else if (inputCategory === 'headers') handleHeadersChange(e.target.value);
                  else if (inputCategory === 'query') handleQueryChange(e.target.value);
                  else handleVarsChange(e.target.value);
                }}
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-200 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
                spellCheck={false}
              />
            </div>

            <p className="text-[11px] text-slate-500 italic">
              These mock inputs will be injected into Go-template expressions and condition evaluations during dry-run simulation.
            </p>
          </div>
        )}

        {/* SUBTAB 2: Results View */}
        {activeSubTab === 'results' && (
          <div className="space-y-3">
            {!simulationResult ? (
              <div className="p-6 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                <Play className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                <p className="font-semibold text-slate-400">No Simulation Executed Yet</p>
                <p className="text-[11px] text-slate-600 mt-1 max-w-xs mx-auto mb-3">
                  Click 'Run Simulation' to dry-run evaluate the workflow against your mock trigger inputs.
                </p>
                <button
                  onClick={handleRun}
                  disabled={!parsedWorkflow}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition"
                >
                  Run Simulation
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary Banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    simulationResult.status === 'completed'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {simulationResult.status === 'completed' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold text-xs capitalize">
                        Simulation {simulationResult.status}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {executedStepIds.length} executed • {bypassedStepIds.length} bypassed
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-slate-800">
                    ID: {simulationResult.executionId || 'dryrun'}
                  </span>
                </div>

                {/* Execution Flow Path */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 mb-1.5">Executed Path</div>
                  <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                    {executedStepIds.map((stepId, i) => (
                      <React.Fragment key={stepId}>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                          {stepId}
                        </span>
                        {i < executedStepIds.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Bypassed Steps Pill if any */}
                {bypassedStepIds.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-500 mb-1">Bypassed Steps</div>
                    <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                      {bypassedStepIds.map((stepId) => (
                        <span
                          key={stepId}
                          className="px-2 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800 line-through"
                        >
                          {stepId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step Timeline & Output Details */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Step Execution Timeline
                  </div>

                  {simulationResult.timeline && simulationResult.timeline.length > 0 ? (
                    simulationResult.timeline.map((entry, idx) => {
                      const isExpanded = expandedTimelineStep === entry.stepId;
                      const transitionLogs = simulationResult.transitionLogs?.filter(
                        (t) => t.fromStepId === entry.stepId
                      );

                      return (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden"
                        >
                          <div
                            onClick={() =>
                              setExpandedTimelineStep(isExpanded ? null : entry.stepId)
                            }
                            className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-900/80 select-none transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[10px] text-slate-500 font-bold">
                                #{idx + 1}
                              </span>
                              <span className="font-mono font-bold text-slate-200 truncate">
                                {entry.stepId}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 truncate">
                                ({entry.action})
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono text-slate-400">
                                {entry.durationMs}ms
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  entry.status === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {entry.status}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Step Details */}
                          {isExpanded && (
                            <div className="p-3 border-t border-slate-800 bg-slate-900/40 space-y-2.5 text-xs">
                              {/* Resolved Parameters */}
                              {entry.resolvedParams && Object.keys(entry.resolvedParams).length > 0 && (
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Resolved Parameters
                                  </span>
                                  <pre className="p-2 rounded bg-slate-950 font-mono text-[11px] text-sky-300 overflow-x-auto border border-slate-800">
                                    {JSON.stringify(entry.resolvedParams, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Action Output */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Action Output
                                  </span>
                                  <button
                                    onClick={() => handleCopyJson(entry.output)}
                                    className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                                  >
                                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                    <span>Copy</span>
                                  </button>
                                </div>
                                <pre className="p-2 rounded bg-slate-950 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-48 border border-slate-800">
                                  {JSON.stringify(entry.output, null, 2)}
                                </pre>
                              </div>

                              {/* Outgoing Transitions Evaluated */}
                              {transitionLogs && transitionLogs.length > 0 && (
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Branch Conditions Evaluated
                                  </span>
                                  <div className="space-y-1.5">
                                    {transitionLogs.map((t, tIdx) => (
                                      <div
                                        key={tIdx}
                                        className={`p-2 rounded border text-[11px] font-mono flex items-center justify-between gap-2 ${
                                          t.evaluatedResult
                                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                                            : 'bg-slate-950/50 border-slate-800 text-slate-500'
                                        }`}
                                      >
                                        <div className="truncate">
                                          <span>➔ {t.toStepId}: </span>
                                          <span className="italic">{t.condition || '(default)'}</span>
                                        </div>
                                        <span className="font-bold text-[10px] px-1.5 py-0.2 rounded bg-black/40">
                                          {t.evaluatedResult ? 'TRUE' : 'FALSE'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 rounded bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                      Simulation finished without timeline records.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
