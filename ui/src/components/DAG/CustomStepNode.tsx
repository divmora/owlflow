import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CONNECTOR_CATALOG } from '../../types/connectors';
import {
  Globe,
  GitBranch,
  Terminal,
  FileCode,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

export interface StepNodeData {
  id: string;
  action?: string;
  connectorType?: string;
  step?: any;
  executionStatus?: 'completed' | 'bypassed' | 'failed' | 'unreached';
  output?: any;
  layout?: 'TB' | 'LR';
  [key: string]: any;
}

const CONNECTOR_ICONS: Record<string, React.ReactNode> = {
  http: <Globe className="h-3.5 w-3.5" />,
  gitlab: <GitBranch className="h-3.5 w-3.5" />,
  jira: <FileCode className="h-3.5 w-3.5" />,
  logger: <Terminal className="h-3.5 w-3.5" />,
  internal: <Sparkles className="h-3.5 w-3.5" />,
  slack: <MessageSquare className="h-3.5 w-3.5" />,
};

export const CustomStepNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as StepNodeData;
  const connectorType = nodeData.connectorType || (nodeData.action ? nodeData.action.split('.')[0] : 'unknown');
  const category = CONNECTOR_CATALOG[connectorType];
  const layout = nodeData.layout || 'TB';

  const isTB = layout === 'TB';
  const targetPos = isTB ? Position.Top : Position.Left;
  const sourcePos = isTB ? Position.Bottom : Position.Right;

  const status = nodeData.executionStatus;

  // Status-based styling
  let borderClasses = 'border-slate-700/80 hover:border-slate-500';
  let bgClasses = 'bg-slate-900/90';
  let glowClasses = '';
  let statusBadge: React.ReactNode = null;

  if (status === 'completed') {
    borderClasses = 'border-emerald-500 ring-2 ring-emerald-500/20';
    bgClasses = 'bg-emerald-950/20';
    glowClasses = 'shadow-lg shadow-emerald-500/10';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        Done
      </span>
    );
  } else if (status === 'bypassed') {
    borderClasses = 'border-dashed border-slate-700/60 opacity-60';
    bgClasses = 'bg-slate-950/40';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-700/40">
        <MinusCircle className="h-3 w-3" />
        Bypassed
      </span>
    );
  } else if (status === 'failed') {
    borderClasses = 'border-rose-500 ring-2 ring-rose-500/20';
    bgClasses = 'bg-rose-950/30';
    glowClasses = 'shadow-lg shadow-rose-500/10';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
        <AlertTriangle className="h-3 w-3" />
        Failed
      </span>
    );
  }

  // Selected highlight
  if (selected) {
    borderClasses = 'border-sky-400 ring-2 ring-sky-400/40';
    glowClasses = 'shadow-xl shadow-sky-500/20';
  }

  const icon = CONNECTOR_ICONS[connectorType] || <Terminal className="h-3.5 w-3.5" />;
  const badgeBg = category?.badgeBg || 'bg-slate-800';
  const badgeText = category?.badgeText || 'text-slate-300';
  const accentColor = category?.accentColor || '#64748b';

  return (
    <div
      className={`w-[240px] rounded-xl border backdrop-blur-md transition-all select-none p-3 relative ${bgClasses} ${borderClasses} ${glowClasses}`}
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: accentColor,
      }}
    >
      {/* React Flow Handles */}
      <Handle
        type="target"
        position={targetPos}
        className="!w-2.5 !h-2.5 !bg-slate-400 !border-2 !border-slate-900 transition hover:!bg-sky-400"
      />
      <Handle
        type="source"
        position={sourcePos}
        className="!w-2.5 !h-2.5 !bg-sky-500 !border-2 !border-slate-900 transition hover:!scale-125"
      />

      {/* Header: Action Badge & Status */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium border border-white/5 ${badgeBg} ${badgeText}`}
        >
          {icon}
          <span className="truncate max-w-[110px]">{nodeData.action || 'step'}</span>
        </div>

        {statusBadge}
      </div>

      {/* Step ID Title */}
      <div className="text-xs font-bold text-slate-100 font-mono truncate tracking-tight mb-1" title={nodeData.id}>
        {nodeData.id}
      </div>

      {/* Step Parameters Preview or Output */}
      {nodeData.output !== undefined ? (
        <div className="mt-1 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono text-slate-300 truncate">
          <span className="text-slate-400 font-sans">Output: </span>
          <span className="text-sky-300">
            {typeof nodeData.output === 'object'
              ? JSON.stringify(nodeData.output).slice(0, 30) + '...'
              : String(nodeData.output)}
          </span>
        </div>
      ) : nodeData.step?.params ? (
        <div className="mt-1 pt-1 border-t border-slate-800/60 text-[10px] text-slate-400 flex items-center justify-between font-mono">
          <span>{Object.keys(nodeData.step.params).length} param(s)</span>
          {nodeData.step.retries ? (
            <span className="flex items-center gap-0.5 text-amber-400">
              <Clock className="h-2.5 w-2.5" />
              {nodeData.step.retries}x
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

CustomStepNode.displayName = 'CustomStepNode';
