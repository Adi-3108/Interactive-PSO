/**
 * @fileoverview Safe mathematical expression parser using recursive descent.
 * Supports +, -, *, /, ^, parentheses, common math functions, and variables x/y.
 * NO eval() or new Function() — the AST is interpreted at evaluation time.
 * @module engine/parser
 */

// ─── Tokenizer ──────────────────────────────────────────────────────────────

/** @enum {string} */
const TokenType = {
  NUMBER: 'NUMBER',
  IDENT: 'IDENT',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  END: 'END'
};

const KNOWN_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs'
]);

const KNOWN_CONSTANTS = { pi: Math.PI, e: Math.E };
const KNOWN_VARIABLES = new Set(['x', 'y']);

/**
 * Tokenize an expression string.
 * @param {string} expr
 * @returns {Array<{type: string, value: string|number}>}
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const src = expr.trim();

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t') { i++; continue; }

    // Number (integer or decimal)
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < src.length && ((src[i] >= '0' && src[i] <= '9') || src[i] === '.')) {
        num += src[i++];
      }
      tokens.push({ type: TokenType.NUMBER, value: parseFloat(num) });
      if (isNaN(tokens[tokens.length - 1].value)) {
        throw new Error(`Invalid number: ${num}`);
      }
      continue;
    }

    // Identifier (function, constant, variable)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let name = '';
      while (
        i < src.length &&
        ((src[i] >= 'a' && src[i] <= 'z') ||
         (src[i] >= 'A' && src[i] <= 'Z') ||
         (src[i] >= '0' && src[i] <= '9') ||
         src[i] === '_')
      ) {
        name += src[i++];
      }
      tokens.push({ type: TokenType.IDENT, value: name.toLowerCase() });
      continue;
    }

    // Operators
    if ('+-*/^'.includes(ch)) {
      tokens.push({ type: TokenType.OP, value: ch });
      i++;
      continue;
    }

    if (ch === '(') { tokens.push({ type: TokenType.LPAREN, value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TokenType.RPAREN, value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TokenType.COMMA, value: ',' }); i++; continue; }

    throw new Error(`Unexpected character '${ch}' at position ${i}`);
  }

  tokens.push({ type: TokenType.END, value: null });
  return tokens;
}

// ─── Recursive-descent parser ───────────────────────────────────────────────
// Grammar (precedence low→high):
//   expr     → term (('+' | '-') term)*
//   term     → unary (('*' | '/') unary)*
//   unary    → ('-' | '+')? power
//   power    → primary ('^' unary)?        (right-assoc via unary)
//   primary  → NUMBER | IDENT | IDENT '(' expr ')' | '(' expr ')'

/**
 * @typedef {Object} ASTNode
 * @property {string} type
 */

/**
 * Parse tokens into an AST.
 * @param {Array} tokens
 * @returns {{ast: ASTNode, variables: Set<string>}}
 */
function parse(tokens) {
  let pos = 0;
  const variables = new Set();

  function peek() { return tokens[pos]; }
  function advance() { return tokens[pos++]; }

  function expect(type, value) {
    const t = advance();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${type}${value !== undefined ? ` '${value}'` : ''} but got ${t.type} '${t.value}'`);
    }
    return t;
  }

  function parseExpr() {
    let left = parseTerm();
    while (peek().type === TokenType.OP && (peek().value === '+' || peek().value === '-')) {
      const op = advance().value;
      const right = parseTerm();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (peek().type === TokenType.OP && (peek().value === '*' || peek().value === '/')) {
      const op = advance().value;
      const right = parseUnary();
      left = { type: 'binop', op, left, right };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === TokenType.OP && (peek().value === '-' || peek().value === '+')) {
      const op = advance().value;
      const operand = parsePower();
      if (op === '-') return { type: 'unary', op: '-', operand };
      return operand;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (peek().type === TokenType.OP && peek().value === '^') {
      advance();
      const exp = parseUnary(); // right-associative
      return { type: 'binop', op: '^', left: base, right: exp };
    }
    return base;
  }

  function parsePrimary() {
    const t = peek();

    // Number literal
    if (t.type === TokenType.NUMBER) {
      advance();
      return { type: 'number', value: t.value };
    }

    // Parenthesised sub-expression
    if (t.type === TokenType.LPAREN) {
      advance();
      const node = parseExpr();
      expect(TokenType.RPAREN, ')');
      return node;
    }

    // Identifier: function call, constant, or variable
    if (t.type === TokenType.IDENT) {
      advance();
      const name = t.value;

      // Function call
      if (KNOWN_FUNCTIONS.has(name)) {
        expect(TokenType.LPAREN, '(');
        const arg = parseExpr();
        expect(TokenType.RPAREN, ')');
        return { type: 'call', name, arg };
      }

      // Constant
      if (name in KNOWN_CONSTANTS) {
        return { type: 'number', value: KNOWN_CONSTANTS[name] };
      }

      // Variable
      if (KNOWN_VARIABLES.has(name)) {
        variables.add(name);
        return { type: 'var', name };
      }

      throw new Error(`Unknown identifier '${name}'. Expected a variable (x, y), constant (pi, e), or function (sin, cos, tan, exp, log, sqrt, abs).`);
    }

    throw new Error(`Unexpected token '${t.value}' (${t.type})`);
  }

  const ast = parseExpr();
  if (peek().type !== TokenType.END) {
    throw new Error(`Unexpected token '${peek().value}' after end of expression`);
  }
  return { ast, variables };
}

// ─── AST evaluator ──────────────────────────────────────────────────────────

const MATH_FNS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs
};

/**
 * Build an evaluator function from an AST node.
 * @param {ASTNode} node
 * @returns {function(number, number): number}
 */
function buildEvaluator(node) {
  switch (node.type) {
    case 'number': {
      const v = node.value;
      return (_x, _y) => v;
    }
    case 'var': {
      if (node.name === 'x') return (x, _y) => x;
      return (_x, y) => y;
    }
    case 'unary': {
      const operand = buildEvaluator(node.operand);
      return (x, y) => -operand(x, y);
    }
    case 'binop': {
      const left = buildEvaluator(node.left);
      const right = buildEvaluator(node.right);
      switch (node.op) {
        case '+': return (x, y) => left(x, y) + right(x, y);
        case '-': return (x, y) => left(x, y) - right(x, y);
        case '*': return (x, y) => left(x, y) * right(x, y);
        case '/': return (x, y) => left(x, y) / right(x, y);
        case '^': return (x, y) => Math.pow(left(x, y), right(x, y));
        default: throw new Error(`Unknown operator '${node.op}'`);
      }
    }
    case 'call': {
      const fn = MATH_FNS[node.name];
      const arg = buildEvaluator(node.arg);
      return (x, y) => fn(arg(x, y));
    }
    default:
      throw new Error(`Unknown AST node type '${node.type}'`);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a mathematical expression string and return an evaluator function.
 * Uses recursive descent — NO eval() or new Function().
 *
 * @param {string} expr - e.g. "x^2 + sin(y)"
 * @returns {function(number, number): number} An evaluator (x, y) => number.
 * @throws {Error} If the expression is invalid.
 */
export function parseExpression(expr) {
  const tokens = tokenize(expr);
  const { ast } = parse(tokens);
  return buildEvaluator(ast);
}

/**
 * Validate an expression without building an evaluator.
 * Returns information about validity, any error, and which variables are used.
 *
 * @param {string} expr
 * @returns {{valid: boolean, error: string|null, variables: string[]}}
 */
export function validateExpression(expr) {
  try {
    const tokens = tokenize(expr);
    const { variables } = parse(tokens);
    return {
      valid: true,
      error: null,
      variables: Array.from(variables).sort()
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message,
      variables: []
    };
  }
}
