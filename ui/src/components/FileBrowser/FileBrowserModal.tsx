import React, { useState, useRef } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { SAMPLE_WORKFLOWS } from '../../samples/sampleWorkflows';
import {
  X,
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Terminal,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface FileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileBrowserModal: React.FC<FileBrowserModalProps> = ({ isOpen, onClose }) => {
  const { loadSampleWorkflow, loadFromFile, activeFileName } = useWorkflowStore();
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    const validExtensions = ['.yaml', '.yml', '.json'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setErrorMsg(`Unsupported file type: "${file.name}". Please select a .yaml, .yml, or .json file.`);
      return;
    }

    try {
      const text = await file.text();
      loadFromFile(file.name, text);
      onClose();
    } catch {
      setErrorMsg(`Failed to read file "${file.name}".`);
    }
  };

  const handleSelectSample = (sampleId: string) => {
    loadSampleWorkflow(sampleId);
    onClose();
  };

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'webhook':
        return <Globe className="h-3.5 w-3.5 text-sky-400" />;
      case 'schedule':
        return <Clock className="h-3.5 w-3.5 text-amber-400" />;
      default:
        return <Terminal className="h-3.5 w-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <FileCode className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Browse & Open Workflow</h2>
              <p className="text-xs text-slate-400">Upload a workflow definition or choose from bundled samples</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Drag & Drop Upload Section */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <UploadCloud className="h-4 w-4 text-sky-400" />
              Upload Local File
            </h3>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition ${
                dragActive
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-950/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".yaml,.yml,.json"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="p-3 rounded-full bg-slate-800/80 text-sky-400 mb-3 shadow-inner">
                <UploadCloud className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-slate-200 text-center">
                Drag and drop your workflow file here, or{' '}
                <span className="text-sky-400 underline underline-offset-2">browse computer</span>
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports YAML (.yaml, .yml) and JSON (.json) definitions</p>
            </div>
          </div>

          {/* Bundled Samples Section */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Bundled Sample Workflows
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SAMPLE_WORKFLOWS.map((sample) => {
                const isSelected = activeFileName === sample.filename;
                return (
                  <div
                    key={sample.id}
                    onClick={() => handleSelectSample(sample.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-sky-950/30 border-sky-500/50 ring-1 ring-sky-500/30'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-slate-100 group-hover:text-sky-400 transition">
                          {sample.name}
                        </span>
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
                          {getTriggerIcon(sample.triggerType)}
                          <span>{sample.triggerType}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                        {sample.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] font-mono">
                      <span className="text-slate-500">{sample.filename}</span>
                      <span className="flex items-center gap-1 text-sky-400 group-hover:translate-x-0.5 transition-transform font-sans font-medium">
                        {isSelected ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Active</span>
                          </>
                        ) : (
                          <>
                            <span>Open</span>
                            <ArrowRight className="h-3 w-3" />
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
