# Ant Design Studio 技术架构与验收边界

## 1. 核心架构

```text
Component Metadata Collector
  ├─ Ant Design CLI / docs / type declarations
  └─ ProComponents declarations / docs / demos
             │
             ▼
       Component Registry ─────── Package Version Matrix
             │
             ▼
        Design IR (JSON)
        ├─ component node / props / slots / children
        ├─ responsive layout / theme tokens
        ├─ data bindings / events / code nodes
        └─ schema version / source mapping
          │                    │
          ▼                    ▼
   React Canvas Renderer    TSX Code Generator
   (real antd components)   (standard React source)
          ▲                    │
          │                    ▼
          └──── AST Parser / Source Patch ◄── Monaco Editor
                               │
                               ▼
                      Project Builder API
                               │
                     isolated build worker
                               │
                     static build artifact
                               │
                 sandbox iframe / preview URL
```

## 2. Design IR 约束

Design IR 是唯一事实来源。页面画布、属性面板、组件树与代码生成均由 IR 驱动。代码编辑后通过 Parser / Source Patch 更新 IR；不能让画布和代码各自维护一份不可协调的状态。

生产版节点需要增加：

- `componentKey`、`packageName`、`packageVersion`、`apiVersion`
- `props`、`slots`、`children`
- `bindings`、`events`、`codeNode`、`sourceMap`
- `layout`、`responsive`、`themeRef`；全局主题由 ConfigProvider Token 输出
- `meta`、`locked`、`hidden`、`schemaVersion`

业务 API 函数、动态 JSX、render 回调不能当普通 JSON 值。它们必须被建模为代码节点 / 表达式节点，并保留源码位置及用户原始代码。

## 3. API 元数据策略

元数据采集分为两个适配器：

- Ant Design Adapter：官方 CLI、组件文档、TypeScript declarations、Design Token 和 changelog。
- ProComponents Adapter：包声明、官方组件文档、Demo、发布版本和迁移指南。

采集结果统一为 `ComponentMeta`。编辑器控件是元数据的编辑 UI 映射，不改变官方 API 名称和值。复杂类型提供 JSON/对象编辑器、字段树、插槽编辑器、事件编辑器和代码编辑器。

## 4. 构建预览策略

设计实时预览：应用内 React Renderer，直接使用目标版本官方组件。

构建预览：生成标准 TSX 项目 -> 独立构建 Worker -> TypeScript 检查 -> Vite build -> 静态产物 -> 独立预览 URL -> sandbox iframe。

生产 Worker 安全要求：

- 每次构建隔离工作区，建议一次性容器或 microVM。
- 禁止挂载宿主机凭据和敏感目录。
- CPU、内存、磁盘、进程数、构建时长均有限额。
- 依赖优先从受控缓存 / allowlist 获取；校验 lockfile。
- 默认禁用外部网络，或通过出口代理按域名白名单开放。
- 预览域与设计器主域隔离（不同端口/域名）；通过 sandbox iframe 展示。MVP 本地采用设计器 `5173`、预览服务 `4175` 两个端口。
- 产物设置 TTL、清理策略和审计日志。

## 5. 第一阶段验收标准

1. 能通过组件库添加至少 9 种官方组件。
2. 画布渲染必须来自真实官方 npm 包。
3. 属性编辑修改 Design IR，并同步改变画布及 TSX。
4. 静态 TSX 子集可解析回画布；不支持语法不覆盖源码。
5. 点击“构建预览”后，执行真实 Vite build 并在 iframe 中加载构建产物。
6. 故意写入语法错误时显示构建错误，不伪报成功。
7. 能导出独立可用的 TSX 文件。

## 6. 当前 MVP 已有与下一阶段工作

MVP 已有：9 个官方组件的基础注册、部分 API 属性编辑、容器嵌套投放、主题 Token、静态 JSX 子集反向解析、TSX 导出、本地 Vite 构建与 iframe 预览。

下一阶段：

- 版本感知的元数据数据库和 schema migration。
- 画布节点拖动排序、插槽和响应式布局。
- 真实的源码增量 patch、节点 source map 和冲突解决。
- 测试矩阵：Ant Design / ProComponents / React 版本组合。
- 构建任务队列、Worker 容器隔离、类型检查、日志和预览生命周期。
- 完整页面项目导出：package manifest、tsconfig、Vite config、路由、主题、services、mock 数据。
