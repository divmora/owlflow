import React, { memo } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from '@xyflow/react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { GitCommit, Check, Minus } from 'lucide-react';

export const CustomConditionEdge: React.FC<EdgeProps> = memo((props) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
    markerEnd,
  } = props;

  const { selectElement } = useWorkflowStore();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const condition = (data?.condition as string) || '';
  const isActive = !!data?.isActive;
  const isBypassed = !!data?.isBypassed;

  // Stroke and style determination
  let strokeColor = '#475569'; // slate-600
  let strokeWidth = 1.5;
  let strokeDasharray: string | undefined = undefined;

  if (isActive) {
    strokeColor = '#10b981'; // emerald-500
    strokeWidth = 2.5;
  } else if (isBypassed) {
    strokeColor = '#334155'; // slate-700
    strokeDasharray = '5 5';
  }

  if (selected) {
    strokeColor = '#38bdf8'; // sky-400
    strokeWidth = 2.5;
  }

  // Format condition for pill display
  const formatConditionLabel = (cond: string) => {
    if (!cond) return null;
    // Clean up template wrappers for more readable display if needed
    let clean = cond.trim();
    if (clean.startsWith('{{') && clean.endsWith('}}')) {
      clean = clean.slice(2, -2).trim();
    }
    return clean;
  };

  const labelText = formatConditionLabel(condition);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          transition: 'stroke 0.2s, stroke-width 0.2s',
        }}
      />

      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
            onClick={(e) => {
              e.stopPropagation();
              selectElement({ type: 'edge', id, data });
            }}
          >
            <div
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1 border shadow-md transition-all cursor-pointer select-none max-w-[200px] truncate ${
                isActive
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : isBypassed
                  ? 'bg-slate-950/80 text-slate-500 border-slate-800 line-through opacity-70'
                  : selected
                  ? 'bg-sky-950/90 text-sky-200 border-sky-400 ring-1 ring-sky-400/40'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-slate-500 hover:text-white'
              }`}
              title={condition}
            >
              {isActive ? (
                <Check className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
              ) : isBypassed ? (
                <Minus className="h-2.5 w-2.5 text-slate-500 shrink-0" />
              ) : (
                <GitCommit className="h-2.5 w-2.5 text-slate-400 shrink-0" />
              )}
              <span className="truncate">{labelText}</span>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

CustomConditionEdge.displayName = 'CustomConditionEdge';
