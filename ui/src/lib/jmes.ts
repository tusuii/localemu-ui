/**
 * A compact JMESPath implementation for the console shell's `--query`.
 * Supports: fields, a.b, a[0], a[-1], slices a[1:3], a[*].b, a[].b, a.*, [?filter] (== != < <= > >=, &&, ||, !),
 * pipes, multiselect {k: e} / [e, e], `json` and 'raw' literals, @, and the functions
 * length keys values contains starts_with ends_with sort sort_by min max min_by max_by sum avg join reverse
 * to_string to_number to_array type not_null map merge abs ceil floor.
 * Unsupported syntax throws with the position, so the shell can report it.
 */
type Fn = (v: any) => any;
type Node = any;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const truthy = (v: any) => !(v === null || v === undefined || v === false || v === '' || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length));
const deepEq = (a: any, b: any): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);

interface Tok { t: string; v?: any; pos: number }

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const fail = (m: string): never => { throw new Error(`Unsupported --query expression (${m}) at position ${i}: ${src}`); };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const pos = i;
    if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))![0]; i += m.length; out.push({ t: 'ident', v: m, pos }); continue; }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) { const m = /^-?[0-9]+/.exec(src.slice(i))![0]; i += m.length; out.push({ t: 'num', v: Number(m), pos }); continue; }
    if (c === '"') {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== '"') { if (src[j] === '\\') j++; s += src[j]; j++; }
      if (j >= src.length) fail('unterminated string');
      i = j + 1; out.push({ t: 'quoted', v: s, pos }); continue;
    }
    if (c === "'") {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== "'") { if (src[j] === '\\' && src[j + 1] === "'") j++; s += src[j]; j++; }
      if (j >= src.length) fail('unterminated raw string');
      i = j + 1; out.push({ t: 'literal', v: s, pos }); continue;
    }
    if (c === '`') {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== '`') { if (src[j] === '\\' && src[j + 1] === '`') j++; s += src[j]; j++; }
      if (j >= src.length) fail('unterminated literal');
      i = j + 1;
      let val: unknown; try { val = JSON.parse(s); } catch { try { val = JSON.parse(`"${s}"`); } catch { val = s; } }
      out.push({ t: 'literal', v: val, pos }); continue;
    }
    const two = src.slice(i, i + 2);
    if (['[]', '[?', '||', '&&', '==', '!=', '<=', '>='].includes(two)) { i += 2; out.push({ t: two, pos }); continue; }
    if ('.*[]{}(),:|&!<>@'.includes(c)) { i++; out.push({ t: c, pos }); continue; }
    fail(`unexpected "${c}"`);
  }
  out.push({ t: 'eof', pos: src.length });
  return out;
}

const BP: Record<string, number> = { eof: 0, ']': 0, ')': 0, '}': 0, ',': 0, ':': 0, '|': 1, '||': 2, '&&': 3, '==': 5, '!=': 5, '<': 5, '<=': 5, '>': 5, '>=': 5, '[]': 9, '*': 20, '[?': 21, '.': 40, '!': 45, '{': 50, '[': 55, '(': 60 };

function parse(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[Math.min(p, toks.length - 1)];
  const fail = (m: string): never => { throw new Error(`Unsupported --query expression (${m}) at position ${peek().pos}: ${src}`); };
  const eat = (t: string) => { if (peek().t !== t) fail(`expected "${t}"`); return toks[p++]; };

  function expr(rbp: number): Node {
    let left = nud(toks[p++]);
    while (rbp < (BP[peek().t] ?? 0)) left = led(toks[p++], left);
    return left;
  }
  function projRhs(bp: number): Node {
    const t = peek().t;
    if ((BP[t] ?? 0) < 10) return { t: 'current' };
    if (t === '.') { p++; return dotRhs(bp); }
    if (t === '[' || t === '[?') return expr(bp);
    return fail(`unexpected "${t}"`);
  }
  function dotRhs(bp: number): Node {
    const t = peek().t;
    if (t === 'ident' || t === 'quoted') return expr(bp);
    if (t === '[') { p++; return multiList(); }
    if (t === '{') { p++; return multiHash(); }
    if (t === '*') { p++; return { t: 'valueProj', l: { t: 'current' }, r: projRhs(20) }; }
    return fail('expected identifier after "."');
  }
  function multiList(): Node {
    const items: Node[] = [];
    for (;;) { items.push(expr(0)); if (peek().t === ',') { p++; continue; } eat(']'); break; }
    return { t: 'multiList', items };
  }
  function multiHash(): Node {
    const pairs: Array<[string, Node]> = [];
    for (;;) {
      const k = toks[p++];
      if (k.t !== 'ident' && k.t !== 'quoted') fail('expected key');
      eat(':');
      pairs.push([k.v, expr(0)]);
      if (peek().t === ',') { p++; continue; }
      eat('}'); break;
    }
    return { t: 'multiHash', pairs };
  }
  /** After '[': index, slice or '*]'. `left` is the node it applies to. */
  function bracket(left: Node): Node {
    const t = peek().t;
    if (t === '*' && toks[p + 1]?.t === ']') { p += 2; return { t: 'projection', l: left, r: projRhs(20) }; }
    if (t === 'num' || t === ':') {
      const parts: Array<number | null> = [null, null, null]; let n = 0; let colons = 0;
      for (;;) {
        if (peek().t === 'num') parts[n] = toks[p++].v;
        if (peek().t === ':') { p++; n++; colons++; if (n > 2) fail('bad slice'); continue; }
        break;
      }
      eat(']');
      if (!colons) return { t: 'subexpr', l: left, r: { t: 'index', n: parts[0] } };
      return { t: 'projection', l: { t: 'slice', l: left, s: parts[0], e: parts[1], st: parts[2] }, r: projRhs(20) };
    }
    return fail('expected index, slice or "*"');
  }
  function nud(tk: Tok): Node {
    switch (tk.t) {
      case 'literal': return { t: 'literal', v: tk.v };
      case 'num': return fail('bare number (use `5` for a number literal)');
      case 'quoted': return { t: 'field', name: tk.v };
      case 'ident': {
        if (peek().t === '(') {
          p++; const args: Node[] = [];
          if (peek().t !== ')') for (;;) { args.push(expr(0)); if (peek().t === ',') { p++; continue; } break; }
          eat(')');
          return { t: 'fn', name: tk.v, args };
        }
        return { t: 'field', name: tk.v };
      }
      case '@': return { t: 'current' };
      case '*': return { t: 'valueProj', l: { t: 'current' }, r: projRhs(20) };
      case '[]': return { t: 'projection', l: { t: 'flatten', l: { t: 'current' } }, r: projRhs(9) };
      case '[?': { const cond = expr(0); eat(']'); return { t: 'filter', l: { t: 'current' }, cond, r: projRhs(21) }; }
      case '[': {
        const t = peek().t;
        if (t === 'num' || t === ':' || (t === '*' && toks[p + 1]?.t === ']')) return bracket({ t: 'current' });
        return multiList();
      }
      case '{': return multiHash();
      case '(': { const e = expr(0); eat(')'); return e; }
      case '!': return { t: 'not', e: expr(45) };
      case '&': return { t: 'expref', e: expr(0) };
      default: return fail(`unexpected "${tk.t}"`);
    }
  }
  function led(tk: Tok, left: Node): Node {
    switch (tk.t) {
      case '.': return { t: 'subexpr', l: left, r: dotRhs(40) };
      case '|': return { t: 'pipe', l: left, r: expr(1) };
      case '||': return { t: 'or', l: left, r: expr(2) };
      case '&&': return { t: 'and', l: left, r: expr(3) };
      case '==': case '!=': case '<': case '<=': case '>': case '>=': return { t: 'cmp', op: tk.t, l: left, r: expr(5) };
      case '[]': return { t: 'projection', l: { t: 'flatten', l: left }, r: projRhs(9) };
      case '[?': { const cond = expr(0); eat(']'); return { t: 'filter', l: left, cond, r: projRhs(21) }; }
      case '[': return bracket(left);
      default: return fail(`unexpected "${tk.t}"`);
    }
  }

  const ast = expr(0);
  if (peek().t !== 'eof') fail(`unexpected "${peek().t}"`);
  return ast;
}

/* ------------------------------------------------------------ evaluator */

const typeOf = (v: any) => (v === null || v === undefined ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v);
const num = (v: any): number | null => (typeof v === 'number' ? v : null);

function compare(a: any, b: any): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  throw new Error('invalid-type: sort/min/max need all numbers or all strings');
}
function keyed(arr: any[], f: Fn): Array<[any, any]> {
  const pairs = arr.map((x) => [f(x), x] as [any, any]);
  const t = new Set(pairs.map(([k]) => typeOf(k)));
  if (t.size > 1 || (t.size === 1 && ![...t][0].match(/^(number|string)$/))) throw new Error('invalid-type: key expression must give all numbers or all strings');
  return pairs;
}

const FUNCS: Record<string, (args: any[], ev: (e: Node, v: any) => any, raw: Node[], cur: any) => any> = {
  length: ([v]) => (typeof v === 'string' ? [...v].length : Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : null),
  keys: ([v]) => (isObj(v) ? Object.keys(v) : null),
  values: ([v]) => (isObj(v) ? Object.values(v) : null),
  contains: ([s, x]) => (Array.isArray(s) ? s.some((y) => deepEq(y, x)) : typeof s === 'string' && typeof x === 'string' ? s.includes(x) : false),
  starts_with: ([s, x]) => typeof s === 'string' && typeof x === 'string' && s.startsWith(x),
  ends_with: ([s, x]) => typeof s === 'string' && typeof x === 'string' && s.endsWith(x),
  sort: ([a]) => (Array.isArray(a) ? [...a].sort(compare) : null),
  reverse: ([a]) => (Array.isArray(a) ? [...a].reverse() : typeof a === 'string' ? [...a].reverse().join('') : null),
  min: ([a]) => (Array.isArray(a) ? (a.length ? a.reduce((m, x) => (compare(x, m) < 0 ? x : m)) : null) : null),
  max: ([a]) => (Array.isArray(a) ? (a.length ? a.reduce((m, x) => (compare(x, m) > 0 ? x : m)) : null) : null),
  sum: ([a]) => (Array.isArray(a) ? a.reduce((s, x) => s + (num(x) ?? 0), 0) : null),
  avg: ([a]) => (Array.isArray(a) && a.length ? a.reduce((s, x) => s + (num(x) ?? 0), 0) / a.length : null),
  abs: ([v]) => (typeof v === 'number' ? Math.abs(v) : null),
  ceil: ([v]) => (typeof v === 'number' ? Math.ceil(v) : null),
  floor: ([v]) => (typeof v === 'number' ? Math.floor(v) : null),
  join: ([sep, a]) => (Array.isArray(a) && typeof sep === 'string' ? a.map((x) => (typeof x === 'string' ? x : String(x))).join(sep) : null),
  to_string: ([v]) => (typeof v === 'string' ? v : JSON.stringify(v)),
  to_number: ([v]) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : null; },
  to_array: ([v]) => (Array.isArray(v) ? v : [v]),
  type: ([v]) => typeOf(v),
  not_null: (a) => a.find((x) => x !== null && x !== undefined) ?? null,
  merge: (a) => Object.assign({}, ...a.filter(isObj)),
  sort_by: ([arr], ev, raw) => (Array.isArray(arr) ? keyed(arr, (x) => ev(raw[1].e, x)).sort((a, b) => compare(a[0], b[0])).map((x) => x[1]) : null),
  min_by: ([arr], ev, raw) => (Array.isArray(arr) && arr.length ? keyed(arr, (x) => ev(raw[1].e, x)).reduce((m, x) => (compare(x[0], m[0]) < 0 ? x : m))[1] : null),
  max_by: ([arr], ev, raw) => (Array.isArray(arr) && arr.length ? keyed(arr, (x) => ev(raw[1].e, x)).reduce((m, x) => (compare(x[0], m[0]) > 0 ? x : m))[1] : null),
  map: ([, arr], ev, raw) => (Array.isArray(arr) ? arr.map((x) => ev(raw[0].e, x)) : null),
};
const EXPREF_FNS = new Set(['sort_by', 'min_by', 'max_by', 'map']);

function evaluate(n: Node, v: any): any {
  switch (n.t) {
    case 'current': return v;
    case 'literal': return n.v;
    case 'field': return isObj(v) ? v[n.name] ?? null : null;
    case 'subexpr': return evaluate(n.r, evaluate(n.l, v));
    case 'pipe': return evaluate(n.r, evaluate(n.l, v));
    case 'index': return Array.isArray(v) ? v.at(n.n) ?? null : null;
    case 'slice': {
      const a = evaluate(n.l, v);
      if (!Array.isArray(a)) return null;
      const step = n.st ?? 1;
      if (step === 0) throw new Error('invalid-value: slice step cannot be 0');
      const len = a.length;
      const norm = (x: number | null, def: number) => (x === null ? def : x < 0 ? Math.max(x + len, step < 0 ? -1 : 0) : Math.min(x, step < 0 ? len - 1 : len));
      const out: any[] = [];
      if (step > 0) for (let i = norm(n.s, 0); i < norm(n.e, len); i += step) out.push(a[i]);
      else for (let i = norm(n.s, len - 1); i > norm(n.e, -1); i += step) out.push(a[i]);
      return out;
    }
    case 'flatten': {
      const a = evaluate(n.l, v);
      return Array.isArray(a) ? a.flatMap((x) => (Array.isArray(x) ? x : [x])) : null;
    }
    case 'projection': {
      const a = evaluate(n.l, v);
      if (!Array.isArray(a)) return null;
      return a.map((x) => evaluate(n.r, x)).filter((x) => x !== null && x !== undefined);
    }
    case 'valueProj': {
      const o = evaluate(n.l, v);
      if (!isObj(o)) return null;
      return Object.values(o).map((x) => evaluate(n.r, x)).filter((x) => x !== null && x !== undefined);
    }
    case 'filter': {
      const a = evaluate(n.l, v);
      if (!Array.isArray(a)) return null;
      return a.filter((x) => truthy(evaluate(n.cond, x))).map((x) => evaluate(n.r, x)).filter((x) => x !== null && x !== undefined);
    }
    case 'or': { const l = evaluate(n.l, v); return truthy(l) ? l : evaluate(n.r, v); }
    case 'and': { const l = evaluate(n.l, v); return truthy(l) ? evaluate(n.r, v) : l; }
    case 'not': return !truthy(evaluate(n.e, v));
    case 'cmp': {
      const l = evaluate(n.l, v); const r = evaluate(n.r, v);
      if (n.op === '==') return deepEq(l ?? null, r ?? null);
      if (n.op === '!=') return !deepEq(l ?? null, r ?? null);
      if (typeof l !== 'number' || typeof r !== 'number') return null;
      return n.op === '<' ? l < r : n.op === '<=' ? l <= r : n.op === '>' ? l > r : l >= r;
    }
    case 'multiHash': return v === null || v === undefined ? null : Object.fromEntries(n.pairs.map(([k, e]: [string, Node]) => [k, evaluate(e, v) ?? null]));
    case 'multiList': return v === null || v === undefined ? null : n.items.map((e: Node) => evaluate(e, v) ?? null);
    case 'expref': return n;
    case 'fn': {
      const f = FUNCS[n.name];
      if (!f) throw new Error(`Unknown function "${n.name}()" in --query. Supported: ${Object.keys(FUNCS).join(', ')}`);
      const args = n.args.map((a: Node) => (a.t === 'expref' ? a : evaluate(a, v)));
      if (EXPREF_FNS.has(n.name) && !n.args.some((a: Node) => a.t === 'expref')) throw new Error(`${n.name}() needs an expression argument such as &Name`);
      return f(args, evaluate, n.args, v);
    }
    default: throw new Error(`Unsupported --query node ${n.t}`);
  }
}

/** Parse once; throws "Unsupported --query expression ..." on bad syntax, other Errors at evaluation time. */
export function compileQuery(src: string): Fn {
  const ast = parse(src);
  return (data) => {
    try { return evaluate(ast, data); } catch (e) {
      const m = (e as Error).message;
      throw new Error(/^(invalid-type|invalid-value)/.test(m) ? `--query: ${m}` : m);
    }
  };
}
