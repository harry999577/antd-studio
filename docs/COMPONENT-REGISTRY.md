# 组件注册与属性元数据规范

实现见 [`src/engine/registry.ts`](../src/engine/registry.ts)、类型定义在 [`src/engine/types.ts`](../src/engine/types.ts)。

## 1. 版本基线（精确锁定，无 ^/~）

| 包 | 版本 | 说明 |
|---|---|---|
| antd | 6.7.1 | 官方组件唯一来源；画布与导出项目共用同一锁定版本 |
| @ant-design/pro-components | 3.1.15-9 | **预发布版本**，为 antd 6 兼容验证而锁定；未经回归测试禁止升级 |
| react / react-dom | 19.3.1 | |
| @babel/parser | 7.29.14 | 反向解析 AST |

注册表中的属性名、枚举值一律按**锁定版本的官方类型声明**书写（例如 antd 6 的 `Card.variant` 而非已废弃的 `bordered`；`Button.size` 用 `small|middle|large`）。

## 2. ComponentDefinition 字段

```ts
interface ComponentDefinition {
  type: ComponentType;                    // 注册键 = IR type = 生成 JSX 标签名
  label: string;                          // 面板显示名
  packageName: 'antd' | '@ant-design/pro-components'; // 生成 import 来源
  category: '布局'|'通用'|'数据录入'|'企业组件';        // 面板分组
  props: PropDefinition[];                // 暴露给属性面板的官方 API 子集
  defaultProps: Record<string, unknown>;  // 创建节点时的初始 props（深拷贝）
  canHaveChildren: boolean;               // 容器判定 → droppable / moveNode inside
  supportsText?: boolean;                 // 叶子单文本组件 → 显示文案编辑器（写入 children）
  defaultText?: string;                   // 创建时放入 children[0] 的文案
}
```

## 3. PropDefinition 与编辑器控件

```ts
interface PropDefinition {
  name: string;    // 官方 API 属性名，生成时原样输出，不做别名转换
  label: string;   // 中文标签
  editor: 'input' | 'switch' | 'select' | 'number' | 'json' | 'slot' | 'event' | 'code';
  options?: { label; value }[];  // select 专用
  description?: string;          // 悬浮提示
}
```

| editor | 控件 | 值域 | 状态 |
|---|---|---|---|
| input / switch / number / select | antd 基础控件 | string/boolean/number/枚举 | ✅ 已实现 |
| json | TextArea + 草稿容错（非法 JSON 暂存不提交） | §4 静态值域 | ✅ 已实现（复杂属性的最低可用实现） |
| slot | 插槽编辑器（ReactNode 属性→子树） | DesignNode[] | 🔌 接口已预留（类型枚举），控件未实现 |
| event | 事件编辑器（onClick 等→Code Node） | 源码片段 | 🔌 预留 |
| code | 表达式代码编辑器 | TS 表达式 | 🔌 预留 |

**结构化编辑器路线**（下一阶段）：`columns`/`dataSource`/`options` 这类复杂数组属性从 `json` 升级为字段树表格编辑器；编辑器控件升级不改 IR 数据形状，只改 UI 映射。

## 4. 元数据与真实组件的映射

- 画布渲染：`CanvasNode.tsx` 的 `renderers: Record<string, React.ComponentType>` 直接引用官方包导出（Flex/Card/Button/Input/Select/Divider/Typography.Title/ProCard/ProTable）。**禁止自绘冒充**。
- 代码生成：`importNames` 决定 import 名（Typography.Title → import Typography）。
- 反向解析：`supported` 集合必须与注册表同步；未注册组件报错保护源码。
- 三处一致性由引擎测试断言（`tests/engine-roundtrip.test.ts`）。

## 5. 新增组件检查单

1. `types.ts`：ComponentType 联合加字面量。
2. `registry.ts`：ComponentDefinition（props 按锁定版本 .d.ts 抄录）+ componentGroups 归类。
3. `codegen.ts`：importNames 映射。
4. `CanvasNode.tsx`：renderers 映射。
5. `tsx-parser.ts`：supported 集合。
6. `tests/engine-roundtrip.test.ts`：加一条生成/回环断言；跑 typecheck + e2e。

## 6. 自动化采集（规划，见 ARCHITECTURE §3）

手工注册表是过渡形态。目标形态：Ant Design Adapter（CLI/`.d.ts`/docs/Token/changelog）+ ProComponents Adapter → 统一 `ComponentMeta` → 自动生成本注册表；`editor` 字段由类型推导规则映射（`boolean→switch`、字面量联合→`select`、对象数组→`json`→结构化编辑器）。
