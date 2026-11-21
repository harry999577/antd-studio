// engine-roundtrip.test.ts — deterministic proof of Design IR <-> TSX and code-protection.
// Run via: esbuild bundle -> node.  No DOM required (crypto.randomUUID exists in Node 22+).
import { generateTsx } from './src/engine/codegen';
import { parseTsxToDocument } from './src/engine/tsx-parser';
import { initialDocument } from './src/engine/sample-document';
import type { DesignDocument } from './src/engine/types';

const results: Record<string, unknown> = {};
const check = (name: string, cond: boolean, extra?: unknown) => {
  results[name] = { pass: !!cond, ...(extra !== undefined ? { info: extra } : {}) };
};

// 1. generateTsx produces standard, self-contained TSX (IR -> code)
const code = generateTsx(initialDocument);
check('codegen.valid_default_export', /export default function GeneratedPage\(\)/.test(code));
check('codegen.imports_antd', code.includes("from 'antd'"));
check('codegen.imports_pro', code.includes("@ant-design/pro-components"));
check('codegen.wraps_configprovider', code.includes('<ConfigProvider'));
check('codegen.real_components_present',
  code.includes('<ProTable') && code.includes('<Button') && code.includes('<Flex') && code.includes('<Select'));
check('codegen.theme_token', code.includes('colorPrimary') && code.includes('#1677ff'));

// 2. Round-trip: generate -> parse -> regenerate should be stable (idempotent tree shape)
const reparsed = parseTsxToDocument(code);
check('parse.schema_version', (reparsed as DesignDocument).schemaVersion === 1);
check('parse.root_type', reparsed.root.type === 'Flex', reparsed.root.type);
check('parse.nested_children', reparsed.root.children.length === initialDocument.root.children.length,
  { parsed: reparsed.root.children.length, original: initialDocument.root.children.length });
const reparsedCode = generateTsx(reparsed);
// normalize whitespace-only diffs by comparing component tag multiset
const tags = (s: string) => (s.match(/<[A-Za-z][\w.]*/g) || []).sort().join(',');
check('parse.roundtrip_tag_stability', tags(code) === tags(reparsedCode), { n: tags(code).length });

// 3. Code-protection: unsupported constructs must throw (so UI never overwrites source)
const throwsOn = (src: string): string | null => {
  try { parseTsxToDocument(src); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
};
const t = throwsOn(code.replace('<Button', '<Modal'));
check('protect.unknown_component_throws', t !== null, t);
const t2 = throwsOn("import { Flex } from 'antd';\nexport default function P(){ return <Flex onClick={()=>{}} />; }");
check('protect.dynamic_expr_throws', t2 !== null, t2);
const t3 = throwsOn("import { Flex } from 'antd';\nexport default function P(){ const a={}; return <Flex {...a} />; }");
check('protect.spread_attr_throws', t3 !== null, t3);
const t4 = throwsOn("import { Flex } from 'antd';\nimport foo from 'some-lib';\nexport default function P(){ return <Flex />; }");
check('protect.extra_import_throws', t4 !== null, t4);

// 4. Edit->regenerate sync: change one prop, ensure it appears in fresh code
const edited: DesignDocument = JSON.parse(JSON.stringify(initialDocument));
function setId(node: any) {
  if (node.id === 'search-submit') node.props.children = 'E2E-SYNC';
  node.children?.forEach((c: any) => { if (typeof c !== 'string') setId(c); });
}
setId(edited.root);
check('sync.edit_appears_in_code', generateTsx(edited).includes('E2E-SYNC'));

console.log('ENGINE_RESULTS ' + JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => !(v as any).pass);
if (failed.length) { console.error('ENGINE_FAILED: ' + failed.map(f => f[0]).join(', ')); process.exit(1); }
console.log('ENGINE_ALL_PASS (' + Object.keys(results).length + ' checks)');
