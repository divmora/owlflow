import { ASTNode, ConditionEvaluationResult } from '../types/engine';
import { ExecutionContext } from '../types/workflow';
import { GoTemplateEngine } from './template';

/**
 * Condition Expression Parser and Evaluator for OwlFlow transitions
 * Replicates Go core condition evaluation logic from core/condition.go
 */
export class ConditionParser {
  private pos = 0;
  private input = '';

  public parse(input: string): ASTNode {
    this.input = input.trim();
    this.pos = 0;
    if (!this.input) {
      return { type: 'Literal', value: true };
    }
    return this.parseOr();
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.match('||')) {
      const right = this.parseAnd();
      left = { type: 'BinaryOp', operator: '||', left, right };
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.match('&&')) {
      const right = this.parseEquality();
      left = { type: 'BinaryOp', operator: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseRelational();
    while (true) {
      if (this.match('==')) {
        const right = this.parseRelational();
        left = { type: 'BinaryOp', operator: '==', left, right };
      } else if (this.match('!=')) {
        const right = this.parseRelational();
        left = { type: 'BinaryOp', operator: '!=', left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseRelational(): ASTNode {
    let left = this.parseUnary();
    while (true) {
      if (this.match('<=')) {
        left = { type: 'BinaryOp', operator: '<=', left, right: this.parseUnary() };
      } else if (this.match('>=')) {
        left = { type: 'BinaryOp', operator: '>=', left, right: this.parseUnary() };
      } else if (this.match('<')) {
        left = { type: 'BinaryOp', operator: '<', left, right: this.parseUnary() };
      } else if (this.match('>')) {
        left = { type: 'BinaryOp', operator: '>', left, right: this.parseUnary() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.match('!')) {
      return { type: 'UnaryOp', operator: '!', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    this.skipWhitespace();

    // Parentheses
    if (this.match('(')) {
      const node = this.parseOr();
      if (!this.match(')')) {
        throw new Error(`Expected closing parenthesis at position ${this.pos}`);
      }
      return node;
    }

    // Function call: hasPrefix (prefix syntax e.g. "hasPrefix item prefix" or functional syntax "hasPrefix(item, prefix)")
    if (this.peekIdentifier() === 'hasPrefix') {
      this.consumeIdentifier();
      this.skipWhitespace();
      const args: ASTNode[] = [];
      if (this.match('(')) {
        args.push(this.parseOr());
        while (this.match(',')) {
          args.push(this.parseOr());
        }
        if (!this.match(')')) throw new Error('Expected ) after hasPrefix arguments');
      } else {
        args.push(this.parsePrimary());
        args.push(this.parsePrimary());
      }
      return { type: 'FunctionCall', name: 'hasPrefix', args };
    }

    // String Literal
    const quote = this.peek();
    if (quote === '"' || quote === "'") {
      return { type: 'Literal', value: this.consumeString() };
    }

    // Number Literal
    if (/[0-9]/.test(quote) || (quote === '-' && /[0-9]/.test(this.input[this.pos + 1]))) {
      return { type: 'Literal', value: this.consumeNumber() };
    }

    // Identifier / Boolean / Null / PropertyPath / Unquoted String
    const ident = this.consumeTokenString();
    if (ident === 'true') return { type: 'Literal', value: true };
    if (ident === 'false') return { type: 'Literal', value: false };
    if (ident === 'null' || ident === 'nil') return { type: 'Literal', value: null };

    const pathParts = ident.startsWith('.') ? ident.slice(1).split('.') : ident.split('.');
    return { type: 'PropertyAccess', path: pathParts };
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private match(str: string): boolean {
    this.skipWhitespace();
    if (this.input.startsWith(str, this.pos)) {
      this.pos += str.length;
      return true;
    }
    return false;
  }

  private peekIdentifier(): string {
    this.skipWhitespace();
    const match = this.input.slice(this.pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    return match ? match[0] : '';
  }

  private consumeIdentifier(): string {
    const id = this.peekIdentifier();
    this.pos += id.length;
    return id;
  }

  private consumeString(): string {
    const quote = this.input[this.pos++];
    let result = '';
    while (this.pos < this.input.length) {
      const c = this.input[this.pos++];
      if (c === '\\') {
        result += this.input[this.pos++];
      } else if (c === quote) {
        return result;
      } else {
        result += c;
      }
    }
    return result;
  }

  private consumeNumber(): number {
    this.skipWhitespace();
    const match = this.input.slice(this.pos).match(/^-?[0-9]+(?:\.[0-9]+)?/);
    if (!match) throw new Error(`Invalid number at position ${this.pos}`);
    this.pos += match[0].length;
    return Number(match[0]);
  }

  private consumeTokenString(): string {
    this.skipWhitespace();
    // Allow characters including hyphens, slashes, and dots
    const match = this.input.slice(this.pos).match(/^[^\s,()=!><&|]+/);
    if (!match) throw new Error(`Unexpected token at position ${this.pos}: "${this.input.slice(this.pos, this.pos + 10)}"`);
    this.pos += match[0].length;
    return match[0];
  }
}

/**
 * Evaluates transition condition expressions against an ExecutionContext
 */
export class ConditionEvaluator {
  private templateEngine = new GoTemplateEngine();

  /**
   * Evaluates condition against ExecutionContext
   */
  public evaluate(condition: string | undefined, ctx: ExecutionContext): ConditionEvaluationResult {
    if (!condition || condition.trim() === '') {
      return { result: true };
    }

    try {
      // Step 1: Render Go template string if present
      let rendered = condition.trim();
      if (condition.includes('{{')) {
        const processed = this.templateEngine.processStringTemplate(condition, ctx);
        rendered = typeof processed === 'string' ? processed.trim() : JSON.stringify(processed);
      }

      if (rendered === '' || rendered === 'true' || rendered === '1' || rendered === 't') {
        return { result: true };
      }
      if (rendered === 'false' || rendered === '0' || rendered === 'f') {
        return { result: false };
      }

      // Step 2: Evaluate using evaluator pipeline
      return { result: this.evalExpressionString(rendered, ctx) };
    } catch (err: any) {
      return { result: false, error: err.message || 'Evaluation error' };
    }
  }

  private evalExpressionString(expr: string, ctx: ExecutionContext): boolean {
    expr = expr.trim();
    if (!expr) return true;

    // 1. Logical OR (||)
    if (expr.includes('||')) {
      const parts = expr.split('||');
      return parts.some(part => this.evalExpressionString(part, ctx));
    }

    // 2. Logical AND (&&)
    if (expr.includes('&&')) {
      const parts = expr.split('&&');
      return parts.every(part => this.evalExpressionString(part, ctx));
    }

    // 3. Negation (!)
    if (expr.startsWith('!') && !expr.includes('!=')) {
      return !this.evalExpressionString(expr.slice(1), ctx);
    }

    // 4. Equality (==)
    if (expr.includes('==')) {
      const [left, right] = expr.split('==', 2);
      const lVal = this.resolveTermValue(left, ctx);
      const rVal = this.resolveTermValue(right, ctx);
      return this.normalizeValue(lVal) == this.normalizeValue(rVal);
    }

    // 5. Inequality (!=)
    if (expr.includes('!=')) {
      const [left, right] = expr.split('!=', 2);
      const lVal = this.resolveTermValue(left, ctx);
      const rVal = this.resolveTermValue(right, ctx);
      return this.normalizeValue(lVal) != this.normalizeValue(rVal);
    }

    // 6. Relational (<=, >=, <, >)
    if (expr.includes('<=')) {
      const [left, right] = expr.split('<=', 2);
      return Number(this.normalizeValue(this.resolveTermValue(left, ctx))) <= Number(this.normalizeValue(this.resolveTermValue(right, ctx)));
    }
    if (expr.includes('>=')) {
      const [left, right] = expr.split('>=', 2);
      return Number(this.normalizeValue(this.resolveTermValue(left, ctx))) >= Number(this.normalizeValue(this.resolveTermValue(right, ctx)));
    }
    if (expr.includes('<')) {
      const [left, right] = expr.split('<', 2);
      return Number(this.normalizeValue(this.resolveTermValue(left, ctx))) < Number(this.normalizeValue(this.resolveTermValue(right, ctx)));
    }
    if (expr.includes('>')) {
      const [left, right] = expr.split('>', 2);
      return Number(this.normalizeValue(this.resolveTermValue(left, ctx))) > Number(this.normalizeValue(this.resolveTermValue(right, ctx)));
    }

    // 7. hasPrefix
    if (expr.startsWith('hasPrefix ') || expr.startsWith('hasPrefix(')) {
      let item = '';
      let prefix = '';
      if (expr.startsWith('hasPrefix(') && expr.endsWith(')')) {
        const inner = expr.slice(10, -1);
        const parts = inner.split(',').map(s => s.trim());
        item = String(this.resolveTermValue(parts[0], ctx) ?? '');
        prefix = String(this.resolveTermValue(parts[1], ctx) ?? '');
      } else {
        const parts = expr.split(/\s+/);
        item = String(this.resolveTermValue(parts[1], ctx) ?? '');
        prefix = String(this.resolveTermValue(parts[2], ctx) ?? '');
      }
      return String(this.normalizeValue(item)).startsWith(String(this.normalizeValue(prefix)));
    }

    // Fallback: Check boolean value
    const normalized = this.normalizeValue(expr);
    if (normalized === 'true' || normalized === true || normalized === '1') return true;
    if (normalized === 'false' || normalized === false || normalized === '0') return false;

    return Boolean(normalized);
  }

  private resolveTermValue(term: string, ctx: ExecutionContext): any {
    term = term.trim();
    if (!term) return '';

    // Strip quotes if any
    if ((term.startsWith('"') && term.endsWith('"')) || (term.startsWith("'") && term.endsWith("'"))) {
      return term.slice(1, -1);
    }

    // If property access on context
    if (term.startsWith('.') || term.startsWith('trigger') || term.startsWith('steps') || term.startsWith('vars')) {
      const path = term.startsWith('.') ? term.slice(1) : term;
      const parts = path.split('.');
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
      let curr: any = fullContext;
      for (const p of parts) {
        if (curr === null || curr === undefined) {
          curr = undefined;
          break;
        }
        curr = curr[p];
      }
      if (curr !== undefined) return curr;
    }

    return term;
  }

  private normalizeValue(val: any): any {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') {
      let trimmed = val.trim();
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        trimmed = trimmed.slice(1, -1);
      }
      if (trimmed === 'null' || trimmed === 'nil' || trimmed === 'undefined') return '';
      return trimmed;
    }
    return val;
  }
}

export function evaluateCondition(expr: string | undefined, context: ExecutionContext): boolean {
  const evaluator = new ConditionEvaluator();
  return evaluator.evaluate(expr, context).result;
}
