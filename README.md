# Ant Design Studio — MVP 0.1

基于 Ant Design / ProComponents 的 React 页面可视化设计器工程起点。核心原则：**Design IR 是统一事实来源；画布渲染真实官方组件；代码交付为标准 React TSX；构建预览由独立 Vite 构建服务完成。**

> 当前是第一版工程验证，不是完整产品。已经接通 9 种组件、基础拖拽及容器嵌套、部分官方属性编辑、主题 Token、TSX 正向生成、静态 JSX 子集反向解析和真实 Vite 构建预览。完整官方 API 自动采集、任意 React 代码双向视觉还原、业务 API 设计和生产级隔离构建尚未完成。

## 技术基线（版本固定）

- Node.js `>=22.12`（推荐 Node 24）
- React / React DOM `19.3.1`
- Ant Design `6.7.1`
- `@ant-design/pro-components` `3.1.15-9`（预发布版本，锁定用于 Ant Design 6 兼容验证；不是稳定版承诺）
- TypeScript `6.0.2`（与当前 ProComponents 3 预发布包的开发工具链保持一致）
- Vite `8.3.8` + `@vitejs/plugin-react` `6.3.0`
- dnd-kit `6.3.1`、Monaco Editor `0.57.0`、Babel Parser `7.29.14`（7.x 维护线）

直接依赖全部精确锁定，不使用 `^` 或 `~`。`package-lock.json` 已生成并提交（2026-11-21 Windows 实测安装通过），CI / 发布环境请使用 `npm ci` 冻结传递依赖。升级时应先跑兼容性矩阵和生成页面回归测试，再修改版本。

## Windows 本地启动

在项目目录打开 PowerShell：

```powershell
npm install
npm run dev
```

打开：`http://127.0.0.1:5173`

`npm run dev` 会同时启动两个仅绑定本机回环地址的服务：

- `5173`：Studio 设计器
- `4175`：构建预览服务

只运行设计器：`npm run dev:web`。只运行预览构建服务：`npm run dev:preview-server`。

## 当前已实现

1. 三栏式工作台：组件库、真实组件画布、属性面板；支持组件搜索。
2. 组件拖拽到根画布及 Flex / Card / ProCard 容器；支持双击/点击添加。
3. 当前已接入 9 种官方组件：Flex、Card、Button、Input、Select、Divider、Typography.Title、ProCard、ProTable。
4. 右侧属性编辑器接入了上述组件的一部分常用属性。JSON 属性编辑支持输入未完成 JSON 草稿。
5. 页面主题可以编辑 `ConfigProvider` 的 `colorPrimary`、`borderRadius` Token。
6. Design IR v2 驱动画布和 TSX 生成：文本统一存于 `children`，`meta` 为设计器内部元数据，`schemaVersion` 载入必经迁移（v1 自动升级）；属性修改会同步更新代码；提供撤销/重做；组件树面板与画布选中联动；支持节点移动与同级排序。规范见 `docs/DESIGN-IR.md`。
7. Monaco TSX 编辑器；“解析并同步画布”支持静态 JSX 子集。解析失败时保留源代码，不覆盖 IR。
8. 导出当前 TSX 文件。
9. “构建预览”会把当前 TSX 放进独立临时项目，使用真实 Vite 执行生产构建，将静态产物放到 `4175` 服务，并在独立 iframe 中打开。构建失败会返回错误，而不会显示虚假的预览成功状态。
10. 构建产物最多保留最近 20 份；预览响应配置 CSP，并默认禁止浏览器页面向外部发起网络连接。

## 当前 API 覆盖边界

右侧属性面板是**精选常用 API 子集**，不是所有官方属性的完整实现。下一阶段需要为 Ant Design 和 ProComponents 建立独立元数据采集器，从匹配版本的类型声明、官方文档、Demo、Token 和 CHANGELOG 生成 Component Registry，并为函数、ReactNode、泛型、复杂对象、插槽和事件分别提供编辑器。

Ant Design 6 的部分 API 与旧版本不同，例如 Card 使用 `variant`，不要继续生成已经废弃的 `bordered`；尺寸选项应跟随锁定版本类型定义，不应硬编码成旧版 `default` 枚举。

## 双向同步边界

**代码 → 画布（解析）方向**只支持静态子集：

- 仅含 `antd` / `@ant-design/pro-components` 官方包 import 和一个 `export default`；
- 不带参数、非 async 的函数/箭头函数组件；函数体只有一条直接返回的 JSXElement；
- 已注册组件构成的静态 JSX 树；
- 静态字符串、数字、布尔、数组、对象属性；
- 由代码生成器输出的静态 `ConfigProvider theme.token` 包裹。

暂不支持任意代码完整还原：额外模块导入、顶层变量/导出、`map`、条件渲染、Hooks、闭包回调、JSX spread、动态变量、render 函数、自定义组件、Fragment、组件参数、多重 return 等。此类代码可以留在代码模式并尝试构建预览，但不能要求它自动变成拖拽节点。遇到不支持语法时，解析器会报错，且不会覆盖原始代码。

**画布 → 代码（编辑）方向**为 Recast 增量 patch（2026-11-21 轮次3）：属性/文本/主题/同级排序只改写目标 JSX 节点的源码行，上述"不支持还原"的代码（注释、变量、hooks、自定义组件、事件函数）在源码中**字节保留**；若目标节点本身含动态代码，patch 被拒绝并提示，绝不静默破坏。技术方案见 `docs/RECAST-TECHNICAL-PLAN.md`，前后 diff 演示见 `evidence/sync-demo.md`。

## 构建预览：三层概念

- **实时设计预览**：工作台画布中直接渲染安装的官方组件。
- **独立构建预览**：点击构建，调用本地 Vite build，加载静态产物；这是当前 MVP 已实现的新增能力。
- **正式交付预览**：完整项目导出、路由/资源/API mock、环境配置与部署验证，属于下一阶段。

当前构建器使用固定依赖版本，不支持页面自行安装任意 npm 包，也不提供任意多文件工程的完整构建。构建预览流程为：源码校验 → 独立 workspace → **TypeScript 类型检查（tsc 编译器 API，真实诊断）** → `vite build` → 静态产物；任一阶段失败都会以 422 + 真实错误信息返回，不会伪报成功。

**安全边界：**本地 MVP 的构建服务只绑定 `127.0.0.1`，适合单机开发验证，不可直接作为多用户生产服务。生产必须升级为独立 Worker/一次性容器或 microVM，实施 CPU/内存/时间/磁盘配额、无凭据环境、依赖白名单、网络出口策略、任务队列、产物 TTL 和审计。

## 下一阶段建议

1. 实现版本感知的官方 API 元数据采集器，先打通 Ant Design CLI / 类型声明，再单独接 ProComponents 适配。
2. 用元数据自动生成属性面板；对复杂类型实现字段树、插槽、事件、函数代码编辑器。
3. 补充组件树折叠/多选、画布精确插入位置指示、响应式断点和更完整的主题 Token。
4. ~~引入 AST 节点 source map、增量源码 Patch 和冲突解决~~（已完成，2026-11-21 轮次3，`docs/RECAST-TECHNICAL-PLAN.md`）；继续做 Code Node 混合编辑（动态节点目前只读保护）。
5. ~~为构建任务增加 TypeScript 类型检查~~（已完成，2026-11-21）；继续补日志面板、错误定位、产物版本管理和取消任务。
6. 实现完整项目导出：package manifest、lockfile 策略、tsconfig、Vite 配置、路由、主题、services、mock 数据。
7. 建立 React / Ant Design / ProComponents 版本兼容矩阵。ProComponents 3.1.15-9 当前按预发布版本锁定，不应在未回归验证前静默升级。
8. 设计文档持久化保存（localStorage → 后端 API）；当前刷新即丢，见 `docs/KNOWN-ISSUES.md` KI-005。

## 检查命令

```powershell
npm run typecheck
npm run build
npm test              # typecheck + 引擎/patch 断言（35 + 28）
npm run test:demo     # 双向同步演示 -> evidence/sync-demo.md
npm run test:e2e      # Playwright 全流程（需 npm run dev 在跑）
py tests/protable.e2e.py   # ProTable 列/搜索/分页/工具栏端到端
npm audit             # found 0 vulnerabilities
```

## 项目档案

- `docs/AUDIT-REPORT.md` — 工程审计报告（源码名实核查、依赖兼容性、验收证据、遗留问题 R-1..R-10 与修复状态）。
- `docs/ARCHITECTURE.md` — 技术架构与验收边界。
- `docs/DESIGN-IR.md` — Design IR v2 规范（单文本通道、meta、迁移闸门、双向同步合同）。
- `docs/COMPONENT-REGISTRY.md` — 组件注册与属性元数据规范。
- `docs/RECAST-TECHNICAL-PLAN.md` — Babel Parser + Recast 增量源码 patch 技术方案（AST、sourceMap、Patch、冲突策略）。
- `docs/SECURITY-AUDIT.md` — npm audit 漏洞分析与修复评估（critical/low 归零）。
- `docs/TASK-001.md` — 本轮任务档案（整改项、验收对照、文件清单）。
- `docs/KNOWN-ISSUES.md` — 运行期已知问题登记（KI-001..014）。
- `docs/IMPLEMENTATION-STATUS.md` — 能力矩阵与各轮实测结论。
- `docs/DEVELOPMENT-LOG.md` — 开发过程记录（轮次 1-3）。
- `docs/WINDOWS-SETUP.md` — Windows 安装、运行、测试与已知环境坑。
- `tests/` — 引擎/patch 确定性测试、双向同步演示、Playwright E2E 脚本；`evidence/` — 构建日志、audit 数据、diff 演示、E2E 结果 JSON 与运行截图。

当前源码包不包含 `node_modules`。首次运行需要在可访问 npm registry 的环境执行 `npm install`。
