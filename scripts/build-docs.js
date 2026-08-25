#!/usr/bin/env node

/**
 * OwlFlow Documentation & AI Portal Builder
 * Generates:
 * 1. Static HTML documentation website for GitHub Pages
 * 2. llms.txt (Standard curated AI sitemap & documentation manifest)
 * 3. llms-full.txt (Consolidated single-file documentation for 1-shot AI scraping)
 * 4. Raw markdown mirror (.md endpoints) for direct AI fetching
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
// Output directory defaults to dist-docs or can be specified via command line (e.g. `ui/dist`)
const targetArg = process.argv[2];
const outDir = targetArg ? path.resolve(process.cwd(), targetArg) : path.resolve(rootDir, 'dist-docs');
const docsDir = path.join(outDir, 'docs');
const docsWorkflowsDir = path.join(docsDir, 'workflows');
const rootWorkflowsDir = path.join(outDir, 'workflows');

// Ensure output directories exist
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(docsWorkflowsDir, { recursive: true });
fs.mkdirSync(rootWorkflowsDir, { recursive: true });

const docPages = [
  { file: 'README.md', slug: 'index', title: 'Home / Overview', section: 'Getting Started' },
  { file: 'AGENTS.md', slug: 'agents', title: 'AI Agent Guidelines', section: 'AI & Developer Guides' },
  { file: 'docs/overview.md', slug: 'overview', title: 'Engine Architecture & DAG', section: 'Architecture' },
  { file: 'docs/getting-started.md', slug: 'getting-started', title: 'Quickstart & Installation', section: 'Getting Started' },
  { file: 'docs/connectors.md', slug: 'connectors', title: 'Connectors Reference', section: 'Core References' },
  { file: 'docs/templating-and-conditions.md', slug: 'templating-and-conditions', title: 'Templates & Conditions', section: 'Core References' },
  { file: 'docs/configuration.md', slug: 'configuration', title: 'Workflow Schema & Security', section: 'Core References' },
  { file: 'docs/deployment.md', slug: 'deployment', title: 'Docker & AWS Lambda Deployment', section: 'Operations' },
  { file: 'docs/ui.md', slug: 'ui', title: 'Developer UI & Simulator', section: 'Operations' },
];

// Helper to escape HTML
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Lightweight Markdown to HTML parser
function renderMarkdown(md) {
  let html = md;

  // Code blocks with syntax highlight wrapper
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const escaped = escapeHtml(code.trim());
    return `<div class="code-block my-4 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shadow-md">
      <div class="flex items-center justify-between px-4 py-1.5 bg-slate-950/80 border-b border-slate-800 text-xs font-mono text-slate-400">
        <span>${lang || 'text'}</span>
        <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(code.trim())}'))" class="hover:text-white transition-colors">Copy</button>
      </div>
      <pre class="p-4 overflow-x-auto text-sm text-slate-200 font-mono leading-relaxed"><code>${escaped}</code></pre>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-xs border border-slate-700">$1</code>');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-white mt-6 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-sky-400 mt-8 mb-4 border-b border-slate-800 pb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold text-white mb-6">$1</h1>');

  // GitHub Callout Alerts
  html = html.replace(/>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*\n?)*)/gim, (match, type, content) => {
    const text = content.replace(/^>\s?/gm, '').trim();
    const colors = {
      NOTE: 'border-blue-500 bg-blue-500/10 text-blue-300',
      TIP: 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
      IMPORTANT: 'border-purple-500 bg-purple-500/10 text-purple-300',
      WARNING: 'border-amber-500 bg-amber-500/10 text-amber-300',
      CAUTION: 'border-rose-500 bg-rose-500/10 text-rose-300',
    };
    return `<div class="my-4 p-4 border-l-4 rounded-r-lg ${colors[type] || colors.NOTE}">
      <div class="font-bold text-xs uppercase tracking-wider mb-1">${type}</div>
      <div class="text-sm leading-relaxed">${text}</div>
    </div>`;
  });

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-slate-600 pl-4 py-1 my-3 text-slate-400 italic">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr class="my-8 border-slate-800" />');

  // Unordered list items
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-300 my-1">$1</li>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');

  // Tables
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim() !== '');
    if (cells.some(c => c.includes('---'))) {
      return '';
    }
    const isHeader = match.includes('---');
    const tag = isHeader ? 'th' : 'td';
    const row = cells.map(c => `<${tag} class="border border-slate-800 px-3 py-2 text-sm ${tag === 'th' ? 'bg-slate-900 font-bold text-sky-300' : 'text-slate-300'}">${c.trim()}</${tag}>`).join('');
    return `<tr>${row}</tr>`;
  });

  // Wrap tables
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/gs, '<div class="overflow-x-auto my-6"><table class="w-full border-collapse border border-slate-800 text-left">$1</table></div>');

  // Paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<div') || p.startsWith('<table') || p.startsWith('<hr') || p.startsWith('<li') || p.startsWith('<blockquote')) {
      return p;
    }
    return `<p class="my-3 text-slate-300 leading-relaxed">${p}</p>`;
  }).join('\n');

  return html;
}

function buildHtmlPage(page, contentHtml, rawMdName) {
  const navHtml = docPages.map(p => {
    const isActive = p.slug === page.slug;
    const targetUrl = p.slug === 'index' ? 'index.html' : `${p.slug}.html`;
    return `<li>
      <a href="${targetUrl}" class="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}">
        <span>${escapeHtml(p.title)}</span>
      </a>
    </li>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en" class="dark bg-slate-950 text-slate-200">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.title)} — OwlFlow Documentation</title>
  <meta name="description" content="Official documentation and AI reference for OwlFlow automation engine.">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #020617; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
  </style>
</head>
<body class="min-h-screen flex flex-col bg-slate-950 text-slate-200 antialiased selection:bg-sky-500 selection:text-white">
  <!-- Top Navigation Header -->
  <header class="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur">
    <div class="max-w-7xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
      <div class="flex items-center gap-3">
        <a href="index.html" class="flex items-center gap-2 font-bold text-lg text-white hover:opacity-90 transition-opacity">
          <span class="p-1 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">🦉</span>
          <span>OwlFlow <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-normal">Docs</span></span>
        </a>
      </div>
      <div class="flex items-center gap-2.5 sm:gap-3 text-sm">
        <a href="../" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all text-xs shadow-md shadow-sky-500/20">
          <span>⚡</span>
          <span>Launch Studio</span>
        </a>
        <a href="../llms.txt" class="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 transition-all font-mono text-xs font-semibold">
          <span>🤖</span>
          <span>llms.txt</span>
        </a>
        <a href="../llms-full.txt" class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all font-mono text-xs font-semibold">
          <span>📄</span>
          <span>llms-full.txt</span>
        </a>
        <a href="${rawMdName}" class="hidden lg:inline-block text-xs text-slate-400 hover:text-sky-400 font-mono transition-colors">
          Raw Markdown
        </a>
        <a href="https://github.com/divmora/owlflow" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-white transition-colors">
          GitHub ↗
        </a>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <div class="max-w-7xl mx-auto w-full flex-1 flex px-4 sm:px-6 py-6 gap-8">
    <!-- Sidebar Navigation -->
    <aside class="w-64 shrink-0 hidden md:block">
      <div class="sticky top-20 flex flex-col gap-6">
        <div>
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 px-3">Documentation Pages</h4>
          <ul class="space-y-1">
            ${navHtml}
          </ul>
        </div>
        <div class="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
          <div class="font-bold text-white flex items-center gap-1.5">
            <span>🤖</span> AI Scraper Ready
          </div>
          <p>This site provides <a href="../llms.txt" class="text-sky-400 underline">llms.txt</a> and <a href="../llms-full.txt" class="text-sky-400 underline">llms-full.txt</a> for automated LLM ingestion.</p>
        </div>
      </div>
    </aside>

    <!-- Content Area -->
    <main class="flex-1 min-w-0 max-w-4xl pb-16">
      <div class="prose prose-invert max-w-none">
        ${contentHtml}
      </div>
    </main>
  </div>

  <!-- Footer -->
  <footer class="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
    <p>OwlFlow — Declarative Workflow Automation Engine in Go & Developer UI. Open Source under Apache 2.0.</p>
  </footer>
</body>
</html>`;
}

// 1. Process all documentation pages
const allDocsTextParts = [];

for (const page of docPages) {
  const filePath = path.join(rootDir, page.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    continue;
  }

  const rawMd = fs.readFileSync(filePath, 'utf8');
  allDocsTextParts.push(`\n================================================================================\n# DOCUMENT: ${page.file} (${page.title})\n================================================================================\n\n${rawMd}\n`);

  // Write raw markdown mirror for direct scraping inside docs/
  const rawFileName = page.slug === 'index' ? 'README.md' : `${page.slug}.md`;
  fs.writeFileSync(path.join(docsDir, rawFileName), rawMd, 'utf8');

  // Render HTML inside docs/
  const renderedHtml = renderMarkdown(rawMd);
  const fullHtml = buildHtmlPage(page, renderedHtml, rawFileName);
  const outHtmlPath = path.join(docsDir, page.slug === 'index' ? 'index.html' : `${page.slug}.html`);
  fs.writeFileSync(outHtmlPath, fullHtml, 'utf8');
}

// Copy sample workflows into docs/workflows and workflows/
const workflowsDir = path.join(rootDir, 'configs', 'workflows');
if (fs.existsSync(workflowsDir)) {
  const wfFiles = fs.readdirSync(workflowsDir);
  for (const wf of wfFiles) {
    if (wf.endsWith('.yaml') || wf.endsWith('.json') || wf.endsWith('.yml')) {
      const srcPath = path.join(workflowsDir, wf);
      const content = fs.readFileSync(srcPath, 'utf8');
      fs.writeFileSync(path.join(docsWorkflowsDir, wf), content, 'utf8');
      fs.writeFileSync(path.join(rootWorkflowsDir, wf), content, 'utf8');
      allDocsTextParts.push(`\n================================================================================\n# SAMPLE WORKFLOW: configs/workflows/${wf}\n================================================================================\n\n${content}\n`);
    }
  }
}

// 2. Generate llms-full.txt at root of outDir
const llmsFullHeader = `# OwlFlow Complete Technical Documentation & Reference Manifest
# Generated for AI Assistants, LLMs, and Automated Scrapers
# Repository: https://github.com/divmora/owlflow
#
# This file contains the complete, consolidated technical documentation for the OwlFlow workflow engine,
# including all connectors (Jira, GitLab, HTTP, Logger, Internal), condition syntax, template functions,
# architecture specifications, deployment guides, and sample workflows.
`;

const fullTextContent = llmsFullHeader + '\n' + allDocsTextParts.join('\n');
fs.writeFileSync(path.join(outDir, 'llms-full.txt'), fullTextContent, 'utf8');

// 3. Generate llms.txt at root of outDir (Standard AI Sitemap Manifest)
const llmsTxtContent = `# OwlFlow Documentation for LLMs & AI Coding Agents

> OwlFlow is a lightweight, high-performance declarative workflow automation engine written in Go, accompanied by a developer UI in React, Vite, and Tailwind CSS.

## Full Documentation Bundle
- [llms-full.txt](llms-full.txt): Complete, all-in-one consolidated markdown documentation for instant ingestion.

## Documentation Sections
- [Home / README](docs/README.md): Project overview, feature summary, quick development commands.
- [AI Agent Guidelines (AGENTS.md)](docs/agents.md): Agent working conventions, testing commands, architecture overview.
- [Architecture & Engine Overview](docs/overview.md): DAG execution engine, breadth-first traversal, context isolation, AWS Lambda mode.
- [Connectors Reference](docs/connectors.md): Complete reference for Jira (check_user_comment, get_comments, transition_issue, search_issues), GitLab, HTTP, Logger, and Internal connectors.
- [Templating & Condition Engine](docs/templating-and-conditions.md): Go template syntax, built-in helpers (toJson, first, index), boolean conditions, regexMatch, and hasPrefix.
- [Workflow Configuration Schema](docs/configuration.md): Complete YAML/JSON schema, Webhook HMAC-SHA256 signature verification, 6-field Cron syntax.
- [Getting Started & Local Setup](docs/getting-started.md): Installation, running Go backend (:8080) and Developer UI (:5173).
- [Production Deployment](docs/deployment.md): Multi-stage Docker containerization, AWS Lambda Web Adapter deployment.
- [Developer UI & Simulator](docs/ui.md): ReactFlow DAG visualizer, YAML editor, Vitest testing suites.

## Sample Workflows
- [jira-comment-check.yaml](docs/workflows/jira-comment-check.yaml): Jira user comment verification and conditional 2-way branching.
- [gitlab-monitor.yaml](docs/workflows/gitlab-monitor.yaml): GitLab webhook event handling and project metadata retrieval.
- [github-monitor.yaml](docs/workflows/github-monitor.yaml): GitHub commit verification with Slack alert notification.
- [schedule_test.yaml](docs/workflows/schedule_test.yaml): 6-field sub-minute Cron workflow execution.
`;

fs.writeFileSync(path.join(outDir, 'llms.txt'), llmsTxtContent, 'utf8');

// 4. Generate robots.txt at root of outDir
const robotsTxt = `User-agent: *
Allow: /

Sitemap: https://divmora.github.io/owlflow/sitemap.xml
`;
fs.writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt, 'utf8');

console.log(`✅ Successfully built OwlFlow Documentation & AI Portal in ${path.relative(rootDir, outDir) || '.'}/`);
console.log(`   - Documentation Pages: ${path.join(path.relative(rootDir, docsDir) || 'docs')}`);
console.log('   - Root Manifests: llms.txt, llms-full.txt, robots.txt');
