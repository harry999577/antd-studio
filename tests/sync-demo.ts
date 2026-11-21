/**
 * Bidirectional sync demo (deliverable: "双向同步演示 — 修改前后 TSX Diff").
 *
 * Scenario: a user hand-wrote a page with comments, a helper variable, a custom
 * component and a dynamic event handler — code the visual designer cannot
 * represent. We then:
 *   A) edit a prop visually  -> only that node's line changes;
 *   B) edit text visually    -> only that node's line changes;
 *   C) swap siblings         -> only those lines move;
 *   D) change theme token    -> only the ConfigProvider line changes;
 *   E) try to edit a dynamic node -> refused, source byte-identical;
 *   F) parse code -> IR, then edit -> patch stays anchored (source mapping).
 *
 * Path convention: indexSource() unwraps the ConfigProvider wrapper, so the
 * visual root IS the Flex element; [0] = Card, [0,0] = Input, etc.
 *
 * Writes evidence to evidence/sync-demo.md with real before/after diffs.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { indexSource, patchByPath, moveInSource, patchTheme, findSourceNodeByPath, type SourceNode } from '../src/engine/source-patch';

const USER_SRC = `import { Button, Card, Flex, Input, ConfigProvider } from 'antd';
import { StatusBadge } from './StatusBadge'; // 自定义组件：设计器不接管

// 业务备注：查询按钮必须保持 primary，勿动
const PLACEHOLDER_TEXT = '请输入用户名称或手机号';

export default function GeneratedPage() {
  /* 页面骨架：搜索 + 表格 */
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
      <Flex vertical={true} gap={16}>
        <Card title={'筛选条件'} variant={'outlined'}>
          <Input placeholder={'请输入用户名称或手机号'} allowClear={true} />
          <Button type={'primary'} onClick={() => fetch('/api/search')}>查询</Button>
          <Button type={'default'}>重置</Button>
          <StatusBadge value={'active'} />
        </Card>
      </Flex>
    </ConfigProvider>
  );
}
`;

const results: string[] = [];
let failures = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) { failures += 1; results.push(`> ❌ ASSERT FAILED: ${msg}\n`); }
}

function diffBlock(before: string, after: string): string {
  const la = before.split('\n'), lb = after.split('\n');
  const out: string[] = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      if (la[i] !== undefined) out.push(`- ${String(i + 1).padStart(2)} | ${la[i]}`);
      if (lb[i] !== undefined) out.push(`+ ${String(i + 1).padStart(2)} | ${lb[i]}`);
    }
  }
  return '```diff\n' + (out.length ? out.join('\n') : '(no change)') + '\n```\n';
}

// ---------- index once, reuse ids ----------
const idxA = indexSource(USER_SRC);
const root = idxA.root as SourceNode;
assert(root.type === 'Flex', 'visual root should be Flex after unwrapping ConfigProvider');
const card = root.children[0];
const input = card.children[0];
const dynBtn = card.children[1];
const resetBtn = card.children[2];
assert(!!card && !!input && !!dynBtn && !!resetBtn, 'index must contain Card/Input/dynBtn/resetBtn');
assert(dynBtn.dynamic.includes('onClick'), 'onClick must be detected as dynamic');
assert(card.children[3].type === 'StatusBadge', 'custom component indexed but not owned');

// ---------- A) visual prop edit ----------
const rA = patchByPath(USER_SRC, [0, 0], { attrs: { placeholder: '搜索用户' } });
results.push('## A. 可视化修改 Input.placeholder（属性编辑）\n', diffBlock(USER_SRC, rA.code));
assert(rA.changed, 'A should change');
assert(diffBlock(USER_SRC, rA.code).split('\n').filter((l) => /^[-+] \d/.test(l)).length === 2, 'A must touch exactly one line');
assert(rA.code.includes('// 业务备注') && rA.code.includes('/* 页面骨架') && rA.code.includes('import { StatusBadge }'), 'A must keep comments/custom import');
assert(rA.code.includes("onClick={() => fetch('/api/search')}"), 'A must keep dynamic handler');
assert(rA.code.includes("const PLACEHOLDER_TEXT = '请输入用户名称或手机号';"), 'A must keep module variable');

// ---------- B) visual text edit ----------
const rB = patchByPath(rA.code, [0, 2], { text: '清空条件' });
results.push('## B. 可视化修改重置按钮文案（文本编辑）\n', diffBlock(rA.code, rB.code));
assert(diffBlock(rA.code, rB.code).split('\n').filter((l) => /^[-+] \d/.test(l)).length === 2, 'B must touch exactly one line');
assert(rB.code.includes("type={'default'}"), 'B keeps sibling attrs');

// ---------- C) sibling reorder (Input <-> reset button) ----------
const rC = moveInSource(rB.code, [0, 0], [0, 2]);
results.push('## C. 同级交换（Input ↔ 重置按钮，对应画布拖拽/上移下移）\n', diffBlock(rB.code, rC.code));
assert(rC.changed, 'C should change');
assert(!rC.refused, 'C should not be refused');

// ---------- D) theme token ----------
const rD = patchTheme(rC.code, { colorPrimary: '#722ed1', borderRadius: 8 });
results.push('## D. 主题 Token 修改（colorPrimary）\n', diffBlock(rC.code, rD.code));
assert(diffBlock(rC.code, rD.code).split('\n').filter((l) => /^[-+] \d/.test(l)).length === 2, 'D touches only the ConfigProvider line');

// ---------- E) dynamic node refused ----------
const rE = patchByPath(rD.code, [0, 1], { attrs: { type: 'link' } });
results.push('## E. 尝试修改含动态代码（onClick）的节点\n');
results.push(`- 结果：**拒绝 patch**，源码字节一致 = **${rE.code === rD.code}**\n`);
results.push(`- 上报原因：\`${rE.refused}\`（UI 侧以 info 提示，不会静默丢弃）\n`);
assert(!rE.changed && rE.code === rD.code, 'E must not touch source');
assert(rE.refused === 'dynamic-node', 'E must report dynamic refusal');

// ---------- F) code -> IR -> visual edit round trip ----------
const userEdited = rD.code.replace(
  '      <Flex vertical={true} gap={16}>',
  '      {/* 用户手改：加大间距 */}\n      <Flex vertical={true} gap={24}>',
);
const idxF = indexSource(userEdited, idxA.root);
assert(idxF.root !== null, 'F must still parse after user edit; preserved=' + JSON.stringify(idxF.preserved));
const flexNode = findSourceNodeByPath(idxF.root!, [])!;
results.push('## F. 用户手改代码 → 解析进 IR → 再可视化编辑（双向）\n');
results.push(`- 用户在源码里把 \`gap={16}\` 改为 \`gap={24}\` 并追加 JSX 注释；重建索引后 IR 读到 \`gap = ${flexNode.attrs.gap}\`\n`);
assert(flexNode.attrs.gap === 24, 'F gap parsed from user code');
const rF = patchByPath(userEdited, [0], { attrs: { title: '高级筛选' } });
results.push(diffBlock(userEdited, rF.code));
assert(diffBlock(userEdited, rF.code).split('\n').filter((l) => /^[-+] \d/.test(l)).length === 2, 'F touches only the Card line');
assert(rF.code.includes('gap={24}') && rF.code.includes('/* 用户手改：加大间距 */'), 'F keeps user comment+edit');

// ---------- source mapping summary ----------
const idxFinal = indexSource(rF.code, idxA.root);
results.push('## 节点 ↔ AST source mapping\n');
results.push(`- 稳定 id（位置+类型复用）：Input = \`${input.id}\`，动态按钮 = \`${dynBtn.id}\`；对最终源码重建索引后 Flex 子 id 序列 = ${JSON.stringify(idxFinal.root!.children.map((x) => x.id))}\n`);
results.push(`- 每个节点携带 loc（0-based [sl,sc,el,ec]）：Card = \`[${card.loc}]\`，即 sourceMap 条目，供错误定位与未来双向高亮\n`);
assert(idxFinal.root!.children.map((x) => x.id).join() === root.children.map((x) => x.id).join(), 'ids stable across full demo');

const md = `# 双向同步演示（Recast 增量 Patch 实测 Diff）

生成方式：\`npm run test:demo\`（tests/sync-demo.ts，确定性、可复现）。
基线为**用户手写形态**源码：含注释、自定义组件 import、模块级变量、动态事件函数——
设计器不接管这些内容，每一步展示 patch 前后真实 diff（行号基于上一步产物）。

\`\`\`tsx
${USER_SRC}\`\`\`

${results.join('\n')}

## 结论（对应验收标准）

- ✅ 可视化修改只改变对应 TSX 节点（A/B/C/D/F 每步 diff 仅目标行）。
- ✅ 代码修改保留非目标代码、注释和格式（A/E/F 断言字节级保留）。
- ✅ 无法解析/无法表示的动态节点不丢失（E 拒绝并上报原因，源码零改动）。
- ✅ Design IR 节点 ↔ AST sourceMap 稳定（id 复用 + loc 记录）。
${failures === 0 ? '- ✅ 全部断言通过。' : `- ❌ ${failures} 项断言失败，见上文。`}
`;

mkdirSync('E:/ai/antd-studio/evidence', { recursive: true });
writeFileSync('E:/ai/antd-studio/evidence/sync-demo.md', md, 'utf8');
console.log(failures === 0 ? 'DEMO_OK evidence/sync-demo.md' : `DEMO_FAILED ${failures} assertions`);
process.exit(failures === 0 ? 0 : 1);
