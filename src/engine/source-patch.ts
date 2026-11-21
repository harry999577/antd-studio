/**
 * Source-level incremental patch engine (Babel Parser + Recast).
 *
 * Design IR <-> AST source mapping:
 *  - indexSource() parses a TSX file with Recast (babel-ts parser = Babel Parser
 *    with typescript+jsx plugins) and produces an IR-like JSX tree where every
 *    node carries its source range (`loc`) — the sourceMap.
 *  - Node ids are stable by (position path + component type), matching the
 *    contract in tsx-parser.ts, so the same visual node keeps the same id across
 *    index/parse round trips.
 *  - patchSource() mutates ONLY the targeted JSXElement (attributes / text child)
 *    and re-prints through Recast's patcher. Recast keeps untouched regions
 *    byte-identical: comments, blank lines, user formatting, hooks, variables,
 *    dynamic expressions and unregistered components all survive verbatim.
 *  - Anything we cannot represent visually is reported in `preserved` so the UI
 *    can warn instead of silently dropping it. A node holding dynamic attrs is
 *    refused for patching (never rewritten) rather than flattened.
 */

import { parse as recastParse, print as recastPrint } from 'recast';
import babelTsParser from 'recast/parsers/babel-ts';
import { normalizeProTableProp } from './registry';

export interface SourceNode {
  id: string;
  type: string;
  /** 0-based [startLine, startCol, endLine, endCol] — the sourceMap entry. */
  loc: [number, number, number, number];
  /** Static attribute values we can read; dynamic ones listed in `dynamic`. */
  attrs: Record<string, unknown>;
  /** Attribute names whose value is not a static literal (never patched). */
  dynamic: string[];
  /** Collapsed JSX text content, or null when the element has no text. */
  text: string | null;
  children: SourceNode[];
}

export interface PatchOp {
  nodeId: string;
  /** Set attributes; `undefined` value removes the attribute. */
  attrs?: Record<string, unknown | undefined>;
  /** Replace text content. `null` removes text children. `undefined` = leave as-is. */
  text?: string | null;
}

export interface PatchResult {
  code: string;
  changed: boolean;
  /** Line-oriented diff of touched lines ("-N| before" / "+N| after"). */
  diff: string[];
  root: SourceNode | null;
  /** Regions/statements kept verbatim and not represented visually. */
  preserved: string[];
}

export interface SourceIndex {
  root: SourceNode | null;
  preserved: string[];
  ast: any;
}

const PARSER = babelTsParser as any;

function jsxName(node: any): string | null {
  const n = node?.openingElement?.name;
  if (!n) return null;
  return nameOf(n);
}
function nameOf(n: any): string {
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${nameOf(n.object)}.${nameOf(n.property)}`;
  return '?';
}

/** Static-literal reader; ok=false means "dynamic, leave alone". */
function literal(expr: any): { ok: boolean; value?: unknown } {
  if (!expr) return { ok: true, value: true };
  switch (expr.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return { ok: true, value: expr.value };
    case 'NullLiteral':
      return { ok: true, value: null };
    case 'JSXExpressionContainer':
      return expr.expression.type === 'JSXEmptyExpression' ? { ok: false } : literal(expr.expression);
    case 'ArrayExpression': {
      const out: unknown[] = [];
      for (const el of expr.elements) {
        const v = literal(el);
        if (!v.ok) return { ok: false };
        out.push(v.value);
      }
      return { ok: true, value: out };
    }
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const p of expr.properties) {
        if (p.type !== 'ObjectProperty' || p.computed) return { ok: false };
        const v = literal(p.value);
        if (!v.ok) return { ok: false };
        out[String(p.key.name ?? p.key.value)] = v.value;
      }
      return { ok: true, value: out };
    }
    case 'UnaryExpression':
      if (expr.operator === '-') {
        const v = literal(expr.argument);
        return v.ok ? { ok: true, value: -Number(v.value) } : { ok: false };
      }
      return { ok: false };
    case 'TemplateLiteral':
      return expr.expressions.length === 0
        ? { ok: true, value: expr.quasis.map((q: any) => q.value.cooked).join('') }
        : { ok: false };
    default:
      return { ok: false };
  }
}

/** Find the single returned root JSX element of a default-export page component. */
function pageRootElement(ast: any): any | null {
  const body: any[] = ast.program.body;
  const exp = body.find((s) => s.type === 'ExportDefaultDeclaration');
  if (!exp) return null;
  const decl = exp.declaration;
  let jsx: any = null;
  if (decl.type === 'JSXElement') jsx = decl;
  else if (decl.type === 'FunctionDeclaration' || decl.type === 'FunctionExpression' || decl.type === 'ArrowFunctionExpression') {
    if (decl.body?.type === 'JSXElement') jsx = decl.body;
    else if (decl.body?.type === 'BlockStatement') {
      const stmts = decl.body.body;
      if (stmts.length === 1 && stmts[0].type === 'ReturnStatement' && stmts[0].argument?.type === 'JSXElement') jsx = stmts[0].argument;
    }
  }
  if (!jsx) return null;
  // unwrap a ConfigProvider theme wrapper so the visual root is the page element
  if (jsxName(jsx) === 'ConfigProvider') {
    const els = jsx.children.filter((c: any) => c.type === 'JSXElement');
    return els.length === 1 ? els[0] : jsx;
  }
  return jsx;
}

/** Build the IR-like JSX index with stable ids and source ranges. */
export function indexSource(code: string, previous?: SourceNode | null): SourceIndex {
  let ast: any;
  try {
    ast = recastParse(code, { parser: PARSER });
  } catch (e) {
    return { root: null, preserved: [`parse-error: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`], ast: null };
  }
  const body: any[] = ast.program.body;
  const preserved = body
    .filter((s) => s.type !== 'ImportDeclaration' && s.type !== 'ExportDefaultDeclaration')
    .map((s) => `top-level ${s.type} @line ${s.loc?.start.line ?? '?'} kept verbatim`);

  const rootEl = pageRootElement(ast);
  if (!rootEl) return { root: null, preserved: preserved.concat('no visual page root (single returned JSX expected)'), ast };

  const build = (element: any, path: number[], prev: SourceNode | undefined): SourceNode => {
    const type = jsxName(element) ?? 'Unknown';
    const attrs: Record<string, unknown> = {};
    const dynamic: string[] = [];
    for (const a of element.openingElement.attributes) {
      if (a.type === 'JSXSpreadAttribute') { dynamic.push('...spread'); continue; }
      const v = literal(a.value);
      if (v.ok) attrs[a.name.name] = v.value;
      else dynamic.push(a.name.name);
    }
    const children: SourceNode[] = [];
    let text: string | null = null;
    let idx = 0;
    const prevKids = prev?.children ?? [];
    for (const c of element.children) {
      if (c.type === 'JSXElement') {
        children.push(build(c, [...path, idx], prevKids[idx]));
        idx += 1;
      } else if (c.type === 'JSXText') {
        const t = c.value.replace(/\s+/g, ' ').trim();
        if (t) text = text === null ? t : `${text} ${t}`;
      } else if (c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression') {
        const v = literal(c.expression);
        if (v.ok && (typeof v.value === 'string' || typeof v.value === 'number')) text = String(v.value);
        else dynamic.push('jsx-expression-child');
      }
    }
    const id = prev && prev.type === type ? prev.id : `ps-${path.join('-')}-${type}`;
    const loc = element.loc;
    return {
      id,
      type,
      loc: [loc.start.line - 1, loc.start.column, loc.end.line - 1, loc.end.column],
      attrs,
      dynamic,
      text,
      children,
    };
  };

  return { root: build(rootEl, [0], previous ?? undefined), preserved, ast };
}

export function findSourceNode(root: SourceNode, id: string): SourceNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findSourceNode(c, id);
    if (f) return f;
  }
  return null;
}

/** Locate a node by element-index path (same path convention as tree-ops.getNodePath). */
export function findSourceNodeByPath(root: SourceNode, path: number[]): SourceNode | null {
  let node: SourceNode | null = root;
  for (const step of path) {
    node = node?.children[step] ?? null;
    if (!node) return null;
  }
  return node;
}

/** Path of element indices from the page root to the node with `id`. */
function pathToId(root: SourceNode, id: string): number[] | null {
  if (root.id === id) return [];
  for (let i = 0; i < root.children.length; i++) {
    const sub = pathToId(root.children[i], id);
    if (sub) return [i, ...sub];
  }
  return null;
}

function rawElementAt(ast: any, path: number[]): any | null {
  let element = pageRootElement(ast);
  if (!element) return null;
  for (const step of path) {
    const els = element.children.filter((c: any) => c.type === 'JSXElement');
    element = els[step];
    if (!element) return null;
  }
  return element;
}

/** Build a fresh literal AST node (no loc => Recast prints it from value). */
function toExpr(value: unknown): any {
  const lit = (type: string, extra: Record<string, unknown> = {}) => ({ type, loc: null, ...extra });
  switch (typeof value) {
    case 'string': return lit('StringLiteral', { value });
    case 'number': return lit('NumericLiteral', { value });
    case 'boolean': return lit('BooleanLiteral', { value });
    case 'object':
      if (value === null) return lit('NullLiteral');
      if (Array.isArray(value)) return lit('ArrayExpression', { elements: value.map(toExpr) });
      return lit('ObjectExpression', {
        properties: Object.entries(value as Record<string, unknown>).map(([k, v]) =>
          lit('ObjectProperty', { key: lit('Identifier', { name: k }), value: toExpr(v), computed: false, shorthand: false })),
      });
    default:
      return lit('StringLiteral', { value: String(value) });
  }
}

/** Minimal IR shape accepted for structural inserts (subset of DesignNode). */
export interface InsertableNode {
  type: string;
  props: Record<string, unknown>;
  children: (InsertableNode | string)[];
}

function nameToAst(name: string): any {
  const parts = name.split('.');
  let node: any = { type: 'JSXIdentifier', name: parts[0], loc: null };
  for (let i = 1; i < parts.length; i++) {
    node = { type: 'JSXMemberExpression', object: node, property: { type: 'JSXIdentifier', name: parts[i], loc: null }, loc: null };
  }
  return node;
}

/** Build a fresh (unlocated) JSX AST subtree; Recast prints new nodes from scratch. */
export function designNodeToAst(node: InsertableNode): any {
  const attributes = Object.entries(node.props)
    .filter(([k, v]) => k !== 'children' && v !== undefined)
    .map(([name, value]) => ({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name, loc: null },
      value: { type: 'JSXExpressionContainer', expression: toExpr(node.type === 'ProTable' ? normalizeProTableProp(name, value) : value), loc: null },
      loc: null,
    }));
  const kids: any[] = [];
  const elementKids = node.children.filter((c) => typeof c !== 'string') as InsertableNode[];
  const texts = node.children.filter((c) => typeof c === 'string') as string[];
  if (texts.length) kids.push({ type: 'JSXText', value: texts.join(' '), raw: texts.join(' '), loc: null });
  for (const child of elementKids) kids.push(designNodeToAst(child));
  const selfClosing = kids.length === 0;
  return {
    type: 'JSXElement',
    openingElement: { type: 'JSXOpeningElement', name: nameToAst(node.type), attributes, selfClosing, loc: null },
    closingElement: selfClosing ? null : { type: 'JSXClosingElement', name: nameToAst(node.type), loc: null },
    children: kids,
    loc: null,
  };
}

function withIndent(element: any, depth: number): any[] {
  // Pretty-print an inserted subtree with newline/indent JSXText so it reads naturally.
  const pad = (d: number) => ' '.repeat(4 + d * 2);
  const render = (node: any, d: number): any[] => {
    if (node.type !== 'JSXElement') return [];
    const open = node.openingElement;
    if (open.selfClosing) return [{ type: 'JSXText', value: `\n${pad(d)}`, loc: null }, node];
    const inner: any[] = [];
    const elKids = node.children.filter((c: any) => c.type === 'JSXElement');
    const textKids = node.children.filter((c: any) => c.type === 'JSXText' && c.value.trim());
    if (textKids.length) inner.push(...textKids);
    for (const k of elKids) inner.push(...render(k, d + 1));
    inner.push({ type: 'JSXText', value: `\n${pad(d)}`, loc: null });
    return [{ type: 'JSXText', value: `\n${pad(d)}`, loc: null }, { ...node, children: inner }];
  };
  return render(element, depth);
}

/** Append an IR node as the last child of the element at `path`. */
export function insertInto(code: string, path: number[], node: InsertableNode): PatchResult {
  const index = indexSource(code);
  if (!index.root) return { code, changed: false, diff: [], root: null, preserved: index.preserved.concat('insert refused: no visual root') };
  const target = findSourceNodeByPath(index.root, path);
  if (!target) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('insert refused: parent not found') };
  const raw = rawElementAt(index.ast, path);
  if (!raw) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('insert refused: raw parent not found') };
  const built = designNodeToAst(node);
  const indentDepth = target.loc[1] >= 0 ? Math.floor(target.loc[1] / 2) + 1 : 1;
  const pieces = withIndent(built, indentDepth);
  // insert before the trailing whitespace text node of the parent, else append
  const trailing = raw.children.length && raw.children[raw.children.length - 1].type === 'JSXText'
    && !raw.children[raw.children.length - 1].value.trim() ? raw.children.length - 1 : raw.children.length;
  raw.children.splice(trailing, 0, ...pieces);
  const printed = recastPrint(index.ast, { lineTerminator: '\n' }).code;
  return { code: printed, changed: printed !== code, diff: printed !== code ? lineDiff(code, printed) : [], root: index.root, preserved: index.preserved };
}

/** Remove the element at `path` (root path [] is refused). */
export function removeFrom(code: string, path: number[]): PatchResult {
  const index = indexSource(code);
  if (!index.root || path.length === 0) {
    return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('remove refused: root or missing') };
  }
  const parentPath = path.slice(0, -1);
  const rawParent = rawElementAt(index.ast, parentPath);
  const raw = rawElementAt(index.ast, path);
  if (!rawParent || !raw) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('remove refused: node not found') };
  const i = rawParent.children.indexOf(raw);
  rawParent.children.splice(i, 1);
  // clean the leading newline+indent text we inserted next to it, if directly adjacent
  const before = rawParent.children[i - 1];
  if (before && before.type === 'JSXText' && !before.value.trim()) rawParent.children.splice(i - 1, 1);
  const printed = recastPrint(index.ast, { lineTerminator: '\n' }).code;
  return { code: printed, changed: printed !== code, diff: printed !== code ? lineDiff(code, printed) : [], root: index.root, preserved: index.preserved };
}

/** Patch by element-index path (tree-ops.getNodePath compatible). */
export function patchByPath(code: string, path: number[], op: Omit<PatchOp, 'nodeId'>, previous?: SourceNode | null): PatchResult & { refused?: string } {
  const index = indexSource(code, previous);
  if (!index.root) return { code, changed: false, diff: [], root: null, preserved: index.preserved.concat('patch refused: no visual root'), refused: 'no-visual-root' };
  const target = findSourceNodeByPath(index.root, path);
  if (!target) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('patch refused: path not found'), refused: 'path-not-found' };
  if (target.dynamic.length) {
    return {
      code, changed: false, diff: [], root: index.root,
      preserved: index.preserved.concat(`patch refused: node has dynamic parts [${target.dynamic.join(', ')}]; source kept verbatim`),
      refused: 'dynamic-node',
    };
  }
  const raw = rawElementAt(index.ast, path);
  if (!raw) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('patch refused: raw node not located'), refused: 'raw-not-found' };

  if (op.attrs) {
    for (const [name, value] of Object.entries(op.attrs)) {
      const existing = raw.openingElement.attributes.find((a: any) => a.type === 'JSXAttribute' && a.name?.name === name);
      if (value === undefined) {
        if (existing) raw.openingElement.attributes.splice(raw.openingElement.attributes.indexOf(existing), 1);
        continue;
      }
      const out = target.type === 'ProTable' ? normalizeProTableProp(name, value) : value;
      const container = { type: 'JSXExpressionContainer', expression: toExpr(out), loc: null };
      if (existing) existing.value = container;
      else raw.openingElement.attributes.push({ type: 'JSXAttribute', name: { type: 'JSXIdentifier', name, loc: null }, value: container, loc: null });
    }
  }

  if (op.text !== undefined) {
    const elementKids = raw.children.filter((c: any) => c.type === 'JSXElement');
    const multiline = raw.loc.start.line !== raw.loc.end.line;
    if (op.text === null) {
      raw.children = elementKids.length ? elementKids : [];
    } else if (multiline) {
      const indent = ' '.repeat(raw.loc.start.column + 2);
      raw.children = [
        { type: 'JSXText', value: `\n${indent}`, raw: `\n${indent}`, loc: null },
        { type: 'JSXText', value: op.text, raw: op.text, loc: null },
        { type: 'JSXText', value: `\n${' '.repeat(raw.loc.start.column)}`, raw: `\n${' '.repeat(raw.loc.start.column)}`, loc: null },
        ...elementKids,
      ];
    } else {
      raw.children = [{ type: 'JSXText', value: op.text, raw: op.text, loc: null }, ...elementKids];
    }
  }

  const printed = recastPrint(index.ast, { lineTerminator: '\n' }).code;
  const changed = printed !== code;
  return { code: printed, changed, diff: changed ? lineDiff(code, printed) : [], root: index.root, preserved: index.preserved };
}

/** Swap two sibling JSX elements in place (both paths share a parent). */
export function moveInSource(code: string, from: number[], to: number[]): PatchResult {
  const index = indexSource(code);
  if (!index.root || from.length === 0 || to.length === 0) {
    return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('move refused: root or missing') };
  }
  const parentPath = from.slice(0, -1);
  const sameParent = parentPath.join(',') === to.slice(0, -1).join(',');
  if (!sameParent || from[from.length - 1] === to[to.length - 1]) {
    return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('move refused: only sibling swaps supported in source') };
  }
  const rawParent = rawElementAt(index.ast, parentPath);
  if (!rawParent) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('move refused: parent not found') };
  const els: any[] = [];
  rawParent.children.forEach((c: any, i: number) => { if (c.type === 'JSXElement') els.push({ i, c }); });
  const a = els[from[from.length - 1]];
  const b = els[to[to.length - 1]];
  if (!a || !b) return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('move refused: element indices invalid') };
  const tmp = rawParent.children[a.i];
  rawParent.children[a.i] = rawParent.children[b.i];
  rawParent.children[b.i] = tmp;
  const printed = recastPrint(index.ast, { lineTerminator: '\n' }).code;
  return { code: printed, changed: printed !== code, diff: printed !== code ? lineDiff(code, printed) : [], root: index.root, preserved: index.preserved };
}

/**
 * Patch the ConfigProvider theme token object in place.
 * Mutates the existing token ObjectExpression's property values (and appends
 * missing keys) instead of replacing the whole expression — replacing it makes
 * Recast re-indent the entire subtree. Refuses when the shape isn't the
 * generator's static `theme={{ token: {...} }}`.
 */
export function patchTheme(code: string, token: Record<string, string | number>): PatchResult {
  let ast: any;
  try {
    ast = recastParse(code, { parser: PARSER });
  } catch (e) {
    return { code, changed: false, diff: [], root: null, preserved: [`parse-error: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`] };
  }
  const body: any[] = ast.program.body;
  const exp = body.find((s) => s.type === 'ExportDefaultDeclaration');
  const decl = exp?.declaration;
  let jsx: any = null;
  if (decl?.type === 'JSXElement') jsx = decl;
  else if (decl?.body?.type === 'JSXElement') jsx = decl.body;
  else if (decl?.body?.type === 'BlockStatement') {
    const stmts = decl.body.body;
    if (stmts.length === 1 && stmts[0].type === 'ReturnStatement' && stmts[0].argument?.type === 'JSXElement') jsx = stmts[0].argument;
  }
  if (!jsx || jsxName(jsx) !== 'ConfigProvider') {
    return { code, changed: false, diff: [], root: null, preserved: ['theme patch refused: no ConfigProvider wrapper'] };
  }
  const themeAttr = jsx.openingElement.attributes.find((a: any) => a.type === 'JSXAttribute' && a.name?.name === 'theme');
  const staticVal = themeAttr?.value?.type === 'JSXExpressionContainer' ? literal(themeAttr.value) : { ok: false as const };
  if (!staticVal.ok) {
    return { code, changed: false, diff: [], root: null, preserved: ['theme patch refused: theme expression is not static'] };
  }
  // locate the raw token ObjectExpression: theme={{ token: {...} }}
  const themeExpr = themeAttr.value.expression;
  if (themeExpr.type !== 'ObjectExpression') {
    return { code, changed: false, diff: [], root: null, preserved: ['theme patch refused: theme is not an object literal'] };
  }
  const tokenProp = themeExpr.properties.find((p: any) => p.type === 'ObjectProperty' && (p.key?.name ?? p.key?.value) === 'token');
  if (!tokenProp || tokenProp.value.type !== 'ObjectExpression') {
    return { code, changed: false, diff: [], root: null, preserved: ['theme patch refused: theme.token is not an object literal'] };
  }
  for (const [key, value] of Object.entries(token)) {
    const existing = tokenProp.value.properties.find(
      (p: any) => p.type === 'ObjectProperty' && (p.key?.name ?? p.key?.value) === key,
    );
    if (existing) existing.value = toExpr(value);
    else tokenProp.value.properties.push({
      type: 'ObjectProperty',
      key: { type: 'Identifier', name: key, loc: null },
      value: toExpr(value),
      computed: false, shorthand: false, loc: null,
    });
  }
  const printed = recastPrint(ast, { lineTerminator: '\n' }).code;
  return { code: printed, changed: printed !== code, diff: printed !== code ? lineDiff(code, printed) : [], root: null, preserved: [] };
}

function lineDiff(before: string, after: string): string[] {
  const la = before.split('\n');
  const lb = after.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      if (la[i] !== undefined) out.push(`-${i + 1}| ${la[i]}`);
      if (lb[i] !== undefined) out.push(`+${i + 1}| ${lb[i]}`);
    }
  }
  return out;
}

/**
 * Apply a visual edit to the source file in place.
 * Only the targeted JSXElement is rewritten; everything else is preserved.
 */
export function patchSource(code: string, op: PatchOp, previous?: SourceNode | null): PatchResult {
  const index = indexSource(code, previous);
  if (!index.root) {
    return { code, changed: false, diff: [], root: null, preserved: index.preserved.concat('patch refused: no visual root') };
  }
  const target = findSourceNode(index.root, op.nodeId);
  if (!target) {
    return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat(`patch refused: node ${op.nodeId} not found`) };
  }
  if (target.dynamic.length) {
    return {
      code, changed: false, diff: [], root: index.root,
      preserved: index.preserved.concat(`patch refused: node ${op.nodeId} has dynamic parts [${target.dynamic.join(', ')}]; source kept verbatim`),
    };
  }
  const path = pathToId(index.root, op.nodeId);
  const raw = path === null ? null : rawElementAt(index.ast, path);
  if (!raw) {
    return { code, changed: false, diff: [], root: index.root, preserved: index.preserved.concat('patch refused: raw node not located') };
  }

  if (op.attrs) {
    for (const [name, value] of Object.entries(op.attrs)) {
      const existing = raw.openingElement.attributes.find(
        (a: any) => a.type === 'JSXAttribute' && a.name?.name === name,
      );
      if (value === undefined) {
        if (existing) raw.openingElement.attributes.splice(raw.openingElement.attributes.indexOf(existing), 1);
        continue;
      }
      const out = target.type === 'ProTable' ? normalizeProTableProp(name, value) : value;
      const container = { type: 'JSXExpressionContainer', expression: toExpr(out), loc: null };
      if (existing) existing.value = container;
      else raw.openingElement.attributes.push({ type: 'JSXAttribute', name: { type: 'JSXIdentifier', name, loc: null }, value: container, loc: null });
    }
  }

  if (op.text !== undefined) {
    const elementKids = raw.children.filter((c: any) => c.type === 'JSXElement');
    const multiline = raw.loc.start.line !== raw.loc.end.line;
    if (op.text === null) {
      raw.children = elementKids.length ? raw.children.filter((c: any) => c.type === 'JSXElement') : [];
    } else if (multiline) {
      const indent = ' '.repeat(raw.loc.start.column + 2);
      raw.children = [
        { type: 'JSXText', value: `\n${indent}`, raw: `\n${indent}`, loc: null },
        { type: 'JSXText', value: op.text, raw: op.text, loc: null },
        { type: 'JSXText', value: `\n${' '.repeat(raw.loc.start.column)}`, raw: `\n${' '.repeat(raw.loc.start.column)}`, loc: null },
        ...elementKids,
      ];
    } else {
      raw.children = [{ type: 'JSXText', value: op.text, raw: op.text, loc: null }, ...elementKids];
    }
  }

  const printed = recastPrint(index.ast, { lineTerminator: '\n' }).code;
  const changed = printed !== code;
  return { code: printed, changed, diff: changed ? lineDiff(code, printed) : [], root: index.root, preserved: index.preserved };
}
