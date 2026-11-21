// Deterministic proof for the Recast source-patch engine:
//  1) visual edit rewrites ONLY the target JSX node;
//  2) comments / formatting / non-target code survive byte-for-byte;
//  3) dynamic (unrepresentable) nodes are refused, never flattened or lost.
import { indexSource, patchSource, findSourceNode } from '../src/engine/source-patch';

const results: Record<string, unknown> = {};
const check = (name: string, cond: boolean, extra?: unknown) => {
  results[name] = { pass: !!cond, ...(extra !== undefined ? { info: extra } : {}) };
};

const SRC = [
  "import { Button, Card, Flex, Input } from 'antd';",
  "import { ConfigProvider } from 'antd';",
  "",
  "// business note: keep this comment",
  "const THEME_HINT = 'do not touch me';",
  "",
  "export default function GeneratedPage() {",
  "  /* inner block comment preserved */",
  "  return (",
  "    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>",
  "      <Flex",
  "        vertical={true}",
  "        gap={16}>",
  "        <Card title={'筛选条件'} variant={'outlined'}>",
  "          <Input placeholder={'请输入'} allowClear={true} />",
  "          <Button type={'primary'} onClick={() => console.log('dynamic!')}>查询</Button>",
  "          <Button type={'default'}>重置</Button>",
  "        </Card>",
  "      </Flex>",
  "    </ConfigProvider>",
  "  );",
  "}",
  "",
].join('\n');

// ---------- indexing ----------
const idx = indexSource(SRC);
check('index.root_found', idx.root !== null, idx.preserved);
check('index.stable_ids', idx.root!.id.startsWith('ps-0-'));
const card = idx.root!.children[0];
check('index.card_type', card.type === 'Card', card?.type);
check('index.source_map_loc', Array.isArray(card.loc) && card.loc[0] === 13, card.loc);
check('index.attrs_static_parsed', card.attrs.title === '筛选条件', card.attrs);
check('index.preserves_nonvisual', idx.preserved.some((p) => p.includes('VariableDeclaration')), idx.preserved);
const dynBtn = findSourceNode(idx.root!, card.children[1].id);
check('index.dynamic_detected', dynBtn!.dynamic.includes('onClick'), dynBtn!.dynamic);

// id stability across reindex with previous
const idx2 = indexSource(SRC, idx.root);
check('index.ids_reused', JSON.stringify(idx2.root!.children) === JSON.stringify(idx.root!.children));

// ---------- patch 1: change a static attribute ----------
const p1 = patchSource(SRC, { nodeId: card.children[0].id, attrs: { placeholder: '用户名或手机号' } }, idx.root);
check('patch1.changed', p1.changed);
check('patch1.target_updated', /placeholder=\{["']用户名或手机号["']\}/.test(p1.code));
check('patch1.only_one_line_changed', p1.diff.length === 2, p1.diff);
check('patch1.comment_kept', p1.code.includes('// business note: keep this comment'));
check('patch1.block_comment_kept', p1.code.includes('/* inner block comment preserved */'));
check('patch1.variable_kept', p1.code.includes("const THEME_HINT = 'do not touch me';"));
check('patch1.dynamic_handler_kept', p1.code.includes("onClick={() => console.log('dynamic!')}"));
check('patch1.multiline_attr_format_kept', p1.code.includes('        vertical={true}'), 'flex multiline attrs');

// ---------- patch 2: change text of a static leaf ----------
const p2 = patchSource(p1.code, { nodeId: card.children[2].id, text: '清空' }, p1.root);
check('patch2.text_changed', p2.code.includes('>清空</Button>'), p2.diff);
check('patch2.dynamic_sibling_intact', p2.code.includes("onClick={() => console.log('dynamic!')}>查询</Button>"));
check('patch2.minimal_diff', p2.diff.length === 2, p2.diff);

// ---------- patch 3: dynamic node must be REFUSED, source untouched ----------
const p3 = patchSource(p2.code, { nodeId: dynBtn!.id, attrs: { type: 'link' } }, p2.root);
check('patch3.refused', !p3.changed && p3.code === p2.code);
check('patch3.reason_reported', p3.preserved.some((x) => x.includes('dynamic parts')), p3.preserved);

// ---------- patch 4: remove attribute + add attribute ----------
const p4 = patchSource(p3.code, { nodeId: card.id, attrs: { variant: undefined, bordered: false } }, p3.root);
check('patch4.removed', !p4.code.includes("variant={'outlined'}"));
check('patch4.added', p4.code.includes('bordered={false}'), p4.diff);
check('patch4.title_kept', p4.code.includes("title={'筛选条件'}"));

// ---------- patch 5: unknown id refused, nothing changes ----------
const p5 = patchSource(p4.code, { nodeId: 'ps-99-Nothing', text: 'x' }, p4.root);
check('patch5.refused_unknown', !p5.changed && p5.code === p4.code, p5.preserved.filter((x) => x.includes('not found')));

// ---------- patch 6: unparseable source refused entirely ----------
const BROKEN = "export default function Bad( { <div/>";
const p6 = patchSource(BROKEN, { nodeId: 'anything', text: 'x' });
check('patch6.broken_untouched', !p6.changed && p6.code === BROKEN);
check('patch6.parse_error_reported', p6.preserved.some((x) => x.startsWith('parse-error')), p6.preserved);

// ---------- patch 7: reindex after patches keeps ids stable ----------
const idx7 = indexSource(p4.code, p4.root);
check('index7.stable_after_patches', idx7.root!.id === p4.root!.id && findSourceNode(idx7.root!, dynBtn!.id) !== null);

console.log('PATCH_RESULTS ' + JSON.stringify(results, null, 2));
const failed = Object.entries(results).filter(([, v]) => !(v as any).pass);
if (failed.length) { console.error('PATCH_FAILED: ' + failed.map((f) => f[0]).join(', ')); process.exit(1); }
console.log('PATCH_ALL_PASS (' + Object.keys(results).length + ' checks)');
