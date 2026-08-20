import YAML, { LineCounter, Document, isNode } from 'yaml';
import { YamlParseResult } from '../types/engine';
import { DiagnosticRange } from '../types/workflow';

/**
 * Safe YAML and JSON Parser with CST line/column tracking
 */
export class YamlService {
  /**
   * Parses raw YAML/JSON string into structured JS object with error diagnostics
   */
  public static parse(content: string): YamlParseResult {
    if (!content || !content.trim()) {
      return { data: null };
    }

    const trimmed = content.trim();

    // Check if it's pure JSON
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const data = JSON.parse(content);
        return { data };
      } catch (jsonErr: any) {
        // Fall back to YAML parser
      }
    }

    try {
      const lineCounter = new LineCounter();
      const doc = YAML.parseDocument(content, { lineCounter, keepSourceTokens: true });

      if (doc.errors && doc.errors.length > 0) {
        const firstErr = doc.errors[0];
        const linePos = firstErr.linePos ? firstErr.linePos[0] : undefined;
        return {
          data: doc.toJS(),
          error: {
            message: firstErr.message,
            line: linePos?.line,
            col: linePos?.col,
            pos: firstErr.pos ? firstErr.pos[0] : undefined,
          },
          cst: doc,
        };
      }

      return {
        data: doc.toJS(),
        cst: doc,
      };
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err.message || 'Failed to parse YAML',
        },
      };
    }
  }

  /**
   * Stringify object into clean formatted YAML
   */
  public static stringify(data: any): string {
    if (data === null || data === undefined) return '';
    return YAML.stringify(data, {
      indent: 2,
      lineWidth: 0,
      nullStr: '',
    });
  }

  /**
   * Stringify object into pretty formatted JSON
   */
  public static stringifyJson(data: any): string {
    if (data === null || data === undefined) return '';
    return JSON.stringify(data, null, 2);
  }

  /**
   * Finds the line and column range of a given AST path in the YAML document
   */
  public static findNodeRange(
    doc: Document | null | undefined,
    path: (string | number)[],
    content?: string
  ): DiagnosticRange | undefined {
    if (!doc) {
      if (content && path.length > 0) {
        return this.fallbackFindPathInText(content, path);
      }
      return undefined;
    }

    try {
      const node = doc.getIn(path, true);
      if (node && isNode(node) && node.range) {
        const startPos = node.range[0];
        const endPos = node.range[1] ?? node.range[0];

        if (content) {
          const start = this.posToLineCol(content, startPos);
          const end = this.posToLineCol(content, endPos);
          return {
            startLine: start.line,
            startCol: start.col,
            endLine: end.line,
            endCol: Math.max(end.col, start.col + 1),
          };
        }
      }
    } catch {
      // Ignore CST lookup failures
    }

    if (content && path.length > 0) {
      return this.fallbackFindPathInText(content, path);
    }

    return undefined;
  }

  public static posToLineCol(content: string, pos: number): { line: number; col: number } {
    let line = 1;
    let col = 1;

    for (let i = 0; i < pos && i < content.length; i++) {
      if (content[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }

    return { line, col };
  }

  private static fallbackFindPathInText(
    content: string,
    path: (string | number)[]
  ): DiagnosticRange | undefined {
    const lines = content.split('\n');
    const targetKey = String(path[path.length - 1]);

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const keyIdx = lineText.indexOf(targetKey);
      if (keyIdx !== -1) {
        return {
          startLine: i + 1,
          startCol: keyIdx + 1,
          endLine: i + 1,
          endCol: keyIdx + 1 + targetKey.length,
        };
      }
    }

    return undefined;
  }
}

// Function exports for convenient direct usage
export function parseYaml(content: string): YamlParseResult {
  return YamlService.parse(content);
}

export function stringifyYaml(data: unknown): string {
  return YamlService.stringify(data);
}

export function stringifyJson(data: unknown): string {
  return YamlService.stringifyJson(data);
}
