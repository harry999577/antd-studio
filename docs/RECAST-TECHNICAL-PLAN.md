# Recast 源码增量 Patch 技术方案

对应目标约束 **AST = Babel Parser + Recast**，实现文件 [`src/engine/source-patch.ts`](../src/engine/source-patch.ts)。
确定性验证：[`tests/source-patch.test.ts`](../tests/source-patch.test.ts)（28 断言）；演示与真实 diff：[`tests/sync-demo.ts`](../tests/sync-demo.ts) → [`evidence/sync-demo.md`](../evidence/sync-demo.md)。

## 1. 问题定义

设计器有两个事实来源风险：Design IR（画布）与 TSX 源码（代码 Tab）。
轮次 2 的做法是"IR → 全量重生成 TSX"，缺陷：

1. 用户在源码里写的注释、自定义组件、hooks、变量、事件函数会被重生成**抹掉**；
2. 每次属性微调都导致整页 diff，无法审查；
3. 反向解析是全量重建 IR，节点身份易漂移。

本方案改为：**源码是唯一物理载体，IR 编辑映射为对源码中目标 JSXElement 的最小 AST 变更**，由 Recast 打印时保留所有未触碰区域的原文（含注释与格式）。

## 2. AST 层

- 解析：`recast.parse(code, { parser: 'recast/parsers/babel-ts' })`。
  recast 的 babel-ts 适配器内部即 **@babel/parser**（typescript + jsx 插件），与反向解析器 `tsx-parser.ts` 同源，保证 AST 语义一致。
- 打印：`recast.print(ast, { lineTerminator: '\n' })`。
  - **必须显式传 `lineTerminator: '\n'`**：recast 0.24 在未指定时按平台默认换行重排，Windows 下会把整文件变成 `\r\n`，产生"全文件 diff"假象（实测踩坑，见 DEVELOPMENT-LOG 轮次 3）。
- 遍历：仅按 `JSXElement` 结构下钻，`openingElement.attributes` / `children` 为可变面。

## 3. Source mapping（IR 节点 ↔ AST）

`indexSource(code, previous?)` 产出一棵 `SourceNode` 树：

```ts
interface SourceNode {
  id: string;                       // 稳定 id
  type: string;                     // JSX 组件名（Typography.Title 含点）
  loc: [sl, sc, el, ec];            // 0-based 源码范围 = sourceMap 条目
  attrs: Record<string, unknown>;   // 静态可读属性值
  dynamic: string[];                // 无法表示的属性名（函数/spread/动态表达式）
  text: string | null;              // 折叠后的 JSX 文本
  children: SourceNode[];
}
```

- **id 稳定性**：`previous` 树存在时，按"子元素索引路径 + 组件类型相同"复用旧 id（`ps-<path>-<Type>` 仅在新节点时生成）。与 `tsx-parser.ts` 的复用契约一致 → 同一视觉节点跨 index/parse 保持身份，patch 才能可靠寻址。
- **路径寻址**：`tree-ops.getNodePath(root, id)` 与 `findSourceNodeByPath` 用同一"元素索引路径"约定（字符串文本子节点不占索引），Studio 层由 IR id 直接得到 AST 路径。
- **root 解包**：生成器把页面包在 `<ConfigProvider theme>` 内，索引时自动解包，使视觉根 = 页面根元素；`patchTheme` 单独处理该 wrapper 的 token 对象。
- **loc 用途**：错误定位、未来源码↔画布双向高亮、构建失败行号回指画布节点。

## 4. Patch 操作集

| 操作 | 函数 | 语义 | 破坏半径 |
|---|---|---|---|
| 属性改/删 | `patchByPath` / `patchSource` | 改目标 `openingElement.attributes`；`undefined` 删除；新增追加 | 仅该元素开标签 |
| 文本改 | 同上（`text`） | 重建该元素文本子节点（保留元素子节点） | 仅该元素 |
| 同级交换 | `moveInSource` | 交换父 children 中两个 JSXElement 的槽位 | 仅两行互换 |
| 主题 token | `patchTheme` | **就地改 token ObjectExpression 的属性值**（不整体替换表达式） | 仅 ConfigProvider 行 |
| 结构插入 | `insertInto` + `designNodeToAst` | 新子树无 loc → Recast 全新打印并缩进 | 插入点局部 |
| 结构删除 | `removeFrom` | 从父 children 摘除元素及其紧邻空白 | 删除点局部 |

**关键实现细节**

- 新节点构造：`{ type:'StringLiteral'|'ObjectExpression'|..., loc:null }`；**无 loc 的节点 Recast 视为全新，按目标缩进打印**；有 loc 的节点走 patcher 差异合并。
- `patchTheme` 教训：整体替换 `theme={...}` 表达式会让 Recast 重新缩进**整棵子树**（demo D 首轮失败，diff 波及全文件）。改为定位 `theme.token` 的 ObjectExpression，仅改其 property values → diff 收敛到 1 行。
- ProTable 规范化：官方类型 `search?: false | SearchConfig`，`true` 非法。IR 保留布尔语义（switch 编辑器），**输出边界**（codegen / patchByPath / designNodeToAst）经 `normalizeProTableProp` 把 `true → {}`，避免生成不可编译 TSX（E2E 曾因此构建失败）。

## 5. Studio 集成

`commitDocument(next, patch?)`：无未同步代码修改（`!codeDirty`）时按 patch 类型走增量更新，否则回退 `generateTsx` 全量重生成。

- 覆盖路径：属性编辑、文本编辑、主题 token、同级上/下移、拖拽同级交换、删除组件（remove）、新增组件（insert）。
- **撤销/重做**：历史栈升级为 `{document, code}` 快照对——增量 patch 后代码与 IR 不再同构（代码含用户注释），必须成对回滚。
- **代码 → IR**：`applyCode` 解析成功后**保留用户源码为权威**（不再重生成覆盖），`codeDirty` 复位；此后画布编辑继续在该源码上做增量 patch。

## 6. 冲突策略（核心安全设计）

原则：**宁可拒绝，不可破坏**。任一情况返回 `refused` + 原因，源码字节不变：

| 冲突 | 判定 | 行为 |
|---|---|---|
| 目标节点含动态部分 | `node.dynamic.length > 0`（onClick、spread、表达式子、非静态对象） | 拒绝；UI info"源码已原样保留，本次仅更新画布" |
| 源码解析失败 | recast.parse throw | 拒绝；`parse-error:<msg>`，保留原代码 |
| 无视觉根 | 非单一 return-JSX 页面 | 拒绝；提示留在代码模式 |
| 路径/节点找不到 | id 或 raw element 失配 | 拒绝（Studio 回退全量重生成并提示） |
| 跨容器移动 | 非"父相同且索引相邻"的交换 | 走全量重生成（KI-003，仍无损正确性） |
| 代码 Tab 有未同步手改 | `codeDirty` | 编辑前 `ensureDesignEditable` 拦截，要求先解析/重置 |
| 用户非视觉顶层语句 | 变量/hooks/额外 import | 不进入 IR；patch 不触碰；`preserved` 列表上报 |

**双编辑冲突**（画布与代码同时改）：以 `codeDirty` 为闸门——代码有未解析手改时禁止画布提交；解析成功后代码成为权威基线，画布编辑在其上增量进行。不存在"静默覆盖对方"的路径。

## 7. 验证矩阵（全部可复现）

| 验收标准 | 测试 | 断言 |
|---|---|---|
| 可视化修改只改对应节点 | source-patch.test P1/P2/P4、sync-demo A/B/C/D/F | `only_one_line_changed`、diff 行数=2 |
| 保留注释/格式/非目标代码 | 同上 | comment_kept、block_comment_kept、variable_kept、multiline_attr_format_kept、dynamic_handler_kept |
| 不可解析节点不丢失 | P3/P5/P6、demo E/F | refused + 源码 `===` 原样 |
| sourceMap 正确 | index.source_map_loc、ids_reused、stable_after_patches | loc 精确行、id 跨 patch 稳定 |
| 集成不回归 | smoke.e2e（B3 排序+撤销、C 同步、D 保护、E 回环、F 构建） | 全 true |
| ProTable 链路 | protable.e2e 1-7 | 列/搜索/工具栏/分页/代码/iframe/翻页 全过 |

## 8. 已知边界（转 KNOWN-ISSUES）

- KI-002：新增组件插入采用全新打印子树，若用户在该父元素内手写过注释紧邻插入点，注释保留但排版可能重排局部空白。
- KI-003：跨容器移动回退全量重生成（正确性无损，破坏半径大）。
- 未做：节点级双向高亮 UI（loc 已具备）、Code Node 混合编辑（动态节点目前只读保护，不可可视化编辑）。
