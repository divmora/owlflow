import React, { useState } from 'react';
import { Diagnostic } from '../../types/workflow';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface ValidationBannerProps {
  diagnostics: Diagnostic[];
  onJumpToLine?: (line: number, col?: number) => void;
}

export const ValidationBanner: React.FC<ValidationBannerProps> = ({
  diagnostics,
  onJumpToLine,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const infos = diagnostics.filter((d) => d.severity === 'info');

  const filtered = diagnostics.filter((d) => (filter === 'all' ? true : d.severity === filter));

  if (diagnostics.length === 0) {
    return (
      <div className="h-8 px-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-emerald-400">
        <div className="flex items-center gap-1.5 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          <span>No validation issues found</span>
        </div>
        <span className="text-[11px] text-slate-500">OwlFlow Specification v1.0</span>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 bg-slate-950/95 flex flex-col transition-all">
      {/* Header Bar */}
      <div
        className="h-8 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-900/60 select-none text-xs border-b border-slate-800/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {errors.length > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
              {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
            </span>
          ) : null}
          {warnings.length > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
            </span>
          ) : null}
          {infos.length > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-sky-400">
              <Info className="h-3.5 w-3.5 text-sky-500" />
              {infos.length} {infos.length === 1 ? 'Info' : 'Infos'}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Severity filter pills */}
          <div className="flex items-center bg-slate-900 rounded p-0.5 border border-slate-800 text-[10px]">
            <button
              className={`px-1.5 py-0.5 rounded transition ${
                filter === 'all' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setFilter('all')}
            >
              All ({diagnostics.length})
            </button>
            {errors.length > 0 && (
              <button
                className={`px-1.5 py-0.5 rounded transition ${
                  filter === 'error' ? 'bg-rose-900/80 text-rose-200 font-medium' : 'text-slate-400 hover:text-rose-300'
                }`}
                onClick={() => setFilter('error')}
              >
                Errors ({errors.length})
              </button>
            )}
            {warnings.length > 0 && (
              <button
                className={`px-1.5 py-0.5 rounded transition ${
                  filter === 'warning' ? 'bg-amber-900/80 text-amber-200 font-medium' : 'text-slate-400 hover:text-amber-300'
                }`}
                onClick={() => setFilter('warning')}
              >
                Warnings ({warnings.length})
              </button>
            )}
          </div>

          <button
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Diagnostics List */}
      {isExpanded && (
        <div className="max-h-44 overflow-y-auto p-2 space-y-1.5 text-xs font-mono">
          {filtered.map((diag, index) => {
            const hasLocation = !!diag.range?.startLine;
            return (
              <div
                key={index}
                onClick={() => {
                  if (diag.range && onJumpToLine) {
                    onJumpToLine(diag.range.startLine, diag.range.startCol);
                  }
                }}
                className={`p-2 rounded border flex items-start justify-between gap-2 transition ${
                  diag.severity === 'error'
                    ? 'bg-rose-950/30 border-rose-800/40 text-rose-200 hover:bg-rose-900/30'
                    : diag.severity === 'warning'
                    ? 'bg-amber-950/30 border-amber-800/40 text-amber-200 hover:bg-amber-900/30'
                    : 'bg-sky-950/30 border-sky-800/40 text-sky-200 hover:bg-sky-900/30'
                } ${hasLocation ? 'cursor-pointer hover:border-sky-500/50' : ''}`}
              >
                <div className="flex items-start gap-2 flex-1">
                  <div className="mt-0.5">
                    {diag.severity === 'error' ? (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                    ) : diag.severity === 'warning' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Info className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[10px] px-1 py-0.2 rounded bg-black/40 border border-slate-700">
                        {diag.code}
                      </span>
                      {hasLocation && (
                        <span className="text-[10px] text-slate-400">
                          Line {diag.range?.startLine}:{diag.range?.startCol || 1}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-slate-200 font-sans text-xs break-words">{diag.message}</p>
                    {diag.suggestion && (
                      <p className="mt-0.5 text-[11px] text-slate-400 font-sans italic">
                        💡 Suggestion: {diag.suggestion}
                      </p>
                    )}
                  </div>
                </div>

                {hasLocation && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0 pt-0.5">
                    <span>Jump</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
