import React, { useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { YamlService } from '../../engine/yaml';
import { X, Download, Copy, Check, FileCode, CheckCircle2 } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { rawYaml, parsedWorkflow } = useWorkflowStore();
  const [format, setFormat] = useState<'yaml' | 'json' | 'json-min'>('yaml');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getExportContent = (): { text: string; ext: string; mime: string } => {
    if (format === 'yaml') {
      return {
        text: rawYaml || '',
        ext: 'yaml',
        mime: 'text/yaml',
      };
    }

    if (format === 'json') {
      if (parsedWorkflow) {
        return {
          text: JSON.stringify(parsedWorkflow, null, 2),
          ext: 'json',
          mime: 'application/json',
        };
      }
      try {
        const parsed = YamlService.parse(rawYaml);
        return {
          text: JSON.stringify(parsed.data || {}, null, 2),
          ext: 'json',
          mime: 'application/json',
        };
      } catch {
        return { text: '{}', ext: 'json', mime: 'application/json' };
      }
    }

    // json-min
    if (parsedWorkflow) {
      return {
        text: JSON.stringify(parsedWorkflow),
        ext: 'json',
        mime: 'application/json',
      };
    }
    try {
      const parsed = YamlService.parse(rawYaml);
      return {
        text: JSON.stringify(parsed.data || {}),
        ext: 'json',
        mime: 'application/json',
      };
    } catch {
      return { text: '{}', ext: 'json', mime: 'application/json' };
    }
  };

  const { text: contentToExport, ext, mime } = getExportContent();

  const handleCopy = () => {
    navigator.clipboard.writeText(contentToExport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = `${parsedWorkflow?.id || 'workflow'}.${ext}`;
    const blob = new Blob([contentToExport], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Export Workflow</h2>
              <p className="text-xs text-slate-400">Download or copy definition as YAML or JSON</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Format Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">
              Export Format
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat('yaml')}
                className={`p-3 rounded-lg border text-left transition flex flex-col ${
                  format === 'yaml'
                    ? 'bg-sky-950/40 border-sky-500 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-xs mb-1">
                  <span>YAML (.yaml)</span>
                  {format === 'yaml' && <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />}
                </div>
                <span className="text-[11px] text-slate-500">Standard OwlFlow definition</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`p-3 rounded-lg border text-left transition flex flex-col ${
                  format === 'json'
                    ? 'bg-sky-950/40 border-sky-500 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-xs mb-1">
                  <span>JSON Formatted</span>
                  {format === 'json' && <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />}
                </div>
                <span className="text-[11px] text-slate-500">2-space indented AST</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json-min')}
                className={`p-3 rounded-lg border text-left transition flex flex-col ${
                  format === 'json-min'
                    ? 'bg-sky-950/40 border-sky-500 text-sky-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between font-semibold text-xs mb-1">
                  <span>JSON Minified</span>
                  {format === 'json-min' && <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />}
                </div>
                <span className="text-[11px] text-slate-500">Compact single line</span>
              </button>
            </div>
          </div>

          {/* Preview Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-slate-400" />
                Preview ({contentToExport.length} bytes)
              </label>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-52 overflow-auto whitespace-pre-wrap select-all">
              {contentToExport || '# (Empty workflow)'}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            {parsedWorkflow?.id || 'workflow'}.{ext}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 transition border border-slate-700"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-400" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
