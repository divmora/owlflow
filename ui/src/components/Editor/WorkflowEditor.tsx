import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { ValidationBanner } from './ValidationBanner';
import { YamlService } from '../../engine/yaml';
import { Code2, Copy, Check, Wand2, FileText, Layers, AlertCircle } from 'lucide-react';

export interface WorkflowEditorHandle {
  jumpToLine: (line: number, col?: number) => void;
}

export const WorkflowEditor = forwardRef<WorkflowEditorHandle>((_props, ref) => {
  const { rawYaml, setRawYaml, diagnostics, parsedWorkflow, sourceType } = useWorkflowStore();
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useImperativeHandle(ref, () => ({
    jumpToLine: (line: number, col: number = 1) => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: col });
        editorRef.current.focus();
      }
    },
  }));

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define custom dark theme styling
    monaco.editor.defineTheme('owlflow-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'type', foreground: '38bdf8' },
        { token: 'string', foreground: 'a5f3fc' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'keyword', foreground: 'c084fc' },
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#090d16',
        'editor.lineHighlightBackground': '#1e293b40',
        'editorGutter.background': '#090d16',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#94a3b8',
        'editor.selectionBackground': '#38bdf825',
      },
    });
    monaco.editor.setTheme('owlflow-dark');

    updateMarkers(editor, monaco, diagnostics);
  };

  const updateMarkers = (editor: any, monaco: Monaco, diags: typeof diagnostics) => {
    const model = editor.getModel();
    if (!model) return;

    const markers = diags.map((d) => {
      const startLine = d.range?.startLine || 1;
      const startCol = d.range?.startCol || 1;
      const endLine = d.range?.endLine || startLine;
      const endCol = d.range?.endCol || 120;

      const severity =
        d.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info;

      return {
        severity,
        message: `[${d.code}] ${d.message}${d.suggestion ? `\n💡 Suggestion: ${d.suggestion}` : ''}`,
        startLineNumber: startLine,
        startColumn: startCol,
        endLineNumber: endLine,
        endColumn: endCol,
      };
    });

    monaco.editor.setModelMarkers(model, 'owlflow-validator', markers);
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      updateMarkers(editorRef.current, monacoRef.current, diagnostics);
    }
  }, [diagnostics]);

  const handleFormat = () => {
    if (!rawYaml.trim()) return;
    try {
      if (sourceType === 'json') {
        const parsed = JSON.parse(rawYaml);
        setRawYaml(JSON.stringify(parsed, null, 2));
      } else {
        const parsed = YamlService.parse(rawYaml);
        if (parsed.data) {
          const formatted = YamlService.stringify(parsed.data);
          setRawYaml(formatted);
        }
      }
    } catch {
      // If parsing fails, don't reformat
    }
  };

  const handleCopy = () => {
    if (!rawYaml) return;
    navigator.clipboard.writeText(rawYaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJump = (line: number, col: number = 1) => {
    if (editorRef.current) {
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: col });
      editorRef.current.focus();
    }
  };

  const lineCount = rawYaml ? rawYaml.split('\n').length : 0;
  const stepCount = parsedWorkflow?.steps?.length || 0;
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <div className="h-full w-full flex flex-col bg-[#090d16] overflow-hidden border-r border-slate-800">
      {/* Editor Toolbar */}
      <div className="h-10 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Code2 className="h-4 w-4 text-sky-400" />
            Workflow Editor
          </span>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {sourceType}
          </span>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/50">
              <AlertCircle className="h-3 w-3" />
              {errorCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono mr-2">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {lineCount} lines
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {stepCount} steps
            </span>
          </div>

          <button
            onClick={handleFormat}
            disabled={!rawYaml.trim()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition"
            title="Format Code"
          >
            <Wand2 className="h-3.5 w-3.5 text-sky-400" />
            <span className="hidden md:inline">Format</span>
          </button>

          <button
            onClick={handleCopy}
            disabled={!rawYaml.trim()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 transition"
            title="Copy Code"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 hidden md:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden md:inline">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Monaco Code Editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={sourceType === 'json' ? 'json' : 'yaml'}
          theme="owlflow-dark"
          value={rawYaml}
          onChange={(value) => setRawYaml(value || '')}
          onMount={handleEditorDidMount}
          options={{
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace",
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>

      {/* Validation Banner / Diagnostics Drawer */}
      <ValidationBanner diagnostics={diagnostics} onJumpToLine={handleJump} />
    </div>
  );
});

WorkflowEditor.displayName = 'WorkflowEditor';
