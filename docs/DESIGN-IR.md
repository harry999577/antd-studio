# Design IR 规范（v2）

Design IR 是本项目唯一事实来源：画布渲染、属性面板、组件树、TSX 生成、构建预览全部由它驱动。实现见 [`src/engine/types.ts`](../src/engine/types.ts)、[`src/engine/migrate.ts`](../src/engine/migrate.ts)、[`src/engine/tree-ops.ts`](../src/engine/tree-ops.ts)。

## 1. 文档结构

```ts
interface DesignDocument {
  schemaVersion: 2;                          // 版本闸门，载入时必须经过 migrateDocument()
  framework: { react, antd, proComponents }; // 生成目标版本，写入注释与导出项目 manifest
  theme: { token: Record<string, string|number> }; // ConfigProvider token（仅字符串/数字）
  root: DesignNode;                          // 页面根节点（通常是 Flex）
}
```

## 2. 节点结构

```ts
interface DesignNode {
  id: string;                 // 全局唯一；createNode 用 crypto.randomUUID；解析回环按位置+类型复用旧 id
  type: ComponentType;        // 必须是 Component Registry 已注册类型
  props: Record<string, unknown>; // 只允许官方组件 API 属性 + 静态 JSON 值（见 §4）
  children: ChildNode[];      // DesignNode | string；string 即 JSX 文本子节点
  meta?: { locked?: boolean; hidden?: boolean }; // 设计器内部元数据，永不进入生成代码
}
```

### 2.1 文本通道（v2 关键变更）

- **v1（已废弃）**：叶子组件文案存 `props.children`，容器内容存 `children[]`，双通道语义重叠。
- **v2**：可见文本**只**存在于 `children[]` 的 string 条目中；`props.children` 为保留名，反向解析遇到 `children={...}` JSX 属性直接报错保护源码。
- v1 文档由 `migrateDocument()` 自动升级：`props.children`（非空字符串且无子节点时）迁移为 `children[0]`。

### 2.2 内部元数据与官方 API 的边界

| 通道 | 内容 | 是否进入 TSX |
|---|---|---|
| `props` | 官方组件 API（type/size/variant/columns…） | ✅ 逐一序列化为 JSX 属性 |
| `children` | 子节点与文本 | ✅ JSX 子内容 |
| `meta` | locked/hidden 及未来编辑器状态 | ❌ 生成器忽略 |
| `id` | 节点身份 | ❌ 生成器忽略（未来可输出 data-studio-id 供 sourceMap，可选） |

## 3. 序列化与版本

- `serializeDocument(doc): string` / `deserializeDocument(json): DesignDocument`——反序列化必经 `migrateDocument`。
- 版本规则：`schemaVersion < 2` 走迁移链；`> CURRENT` 拒绝载入并提示升级设计器。迁移链每步一个纯函数（`migrateV1ToV2`），保持节点 id 不变。

## 4. props 允许的值域（静态可逆子集）

允许：`string | number | boolean | null`、由上述类型组成的纯 JSON 数组/对象。
禁止（生成器不会产出，解析器遇到即抛错且**不覆盖源码**）：函数、ReactNode、undefined 哨兵、计算属性、spread。此类内容属于"代码节点"，保留在代码模式（下一阶段：Code Node + sourceMap，见审计报告 R-1/R-3）。

## 5. 树操作 API（tree-ops，纯函数不可变）

`findNode / findParent / patchNode / removeNode / appendChild / isDescendant / moveNode / moveSibling / nodeText / setNodeText`

- `moveNode` 规则：目标是容器→插入内部；目标是叶子→作为其同级（before/after）；拒绝移动根、移动进自身后代、原地移动，返回 `null` 表示非法。
- 撤销/重做：Studio 层 `history/future` 栈保存整文档快照（上限 40），所有编辑必须走 `commitDocument()` 才会入栈。

## 6. 双向同步合同

| 方向 | 入口 | 失败行为 |
|---|---|---|
| IR → TSX | `generateTsx(doc)`（每次 commit 自动执行） | 不可能失败（纯模板） |
| TSX → IR | `parseTsxToDocument(code, prevDoc)`（用户点击"解析并同步画布"） | 抛错→Alert+message，`document` 与编辑器内容均不变；成功→按位置复用 prevDoc 节点 id |

## 7. 独立构建合同（预览服务）

源码校验（export default 存在、≤300KB）→ 隔离 workspace 写入（Page.tsx/main.tsx/vite-env.d.ts）→ **tsc 类型检查**（失败 422 `stage:"typecheck"` + TS 诊断）→ **vite build**（失败 422 + Vite 原始错误）→ 静态产物 + iframe。设计器与构建产物不同 origin（5173 / 4175）。
