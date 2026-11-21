// engine-roundtrip.test.ts — deterministic proof of Design IR <-> TSX, v2 migration,
// tree ops and code-protection. Run via: rolldown bundle -> node.
import { generateTsx } from '../src/engine/codegen';
import { parseTsxToDocument } from '../src/engine/tsx-parser';
import { initialDocument } from '../src/engine/sample-document';
import { migrateDocument, serializeDocument, deserializeDocument } from '../src/engine/migrate';
import { findNode, findParent, removeNode, appendChild, moveNode, moveSibling, setNodeText, nodeText, isDescendant } from '../src/engine/tree-ops';
import type { DesignDocument } from '../src/engine/types';

const results: Record<string, unknown> = {};
const check = (name: string, cond: boolean, extra?: unknown) => {
  results[name] = { pass: !!cond, ...(extra !== undefined ? { info: extra } : {}) };
};

// ---------- IR v2 model ----------
check('v2.sample_no_props_children', !JSON.stringify(initialDocument).includes('"children": "'));
check('v2.text_in_children', initialDocument.root.children.some((c: any) => c.id === 'page-title' && (c.children as any[])[0] === '用户管理'));

// ---------- v1 -> v2 migration ----------
const v1doc = {
  schemaVersion: 1,
  framework: initialDocument.framework,
  theme: initialDocument.theme,
  root: {
    id: 'r', type: 'Flex', props: {},
    children: [{ id: 'b', type: 'Button', props: { type: 'primary', children: '旧文案' }, children: [] }],
  },
};
const migrated = migrateDocument(v1doc) as DesignDocument;
const btn = findNode(migrated.root, 'b')!;
check('migrate.v1_to_v2_version', migrated.schemaVersion === 2);
check('migrate.text_channel', btn.props.children === undefined && (btn.children as string[])[0] === '旧文案');
check('migrate.id_stable', btn.id === 'b');
check('migrate.serialize_roundtrip', deserializeDocument(serializeDocument(migrated)).root.id === 'r');
let threwFuture = false;
try { migrateDocument({ schemaVersion: 99, root: {} }); } catch { threwFuture = true; }
check('migrate.rejects_future_version', threwFuture);

// ---------- codegen ----------
const code = generateTsx(initialDocument);
check('codegen.valid_default_export', /export default function GeneratedPage\(\)/.test(code));
check('codegen.imports_antd', code.includes("from 'antd'"));
check('codegen.imports_pro', code.includes("@ant-design/pro-components"));
check('codegen.text_as_jsx_child', code.includes('查询') && !code.includes('children='));
check('codegen.real_components_present',
  code.includes('<ProTable') && code.includes('<Button') && code.includes('<Flex') && code.includes('<Select'));

// ---------- parse roundtrip with stable ids ----------
const reparsed = parseTsxToDocument(code, initialDocument);
check('parse.stable_ids', findNode(reparsed.root, 'search-submit') !== undefined);
check('parse.stable_ids_nested', findNode(reparsed.root, 'user-table') !== undefined);
check('parse.text_channel_v2', (findNode(reparsed.root, 'search-submit')!.children as string[])[0] === '查询');
const tags = (s: string) => (s.match(/<[A-Za-z][\w.]*/g) || []).sort().join(',');
check('parse.roundtrip_tag_stability', tags(code) === tags(generateTsx(reparsed)));

// ---------- code protection ----------
const throwsOn = (src: string): string | null => {
  try { parseTsxToDocument(src); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
};
check('protect.unknown_component_throws', throwsOn(code.replace('<Button', '<Modal')) !== null);
check('protect.dynamic_expr_throws', throwsOn("import { Flex } from 'antd';\nexport default function P(){ return <Flex onClick={()=>{}} />; }") !== null);
check('protect.spread_attr_throws', throwsOn("import { Flex } from 'antd';\nexport default function P(){ const a={}; return <Flex {...a} />; }") !== null);
check('protect.extra_import_throws', throwsOn("import { Flex } from 'antd';\nimport foo from 'some-lib';\nexport default function P(){ return <Flex />; }") !== null);
check('protect.reserved_children_prop_throws', throwsOn("import { Flex } from 'antd';\nexport default function P(){ return <Flex children={'x'} />; }") !== null);

// ---------- tree ops ----------
const root = initialDocument.root;
check('tree.find_parent', findParent(root, 'search-submit')!.id === 'search-row');
check('tree.is_descendant', isDescendant(findNode(root, 'search-card')!, 'search-submit'));
check('tree.remove', !findNode(removeNode(root, 'search-reset'), 'search-reset'));
check('tree.append', (appendChild(root, 'search-row', { id: 'x', type: 'Button', props: {}, children: [] } as any) && findNode(appendChild(root, 'search-row', { id: 'x', type: 'Button', props: {}, children: [] } as any), 'x')) !== undefined);

// move search-submit into user-table-card (container) — inside
const movedInside = moveNode(root, 'search-submit', 'user-table-card', { position: 'inside', canReceive: (t) => t === 'Flex' || t === 'Card' || t === 'ProCard' })!;
check('tree.move_inside', findParent(movedInside, 'search-submit')!.id === 'user-table-card');
// move search-input before search-submit (leaf target => sibling insert)
const movedBefore = moveNode(root, 'search-input', 'search-submit', { position: 'before', canReceive: () => false })!;
const row = findNode(movedBefore, 'search-row')!;
const rowIds = (row.children as any[]).map((c) => c.id);
check('tree.move_before_sibling', rowIds.indexOf('search-input') === rowIds.indexOf('search-submit') - 1, rowIds);
// cannot move container into own descendant
check('tree.move_into_descendant_rejected', moveNode(root, 'search-card', 'search-submit', { position: 'inside', canReceive: () => true }) === null);
// cannot move root
check('tree.move_root_rejected', moveNode(root, 'page-root', 'search-submit', { position: 'before', canReceive: () => false }) === null);
// sibling reorder
const swapped = moveSibling(root, 'search-reset', -1)!;
const row2 = findNode(swapped, 'search-row')!;
check('tree.sibling_swap', (row2.children as any[]).some((c) => c.id === 'search-reset' && (row2.children as any[]).indexOf(c) === 3) === false);
check('tree.sibling_edge_null', moveSibling(root, 'page-title', -1) === null);
// text channel ops
const setText = setNodeText(btn, '新文案');
check('tree.set_text', nodeText(setText) === '新文案' && setText.children.length === 1);

console.log('ENGINE_RESULTS ' + JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => !(v as any).pass);
if (failed.length) { console.error('ENGINE_FAILED: ' + failed.map(f => f[0]).join(', ')); process.exit(1); }
console.log('ENGINE_ALL_PASS (' + Object.keys(results).length + ' checks)');
