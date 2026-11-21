# 双向同步演示（Recast 增量 Patch 实测 Diff）

生成方式：`npm run test:demo`（tests/sync-demo.ts，确定性、可复现）。
基线为**用户手写形态**源码：含注释、自定义组件 import、模块级变量、动态事件函数——
设计器不接管这些内容，每一步展示 patch 前后真实 diff（行号基于上一步产物）。

```tsx
import { Button, Card, Flex, Input, ConfigProvider } from 'antd';
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
```

## A. 可视化修改 Input.placeholder（属性编辑）

```diff
- 13 |           <Input placeholder={'请输入用户名称或手机号'} allowClear={true} />
+ 13 |           <Input placeholder={"搜索用户"} allowClear={true} />
```

## B. 可视化修改重置按钮文案（文本编辑）

```diff
- 15 |           <Button type={'default'}>重置</Button>
+ 15 |           <Button type={'default'}>清空条件</Button>
```

## C. 同级交换（Input ↔ 重置按钮，对应画布拖拽/上移下移）

```diff
- 13 |           <Input placeholder={"搜索用户"} allowClear={true} />
+ 13 |           <Button type={'default'}>清空条件</Button>
- 15 |           <Button type={'default'}>清空条件</Button>
+ 15 |           <Input placeholder={"搜索用户"} allowClear={true} />
```

## D. 主题 Token 修改（colorPrimary）

```diff
- 10 |     <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
+ 10 |     <ConfigProvider theme={{ token: { colorPrimary: "#722ed1", borderRadius: 8 } }}>
```

## E. 尝试修改含动态代码（onClick）的节点

- 结果：**拒绝 patch**，源码字节一致 = **true**

- 上报原因：`dynamic-node`（UI 侧以 info 提示，不会静默丢弃）

## F. 用户手改代码 → 解析进 IR → 再可视化编辑（双向）

- 用户在源码里把 `gap={16}` 改为 `gap={24}` 并追加 JSX 注释；重建索引后 IR 读到 `gap = 24`

```diff
- 13 |         <Card title={'筛选条件'} variant={'outlined'}>
+ 13 |         <Card title={"高级筛选"} variant={'outlined'}>
```

## 节点 ↔ AST source mapping

- 稳定 id（位置+类型复用）：Input = `ps-0-0-0-Input`，动态按钮 = `ps-0-0-1-Button`；对最终源码重建索引后 Flex 子 id 序列 = ["ps-0-0-Card"]

- 每个节点携带 loc（0-based [sl,sc,el,ec]）：Card = `[11,8,16,15]`，即 sourceMap 条目，供错误定位与未来双向高亮


## 结论（对应验收标准）

- ✅ 可视化修改只改变对应 TSX 节点（A/B/C/D/F 每步 diff 仅目标行）。
- ✅ 代码修改保留非目标代码、注释和格式（A/E/F 断言字节级保留）。
- ✅ 无法解析/无法表示的动态节点不丢失（E 拒绝并上报原因，源码零改动）。
- ✅ Design IR 节点 ↔ AST sourceMap 稳定（id 复用 + loc 记录）。
- ✅ 全部断言通过。
