import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Globe, Clock, Terminal, ArrowDown, ArrowRight, Zap } from 'lucide-react';

export interface TriggerNodeData {
  id: string;
  triggerType: 'webhook' | 'schedule' | 'manual' | string;
  config?: any;
  initialStep?: string;
  layout?: 'TB' | 'LR';
  [key: string]: any;
}

export const CustomTriggerNode: React.FC<NodeProps> = memo(({ data, selected }) => {
  const nodeData = data as TriggerNodeData;
  const layout = nodeData.layout || 'TB';
  const isTB = layout === 'TB';
  const sourcePos = isTB ? Position.Bottom : Position.Right;

  const triggerType = nodeData.triggerType || 'webhook';
  const config = nodeData.config || {};

  const getTriggerDetails = () => {
    switch (triggerType) {
      case 'webhook':
        return {
          icon: <Globe className="h-4 w-4 text-sky-400" />,
          label: 'Webhook Trigger',
          badge: 'HTTP POST',
          detail: config.path ? `Path: ${config.path}` : 'Default Endpoint',
        };
      case 'schedule':
        return {
          icon: <Clock className="h-4 w-4 text-amber-400" />,
          label: 'Schedule Trigger',
          badge: 'CRON',
          detail: config.cron ? `Cron: ${config.cron}` : 'Scheduled',
        };
      default:
        return {
          icon: <Terminal className="h-4 w-4 text-purple-400" />,
          label: 'Manual Trigger',
          badge: 'MANUAL',
          detail: config.description || 'On-Demand Execution',
        };
    }
  };

  const details = getTriggerDetails();

  return (
    <div
      className={`w-[240px] rounded-xl border bg-slate-900/95 backdrop-blur-md transition-all select-none p-3 relative shadow-lg ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-400/40 shadow-indigo-500/20'
          : 'border-indigo-500/40 hover:border-indigo-400/80 shadow-indigo-500/5'
      }`}
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: '#6366f1',
      }}
    >
      {/* Output Handle */}
      <Handle
        type="source"
        position={sourcePos}
        className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-slate-900 transition hover:!scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
          <Zap className="h-3 w-3 text-indigo-400" />
          <span>TRIGGER</span>
        </div>

        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          {details.badge}
        </span>
      </div>

      {/* Title */}
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100 tracking-tight mb-1">
        {details.icon}
        <span>{details.label}</span>
      </div>

      {/* Config Detail */}
      <div className="text-[11px] font-mono text-slate-400 truncate mb-1">
        {details.detail}
      </div>

      {/* Initial Step Pointer */}
      {nodeData.initialStep && (
        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-indigo-300">
          <span className="text-slate-500 font-sans">Initial Step:</span>
          <span className="flex items-center gap-1 font-bold text-indigo-400 truncate max-w-[120px]">
            {isTB ? <ArrowDown className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
            {nodeData.initialStep}
          </span>
        </div>
      )}
    </div>
  );
});

CustomTriggerNode.displayName = 'CustomTriggerNode';
