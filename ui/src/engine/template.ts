import { ExecutionContext } from '../types/workflow';

/**
 * Custom Template Helper Functions
 */
export const TEMPLATE_FUNCTIONS: Record<string, (...args: any[]) => any> = {
  /**
   * Serializes any value to a compact JSON string.
   */
  toJson: (data: any): string => {
    if (data === undefined) return 'null';
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  },

  /**
   * Serializes any value to an indented JSON string (2 spaces).
   */
  toPrettyJson: (data: any): string => {
    if (data === undefined) return 'null';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  },

  /**
   * Returns the first item of an array/slice, or the value itself if not an array.
   */
  first: (items: any): any => {
    if (Array.isArray(items) && items.length > 0) {
      return items[0];
    }
    return items;
  },

  /**
   * Retrieves an item from an object or array by key/index.
   */
  index: (data: any, key: any): any => {
    if (data === null || data === undefined) return null;
    if (typeof data === 'object' || Array.isArray(data)) {
      return data[key] ?? null;
    }
    return null;
  },

  /**
   * Tests if a string begins with a specific prefix.
   */
  hasPrefix: (str: any, prefix: any): boolean => {
    if (typeof str !== 'string' || typeof prefix !== 'string') return false;
    return str.startsWith(prefix);
  },

  /**
   * Tests if a string matches a regular expression pattern.
   */
  regexMatch: (arg1: any, arg2: any): boolean => {
    const testPattern = (item: string, pat: string) => {
      try {
        if (pat.startsWith('/') && pat.lastIndexOf('/') > 0) {
          const last = pat.lastIndexOf('/');
          return new RegExp(pat.slice(1, last).replace(/\\\//g, '/'), pat.slice(last + 1)).test(item);
        }
        let flags = '';
        let body = pat;
        const fm = body.match(/^\(\?([ims]+)\)/);
        if (fm) {
          flags = fm[1];
          body = body.slice(fm[0].length);
        }
        return new RegExp(body, flags).test(item);
      } catch {
        return false;
      }
    };
    const s1 = String(arg1 ?? '');
    const s2 = String(arg2 ?? '');
    return testPattern(s1, s2) || testPattern(s2, s1);
  },

  matches: (arg1: any, arg2: any): boolean => {
    return TEMPLATE_FUNCTIONS.regexMatch(arg1, arg2);
  },
};

/**
 * Go-Template Expression Resolution Engine
 */
export class GoTemplateEngine {
  private funcs = { ...TEMPLATE_FUNCTIONS };

  /**
   * Recursively resolves values (string templates, objects, arrays, primitives)
   */
  public resolveValue(value: any, ctx: ExecutionContext): any {
    if (typeof value === 'string') {
      return this.processStringTemplate(value, ctx);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.resolveValue(item, ctx));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.resolveValue(v, ctx);
      }
      return result;
    }
    return value;
  }

  /**
   * Renders Go template tags inside a string and applies auto JSON type coercion.
   */
  public processStringTemplate(templateStr: string, ctx: ExecutionContext): any {
    if (!templateStr.includes('{{')) {
      return this.parsePotentialJSON(templateStr);
    }

    const fullContext: any = {
      ...ctx,
      trigger: ctx.trigger || {},
      TriggerData: ctx.trigger || {},
      inputs: ctx.trigger || {},
      steps: ctx.steps || {},
      vars: ctx.vars || {},
      variables: ctx.vars || {},
      parent: ctx.parent || [],
    };

    // 1. Process control blocks ({{ if ... }} ... {{ else }} ... {{ end }})
    let rendered = this.processControlBlocks(templateStr, fullContext);

    // 2. Process inline expressions ({{ ... }})
    rendered = rendered.replace(/\{\{\s*(.+?)\s*\}\}/g, (_match, expr) => {
      try {
        const val = this.evaluateExpression(expr.trim(), fullContext);
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
          return JSON.stringify(val);
        }
        return String(val);
      } catch {
        return '';
      }
    });

    return this.parsePotentialJSON(rendered);
  }

  /**
   * Evaluates a template expression with pipeline support (|)
   */
  public evaluateExpression(expr: string, context: any): any {
    const pipes = expr.split('|').map(p => p.trim());
    let currentVal: any = undefined;

    for (let i = 0; i < pipes.length; i++) {
      const part = pipes[i];
      if (i === 0) {
        currentVal = this.evaluateSingleTerm(part, context);
      } else {
        const funcParts = this.tokenizeArguments(part);
        const funcName = funcParts[0];
        const fn = this.funcs[funcName];
        if (typeof fn === 'function') {
          const extraArgs = funcParts.slice(1).map(arg => this.resolveTokenValue(arg, context));
          currentVal = fn(currentVal, ...extraArgs);
        }
      }
    }

    return currentVal;
  }

  private evaluateSingleTerm(term: string, context: any): any {
    term = term.trim();

    // Strip outer parentheses if any: e.g. (index .TriggerData.headers "User-Agent")
    if (term.startsWith('(') && term.endsWith(')')) {
      term = term.slice(1, -1).trim();
    }

    const parts = this.tokenizeArguments(term);
    if (parts.length > 1 && this.funcs[parts[0]]) {
      const funcName = parts[0];
      const fn = this.funcs[funcName];
      const args = parts.slice(1).map(arg => this.resolveTokenValue(arg, context));
      return fn(...args);
    }

    return this.resolveTokenValue(term, context);
  }

  private tokenizeArguments(str: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let parenDepth = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if ((char === '"' || char === "'") && (i === 0 || str[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
        current += char;
      } else if (char === '(' && !inQuotes) {
        parenDepth++;
        current += char;
      } else if (char === ')' && !inQuotes) {
        parenDepth--;
        current += char;
      } else if (/\s/.test(char) && !inQuotes && parenDepth === 0) {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }
    if (current.length > 0) tokens.push(current);
    return tokens;
  }

  private resolveTokenValue(token: string, context: any): any {
    token = token.trim();

    // Parenthesized expression
    if (token.startsWith('(') && token.endsWith(')')) {
      return this.evaluateSingleTerm(token.slice(1, -1), context);
    }

    // String literal
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }

    // Number literal
    if (!isNaN(Number(token)) && token !== '') {
      return Number(token);
    }

    // Boolean literal
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'nil' || token === 'null') return null;

    // Dot accessor path: e.g. '.trigger.payload.user_id' or 'TriggerData.headers'
    const cleanPath = token.startsWith('.') ? token.slice(1) : token;
    return this.getNestedProperty(context, cleanPath);
  }

  private getNestedProperty(obj: any, path: string): any {
    if (!path) return obj;
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  private processControlBlocks(str: string, context: any): string {
    const ifRegex = /\{\{\s*if\s+([\s\S]+?)\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*end\s*\}\}/g;
    return str.replace(ifRegex, (_match, conditionExpr, trueBlock, falseBlock = '') => {
      const condVal = this.evaluateSingleTerm(conditionExpr.trim(), context);
      const isTruthy = Boolean(
        condVal &&
        condVal !== 'false' &&
        condVal !== '0' &&
        (Array.isArray(condVal) ? condVal.length > 0 : true)
      );
      return isTruthy ? trueBlock : falseBlock;
    });
  }

  private parsePotentialJSON(s: string): any {
    const trimmed = s.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return s;
      }
    }
    return s;
  }
}

export function resolveTemplate(tmpl: string, context: ExecutionContext): unknown {
  const engine = new GoTemplateEngine();
  return engine.processStringTemplate(tmpl, context);
}

export function resolveParams(params: Record<string, any>, context: ExecutionContext): Record<string, any> {
  const engine = new GoTemplateEngine();
  return engine.resolveValue(params, context);
}
