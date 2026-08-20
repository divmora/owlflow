import React, { useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { getActionMetadata } from '../../types/connectors';
import { Step } from '../../types/workflow';
import {
  Sliders,
  FileCode,
  GitFork,
  CheckCircle2,
  Copy,
  Check,
  Zap,
  ChevronRight,
} from 'lucide-react';

export const InspectorPanel: React.FC = () => {
  const { parsedWorkflow, selectedElement, simulationResult } = useWorkflowStore();
  const [activeTab, setActiveTab] = useState<'details' | 'params' | 'docs' | 'branching' | 'raw'>('details');
  const [copied, setCopied] = useState(false);

  // Helper to copy JSON
  const handleCopyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Find step from selected node ID
  const selectedStep: Step | undefined = parsedWorkflow?.steps?.find(
    (s) => s.id === selectedElement?.id
  );

  // 1. If NO element is selected: Show Workflow Summary
  if (!selectedElement) {
    if (!parsedWorkflow) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-slate-500 select-none">
          <Sliders className="h-8 w-8 text-slate-700 mb-2" />
          <p className="text-xs font-medium text-slate-400">Inspector</p>
          <p className="text-[11px] text-slate-600 mt-1">Select a node or transition edge on the DAG canvas to inspect properties.</p>
        </div>
      );
    }

    return (
      <div className="h-full w-full flex flex-col bg-slate-900/50 overflow-y-auto p-4 select-none">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <FileCode className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Workflow Overview</h3>
            <span className="text-[10px] font-mono text-slate-500">{parsedWorkflow.id}</span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Name:</span>
              <span className="font-semibold text-slate-200">{parsedWorkflow.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {parsedWorkflow.status || 'active'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Trigger:</span>
              <span className="font-mono text-sky-400">{parsedWorkflow.trigger?.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Initial Step:</span>
              <span className="font-mono text-indigo-400">{parsedWorkflow.trigger?.config?.initial_step}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Steps:</span>
              <span className="font-mono text-slate-200">{parsedWorkflow.steps?.length || 0}</span>
            </div>
          </div>

          {parsedWorkflow.vars && Object.keys(parsedWorkflow.vars).length > 0 && (
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="text-[11px] font-semibold text-slate-400 mb-1.5">Workflow Variables (.vars)</div>
              <pre className="p-2 rounded bg-slate-900 font-mono text-[11px] text-sky-300 overflow-x-auto">
                {JSON.stringify(parsedWorkflow.vars, null, 2)}
              </pre>
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400">
            <p className="leading-relaxed">
              💡 <strong className="text-slate-300">Tip:</strong> Click any step node or edge transition on the DAG flowchart to inspect its parameters, connector documentation, and branch condition expressions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. If TRIGGER node is selected:
  if (selectedElement.type === 'trigger' || selectedElement.id === '__trigger__') {
    const trigger = parsedWorkflow?.trigger;
    const config = trigger?.config || {};

    return (
      <div className="h-full w-full flex flex-col bg-slate-900/50 overflow-y-auto p-4 select-none">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Trigger Inspector</h3>
            <span className="text-[10px] font-mono text-indigo-400 uppercase">{trigger?.type || 'Trigger'}</span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Trigger Type:</span>
              <span className="font-mono text-indigo-300 uppercase font-semibold">{trigger?.type}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Initial Step:</span>
              <span className="font-mono text-sky-400">{config.initial_step || 'None'}</span>
            </div>
            {config.path && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Endpoint Path:</span>
                <span className="font-mono text-slate-300">{config.path}</span>
              </div>
            )}
            {config.cron && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Cron Schedule:</span>
                <span className="font-mono text-amber-300">{config.cron}</span>
              </div>
            )}
            {config.timezone && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Timezone:</span>
                <span className="font-mono text-slate-300">{config.timezone}</span>
              </div>
            )}
            {config.description && (
              <div className="pt-1 border-t border-slate-800/80">
                <span className="text-slate-400 block mb-0.5">Description:</span>
                <p className="text-slate-300 text-[11px]">{config.description}</p>
              </div>
            )}
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-400">Trigger Config AST</span>
              <button
                onClick={() => handleCopyJson(config)}
                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-2 rounded bg-slate-900 font-mono text-[11px] text-slate-300 overflow-x-auto">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // 3. If EDGE is selected: Show Condition / Transition Inspector
  if (selectedElement.type === 'edge') {
    const edgeData = selectedElement.data || {};
    const condition = edgeData.condition || '';
    const isActive = !!edgeData.isActive;
    const isBypassed = !!edgeData.isBypassed;
    const [source, target] = selectedElement.id.split('->');

    return (
      <div className="h-full w-full flex flex-col bg-slate-900/50 overflow-y-auto p-4 select-none">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <GitFork className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">Transition Inspector</h3>
            <span className="text-[10px] font-mono text-slate-500">{selectedElement.id}</span>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Source Step:</span>
              <span className="font-mono text-sky-300 font-semibold">{source || 'Trigger'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Target Step:</span>
              <span className="font-mono text-indigo-300 font-semibold">{target}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Simulation State:</span>
              {isActive ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Taken (Active)
                </span>
              ) : isBypassed ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  Bypassed
                </span>
              ) : (
                <span className="text-slate-500 text-[11px]">Not simulated</span>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] font-semibold text-slate-300 mb-1.5">Condition Expression</div>
            {condition ? (
              <div className="p-2 rounded bg-slate-900 font-mono text-xs text-sky-300 border border-slate-800 break-all">
                {condition}
              </div>
            ) : (
              <div className="p-2 rounded bg-slate-900 text-slate-500 text-xs italic">
                Default branch (Unconditional transition)
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. If STEP NODE is selected: Show Multi-Tab Step Inspector
  const step = selectedStep || (selectedElement.data?.step as Step);
  if (!step) {
    return (
      <div className="p-4 text-xs text-slate-500">Step details not found.</div>
    );
  }

  const actionMeta = getActionMetadata(step.action);
  const connectorDef = actionMeta?.category;
  const actionDef = actionMeta?.action;

  const stepOutput = simulationResult?.stepOutputs?.[step.id];
  const stepExecLog = simulationResult?.executionLogs?.find((l) => l.stepId === step.id);

  return (
    <div className="h-full w-full flex flex-col bg-slate-900/50 overflow-hidden select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="p-1.5 rounded-lg border flex items-center justify-center shrink-0"
              style={{
                backgroundColor: connectorDef ? `${connectorDef.accentColor}15` : '#1e293b',
                borderColor: connectorDef ? `${connectorDef.accentColor}40` : '#334155',
                color: connectorDef?.accentColor || '#38bdf8',
              }}
            >
              <Sliders className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-100 font-mono truncate">{step.id}</h3>
              <p className="text-[11px] text-slate-400 font-mono truncate">{step.action}</p>
            </div>
          </div>

          {stepOutput !== undefined && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              Executed
            </span>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-3 border-b border-slate-800 text-[11px] font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-1.5 px-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'details'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('params')}
            className={`pb-1.5 px-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'params'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Params ({Object.keys(step.params || {}).length})
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`pb-1.5 px-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'docs'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Action Docs
          </button>
          <button
            onClick={() => setActiveTab('branching')}
            className={`pb-1.5 px-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'branching'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Branching ({step.next_steps?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('raw')}
            className={`pb-1.5 px-2 border-b-2 transition whitespace-nowrap ${
              activeTab === 'raw'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Raw AST
          </button>
        </div>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
        {/* Tab 1: Details */}
        {activeTab === 'details' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Step ID:</span>
                <span className="font-mono text-slate-200 font-bold">{step.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Action:</span>
                <span className="font-mono text-sky-300">{step.action}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Connector:</span>
                <span className="font-semibold text-slate-200 capitalize">
                  {connectorDef?.name || step.action.split('.')[0]}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Retries:</span>
                <span className="font-mono text-slate-300">{step.retries ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Timeout:</span>
                <span className="font-mono text-slate-300">{step.timeout ? `${step.timeout}s` : 'default (30s)'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Pass Output:</span>
                <span className="font-mono text-slate-300">{step.pass_output !== false ? 'true' : 'false'}</span>
              </div>
            </div>

            {/* Execution Result if Simulated */}
            {stepOutput !== undefined && (
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-emerald-800/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Simulation Output
                  </span>
                  <button
                    onClick={() => handleCopyJson(stepOutput)}
                    className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-2 rounded bg-slate-900 font-mono text-[11px] text-sky-300 overflow-x-auto max-h-48">
                  {JSON.stringify(stepOutput, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Parameters */}
        {activeTab === 'params' && (
          <div className="space-y-3">
            {step.params && Object.keys(step.params).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(step.params).map(([key, val]) => {
                  const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                  const isTemplate = valStr.includes('{{') && valStr.includes('}}');
                  const resolvedVal = stepExecLog?.resolvedParams?.[key];

                  return (
                    <div key={key} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-sky-300">{key}</span>
                        {isTemplate && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            Template
                          </span>
                        )}
                      </div>

                      <div className="p-1.5 rounded bg-slate-900 font-mono text-[11px] text-slate-300 break-all">
                        {typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val)}
                      </div>

                      {resolvedVal !== undefined && (
                        <div className="pt-1 text-[10px] font-mono text-emerald-400">
                          <span className="text-slate-500 font-sans">Resolved: </span>
                          <span>{typeof resolvedVal === 'object' ? JSON.stringify(resolvedVal) : String(resolvedVal)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-slate-500 italic bg-slate-950/40 rounded-lg border border-slate-800">
                No parameters configured for this step.
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Action Docs */}
        {activeTab === 'docs' && (
          <div className="space-y-3">
            {actionDef ? (
              <div className="space-y-3">
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <h4 className="font-bold text-slate-200 text-xs">{actionDef.displayName}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{actionDef.description}</p>
                </div>

                {/* Expected Parameters Schema */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <h5 className="font-semibold text-slate-300 text-[11px] mb-2 uppercase tracking-wider">
                    Parameters Schema
                  </h5>
                  <div className="space-y-2">
                    {actionDef.params.map((p) => (
                      <div key={p.name} className="p-2 rounded bg-slate-900/80 border border-slate-800/80 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sky-300 font-semibold">{p.name}</span>
                          <div className="flex items-center gap-1 text-[10px] font-mono">
                            <span className="text-slate-500">{p.type}</span>
                            {p.required ? (
                              <span className="text-rose-400 font-bold">*required</span>
                            ) : (
                              <span className="text-slate-500">optional</span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Output Description & Example */}
                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <h5 className="font-semibold text-slate-300 text-[11px] mb-1 uppercase tracking-wider">
                    Output Schema
                  </h5>
                  <p className="text-[11px] text-slate-400 mb-2">{actionDef.outputDescription}</p>
                  <pre className="p-2 rounded bg-slate-900 font-mono text-[11px] text-slate-300 overflow-x-auto">
                    {JSON.stringify(actionDef.exampleOutput, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-3 text-center text-slate-500 italic bg-slate-950/40 rounded-lg border border-slate-800">
                Custom or unregistered action. No catalog documentation available.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Branching */}
        {activeTab === 'branching' && (
          <div className="space-y-2">
            {step.next_steps && step.next_steps.length > 0 ? (
              step.next_steps.map((next, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sky-400 flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {next.step_id}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Branch #{idx + 1}</span>
                  </div>

                  <div className="text-[11px] font-mono">
                    <span className="text-slate-400 block mb-0.5 font-sans">Condition:</span>
                    {next.condition ? (
                      <div className="p-1.5 rounded bg-slate-900 text-sky-300 break-all border border-slate-800">
                        {next.condition}
                      </div>
                    ) : (
                      <div className="text-slate-500 italic">Always transition (default)</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-center text-slate-500 italic bg-slate-950/40 rounded-lg border border-slate-800">
                Terminal step. No outgoing transitions.
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Raw AST */}
        {activeTab === 'raw' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Step AST Object</span>
              <button
                onClick={() => handleCopyJson(step)}
                className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-96">
              {JSON.stringify(step, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
